import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';
import { RunEventService } from '../services/event.service.js';
import { deliberationQueue } from '../orchestrator/worker.js';
import { logger } from '../utils/logger.js';

const createRunSchema = z.object({
  modelIds: z.array(z.string()).min(1, 'At least one model ID required'),
  maxRounds: z.number().int().min(1).max(10).optional().default(3),
  loopMode: z.enum(['standard', 'self_improving', 'adversarial']).optional().default('standard'),
  searchProvider: z.enum(['mock', 'searxng', 'serpapi', 'web', 'manual']).optional(),
  checkpointStages: z.array(z.string()).optional().default([]),
});

const updateTaskSchema = z.object({
  title: z.string().optional(),
  objective: z.string().optional(),
  role: z.enum(['researcher', 'skeptic', 'source_auditor', 'inference_auditor', 'reviewer', 'critic', 'revision_writer', 'consensus_voter', 'decision_writer', 'context_auditor']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['todo', 'queued', 'running', 'done', 'blocked', 'failed', 'cancelled']).optional(),
  assignedModelId: z.string().nullable().optional(),
});

const runEventService = new RunEventService();

export async function runRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);
  fastify.get('/projects/:projectId/runs/latest', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;
    const latestEvent = await prisma.runEvent.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestEvent) {
      return reply.status(200).send({ data: null });
    }

    const runId = latestEvent.runId;
    const allRunEvents = await runEventService.getEvents(runId);
    const terminalTypes = new Set(['run.completed', 'run.failed', 'run.cancelled']);
    const isTerminal = allRunEvents.some(e => terminalTypes.has(e.type));

    return {
      data: {
        runId,
        status: isTerminal ? 'completed' : 'running',
        events: allRunEvents,
      },
    };
  });

  /**
   * GET /projects/:projectId/runs/compare?run1=xxx&run2=yyy
   * Compare two runs side by side.
   */
  fastify.get('/projects/:projectId/runs/compare', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { run1, run2 } = request.query as { run1: string; run2: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    if (!run1 || !run2) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'run1 and run2 query parameters required' } });
    }

    const comparison = await runEventService.compareRuns(projectId, run1, run2);
    return { data: comparison };
  });

  fastify.get('/runs/:runId/events/history', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const runEvent = await prisma.runEvent.findFirst({
      where: { runId }, select: { projectId: true }
    });
    if (!runEvent) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    if (!(await requireProjectAccess(prisma, reply, runEvent.projectId, request.user?.id))) return;
    const events = await runEventService.getEvents(runId);
    return { data: events };
  });

  // Model calls for a run — includes prompts sent and responses received
  fastify.get('/runs/:runId/model-calls', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const runEvent = await prisma.runEvent.findFirst({
      where: { runId }, select: { projectId: true }
    });
    if (!runEvent) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    if (!(await requireProjectAccess(prisma, reply, runEvent.projectId, request.user?.id))) return;

    const modelCalls = await prisma.modelCall.findMany({
      where: { projectId: runEvent.projectId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    const manifestIds = modelCalls
      .map((c) => c.contextManifestId)
      .filter((id): id is string => !!id);
    const manifests = manifestIds.length
      ? await prisma.contextManifest.findMany({ where: { id: { in: manifestIds } } })
      : [];
    const manifestById = new Map(manifests.map((m) => [m.id, m]));

    // Sanitize: truncate messages to avoid huge payloads
    const sanitized = modelCalls.map(c => ({
      id: c.id,
      modelConfigId: c.modelConfigId,
      provider: c.provider,
      model: c.model,
      status: c.status,
      error: c.error,
      usage: c.usage,
      createdAt: c.createdAt,
      completedAt: c.completedAt,
      contextManifestId: c.contextManifestId,
      contextManifest: c.contextManifestId ? manifestById.get(c.contextManifestId) ?? null : null,
      messages: Array.isArray(c.messages) ? (c.messages as any[]).map((m: any) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content.slice(0, 3000) : m.content,
      })) : c.messages,
      responseText: c.responseText ? c.responseText.slice(0, 5000) : null,
      responseJson: c.responseJson,
    }));

    return { data: sanitized };
  });

  fastify.get('/runs/:runId/context-manifests', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const runEvent = await prisma.runEvent.findFirst({
      where: { runId }, select: { projectId: true },
    });
    if (!runEvent) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    if (!(await requireProjectAccess(prisma, reply, runEvent.projectId, request.user?.id))) return;

    const manifests = await prisma.contextManifest.findMany({
      where: { projectId: runEvent.projectId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return { data: manifests };
  });

  fastify.get('/runs/:runId/events', async (request, reply) => {
    const { runId } = request.params as { runId: string };

    const runEvent = await prisma.runEvent.findFirst({
      where: { runId }, select: { projectId: true }
    });
    if (!runEvent) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    if (!(await requireProjectAccess(prisma, reply, runEvent.projectId, request.user?.id))) return;

    const { poll } = request.query as { poll?: string };
    const isPollMode = poll === '1';

    // For poll mode, check if the run has events before opening SSE stream
    if (isPollMode) {
      const allEvents = await runEventService.getEvents(runId);
      if (allEvents.length === 0) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No events found for this run' } });
      }

      const allowedOrigin = process.env.WEB_ORIGIN || 'http://localhost:3000';
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'close',
        'Access-Control-Allow-Origin': allowedOrigin,
      });
      reply.raw.write(': connected\n\n');

      for (const event of allEvents) {
        const data = JSON.stringify({
          type: event.type,
          ...((event.payload as Record<string, unknown>) || {}),
          createdAt: event.createdAt.toISOString(),
        });
        reply.raw.write(`id: ${event.id}\ndata: ${data}\n\n`);
      }
      reply.raw.end();
      return;
    }

    const allowedOrigin = process.env.WEB_ORIGIN || 'http://localhost:3000';
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': allowedOrigin,
    });

    reply.raw.write(': connected\n\n');

    let lastTimestamp = new Date(0).toISOString();
    let destroyed = false;

    const heartbeat = setInterval(() => {
      if (destroyed) return;
      try {
        reply.raw.write(': heartbeat\n\n');
      } catch {
        destroyed = true;
        clearInterval(heartbeat);
        clearInterval(pollInterval);
      }
    }, 15000);

    const pollInterval = setInterval(async () => {
      if (destroyed) return;

      try {
        const events = await runEventService.getEventsSince(runId, lastTimestamp);

        for (const event of events) {
          if (destroyed) break;
          const data = JSON.stringify({
            type: event.type,
            ...((event.payload as Record<string, unknown>) || {}),
            createdAt: event.createdAt.toISOString(),
          });
          const sseMessage = `id: ${event.id}\ndata: ${data}\n\n`;
          reply.raw.write(sseMessage);
        }
        if (events.length > 0) lastTimestamp = events[events.length - 1].createdAt.toISOString();
      } catch (err) {
        logger.error('SSE poll error', { runId, error: (err as Error).message });
      }
    }, 1000);

    request.raw.on('close', () => {
      destroyed = true;
      clearInterval(pollInterval);
      clearInterval(heartbeat);
    });
  });

  fastify.get('/runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };

    const runEvent = await prisma.runEvent.findFirst({
      where: { runId }, select: { projectId: true }
    });
    if (!runEvent) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    if (!(await requireProjectAccess(prisma, reply, runEvent.projectId, request.user?.id))) return;

    const events = await runEventService.getEvents(runId);
    const firstEvent = events[0];
    if (!firstEvent) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });

    const terminalTypes = new Set(['run.completed', 'run.failed', 'run.cancelled']);
    const isTerminal = events.some(e => terminalTypes.has(e.type));

    return {
      data: {
        run: {
          id: runId,
          projectId: firstEvent.projectId,
          status: isTerminal ? 'completed' : 'running',
          createdAt: firstEvent.createdAt,
        },
        events,
      },
    };
  });

  fastify.post('/projects/:projectId/runs', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;
    const parsed = createRunSchema.parse(request.body);
    let { modelIds, maxRounds, loopMode, searchProvider, checkpointStages } = parsed;
    const runId = crypto.randomUUID();

    // Fall back to user's defaultSearchProvider when none is specified
    if (!searchProvider && request.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: { defaultSearchProvider: true },
      });
      if (user?.defaultSearchProvider) {
        searchProvider = user.defaultSearchProvider as 'mock' | 'searxng' | 'serpapi' | 'web' | 'manual';
      }
    }

    await runEventService.record(runId, projectId, 'run.started', { runId, modelIds, maxRounds, loopMode, searchProvider });

    await deliberationQueue.add(runId, {
      projectId,
      modelIds: modelIds || [],
      maxRounds: maxRounds || 3,
      loopMode,
      searchProvider,
      checkpointStages,
    }, { jobId: runId });

    return reply.status(201).send({ data: { runId, status: 'queued' } });
  });

  /**
   * Metrics endpoint for self-improving runs.
   * Returns quality scores, stage completion rates, and iteration data
   * tracked by the GoalSeekingLoop.
   */
  fastify.get('/runs/:runId/metrics', async (request, reply) => {
    const { runId } = request.params as { runId: string };

    const runEvent = await prisma.runEvent.findFirst({
      where: { runId }, select: { projectId: true }
    });
    if (!runEvent) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    if (!(await requireProjectAccess(prisma, reply, runEvent.projectId, request.user?.id))) return;

    // Collect iteration metrics from run events
    const iterationEvents = await prisma.runEvent.findMany({
      where: {
        runId,
        type: { in: ['goal_loop.iteration_completed', 'goal_loop.quality_report', 'goal_loop.metrics'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (iterationEvents.length === 0) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No metrics found for this run (not a self_improving loop run)' } });
    }

    // Aggregate quality reports per stage
    const qualityReports: { stage: string; score: number; isUsable: boolean; issueCount: number }[] = [];
    for (const e of iterationEvents.filter(e => e.type === 'goal_loop.quality_report')) {
      const p = e.payload as Record<string, unknown> | null;
      if (!p) continue;
      qualityReports.push({
        stage: (p.stage as string) || 'unknown',
        score: (p.score as number) || 0,
        isUsable: (p.isUsable as boolean) !== false,
        issueCount: (p.issueCount as number) || 0,
      });
    }

    const stageScores: Record<string, { avg: number; count: number; failures: number }> = {};
    for (const r of qualityReports) {
      if (!stageScores[r.stage]) {
        stageScores[r.stage] = { avg: 0, count: 0, failures: 0 };
      }
      stageScores[r.stage].avg = (stageScores[r.stage].avg * stageScores[r.stage].count + r.score) / (stageScores[r.stage].count + 1);
      stageScores[r.stage].count += 1;
      if (!r.isUsable) stageScores[r.stage].failures += 1;
    }

    // Extract iteration summaries
    const iterationSummaries: { iteration: number; correctiveActions: number; qualityIssues: number; isFinal: boolean }[] = [];
    for (const e of iterationEvents.filter(e => e.type === 'goal_loop.iteration_completed')) {
      const p = e.payload as Record<string, unknown> | null;
      if (!p) continue;
      iterationSummaries.push({
        iteration: (p.iteration as number) || 0,
        correctiveActions: (p.correctiveActions as number) || 0,
        qualityIssues: (p.qualityIssues as number) || 0,
        isFinal: (p.isFinal as boolean) === true,
      });
    }

    // Run status
    const terminalTypes = new Set(['goal_loop.completed', 'goal_loop.failed']);
    const terminalEvent = iterationEvents.find(e => terminalTypes.has(e.type));

    return {
      data: {
        runId,
        status: terminalEvent ? 'completed' : 'running',
        iterations: iterationSummaries,
        stageQuality: stageScores,
        totalQualityReports: qualityReports.length,
        totalPromptImprovements: iterationSummaries.reduce((s, i) => s + i.qualityIssues, 0),
        totalCorrectiveActions: iterationSummaries.reduce((s, i) => s + i.correctiveActions, 0),
      },
    };
  });

  fastify.post('/runs/:runId/retry', async (request, reply) => {
    const { runId } = request.params as { runId: string };

    try {
      const runEvent = await prisma.runEvent.findFirst({
        where: { runId }, select: { projectId: true, payload: true }
      });
      if (!runEvent) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
      if (!(await requireProjectAccess(prisma, reply, runEvent.projectId, request.user?.id))) return;

      // Reset all failed stages to PENDING
      await prisma.runStage.updateMany({
        where: { runId, status: 'FAILED' },
        data: { status: 'PENDING', error: null },
      });

      // Reconstruct job data from the first run event
      const firstEvent = await prisma.runEvent.findFirst({
        where: { runId, type: 'run.started' },
        orderBy: { createdAt: 'asc' },
      });
      const runPayload = (firstEvent?.payload || runEvent.payload || {}) as Record<string, unknown>;
      const originalModelIds = (runPayload.modelIds as string[]) || [];

      // Get enabled models — try stored IDs first, fall back to all user's enabled models
      let configs = await prisma.modelConfig.findMany({
        where: { id: { in: originalModelIds }, isEnabled: true },
      });
      let enabledModelIds = configs.map(c => c.id);

      if (enabledModelIds.length === 0) {
        // Fallback: use all enabled models for this project's user
        const project = await prisma.researchProject.findUnique({
          where: { id: runEvent.projectId },
          select: { userId: true },
        });
        if (project?.userId) {
          configs = await prisma.modelConfig.findMany({
            where: { userId: project.userId, isEnabled: true },
          });
          enabledModelIds = configs.map(c => c.id);
        }
      }

      if (enabledModelIds.length === 0) {
        return reply.status(400).send({ error: 'No enabled models available to retry the run' });
      }

      await deliberationQueue.add(runId, {
        projectId: runEvent.projectId,
        maxRounds: (runPayload.maxRounds as number) || (runPayload.maxIterations as number) || 3,
        modelIds: enabledModelIds,
        loopMode: (runPayload.loopMode as 'standard' | 'self_improving') || 'standard',
        searchProvider: runPayload.searchProvider as string | undefined,
      });

      await runEventService.record(runId, runEvent.projectId, 'run.retried', { reason: 'User requested retry' });

      return { data: { success: true, message: 'Run retried' } };
    } catch (err: unknown) {
      logger.error('Retry endpoint error', { runId, error: (err as Error).message, stack: (err as Error).stack });
      return reply.status(500).send({ error: `Retry failed: ${(err as Error).message}` });
    }
  });

  fastify.post('/runs/:runId/cancel', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const job = await deliberationQueue.getJob(runId);

    let projectId: string | undefined;
    if (job) {
      const runEvent = await prisma.runEvent.findFirst({
        where: { runId }, select: { projectId: true }
      });
      if (!runEvent || !(await requireProjectAccess(prisma, reply, runEvent.projectId, request.user?.id))) return;
      projectId = runEvent.projectId;
      await job.remove();
    } else {
      // Job not in queue — try to get project from DB events
      const runEvent = await prisma.runEvent.findFirst({
        where: { runId }, select: { projectId: true }
      });
      if (!runEvent || !(await requireProjectAccess(prisma, reply, runEvent.projectId, request.user?.id))) return;
      projectId = runEvent.projectId;
    }

    // Mark all in-progress stages as cancelled
    await prisma.runStage.updateMany({
      where: { runId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      data: { status: 'FAILED', error: 'Cancelled by user' },
    });

    if (projectId) {
      await runEventService.record(runId, projectId, 'run.cancelled', { reason: 'User requested' });
    }
    return { data: { success: true } };
  });

  // ─── Pause / Resume ───────────────────────────────────────────────
  fastify.post('/runs/:runId/pause', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const runEvent = await prisma.runEvent.findFirst({
      where: { runId }, select: { projectId: true }
    });
    if (!runEvent) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    if (!(await requireProjectAccess(prisma, reply, runEvent.projectId, request.user?.id))) return;

    // Pause all in-progress/pending stages
    await prisma.runStage.updateMany({
      where: { runId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      data: { status: 'PAUSED' },
    });

    await runEventService.record(runId, runEvent.projectId, 'run.paused', {});
    logger.info('Run paused', { runId });
    return { data: { success: true, message: 'Run paused' } };
  });

  fastify.post('/runs/:runId/resume', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const runEvent = await prisma.runEvent.findFirst({
      where: { runId }, select: { projectId: true, payload: true }
    });
    if (!runEvent) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    if (!(await requireProjectAccess(prisma, reply, runEvent.projectId, request.user?.id))) return;

    // Resume all paused stages
    await prisma.runStage.updateMany({
      where: { runId, status: 'PAUSED' },
      data: { status: 'PENDING' },
    });

    // Re-add job to queue so it continues processing
    const projectData = (runEvent.payload as Record<string, unknown>) || {};
    const modelIds = projectData.modelIds as string[] || [];
    const maxRounds = (projectData.maxRounds as number) || 3;

    let resolvedModelIds = modelIds;
    let resolvedMaxRounds = maxRounds;
    if (resolvedModelIds.length === 0) {
      const firstEvent = await prisma.runEvent.findFirst({
        where: { runId, type: 'run.started' },
        orderBy: { createdAt: 'asc' },
      });
      if (firstEvent?.payload) {
        const p = firstEvent.payload as Record<string, unknown>;
        resolvedModelIds = (p.modelIds as string[]) || [];
        resolvedMaxRounds = (p.maxRounds as number) || (p.maxIterations as number) || 3;
      }
    }

    const configs = await prisma.modelConfig.findMany({
      where: { id: { in: resolvedModelIds }, isEnabled: true },
    });
    const enabledModelIds = configs.map(c => c.id);

    if (enabledModelIds.length > 0) {
      await deliberationQueue.add(runId, {
        projectId: runEvent.projectId,
        maxRounds: resolvedMaxRounds,
        modelIds: enabledModelIds,
        loopMode: (projectData.loopMode as 'standard' | 'self_improving') || 'standard',
        searchProvider: projectData.searchProvider as string | undefined,
      });
    }

    await runEventService.record(runId, runEvent.projectId, 'run.resumed', {});
    logger.info('Run resumed', { runId });
    return { data: { success: true, message: 'Run resumed' } };
  });

  // Per-stage pause/resume
  fastify.post('/runs/:runId/stages/:stageName/pause', async (request, reply) => {
    const { runId, stageName } = request.params as { runId: string; stageName: string };
    const runEvent = await prisma.runEvent.findFirst({
      where: { runId }, select: { projectId: true }
    });
    if (!runEvent) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    if (!(await requireProjectAccess(prisma, reply, runEvent.projectId, request.user?.id))) return;

    const stage = await prisma.runStage.findUnique({
      where: { runId_stageName: { runId, stageName } }
    });
    if (!stage) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Stage not found' } });
    if (stage.status !== 'IN_PROGRESS' && stage.status !== 'PENDING') {
      return reply.status(400).send({ error: `Stage is ${stage.status}, can only pause PENDING or IN_PROGRESS stages` });
    }

    await prisma.runStage.update({
      where: { id: stage.id },
      data: { status: 'PAUSED' }
    });

    await runEventService.record(runId, runEvent.projectId, 'stage.paused', { stageName });
    return { data: { success: true, message: `Stage ${stageName} paused` } };
  });

  fastify.post('/runs/:runId/stages/:stageName/resume', async (request, reply) => {
    const { runId, stageName } = request.params as { runId: string; stageName: string };
    const runEvent = await prisma.runEvent.findFirst({
      where: { runId }, select: { projectId: true }
    });
    if (!runEvent) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    if (!(await requireProjectAccess(prisma, reply, runEvent.projectId, request.user?.id))) return;

    const stage = await prisma.runStage.findUnique({
      where: { runId_stageName: { runId, stageName } }
    });
    if (!stage) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Stage not found' } });
    if (stage.status !== 'PAUSED') {
      return reply.status(400).send({ error: `Stage is ${stage.status}, can only resume PAUSED stages` });
    }

    await prisma.runStage.update({
      where: { id: stage.id },
      data: { status: 'PENDING' }
    });

    await runEventService.record(runId, runEvent.projectId, 'stage.resumed', { stageName });
    return { data: { success: true, message: `Stage ${stageName} resumed` } };
  });

  // Tasks
  fastify.get('/projects/:projectId/tasks', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;
    const tasks = await prisma.researchTask.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: tasks };
  });

  fastify.patch('/tasks/:taskId', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const body = updateTaskSchema.parse(request.body);

    const existing = await prisma.researchTask.findFirst({
      where: { id: taskId, project: { userId: request.user?.id } },
    });
    if (!existing) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Task not found' } });

    const task = await prisma.researchTask.update({
      where: { id: taskId },
      data: body,
    });

    return { data: task };
  });

  fastify.post('/tasks/:taskId/run', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };

    const task = await prisma.researchTask.findFirst({
      where: { id: taskId, project: { userId: request.user?.id } },
    });
    if (!task) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Task not found' } });

    // Mark task as running
    await prisma.researchTask.update({
      where: { id: taskId },
      data: { status: 'running' },
    });

    try {
      // Fetch project to get userId for model scoping
      const project = await prisma.researchProject.findUnique({ where: { id: task.projectId } });
      const projectUserId = project?.userId;

      // Find model: prefer assigned model, then project's first enabled model for this user
      let model = null;
      if (task.assignedModelId) {
        model = await prisma.modelConfig.findFirst({
          where: { id: task.assignedModelId, isEnabled: true, userId: projectUserId || undefined },
        });
      }
      if (!model) {
        model = await prisma.modelConfig.findFirst({
          where: { isEnabled: true, userId: projectUserId || undefined },
        });
      }
      if (!model) {
        model = await prisma.modelConfig.findFirst({ where: { isEnabled: true } });
      }
      if (!model) {
        await prisma.researchTask.update({ where: { id: taskId }, data: { status: 'failed' } });
        return reply.status(400).send({ error: { code: 'NO_MODELS', message: 'No enabled models available' } });
      }

      const { buildServices, buildSearchAdapter } = await import('../orchestrator/service-builder.js');
      const { services } = await buildServices([model.id]);
      const runId = `task-${taskId}-${Date.now()}`;

      switch (task.role) {
        case 'researcher':
        case 'skeptic': {
          const searchAdapter = buildSearchAdapter();
          if (searchAdapter && task.claimId) {
            const claim = await prisma.claim.findUnique({ where: { id: task.claimId } });
            if (claim) {
              const results = await searchAdapter.search(task.objective || claim.text);
              for (const r of results) {
                const existing = await prisma.evidence.findFirst({
                  where: { projectId: task.projectId, sourceUrl: r.url }
                });
                if (!existing) {
                  await prisma.evidence.create({
                    data: {
                      projectId: task.projectId,
                      claimId: task.claimId,
                      sourceUrl: r.url,
                      title: r.title,
                      excerpt: r.snippet,
                      sourceType: r.sourceType || 'unknown',
                      status: 'pending_review',
                      reliability: 'pending',
                      relevance: 'pending',
                    }
                  });
                }
              }
            }
          }
          break;
        }

        case 'source_auditor': {
          if (!task.claimId) break;
          const claimForAudit = await prisma.claim.findUnique({ where: { id: task.claimId } });
          if (!claimForAudit) break;
          const evidenceList = await prisma.evidence.findMany({
            where: { projectId: task.projectId, claimId: task.claimId, status: 'pending_review' },
          });
          for (const ev of evidenceList) {
            const assessment = await services.assessEvidence(
              claimForAudit as any, ev as any, task.objective || ev.excerpt || '',
              model.id,
            );
            await prisma.evidenceAssessment.create({
              data: {
                evidenceId: ev.id,
                reviewerModelId: model.id,
                reliability: assessment.reliability || 'medium',
                relevance: assessment.relevance || 'medium',
                interpretationVerdict: assessment.interpretationVerdict || 'correctly_used',
                detectedProblems: assessment.detectedProblems || [],
                notes: assessment.notes || '',
                finalVerdict: assessment.finalVerdict || 'accept',
              },
            });
            await prisma.evidence.update({
              where: { id: ev.id },
              data: {
                reliability: assessment.reliability || ev.reliability,
                relevance: assessment.relevance || ev.relevance,
                status: assessment.finalVerdict === 'reject' ? 'rejected' : 'accepted',
              },
            });
          }
          break;
        }

        case 'inference_auditor': {
          if (!task.claimId) break;
          const claim = await prisma.claim.findUnique({ where: { id: task.claimId } });
          if (claim) {
            const evidenceList = await prisma.evidence.findMany({
              where: { projectId: task.projectId, claimId: task.claimId },
            });
            const accepted = evidenceList.filter(e => e.status === 'accepted' || e.status === 'accepted_with_caution');
            const newStatus = accepted.length > 0 ? 'supported' : evidenceList.some(e => e.status === 'rejected') ? 'contradicted' : 'unverified';
            await prisma.claim.update({ where: { id: claim.id }, data: { status: newStatus } });
          }
          break;
        }

        case 'reviewer': {
          const version = await prisma.ideaVersion.findFirst({
            where: { projectId: task.projectId },
            orderBy: { versionNumber: 'desc' },
          });
          if (version) {
            const claimList = await prisma.claim.findMany({ where: { projectId: task.projectId, ideaVersionId: version.id } });
            const evidenceList = await prisma.evidence.findMany({ where: { projectId: task.projectId } });
            const review = await services.independentReview(
              version as any, claimList as any, evidenceList as any, [], [], model.id,
            );
            await prisma.modelReview.create({
              data: {
                projectId: task.projectId,
                ideaVersionId: version.id,
                modelId: model.id,
                verdict: review.verdict,
                strengths: review.strengths || [],
                weaknesses: review.weaknesses || [],
                blockingIssues: review.blockingIssues || [],
                supportedClaims: review.supportedClaims || [],
                unsupportedClaims: review.unsupportedClaims || [],
                suggestedRevisions: review.suggestedRevisions || [],
                confidence: review.confidence,
              },
            });
          }
          break;
        }

        case 'critic': {
          const version = await prisma.ideaVersion.findFirst({
            where: { projectId: task.projectId },
            orderBy: { versionNumber: 'desc' },
          });
          if (version) {
            const reviewList = await prisma.modelReview.findMany({ where: { projectId: task.projectId, ideaVersionId: version.id } });
            const claimList = await prisma.claim.findMany({ where: { projectId: task.projectId, ideaVersionId: version.id } });
            const evidenceList = await prisma.evidence.findMany({ where: { projectId: task.projectId } });
            const critiqueResult = await services.crossCritique(
              version as any, reviewList as any, claimList as any, evidenceList as any, model.id,
            );
            for (const c of critiqueResult.critiques) {
              await prisma.critique.create({
                data: {
                  projectId: task.projectId,
                  ideaVersionId: version.id,
                  criticModelId: model.id,
                  targetType: c.targetType,
                  targetId: c.targetId,
                  critiqueType: c.critiqueType,
                  severity: c.severity,
                  text: c.text,
                  whyItMatters: c.whyItMatters,
                  proposedFix: c.proposedFix || null,
                  evidenceIds: c.evidenceIds || [],
                  status: 'open',
                },
              });
            }
          }
          break;
        }

        case 'revision_writer': {
          const version = await prisma.ideaVersion.findFirst({
            where: { projectId: task.projectId },
            orderBy: { versionNumber: 'desc' },
          });
          if (version) {
            const acceptedCritiques = await prisma.critique.findMany({
              where: { projectId: task.projectId, ideaVersionId: version.id, status: 'accepted' },
            });
            const evidenceList = await prisma.evidence.findMany({
              where: { projectId: task.projectId, status: 'accepted' },
            });
            const revision = await services.reviseIdea(version as any, acceptedCritiques as any, evidenceList as any, model.id);
            const maxVersion = await prisma.ideaVersion.findFirst({
              where: { projectId: task.projectId },
              orderBy: { versionNumber: 'desc' },
              select: { versionNumber: true },
            });
            await prisma.ideaVersion.create({
              data: {
                projectId: task.projectId,
                versionNumber: (maxVersion?.versionNumber || 0) + 1,
                title: revision.title || version.title,
                description: revision.description,
                status: 'under_review' as const,
                changesFromPrevious: revision.changesFromPrevious || [],
              },
            });
          }
          break;
        }

        case 'consensus_voter': {
          const version = await prisma.ideaVersion.findFirst({
            where: { projectId: task.projectId },
            orderBy: { versionNumber: 'desc' },
          });
          if (version) {
            const claimList = await prisma.claim.findMany({ where: { projectId: task.projectId, ideaVersionId: version.id } });
            const evidenceList = await prisma.evidence.findMany({ where: { projectId: task.projectId } });
            const reviewList = await prisma.modelReview.findMany({ where: { projectId: task.projectId, ideaVersionId: version.id } });
            const vote = await services.voteConsensus(version as any, claimList as any, evidenceList as any, model.id);
            return reply.status(200).send({ data: { id: taskId, status: 'done', vote } });
          }
          break;
        }

        case 'decision_writer': {
          const version = await prisma.ideaVersion.findFirst({
            where: { projectId: task.projectId },
            orderBy: { versionNumber: 'desc' },
          });
          if (version) {
            const claimList = await prisma.claim.findMany({ where: { projectId: task.projectId, ideaVersionId: version.id } });
            const evidenceList = await prisma.evidence.findMany({ where: { projectId: task.projectId } });
            const reviewList = await prisma.modelReview.findMany({ where: { projectId: task.projectId, ideaVersionId: version.id } });
            const votes = reviewList.map(r => ({ modelId: r.modelId, vote: r.verdict }));
            const decision = await services.generateDecision(version as any, votes, claimList as any, evidenceList as any, model.id) as Record<string, unknown>;
            await prisma.decisionRecord.create({
              data: {
                projectId: task.projectId,
                ideaVersionId: version.id,
                decisionStatus: decision.decisionStatus as string,
                decisionText: decision.decisionText as string,
                whyGood: decision.whyGood as any,
                whyBad: decision.whyBad as any,
                knownWeaknesses: decision.knownWeaknesses as any,
                acceptedEvidenceIds: decision.acceptedEvidenceIds as any,
                counterEvidenceIds: decision.counterEvidenceIds as any,
                resolvedCritiqueIds: decision.resolvedCritiqueIds as any,
                unresolvedRisks: decision.unresolvedRisks as any,
                modelFinalVotes: decision.modelFinalVotes as any,
                reopenConditions: decision.reopenConditions as any,
                nextActions: decision.nextActions as any,
              },
            });
          }
          break;
        }

        case 'context_auditor': {
          const { contextService } = await import('../services/context.service.js');
          const context = await contextService.getProjectContext(task.projectId);
          return reply.status(200).send({
            data: {
              id: taskId,
              status: 'done',
              context: {
                claimsCount: context.claims.length,
                evidenceCount: context.acceptedEvidence.length,
                hasIdeaVersion: !!context.ideaVersion,
              },
            },
          });
        }

        default:
          logger.warn('Unknown task role', { role: task.role, taskId });
      }

      await prisma.researchTask.update({
        where: { id: taskId },
        data: { status: 'done' },
      });

      return reply.status(200).send({ data: { id: taskId, status: 'done' } });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Task execution failed', { taskId, role: task.role, error: msg });
      await prisma.researchTask.update({
        where: { id: taskId },
        data: { status: 'failed' },
      });
      return reply.status(500).send({ error: { code: 'TASK_FAILED', message: msg } });
    }
  });
}
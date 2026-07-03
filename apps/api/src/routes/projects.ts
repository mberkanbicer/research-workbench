import { FastifyInstance } from 'fastify';
import { ProjectRepository } from '../repositories/project.repository.js';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { generateMarkdownExport } from '../export/markdown-export.js';
import { authMiddleware } from './auth.js';

const projectRepo = new ProjectRepository();

type SanitizedValue = string | number | boolean | null | undefined | SanitizedValue[] | { [key: string]: SanitizedValue };

function sanitizeExport(input: unknown): SanitizedValue {
  const obj = input as SanitizedValue;
  if (Array.isArray(obj)) return obj.map(sanitizeExport);
  if (obj && typeof obj === 'object') {
    const cleaned: Record<string, SanitizedValue> = {};
    for (const [key, val] of Object.entries(obj)) {
      // Strip fields that could contain secrets (case-insensitive)
      if (/key|secret|token|password|auth|credential/i.test(key)) continue;
      cleaned[key] = sanitizeExport(val);
    }
    return cleaned;
  }
  return obj;
}

const CreateProjectSchema = z.object({
  title: z.string().min(1),
  goal: z.string().min(1),
  initialIdea: z.string().min(1),
});

const UpdateProjectSchema = z.object({
  title: z.string().optional(),
  goal: z.string().optional(),
  currentSynthesis: z.string().optional(),
  status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
});

export async function projectRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);
  fastify.get('/projects', async (request) => {
    const projects = await projectRepo.list(request.user?.id);
    return { data: projects };
  });

  fastify.post('/projects', async (request, reply) => {
    const body = CreateProjectSchema.parse(request.body);
    const project = await projectRepo.create(body.title, body.goal, body.initialIdea, request.user?.id || '');
    return reply.status(201).send({
      data: {
        project,
        ideaVersion: project.ideaVersions[0]
      }
    });
  });

  fastify.get('/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = await projectRepo.findById(projectId, request.user?.id);
    if (!project) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

    // Find latest decision
    const latestDecision = await prisma.decisionRecord.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    // Find active tasks
    const activeTasks = await prisma.researchTask.findMany({
      where: { projectId, status: { in: ['todo', 'running'] } },
      take: 5,
    });

    return {
      data: {
        project,
        currentIdeaVersion: project.ideaVersions?.[0] || null,
        latestDecision,
        claimCounts: {
          total: project.claims?.length || 0,
          supported: project.claims?.filter(c => c.status === 'supported').length || 0,
          contradicted: project.claims?.filter(c => c.status === 'contradicted').length || 0,
          unverified: project.claims?.filter(c => c.status === 'unverified').length || 0,
        },
        evidenceCounts: {
          total: project.evidence?.length || 0,
          accepted: project.evidence?.filter(e => e.status === 'accepted').length || 0,
          pending_review: project.evidence?.filter(e => e.status === 'pending_review').length || 0,
        },
        openCriticalIssues: [],
        activeTasks,
        nextBestAction: null,
      }
    };
  });

  fastify.patch('/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = UpdateProjectSchema.parse(request.body);

    const existing = await prisma.researchProject.findUnique({ where: { id: projectId, userId: request.user?.id } });
    if (!existing) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

    const project = await prisma.researchProject.update({
      where: { id: projectId },
      data: body,
    });

    return { data: project };
  });

  fastify.post('/projects/:projectId/archive', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const existing = await prisma.researchProject.findUnique({ where: { id: projectId, userId: request.user?.id } });
    if (!existing) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

    const project = await prisma.researchProject.update({
      where: { id: projectId },
      data: { status: 'archived' },
    });

    return { data: project };
  });

  fastify.post('/projects/:projectId/decisions', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { decisionStatus, decisionText, ideaVersionId } = request.body as { decisionStatus: string; decisionText: string; ideaVersionId: string };

    const project = await prisma.researchProject.findUnique({ where: { id: projectId, userId: request.user?.id } });
    if (!project) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

    const decision = await prisma.decisionRecord.create({
      data: {
        projectId,
        ideaVersionId,
        decisionStatus,
        decisionText,
      }
    });

    return reply.status(201).send({ data: decision });
  });

  fastify.get('/projects/:projectId/export/json', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const data = await projectRepo.getExportData(projectId, request.user?.id);
    if (!data) return reply.status(404).send({ error: 'Project not found' });

    reply.header('Content-Disposition', `attachment; filename="project-${projectId}.json"`);
    return sanitizeExport(data);
  });

  fastify.delete('/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const existing = await prisma.researchProject.findUnique({ where: { id: projectId, userId: request.user?.id } });
    if (!existing) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    try {
      await projectRepo.delete(projectId);
      return reply.status(200).send({ data: { success: true } });
    } catch (error) {
      request.log.error({ error }, 'Failed to delete project');
      return reply.status(500).send({ error: { code: 'DELETE_FAILED', message: (error as Error).message } });
    }
  });

  fastify.get('/projects/:projectId/export/markdown', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const data = await projectRepo.getExportData(projectId, request.user?.id);
    if (!data) return reply.status(404).send({ error: 'Project not found' });

    const md = generateMarkdownExport(data);
    reply.header('Content-Disposition', `attachment; filename="project-${projectId}.md"`);
    reply.type('text/markdown');
    return md;
  });

  fastify.get('/projects/:projectId/export/pdf', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const data = await projectRepo.getExportData(projectId, request.user?.id);
    if (!data) return reply.status(404).send({ error: 'Project not found' });

    const { generatePdfExport } = await import('../export/pdf-export.js');
    const pdfBuffer = await generatePdfExport(data as any);
    reply.header('Content-Disposition', `attachment; filename="project-${projectId}.pdf"`);
    reply.type('application/pdf');
    return pdfBuffer;
  });

  /**
   * GET /portfolio
   * Returns all projects with aggregate stats for portfolio dashboard.
   */
  fastify.get('/portfolio', async (request, reply) => {
    const projects = await prisma.researchProject.findMany({
      where: request.user?.id ? { userId: request.user.id } : {},
      orderBy: { updatedAt: 'desc' },
    });

    const portfolio = await Promise.all(projects.map(async (project) => {
      const [claims, evidence, runEvents, decisions] = await Promise.all([
        prisma.claim.findMany({ where: { projectId: project.id }, select: { status: true, criticality: true } }),
        prisma.evidence.findMany({ where: { projectId: project.id }, select: { status: true, isCounter: true } }),
        prisma.runEvent.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' }, take: 1 }),
        prisma.decisionRecord.findMany({ where: { projectId: project.id }, select: { decisionStatus: true } }),
      ]);

      const supported = claims.filter(c => c.status === 'supported').length;
      const total = claims.length;
      const healthScore = total > 0 ? Math.round((supported / total) * 100) : 0;

      const lastEvent = runEvents[0];
      const hasActiveRun = lastEvent && !['run.completed', 'run.failed', 'run.cancelled'].includes(lastEvent.type);

      return {
        id: project.id,
        title: project.title,
        goal: project.goal,
        status: project.status,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        stats: {
          totalClaims: total,
          supportedClaims: supported,
          contradictedClaims: claims.filter(c => c.status === 'contradicted').length,
          unverifiedClaims: claims.filter(c => c.status === 'unverified').length,
          totalEvidence: evidence.length,
          acceptedEvidence: evidence.filter(e => e.status === 'accepted').length,
          counterEvidence: evidence.filter(e => e.isCounter).length,
          decisionCount: decisions.length,
          healthScore,
        },
        hasActiveRun,
        lastActivity: lastEvent?.createdAt || project.updatedAt,
      };
    }));

    return { data: portfolio };
  });

  /**
   * GET /projects/:projectId/export/reproducibility-pack
   * Returns a reproducibility pack with all configuration needed to reproduce results.
   */
  fastify.get('/projects/:projectId/export/reproducibility-pack', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const project = await prisma.researchProject.findUnique({ where: { id: projectId } });
    if (!project) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

    // Get all data
    const [ideaVersions, claims, evidence, reviews, critiques, decisions, runEvents, modelConfigs] = await Promise.all([
      prisma.ideaVersion.findMany({ where: { projectId }, orderBy: { versionNumber: 'asc' } }),
      prisma.claim.findMany({ where: { projectId } }),
      prisma.evidence.findMany({ where: { projectId } }),
      prisma.modelReview.findMany({ where: { projectId } }),
      prisma.critique.findMany({ where: { projectId } }),
      prisma.decisionRecord.findMany({ where: { projectId } }),
      prisma.runEvent.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } }),
      prisma.modelConfig.findMany({ where: { isEnabled: true } }),
    ]);

    // Get prompts from registry
    const { PromptRegistry } = await import('../orchestrator/prompt-registry.js');
    const registry = new PromptRegistry();
    await registry.loadFromDb();
    const prompts = registry.getAllPrompts();

    // Extract run configurations from events
    const runConfigs = runEvents
      .filter(e => e.type === 'run.started')
      .map(e => e.payload as Record<string, unknown>);

    return {
      data: {
        metadata: {
          exportedAt: new Date().toISOString(),
          projectId,
          title: project.title,
          goal: project.goal,
        },
        project: {
          title: project.title,
          goal: project.goal,
          status: project.status,
          staleThresholdDays: (project as any).staleThresholdDays,
        },
        modelConfigs: modelConfigs.map(m => ({
          name: m.name,
          provider: m.provider,
          model: m.model,
          defaultTemperature: m.defaultTemperature,
          contextWindow: m.contextWindow,
        })),
        prompts,
        pipeline: {
          loopModes: ['standard', 'self_improving', 'adversarial'],
          defaultLoopMode: runConfigs[0]?.loopMode || 'standard',
          maxIterations: runConfigs[0]?.maxRounds || 3,
          searchProvider: runConfigs[0]?.searchProvider || 'mock',
        },
        runConfigs,
        results: {
          ideaVersions,
          claims,
          evidence,
          reviews,
          critiques,
          decisions,
        },
        runEvents: runEvents.map(e => ({
          type: e.type,
          payload: e.payload,
          createdAt: e.createdAt,
        })),
      },
    };
  });
}

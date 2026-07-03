import { prisma } from '../prisma.js';
import { EventRepository } from '../repositories/event.repository.js';
import type { Prisma } from '@prisma/client';

const eventRepo = new EventRepository();

/** A raw project-level event (persisted via EventRepository). */
export class EventService {
  async recordProjectCreated(projectId: string, payload: Record<string, unknown>, createdBy: string) {
    return eventRepo.append(projectId, 'project.created', payload, createdBy);
  }

  async recordModelCall(projectId: string, payload: Record<string, unknown>, createdBy: string) {
    return eventRepo.append(projectId, 'model.call', payload, createdBy);
  }

  async recordClaimExtracted(projectId: string, payload: Record<string, unknown>, createdBy: string) {
    return eventRepo.append(projectId, 'claim.extracted', payload, createdBy);
  }

  async recordEvidenceAdded(projectId: string, payload: Record<string, unknown>, createdBy: string) {
    return eventRepo.append(projectId, 'evidence.added', payload, createdBy);
  }

  async recordEvidenceAssessed(projectId: string, payload: Record<string, unknown>, createdBy: string) {
    return eventRepo.append(projectId, 'evidence.assessed', payload, createdBy);
  }

  async recordReviewCompleted(projectId: string, payload: Record<string, unknown>, createdBy: string) {
    return eventRepo.append(projectId, 'review.completed', payload, createdBy);
  }

  async recordCritiqueCreated(projectId: string, payload: Record<string, unknown>, createdBy: string) {
    return eventRepo.append(projectId, 'critique.created', payload, createdBy);
  }

  async recordCritiqueResponded(projectId: string, payload: Record<string, unknown>, createdBy: string) {
    return eventRepo.append(projectId, 'critique.responded', payload, createdBy);
  }

  async recordIdeaRevised(projectId: string, payload: Record<string, unknown>, createdBy: string) {
    return eventRepo.append(projectId, 'idea.revised', payload, createdBy);
  }

  async recordConsensusChecked(projectId: string, payload: Record<string, unknown>, createdBy: string) {
    return eventRepo.append(projectId, 'consensus.checked', payload, createdBy);
  }

  async recordDecisionCreated(projectId: string, payload: Record<string, unknown>, createdBy: string) {
    return eventRepo.append(projectId, 'decision.created', payload, createdBy);
  }

  async recordRunCompleted(projectId: string, payload: Record<string, unknown>, createdBy: string) {
    return eventRepo.append(projectId, 'run.completed', payload, createdBy);
  }

  async recordRunFailed(projectId: string, payload: Record<string, unknown>, createdBy: string) {
    return eventRepo.append(projectId, 'run.failed', payload, createdBy);
  }
}

/** Per-run event stream (used by SSE and poll endpoints). */
export class RunEventService {
  async record(runId: string, projectId: string, type: string, payload: Record<string, unknown>) {
    return prisma.runEvent.create({
      data: { runId, projectId, type, payload: payload as unknown as Prisma.InputJsonValue },
    });
  }

  async getEvents(runId: string) {
    return prisma.runEvent.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getEventsSince(runId: string, after: string) {
    return prisma.runEvent.findMany({
      where: { runId, createdAt: { gt: new Date(after) } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getRunSummary(runId: string) {
    const events = await prisma.runEvent.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });

    const stages = await prisma.runStage.findMany({ where: { runId } });

    // Extract config from run.started event
    const startedEvent = events.find(e => e.type === 'run.started');
    const config = startedEvent?.payload as Record<string, unknown> || {};

    // Compute metrics from events
    const phaseEvents = events.filter(e => e.type.startsWith('phase.'));
    const completedPhases = phaseEvents.filter(e => e.type.endsWith('.completed'));
    const failedPhases = phaseEvents.filter(e => e.type.endsWith('.failed'));

    // Duration
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];
    const durationMs = firstEvent && lastEvent
      ? lastEvent.createdAt.getTime() - firstEvent.createdAt.getTime()
      : 0;

    // Find decision
    const decisionEvent = events.find(e => e.type === 'phase.consensus.completed');
    const decisionPayload = decisionEvent?.payload as Record<string, unknown> || {};

    return {
      runId,
      config: {
        modelIds: config.modelIds || [],
        loopMode: config.loopMode || 'standard',
        maxRounds: config.maxRounds || 3,
        searchProvider: config.searchProvider || 'mock',
      },
      metrics: {
        totalEvents: events.length,
        completedPhases: completedPhases.length,
        failedPhases: failedPhases.length,
        stagesCompleted: stages.filter(s => s.status === 'COMPLETED').length,
        stagesFailed: stages.filter(s => s.status === 'FAILED').length,
        durationMs,
        iterationCount: events.filter(e => e.type === 'goal_loop.iteration_started').length,
      },
      decision: {
        vote: decisionPayload.vote || null,
        decisionStatus: decisionPayload.decisionStatus || null,
      },
      startTime: firstEvent?.createdAt,
      endTime: lastEvent?.createdAt,
    };
  }

  async compareRuns(projectId: string, run1Id: string, run2Id: string) {
    const [summary1, summary2] = await Promise.all([
      this.getRunSummary(run1Id),
      this.getRunSummary(run2Id),
    ]);

    // Get claim/evidence counts for each run
    const getRunClaims = async (runId: string) => {
      const startedEvent = await prisma.runEvent.findFirst({ where: { runId, type: 'run.started' } });
      if (!startedEvent) return { total: 0, supported: 0, contradicted: 0 };
      const projectId = startedEvent.projectId;
      const claims = await prisma.claim.findMany({ where: { projectId } });
      return {
        total: claims.length,
        supported: claims.filter(c => c.status === 'supported').length,
        contradicted: claims.filter(c => c.status === 'contradicted').length,
        unverified: claims.filter(c => c.status === 'unverified').length,
      };
    };

    const getRunEvidence = async (runId: string) => {
      const startedEvent = await prisma.runEvent.findFirst({ where: { runId, type: 'run.started' } });
      if (!startedEvent) return { total: 0, accepted: 0, rejected: 0 };
      const projectId = startedEvent.projectId;
      const evidence = await prisma.evidence.findMany({ where: { projectId } });
      return {
        total: evidence.length,
        accepted: evidence.filter(e => e.status === 'accepted').length,
        rejected: evidence.filter(e => e.status === 'rejected').length,
        counter: evidence.filter(e => e.isCounter).length,
      };
    };

    const [claims1, claims2, evidence1, evidence2] = await Promise.all([
      getRunClaims(run1Id),
      getRunClaims(run2Id),
      getRunEvidence(run1Id),
      getRunEvidence(run2Id),
    ]);

    return {
      run1: { ...summary1, claims: claims1, evidence: evidence1 },
      run2: { ...summary2, claims: claims2, evidence: evidence2 },
    };
  }
}

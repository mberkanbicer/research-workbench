import { DeliberationServices } from '../../orchestrator/services.js';
import { prisma } from '../../prisma.js';
import { Prisma } from '@prisma/client';
import { RunEventService } from '../event.service.js';
import { logger } from '../../utils/logger.js';
import { Claim, Critique, Evidence, IdeaVersion } from '@repo/shared';
import { updateStage } from './stage-utils.js';

const runEventService = new RunEventService();

export class RevisionStage {
  constructor(private services: DeliberationServices) {}

  async performRevision(runId: string, projectId: string, ideaVersionId: string, modelId: string): Promise<IdeaVersion> {
    await updateStage(runId, 'revision', 'IN_PROGRESS');
    try {
      const currentVersion = await prisma.ideaVersion.findUnique({ where: { id: ideaVersionId } });
      if (!currentVersion) throw new Error('Idea version not found');

      await runEventService.record(runId, projectId, 'phase.revision.started', { ideaVersionId });

      const [acceptedCritiques, partialCritiques, acceptedEvidence] = await Promise.all([
        prisma.critique.findMany({ where: { ideaVersionId, status: 'accepted' } }),
        prisma.critique.findMany({ where: { ideaVersionId, status: 'partially_accepted' } }),
        prisma.evidence.findMany({ where: { projectId, isCounter: false, status: { in: ['accepted', 'accepted_with_caution', 'accepted_with_reservations'] } } }),
      ]);

      const revision = await this.services.reviseIdea(
        currentVersion as IdeaVersion,
        [...acceptedCritiques, ...partialCritiques] as Critique[],
        acceptedEvidence as Evidence[],
        modelId,
      );

      const nextVersionNumber = currentVersion.versionNumber + 1;

      const newVersion = await prisma.$transaction(async (tx) => {
        const existing = await tx.ideaVersion.findFirst({ where: { projectId, versionNumber: nextVersionNumber } });

        if (existing) {
          return tx.ideaVersion.update({
            where: { id: existing.id },
            data: {
              title: revision.title || `${currentVersion.title} (v${nextVersionNumber})`,
              description: revision.description,
              status: 'under_review',
              changesFromPrevious: revision.changesFromPrevious as Prisma.InputJsonValue,
              createdBecauseOfCritiqueIds: [...acceptedCritiques, ...partialCritiques].map(c => c.id),
            },
          });
        }

        const created = await tx.ideaVersion.create({
          data: {
            projectId, versionNumber: nextVersionNumber,
            title: revision.title || `${currentVersion.title} (v${nextVersionNumber})`,
            description: revision.description,
            status: 'under_review',
            changesFromPrevious: revision.changesFromPrevious as Prisma.InputJsonValue,
            createdBecauseOfCritiqueIds: [...acceptedCritiques, ...partialCritiques].map(c => c.id),
          },
        });

        await tx.ideaVersion.update({ where: { id: currentVersion.id }, data: { status: 'superseded' } });
        await updateStage(runId, 'revision', 'COMPLETED', undefined, tx);
        return created;
      });

      await runEventService.record(runId, projectId, 'idea.revised', { newVersionId: newVersion.id, versionNumber: nextVersionNumber });
      await runEventService.record(runId, projectId, 'phase.revision.completed', { newVersionId: newVersion.id });

      return newVersion as IdeaVersion;
    } catch (error: unknown) {
      await updateStage(runId, 'revision', 'FAILED', (error as Error).message);
      throw error;
    }
  }

  async performGoalEvaluation(runId: string, projectId: string, ideaVersionId: string, modelIds: string[]): Promise<{ goalAchieved: boolean; achievementLevel: string; reason: string; missingAspects: string[] }> {
    await updateStage(runId, 'goal_evaluation', 'IN_PROGRESS');
    try {
      await runEventService.record(runId, projectId, 'phase.goal_evaluation.started', { ideaVersionId });

      const project = await prisma.researchProject.findUnique({ where: { id: projectId } });
      if (!project) throw new Error('Project not found');

      const [version, claims, evidence, critiques, decisions] = await Promise.all([
        prisma.ideaVersion.findUnique({ where: { id: ideaVersionId } }),
        prisma.claim.findMany({ where: { ideaVersionId } }),
        prisma.evidence.findMany({ where: { projectId } }),
        prisma.critique.findMany({ where: { ideaVersionId } }),
        prisma.decisionRecord.findMany({ where: { ideaVersionId } }),
      ]);

      let lastError: Error | null = null;
      for (const modelId of modelIds) {
        try {
          const result = await this.services.evaluateGoalAchievement(
            project.goal, version as IdeaVersion, claims as Claim[],
            evidence as Evidence[], critiques, decisions, modelId,
          );

          const achieved = result.goalAchieved && ['fully', 'mostly'].includes(result.achievementLevel);

          await runEventService.record(runId, projectId, 'phase.goal_evaluation.completed', {
            goalAchieved: achieved, achievementLevel: result.achievementLevel,
            confidence: result.confidence, missingAspects: result.missingAspects, reason: result.reason,
          });
          await updateStage(runId, 'goal_evaluation', 'COMPLETED');
          return { goalAchieved: achieved, achievementLevel: result.achievementLevel, reason: result.reason, missingAspects: result.missingAspects };
        } catch (err: unknown) {
          lastError = err instanceof Error ? err : new Error(String(err));
          logger.warn('Goal evaluation failed with model, trying fallback', { modelId, error: (err as Error).message });
        }
      }

      throw lastError || new Error('All models failed goal evaluation');
    } catch (error: unknown) {
      await updateStage(runId, 'goal_evaluation', 'FAILED', (error as Error).message);
      throw error;
    }
  }
}

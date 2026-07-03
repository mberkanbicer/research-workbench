import { DeliberationServices } from '../../orchestrator/services.js';
import { prisma } from '../../prisma.js';
import { RunEventService } from '../event.service.js';
import { Claim, Critique, Evidence, IdeaVersion, ModelReview } from '@repo/shared';
import { updateStage } from './stage-utils.js';
import { indexCritiqueEmbedding } from '../embedding-index.js';

const runEventService = new RunEventService();

export class CritiqueStage {
  constructor(private services: DeliberationServices) {}

  async performCrossCritiques(runId: string, projectId: string, ideaVersionId: string, modelIds: string[]): Promise<Critique[]> {
    await updateStage(runId, 'critique', 'IN_PROGRESS');
    try {
      await runEventService.record(runId, projectId, 'phase.critique.started', { modelCount: modelIds.length });

      const [version, claims, evidence, reviews] = await Promise.all([
        prisma.ideaVersion.findUnique({ where: { id: ideaVersionId } }),
        prisma.claim.findMany({ where: { ideaVersionId } }),
        prisma.evidence.findMany({ where: { projectId, status: 'accepted' } }),
        prisma.modelReview.findMany({ where: { projectId, ideaVersionId } }),
      ]);

      const critiquesList: Critique[] = [];
      for (const criticModelId of modelIds) {
        const otherReviews = reviews.filter(r => r.modelId !== criticModelId);
        const result = await this.services.crossCritique(version as IdeaVersion, otherReviews as ModelReview[], claims as Claim[], evidence as Evidence[], criticModelId);
        if (result.critiques) {
          const created = await prisma.$transaction(async (tx) => {
            // Delete CritiqueResponse records first (foreign key dependency)
            const existingCritiques = await tx.critique.findMany({ where: { ideaVersionId, criticModelId }, select: { id: true } });
            if (existingCritiques.length > 0) {
              await tx.critiqueResponse.deleteMany({ where: { critiqueId: { in: existingCritiques.map(c => c.id) } } });
            }
            await tx.critique.deleteMany({ where: { ideaVersionId, criticModelId } });
            return Promise.all(result.critiques.map(c =>
              tx.critique.create({
                data: {
                  projectId, ideaVersionId, criticModelId,
                  targetType: c.targetType, targetId: c.targetId, critiqueType: c.critiqueType,
                  severity: c.severity, text: c.text, whyItMatters: c.whyItMatters,
                  proposedFix: c.proposedFix || null, evidenceIds: c.evidenceIds, status: 'open',
                },
              })
            ));
          });

          for (const critique of created) {
            critiquesList.push(critique as Critique);
            indexCritiqueEmbedding(projectId, critique.id, critique.text);
            await runEventService.record(runId, projectId, 'critique.created', {
              critiqueId: critique.id,
              criticModelId,
              severity: critique.severity,
              text: critique.text,
              whyItMatters: critique.whyItMatters,
            });
          }
        }
      }

      await runEventService.record(runId, projectId, 'phase.critique.completed', { count: critiquesList.length });
      await updateStage(runId, 'critique', 'COMPLETED');
      return critiquesList;
    } catch (error: unknown) {
      await updateStage(runId, 'critique', 'FAILED', (error as Error).message);
      throw error;
    }
  }

  async performCritiqueResponses(runId: string, projectId: string, critiques: Critique[], modelIds: string[]): Promise<void> {
    await updateStage(runId, 'critique_response', 'IN_PROGRESS');
    try {
      await runEventService.record(runId, projectId, 'phase.critique_response.started', { critiqueCount: critiques.length });

      const evidence = await prisma.evidence.findMany({ where: { projectId, status: { in: ['accepted', 'accepted_with_caution', 'accepted_with_reservations'] } } });
      const nextTargetIdx: Record<string, number> = {};

      for (const critique of critiques) {
        let targetModelId: string;
        if (critique.targetType === 'model_review') {
          const targetReview = await prisma.modelReview.findUnique({ where: { id: critique.targetId } });
          targetModelId = targetReview?.modelId || modelIds[0];
        } else {
          const otherModels = modelIds.filter(id => id !== critique.criticModelId);
          if (otherModels.length === 0) {
            targetModelId = modelIds[0];
          } else {
            const idx = nextTargetIdx[critique.criticModelId] || 0;
            targetModelId = otherModels[idx % otherModels.length];
            nextTargetIdx[critique.criticModelId] = idx + 1;
          }
        }

        let originalPosition: ModelReview | Claim | Evidence | IdeaVersion | null = null;
        switch (critique.targetType) {
          case 'model_review': originalPosition = await prisma.modelReview.findUnique({ where: { id: critique.targetId } }) as ModelReview | null; break;
          case 'claim': originalPosition = await prisma.claim.findUnique({ where: { id: critique.targetId } }) as Claim | null; break;
          case 'evidence': originalPosition = await prisma.evidence.findUnique({ where: { id: critique.targetId } }) as Evidence | null; break;
          case 'idea': originalPosition = await prisma.ideaVersion.findUnique({ where: { id: critique.targetId } }) as IdeaVersion | null; break;
        }

        const response = await this.services.respondToCritique(originalPosition || critique, critique, evidence as Evidence[], targetModelId);

        await prisma.$transaction(async (tx) => {
          await tx.critiqueResponse.deleteMany({ where: { critiqueId: critique.id, targetModelId } });
          await tx.critiqueResponse.create({
            data: {
              critiqueId: critique.id, targetModelId,
              verdict: response.verdict, reason: response.reason,
              positionChange: response.positionChange,
              revisedClaim: response.revisedClaim || null,
              requestedEvidence: response.requestedEvidence,
            },
          });
          await tx.critique.update({ where: { id: critique.id }, data: { status: response.verdict === 'accept' ? 'accepted' : 'rejected' } });
        });

        await runEventService.record(runId, projectId, 'critique.responded', { critiqueId: critique.id, targetModelId, verdict: response.verdict });
      }

      await runEventService.record(runId, projectId, 'phase.critique_response.completed', { count: critiques.length });
      await updateStage(runId, 'critique_response', 'COMPLETED');
    } catch (error: unknown) {
      await updateStage(runId, 'critique_response', 'FAILED', (error as Error).message);
      throw error;
    }
  }
}

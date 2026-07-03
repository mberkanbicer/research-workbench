import { DeliberationServices } from '../../orchestrator/services.js';
import { prisma } from '../../prisma.js';
import { RunEventService, EventService } from '../event.service.js';
import { Claim, IdeaVersion } from '@repo/shared';
import { updateStage } from './stage-utils.js';
import { indexClaimEmbedding } from '../embedding-index.js';

const runEventService = new RunEventService();
const eventService = new EventService();

export class ExtractionStage {
  constructor(private services: DeliberationServices) {}

  async performExtraction(runId: string, projectId: string, ideaVersionId: string, modelIds: string[]): Promise<Claim[]> {
    await updateStage(runId, 'extraction', 'IN_PROGRESS');
    try {
      const project = await prisma.researchProject.findUnique({ where: { id: projectId } });
      const version = await prisma.ideaVersion.findUnique({ where: { id: ideaVersionId } });
      if (!project || !version) throw new Error('Project or Version not found');

      await runEventService.record(runId, projectId, 'phase.extraction.started', { ideaVersionId });

      const modelId = modelIds[0];
      const result = await this.services.extractClaims(project.goal, version as IdeaVersion, [], modelId);

      if (!result.claims || result.claims.length === 0) {
        const msg = 'No claims extracted or AI error';
        await runEventService.record(runId, projectId, 'phase.extraction.failed', { reason: msg });
        await updateStage(runId, 'extraction', 'FAILED', msg);
        return [];
      }

      const createdClaims = await prisma.$transaction(async (tx) => {
        await tx.claim.deleteMany({ where: { ideaVersionId } });

        const claims = await Promise.all((result.claims as any[]).map((c: any) =>
          tx.claim.create({
            data: {
              projectId,
              ideaVersionId,
              text: c.text,
              type: c.type,
              requiresEvidence: c.requiresEvidence,
              criticality: c.criticality,
              status: 'unverified',
            },
          })
        ));

        // Persist hypotheses from extraction output
        if (result.hypotheses && Array.isArray(result.hypotheses) && result.hypotheses.length > 0) {
          await Promise.all(result.hypotheses.map((h: any) =>
            tx.hypothesis.create({
              data: {
                projectId,
                ideaVersionId,
                statement: h.statement || h,
                status: 'unexamined',
              },
            })
          ));
        }

        await updateStage(runId, 'extraction', 'COMPLETED', undefined, tx);
        return claims;
      });

      await eventService.recordClaimExtracted(projectId, { claimIds: createdClaims.map(c => c.id) }, 'system');
      await runEventService.record(runId, projectId, 'phase.extraction.completed', { count: createdClaims.length });

      for (const claim of createdClaims) {
        indexClaimEmbedding(projectId, claim.id, claim.text);
        // Record initial confidence (0 for unverified claims)
        await prisma.claimConfidenceHistory.create({
          data: { claimId: claim.id, projectId, confidence: 0, round: 1, reason: 'Initial extraction' },
        });
      }

      return createdClaims as Claim[];
    } catch (error: unknown) {
      await updateStage(runId, 'extraction', 'FAILED', (error as Error).message);
      throw error;
    }
  }
}

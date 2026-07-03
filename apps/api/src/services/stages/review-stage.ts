import { DeliberationServices } from '../../orchestrator/services.js';
import { prisma } from '../../prisma.js';
import { Prisma } from '@prisma/client';
import { RunEventService } from '../event.service.js';
import { logger } from '../../utils/logger.js';
import { Claim, Evidence, IdeaVersion, ModelReview } from '@repo/shared';
import { IndependentReviewOutputSchema } from '../../orchestrator/prompts.schemas.js';
import { z } from 'zod';
import { updateStage } from './stage-utils.js';
import { indexReviewEmbedding } from '../embedding-index.js';

type IndependentReviewOutput = z.infer<typeof IndependentReviewOutputSchema>;

type ResolvedContextItem = {
  type: string;
  reason: string;
  query: string;
  idOrQuery: string;
  data: unknown;
};

const runEventService = new RunEventService();

export class ReviewStage {
  constructor(private services: DeliberationServices) {}

  async performReviews(runId: string, projectId: string, ideaVersionId: string, modelIds: string[]): Promise<ModelReview[]> {
    await updateStage(runId, 'review', 'IN_PROGRESS');
    try {
      await runEventService.record(runId, projectId, 'phase.review.started', { modelCount: modelIds.length });

      const [version, claims, evidence] = await Promise.all([
        prisma.ideaVersion.findUnique({ where: { id: ideaVersionId } }),
        prisma.claim.findMany({ where: { ideaVersionId } }),
        prisma.evidence.findMany({ where: { projectId, status: { in: ['accepted', 'accepted_with_caution', 'accepted_with_reservations'] } } }),
      ]);

      const reviewResults = await Promise.allSettled(modelIds.map(async (modelId) => {
        let attempts = 0;
        let extraContext: ResolvedContextItem[] = [];
        let review: IndependentReviewOutput;

        while (attempts < 3) {
          review = await this.services.independentReview(version as IdeaVersion, claims as Claim[], evidence as Evidence[], [], extraContext, modelId);
          if (review.needsMoreContext && review.requestedItems && review.requestedItems.length > 0) {
            attempts++;
            await runEventService.record(runId, projectId, 'review.context_requested', {
              modelId, attempt: attempts, requestedItemsCount: review.requestedItems.length, requestedItems: review.requestedItems,
            });

            const resolved = await Promise.all(
              review.requestedItems.map((item) => this.resolveContextItem(item))
            );
            const validResolved = resolved.filter((r): r is ResolvedContextItem => r !== null);
            extraContext = [...extraContext, ...validResolved];
          } else {
            break;
          }
        }

        return prisma.$transaction(async (tx) => {
          await tx.modelReview.deleteMany({ where: { ideaVersionId, modelId } });
          return tx.modelReview.create({
            data: {
              projectId, ideaVersionId, modelId,
              verdict: review!.verdict,
              strengths: review!.strengths,
              weaknesses: review!.weaknesses,
              blockingIssues: review!.blockingIssues,
              supportedClaims: review!.supportedClaims as Prisma.InputJsonValue,
              unsupportedClaims: review!.unsupportedClaims as Prisma.InputJsonValue,
              suggestedRevisions: review!.suggestedRevisions,
              confidence: review!.confidence,
            },
          });
        });
      }));

      const reviews: ModelReview[] = [];
      for (const result of reviewResults) {
        if (result.status === 'fulfilled') {
          const review = result.value as ModelReview;
          reviews.push(review);
          const text = [review.verdict, ...(review.strengths || []), ...(review.weaknesses || [])].filter(Boolean).join('\n');
          indexReviewEmbedding(projectId, review.id, text);
        }
        else logger.error('Model review failed', { error: String(result.reason) });
      }

      await runEventService.record(runId, projectId, 'phase.review.completed', {
        count: reviews.length,
        reviews: reviews.map((r) => ({
          reviewId: r.id,
          modelId: r.modelId,
          verdict: r.verdict,
          confidence: r.confidence,
        })),
      });
      await updateStage(runId, 'review', 'COMPLETED');
      return reviews;
    } catch (error: unknown) {
      await updateStage(runId, 'review', 'FAILED', (error as Error).message);
      throw error;
    }
  }

  private async resolveContextItem(item: { type: string; idOrQuery: string; reason: string }): Promise<ResolvedContextItem | null> {
    const isUuid = (str: string) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);
    const q = (item.idOrQuery || '').slice(0, 200);

    try {
      const base = { type: item.type, reason: item.reason, query: isUuid(q) ? '' : q, idOrQuery: q };
      switch (item.type) {
        case 'evidence': {
          if (isUuid(q)) {
            const data = await prisma.evidence.findUnique({ where: { id: q } });
            return data ? { ...base, data } : null;
          }
          return { ...base, data: await prisma.evidence.findMany({ where: { OR: [{ title: { contains: q, mode: 'insensitive' } }, { excerpt: { contains: q, mode: 'insensitive' } }] }, take: 5 }) };
        }
        case 'claim': {
          if (isUuid(q)) {
            const data = await prisma.claim.findUnique({ where: { id: q } });
            return data ? { ...base, data } : null;
          }
          return { ...base, data: await prisma.claim.findMany({ where: { text: { contains: q, mode: 'insensitive' } }, take: 5 }) };
        }
        case 'critique': {
          if (isUuid(q)) {
            const data = await prisma.critique.findUnique({ where: { id: q } });
            return data ? { ...base, data } : null;
          }
          return { ...base, data: await prisma.critique.findMany({ where: { text: { contains: q, mode: 'insensitive' } }, take: 5 }) };
        }
        case 'decision': {
          if (isUuid(q)) {
            const data = await prisma.decisionRecord.findUnique({ where: { id: q } });
            return data ? { ...base, data } : null;
          }
          return { ...base, data: await prisma.decisionRecord.findMany({ where: { decisionText: { contains: q, mode: 'insensitive' } }, take: 5 }) };
        }
        case 'raw_event': {
          if (isUuid(q)) {
            const data = await prisma.rawEvent.findUnique({ where: { id: q } });
            return data ? { ...base, data } : null;
          }
          return { ...base, data: await prisma.rawEvent.findMany({ where: { type: { contains: q, mode: 'insensitive' } }, take: 5 }) };
        }
        default:
          return null;
      }
    } catch (e) {
      logger.error('Failed to resolve context item', { item, error: (e as Error).message });
      return null;
    }
  }
}

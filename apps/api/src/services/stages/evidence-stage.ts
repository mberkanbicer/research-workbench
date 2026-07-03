import { DeliberationServices } from '../../orchestrator/services.js';
import { prisma } from '../../prisma.js';
import { RunEventService } from '../event.service.js';
import { logger } from '../../utils/logger.js';
import { knowledgeGraph } from '../knowledge-graph.service.js';
import { Claim, Evidence } from '@repo/shared';
import { z } from 'zod';
import { EvidenceAssessmentOutputSchema, EvidenceGapOutputSchema } from '../../orchestrator/prompts.schemas.js';
import { updateStage } from './stage-utils.js';
import { indexEvidenceEmbedding } from '../embedding-index.js';

type EvidenceAssessmentOutput = z.infer<typeof EvidenceAssessmentOutputSchema>;

const runEventService = new RunEventService();

export class EvidenceStage {
  constructor(private services: DeliberationServices) {}

  async performEvidenceDiscovery(runId: string, projectId: string, claims: Claim[]): Promise<Evidence[]> {
    await updateStage(runId, 'discovery', 'IN_PROGRESS');
    try {
      await runEventService.record(runId, projectId, 'phase.evidence_discovery.started', { claimCount: claims.length });

      const evidenceItems: Evidence[] = [];
      for (const claim of claims) {
        if (!claim.requiresEvidence) continue;

        const results = await this.services.search(claim.text);
        if (results.length === 0) {
          logger.warn('No search results found for claim — evidence gap', { claimId: claim.id, claimText: claim.text.substring(0, 80) });
          continue;
        }

        const items = await prisma.$transaction(async (tx) => {
          const existingUrls = new Set(
            (await tx.evidence.findMany({
              where: { projectId, sourceUrl: { not: null } },
              select: { sourceUrl: true },
            })).map((e: { sourceUrl: string | null }) => e.sourceUrl).filter(Boolean)
          );

          const newResults = results.filter(r => !existingUrls.has(r.url));
          if (newResults.length < results.length) {
            logger.info('Skipped duplicate evidence URLs', { skipped: results.length - newResults.length });
          }

          return Promise.all(newResults.map(result =>
            tx.evidence.create({
              data: {
                projectId,
                claimId: claim.id,
                title: result.title,
                sourceUrl: result.url,
                excerpt: result.snippet,
                sourceType: result.sourceType || 'unknown',
                reliability: 'pending',
                relevance: 'pending',
                status: 'pending_review',
              },
            })
          ));
        });

        evidenceItems.push(...items as Evidence[]);
        for (const item of items as Evidence[]) {
          indexEvidenceEmbedding(projectId, item.id, item.title, item.excerpt, item.summary);
        }
      }

      await runEventService.record(runId, projectId, 'phase.evidence_discovery.completed', { count: evidenceItems.length });
      await updateStage(runId, 'discovery', 'COMPLETED');
      return evidenceItems;
    } catch (error: unknown) {
      await updateStage(runId, 'discovery', 'FAILED', (error as Error).message);
      throw error;
    }
  }

  async performEvidenceAssessment(runId: string, projectId: string, evidenceItems: Evidence[], modelIds: string[]): Promise<void> {
    await updateStage(runId, 'assessment', 'IN_PROGRESS');
    try {
      await runEventService.record(runId, projectId, 'phase.evidence_assessment.started', { evidenceCount: evidenceItems.length });

      for (const evidence of evidenceItems) {
        if (!evidence.claimId) continue;
        const claim = await prisma.claim.findUnique({ where: { id: evidence.claimId } });
        if (!claim) continue;

        const assessmentResults = await Promise.allSettled(
          modelIds.map(async (modelId) => {
            const assessment = await this.services.assessEvidence(claim as Claim, evidence, evidence.excerpt || '', modelId);
            return { modelId, ...assessment };
          })
        );

        const assessments: (EvidenceAssessmentOutput & { modelId: string })[] = [];
        for (const r of assessmentResults) {
          if (r.status === 'fulfilled') assessments.push(r.value);
        }

        if (assessments.length === 0) {
          logger.error('No successful assessments for evidence, skipping', { evidenceId: evidence.id });
          continue;
        }

        const acceptCount = assessments.filter(a => a.finalVerdict === 'accept').length;
        const aggregatedVerdict = acceptCount > assessments.length / 2 ? 'accept' : 'rejected';

        const reliabilityRank: Record<string, number> = { high: 3, medium: 2, low: 1, unusable: 0 };
        const avgReliabilityScore = assessments.reduce((s, a) => s + (reliabilityRank[a.reliability] || 0), 0) / assessments.length;
        const aggregatedReliability = avgReliabilityScore >= 2.5 ? 'high' : avgReliabilityScore >= 1.5 ? 'medium' : 'low';
        const relevanceRank: Record<string, number> = { direct: 3, indirect: 2, weak: 1, irrelevant: 0 };
        const avgRelevanceScore = assessments.reduce((s, a) => s + (relevanceRank[a.relevance] || 0), 0) / assessments.length;
        const aggregatedRelevance = avgRelevanceScore >= 2.5 ? 'direct' : avgRelevanceScore >= 1.5 ? 'indirect' : 'weak';

        await prisma.$transaction(async (tx) => {
          await tx.evidenceAssessment.deleteMany({ where: { evidenceId: evidence.id } });

          for (const assessment of assessments) {
            await tx.evidenceAssessment.create({
              data: {
                evidenceId: evidence.id,
                reviewerModelId: assessment.modelId,
                reliability: assessment.reliability,
                relevance: assessment.relevance,
                interpretationVerdict: assessment.interpretationVerdict,
                detectedProblems: assessment.detectedProblems,
                notes: assessment.notes,
                finalVerdict: assessment.finalVerdict,
              },
            });
          }

          const dbStatusMap: Record<string, string> = {
            'accept': 'accepted',
            'accept_with_caution': 'accepted_with_caution',
            'accept_with_reservations': 'accepted_with_reservations',
            'reject': 'rejected',
          };
          const dbStatus = dbStatusMap[aggregatedVerdict] || 'rejected';

          await tx.evidence.update({
            where: { id: evidence.id },
            data: { reliability: aggregatedReliability, relevance: aggregatedRelevance, status: dbStatus },
          });
        });
      }

      await this.aggregateEvidenceForClaims(projectId);

      await runEventService.record(runId, projectId, 'phase.evidence_assessment.completed', { count: evidenceItems.length });
      await updateStage(runId, 'assessment', 'COMPLETED');
    } catch (error: unknown) {
      await updateStage(runId, 'assessment', 'FAILED', (error as Error).message);
      throw error;
    }
  }

  async aggregateEvidenceForClaims(projectId: string) {
    const claims = await prisma.claim.findMany({ where: { projectId } });

    for (const claim of claims) {
      if (!claim.requiresEvidence) continue;

      const evidenceList = await prisma.evidence.findMany({ where: { claimId: claim.id } });

      const supportingEvidence = evidenceList.filter(e => !e.isCounter && ['accepted', 'accepted_with_caution', 'accepted_with_reservations'].includes(e.status));
      const counterEvidence = evidenceList.filter(e => e.isCounter && ['accepted', 'accepted_with_caution', 'accepted_with_reservations'].includes(e.status));

      let status = 'unverified';
      if (counterEvidence.length > 0) {
        status = 'contradicted';
      } else if (supportingEvidence.length > 0) {
        status = supportingEvidence.some(e => e.reliability === 'high') ? 'supported' : 'partially_supported';
      } else if (evidenceList.length > 0) {
        status = 'unsupported';
      }

      await prisma.claim.update({ where: { id: claim.id }, data: { status } });

      for (const e of evidenceList) {
        await knowledgeGraph.linkEvidenceToClaim(e.id, claim.id, e.isCounter);
      }
    }
  }

  async performEvidenceGapDetection(runId: string, projectId: string, ideaVersionId: string, modelIds: string[]): Promise<{ gaps: unknown[]; overallEvidenceStrength: string; recommendation: string }> {
    await updateStage(runId, 'gap_detection', 'IN_PROGRESS');
    try {
      await runEventService.record(runId, projectId, 'phase.gap_detection.started', { ideaVersionId });

      const [claims, evidence] = await Promise.all([
        prisma.claim.findMany({ where: { ideaVersionId } }),
        prisma.evidence.findMany({ where: { projectId } }),
      ]);

      const evidenceIds = evidence.map(e => e.id);
      const assessments = await prisma.evidenceAssessment.findMany({ where: { evidenceId: { in: evidenceIds } } });

      let lastError: Error | null = null;
      for (const modelId of modelIds) {
        try {
          const result = await this.services.detectEvidenceGaps(claims as Claim[], evidence as Evidence[], assessments, modelId);

          const criticalGaps = result.gaps.filter(g => g.priority === 'critical' || g.priority === 'high');

          await runEventService.record(runId, projectId, 'phase.gap_detection.completed', {
            gapCount: result.gaps.length,
            criticalGapCount: criticalGaps.length,
            overallStrength: result.overallEvidenceStrength,
            recommendation: result.recommendation,
          });

          for (const gap of result.gaps) {
            await prisma.researchTask.deleteMany({ where: { claimId: gap.claimId, title: { startsWith: 'Evidence gap:' } } });
            await prisma.researchTask.create({
              data: {
                projectId,
                claimId: gap.claimId,
                ideaVersionId,
                title: `Evidence gap: ${gap.description}`,
                objective: gap.suggestedSearchQueries.join('; '),
                status: 'todo',
                priority: gap.priority,
                role: 'researcher',
              },
            });
          }

          await updateStage(runId, 'gap_detection', 'COMPLETED');
          return { gaps: result.gaps, overallEvidenceStrength: result.overallEvidenceStrength, recommendation: result.recommendation };
        } catch (err: unknown) {
          lastError = err instanceof Error ? err : new Error(String(err));
          logger.warn('Gap detection failed with model, trying fallback', { modelId, error: (err as Error).message });
        }
      }

      throw lastError || new Error('All models failed gap detection');
    } catch (error: unknown) {
      await updateStage(runId, 'gap_detection', 'FAILED', (error as Error).message);
      throw error;
    }
  }
}

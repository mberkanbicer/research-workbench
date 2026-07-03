import { DeliberationServices } from '../../orchestrator/services.js';
import { prisma } from '../../prisma.js';
import { RunEventService } from '../event.service.js';
import { logger } from '../../utils/logger.js';
import { Claim, Evidence } from '@repo/shared';
import { updateStage } from './stage-utils.js';
import { indexEvidenceEmbedding } from '../embedding-index.js';

const runEventService = new RunEventService();

export class AdversarialProbeStage {
  constructor(private services: DeliberationServices) {}

  async performAdversarialProbe(
    runId: string,
    projectId: string,
    ideaVersionId: string,
    claims: Claim[],
    modelIds: string[],
  ): Promise<Evidence[]> {
    await updateStage(runId, 'adversarial_probe', 'IN_PROGRESS');
    try {
      await runEventService.record(runId, projectId, 'phase.adversarial_probe.started', { claimCount: claims.length });

      const evidenceItems: Evidence[] = [];
      const existingUrls = new Set(
        (await prisma.evidence.findMany({
          where: { projectId, sourceUrl: { not: null } },
          select: { sourceUrl: true },
        })).map((e: { sourceUrl: string | null }) => e.sourceUrl).filter(Boolean)
      );

      for (const claim of claims) {
        if (!claim.requiresEvidence) continue;

        // Get existing evidence for this claim to give context to the prober
        const existingEvidence = await prisma.evidence.findMany({
          where: { claimId: claim.id },
        }) as Evidence[];

        // Use the first model for adversarial probing (not all models)
        const proberModelId = modelIds[0];
        if (!proberModelId) continue;

        let probeResult;
        try {
          probeResult = await this.services.adversarialProbe(claim, existingEvidence, proberModelId);
        } catch (err: unknown) {
          logger.warn('Adversarial probe failed for claim, skipping', {
            claimId: claim.id,
            modelId: proberModelId,
            error: (err as Error).message,
          });
          continue;
        }

        if (!probeResult.probes || probeResult.probes.length === 0) continue;

        // Execute search queries from all probes for this claim
        for (const probe of probeResult.probes) {

          for (const query of probe.searchQueries) {
            let results;
            try {
              results = await this.services.search(query);
            } catch (err: unknown) {
              logger.warn('Search failed for adversarial query', { query, error: (err as Error).message });
              continue;
            }

            // Deduplicate against existing URLs
            const newResults = results.filter(r => !existingUrls.has(r.url));

            const items = await prisma.$transaction(async (tx) => {
              return Promise.all(newResults.map(result => {
                existingUrls.add(result.url);
                return tx.evidence.create({
                  data: {
                    projectId,
                    claimId: claim.id,
                    title: `[Counter-Probe] ${result.title}`,
                    sourceUrl: result.url,
                    excerpt: result.snippet,
                    sourceType: result.sourceType || 'unknown',
                    reliability: 'pending',
                    relevance: 'pending',
                    status: 'pending_review',
                    isCounter: true,
                  },
                });
              }));
            });

            evidenceItems.push(...items as Evidence[]);
            for (const item of items as Evidence[]) {
              indexEvidenceEmbedding(projectId, item.id, item.title, item.excerpt, item.summary);
            }
          }
        }

        await runEventService.record(runId, projectId, 'phase.adversarial_probe.claim_probed', {
          claimId: claim.id,
          hypothesis: probeResult.probes[0]?.adversarialHypothesis,
          counterEvidenceFound: evidenceItems.length,
        });
      }

      await runEventService.record(runId, projectId, 'phase.adversarial_probe.completed', { count: evidenceItems.length });
      await updateStage(runId, 'adversarial_probe', 'COMPLETED');
      return evidenceItems;
    } catch (error: unknown) {
      await updateStage(runId, 'adversarial_probe', 'FAILED', (error as Error).message);
      throw error;
    }
  }
}

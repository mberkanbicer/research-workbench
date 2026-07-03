import { DeliberationServices } from '../../orchestrator/services.js';
import { prisma } from '../../prisma.js';
import { Prisma } from '@prisma/client';
import { RunEventService, EventService } from '../event.service.js';
import { logger } from '../../utils/logger.js';
import { Claim, Evidence, IdeaVersion } from '@repo/shared';
import { ConsensusVoteOutputSchema } from '../../orchestrator/prompts.schemas.js';
import { z } from 'zod';
import { updateStage } from './stage-utils.js';
import { indexDecisionEmbedding } from '../embedding-index.js';
import { ConsensusEvaluator, ConsensusResult } from '../../orchestrator/consensus-evaluator.js';

type VoteResult = z.infer<typeof ConsensusVoteOutputSchema> & { modelId: string };

const runEventService = new RunEventService();
const eventService = new EventService();

export class ConsensusStage {
  constructor(private services: DeliberationServices) {}

  async performConsensus(runId: string, projectId: string, ideaVersionId: string, modelIds: string[]): Promise<{ vote: string; votes: VoteResult[] }> {
    await updateStage(runId, 'consensus', 'IN_PROGRESS');
    try {
      await runEventService.record(runId, projectId, 'phase.consensus.started', { ideaVersionId });

      const [version, claims, evidence] = await Promise.all([
        prisma.ideaVersion.findUnique({ where: { id: ideaVersionId } }),
        prisma.claim.findMany({ where: { ideaVersionId } }),
        prisma.evidence.findMany({ where: { projectId, status: { in: ['accepted', 'accepted_with_caution', 'accepted_with_reservations'] } } }),
      ]);

      const voteResults = await Promise.allSettled(
        modelIds.map(async (modelId) => {
          const v = await this.services.voteConsensus(version as IdeaVersion, claims as Claim[], evidence as Evidence[], modelId);
          return { modelId, ...v };
        })
      );

      const votes: VoteResult[] = [];
      const failedVotes: { modelId: string; error: string }[] = [];
      for (const r of voteResults) {
        if (r.status === 'fulfilled') {
          votes.push(r.value);
        } else {
          failedVotes.push({ modelId: 'unknown', error: r.reason?.message || 'Vote failed' });
        }
      }

      // Guard: require at least one successful vote
      if (votes.length === 0) {
        const errorMsg = `All ${modelIds.length} model votes failed. Cannot reach consensus without any votes.`;
        logger.error(errorMsg, { runId, failedVotes });
        throw new Error(errorMsg);
      }

      // Log partial failures for observability
      if (failedVotes.length > 0) {
        logger.warn('Some model votes failed, proceeding with partial votes', {
          runId,
          successCount: votes.length,
          failedCount: failedVotes.length,
        });
      }

      // Use ConsensusEvaluator for formal consensus evaluation
      const evaluator = new ConsensusEvaluator();
      
      // Load critiques and claims for evaluation
      const [critiques, allClaims, allEvidence] = await Promise.all([
        prisma.critique.findMany({ where: { ideaVersionId } }),
        prisma.claim.findMany({ where: { ideaVersionId } }),
        prisma.evidence.findMany({ where: { projectId } }),
      ]);

      const consensusResult: ConsensusResult = evaluator.evaluate({
        modelVotes: votes.map(v => ({
          modelId: v.modelId,
          vote: v.vote as 'accept' | 'accept_with_reservations' | 'reject' | 'abstain' | 'needs_more_evidence',
          reason: v.reason,
        })),
        critiques: critiques.map(c => ({
          id: c.id,
          severity: c.severity as 'low' | 'medium' | 'high' | 'blocking',
          status: c.status as 'open' | 'accepted' | 'partially_accepted' | 'rejected' | 'resolved_in_revision' | 'deferred_to_test',
        })),
        claims: allClaims.map(c => ({
          id: c.id,
          criticality: c.criticality as 'low' | 'medium' | 'high' | 'blocking',
          status: c.status,
          requiresEvidence: c.requiresEvidence,
        })),
        evidence: allEvidence.map(e => ({
          id: e.id,
          claimId: e.claimId || '',
          isCounter: e.isCounter,
          status: e.status,
        })),
      });

      // Map ConsensusResult to the expected vote format
      const consensusVoteMap: Record<ConsensusResult, string> = {
        'full_consensus': 'accept',
        'qualified_consensus': 'accept_with_reservations',
        'no_consensus': 'reject',
        'needs_revision': 'reject',
        'needs_more_evidence': 'needs_more_evidence',
        'needs_external_validation': 'abstain',
      };
      let aggregatedVote = consensusVoteMap[consensusResult] || 'reject';

      logger.info('Consensus evaluation complete', {
        runId,
        consensusResult,
        aggregatedVote,
        voteCount: votes.length,
        critiqueCount: critiques.length,
      });

      await runEventService.record(runId, projectId, 'phase.consensus.completed', {
        vote: aggregatedVote,
        individualVotes: votes.map(v => ({ modelId: v.modelId, vote: v.vote })),
      });

      // ─── Evidence Quality Floor ──────────────────────────────────
      // Require >50% of claims to have accepted evidence before decision,
      // BUT only when evidence was actually found and then rejected.
      // If evidence discovery found nothing at all, the floor check is a
      // warning, not a hard block — models voted with knowledge of gaps.
      if (aggregatedVote === 'accept' || aggregatedVote === 'accept_with_reservations') {
        const claimsRequiringEvidence = allClaims.filter(c => c.requiresEvidence);
        const claimIdsRequiringEvidence = new Set(claimsRequiringEvidence.map(c => c.id));
        
        // Evidence is accepted if status is accepted, accepted_with_caution, or accepted_with_reservations
        const acceptedEvidenceStatuses = ['accepted', 'accepted_with_caution', 'accepted_with_reservations'];
        const acceptedEvidence = allEvidence.filter(e => 
          e.claimId && claimIdsRequiringEvidence.has(e.claimId) && acceptedEvidenceStatuses.includes(e.status)
        );
        const rejectedEvidence = allEvidence.filter(e =>
          e.claimId && claimIdsRequiringEvidence.has(e.claimId) && e.status === 'rejected'
        );
        
        // Count unique claims that have at least one accepted evidence
        const claimsWithAcceptedEvidence = new Set(acceptedEvidence.map(e => e.claimId));
        const supportedCount = claimsWithAcceptedEvidence.size;
        const totalRequiring = claimIdsRequiringEvidence.size;
        const supportRatio = totalRequiring > 0 ? supportedCount / totalRequiring : 1.0;
        // Check whether any evidence was rejected (as opposed to never found)
        const anyEvidenceRejected = rejectedEvidence.length > 0;
        const anyEvidenceLinked = allEvidence.some(e => e.claimId && claimIdsRequiringEvidence.has(e.claimId));

        logger.info('Evidence quality floor check', {
          runId,
          supportedCount,
          totalRequiring,
          supportRatio: Math.round(supportRatio * 100) / 100,
          threshold: 0.5,
          anyEvidenceLinked,
          anyEvidenceRejected,
        });

        // Only block when evidence was found and then rejected/insufficient.
        // If no evidence was discovered at all, the floor is informational only.
        if (totalRequiring > 0 && supportRatio < 0.5 && anyEvidenceLinked) {
          const missingCount = totalRequiring - supportedCount;
          const msg = `Evidence quality floor not met: ${supportedCount}/${totalRequiring} claims have accepted evidence (need >50%). ${missingCount} claims still need supporting evidence.`;
          logger.warn(msg, { runId, supportRatio });
          await runEventService.record(runId, projectId, 'phase.consensus.evidence_floor_failed', {
            supportedCount,
            totalRequiring,
            supportRatio,
          });
          // Override vote to needs_more_evidence instead of allowing decision
          aggregatedVote = 'needs_more_evidence';
        } else if (totalRequiring > 0 && supportRatio < 0.5 && !anyEvidenceLinked) {
          // No evidence discovered at all — log warning but do not block
          logger.warn('No evidence discovered for claims — consensus proceeds anyway since models voted with full knowledge', {
            runId,
            supportedCount,
            totalRequiring,
            supportRatio: Math.round(supportRatio * 100) / 100,
          });
          await runEventService.record(runId, projectId, 'phase.consensus.evidence_gap_noted', {
            supportedCount,
            totalRequiring,
            supportRatio,
            vote: aggregatedVote,
          });
        }
      }

      if (aggregatedVote === 'accept' || aggregatedVote === 'accept_with_reservations') {
        let decision: unknown;
        let lastError: Error | null = null;

        for (const modelId of modelIds) {
          try {
            decision = await this.services.generateDecision(version as IdeaVersion, votes, claims as Claim[], evidence as Evidence[], modelId);
            break;
          } catch (err: unknown) {
            lastError = err instanceof Error ? err : new Error(String(err));
            logger.warn('Failed to generate decision with model, trying fallback', { modelId, error: (err as Error).message });
          }
        }

        if (!decision) throw lastError || new Error('All models failed to generate decision');

        const d = decision as Record<string, unknown>;
        await eventService.recordDecisionCreated(projectId, {
          ideaVersionId, decisionStatus: d.decisionStatus,
          votes: votes.map(v => ({ modelId: v.modelId, vote: v.vote })),
        }, 'system');

        await prisma.$transaction(async (tx) => {
          await tx.decisionRecord.deleteMany({ where: { ideaVersionId } });
          const createdDecision = await tx.decisionRecord.create({
            data: {
              projectId, ideaVersionId,
              decisionStatus: d.decisionStatus as string,
              decisionText: d.decisionText as string,
              whyGood: d.whyGood as Prisma.InputJsonValue,
              whyBad: d.whyBad as Prisma.InputJsonValue,
              knownWeaknesses: d.knownWeaknesses as Prisma.InputJsonValue,
              acceptedEvidenceIds: d.acceptedEvidenceIds as Prisma.InputJsonValue,
              counterEvidenceIds: d.counterEvidenceIds as Prisma.InputJsonValue,
              resolvedCritiqueIds: d.resolvedCritiqueIds as Prisma.InputJsonValue,
              unresolvedRisks: d.unresolvedRisks as Prisma.InputJsonValue,
              modelFinalVotes: d.modelFinalVotes as Prisma.InputJsonValue,
              reopenConditions: d.reopenConditions as Prisma.InputJsonValue,
              nextActions: d.nextActions as Prisma.InputJsonValue,
            },
          });
          await eventService.recordConsensusChecked(projectId, { vote: aggregatedVote, individualVotes: votes.map(v => ({ modelId: v.modelId, vote: v.vote })) }, 'system');
          await updateStage(runId, 'consensus', 'COMPLETED', undefined, tx);
          const text = [d.decisionText, ...(d.whyGood as string[] || []), ...(d.whyBad as string[] || [])].filter(Boolean).join('\n');
          indexDecisionEmbedding(projectId, createdDecision.id, text);
        });
      } else {
        await eventService.recordConsensusChecked(projectId, { vote: aggregatedVote, individualVotes: votes.map(v => ({ modelId: v.modelId, vote: v.vote })) }, 'system');
        await updateStage(runId, 'consensus', 'COMPLETED');
      }

      return { vote: aggregatedVote, votes };
    } catch (error: unknown) {
      await updateStage(runId, 'consensus', 'FAILED', (error as Error).message);
      throw error;
    }
  }
}

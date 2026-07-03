/**
 * ConsensusEvaluator — implements the full consensus algorithm from the spec.
 *
 * Rules (from docs/04-orchestration-workflow.md and docs/07-testing-plan.md):
 * 1. Any unresolved blocking critique -> needs_revision
 * 2. Any unsupported critical claim -> needs_more_evidence
 * 3. Any model vote 'reject' -> no_consensus or needs_revision depending on reason
 * 4. Any model vote 'needs_more_evidence' -> needs_more_evidence
 * 5. All 'accept' -> full_consensus
 * 6. All 'accept' or 'accept_with_reservations' -> qualified_consensus
 * 7. Rejected evidence used by critical claim -> needs_revision
 * 8. If models cannot judge -> needs_external_validation
 */

export type ConsensusResult =
  | 'full_consensus'
  | 'qualified_consensus'
  | 'no_consensus'
  | 'needs_revision'
  | 'needs_more_evidence'
  | 'needs_external_validation';

export interface ModelVoteInput {
  modelId: string;
  vote: 'accept' | 'accept_with_reservations' | 'reject' | 'abstain' | 'needs_more_evidence';
  reason?: string;
}

export interface CritiqueInput {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'blocking';
  status: 'open' | 'accepted' | 'partially_accepted' | 'rejected' | 'resolved_in_revision' | 'deferred_to_test';
}

export interface ClaimInput {
  id: string;
  criticality: 'low' | 'medium' | 'high' | 'blocking';
  status: string;
  requiresEvidence: boolean;
}

export interface EvidenceInput {
  id: string;
  claimId: string;
  isCounter: boolean;
  status: string;
}

export interface ConsensusEvaluationInput {
  modelVotes: ModelVoteInput[];
  critiques: CritiqueInput[];
  claims: ClaimInput[];
  evidence: EvidenceInput[];
}

export class ConsensusEvaluator {
  /**
   * Evaluate consensus given model votes, critiques, claims, and evidence.
   * Returns the consensus result enum.
   */
  evaluate(input: ConsensusEvaluationInput): ConsensusResult {
    const { modelVotes, critiques, claims, evidence } = input;

    // Rule 1: Any unresolved blocking critique -> needs_revision
    const unresolvedBlockingCritiques = critiques.filter(
      c => c.severity === 'blocking' && c.status === 'open'
    );
    if (unresolvedBlockingCritiques.length > 0) {
      return 'needs_revision';
    }

    // Rule 7: Rejected evidence used by critical claim -> needs_revision
    const criticalClaims = claims.filter(c => c.criticality === 'blocking' || c.criticality === 'high');
    for (const claim of criticalClaims) {
      const claimEvidence = evidence.filter(e => e.claimId === claim.id);
      const hasRejectedSupport = claimEvidence.some(
        e => !e.isCounter && (e.status === 'rejected' || e.status === 'irrelevant')
      );
      if (hasRejectedSupport && claim.status !== 'supported') {
        return 'needs_revision';
      }
    }

    // Rule 2: Unsupported blocking claim -> needs_more_evidence
    const blockingClaimsMissingEvidence = claims.filter(
      c => c.criticality === 'blocking' && c.requiresEvidence && c.status === 'unverified'
    );
    if (blockingClaimsMissingEvidence.length > 0) {
      return 'needs_more_evidence';
    }

    // Rule 8: Empty votes -> no_consensus
    if (modelVotes.length === 0) {
      return 'no_consensus';
    }

    // Rules 3-4: Check individual votes — reject takes priority over needs_more_evidence
    const hasRejectVote = modelVotes.some(v => v.vote === 'reject');
    const hasNeedMoreEvidence = modelVotes.some(v => v.vote === 'needs_more_evidence');
    const hasAbstain = modelVotes.some(v => v.vote === 'abstain');
    const allAccept = modelVotes.every(v => v.vote === 'accept');
    const allAcceptOrReserved = modelVotes.every(
      v => v.vote === 'accept' || v.vote === 'accept_with_reservations'
    );

    // Rule 3: Any reject -> no_consensus
    if (hasRejectVote) {
      return 'no_consensus';
    }

    // Rule 4: Any needs_more_evidence -> needs_more_evidence
    if (hasNeedMoreEvidence) {
      return 'needs_more_evidence';
    }

    // Rule 8: All abstain -> needs_external_validation
    if (hasAbstain && modelVotes.every(v => v.vote === 'abstain')) {
      return 'needs_external_validation';
    }

    // Rule 5: All accept -> full_consensus
    if (allAccept) {
      return 'full_consensus';
    }

    // Rule 6: All accept or accept_with_reservations -> qualified_consensus
    if (allAcceptOrReserved) {
      return 'qualified_consensus';
    }

    // Default: mixed votes that don't fit other categories -> no_consensus
    return 'no_consensus';
  }

  /**
   * Aggregate raw model votes using the simple majority approach
   * (matching the current orchestrator implementation).
   */
  aggregateVotes(votes: ModelVoteInput[]): string {
    if (votes.length === 0) return 'no_consensus';

    const acceptTypes = ['accept', 'accept_with_reservations'];
    const acceptCount = votes.filter(v => acceptTypes.includes(v.vote)).length;
    const rejectCount = votes.filter(v => v.vote === 'reject').length;
    const needEvidence = votes.filter(v => v.vote === 'needs_more_evidence').length;

    if (acceptCount >= votes.length / 2) {
      return 'accept_with_reservations';
    } else if (needEvidence >= votes.length / 2) {
      return 'needs_more_evidence';
    } else {
      return 'reject';
    }
  }
}

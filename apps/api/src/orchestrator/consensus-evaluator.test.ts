import { describe, it, expect } from 'vitest';
import { ConsensusEvaluator, ConsensusEvaluationInput, ModelVoteInput } from './consensus-evaluator.js';

const evaluator = new ConsensusEvaluator();

// ─── Helper factories ──────────────────────────────────────────────────────

function votes(...vs: ModelVoteInput['vote'][]): ModelVoteInput[] {
  return vs.map((vote, i) => ({ modelId: `model-${i + 1}`, vote }));
}

function emptyInput(overrides: Partial<ConsensusEvaluationInput> = {}): ConsensusEvaluationInput {
  return {
    modelVotes: [],
    critiques: [],
    claims: [],
    evidence: [],
    ...overrides,
  };
}

// ===========================================================================
// Test 1: All accept -> full_consensus
// ===========================================================================
describe('ConsensusEvaluator', () => {
  it('all accept -> full_consensus', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('accept', 'accept', 'accept'),
    }));
    expect(result).toBe('full_consensus');
  });

  // =========================================================================
  // Test 2: All accept or accept_with_reservations -> qualified_consensus
  // =========================================================================
  it('all accept or accept_with_reservations -> qualified_consensus', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('accept', 'accept_with_reservations', 'accept'),
    }));
    expect(result).toBe('qualified_consensus');
  });

  it('all accept_with_reservations -> qualified_consensus', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('accept_with_reservations', 'accept_with_reservations'),
    }));
    expect(result).toBe('qualified_consensus');
  });

  // =========================================================================
  // Test 3: One reject -> no_consensus
  // =========================================================================
  it('one reject -> no_consensus', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('accept', 'accept', 'reject'),
    }));
    expect(result).toBe('no_consensus');
  });

  it('single model rejects -> no_consensus', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('reject'),
    }));
    expect(result).toBe('no_consensus');
  });

  // =========================================================================
  // Test 4: One needs_more_evidence -> needs_more_evidence
  // =========================================================================
  it('one needs_more_evidence -> needs_more_evidence', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('accept', 'accept', 'needs_more_evidence'),
    }));
    expect(result).toBe('needs_more_evidence');
  });

  it('all needs_more_evidence -> needs_more_evidence', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('needs_more_evidence', 'needs_more_evidence'),
    }));
    expect(result).toBe('needs_more_evidence');
  });

  // =========================================================================
  // Test 5: Unresolved blocking critique -> needs_revision
  // =========================================================================
  it('unresolved blocking critique -> needs_revision', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('accept', 'accept', 'accept'),
      critiques: [
        { id: 'c1', severity: 'blocking', status: 'open' },
      ],
    }));
    expect(result).toBe('needs_revision');
  });

  it('resolved blocking critique does not block consensus', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('accept', 'accept', 'accept'),
      critiques: [
        { id: 'c1', severity: 'blocking', status: 'accepted' },
      ],
    }));
    expect(result).toBe('full_consensus');
  });

  it('low-severity open critique does not block consensus', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('accept', 'accept', 'accept'),
      critiques: [
        { id: 'c1', severity: 'low', status: 'open' },
      ],
    }));
    expect(result).toBe('full_consensus');
  });

  // =========================================================================
  // Test 6: Unsupported blocking claim -> needs_more_evidence
  // =========================================================================
  it('unsupported blocking claim -> needs_more_evidence', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('accept', 'accept', 'accept'),
      claims: [
        { id: 'cl1', criticality: 'blocking', status: 'unverified', requiresEvidence: true },
      ],
    }));
    expect(result).toBe('needs_more_evidence');
  });

  it('supported blocking claim does not block consensus', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('accept', 'accept', 'accept'),
      claims: [
        { id: 'cl1', criticality: 'blocking', status: 'supported', requiresEvidence: true },
      ],
    }));
    expect(result).toBe('full_consensus');
  });

  it('non-blocking unverified claim does not force needs_more_evidence', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('accept', 'accept', 'accept'),
      claims: [
        { id: 'cl1', criticality: 'low', status: 'unverified', requiresEvidence: true },
      ],
    }));
    expect(result).toBe('full_consensus');
  });

  // =========================================================================
  // Test 7: Rejected evidence used by critical claim -> needs_revision
  // =========================================================================
  it('rejected supporting evidence for critical claim -> needs_revision', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('accept', 'accept', 'accept'),
      claims: [
        { id: 'cl1', criticality: 'high', status: 'unverified', requiresEvidence: true },
      ],
      evidence: [
        { id: 'ev1', claimId: 'cl1', isCounter: false, status: 'rejected' },
      ],
    }));
    expect(result).toBe('needs_revision');
  });

  it('accepted evidence for critical claim does not force revision', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('accept', 'accept', 'accept'),
      claims: [
        { id: 'cl1', criticality: 'blocking', status: 'supported', requiresEvidence: true },
      ],
      evidence: [
        { id: 'ev1', claimId: 'cl1', isCounter: false, status: 'accepted' },
      ],
    }));
    expect(result).toBe('full_consensus');
  });

  // =========================================================================
  // Test 8: Mixed votes and edge cases
  // =========================================================================
  it('all abstain -> needs_external_validation', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('abstain', 'abstain', 'abstain'),
    }));
    expect(result).toBe('needs_external_validation');
  });

  it('empty votes -> no_consensus', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: [],
    }));
    expect(result).toBe('no_consensus');
  });

  it('reject + need more evidence -> no_consensus (reject takes priority)', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('reject', 'needs_more_evidence', 'accept'),
    }));
    expect(result).toBe('no_consensus');
  });

  it('blocking critique takes priority over all-accept votes', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('accept', 'accept', 'accept'),
      critiques: [
        { id: 'c1', severity: 'blocking', status: 'open' },
      ],
      claims: [
        { id: 'cl1', criticality: 'blocking', status: 'supported', requiresEvidence: true },
      ],
    }));
    // Blocking critique rule fires first -> needs_revision
    expect(result).toBe('needs_revision');
  });

  it('unsupported blocking claim takes priority over all-accept', () => {
    const result = evaluator.evaluate(emptyInput({
      modelVotes: votes('accept', 'accept', 'accept'),
      claims: [
        { id: 'cl1', criticality: 'blocking', status: 'unverified', requiresEvidence: true },
      ],
    }));
    expect(result).toBe('needs_more_evidence');
  });
});

// ===========================================================================
// aggregateVotes tests (mirrors the orchestrator's current logic)
// ===========================================================================
describe('aggregateVotes', () => {
  it('majority accept -> accept_with_reservations', () => {
    expect(evaluator.aggregateVotes(votes('accept', 'accept', 'reject'))).toBe('accept_with_reservations');
  });

  it('majority needs_more_evidence -> needs_more_evidence', () => {
    expect(evaluator.aggregateVotes(votes('accept', 'needs_more_evidence', 'needs_more_evidence'))).toBe('needs_more_evidence');
  });

  it('majority reject -> reject', () => {
    expect(evaluator.aggregateVotes(votes('reject', 'reject', 'accept'))).toBe('reject');
  });

  it('empty votes -> no_consensus', () => {
    expect(evaluator.aggregateVotes([])).toBe('no_consensus');
  });

  it('tie (50/50) -> accept_with_reservations', () => {
    expect(evaluator.aggregateVotes(votes('accept_with_reservations', 'reject'))).toBe('accept_with_reservations');
  });
});

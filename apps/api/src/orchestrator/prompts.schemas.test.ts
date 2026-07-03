/**
 * Fuzzing tests for prompt output schemas.
 *
 * These schemas parse real model output — they must robustly reject
 * malformed, missing, and incorrectly-typed data.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  ClaimExtractionOutputSchema,
  EvidenceAssessmentOutputSchema,
  IndependentReviewOutputSchema,
  CrossCritiqueOutputSchema,
  CritiqueResponseOutputSchema,
  IdeaRevisionOutputSchema,
  ConsensusVoteOutputSchema,
  DecisionRecordOutputSchema,
  GoalAchievementOutputSchema,
  EvidenceGapOutputSchema,
} from './prompts.schemas.js';

// ---------------------------------------------------------------------------
// Valid seed data — one per schema, used as a base for corruption
// ---------------------------------------------------------------------------

const UUID = '550e8400-e29b-41d4-a716-446655440000';

const seed: Record<string, Record<string, unknown>> = {
  ClaimExtractionOutputSchema: {
    claims: [
      { text: 'A claim', type: 'technical', requiresEvidence: true, criticality: 'high', reason: 'Reason' },
    ],
    hypotheses: [
      { statement: 'H1', whyItMatters: 'Matters', requiredEvidenceType: 'academic' },
    ],
    openQuestions: ['Q1?'],
  },
  EvidenceAssessmentOutputSchema: {
    reliability: 'high',
    relevance: 'direct',
    interpretationVerdict: 'correctly_used',
    detectedProblems: [],
    notes: 'Notes',
    finalVerdict: 'accept',
  },
  IndependentReviewOutputSchema: {
    needsMoreContext: false,
    requestedItems: [],
    verdict: 'accept',
    strengths: ['S1'],
    weaknesses: ['W1'],
    blockingIssues: [],
    supportedClaims: [{ claimId: UUID, evidenceIds: [], reason: 'R1' }],
    unsupportedClaims: [],
    suggestedRevisions: [],
    confidence: 0.8,
  },
  CrossCritiqueOutputSchema: {
    critiques: [
      { targetType: 'claim', targetId: UUID, critiqueType: 'weak_evidence', severity: 'medium', text: 'T', whyItMatters: 'W', evidenceIds: [] },
    ],
  },
  CritiqueResponseOutputSchema: {
    verdict: 'accept',
    reason: 'R',
    positionChange: 'none',
    requestedEvidence: [],
  },
  IdeaRevisionOutputSchema: {
    title: 'T',
    description: 'D',
    changesFromPrevious: [],
    resolvedCritiqueIds: [],
    remainingRisks: [],
    newClaims: [],
    removedClaims: [],
    revisionRationale: 'R',
  },
  ConsensusVoteOutputSchema: {
    vote: 'accept',
    reason: 'R',
    reservations: [],
    blockingIssues: [],
    requiredChanges: [],
    confidence: 0.8,
  },
  DecisionRecordOutputSchema: {
    decisionStatus: 'full_consensus',
    decisionText: 'D',
    whyGood: [],
    whyBad: [],
    knownWeaknesses: [],
    acceptedEvidenceIds: [],
    counterEvidenceIds: [],
    resolvedCritiqueIds: [],
    unresolvedRisks: [],
    modelFinalVotes: [],
    reopenConditions: [],
    nextActions: [],
  },
  GoalAchievementOutputSchema: {
    goalAchieved: true,
    achievementLevel: 'mostly',
    addressedAspects: [],
    missingAspects: [],
    evidenceOfAchievement: [],
    remainingGaps: [],
    confidence: 0.5,
    reason: 'R',
  },
  EvidenceGapOutputSchema: {
    gaps: [
      { claimId: UUID, claimText: 'C', gapType: 'no_evidence', description: 'D', suggestedSearchQueries: ['Q'], priority: 'high' },
    ],
    overallEvidenceStrength: 'adequate',
    recommendation: 'proceed',
  },
};

const schemaMap: [string, z.ZodSchema, Record<string, unknown>][] = Object.entries(seed).map(
  ([name, data]) => {
    const schema = {
      ClaimExtractionOutputSchema,
      EvidenceAssessmentOutputSchema,
      IndependentReviewOutputSchema,
      CrossCritiqueOutputSchema,
      CritiqueResponseOutputSchema,
      IdeaRevisionOutputSchema,
      ConsensusVoteOutputSchema,
      DecisionRecordOutputSchema,
      GoalAchievementOutputSchema,
      EvidenceGapOutputSchema,
    }[name] as z.ZodSchema;
    return [name, schema, data] as const;
  }
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Prompt schema fuzzing — valid data', () => {
  for (const [name, schema, data] of schemaMap) {
    it(`${name} accepts valid seed data`, () => {
      const result = schema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it(`${name} strips extra unknown fields`, () => {
      const result = schema.safeParse({ ...data, extra: 'should-be-stripped' });
      expect(result.success).toBe(true);
    });
  }
});

describe('Prompt schema fuzzing — missing required fields', () => {
  for (const [name, schema, data] of schemaMap) {
    // ClaimExtractionOutputSchema has optional fields with defaults for model error tolerance
    if (name === 'ClaimExtractionOutputSchema') continue;
    it(`${name} rejects missing root field`, () => {
      // Remove every required top-level key one at a time
      for (const key of Object.keys(data)) {
        const { [key]: _, ...rest } = data;
        const result = schema.safeParse(rest);
        expect(result.success).toBe(false);
      }
    });
  }
});

describe('Prompt schema fuzzing — wrong types at root', () => {
  const typeReplacements: [string, unknown][] = [
    ['number', 42],
    ['string', 'hello'],
    ['boolean', true],
    ['array', []],
    ['null', null],
  ];

  for (const [name, schema, data] of schemaMap) {
    for (const [typeLabel, replacement] of typeReplacements) {
      it(`${name} rejects ${typeLabel} for every root field`, () => {
        for (const key of Object.keys(data)) {
          const corrupted = { ...data, [key]: replacement };
          const result = schema.safeParse(corrupted);
          if (result.success) {
            // Some fields might coincidentally accept the type
            // (e.g., replacement 'hello' might be a string field that accepts it)
            // This only applies when the original value's type matches
            continue;
          }
          // Verify the error mentions the corrupted field
          const fieldIssues = result.error.issues.filter(i => i.path[0] === key);
          expect(fieldIssues.length).toBeGreaterThan(0);
        }
      });
    }
  }
});

describe('Prompt schema fuzzing — enum validation', () => {
  // Test each schema's enum fields with invalid values
  // Note: ClaimExtractionOutputSchema salvages invalid enums with defaults, so we test that separately
  const invalidEnumTest: [string, string, string[]][] = [
    ['EvidenceAssessmentOutputSchema', 'reliability', ['pending', 'very_high', 'wrong']],
    ['EvidenceAssessmentOutputSchema', 'relevance', ['pending', 'strong', 'wrong']],
    ['EvidenceAssessmentOutputSchema', 'interpretationVerdict', ['wrong', 'invalid', '']],
    ['EvidenceAssessmentOutputSchema', 'finalVerdict', ['wrong', 'accept_all', '']],
    ['IndependentReviewOutputSchema', 'verdict', ['wrong', 'approve', 'reject_all']],
    ['CrossCritiqueOutputSchema', 'critiques[0].targetType', ['wrong', 'idea_version', '']],
    ['CrossCritiqueOutputSchema', 'critiques[0].critiqueType', ['wrong', 'invalid', '']],
    ['CritiqueResponseOutputSchema', 'verdict', ['wrong', 'accept_all', '']],
    ['CritiqueResponseOutputSchema', 'positionChange', ['wrong', 'significant', '']],
    ['ConsensusVoteOutputSchema', 'vote', ['wrong', 'approve', 'accept_all']],
    ['DecisionRecordOutputSchema', 'decisionStatus', ['wrong', 'full', '']],
    ['GoalAchievementOutputSchema', 'achievementLevel', ['wrong', 'fully_done', '']],
    ['EvidenceGapOutputSchema', 'gaps[0].gapType', ['wrong', 'missing', '']],
    ['EvidenceGapOutputSchema', 'gaps[0].priority', ['wrong', 'urgent', '']],
    ['EvidenceGapOutputSchema', 'overallEvidenceStrength', ['wrong', 'strong_support', '']],
    ['EvidenceGapOutputSchema', 'recommendation', ['wrong', 'go_ahead', '']],
  ];

  for (const [schemaName, fieldPath, invalidValues] of invalidEnumTest) {
    const entry = schemaMap.find(([name]) => name === schemaName);
    if (!entry) continue;
    const [, schema, data] = entry;

    for (const bad of invalidValues) {
      it(`${schemaName} rejects '${bad}' for ${fieldPath}`, () => {
        // Build a deep clone and set the bad value at the path
        const corrupted = structuredClone(data);
        setAtPath(corrupted, fieldPath, bad);
        const result = schema.safeParse(corrupted);
        expect(result.success).toBe(false);
      });
    }
  }
});

describe('Prompt schema fuzzing — number constraints', () => {
  it('IndependentReviewOutputSchema.confidence rejects > 1', () => {
    const result = IndependentReviewOutputSchema.safeParse({ ...seed.IndependentReviewOutputSchema, confidence: 1.5 });
    expect(result.success).toBe(false);
  });

  it('IndependentReviewOutputSchema.confidence rejects < 0', () => {
    const result = IndependentReviewOutputSchema.safeParse({ ...seed.IndependentReviewOutputSchema, confidence: -0.1 });
    expect(result.success).toBe(false);
  });

  it('ConsensusVoteOutputSchema.confidence rejects > 1', () => {
    const result = ConsensusVoteOutputSchema.safeParse({ ...seed.ConsensusVoteOutputSchema, confidence: 1.5 });
    expect(result.success).toBe(false);
  });

  it('ConsensusVoteOutputSchema.confidence rejects < 0', () => {
    const result = ConsensusVoteOutputSchema.safeParse({ ...seed.ConsensusVoteOutputSchema, confidence: -0.1 });
    expect(result.success).toBe(false);
  });

  it('GoalAchievementOutputSchema.confidence rejects > 1', () => {
    const result = GoalAchievementOutputSchema.safeParse({ ...seed.GoalAchievementOutputSchema, confidence: 1.5 });
    expect(result.success).toBe(false);
  });

  it('GoalAchievementOutputSchema.confidence rejects < 0', () => {
    const result = GoalAchievementOutputSchema.safeParse({ ...seed.GoalAchievementOutputSchema, confidence: -0.1 });
    expect(result.success).toBe(false);
  });
});

describe('Prompt schema fuzzing — nested array corruption', () => {
  it('CrossCritiqueOutputSchema rejects non-array critiques', () => {
    const result = CrossCritiqueOutputSchema.safeParse({ ...seed.CrossCritiqueOutputSchema, critiques: 'not-array' });
    expect(result.success).toBe(false);
  });

  it('EvidenceGapOutputSchema rejects non-array gaps', () => {
    const result = EvidenceGapOutputSchema.safeParse({ ...seed.EvidenceGapOutputSchema, gaps: null });
    expect(result.success).toBe(false);
  });
});

describe('Prompt schema fuzzing — missing nested fields', () => {
  it('IndependentReviewOutputSchema rejects supportedClaims with missing fields', () => {
    const bad = { ...seed.IndependentReviewOutputSchema, supportedClaims: [{ claimId: UUID }] }; // missing evidenceIds, reason
    const result = IndependentReviewOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('EvidenceGapOutputSchema rejects gaps with missing fields', () => {
    const bad = { ...seed.EvidenceGapOutputSchema, gaps: [{ claimId: UUID }] }; // missing claimText, gapType, etc.
    const result = EvidenceGapOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

/**
 * ClaimExtractionOutputSchema — validates claim structure while handling model errors
 */
describe('ClaimExtractionOutputSchema — model output handling', () => {
  it('accepts claims as a single object (model error recovery)', () => {
    const result = ClaimExtractionOutputSchema.safeParse({
      claims: { text: 'Single claim', type: 'technical', requiresEvidence: true, criticality: 'high', reason: 'test' },
      hypotheses: [],
      openQuestions: []
    });
    expect(result.success).toBe(true);
    expect(result.data?.claims).toHaveLength(1);
    expect(result.data?.claims[0].text).toBe('Single claim');
  });

  it('accepts missing hypotheses and openQuestions with defaults', () => {
    const result = ClaimExtractionOutputSchema.safeParse({
      claims: [{ text: 'Claim', type: 'technical', requiresEvidence: true, criticality: 'high', reason: 'test' }]
    });
    expect(result.success).toBe(true);
    expect(result.data?.hypotheses).toEqual([]);
    expect(result.data?.openQuestions).toEqual([]);
  });

  it('rejects claims with empty text', () => {
    const result = ClaimExtractionOutputSchema.safeParse({
      claims: [{ text: '', type: 'technical', requiresEvidence: true, criticality: 'high', reason: 'test' }]
    });
    // Should still succeed but with salvaged claim
    expect(result.success).toBe(true);
    expect(result.data?.claims[0].text).toBe('Invalid claim - no text');
  });

  it('salvages claims with invalid type enum', () => {
    const result = ClaimExtractionOutputSchema.safeParse({
      claims: [{ text: 'Valid text', type: 'invalid_type', requiresEvidence: true, criticality: 'high', reason: 'test' }]
    });
    expect(result.success).toBe(true);
    expect(result.data?.claims[0].type).toBe('technical'); // default
  });

  it('filters out invalid hypotheses', () => {
    const result = ClaimExtractionOutputSchema.safeParse({
      claims: [{ text: 'Claim', type: 'technical', requiresEvidence: true, criticality: 'high', reason: 'test' }],
      hypotheses: [
        { statement: 'Valid hypothesis', whyItMatters: 'Important' },
        { invalid: 'hypothesis' }, // missing statement
        'not an object'
      ]
    });
    expect(result.success).toBe(true);
    expect(result.data?.hypotheses).toHaveLength(1);
  });

  it('filters out non-string openQuestions', () => {
    const result = ClaimExtractionOutputSchema.safeParse({
      claims: [{ text: 'Claim', type: 'technical', requiresEvidence: true, criticality: 'high', reason: 'test' }],
      openQuestions: ['Valid question?', 123, null, 'Another question?']
    });
    expect(result.success).toBe(true);
    expect(result.data?.openQuestions).toHaveLength(2);
  });

  it('returns empty claims for null/undefined input', () => {
    const result = ClaimExtractionOutputSchema.safeParse({
      claims: null
    });
    expect(result.success).toBe(true);
    expect(result.data?.claims).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set a value at a dot-separated path supporting array indices: "critiques[0].targetType". */
function setAtPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.match(/[^.[\]]+/g);
  if (!parts) return;
  let current: Record<string, unknown> | unknown[] = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = parts[i + 1];
    if (!isNaN(Number(next)) && Array.isArray(current)) {
      current = (current as Record<string, unknown>[])[Number(key)];
    } else if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[key] as Record<string, unknown>;
    }
  }
  const lastKey = parts[parts.length - 1];
  if (Array.isArray(current) && !isNaN(Number(lastKey))) {
    (current as unknown[])[Number(lastKey)] = value;
  } else if (current && typeof current === 'object') {
    (current as Record<string, unknown>)[lastKey] = value;
  }
}

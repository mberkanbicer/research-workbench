/**
 * Fixture-based integration tests.
 *
 * These tests load realistic model output from fixture files and verify that
 * the schemas, pipeline stages, and output analysis handle them correctly.
 * Unlike the orchestrator.test.ts (which mocks Prisma entirely), this file
 * tests the actual schema parsing of realistic and malformed model outputs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ClaimExtractionOutputSchema,
  IndependentReviewOutputSchema,
  CrossCritiqueOutputSchema,
  CritiqueResponseOutputSchema,
  ConsensusVoteOutputSchema,
  GoalAchievementOutputSchema,
  EvidenceGapOutputSchema,
  DecisionRecordOutputSchema,
} from '../orchestrator/prompts.schemas.js';

const FIXTURES_DIR = join(process.cwd(), 'src/__fixtures__/model-output');

function loadFixture(name: string): unknown {
  const path = join(FIXTURES_DIR, name);
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw);
}

// ===========================================================================
// Schema parsing with realistic fixtures
// ===========================================================================

describe('Fixture-based schema parsing', () => {

  // -------------------------------------------------------------------------
  // Extraction schemas
  // -------------------------------------------------------------------------
  describe('ClaimExtractionOutputSchema', () => {
    it('parses valid extraction output correctly', () => {
      const data = loadFixture('extraction-valid.json');
      const result = ClaimExtractionOutputSchema.parse(data);
      expect(result.claims).toHaveLength(5);
      expect(result.claims[0].text).toContain('Multi-model deliberation');
      expect(result.claims[0].type).toBe('research');
      expect(result.claims[0].criticality).toBe('high');
      expect(result.claims[0].requiresEvidence).toBe(true);
      expect(result.hypotheses).toHaveLength(2);
      expect(result.openQuestions).toHaveLength(3);
    });

    it('salvages malformed extraction output with missing text', () => {
      const data = loadFixture('extraction-malformed.json');
      const result = ClaimExtractionOutputSchema.parse(data);
      // First claim has no text — should be salvaged with default
      expect(result.claims).toHaveLength(3);
      expect(result.claims[0].text).toBe('Invalid claim - no text');
      expect(result.claims[0].type).toBe('research');
      expect(result.claims[0].criticality).toBe('high');
      expect(result.claims[0].requiresEvidence).toBe(true);
      // Second claim has empty text, null type, invalid criticality — salvaged
      expect(result.claims[1].text).toBe('Invalid claim - no text');
      expect(result.claims[1].type).toBe('technical'); // default
      expect(result.claims[1].criticality).toBe('medium'); // default
      expect(result.claims[1].requiresEvidence).toBe(true); // default for non-boolean
      // Third claim is valid
      expect(result.claims[2].text).toBe('Valid claim with partial neighbors');
      // Null hypotheses becomes empty array
      expect(result.hypotheses).toEqual([]);
      // Non-array openQuestions becomes empty array
      expect(result.openQuestions).toEqual([]);
    });

    it('handles single claim object instead of array', () => {
      const data = loadFixture('extraction-single-object.json');
      const result = ClaimExtractionOutputSchema.parse(data);
      // Schema wraps single object into array
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].text).toBe('Single claim delivered as object instead of array.');
      expect(result.hypotheses).toHaveLength(1);
      expect(result.openQuestions).toHaveLength(1);
    });

    it('handles empty extraction gracefully', () => {
      const result = ClaimExtractionOutputSchema.parse({ claims: [], hypotheses: [], openQuestions: [] });
      expect(result.claims).toEqual([]);
      expect(result.hypotheses).toEqual([]);
      expect(result.openQuestions).toEqual([]);
    });

    it('handles completely missing extraction fields', () => {
      const result = ClaimExtractionOutputSchema.parse({});
      expect(result.claims).toEqual([]);
      expect(result.hypotheses).toEqual([]);
      expect(result.openQuestions).toEqual([]);
    });

    it('handles null extraction gracefully', () => {
      const result = ClaimExtractionOutputSchema.parse({ claims: null, hypotheses: null, openQuestions: null });
      expect(result.claims).toEqual([]);
      expect(result.hypotheses).toEqual([]);
      expect(result.openQuestions).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Review schemas
  // -------------------------------------------------------------------------
  describe('IndependentReviewOutputSchema', () => {
    it('parses valid review output correctly', () => {
      const data = loadFixture('review-valid.json');
      const result = IndependentReviewOutputSchema.parse(data);
      expect(result.verdict).toBe('accept_with_reservations');
      expect(result.strengths).toHaveLength(3);
      expect(result.weaknesses).toHaveLength(2);
      expect(result.confidence).toBe(0.7);
      expect(result.supportedClaims).toHaveLength(1);
      expect(result.unsupportedClaims).toHaveLength(1);
    });

    it('rejects review with invalid verdict', () => {
      const data = loadFixture('review-valid.json');
      (data as any).verdict = 'invalid_verdict';
      expect(() => IndependentReviewOutputSchema.parse(data)).toThrow();
    });

    it('rejects review with out-of-range confidence', () => {
      const data = loadFixture('review-valid.json');
      (data as any).confidence = 1.5;
      expect(() => IndependentReviewOutputSchema.parse(data)).toThrow();
    });

    it('rejects review with negative confidence', () => {
      const data = loadFixture('review-valid.json');
      (data as any).confidence = -0.1;
      expect(() => IndependentReviewOutputSchema.parse(data)).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Critique schemas
  // -------------------------------------------------------------------------
  describe('CrossCritiqueOutputSchema', () => {
    it('parses valid critique output correctly', () => {
      const data = loadFixture('critique-valid.json');
      const result = CrossCritiqueOutputSchema.parse(data);
      expect(result.critiques).toHaveLength(3);
      expect(result.critiques[0].critiqueType).toBe('weak_evidence');
      expect(result.critiques[0].severity).toBe('high');
      expect(result.critiques[1].critiqueType).toBe('misinterpreted_evidence');
      expect(result.critiques[1].severity).toBe('medium');
      expect(result.critiques[2].critiqueType).toBe('scope_error');
    });

    it('rejects critique with invalid targetType', () => {
      const data = loadFixture('critique-valid.json');
      (data as any).critiques[0].targetType = 'nonexistent';
      expect(() => CrossCritiqueOutputSchema.parse(data)).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Critique response schemas
  // -------------------------------------------------------------------------
  describe('CritiqueResponseOutputSchema', () => {
    it('parses valid critique response correctly', () => {
      const data = loadFixture('critique-response-valid.json');
      const result = CritiqueResponseOutputSchema.parse(data);
      expect(result.verdict).toBe('partial_accept');
      expect(result.positionChange).toBe('minor');
      expect(result.revisedClaim).toContain('Multi-model deliberation shows promise');
      expect(result.requestedEvidence).toHaveLength(2);
    });

    it('rejects critique response with invalid verdict', () => {
      const data = loadFixture('critique-response-valid.json');
      (data as any).verdict = 'totally_accept';
      expect(() => CritiqueResponseOutputSchema.parse(data)).toThrow();
    });

    it('rejects critique response with invalid positionChange', () => {
      const data = loadFixture('critique-response-valid.json');
      (data as any).positionChange = 'extreme';
      expect(() => CritiqueResponseOutputSchema.parse(data)).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Consensus vote schemas
  // -------------------------------------------------------------------------
  describe('ConsensusVoteOutputSchema', () => {
    it('parses valid consensus vote correctly', () => {
      const data = loadFixture('consensus-vote-valid.json');
      const result = ConsensusVoteOutputSchema.parse(data);
      expect(result.vote).toBe('accept_with_reservations');
      expect(result.reservations).toHaveLength(2);
      expect(result.confidence).toBe(0.65);
      expect(result.reason).toContain('merit');
    });

    it('rejects consensus vote with invalid vote', () => {
      const data = loadFixture('consensus-vote-valid.json');
      (data as any).vote = 'maybe';
      expect(() => ConsensusVoteOutputSchema.parse(data)).toThrow();
    });

    it('rejects consensus vote with confidence > 1', () => {
      const data = loadFixture('consensus-vote-valid.json');
      (data as any).confidence = 2;
      expect(() => ConsensusVoteOutputSchema.parse(data)).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Goal evaluation schemas
  // -------------------------------------------------------------------------
  describe('GoalAchievementOutputSchema', () => {
    it('parses valid goal evaluation correctly', () => {
      const data = loadFixture('goal-evaluation-valid.json');
      const result = GoalAchievementOutputSchema.parse(data);
      expect(result.goalAchieved).toBe(true);
      expect(result.achievementLevel).toBe('mostly');
      expect(result.addressedAspects).toHaveLength(4);
      expect(result.missingAspects).toHaveLength(2);
      expect(result.confidence).toBe(0.8);
    });

    it('rejects goal evaluation with invalid achievementLevel', () => {
      const data = loadFixture('goal-evaluation-valid.json');
      (data as any).achievementLevel = 'completely';
      expect(() => GoalAchievementOutputSchema.parse(data)).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Evidence gap schemas
  // -------------------------------------------------------------------------
  describe('EvidenceGapOutputSchema', () => {
    it('parses valid evidence gap output correctly', () => {
      const data = loadFixture('evidence-gaps-valid.json');
      const result = EvidenceGapOutputSchema.parse(data);
      expect(result.gaps).toHaveLength(3);
      expect(result.overallEvidenceStrength).toBe('weak');
      expect(result.recommendation).toBe('gather_more');
      expect(result.gaps[0].priority).toBe('critical');
      expect(result.gaps[1].priority).toBe('high');
    });

    it('rejects evidence gaps with invalid gapType', () => {
      const data = loadFixture('evidence-gaps-valid.json');
      (data as any).gaps[0].gapType = 'missing';
      expect(() => EvidenceGapOutputSchema.parse(data)).toThrow();
    });

    it('rejects evidence gaps with invalid recommendation', () => {
      const data = loadFixture('evidence-gaps-valid.json');
      (data as any).recommendation = 'ignore';
      expect(() => EvidenceGapOutputSchema.parse(data)).toThrow();
    });
  });
});

// ===========================================================================
// Edge case: all fixture files exist and are valid JSON
// ===========================================================================

describe('Fixture file integrity', () => {
  const fixtureFiles = readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'));

  it('at least 9 fixture files exist', () => {
    // Each fixture file tests a specific scenario or schema
    expect(fixtureFiles.length).toBeGreaterThanOrEqual(9);
  });

  for (const file of fixtureFiles) {
    it(`${file} is valid JSON`, () => {
      expect(() => loadFixture(file)).not.toThrow();
    });
  }
});

// ===========================================================================
// Cross-schema: verify output analyzer compatibility
// ===========================================================================

describe('Output analyzer compatibility', () => {
  it('valid extraction output can be analyzed', () => {
    const data = loadFixture('extraction-valid.json');
    const result = ClaimExtractionOutputSchema.parse(data);
    // Output analyzer cares about claim count, hypotheses, and open questions
    expect(result.claims.length).toBeGreaterThan(0);
    expect(result.hypotheses.length).toBeGreaterThanOrEqual(0);
  });

  it('malformed extraction output has salvageable claims for analysis', () => {
    const data = loadFixture('extraction-malformed.json');
    const result = ClaimExtractionOutputSchema.parse(data);
    // Even with malformed input, schema salvages enough to continue
    expect(result.claims.length).toBeGreaterThan(0);
    // All claims have text (even if defaulted)
    for (const claim of result.claims) {
      expect(typeof claim.text).toBe('string');
      expect(claim.text.length).toBeGreaterThan(0);
    }
  });

  it('all fixture files produce parseable output with their respective schema', () => {
    const schemaMap: Record<string, any> = {
      'extraction-valid.json': ClaimExtractionOutputSchema,
      'extraction-malformed.json': ClaimExtractionOutputSchema,
      'extraction-single-object.json': ClaimExtractionOutputSchema,
      'review-valid.json': IndependentReviewOutputSchema,
      'critique-valid.json': CrossCritiqueOutputSchema,
      'critique-response-valid.json': CritiqueResponseOutputSchema,
      'decision-record-valid.json': DecisionRecordOutputSchema,
      'consensus-vote-valid.json': ConsensusVoteOutputSchema,
      'goal-evaluation-valid.json': GoalAchievementOutputSchema,
      'evidence-gaps-valid.json': EvidenceGapOutputSchema,
    };

    for (const [file, schema] of Object.entries(schemaMap)) {
      const data = loadFixture(file);
      // Malformed extraction is expected to parse (salvage behavior)
      expect(() => schema.parse(data)).not.toThrow();
    }
  });
});

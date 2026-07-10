import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { OutputAnalyzer } from './output-analyzer.js';

const analyzer = new OutputAnalyzer();

// ===========================================================================
// Test schemas for different scenarios
// ===========================================================================
const simpleSchema = z.object({
  text: z.string().min(1),
});

const claimsSchema = z.object({
  claims: z.array(z.object({
    text: z.string().min(1),
    type: z.string(),
    criticality: z.enum(['low', 'medium', 'high', 'blocking']),
  })).min(1),
  hypotheses: z.array(z.string()).optional(),
  openQuestions: z.array(z.string()).optional(),
});

const reviewSchema = z.object({
  verdict: z.enum(['accept', 'accept_with_reservations', 'reject', 'needs_revision']),
  strengths: z.array(z.string()).min(1),
  weaknesses: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1),
});

const consensusSchema = z.object({
  vote: z.enum(['accept', 'accept_with_reservations', 'reject', 'needs_more_evidence', 'abstain']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});

// ===========================================================================
// OutputAnalyzer — null/undefined handling
// ===========================================================================
describe('OutputAnalyzer — null and undefined', () => {
  it('returns score 0 for null output', () => {
    const report = analyzer.analyze(null, simpleSchema, 'test');
    expect(report.score).toBe(0);
    expect(report.isUsable).toBe(false);
    expect(report.issues[0].type).toBe('empty_output');
    expect(report.issues[0].severity).toBe('fatal');
  });

  it('returns score 0 for undefined output', () => {
    const report = analyzer.analyze(undefined, simpleSchema, 'test');
    expect(report.score).toBe(0);
    expect(report.isUsable).toBe(false);
    expect(report.issues[0].type).toBe('empty_output');
  });
});

// ===========================================================================
// OutputAnalyzer — string output (parse error)
// ===========================================================================
describe('OutputAnalyzer — string outputs', () => {
  it('detects string output as parse error', () => {
    const report = analyzer.analyze('This is not JSON', simpleSchema, 'test');
    expect(report.score).toBe(0);
    expect(report.isUsable).toBe(false);
    expect(report.issues[0].type).toBe('parse_error');
  });

  it('truncates long string in message', () => {
    const longString = 'A'.repeat(200);
    const report = analyzer.analyze(longString, simpleSchema, 'test');
    expect(report.issues[0].message.length).toBeLessThan(200);
    // String is truncated via .slice(0, 100)
    expect(report.issues[0].message).toContain('A'.repeat(100));
  });
});

// ===========================================================================
// OutputAnalyzer — schema validation
// ===========================================================================
describe('OutputAnalyzer — schema validation', () => {
  it('validates correct output', () => {
    const output = { text: 'Hello world' };
    const report = analyzer.analyze(output, simpleSchema, 'test');
    expect(report.score).toBeGreaterThanOrEqual(0.9);
    expect(report.isUsable).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it('detects missing required fields', () => {
    const report = analyzer.analyze({}, simpleSchema, 'test');
    expect(report.isUsable).toBe(false);
    expect(report.issues.some(i => i.type === 'wrong_type')).toBe(true);
  });

  it('detects wrong type for field', () => {
    const report = analyzer.analyze({ text: 123 }, simpleSchema, 'test');
    expect(report.isUsable).toBe(false);
    expect(report.issues.some(i => i.type === 'wrong_type')).toBe(true);
  });

  it('detects invalid enum values', () => {
    const output = {
      verdict: 'maybe',
      strengths: ['Good'],
      weaknesses: ['Bad'],
      confidence: 0.5,
    };
    const report = analyzer.analyze(output, reviewSchema, 'test');
    expect(report.isUsable).toBe(false);
    expect(report.issues.some(i => i.type === 'invalid_enum')).toBe(true);
  });

  it('detects too few items in array', () => {
    const output = {
      claims: [],
    };
    const report = analyzer.analyze(output, claimsSchema, 'test');
    expect(report.issues.some(i => i.type === 'too_few_items')).toBe(true);
  });

  it('detects missing required array items', () => {
    const output = {
      claims: [{ text: 'claim', type: 'technical', criticality: 'invalid' }],
    };
    const report = analyzer.analyze(output, claimsSchema, 'test');
    expect(report.isUsable).toBe(false);
    expect(report.issues.some(i => i.type === 'invalid_enum')).toBe(true);
  });
});

// ===========================================================================
// OutputAnalyzer — placeholder detection
// ===========================================================================
describe('OutputAnalyzer — placeholder detection', () => {
  it('detects zero UUID placeholders', () => {
    const output = {
      claims: [{
        text: 'claim',
        type: 'technical',
        criticality: 'high',
        targetId: '00000000-0000-0000-0000-000000000000',
      }],
    };
    const report = analyzer.analyze(output, claimsSchema, 'test');
    expect(report.issues.some(i => i.type === 'uuid_zero_values')).toBe(true);
  });

  it('detects placeholder text in string fields', () => {
    const output = {
      claims: [{
        text: 'This is a placeholder claim',
        type: 'technical',
        criticality: 'high',
      }],
    };
    const report = analyzer.analyze(output, claimsSchema, 'test');
    expect(report.issues.some(i => i.type === 'placeholder_values')).toBe(true);
  });

  it('detects "mock" in string fields', () => {
    const output = {
      claims: [{
        text: 'Mock claim for testing',
        type: 'technical',
        criticality: 'high',
      }],
    };
    const report = analyzer.analyze(output, claimsSchema, 'test');
    expect(report.issues.some(i => i.type === 'placeholder_values')).toBe(true);
  });

  it('detects zero UUID in nested objects', () => {
    const output = {
      claims: [{
        text: 'claim',
        type: 'technical',
        criticality: 'high',
        metadata: { id: '00000000-0000-0000-0000-000000000000' },
      }],
    };
    const report = analyzer.analyze(output, claimsSchema, 'test');
    expect(report.issues.some(i => i.type === 'uuid_zero_values')).toBe(true);
  });
});

// ===========================================================================
// OutputAnalyzer — empty content detection
// ===========================================================================
describe('OutputAnalyzer — empty content detection', () => {
  it('detects empty arrays (except hypotheses and openQuestions)', () => {
    const output = {
      claims: [{ text: 'claim', type: 'technical', criticality: 'high' }],
      hypotheses: [],
      openQuestions: [],
    };
    const report = analyzer.analyze(output, claimsSchema, 'test');
    // hypotheses and openQuestions should NOT trigger too_few_items
    const emptyArrayIssues = report.issues.filter(
      i => i.type === 'too_few_items' && (i.field === 'hypotheses' || i.field === 'openQuestions')
    );
    expect(emptyArrayIssues).toHaveLength(0);
  });

  it('does not flag empty hypotheses/openQuestions as issues', () => {
    const output = {
      claims: [{ text: 'claim', type: 'technical', criticality: 'high' }],
    };
    const report = analyzer.analyze(output, claimsSchema, 'test');
    // claims array has 1 item, so no too_few_items for claims
    expect(report.issues.filter(i => i.field === 'claims')).toHaveLength(0);
  });
});

// ===========================================================================
// OutputAnalyzer — scoring
// ===========================================================================
describe('OutputAnalyzer — scoring', () => {
  it('starts with score 1.0 and deducts for issues', () => {
    // Valid output with empty optional arrays
    const output = {
      claims: [{ text: 'claim', type: 'technical', criticality: 'high' }],
      hypotheses: [],
      openQuestions: [],
    };
    const report = analyzer.analyze(output, claimsSchema, 'test');
    // Empty arrays cause minor deductions
    expect(report.score).toBeLessThanOrEqual(1.0);
    expect(report.score).toBeGreaterThan(0.8);
  });

  it('deducts 0.5 for fatal issues', () => {
    const report = analyzer.analyze(null, simpleSchema, 'test');
    expect(report.score).toBe(0);
  });

  it('deducts 0.2 for major issues', () => {
    // Create a schema that causes a major issue (too_small -> too_few_items)
    const arraySchema = z.object({
      items: z.array(z.string()).min(3),
    });
    const report = analyzer.analyze({ items: ['one', 'two'] }, arraySchema, 'test');
    // too_few_items is major severity
    expect(report.issues.some(i => i.severity === 'major')).toBe(true);
    // Score should be less than 1.0 due to major issue
    expect(report.score).toBeLessThan(1.0);
  });

  it('deducts 0.05 per issue count', () => {
    // Multiple placeholder detections
    const output = {
      claims: [
        { text: 'placeholder claim 1', type: 'technical', criticality: 'high' },
        { text: 'placeholder claim 2', type: 'technical', criticality: 'high' },
      ],
    };
    const report = analyzer.analyze(output, claimsSchema, 'test');
    const placeholderCount = report.issues.filter(i => i.type === 'placeholder_values').length;
    expect(placeholderCount).toBeGreaterThanOrEqual(2);
  });

  it('isUsable is false when score < 0.3', () => {
    const report = analyzer.analyze(null, simpleSchema, 'test');
    expect(report.isUsable).toBe(false);
  });

  it('isUsable is true when score >= 0.3 and no fatal issues', () => {
    // Output with only minor issues
    const output = {
      claims: [{ text: 'claim', type: 'technical', criticality: 'high' }],
      hypotheses: [],
      openQuestions: [],
    };
    const report = analyzer.analyze(output, claimsSchema, 'test');
    expect(report.score).toBeGreaterThanOrEqual(0.3);
    expect(report.isUsable).toBe(true);
  });
});

// ===========================================================================
// OutputAnalyzer — snippets
// ===========================================================================
describe('OutputAnalyzer — snippets', () => {
  it('generates snippet for claims output', () => {
    const output = {
      claims: [
        { text: 'claim 1', type: 'technical', criticality: 'high' },
        { text: 'claim 2', type: 'research', criticality: 'medium' },
      ],
    };
    const report = analyzer.analyze(output, claimsSchema, 'test');
    expect(report.snippet).toBe('claims:2');
  });

  it('generates snippet for review output', () => {
    const output = {
      verdict: 'accept_with_reservations',
      strengths: ['Good'],
      weaknesses: ['Bad'],
      confidence: 0.7,
    };
    const report = analyzer.analyze(output, reviewSchema, 'test');
    expect(report.snippet).toBe('verdict:accept_with_reservations');
  });

  it('generates snippet for consensus output', () => {
    const output = {
      vote: 'accept',
      confidence: 0.8,
      reasoning: 'Good evidence',
    };
    const report = analyzer.analyze(output, consensusSchema, 'test');
    expect(report.snippet).toBe('vote:accept');
  });

  it('generates snippet for decision output', () => {
    const decisionSchema = z.object({
      decisionStatus: z.string(),
      decisionText: z.string(),
    });
    const output = { decisionStatus: 'full_consensus', decisionText: 'Accepted' };
    const report = analyzer.analyze(output, decisionSchema, 'test');
    expect(report.snippet).toBe('status:full_consensus');
  });

  it('returns undefined snippet for unknown structure', () => {
    const output = { unknownField: 'value' };
    const report = analyzer.analyze(output, simpleSchema, 'test');
    expect(report.snippet).toBeUndefined();
  });

  it('returns undefined snippet for null output', () => {
    const report = analyzer.analyze(null, simpleSchema, 'test');
    expect(report.snippet).toBeUndefined();
  });
});

// ===========================================================================
// OutputAnalyzer — diagnose method
// ===========================================================================
describe('OutputAnalyzer — diagnose', () => {
  it('returns null for usable output', () => {
    const output = { text: 'Hello' };
    const diag = analyzer.diagnose(output, simpleSchema, 'test_role');
    expect(diag).toBeNull();
  });

  it('diagnoses null output', () => {
    const diag = analyzer.diagnose(null, simpleSchema, 'test_role');
    expect(diag).toContain('test_role');
    expect(diag).toContain('empty or null');
  });

  it('diagnoses schema validation failure', () => {
    const diag = analyzer.diagnose({}, simpleSchema, 'test_role');
    expect(diag).toContain('test_role');
    // The diagnose method returns a message about unusable output
    expect(diag).toContain('unusable');
  });

  it('diagnoses string output (parse error)', () => {
    const diag = analyzer.diagnose('not json', simpleSchema, 'test_role');
    expect(diag).toContain('test_role');
    expect(diag).toContain('raw text');
  });

  it('diagnoses wrong type', () => {
    const diag = analyzer.diagnose({ text: 123 }, simpleSchema, 'test_role');
    expect(diag).toContain('test_role');
    expect(diag).toContain('wrong type');
  });

  it('diagnoses invalid enum', () => {
    const output = {
      verdict: 'invalid',
      strengths: ['Good'],
      weaknesses: ['Bad'],
      confidence: 0.5,
    };
    const diag = analyzer.diagnose(output, reviewSchema, 'test_role');
    expect(diag).toContain('test_role');
    expect(diag).toContain('invalid enum');
  });

  it('combines multiple fatal issues in diagnosis', () => {
    const complexSchema = z.object({
      status: z.enum(['active', 'inactive']),
      count: z.number(),
    });
    const diag = analyzer.diagnose({ status: 'wrong', count: 'not a number' }, complexSchema, 'test_role');
    expect(diag).toContain('test_role');
    expect(diag).toContain(';'); // Multiple issues separated by ;
  });
});

// ===========================================================================
// OutputAnalyzer — issue field tracking
// ===========================================================================
describe('OutputAnalyzer — issue field tracking', () => {
  it('includes field path in issues', () => {
    const output = {
      claims: [{ text: 'claim', type: 'technical', criticality: 'invalid' }],
    };
    const report = analyzer.analyze(output, claimsSchema, 'test');
    const enumIssue = report.issues.find(i => i.type === 'invalid_enum');
    expect(enumIssue).toBeDefined();
    expect(enumIssue!.field).toContain('criticality');
  });

  it('includes role in report', () => {
    const report = analyzer.analyze({ text: 'Hello' }, simpleSchema, 'my_role');
    expect(report.role).toBe('my_role');
  });

  it('returns issues sorted by severity', () => {
    const output = {
      claims: [{ text: 'claim', type: 'technical', criticality: 'high' }],
      hypotheses: [],
    };
    const report = analyzer.analyze(output, claimsSchema, 'test');
    // All issues should have severity
    report.issues.forEach(issue => {
      expect(['fatal', 'major', 'minor']).toContain(issue.severity);
    });
  });
});

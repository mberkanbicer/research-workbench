import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { OutputAnalyzer } from './output-analyzer.js';
import { PromptRegistry } from './prompt-registry.js';
import { ActionPlanner, IterationReport } from './action-planner.js';

// ===========================================================================
// OutputAnalyzer Tests
// ===========================================================================
describe('OutputAnalyzer', () => {
  const analyzer = new OutputAnalyzer();
  const testSchema = z.object({
    claims: z.array(z.object({
      text: z.string().min(1),
      type: z.string(),
      criticality: z.enum(['low', 'medium', 'high', 'blocking']),
    })).min(1),
    summary: z.string().optional(),
  });

  it('returns perfect score for valid output', () => {
    const report = analyzer.analyze(
      { claims: [{ text: 'Test claim', type: 'technical', criticality: 'high' }] },
      testSchema,
      'claim_extraction',
    );
    expect(report.score).toBeGreaterThanOrEqual(0.9);
    expect(report.isUsable).toBe(true);
    expect(report.issues.length).toBe(0);
  });

  it('detects null output as fatal', () => {
    const report = analyzer.analyze(null, testSchema, 'claim_extraction');
    expect(report.score).toBe(0);
    expect(report.isUsable).toBe(false);
    expect(report.issues[0].type).toBe('empty_output');
  });

  it('detects schema validation failures', () => {
    const report = analyzer.analyze(
      { claims: [{ text: '', type: 'technical', criticality: 'invalid' }] },
      testSchema,
      'test',
    );
    expect(report.isUsable).toBe(false);
    expect(report.issues.some(i => i.type === 'invalid_enum')).toBe(true);
  });

  it('detects zero UUID placeholders', () => {
    const report = analyzer.analyze(
      { claims: [{ text: 'claim', type: 'technical', criticality: 'high', targetId: '00000000-0000-0000-0000-000000000000' }] },
      testSchema,
      'test',
    );
    expect(report.issues.some(i => i.type === 'uuid_zero_values')).toBe(true);
  });

  it('detects placeholder text strings', () => {
    const report = analyzer.analyze(
      { claims: [{ text: 'Mock claim placeholder', type: 'technical', criticality: 'high' }] },
      testSchema,
      'test',
    );
    expect(report.issues.some(i => i.type === 'placeholder_values')).toBe(true);
    expect(report.isUsable).toBe(true); // non-fatal issue
  });

  it('diagnoses failure patterns', () => {
    const diag = analyzer.diagnose(null, testSchema, 'test_role');
    expect(diag).toContain('test_role');
    expect(diag).toContain('empty or null');

    const ok = analyzer.diagnose(
      { claims: [{ text: 'valid', type: 'technical', criticality: 'high' }] },
      testSchema,
      'test_role',
    );
    expect(ok).toBeNull();
  });
});

// ===========================================================================
// PromptRegistry Tests
// ===========================================================================
describe('PromptRegistry', () => {
  const registry = new PromptRegistry();

  it('registers and retrieves prompt text', async () => {
    await registry.register('test_role', 'Initial prompt text');
    expect(registry.get('test_role')).toBe('Initial prompt text');
    expect(registry.getVersion('test_role')).toBe(1);
  });

  it('tracks call metrics', async () => {
    await registry.recordCall('test_role', 0.9, true, []);
    await registry.recordCall('test_role', 0.5, true, ['minor_warning']);
    await registry.recordCall('test_role', 0.0, false, ['empty_output']);

    const summary = registry.getSummary();
    const entry = summary.find(s => s.role === 'test_role');
    expect(entry).toBeDefined();
    expect(entry!.totalCalls).toBe(3);
    expect(entry!.successRate).toBeCloseTo(2 / 3);
  });

  it('creates new versions on improve()', async () => {
    await registry.register('improve_test', 'v1 prompt');
    await registry.improve('improve_test', 'v2 improved', 'Fixed empty outputs');
    await registry.improve('improve_test', 'v3 even better', 'More fixes');

    expect(registry.getVersion('improve_test')).toBe(3);
    expect(registry.get('improve_test')).toBe('v3 even better');

    const history = registry.getHistory('improve_test');
    expect(history.length).toBe(3);
    expect(history[0].reason).toBe('Initial version');
    expect(history[1].reason).toBe('Fixed empty outputs');
  });

  it('returns null for analyze when metrics insufficient', async () => {
    const fresh = new PromptRegistry();
    await fresh.register('fresh_role', 'prompt');
    // Only 1 call — not enough data (threshold is 3)
    await fresh.recordCall('fresh_role', 1.0, true, []);
    expect(fresh.analyzeForImprovement('fresh_role')).toBeNull();
  });

  it('recommends improvement when failure rate is high', async () => {
    const failingRegistry = new PromptRegistry();
    await failingRegistry.register('failing_role', 'Bad prompt text');

    // 5 calls, 4 failures
    await failingRegistry.recordCall('failing_role', 0.0, false, ['empty_output']);
    await failingRegistry.recordCall('failing_role', 0.0, false, ['empty_output']);
    await failingRegistry.recordCall('failing_role', 0.0, false, ['schema_validation_failed']);
    await failingRegistry.recordCall('failing_role', 0.0, false, ['empty_output']);
    await failingRegistry.recordCall('failing_role', 0.9, true, []);

    const request = failingRegistry.analyzeForImprovement('failing_role');
    expect(request).not.toBeNull();
    expect(request!.role).toBe('failing_role');
    expect(request!.observedFailures.length).toBeGreaterThan(0);
    expect(request!.suggestedFix).toBeDefined();
  });
});

// ===========================================================================
// ActionPlanner Tests
// ===========================================================================
describe('ActionPlanner', () => {
  const planner = new ActionPlanner();

  it('returns no actions when goal is achieved', () => {
    const report: IterationReport = {
      iteration: 2,
      stagesCompleted: ['all'],
      stagesFailed: [],
      stagesSkipped: [],
      qualityScores: {},
      failurePatterns: {},
      goalAchieved: true,
      hasDecision: true,
    };
    const actions = planner.planActions(report, ['model-1']);
    expect(actions.length).toBe(0);
  });

  it('suggests prompt improvement for failed stages', () => {
    const report: IterationReport = {
      iteration: 1,
      stagesCompleted: [],
      stagesFailed: ['extraction'],
      stagesSkipped: [],
      qualityScores: { extraction: 0 },
      failurePatterns: { extraction: ['empty output'] },
      goalAchieved: false,
      hasDecision: false,
    };
    const actions = planner.planActions(report, ['model-1', 'model-2']);
    expect(actions.length).toBeGreaterThanOrEqual(2);
    expect(actions.some(a => a.type === 'improve_prompt' && a.target === 'extraction')).toBe(true);
    expect(actions.some(a => a.type === 'rerun_stage' && a.target === 'extraction')).toBe(true);
  });

  it('suggests model switch on repeated rejection', () => {
    const report: IterationReport = {
      iteration: 3,
      stagesCompleted: ['all'],
      stagesFailed: [],
      stagesSkipped: [],
      qualityScores: { review: 0.8, consensus: 0.6 },
      failurePatterns: {},
      consensusVote: 'reject',
      goalAchieved: false,
      hasDecision: false,
    };
    const actions = planner.planActions(report, ['model-a', 'model-b']);
    expect(actions.some(a => a.type === 'switch_model')).toBe(true);
  });

  it('stops when goal achieved', () => {
    const report: IterationReport = {
      iteration: 3,
      stagesCompleted: [],
      stagesFailed: [],
      stagesSkipped: [],
      qualityScores: {},
      failurePatterns: {},
      goalAchieved: true,
      hasDecision: true,
    };
    const decision = planner.shouldStop(report, 10);
    expect(decision.stop).toBe(true);
    expect(decision.reason).toContain('Goal achieved');
  });

  it('stops at max iterations', () => {
    const report: IterationReport = {
      iteration: 10,
      stagesCompleted: [],
      stagesFailed: [],
      stagesSkipped: [],
      qualityScores: {},
      failurePatterns: {},
      goalAchieved: false,
      hasDecision: false,
    };
    const decision = planner.shouldStop(report, 10);
    expect(decision.stop).toBe(true);
    expect(decision.reason).toContain('max iterations');
  });

  it('stops on consecutive failures', () => {
    const report: IterationReport = {
      iteration: 2,
      stagesCompleted: [],
      stagesFailed: ['extraction', 'review', 'consensus'],
      stagesSkipped: [],
      qualityScores: {},
      failurePatterns: {},
      goalAchieved: false,
      hasDecision: false,
    };
    const decision = planner.shouldStop(report, 10);
    expect(decision.stop).toBe(true);
    expect(decision.reason).toContain('consecutive');
  });

  it('generates improvement instructions with failure context', () => {
    const instruction = planner.generateImprovementInstruction(
      'test_role',
      'Original prompt text',
      [
        { type: 'empty_output', count: 5, examples: ['null response'] },
        { type: 'invalid_enum', count: 3, examples: ['wrong value'] },
      ],
    );

    expect(instruction).toContain('test_role');
    expect(instruction).toContain('Original prompt text');
    expect(instruction).toContain('empty_output');
    expect(instruction).toContain('invalid_enum');
    expect(instruction).toContain('Never return empty');
  });
});

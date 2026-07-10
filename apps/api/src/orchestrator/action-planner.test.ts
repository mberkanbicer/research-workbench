import { describe, it, expect } from 'vitest';
import { ActionPlanner, IterationReport, CorrectiveAction } from './action-planner.js';

const planner = new ActionPlanner();

function makeReport(overrides: Partial<IterationReport> = {}): IterationReport {
  return {
    iteration: 1,
    stagesCompleted: [],
    stagesFailed: [],
    stagesSkipped: [],
    qualityScores: {},
    failurePatterns: {},
    goalAchieved: false,
    hasDecision: false,
    ...overrides,
  };
}

// ===========================================================================
// planActions — goal achieved
// ===========================================================================
describe('ActionPlanner.planActions', () => {
  describe('goal achieved scenarios', () => {
    it('returns empty actions when goal is achieved', () => {
      const report = makeReport({ goalAchieved: true, hasDecision: true });
      const actions = planner.planActions(report, ['model-1']);
      expect(actions).toHaveLength(0);
    });

    it('returns empty even if stages failed when goal achieved', () => {
      const report = makeReport({
        goalAchieved: true,
        hasDecision: true,
        stagesFailed: ['extraction', 'review'],
      });
      const actions = planner.planActions(report, ['model-1']);
      expect(actions).toHaveLength(0);
    });
  });

  describe('standard mode behavior', () => {
    it('only suggests rerun_stage for failed stages in standard mode', () => {
      const report = makeReport({
        stagesFailed: ['extraction', 'review'],
        qualityScores: { extraction: 0.2 },
      });
      const actions = planner.planActions(report, ['model-1'], 'standard');

      // Standard mode only reruns — no prompt improvement
      expect(actions.every(a => a.type === 'rerun_stage')).toBe(true);
      expect(actions.some(a => a.target === 'extraction')).toBe(true);
      expect(actions.some(a => a.target === 'review')).toBe(true);
    });

    it('returns empty when no stages failed in standard mode', () => {
      const report = makeReport({
        stagesCompleted: ['extraction', 'review'],
        qualityScores: { extraction: 0.9 },
      });
      const actions = planner.planActions(report, ['model-1'], 'standard');
      expect(actions).toHaveLength(0);
    });
  });

  describe('failed stages handling', () => {
    it('creates improve_prompt and rerun_stage for each failed stage in self_improving mode', () => {
      const report = makeReport({
        stagesFailed: ['extraction'],
        qualityScores: { extraction: 0.1 },
      });
      const actions = planner.planActions(report, ['model-1', 'model-2'], 'self_improving');

      const improveActions = actions.filter(a => a.type === 'improve_prompt' && a.target === 'extraction');
      const rerunActions = actions.filter(a => a.type === 'rerun_stage' && a.target === 'extraction');

      expect(improveActions).toHaveLength(1);
      expect(improveActions[0].priority).toBe('critical');
      expect(rerunActions).toHaveLength(1);
      expect(rerunActions[0].priority).toBe('high');
    });

    it('handles multiple failed stages', () => {
      const report = makeReport({
        stagesFailed: ['extraction', 'review', 'consensus'],
      });
      const actions = planner.planActions(report, ['model-1'], 'self_improving');

      // Each failed stage gets improve + rerun = 6 actions
      expect(actions.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('quality score handling', () => {
    it('suggests prompt improvement for low quality scores', () => {
      const report = makeReport({
        qualityScores: { extraction: 0.3 },
      });
      const actions = planner.planActions(report, ['model-1'], 'self_improving');

      const improveActions = actions.filter(
        a => a.type === 'improve_prompt' && a.target === 'extraction'
      );
      expect(improveActions).toHaveLength(1);
      expect(improveActions[0].reason).toContain('0.30');
    });

    it('does not suggest improvement for high quality scores', () => {
      const report = makeReport({
        qualityScores: { extraction: 0.9 },
      });
      const actions = planner.planActions(report, ['model-1'], 'self_improving');

      const improveActions = actions.filter(
        a => a.type === 'improve_prompt' && a.target === 'extraction'
      );
      expect(improveActions).toHaveLength(0);
    });

    it('ignores failed stages when counting quality score improvements', () => {
      const report = makeReport({
        stagesFailed: ['extraction'],
        qualityScores: { extraction: 0.2 },
      });
      const actions = planner.planActions(report, ['model-1'], 'self_improving');

      // extraction gets both improve (from failed) and rerun, but NOT the quality score improve
      const improveForQuality = actions.filter(
        a => a.type === 'improve_prompt' && a.target === 'extraction' && a.reason.includes('below 0.5')
      );
      expect(improveForQuality).toHaveLength(0);
    });
  });

  describe('consensus vote handling', () => {
    it('suggests model switch on reject after 2+ iterations', () => {
      const report = makeReport({
        iteration: 3,
        consensusVote: 'reject',
      });
      const actions = planner.planActions(report, ['model-a', 'model-b', 'model-c']);

      const switchActions = actions.filter(a => a.type === 'switch_model');
      expect(switchActions).toHaveLength(1);
      expect(switchActions[0].target).toBeDefined();
    });

    it('suggests model switch on needs_more_evidence after 2+ iterations', () => {
      const report = makeReport({
        iteration: 2,
        consensusVote: 'needs_more_evidence',
      });
      const actions = planner.planActions(report, ['model-a', 'model-b']);

      expect(actions.some(a => a.type === 'switch_model')).toBe(true);
    });

    it('does not suggest model switch on first iteration', () => {
      const report = makeReport({
        iteration: 1,
        consensusVote: 'reject',
      });
      const actions = planner.planActions(report, ['model-a', 'model-b']);

      expect(actions.some(a => a.type === 'switch_model')).toBe(false);
    });

    it('does not suggest model switch for accept votes', () => {
      const report = makeReport({
        iteration: 3,
        consensusVote: 'accept_with_reservations',
      });
      const actions = planner.planActions(report, ['model-a', 'model-b']);

      expect(actions.some(a => a.type === 'switch_model')).toBe(false);
    });
  });

  describe('no decision handling', () => {
    it('suggests rerun review when no decision and iteration < 5', () => {
      const report = makeReport({
        iteration: 2,
        hasDecision: false,
      });
      const actions = planner.planActions(report, ['model-1']);

      const reviewReruns = actions.filter(
        a => a.type === 'rerun_stage' && a.target === 'review'
      );
      expect(reviewReruns).toHaveLength(1);
      expect(reviewReruns[0].priority).toBe('medium');
    });

    it('does not suggest rerun review when already failed', () => {
      const report = makeReport({
        iteration: 2,
        hasDecision: false,
        stagesFailed: ['review'],
      });
      const actions = planner.planActions(report, ['model-1']);

      // The rerun comes from failed stage handling, not the no-decision logic
      const noDecisionReruns = actions.filter(
        a => a.type === 'rerun_stage' && a.target === 'review' && a.reason.includes('fresh review')
      );
      expect(noDecisionReruns).toHaveLength(0);
    });

    it('does not suggest rerun review when already skipped', () => {
      const report = makeReport({
        iteration: 2,
        hasDecision: false,
        stagesSkipped: ['review'],
      });
      const actions = planner.planActions(report, ['model-1']);

      const noDecisionReruns = actions.filter(
        a => a.type === 'rerun_stage' && a.target === 'review' && a.reason.includes('fresh review')
      );
      expect(noDecisionReruns).toHaveLength(0);
    });

    it('does not suggest rerun review at iteration 5+', () => {
      const report = makeReport({
        iteration: 5,
        hasDecision: false,
      });
      const actions = planner.planActions(report, ['model-1']);

      const noDecisionReruns = actions.filter(
        a => a.type === 'rerun_stage' && a.target === 'review' && a.reason.includes('fresh review')
      );
      expect(noDecisionReruns).toHaveLength(0);
    });
  });

  describe('calibration error handling', () => {
    it('suggests calibration adjustment when error > 0.2', () => {
      const report = makeReport({
        calibrationError: 0.35,
      });
      const actions = planner.planActions(report, ['model-1']);

      const calActions = actions.filter(a => a.type === 'adjust_calibration');
      expect(calActions).toHaveLength(1);
      expect(calActions[0].params?.calibrationError).toBe(0.35);
    });

    it('does not suggest calibration when error <= 0.2', () => {
      const report = makeReport({
        calibrationError: 0.15,
      });
      const actions = planner.planActions(report, ['model-1']);

      expect(actions.some(a => a.type === 'adjust_calibration')).toBe(false);
    });

    it('does not suggest calibration when no error reported', () => {
      const report = makeReport({});
      const actions = planner.planActions(report, ['model-1']);

      expect(actions.some(a => a.type === 'adjust_calibration')).toBe(false);
    });
  });

  describe('adversarial mode', () => {
    it('uses same logic as self_improving mode', () => {
      const report = makeReport({
        stagesFailed: ['extraction'],
      });
      const actions = planner.planActions(report, ['model-1'], 'adversarial');

      // Should get improve_prompt + rerun for failed stage
      expect(actions.some(a => a.type === 'improve_prompt')).toBe(true);
      expect(actions.some(a => a.type === 'rerun_stage')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles empty available models list', () => {
      const report = makeReport({
        iteration: 3,
        consensusVote: 'reject',
      });
      const actions = planner.planActions(report, []);

      // Should not crash — switch_model uses modulo
      expect(actions).toBeDefined();
    });

    it('handles complex multi-factor report', () => {
      const report = makeReport({
        iteration: 3,
        stagesFailed: ['extraction'],
        qualityScores: { review: 0.3, critique: 0.9 },
        consensusVote: 'reject',
        calibrationError: 0.3,
        hasDecision: false,
      });
      const actions = planner.planActions(report, ['model-a', 'model-b']);

      // Should have actions for: failed stage, low quality, consensus, calibration, no decision
      expect(actions.length).toBeGreaterThanOrEqual(4);
    });
  });
});

// ===========================================================================
// shouldStop — comprehensive tests
// ===========================================================================
describe('ActionPlanner.shouldStop', () => {
  it('stops when goal achieved and decision exists', () => {
    const report = makeReport({ goalAchieved: true, hasDecision: true });
    const result = planner.shouldStop(report, 10);
    expect(result.stop).toBe(true);
    expect(result.reason).toContain('Goal achieved');
  });

  it('does not stop when goal achieved but no decision', () => {
    const report = makeReport({ goalAchieved: true, hasDecision: false });
    const result = planner.shouldStop(report, 10);
    expect(result.stop).toBe(false);
  });

  it('stops at exact max iterations', () => {
    const report = makeReport({ iteration: 5 });
    const result = planner.shouldStop(report, 5);
    expect(result.stop).toBe(true);
    expect(result.reason).toContain('5');
  });

  it('continues below max iterations', () => {
    const report = makeReport({ iteration: 4 });
    const result = planner.shouldStop(report, 5);
    expect(result.stop).toBe(false);
  });

  it('stops on 3+ failed stages at iteration 2+', () => {
    const report = makeReport({
      iteration: 2,
      stagesFailed: ['extraction', 'review', 'consensus'],
    });
    const result = planner.shouldStop(report, 10);
    expect(result.stop).toBe(true);
    expect(result.reason).toContain('consecutive');
  });

  it('does not stop on 2 failed stages', () => {
    const report = makeReport({
      iteration: 3,
      stagesFailed: ['extraction', 'review'],
    });
    const result = planner.shouldStop(report, 10);
    expect(result.stop).toBe(false);
  });

  it('does not stop on 3 failed stages at iteration 1', () => {
    const report = makeReport({
      iteration: 1,
      stagesFailed: ['extraction', 'review', 'consensus'],
    });
    const result = planner.shouldStop(report, 10);
    expect(result.stop).toBe(false);
  });

  it('continues with empty report', () => {
    const report = makeReport();
    const result = planner.shouldStop(report, 5);
    expect(result.stop).toBe(false);
  });

  it('stops at max iterations 1', () => {
    const report = makeReport({ iteration: 1 });
    const result = planner.shouldStop(report, 1);
    expect(result.stop).toBe(true);
  });
});

// ===========================================================================
// generateImprovementInstruction — comprehensive tests
// ===========================================================================
describe('ActionPlanner.generateImprovementInstruction', () => {
  it('includes role name in instruction', () => {
    const instruction = planner.generateImprovementInstruction(
      'claim_extraction',
      'Original prompt',
      []
    );
    expect(instruction).toContain('claim_extraction');
  });

  it('includes original prompt text', () => {
    const prompt = 'You are a research assistant.';
    const instruction = planner.generateImprovementInstruction(
      'test_role',
      prompt,
      []
    );
    expect(instruction).toContain(prompt);
  });

  it('lists all failure types', () => {
    const failures = [
      { type: 'empty_output', count: 5, examples: ['null'] },
      { type: 'schema_validation_failed', count: 3, examples: ['wrong format'] },
      { type: 'parse_error', count: 1, examples: ['not json'] },
    ];
    const instruction = planner.generateImprovementInstruction('test_role', 'prompt', failures);

    expect(instruction).toContain('empty_output');
    expect(instruction).toContain('schema_validation_failed');
    expect(instruction).toContain('parse_error');
  });

  it('includes failure counts', () => {
    const failures = [
      { type: 'empty_output', count: 10, examples: [] },
    ];
    const instruction = planner.generateImprovementInstruction('test_role', 'prompt', failures);
    expect(instruction).toContain('10 occurrences');
  });

  it('includes example text when available', () => {
    const failures = [
      { type: 'empty_output', count: 1, examples: ['Model returned null response'] },
    ];
    const instruction = planner.generateImprovementInstruction('test_role', 'prompt', failures);
    expect(instruction).toContain('Model returned null response');
  });

  it('includes suggested fixes for known failure types', () => {
    const failures = [
      { type: 'empty_output', count: 1, examples: [] },
      { type: 'schema_validation_failed', count: 1, examples: [] },
      { type: 'parse_error', count: 1, examples: [] },
      { type: 'invalid_enum', count: 1, examples: [] },
      { type: 'placeholder_values', count: 1, examples: [] },
      { type: 'uuid_zero_values', count: 1, examples: [] },
      { type: 'too_few_items', count: 1, examples: [] },
      { type: 'low_confidence', count: 1, examples: [] },
    ];
    const instruction = planner.generateImprovementInstruction('test_role', 'prompt', failures);

    expect(instruction).toContain('Never return empty');
    expect(instruction).toContain('Simplify the output');
    expect(instruction).toContain('valid JSON');
    expect(instruction).toContain('real UUIDs');
  });

  it('includes output schema instruction', () => {
    const instruction = planner.generateImprovementInstruction('test_role', 'prompt', []);
    expect(instruction).toContain('Output Schema');
    expect(instruction).toContain('Keep the existing Zod output schema unchanged');
  });

  it('handles empty failures list', () => {
    const instruction = planner.generateImprovementInstruction('test_role', 'prompt', []);
    expect(instruction).toContain('test_role');
    expect(instruction).toContain('Suggested Fixes');
  });

  it('handles unknown failure types gracefully', () => {
    const failures = [
      { type: 'unknown_error_type', count: 1, examples: ['something went wrong'] },
    ];
    const instruction = planner.generateImprovementInstruction('test_role', 'prompt', failures);
    expect(instruction).toContain('unknown_error_type');
    // Should not crash, just skip the fix suggestion
  });
});

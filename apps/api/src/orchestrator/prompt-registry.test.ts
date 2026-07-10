import { describe, it, expect, beforeEach } from 'vitest';
import { PromptRegistry } from './prompt-registry.js';

// ===========================================================================
// PromptRegistry — comprehensive tests
// ===========================================================================
describe('PromptRegistry', () => {
  let registry: PromptRegistry;

  beforeEach(() => {
    registry = new PromptRegistry();
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------
  describe('register', () => {
    it('registers a new prompt role', async () => {
      await registry.register('test_role', 'Initial prompt');
      expect(registry.get('test_role')).toBe('Initial prompt');
      expect(registry.getVersion('test_role')).toBe(1);
    });

    it('does not overwrite existing registration', async () => {
      await registry.register('test_role', 'First version');
      await registry.register('test_role', 'Second version');
      expect(registry.get('test_role')).toBe('First version');
      expect(registry.getVersion('test_role')).toBe(1);
    });

    it('returns undefined for unregistered role', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
      expect(registry.getVersion('nonexistent')).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Get and getVersion
  // -----------------------------------------------------------------------
  describe('get and getVersion', () => {
    it('returns correct text and version', async () => {
      await registry.register('role1', 'prompt v1');
      expect(registry.get('role1')).toBe('prompt v1');
      expect(registry.getVersion('role1')).toBe(1);
    });

    it('returns latest version after improve', async () => {
      await registry.register('role1', 'v1');
      await registry.improve('role1', 'v2', 'Update 1');
      await registry.improve('role1', 'v3', 'Update 2');

      expect(registry.get('role1')).toBe('v3');
      expect(registry.getVersion('role1')).toBe(3);
    });

    it('returns 0 for unregistered role', () => {
      expect(registry.getVersion('unknown')).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // improve
  // -----------------------------------------------------------------------
  describe('improve', () => {
    it('creates a new version', async () => {
      await registry.register('role1', 'v1');
      const newVersion = await registry.improve('role1', 'v2', 'Fixed issues');

      expect(newVersion.version).toBe(2);
      expect(newVersion.text).toBe('v2');
      expect(newVersion.reason).toBe('Fixed issues');
      expect(registry.getVersion('role1')).toBe(2);
    });

    it('throws for unregistered role', async () => {
      await expect(
        registry.improve('nonexistent', 'new text', 'reason')
      ).rejects.toThrow('No prompt history');
    });

    it('preserves history', async () => {
      await registry.register('role1', 'v1');
      await registry.improve('role1', 'v2', 'Update 1');
      await registry.improve('role1', 'v3', 'Update 2');

      const history = registry.getHistory('role1');
      expect(history).toHaveLength(3);
      expect(history[0].text).toBe('v1');
      expect(history[1].text).toBe('v2');
      expect(history[2].text).toBe('v3');
    });

    it('assigns correct version numbers', async () => {
      await registry.register('role1', 'v1');
      await registry.improve('role1', 'v2', 'r2');
      await registry.improve('role1', 'v3', 'r3');

      const history = registry.getHistory('role1');
      expect(history[0].version).toBe(1);
      expect(history[1].version).toBe(2);
      expect(history[2].version).toBe(3);
    });

    it('sets createdAt timestamps', async () => {
      const before = Date.now();
      await registry.register('role1', 'v1');
      const after = Date.now();

      const history = registry.getHistory('role1');
      const created = history[0].createdAt.getTime();
      expect(created).toBeGreaterThanOrEqual(before);
      expect(created).toBeLessThanOrEqual(after);
    });

    it('initializes fresh metrics for new version', async () => {
      await registry.register('role1', 'v1');
      await registry.recordCall('role1', 0.5, true, []);
      await registry.improve('role1', 'v2', 'Improved');

      const history = registry.getHistory('role1');
      expect(history[1].metrics.totalCalls).toBe(0);
      expect(history[1].metrics.successfulCalls).toBe(0);
      expect(history[1].metrics.avgQualityScore).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // recordCall
  // -----------------------------------------------------------------------
  describe('recordCall', () => {
    it('increments total calls', async () => {
      await registry.register('role1', 'prompt');
      await registry.recordCall('role1', 0.9, true, []);
      await registry.recordCall('role1', 0.8, true, []);

      const summary = registry.getSummary();
      const entry = summary.find(s => s.role === 'role1');
      expect(entry!.totalCalls).toBe(2);
    });

    it('tracks successful calls', async () => {
      await registry.register('role1', 'prompt');
      await registry.recordCall('role1', 0.9, true, []);
      await registry.recordCall('role1', 0.0, false, []);

      const summary = registry.getSummary();
      const entry = summary.find(s => s.role === 'role1');
      expect(entry!.successRate).toBeCloseTo(0.5);
    });

    it('tracks empty outputs', async () => {
      await registry.register('role1', 'prompt');
      await registry.recordCall('role1', 0.0, false, []);
      await registry.recordCall('role1', 0.3, false, ['minor']);

      const history = registry.getHistory('role1');
      expect(history[0].metrics.emptyOutputs).toBe(1);
    });

    it('calculates running average quality score', async () => {
      await registry.register('role1', 'prompt');
      await registry.recordCall('role1', 0.8, true, []);
      await registry.recordCall('role1', 0.6, true, []);
      await registry.recordCall('role1', 1.0, true, []);

      const history = registry.getHistory('role1');
      expect(history[0].metrics.avgQualityScore).toBeCloseTo(0.8);
    });

    it('tracks failure patterns', async () => {
      await registry.register('role1', 'prompt');
      await registry.recordCall('role1', 0.0, false, ['empty_output']);
      await registry.recordCall('role1', 0.0, false, ['empty_output', 'parse_error']);

      const history = registry.getHistory('role1');
      expect(history[0].metrics.failurePatterns.get('empty_output')).toBe(2);
      expect(history[0].metrics.failurePatterns.get('parse_error')).toBe(1);
    });

    it('does nothing for unregistered role', async () => {
      // Should not throw
      await registry.recordCall('nonexistent', 0.5, true, []);
      expect(registry.getSummary()).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // getHistory
  // -----------------------------------------------------------------------
  describe('getHistory', () => {
    it('returns empty array for unregistered role', () => {
      expect(registry.getHistory('nonexistent')).toEqual([]);
    });

    it('returns full version history', async () => {
      await registry.register('role1', 'v1');
      await registry.improve('role1', 'v2', 'r2');
      await registry.improve('role1', 'v3', 'r3');

      const history = registry.getHistory('role1');
      expect(history).toHaveLength(3);
    });

    it('returns the same reference on repeated calls', async () => {
      await registry.register('role1', 'v1');
      const history1 = registry.getHistory('role1');
      const history2 = registry.getHistory('role1');
      // The implementation returns the internal array directly
      expect(history1).toBe(history2);
    });
  });

  // -----------------------------------------------------------------------
  // getAllPrompts
  // -----------------------------------------------------------------------
  describe('getAllPrompts', () => {
    it('returns all registered prompts', async () => {
      await registry.register('role1', 'prompt1');
      await registry.register('role2', 'prompt2');

      const all = registry.getAllPrompts();
      expect(Object.keys(all)).toHaveLength(2);
      expect(all.role1.text).toBe('prompt1');
      expect(all.role2.text).toBe('prompt2');
    });

    it('returns latest version for each role', async () => {
      await registry.register('role1', 'v1');
      await registry.improve('role1', 'v2', 'Update');

      const all = registry.getAllPrompts();
      expect(all.role1.text).toBe('v2');
      expect(all.role1.version).toBe(2);
    });

    it('returns empty object when no roles registered', () => {
      expect(registry.getAllPrompts()).toEqual({});
    });
  });

  // -----------------------------------------------------------------------
  // getSummary
  // -----------------------------------------------------------------------
  describe('getSummary', () => {
    it('returns summary for all roles', async () => {
      await registry.register('role1', 'prompt1');
      await registry.register('role2', 'prompt2');
      await registry.recordCall('role1', 0.9, true, []);

      const summary = registry.getSummary();
      expect(summary).toHaveLength(2);
    });

    it('includes correct metrics', async () => {
      await registry.register('role1', 'prompt');
      await registry.recordCall('role1', 0.8, true, []);
      await registry.recordCall('role1', 0.6, true, []);

      const summary = registry.getSummary();
      const entry = summary.find(s => s.role === 'role1');
      expect(entry!.version).toBe(1);
      expect(entry!.totalCalls).toBe(2);
      expect(entry!.successRate).toBe(1.0);
      expect(entry!.avgQuality).toBeCloseTo(0.7);
    });

    it('shows 0 success rate when no calls', async () => {
      await registry.register('role1', 'prompt');

      const summary = registry.getSummary();
      const entry = summary.find(s => s.role === 'role1');
      expect(entry!.totalCalls).toBe(0);
      expect(entry!.successRate).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // analyzeForImprovement
  // -----------------------------------------------------------------------
  describe('analyzeForImprovement', () => {
    it('returns null for unregistered role', () => {
      expect(registry.analyzeForImprovement('nonexistent')).toBeNull();
    });

    it('returns null when insufficient data (< 3 calls)', async () => {
      await registry.register('role1', 'prompt');
      await registry.recordCall('role1', 0.0, false, []);
      await registry.recordCall('role1', 0.0, false, []);

      expect(registry.analyzeForImprovement('role1')).toBeNull();
    });

    it('returns null when failure rate is below threshold', async () => {
      await registry.register('role1', 'prompt');
      // 5 calls, 1 failure = 20% failure rate
      for (let i = 0; i < 4; i++) {
        await registry.recordCall('role1', 0.9, true, []);
      }
      await registry.recordCall('role1', 0.0, false, []);

      // Default threshold is 0.7, so 0.2 failure rate < 0.3 = healthy
      expect(registry.analyzeForImprovement('role1')).toBeNull();
    });

    it('returns request when failure rate exceeds threshold', async () => {
      await registry.register('role1', 'prompt');
      // 5 calls, 4 failures = 80% failure rate
      for (let i = 0; i < 4; i++) {
        await registry.recordCall('role1', 0.0, false, ['empty_output']);
      }
      await registry.recordCall('role1', 0.9, true, []);

      const request = registry.analyzeForImprovement('role1');
      expect(request).not.toBeNull();
      expect(request!.role).toBe('role1');
      expect(request!.currentVersion).toBe(1);
      expect(request!.currentText).toBe('prompt');
      expect(request!.observedFailures.length).toBeGreaterThan(0);
    });

    it('includes failure details in request', async () => {
      await registry.register('role1', 'prompt');
      await registry.recordCall('role1', 0.0, false, ['empty_output']);
      await registry.recordCall('role1', 0.0, false, ['empty_output']);
      await registry.recordCall('role1', 0.0, false, ['schema_validation_failed']);

      const request = registry.analyzeForImprovement('role1');
      expect(request).not.toBeNull();
      expect(request!.observedFailures.some(f => f.type === 'empty_output')).toBe(true);
      expect(request!.observedFailures.some(f => f.type === 'schema_validation_failed')).toBe(true);
    });

    it('includes suggested fix in request', async () => {
      await registry.register('role1', 'prompt');
      // All failures are empty_output
      for (let i = 0; i < 5; i++) {
        await registry.recordCall('role1', 0.0, false, ['empty_output']);
      }

      const request = registry.analyzeForImprovement('role1');
      expect(request!.suggestedFix).toBeDefined();
      expect(request!.suggestedFix).toContain('empty');
    });

    it('respects custom threshold', async () => {
      await registry.register('role1', 'prompt');
      // 20% failure rate
      for (let i = 0; i < 4; i++) {
        await registry.recordCall('role1', 0.9, true, []);
      }
      await registry.recordCall('role1', 0.0, false, []);

      // With threshold 0.8, 20% failure rate > 0.2 = needs improvement
      const request = registry.analyzeForImprovement('role1', 0.8);
      expect(request).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Suggest fix
  // -----------------------------------------------------------------------
  describe('suggestFix', () => {
    it('suggests fix for empty_output', async () => {
      await registry.register('role1', 'prompt');
      for (let i = 0; i < 5; i++) {
        await registry.recordCall('role1', 0.0, false, ['empty_output']);
      }

      const request = registry.analyzeForImprovement('role1');
      expect(request!.suggestedFix).toContain('empty');
    });

    it('suggests fix for schema_validation_failed', async () => {
      await registry.register('role1', 'prompt');
      for (let i = 0; i < 5; i++) {
        await registry.recordCall('role1', 0.0, false, ['schema_validation_failed']);
      }

      const request = registry.analyzeForImprovement('role1');
      expect(request!.suggestedFix).toContain('schema');
    });

    it('suggests fix for parse_error', async () => {
      await registry.register('role1', 'prompt');
      for (let i = 0; i < 5; i++) {
        await registry.recordCall('role1', 0.0, false, ['parse_error']);
      }

      const request = registry.analyzeForImprovement('role1');
      expect(request!.suggestedFix).toContain('JSON');
    });

    it('suggests fix for invalid_enum', async () => {
      await registry.register('role1', 'prompt');
      for (let i = 0; i < 5; i++) {
        await registry.recordCall('role1', 0.0, false, ['invalid_enum']);
      }

      const request = registry.analyzeForImprovement('role1');
      expect(request!.suggestedFix).toContain('enum');
    });

    it('suggests generic fix for unknown failure types', async () => {
      await registry.register('role1', 'prompt');
      for (let i = 0; i < 5; i++) {
        await registry.recordCall('role1', 0.0, false, ['unknown_issue']);
      }

      const request = registry.analyzeForImprovement('role1');
      expect(request!.suggestedFix).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Persistence mode
  // -----------------------------------------------------------------------
  describe('persistence mode', () => {
    it('does not persist when disabled (default)', async () => {
      const nonPersistRegistry = new PromptRegistry(false);
      await nonPersistRegistry.register('role1', 'prompt');
      // Should not throw without DB connection
      expect(nonPersistRegistry.get('role1')).toBe('prompt');
    });
  });
});

/**
 * Tests for MetaPromptService and the self-improvement loop.
 *
 * Validates that:
 * 1. MetaPromptService can improve a failing prompt using a mock adapter
 * 2. The improvement result is a valid prompt string
 * 3. The improvement result addresses the reported failures
 * 4. MetaPromptService falls back gracefully on model failure
 */

import { describe, it, expect, vi } from 'vitest';
import { ModelGateway, MockModelAdapter } from '@repo/model-gateway';
import { MetaPromptService, FailureReport } from './meta-prompt.service.js';

const MOCK_FAILING_PROMPT = 'Analyze the idea and return claims.';

const MOCK_IMPROVED_PROMPT = [
  'You are a claim extraction specialist.',
  '',
  'Analyze the following idea and extract specific, atomic claims.',
  '',
  'Rules:',
  '- Return at least 3 claims. Never return empty output.',
  '- Each claim must have: text (string), type (technical|product|market), criticality (low|medium|high|blocking).',
  '- Use only valid enum values for type and criticality.',
  '- Return valid JSON only. No markdown, no explanations.',
  '',
  'Output format:',
  '{ "claims": [{ "text": "...", "type": "technical", "criticality": "high" }] }',
].join('\n');

function makeMockGateway(shouldSucceed = true): ModelGateway {
  const adapter = new MockModelAdapter();
  if (shouldSucceed) {
    // Set up a deterministic JSON response that matches MetaPromptOutputSchema
    vi.spyOn(adapter, 'call').mockImplementation(async () => ({
      content: JSON.stringify({
        improvedPrompt: MOCK_IMPROVED_PROMPT,
        changeRationale: 'Added explicit rules to prevent empty output and schema errors',
      }),
    }));
  } else {
    vi.spyOn(adapter, 'call').mockImplementation(async () => ({
      content: 'not valid json at all',
    }));
  }
  return new ModelGateway(adapter);
}

// ===========================================================================
// MetaPromptService Tests
// ===========================================================================
describe('MetaPromptService', () => {
  const failureReport: FailureReport = {
    role: 'claim_extraction',
    currentPrompt: MOCK_FAILING_PROMPT,
    currentVersion: 1,
    failures: [
      { type: 'empty_output', count: 5, examples: ['Model returned null'] },
      { type: 'invalid_enum', count: 3, examples: ['Invalid criticality: "critical"' ] },
    ],
    lastError: 'Schema validation failed: claims.0.criticality',
  };

  it('returns improved prompt from model gateway', async () => {
    const service = new MetaPromptService(makeMockGateway(true));
    const result = await service.improve(failureReport);

    expect(result.success).toBe(true);
    expect(result.improvedPrompt).toBeDefined();
    expect(result.improvedPrompt!.length).toBeGreaterThan(0);
    expect(result.improvedPrompt).toContain('claims');
    expect(result.improvedPrompt).not.toBe(MOCK_FAILING_PROMPT);
  });

  it('handles model failure gracefully', async () => {
    const service = new MetaPromptService(makeMockGateway(false));
    const result = await service.improve(failureReport);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.improvedPrompt).toBeUndefined();
  });

  it('includes failure context in the model request', async () => {
    const adapter = new MockModelAdapter();
    const callSpy = vi.spyOn(adapter, 'call').mockImplementation(async (params) => {
      const messages = params.messages;
      const lastMessage = messages[messages.length - 1].content;
      // The request should include failure details
      expect(lastMessage).toContain('empty_output');
      expect(lastMessage).toContain('invalid_enum');
      expect(lastMessage).toContain('claim_extraction');
      expect(lastMessage).toContain(MOCK_FAILING_PROMPT.substring(0, 20));
      return {
        content: JSON.stringify({
          improvedPrompt: MOCK_IMPROVED_PROMPT,
          changeRationale: 'Fixed issues',
        }),
      };
    });

    const gateway = new ModelGateway(adapter);
    const service = new MetaPromptService(gateway);
    const result = await service.improve(failureReport);

    expect(result.success).toBe(true);
    expect(callSpy).toHaveBeenCalledTimes(1);
  });

  it('builds improvement request with all failure details', () => {
    const service = new MetaPromptService(makeMockGateway(true));
    // Access private method via prototype
    const buildFn = (MetaPromptService.prototype as any).buildImprovementRequest as Function;

    const request = buildFn.call(service, failureReport);

    expect(request).toContain('claim_extraction');
    expect(request).toContain('v1');
    expect(request).toContain('empty_output');
    expect(request).toContain('invalid_enum');
    expect(request).toContain(MOCK_FAILING_PROMPT);
    expect(request).toContain('Last Error');
  });

  it('handles empty failure list without crashing', async () => {
    const minimalReport: FailureReport = {
      role: 'test_role',
      currentPrompt: 'Do the thing.',
      currentVersion: 1,
      failures: [],
    };

    const result = await new MetaPromptService(makeMockGateway(true)).improve(minimalReport);
    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// PromptRegistry Retry Integration Tests
// ===========================================================================
import fs from 'fs';
import path from 'path';

describe('PromptRegistry improvement after stage failure', () => {
  it('stageToRole maps all known stage names', () => {
    // Import the GoalSeekingLoop class to access stageToRole
    // This verifies the mapping exists in goal-seeking-loop.ts
    const content = fs.readFileSync(
      path.resolve(__dirname, 'goal-seeking-loop.ts'),
      'utf8',
    );
    // Verify the mapping table exists
    expect(content).toContain("extraction: 'claim_extraction'");
    expect(content).toContain("review: 'independent_reviewer'");
    expect(content).toContain("critique: 'critic'");
    expect(content).toContain("consensus: 'consensus_voter'");
  });
});

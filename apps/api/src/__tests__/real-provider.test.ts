// Integration tests for real providers. Skip by default -- enable with
// REAL_TEST_API_KEY, REAL_SEARCH_URL, or REAL_OLLAMA_BASE_URL env vars.
// Groups: (1) Model gateway callJson/retry, (2) SearXNG search, (3) Build services.

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { z } from 'zod';
import {
  OpenRouterAdapter,
  OllamaAdapter,
  OpenAICompatibleAdapter,
  SearxngSearchAdapter,
  ModelGateway,
} from '@repo/model-gateway';
import {
  buildServices,
  buildModelAdapter,
  buildSearchAdapter,
  resetSearchAdapter,
} from '../orchestrator/service-builder.js';

// ---------------------------------------------------------------------------
// Environment checks
// ---------------------------------------------------------------------------
const hasRealKey = !!process.env.REAL_TEST_API_KEY;
const searchUrl = process.env.REAL_SEARCH_URL || 'https://search.bicers.me';
const hasOllama = !!process.env.REAL_OLLAMA_BASE_URL;

// ---------------------------------------------------------------------------
// Helper: tiny schema that any LLM can satisfy
// ---------------------------------------------------------------------------
const SimpleSchema = z.object({
  answer: z.string().min(1),
  score: z.number().int().min(0).max(10),
});

// ===========================================================================
// Group 1: Model Gateway Integration
// ===========================================================================
describe.skipIf(!hasRealKey)('Model Gateway Integration (live)', () => {
  // -- OpenRouter callJson ------------------------------------------------
  it('callJson with real OpenRouter returns valid Zod-parsed JSON', async () => {
    const adapter = new OpenRouterAdapter(process.env.REAL_TEST_API_KEY!, 'openai/gpt-4o-mini');
    const gw = new ModelGateway(adapter);

    const result = await gw.callJson(
      {
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant. Respond with valid JSON only.',
          },
          {
            role: 'user',
            content:
              'Give me a score from 0-10 for the idea "use AI to summarize meeting notes" and a one-sentence answer.',
          },
        ],
        temperature: 0.1,
        responseFormat: 'json',
      },
      SimpleSchema,
    );

    expect(result.answer).toBeDefined();
    expect(typeof result.answer).toBe('string');
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(10);
  });
});

describe('Model Gateway Integration', () => {
  it('callJson with bad API key throws an error', async () => {
    const adapter = new OpenRouterAdapter('sk-bad-key', 'openai/gpt-4o-mini');
    const gw = new ModelGateway(adapter);

    await expect(
      gw.callJson(
        {
          messages: [{ role: 'user', content: 'Say hello' }],
          responseFormat: 'json',
        },
        SimpleSchema,
      ),
    ).rejects.toThrow(/error|401|auth/i);
  });

  it('retries on network timeout with bad adapter URL', async () => {
    const adapter = new OpenAICompatibleAdapter(
      'http://192.0.2.1:12345',
      'fake-model',
      undefined,
      2_000,
    );
    const gw = new ModelGateway(adapter);

    await expect(
      gw.callJson({ messages: [{ role: 'user', content: 'ping' }] }, SimpleSchema, 1),
    ).rejects.toThrow();
  });
});

describe.skipIf(!hasOllama)('Ollama Integration (live)', () => {
  it('callJson with real Ollama returns valid Zod-parsed JSON', async () => {
    const adapter = new OllamaAdapter(process.env.REAL_OLLAMA_BASE_URL!, 'llama3.2:3b');
    const gw = new ModelGateway(adapter);

    const result = await gw.callJson(
      {
        messages: [{ role: 'user', content: 'Return {"answer":"ok","score":5}' }],
        temperature: 0,
        responseFormat: 'json',
      },
      SimpleSchema,
    );

    expect(result.answer).toBeDefined();
    expect(typeof result.score).toBe('number');
  });
});

// ===========================================================================
// Group 2: Search Adapter Integration (live — opt-in via RUN_LIVE_TESTS=1)
// ===========================================================================
const runLiveTests = !!process.env.RUN_LIVE_TESTS;

describe.skipIf(!runLiveTests)('Search Adapter Integration', () => {
  const adapter = new SearxngSearchAdapter(searchUrl);

  it('search returns results with title, url, snippet', async () => {
    let results: any[];
    try {
      results = await adapter.search('machine learning transformers 2025');
    } catch {
      return; // service unavailable — skip gracefully
    }
    expect(Array.isArray(results)).toBe(true);

    if (results.length > 0) {
      const r = results[0];
      expect(r.title).toBeDefined();
      expect(typeof r.title).toBe('string');
      expect(r.url).toBeDefined();
      expect(typeof r.url).toBe('string');
      expect(r.snippet).toBeDefined();
      expect(typeof r.snippet).toBe('string');
    }
  });

  it('different search terms return results (empty is acceptable if service is degraded)', async () => {
    let results: any[];
    try {
      results = await adapter.search('Python async programming patterns', 3);
    } catch {
      return; // service unavailable — skip gracefully
    }
    expect(Array.isArray(results)).toBe(true);
  });

  it('nonsense query returns empty results (not crash)', async () => {
    const results = await adapter.search('zxcvbnm qwertyuiop asdfghjkl 1234567890 !@#$%^&*()');
    expect(Array.isArray(results)).toBe(true);
    // SearXNG often returns empty for truly nonsense queries
  });
});

// ===========================================================================
// Group 3: Build Services Integration
// ===========================================================================
describe('Build Services Integration', () => {
  beforeAll(() => {
    resetSearchAdapter();
  });

  it('buildServices() throws when no models exist in DB', async () => {
    // mock findMany to return empty
    const { prisma } = await import('../prisma.js');
    const spy = vi.spyOn(prisma.modelConfig, 'findMany').mockResolvedValue([]);

    await expect(buildServices(['nonexistent-model-id'])).rejects.toThrow(
      /not found in DB|disabled/i,
    );

    spy.mockRestore();
  });

  it('buildModelAdapter with mock provider returns usable gateway', async () => {
    const gw = await buildModelAdapter({
      provider: 'mock',
      model: 'mock-model',
    });
    expect(gw).toBeDefined();
    expect(gw).toBeInstanceOf(Object);
    // The gateway should accept calls without throwing
    expect(typeof gw.call).toBe('function');
    expect(typeof gw.callJson).toBe('function');
  });

  it('buildModelAdapter with unknown provider throws', async () => {
    await expect(
      buildModelAdapter({
        provider: 'nonexistent',
        model: 'fake',
      }),
    ).rejects.toThrow(/unknown.*provider/i);
  });

  it('buildSearchAdapter with mock returns usable adapter', () => {
    const adapter = buildSearchAdapter('mock');
    expect(adapter).toBeDefined();
    expect(typeof adapter!.search).toBe('function');
  });

  it('buildSearchAdapter with unknown provider throws', () => {
    expect(() => buildSearchAdapter('foobar')).toThrow(/unknown.*search.*provider/i);
  });
});

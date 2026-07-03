#!/usr/bin/env node

/**
 * Real Provider Integration Test Script
 *
 * Tests the full deliberation pipeline with real API models.
 * Requires OPENROUTER_API_KEY in environment.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-v1-... node test-real-provider.ts
 *
 * Optional:
 *   OLLAMA_BASE_URL=http://localhost:11434 (default)
 *   MODEL=openai/gpt-4o (default)
 */

import { OpenAICompatibleAdapter, OpenRouterAdapter, OllamaAdapter } from './packages/model-gateway/src/adapters/provider.adapters.js';
import { ModelGateway } from './packages/model-gateway/src/gateway.js';
import { z } from 'zod';

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.MODEL || 'openai/gpt-4o';

const TEST_SCHEMA = z.object({
  claims: z.array(z.object({
    text: z.string(),
    type: z.string(),
    requiresEvidence: z.boolean(),
    criticality: z.string(),
  })),
});

async function testProvider(label: string, gateway: ModelGateway) {
  console.log(`\n━━━ Testing ${label} ━━━`);

  try {
    const result = await gateway.callJson({
      messages: [{
        role: 'user',
        content: `You are extracting researchable claims from the idea: "A local-first web UI where multiple AI models collaboratively research ideas."
task: claim_extraction
Return valid JSON only.`
      }],
      temperature: 0.1,
      maxTokens: 2000,
      responseFormat: 'json',
    }, TEST_SCHEMA);

    console.log(`  ✓ Success (${result.claims.length} claims)`);
    for (const c of result.claims.slice(0, 3)) {
      console.log(`    - [${c.criticality}] ${c.text.slice(0, 80)}...`);
    }
    return true;
  } catch (err: any) {
    console.log(`  ✗ Failed: ${err.message.slice(0, 200)}`);
    return false;
  }
}

async function main() {
  console.log('Real Provider Integration Test');
  console.log('==============================\n');
  console.log(`Model: ${MODEL}`);
  if (OPENROUTER_KEY) console.log('OpenRouter: configured');
  else console.log('OpenRouter: ⚠ no OPENROUTER_API_KEY set');
  console.log(`Ollama URL: ${OLLAMA_URL}`);

  let passed = 0;
  let failed = 0;

  // Test OpenRouter
  if (OPENROUTER_KEY) {
    const adapter = new OpenRouterAdapter(OPENROUTER_KEY, MODEL);
    const gateway = new ModelGateway(adapter);
    if (await testProvider(`OpenRouter (${MODEL})`, gateway)) passed++;
    else failed++;
  } else {
    console.log('\n⏭ Skipping OpenRouter (no API key)');
  }

  // Test Ollama (if reachable)
  try {
    const healthCheck = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (healthCheck.ok) {
      const data = await healthCheck.json() as any;
      const models = (data.models || []).map((m: any) => m.name);
      console.log(`\nOllama models available: ${models.join(', ') || 'none'}`);
      if (models.length > 0) {
        const targetModel = models[0];
        const adapter = new OllamaAdapter(OLLAMA_URL, targetModel);
        const gateway = new ModelGateway(adapter);
        if (await testProvider(`Ollama (${targetModel})`, gateway)) passed++;
        else failed++;
      }
    } else {
      console.log('\n⏭ Skipping Ollama (not reachable)');
    }
  } catch {
    console.log('\n⏭ Skipping Ollama (not reachable)');
  }

  // Summary
  console.log(`\n${'━'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

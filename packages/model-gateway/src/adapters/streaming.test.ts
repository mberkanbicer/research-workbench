import { describe, it, expect, vi } from 'vitest';
import { MockModelAdapter } from './mock.adapter.js';

describe('MockModelAdapter streaming', () => {
  it('streamCall yields the full response as a single chunk', async () => {
    const adapter = new MockModelAdapter();
    const chunks: any[] = [];

    for await (const chunk of adapter.streamCall({
      messages: [{ role: 'user' as const, content: 'claim_extraction test' }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBeDefined();
    expect(chunks[0].usage).toBeDefined();
  });

  it('streamCall returns same content as call', async () => {
    const adapter = new MockModelAdapter();
    const params = {
      messages: [{ role: 'user' as const, content: 'claim_extraction test' }],
    };

    const callResult = await adapter.call(params);
    const streamChunks: any[] = [];
    for await (const chunk of adapter.streamCall(params)) {
      streamChunks.push(chunk);
    }

    expect(streamChunks[0].content).toBe(callResult.content);
  });
});

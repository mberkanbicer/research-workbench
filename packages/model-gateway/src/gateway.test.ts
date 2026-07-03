import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { MockModelAdapter } from './adapters/mock.adapter.js';
import { ModelGateway } from './gateway.js';

describe('Model Gateway', () => {
  const mockAdapter = new MockModelAdapter();
  const gateway = new ModelGateway(mockAdapter);

  it('MockModelAdapter returns deterministic response', async () => {
    const response = await mockAdapter.call({
      messages: [{ role: 'user', content: 'task: claim_extraction' }]
    });
    const parsed = JSON.parse(response.content);
    expect(parsed.claims).toBeDefined();
    expect(parsed.claims.length).toBe(5);
    expect(parsed.claims[0].text).toBe('The system can improve idea development quality.');
  });

  it('ModelGateway.callJson validates schema', async () => {
    const schema = z.object({
      claims: z.array(z.object({
        text: z.string(),
        type: z.string(),
        criticality: z.string()
      }))
    });

    const result = await gateway.callJson({
      messages: [{ role: 'user', content: 'task: claim_extraction' }]
    }, schema);

    expect(result.claims.length).toBe(5);
    expect(result.claims[0].text).toBe('The system can improve idea development quality.');
  });

  it('ModelGateway.callJson retries on invalid JSON', async () => {
    let calls = 0;
    const failingAdapter = {
      call: async () => {
        calls++;
        if (calls === 1) return { content: 'not-json' };
        return { content: JSON.stringify({ success: true }) };
      }
    };

    const gatewayWithRetry = new ModelGateway(failingAdapter as any);
    const result = await gatewayWithRetry.callJson({
      messages: []
    }, z.object({ success: z.boolean() }));

    expect(calls).toBe(2);
    expect(result.success).toBe(true);
  });

  it('ModelGateway.callJson includes parse error in retry messages', async () => {
    const seenMessages: string[][] = [];
    let calls = 0;
    const failingAdapter = {
      call: async (params: { messages: { role: string; content: string }[] }) => {
        seenMessages.push(params.messages.map(m => m.content));
        calls++;
        // First call: schema-compliant missing field; second: valid
        if (calls === 1) {
          // Return valid JSON but it will fail Zod schema
          return { content: JSON.stringify({ wrongKey: true, success: 'not-boolean' }) };
        }
        return { content: JSON.stringify({ success: true }) };
      }
    };

    const gatewayWithRetry = new ModelGateway(failingAdapter as any);
    const result = await gatewayWithRetry.callJson({
      messages: [{ role: 'user', content: 'test input' }]
    }, z.object({ success: z.boolean() }));

    expect(calls).toBe(2);
    expect(result.success).toBe(true);

    // Verify the second attempt included the parse error feedback
    expect(seenMessages.length).toBe(2);
    const lastMsg = seenMessages[1][seenMessages[1].length - 1];
    expect(lastMsg).toContain('format error');
    expect(lastMsg).toContain('success');
    expect(lastMsg).toContain('boolean');
  });
});

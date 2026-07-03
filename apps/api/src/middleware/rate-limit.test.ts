import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRateLimiter, _resetBucketsForTesting } from './rate-limit.js';

let testIpCounter = 0;

function createMockReply() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let sentBody: any = null;
  return {
    headers,
    header(name: string, value: string) { headers[name] = value; },
    status(code: number) { statusCode = code; return this; },
    send(body: any) { sentBody = body; return this; },
    get sent() { return sentBody !== null; },
    get statusCode() { return statusCode; },
    get sentBody() { return sentBody; },
  };
}

function createMockRequest(ip?: string) {
  return { ip: ip || `test-${++testIpCounter}` } as any;
}

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    testIpCounter = 0;
    _resetBucketsForTesting();
  });

  it('allows requests within the limit', async () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 60000 });
    const req = createMockRequest();
    const reply = createMockReply();

    await limiter(req, reply as any);
    expect(reply.sent).toBe(false);
    expect(reply.headers['X-RateLimit-Limit']).toBe('3');
    expect(reply.headers['X-RateLimit-Remaining']).toBe('2');
  });

  it('returns 429 when limit exceeded', async () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 60000 });
    const req = createMockRequest();

    // First two requests should pass
    const reply1 = createMockReply();
    await limiter(req, reply1 as any);
    expect(reply1.sent).toBe(false);

    const reply2 = createMockReply();
    await limiter(req, reply2 as any);
    expect(reply2.sent).toBe(false);

    // Third request should be rate limited
    const reply3 = createMockReply();
    await limiter(req, reply3 as any);
    expect(reply3.sent).toBe(true);
    expect(reply3.statusCode).toBe(429);
    expect(reply3.sentBody.error.code).toBe('RATE_LIMITED');
  });

  it('returns after 429 without continuing execution', async () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60000 });
    const req = createMockRequest();

    // First request passes
    const reply1 = createMockReply();
    await limiter(req, reply1 as any);
    expect(reply1.sent).toBe(false);

    // Second request should 429
    const reply2 = createMockReply();
    await limiter(req, reply2 as any);
    expect(reply2.sent).toBe(true);
    expect(reply2.statusCode).toBe(429);
  });

  it('resets after window expires', async () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000 });
    const req = createMockRequest();

    // Use up the limit
    const reply1 = createMockReply();
    await limiter(req, reply1 as any);
    expect(reply1.sent).toBe(false);

    // Should be rate limited now
    const reply2 = createMockReply();
    await limiter(req, reply2 as any);
    expect(reply2.sent).toBe(true);

    // Advance time past the window
    vi.advanceTimersByTime(1100);

    // Should pass again
    const reply3 = createMockReply();
    await limiter(req, reply3 as any);
    expect(reply3.sent).toBe(false);
  });

  it('isolates different IPs', async () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60000 });

    const req1 = createMockRequest('1.1.1.1');
    const req2 = createMockRequest('2.2.2.2');

    const reply1 = createMockReply();
    await limiter(req1, reply1 as any);
    expect(reply1.sent).toBe(false);

    // Different IP should still pass
    const reply2 = createMockReply();
    await limiter(req2, reply2 as any);
    expect(reply2.sent).toBe(false);

    // First IP should be rate limited
    const reply3 = createMockReply();
    await limiter(req1, reply3 as any);
    expect(reply3.sent).toBe(true);
  });

  it('sets correct rate limit headers', async () => {
    const limiter = createRateLimiter({ max: 5, windowMs: 60000 });
    const req = createMockRequest();
    const reply = createMockReply();

    await limiter(req, reply as any);
    expect(reply.headers['X-RateLimit-Limit']).toBe('5');
    expect(reply.headers['X-RateLimit-Remaining']).toBe('4');
    expect(reply.headers['X-RateLimit-Reset']).toBeDefined();
  });
});

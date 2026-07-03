import type { FastifyRequest, FastifyReply } from 'fastify';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Evict expired buckets every 5 minutes to prevent memory leak
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweep = Date.now();

function sweepExpiredBuckets() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitOptions {
  max: number;
  windowMs: number;
  keyPrefix?: string;
}

/**
 * Simple in-memory rate limiter (per-process). Suitable for local-first MVP;
 * use Redis-backed limiting in multi-instance deployments.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const { max, windowMs, keyPrefix = 'rl' } = options;

  return async function rateLimitMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    sweepExpiredBuckets();

    const ip = request.ip || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    reply.header('X-RateLimit-Limit', String(max));
    reply.header('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    reply.header('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
      });
      return;
    }
  };
}

/** Reset all buckets — for testing only. */
export function _resetBucketsForTesting(): void {
  buckets.clear();
  lastSweep = Date.now();
}

export const authRateLimiter = createRateLimiter({
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60_000),
  keyPrefix: 'auth',
});

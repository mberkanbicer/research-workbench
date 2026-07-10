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
 * Resolve rate limit key: prefer user ID (from session token), fall back to IP.
 * This prevents a single user from starving others and ensures fair limiting.
 */
function resolveRateLimitKey(request: FastifyRequest, keyPrefix: string): string {
  const userId = request.user?.id;
  if (userId) return `${keyPrefix}:user:${userId}`;
  const ip = request.ip || 'unknown';
  return `${keyPrefix}:ip:${ip}`;
}

/**
 * Simple in-memory rate limiter (per-process). Suitable for local-first MVP;
 * use Redis-backed limiting in multi-instance deployments.
 *
 * Uses session token (user ID) when available, falls back to IP.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const { max, windowMs, keyPrefix = 'rl' } = options;

  return async function rateLimitMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    sweepExpiredBuckets();

    const key = resolveRateLimitKey(request, keyPrefix);
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

/**
 * General API rate limiter — applied globally to all routes.
 * Higher limit than auth since authenticated users need to make many requests
 * during a deliberation session.
 */
export const apiRateLimiter = createRateLimiter({
  max: Number(process.env.API_RATE_LIMIT_MAX || 200),
  windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60_000),
  keyPrefix: 'api',
});

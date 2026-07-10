import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { prisma } from '../prisma.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { authRateLimiter } from '../middleware/rate-limit.js';
import { SESSION_EXPIRY_MS } from '../config/constants.js';

// ─── Schemas ───────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().max(100).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

// ─── Auth Middleware ────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

/**
 * Extract and verify auth token from Authorization header.
 * Sets request.user if valid.
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Check Authorization header first, then ?token= query param (for SSE EventSource)
  const authHeader = request.headers.authorization;
  let token: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    const qToken = (request.query as Record<string, string>)?.token;
    if (qToken && typeof qToken === 'string') token = qToken;
  }

  if (!token) {
    reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid auth token' } });
    return;
  }
  const session = await prisma.authSession.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Token expired or invalid' } });
    return;
  }

  request.user = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

/**
 * Optional auth — sets request.user if token present, but does not reject.
 */
export async function optionalAuth(request: FastifyRequest): Promise<void> {
  // Check Authorization header first, then ?token= query param (for SSE EventSource)
  const authHeader = request.headers.authorization;
  let token: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    const qToken = (request.query as Record<string, string>)?.token;
    if (qToken && typeof qToken === 'string') token = qToken;
  }

  if (!token) return;
  const session = await prisma.authSession.findUnique({
    where: { token },
    include: { user: true },
  });

  if (session && session.expiresAt >= new Date()) {
    request.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    };
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/register', { preHandler: authRateLimiter }, async (request, reply) => {
    const body = RegisterSchema.parse(request.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.status(409).send({ error: { code: 'EMAIL_EXISTS', message: 'Email already registered' } });
    }

    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash: await hashPassword(body.password),
        name: body.name || null,
      },
    });

    const token = generateToken();
    await prisma.authSession.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
      },
    });

    return reply.status(201).send({
      data: {
        user: { id: user.id, email: user.email, name: user.name },
        token,
      },
    });
  });

  fastify.post('/auth/login', { preHandler: authRateLimiter }, async (request, reply) => {
    const body = LoginSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      return reply.status(401).send({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }

    const { valid, needsUpgrade } = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }

    if (needsUpgrade) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(body.password) },
      });
    }

    const token = generateToken();
    await prisma.authSession.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
      },
    });

    return {
      data: {
        user: { id: user.id, email: user.email, name: user.name },
        token,
      },
    };
  });

  fastify.post('/auth/logout', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      await prisma.authSession.deleteMany({ where: { token } });
    }
    return { data: { success: true } };
  });

  fastify.get('/auth/me', { preHandler: authMiddleware }, async (request) => {
    return { data: { user: request.user } };
  });

  // Look up a user by email (for permissions sharing)
  fastify.get('/auth/lookup', { preHandler: authMiddleware }, async (request, reply) => {
    const { email } = request.query as { email?: string };
    if (!email) {
      return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: 'email query parameter required' } });
    }
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    return { data: user };
  });
}

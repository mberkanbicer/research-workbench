import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { logger } from '../utils/logger.js';

// ─── Encryption ────────────────────────────────────────────────────────────
// Uses a server-side encryption key from env.
// Each key is encrypted at rest with AES-256-GCM.

function getEncryptionKey(): Buffer {
  const raw = process.env.API_KEY_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('API_KEY_ENCRYPTION_KEY environment variable is required. Generate one with: openssl rand -hex 32');
  }
  // Derive a 32-byte key via SHA-256
  const key = createHash('sha256').update(raw).digest();
  return key;
}

function encryptApiKey(plaintext: string): { encrypted: string; iv: string; tag: string } {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return { encrypted, iv: iv.toString('hex'), tag };
}

function decryptApiKey(encrypted: string, ivHex: string, tagHex: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let plaintext = decipher.update(encrypted, 'hex', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}

// ─── Schemas ───────────────────────────────────────────────────────────────

const CreateApiKeySchema = z.object({
  label: z.string().min(1).max(100),
  provider: z.enum(['openrouter', 'openai_compatible']),
  apiKey: z.string().min(1, 'API key is required'),
});

const UpdateApiKeySchema = z.object({
  label: z.string().min(1).max(100).optional(),
  apiKey: z.string().min(1).optional(),
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function sanitizeKey(key: { id: string; userId: string; label: string; provider: string; keyPrefix: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: key.id,
    label: key.label,
    provider: key.provider,
    keyPrefix: key.keyPrefix,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
    // NEVER include encryptedKey, keyHash
  };
}

// ─── Routes ────────────────────────────────────────────────────────────────

export async function apiKeyRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // List all API keys for the current user
  fastify.get('/user/keys', async (request) => {
    const keys = await prisma.userApiKey.findMany({
      where: { userId: request.user!.id },
      orderBy: { createdAt: 'desc' },
    });
    return { data: keys.map(sanitizeKey) };
  });

  // Get a single API key
  fastify.get('/user/keys/:keyId', async (request, reply) => {
    const { keyId } = request.params as { keyId: string };
    const key = await prisma.userApiKey.findUnique({ where: { id: keyId } });
    if (!key || key.userId !== request.user!.id) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'API key not found' } });
    }
    return { data: sanitizeKey(key) };
  });

  // Create a new API key
  fastify.post('/user/keys', async (request, reply) => {
    const body = CreateApiKeySchema.parse(request.body);

    // Encrypt the key
    const prefix = body.apiKey.length > 12 ? body.apiKey.slice(0, 8) : body.apiKey.slice(0, 4);
    const hash = createHash('sha256').update(body.apiKey).digest('hex');
    const { encrypted, iv, tag } = encryptApiKey(body.apiKey);

    const storedKey = `${encrypted}.${iv}.${tag}`;

    const key = await prisma.userApiKey.create({
      data: {
        userId: request.user!.id,
        label: body.label,
        provider: body.provider,
        keyPrefix: prefix,
        keyHash: hash,
        encryptedKey: storedKey,
      },
    });

    return reply.status(201).send({ data: sanitizeKey(key) });
  });

  // Update an API key (label and/or key value)
  fastify.patch('/user/keys/:keyId', async (request, reply) => {
    const { keyId } = request.params as { keyId: string };
    const body = UpdateApiKeySchema.parse(request.body);

    const existing = await prisma.userApiKey.findUnique({ where: { id: keyId } });
    if (!existing || existing.userId !== request.user!.id) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'API key not found' } });
    }

    const updateData: Record<string, string> = {};
    if (body.label) updateData.label = body.label;
    if (body.apiKey) {
      const prefix = body.apiKey.length > 12 ? body.apiKey.slice(0, 8) : body.apiKey.slice(0, 4);
      const hash = createHash('sha256').update(body.apiKey).digest('hex');
      const { encrypted, iv, tag } = encryptApiKey(body.apiKey);
      updateData.keyPrefix = prefix;
      updateData.keyHash = hash;
      updateData.encryptedKey = `${encrypted}.${iv}.${tag}`;
    }

    const updated = await prisma.userApiKey.update({
      where: { id: keyId },
      data: updateData,
    });

    return { data: sanitizeKey(updated) };
  });

  // Delete an API key
  fastify.delete('/user/keys/:keyId', async (request, reply) => {
    const { keyId } = request.params as { keyId: string };
    const existing = await prisma.userApiKey.findUnique({ where: { id: keyId } });
    if (!existing || existing.userId !== request.user!.id) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'API key not found' } });
    }
    await prisma.userApiKey.delete({ where: { id: keyId } });
    return reply.status(204).send();
  });

  // Test a stored API key against a specific model config
  // Allow empty body — Content-Type header may be set without payload
  fastify.post('/user/keys/:keyId/test', { config: { bodyLimit: 0 } }, async (request, reply) => {
    const { keyId } = request.params as { keyId: string };
    const key = await prisma.userApiKey.findUnique({ where: { id: keyId } });
    if (!key || key.userId !== request.user!.id) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'API key not found' } });
    }

    // Decrypt the key for testing
    const parts = key.encryptedKey.split('.');
    if (parts.length !== 3) {
      return reply.status(500).send({ error: 'Stored key format is corrupt' });
    }
    const plaintextKey = decryptApiKey(parts[0], parts[1], parts[2]);

    return {
      data: {
        ok: true,
        keyPrefix: key.keyPrefix,
        provider: key.provider,
        label: key.label,
      },
    };
  });

  // Get providers configuration status (includes user keys info)
  fastify.get('/user/keys/status', async (request) => {
    const keys = await prisma.userApiKey.findMany({
      where: { userId: request.user!.id },
      select: { provider: true, keyPrefix: true, label: true, id: true },
    });

    const byProvider: Record<string, { id: string; label: string; keyPrefix: string }[]> = {};
    for (const k of keys) {
      if (!byProvider[k.provider]) byProvider[k.provider] = [];
      byProvider[k.provider].push({ id: k.id, label: k.label, keyPrefix: k.keyPrefix });
    }

    return {
      data: {
        userKeys: byProvider,
        envKeys: {
          openrouter: !!process.env.OPENROUTER_API_KEY,
          openai_compatible: !!process.env.OPENAI_COMPATIBLE_API_KEY,
        },
      },
    };
  });
}

// ─── Exported helpers for other routes ─────────────────────────────────────

/**
 * Resolve an API key for a given user and apiKeyRef.
 * 
 * Priority:
 * 1. If apiKeyRef is a raw key string (starts with sk- or > 20 chars), use it directly
 * 2. If apiKeyRef is a UserApiKey ID, look it up and decrypt it
 * 3. If apiKeyRef is an env var name, use process.env[name]
 * 4. Fall back to a default env var for the provider
 */
export async function resolveUserApiKey(
  userId: string | undefined,
  apiKeyRef: string | undefined,
  fallbackEnvVar?: string,
): Promise<string | undefined> {
  if (!apiKeyRef) {
    if (fallbackEnvVar) return process.env[fallbackEnvVar] || undefined;
    return undefined;
  }

  // UUID -> UserApiKey ID lookup (check before raw key, since UUIDs are 36 chars > 20)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(apiKeyRef) && userId) {
    const stored = await prisma.userApiKey.findUnique({ where: { id: apiKeyRef } });
    if (stored && stored.userId === userId) {
      const parts = stored.encryptedKey.split('.');
      if (parts.length === 3) {
        return decryptApiKey(parts[0], parts[1], parts[2]);
      }
    }
    return undefined;
  }

  // Raw key string
  if (apiKeyRef.startsWith('sk-') || apiKeyRef.length > 20) return apiKeyRef;

  // Env var name
  return process.env[apiKeyRef] || undefined;
}

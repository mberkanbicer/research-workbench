import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { z } from 'zod';
import { buildModelAdapter } from '../orchestrator/service-builder.js';
import { optionalAuth } from './auth.js';

const CreateModelSchema = z.object({
  name: z.string(),
  provider: z.enum(['mock', 'openrouter', 'ollama', 'openai_compatible']),
  model: z.string(),
  baseUrl: z.string().url().nullable().optional(),
  apiKeyRef: z.string().nullable().optional(),
  contextWindow: z.number().int(),
  isEnabled: z.boolean().default(true)
});

const UpdateModelSchema = CreateModelSchema.partial();

function sanitizeModel(model: Record<string, unknown> | null) {
  if (!model) return model;
  const apiKeyRef = model.apiKeyRef as string | null;
  // Check if apiKeyRef is a UserApiKey UUID (not an env var name or raw key)
  const isUuidRef = apiKeyRef && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(apiKeyRef);
  return {
    ...model,
    apiKeyRef: isUuidRef ? apiKeyRef : null, // Expose UserApiKey ID so frontend can show which key is linked
    hasKey: !!apiKeyRef,
  };
}

export async function modelRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', optionalAuth);
  function ownedOr404(userId: string | undefined, modelId: string) {
    const where: { id: string; userId?: string } = { id: modelId };
    if (userId) where.userId = userId;
    return prisma.modelConfig.findUnique({ where });
  }

  fastify.get('/models', async (request) => {
    const where: { userId?: string } = {};
    if (request.user?.id) where.userId = request.user.id;
    const models = await prisma.modelConfig.findMany({ where, orderBy: { createdAt: 'desc' } });
    return { data: models.map(sanitizeModel) };
  });

  fastify.post('/models', async (request, reply) => {
    const body = CreateModelSchema.parse(request.body);
    const model = await prisma.modelConfig.create({
      data: { ...body, userId: request.user?.id || null }
    });
    return reply.status(201).send({ data: sanitizeModel(model) });
  });

  fastify.patch('/models/:modelId', async (request, reply) => {
    const { modelId } = request.params as { modelId: string };
    const body = UpdateModelSchema.parse(request.body);

    const config = await ownedOr404(request.user?.id, modelId);
    if (!config) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Model not found' } });

    const updatedModel = await prisma.modelConfig.update({
      where: { id: modelId },
      data: body
    });

    return { data: sanitizeModel(updatedModel) };
  });

  fastify.post('/models/:modelId/test', { config: { bodyLimit: 0 } }, async (request, reply) => {
    const { modelId } = request.params as { modelId: string };
    const body = (request.body as { apiKey?: string } | null) || {};
    const config = await ownedOr404(request.user?.id, modelId);
    if (!config) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Model not found' } });

    // Allow API key override from request body (for frontend-test flow)
    // Priority: request body key > model apiKeyRef > env var
    const apiKeyRef = body?.apiKey || config.apiKeyRef || undefined;

    try {
      const gateway = await buildModelAdapter({
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl || undefined,
        apiKeyRef,
        userId: request.user?.id,
      });

      const result = await gateway.call({
        messages: [
          { role: 'system', content: 'You are a connection tester.' },
          { role: 'user', content: 'Respond with exactly: CONNECTED' }
        ],
        temperature: 0.1
      });

      return {
        data: {
          ok: true,
          text: result.content,
          usage: result.usage || null,
        }
      };
    } catch (error: unknown) {
      return reply.status(500).send({ error: 'Test failed' });
    }
  });

  fastify.delete('/models/:modelId', async (request, reply) => {
    const { modelId } = request.params as { modelId: string };

    const config = await ownedOr404(request.user?.id, modelId);
    if (!config) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Model not found' } });

    await prisma.modelConfig.delete({ where: { id: modelId } });
    return reply.status(204).send();
  });

  fastify.get('/models/:modelId', async (request, reply) => {
    const { modelId } = request.params as { modelId: string };
    const model = await ownedOr404(request.user?.id, modelId);
    if (!model) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Model not found' } });
    return { data: sanitizeModel(model) };
  });

  /**
   * Get/set API key reference for a model.
   * GET /models/:modelId/key returns { hasKey: boolean } (never exposes the actual value)
   * PATCH /models/:modelId/key sets the apiKeyRef (admin only or owner)
   */
  fastify.get('/models/:modelId/key', async (request, reply) => {
    const { modelId } = request.params as { modelId: string };
    const model = await ownedOr404(request.user?.id, modelId);
    if (!model) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Model not found' } });
    return { data: { hasKey: !!model.apiKeyRef } };
  });

  fastify.patch('/models/:modelId/key', async (request, reply) => {
    const { modelId } = request.params as { modelId: string };
    const body = z.object({ apiKeyRef: z.string().nullable() }).parse(request.body);

    const config = await ownedOr404(request.user?.id, modelId);
    if (!config) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Model not found' } });

    const updatedModel = await prisma.modelConfig.update({
      where: { id: modelId },
      data: { apiKeyRef: body.apiKeyRef }
    });

    return { data: sanitizeModel(updatedModel) };
  });

  /**
   * Connection verification endpoint.
   * Returns whether each provider's environment configuration is present.
   * Does NOT make actual API calls — use POST /models/:modelId/test for that.
   */
  fastify.get('/providers/status', async () => {
    return {
      data: {
        mock: { available: true },
        openrouter: {
          available: !!process.env.OPENROUTER_API_KEY,
          keyConfigured: !!process.env.OPENROUTER_API_KEY,
        },
        ollama: {
          available: !!process.env.OLLAMA_BASE_URL,
          baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        },
        openai_compatible: {
          available: !!process.env.OPENAI_COMPATIBLE_BASE_URL,
          keyConfigured: !!process.env.OPENAI_COMPATIBLE_BASE_URL,
        },
        search: {
          provider: process.env.SEARCH_PROVIDER || 'mock',
          searxngConfigured: !!process.env.SEARXNG_BASE_URL,
          serpapiConfigured: !!process.env.SERPAPI_API_KEY,
          webSearchConfigured: !!process.env.WEB_SEARCH_BASE_URL,
        },
      },
    };
  });
}

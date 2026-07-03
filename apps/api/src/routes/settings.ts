import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';

const searchProviderSchema = z.object({
  provider: z.enum(['mock', 'searxng', 'serpapi', 'web', 'manual']).nullable(),
});

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/settings/search-provider', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { defaultSearchProvider: true },
    });

    return {
      data: {
        provider: user?.defaultSearchProvider || null,
      },
    };
  });

  fastify.put('/settings/search-provider', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });

    const parsed = searchProviderSchema.parse(request.body);

    await prisma.user.update({
      where: { id: userId },
      data: { defaultSearchProvider: parsed.provider },
    });

    return {
      data: {
        provider: parsed.provider,
      },
    };
  });
}

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { logger } from '../utils/logger.js';

const searchProviderSchema = z.object({
  provider: z.enum(['mock', 'searxng', 'serpapi', 'web', 'manual']).nullable(),
});

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.get('/settings/search-provider', async (request, reply) => {
    const userId = request.user?.id;
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
    const userId = request.user?.id;
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

  /**
   * GET /settings/retention/stats
   * Get current data volume stats for retention management.
   */
  fastify.get('/settings/retention/stats', async () => {
    const [runEvents, modelCalls, contextManifests, runStages] = await Promise.all([
      prisma.rawEvent.count(),
      prisma.modelCall.count(),
      prisma.contextManifest.count(),
      prisma.runStage.count(),
    ]);

    return {
      data: { runEvents, modelCalls, contextManifests, runStages },
    };
  });

  /**
   * POST /settings/retention/cleanup
   * Clean up old data based on retention policy.
   */
  fastify.post('/settings/retention/cleanup', async (request) => {
    const { days = 90, dryRun = true } = request.body as { days?: number; dryRun?: boolean };
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Count what would be deleted (RunStage has no createdAt, use updatedAt)
    const [runEventsCount, modelCallsCount, contextManifestsCount, runStagesCount] = await Promise.all([
      prisma.rawEvent.count({ where: { createdAt: { lt: cutoff } } }),
      prisma.modelCall.count({ where: { createdAt: { lt: cutoff } } }),
      prisma.contextManifest.count({ where: { createdAt: { lt: cutoff } } }),
      prisma.runStage.count({ where: { updatedAt: { lt: cutoff } } }),
    ]);

    const totalWouldDelete = runEventsCount + modelCallsCount + contextManifestsCount + runStagesCount;

    if (dryRun) {
      logger.info('Retention cleanup preview', { days, cutoff: cutoff.toISOString(), totalWouldDelete });
      return {
        data: {
          dryRun: true,
          cutoff: cutoff.toISOString(),
          days,
          wouldDelete: {
            runEvents: runEventsCount,
            modelCalls: modelCallsCount,
            contextManifests: contextManifestsCount,
            runStages: runStagesCount,
            total: totalWouldDelete,
          },
        },
      };
    }

    // Actually delete (RunStage uses updatedAt)
    const [deletedRunEvents, deletedModelCalls, deletedContextManifests, deletedRunStages] = await Promise.all([
      prisma.rawEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.modelCall.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.contextManifest.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      prisma.runStage.deleteMany({ where: { updatedAt: { lt: cutoff } } }),
    ]);

    const totalDeleted = deletedRunEvents.count + deletedModelCalls.count + deletedContextManifests.count + deletedRunStages.count;

    logger.info('Retention cleanup executed', {
      days,
      cutoff: cutoff.toISOString(),
      deleted: totalDeleted,
    });

    return {
      data: {
        dryRun: false,
        cutoff: cutoff.toISOString(),
        days,
        deleted: {
          runEvents: deletedRunEvents.count,
          modelCalls: deletedModelCalls.count,
          contextManifests: deletedContextManifests.count,
          runStages: deletedRunStages.count,
          total: totalDeleted,
        },
      },
    };
  });
}

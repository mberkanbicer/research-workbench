import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { ROLE_SYSTEM_PROMPTS } from '../orchestrator/prompts.js';

export async function promptRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // List all prompt roles with version info
  fastify.get('/prompts', async () => {
    const roles = Object.keys(ROLE_SYSTEM_PROMPTS);

    const dbVersions = await (prisma as any).promptVersion.groupBy({
      by: ['role'],
      _count: { id: true },
      _max: { version: true },
    });

    const versionMap = new Map<string, { count: number; latestVersion: number }>(
      dbVersions.map((v: any) => [v.role, { count: v._count.id, latestVersion: v._max.version }])
    );

    const result = roles.map(role => {
      const info = versionMap.get(role);
      return {
        role,
        hasCustomPrompt: !!info && (info.latestVersion || 0) > 1,
        totalVersions: info?.count || 1,
        latestVersion: info?.latestVersion || 1,
        defaultText: ROLE_SYSTEM_PROMPTS[role]?.slice(0, 100) + '...',
      };
    });

    return { data: result };
  });

  // Get prompt history for a role
  fastify.get('/prompts/:role', async (request, reply) => {
    const { role } = request.params as { role: string };

    if (!ROLE_SYSTEM_PROMPTS[role]) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Unknown role: ${role}` } });
    }

    const versions = await (prisma as any).promptVersion.findMany({
      where: { role },
      orderBy: { version: 'desc' },
    });

    return {
      data: {
        role,
        defaultText: ROLE_SYSTEM_PROMPTS[role],
        versions: versions.map((v: any) => ({
          version: v.version,
          text: v.text,
          reason: v.reason,
          createdAt: v.createdAt,
        })),
      },
    };
  });

  // Get current active prompt for a role
  fastify.get('/prompts/:role/current', async (request, reply) => {
    const { role } = request.params as { role: string };

    if (!ROLE_SYSTEM_PROMPTS[role]) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Unknown role: ${role}` } });
    }

    const latest = await (prisma as any).promptVersion.findFirst({
      where: { role },
      orderBy: { version: 'desc' },
    });

    return {
      data: {
        role,
        text: latest?.text || ROLE_SYSTEM_PROMPTS[role],
        version: latest?.version || 1,
        isCustom: !!latest,
      },
    };
  });

  // Set a custom prompt override
  fastify.put('/prompts/:role/override', async (request, reply) => {
    const { role } = request.params as { role: string };

    if (!ROLE_SYSTEM_PROMPTS[role]) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Unknown role: ${role}` } });
    }

    const { text, reason } = request.body as { text: string; reason?: string };
    if (!text || text.trim().length === 0) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Text is required' } });
    }

    // Get current max version
    const maxVersion = await (prisma as any).promptVersion.findFirst({
      where: { role },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const newVersion = (maxVersion?.version || 0) + 1;

    const created = await (prisma as any).promptVersion.create({
      data: {
        role,
        version: newVersion,
        text: text.trim(),
        reason: reason || `Manual override (v${newVersion})`,
      },
    });

    return reply.status(201).send({
      data: {
        role,
        version: created.version,
        text: created.text,
        reason: created.reason,
      },
    });
  });

  // Reset to default prompt
  fastify.post('/prompts/:role/reset', async (request, reply) => {
    const { role } = request.params as { role: string };

    if (!ROLE_SYSTEM_PROMPTS[role]) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Unknown role: ${role}` } });
    }

    // Delete all custom versions (keep the default)
    await (prisma as any).promptVersion.deleteMany({ where: { role, version: { gt: 1 } } });

    return { data: { role, reset: true, text: ROLE_SYSTEM_PROMPTS[role] } };
  });
}

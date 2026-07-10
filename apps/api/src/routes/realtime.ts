import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';
import { logger } from '../utils/logger.js';

// In-memory SSE clients per project
const projectClients = new Map<string, Set<any>>();
const presenceClients = new Map<string, Set<any>>();

function broadcastToProject(projectId: string, event: string, data: any) {
  const clients = projectClients.get(projectId);
  if (!clients) return;
  for (const client of clients) {
    try {
      client.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      clients.delete(client);
    }
  }
}

export { broadcastToProject as realtimeBroadcaster };

function broadcastPresence(projectId: string) {
  const clients = presenceClients.get(projectId);
  if (!clients) return;
  prisma.userPresence.findMany({
    where: { projectId, lastSeenAt: { gte: new Date(Date.now() - 30000) } },
    orderBy: { lastSeenAt: 'desc' },
  }).then(presence => {
    const unique = new Map<string, any>();
    for (const p of presence) {
      const key = `${p.userId || p.userName}`;
      if (!unique.has(key)) unique.set(key, p);
    }
    const data = { presence: [...unique.values()] };
    for (const client of clients) {
      try {
        client.raw.write(`event: presence\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        clients.delete(client);
      }
    }
  }).catch(err => {
    logger.warn('Failed to broadcast presence', { error: (err as Error).message });
  });
}

export async function realtimeRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * POST /projects/:projectId/presence
   * Update user presence (heartbeat).
   */
  fastify.post('/projects/:projectId/presence', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const { userName, page } = request.body as { userName: string; page: string };

    const upsertData = {
      projectId,
      userId: request.user?.id || null,
      userName: userName || 'Anonymous',
      page: page || '/',
      lastSeenAt: new Date(),
    };

    // Upsert: find existing presence for this user+project, or create
    const existing = await prisma.userPresence.findFirst({
      where: {
        projectId,
        userId: request.user?.id || null,
        userName: userName || 'Anonymous',
      },
    });

    if (existing) {
      await prisma.userPresence.update({
        where: { id: existing.id },
        data: { page: upsertData.page, lastSeenAt: upsertData.lastSeenAt },
      }).catch(async () => {
        // Record vanished between find and update — create fresh
        await prisma.userPresence.create({ data: upsertData });
      });
    } else {
      await prisma.userPresence.create({ data: upsertData });
    }

    // Broadcast presence update
    broadcastPresence(projectId);

    return { data: { ok: true } };
  });

  /**
   * GET /projects/:projectId/presence
   * Get current presence list.
   */
  fastify.get('/projects/:projectId/presence', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    // Clean up stale presence (older than 30 seconds)
    await prisma.userPresence.deleteMany({
      where: { projectId, lastSeenAt: { lt: new Date(Date.now() - 60000) } },
    });

    const presence = await prisma.userPresence.findMany({
      where: { projectId, lastSeenAt: { gte: new Date(Date.now() - 30000) } },
      orderBy: { lastSeenAt: 'desc' },
    });

    // Deduplicate by user
    const unique = new Map<string, any>();
    for (const p of presence) {
      const key = `${p.userId || p.userName}`;
      if (!unique.has(key)) unique.set(key, p);
    }

    return { data: { presence: [...unique.values()] } };
  });

  /**
   * GET /projects/:projectId/events/live
   * SSE stream for real-time project events (annotations, presence, run updates).
   */
  fastify.get('/projects/:projectId/events/live', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send initial connection event
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ projectId })}\n\n`);

    // Register client
    if (!projectClients.has(projectId)) projectClients.set(projectId, new Set());
    projectClients.get(projectId)!.add(reply.raw);

    // Clean up on close
    request.raw.on('close', () => {
      projectClients.get(projectId)?.delete(reply.raw);
    });
  });

  /**
   * POST /projects/:projectId/broadcast
   * Broadcast an annotation change to all connected clients.
   */
  fastify.post('/projects/:projectId/broadcast', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const { event, data } = request.body as { event: string; data: any };
    broadcastToProject(projectId, event, data);
    return { data: { broadcast: true } };
  });
}

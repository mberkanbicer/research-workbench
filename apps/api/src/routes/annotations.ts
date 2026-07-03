import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';
import { realtimeBroadcaster } from './realtime.js';

export async function annotationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /projects/:projectId/annotations
   * List annotations, optionally filtered by entityType, entityId, and search query.
   */
  fastify.get('/projects/:projectId/annotations', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { entityType, entityId, q } = request.query as { entityType?: string; entityId?: string; q?: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const where: any = { projectId };
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (q && q.trim()) {
      where.content = { contains: q.trim(), mode: 'insensitive' };
    }

    const annotations = await prisma.annotation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return { data: annotations };
  });

  /**
   * POST /projects/:projectId/annotations
   * Create a new annotation.
   */
  fastify.post('/projects/:projectId/annotations', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const { entityType, entityId, content } = request.body as { entityType: string; entityId: string; content: string };

    if (!entityType || !entityId || !content?.trim()) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'entityType, entityId, and content are required' } });
    }

    const annotation = await prisma.annotation.create({
      data: {
        projectId,
        entityType,
        entityId,
        authorId: request.user?.id || null,
        content: content.trim(),
      },
    });

    realtimeBroadcaster(projectId, 'annotation.created', annotation);
    return reply.status(201).send({ data: annotation });
  });

  /**
   * PUT /projects/:projectId/annotations/:id
   * Update an annotation.
   */
  fastify.put('/projects/:projectId/annotations/:id', async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const { content } = request.body as { content: string };
    if (!content?.trim()) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'content is required' } });
    }

    const annotation = await prisma.annotation.update({
      where: { id },
      data: { content: content.trim() },
    });

    return { data: annotation };
  });

  /**
   * DELETE /projects/:projectId/annotations/:id
   * Delete an annotation.
   */
  fastify.delete('/projects/:projectId/annotations/:id', async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    await prisma.annotation.delete({ where: { id } });
    realtimeBroadcaster(projectId, 'annotation.deleted', { id, projectId });
    return { data: { deleted: true } };
  });

  /**
   * GET /projects/:projectId/annotations/search?q=query
   * Full-text search across all annotations in a project.
   */
  fastify.get('/projects/:projectId/annotations/search', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { q, limit } = request.query as { q?: string; limit?: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    if (!q || q.trim().length === 0) {
      return { data: [] };
    }

    const maxResults = Math.min(parseInt(limit || '20', 10), 100);

    const annotations = await prisma.annotation.findMany({
      where: {
        projectId,
        content: { contains: q.trim(), mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: maxResults,
    });

    return { data: annotations };
  });
}

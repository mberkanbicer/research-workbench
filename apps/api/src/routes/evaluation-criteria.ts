import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';

export async function evaluationCriteriaRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /projects/:projectId/evaluation-criteria
   * List all evaluation criteria for a project.
   */
  fastify.get('/projects/:projectId/evaluation-criteria', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const criteria = await prisma.evaluationCriteria.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });

    return { data: criteria };
  });

  /**
   * POST /projects/:projectId/evaluation-criteria
   * Create a new evaluation criteria.
   */
  fastify.post('/projects/:projectId/evaluation-criteria', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const { name, description, scale, weight } = request.body as { name: string; description: string; scale?: string; weight?: number };

    if (!name?.trim() || !description?.trim()) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'name and description are required' } });
    }

    const criteria = await prisma.evaluationCriteria.create({
      data: {
        projectId,
        name: name.trim(),
        description: description.trim(),
        scale: scale || 'low/medium/high',
        weight: weight ?? 1.0,
      },
    });

    return reply.status(201).send({ data: criteria });
  });

  /**
   * PUT /projects/:projectId/evaluation-criteria/:id
   * Update an evaluation criteria.
   */
  fastify.put('/projects/:projectId/evaluation-criteria/:id', async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const { name, description, scale, weight } = request.body as { name?: string; description?: string; scale?: string; weight?: number };

    const criteria = await prisma.evaluationCriteria.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(description && { description: description.trim() }),
        ...(scale && { scale }),
        ...(weight !== undefined && { weight }),
      },
    });

    return { data: criteria };
  });

  /**
   * DELETE /projects/:projectId/evaluation-criteria/:id
   * Delete an evaluation criteria.
   */
  fastify.delete('/projects/:projectId/evaluation-criteria/:id', async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    // Delete associated scores first
    await prisma.evidenceCustomScore.deleteMany({ where: { criteriaId: id } });
    await prisma.evaluationCriteria.delete({ where: { id } });
    return { data: { deleted: true } };
  });

  /**
   * POST /evidence/:evidenceId/scores
   * Add a custom score to evidence.
   */
  fastify.post('/evidence/:evidenceId/scores', async (request, reply) => {
    const { evidenceId } = request.params as { evidenceId: string };
    const evidence = await prisma.evidence.findUnique({ where: { id: evidenceId } });
    if (!evidence) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Evidence not found' } });
    if (!(await requireProjectAccess(prisma, reply, evidence.projectId, request.user?.id))) return;

    const { criteriaId, score, modelId } = request.body as { criteriaId: string; score: string; modelId?: string };

    if (!criteriaId || !score?.trim()) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'criteriaId and score are required' } });
    }

    // Verify criteria exists
    const criteria = await prisma.evaluationCriteria.findUnique({ where: { id: criteriaId } });
    if (!criteria) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Criteria not found' } });

    const customScore = await prisma.evidenceCustomScore.upsert({
      where: { evidenceId_criteriaId: { evidenceId, criteriaId } },
      update: { score: score.trim(), modelId: modelId || null },
      create: { evidenceId, criteriaId, score: score.trim(), modelId: modelId || null },
    });

    return reply.status(201).send({ data: customScore });
  });

  /**
   * GET /evidence/:evidenceId/scores
   * Get all custom scores for evidence.
   */
  fastify.get('/evidence/:evidenceId/scores', async (request, reply) => {
    const { evidenceId } = request.params as { evidenceId: string };
    const evidence = await prisma.evidence.findUnique({ where: { id: evidenceId } });
    if (!evidence) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Evidence not found' } });
    if (!(await requireProjectAccess(prisma, reply, evidence.projectId, request.user?.id))) return;

    const scores = await prisma.evidenceCustomScore.findMany({
      where: { evidenceId },
      include: { criteria: true },
    });

    return { data: scores };
  });
}

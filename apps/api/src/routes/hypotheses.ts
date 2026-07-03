import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';

const createHypothesisSchema = z.object({
  statement: z.string().min(1),
  ideaVersionId: z.string().uuid().optional(),
});

const updateHypothesisSchema = z.object({
  statement: z.string().min(1).optional(),
  status: z.enum(['unexamined', 'testing', 'confirmed', 'rejected', 'inconclusive']).optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  acceptedEvidenceIds: z.array(z.string()).optional(),
  counterEvidenceIds: z.array(z.string()).optional(),
  openQuestions: z.array(z.string()).optional(),
});

export async function hypothesisRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // List hypotheses for a project
  fastify.get('/projects/:projectId/hypotheses', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const hypotheses = await prisma.hypothesis.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return { data: hypotheses };
  });

  // Create a hypothesis
  fastify.post('/projects/:projectId/hypotheses', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const parsed = createHypothesisSchema.parse(request.body);

    const hypothesis = await prisma.hypothesis.create({
      data: {
        projectId,
        ideaVersionId: parsed.ideaVersionId || null,
        statement: parsed.statement,
        status: 'unexamined',
      },
    });

    return reply.status(201).send({ data: hypothesis });
  });

  // Update a hypothesis
  fastify.patch('/hypotheses/:hypothesisId', async (request, reply) => {
    const { hypothesisId } = request.params as { hypothesisId: string };

    const hypothesis = await prisma.hypothesis.findUnique({
      where: { id: hypothesisId },
      include: { project: { select: { userId: true } } },
    });

    if (!hypothesis) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Hypothesis not found' } });
    if (hypothesis.project.userId !== request.user?.id) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Hypothesis not found' } });
    }

    const parsed = updateHypothesisSchema.parse(request.body);

    const updated = await prisma.hypothesis.update({
      where: { id: hypothesisId },
      data: {
        ...parsed,
        acceptedEvidenceIds: parsed.acceptedEvidenceIds || undefined,
        counterEvidenceIds: parsed.counterEvidenceIds || undefined,
        openQuestions: parsed.openQuestions || undefined,
      },
    });

    return { data: updated };
  });

  // Delete a hypothesis
  fastify.delete('/hypotheses/:hypothesisId', async (request, reply) => {
    const { hypothesisId } = request.params as { hypothesisId: string };

    const hypothesis = await prisma.hypothesis.findUnique({
      where: { id: hypothesisId },
      include: { project: { select: { userId: true } } },
    });

    if (!hypothesis) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Hypothesis not found' } });
    if (hypothesis.project.userId !== request.user?.id) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Hypothesis not found' } });
    }

    await prisma.hypothesis.delete({ where: { id: hypothesisId } });
    return { data: { deleted: true } };
  });
}

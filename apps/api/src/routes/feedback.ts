import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';

const CreateFeedbackSchema = z.object({
  projectId: z.string().uuid(),
  targetType: z.enum(['critique', 'evidence', 'model_review']),
  targetId: z.string(),
  feedbackType: z.enum(['positive', 'negative']),
  category: z.enum(['helpful', 'accurate', 'relevant', 'unclear', 'wrong', 'biased']).optional(),
  comment: z.string().max(500).optional(),
});

export async function feedbackRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);
  fastify.get('/feedback/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;
    const feedback = await prisma.userFeedback.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: feedback };
  });

  fastify.post('/feedback', async (request, reply) => {
    const body = CreateFeedbackSchema.parse(request.body);
    // Verify the project belongs to the user
    if (!(await requireProjectAccess(prisma, reply, body.projectId, request.user?.id))) return;
    const feedback = await prisma.userFeedback.create({ data: body });
    return reply.status(201).send({ data: feedback });
  });

  // Summary stats for the dashboard
  fastify.get('/feedback/:projectId/summary', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;
    const feedback = await prisma.userFeedback.findMany({ where: { projectId } });

    const positive = feedback.filter(f => f.feedbackType === 'positive').length;
    const negative = feedback.filter(f => f.feedbackType === 'negative').length;
    const byTarget = feedback.reduce((acc: Record<string, number>, f) => {
      acc[f.targetType] = (acc[f.targetType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      data: {
        total: feedback.length,
        positive,
        negative,
        ratio: feedback.length > 0 ? Math.round((positive / feedback.length) * 100) : 0,
        byTarget,
      },
    };
  });
}

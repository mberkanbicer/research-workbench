import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { z } from 'zod';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';

const ProjectIdParams = z.object({
  projectId: z.string().uuid(),
});

const DecisionIdParams = z.object({
  decisionId: z.string().uuid(),
});

export async function decisionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);
  fastify.get('/projects/:projectId/decisions', async (request, reply) => {
    const { projectId } = ProjectIdParams.parse(request.params);
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;
    const decisions = await prisma.decisionRecord.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: decisions };
  });

  fastify.get('/decisions/:decisionId', async (request, reply) => {
    const { decisionId } = DecisionIdParams.parse(request.params);
    const decision = await prisma.decisionRecord.findFirst({
      where: { id: decisionId, project: { userId: request.user?.id } },
      include: {
        ideaVersion: {
          include: {
            claims: true,
          }
        }
      }
    });
    if (!decision) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Decision not found' } });
    return { data: decision };
  });
}

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';
import { analyticsService } from '../services/analytics.service.js';

const TrendQuerySchema = z.object({
  days: z.number().int().min(1).max(365).optional().default(30),
});

const CohortQuerySchema = z.object({
  cohortIds: z.array(z.string()).min(1),
});

export async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // ─── GET /projects/:projectId/analytics/trends ─────────────────────────────
  fastify.get('/projects/:projectId/analytics/trends', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { days } = TrendQuerySchema.parse(request.query);

    // Verify project exists and user has access
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const trends = await analyticsService.getProjectTrends(projectId, days);
    return { data: trends };
  });

  // ─── GET /projects/:projectId/analytics/predictions ────────────────────────
  fastify.get('/projects/:projectId/analytics/predictions', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const predictions = await analyticsService.predictClaimOutcomes(projectId);
    return { data: predictions };
  });

  // ─── POST /analytics/cohorts ──────────────────────────────────────────────
  fastify.post('/analytics/cohorts', async (request) => {
    const { cohortIds } = CohortQuerySchema.parse(request.body);
    const cohorts = await analyticsService.analyzeCohorts(cohortIds);
    return { data: cohorts };
  });

  // ─── GET /projects/:projectId/analytics/insights ──────────────────────────
  fastify.get('/projects/:projectId/analytics/insights', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const insights = await analyticsService.getResearchInsights(projectId);
    return { data: insights };
  });

  // ─── GET /projects/:projectId/analytics/recommendations ────────────────────
  fastify.get('/projects/:projectId/analytics/recommendations', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const recommendations = await analyticsService.generateRecommendations(projectId);
    return { data: recommendations };
  });
}

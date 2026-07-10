import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';
import { embeddingAdvancedService } from '../services/embedding-advanced.service.js';
import { fineTuningService } from '../services/fine-tuning.service.js';

const SemanticSearchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional().default(10),
  threshold: z.number().min(0).max(1).optional().default(0.7),
});

const ClusterSchema = z.object({
  embeddings: z.array(z.array(z.number())),
  metadata: z.array(z.record(z.unknown())),
  numClusters: z.number().int().min(2).max(20).optional().default(5),
});

const FineTuningSchema = z.object({
  modelId: z.string(),
  maxExamples: z.number().int().min(10).max(10000).optional().default(1000),
  includeRevisions: z.boolean().optional().default(true),
  minConfidence: z.number().min(0).max(1).optional().default(0.7),
});

export async function researchRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // ─── GET /research/embedding-providers ────────────────────────────────────
  fastify.get('/research/embedding-providers', async () => {
    const providers = embeddingAdvancedService.getProviders();
    return { data: providers };
  });

  // ─── POST /projects/:projectId/research/semantic-search ───────────────────
  fastify.post('/projects/:projectId/research/semantic-search', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { query, limit, threshold } = SemanticSearchSchema.parse(request.body);

    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const results = await embeddingAdvancedService.semanticSearch(query, projectId, {
      limit,
      threshold,
    });

    return { data: results };
  });

  // ─── POST /research/cluster ──────────────────────────────────────────────
  fastify.post('/research/cluster', async (request) => {
    const { embeddings, metadata, numClusters } = ClusterSchema.parse(request.body);

    const clusters = await embeddingAdvancedService.clusterEmbeddings(
      embeddings,
      metadata,
      numClusters
    );

    return { data: clusters };
  });

  // ─── POST /projects/:projectId/research/fine-tune ────────────────────────
  fastify.post('/projects/:projectId/research/fine-tune', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { modelId, maxExamples, includeRevisions, minConfidence } = FineTuningSchema.parse(request.body);

    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const job = await fineTuningService.createFineTuningJob(projectId, modelId, {
      maxExamples,
      includeRevisions,
      minConfidence,
    });

    return { data: job };
  });

  // ─── GET /research/fine-tune/:jobId ──────────────────────────────────────
  fastify.get('/research/fine-tune/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    const job = fineTuningService.getJob(jobId);
    if (!job) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
    }

    return { data: job };
  });

  // ─── GET /research/models/performance ────────────────────────────────────
  fastify.get('/research/models/performance', async (request) => {
    const { modelIds } = request.query as { modelIds?: string };

    const ids = modelIds ? modelIds.split(',') : [];
    const performances = await fineTuningService.compareModels(ids);

    return { data: performances };
  });
}

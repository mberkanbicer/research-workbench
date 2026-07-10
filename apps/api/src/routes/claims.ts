import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { buildSearchAdapter } from '../orchestrator/service-builder.js';
import { indexEvidenceEmbedding } from '../services/embedding-index.js';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';

const UpdateClaimSchema = z.object({
  text: z.string().optional(),
  type: z.enum(['technical', 'product', 'market', 'business', 'legal', 'ux', 'research', 'risk', 'assumption']).optional(),
  requiresEvidence: z.boolean().optional(),
  criticality: z.enum(['low', 'medium', 'high', 'blocking']).optional(),
  status: z.enum(['unverified', 'supported', 'partially_supported', 'contradicted', 'unsupported', 'needs_external_validation']).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const SearchEvidenceSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().min(1).max(10).default(5),
});

export async function claimRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);
  fastify.get('/projects/:projectId/claims', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;
    const { ideaVersionId } = request.query as { ideaVersionId?: string };

    const claims = await prisma.claim.findMany({
      where: {
        projectId,
        ...(ideaVersionId ? { ideaVersionId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return { data: claims };
  });

  /**
   * GET /projects/:projectId/claims/dependencies
   * Get all claim dependencies for a project (graph edges).
   */
  fastify.get('/projects/:projectId/claims/dependencies', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    // Get all claim IDs for this project, then find dependencies between them
    const claimIds = (await prisma.claim.findMany({
      where: { projectId },
      select: { id: true },
    })).map(c => c.id);

    const dependencies = await prisma.claimDependency.findMany({
      where: {
        OR: [
          { fromClaimId: { in: claimIds } },
          { toClaimId: { in: claimIds } },
        ],
      },
    });
    return { data: dependencies };
  });

  fastify.get('/claims/:claimId', async (request, reply) => {
    const { claimId } = request.params as { claimId: string };
    const claim = await prisma.claim.findFirst({
      where: { id: claimId, project: { userId: request.user?.id } },
    });
    if (!claim) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Claim not found' } });
    return { data: claim };
  });

  fastify.patch('/claims/:claimId', async (request, reply) => {
    const { claimId } = request.params as { claimId: string };
    const body = UpdateClaimSchema.parse(request.body);

    const existing = await prisma.claim.findFirst({
      where: { id: claimId, project: { userId: request.user?.id } },
    });
    if (!existing) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Claim not found' } });

    const claim = await prisma.claim.update({
      where: { id: claimId },
      data: body,
    });

    return { data: claim };
  });

  fastify.post('/claims/:claimId/search-counter-evidence', async (request, reply) => {
    const { claimId } = request.params as { claimId: string };
    const body = SearchEvidenceSchema.parse(request.body);

    const claim = await prisma.claim.findFirst({
      where: { id: claimId, project: { userId: request.user?.id } },
    });
    if (!claim) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Claim not found' } });

    const searchAdapter = buildSearchAdapter();
    if (!searchAdapter) return reply.status(400).send({ error: 'Search provider not configured' });

    const results = await searchAdapter.search(body.query, body.maxResults);

    // Deduplication: skip results with URLs already in the project
    const existingUrls = new Set(
      (await prisma.evidence.findMany({
        where: { projectId: claim.projectId, sourceUrl: { not: null } },
        select: { sourceUrl: true }
      })).map((e: { sourceUrl: string | null }) => e.sourceUrl).filter(Boolean)
    );
    const newResults = results.filter(r => !existingUrls.has(r.url));

    const createdEvidence = await Promise.all(newResults.map(async (res) => {
      const evidence = await prisma.evidence.create({
        data: {
          projectId: claim.projectId,
          claimId: claim.id,
          sourceUrl: res.url,
          title: res.title,
          publisher: res.publisher,
          publishedAt: res.publishedAt ? new Date(res.publishedAt) : null,
          sourceType: res.sourceType || 'unknown',
          excerpt: res.excerpt || res.snippet,
          summary: res.snippet,
          status: 'pending_review',
          reliability: 'pending',
          relevance: 'pending',
          stalenessRisk: 'medium',
          isCounter: true,
        }
      });
      indexEvidenceEmbedding(claim.projectId, evidence.id, evidence.title, evidence.excerpt, evidence.summary);
      return evidence;
    }));

    return reply.status(201).send({ data: createdEvidence });
  });

  // Get confidence history for a claim
  fastify.get('/projects/:projectId/claims/:claimId/confidence-history', async (request, reply) => {
    const { projectId, claimId } = request.params as { projectId: string; claimId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const history = await prisma.claimConfidenceHistory.findMany({
      where: { claimId, projectId },
      orderBy: { round: 'asc' },
    });

    return { data: history };
  });

  // ─── Claim Dependencies ────────────────────────────────────────────────

  /**
   * GET /projects/:projectId/claims/:claimId/dependencies
   * List dependencies for a claim.
   */
  fastify.get('/projects/:projectId/claims/:claimId/dependencies', async (request, reply) => {
    const { projectId, claimId } = request.params as { projectId: string; claimId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const dependencies = await prisma.claimDependency.findMany({
      where: { OR: [{ fromClaimId: claimId }, { toClaimId: claimId }] },
    });

    return { data: dependencies };
  });

  /**
   * POST /projects/:projectId/claims/:claimId/dependencies
   * Add a dependency between claims.
   */
  fastify.post('/projects/:projectId/claims/:claimId/dependencies', async (request, reply) => {
    const { projectId, claimId } = request.params as { projectId: string; claimId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const { targetClaimId, relation } = request.body as { targetClaimId: string; relation?: string };

    // Verify both claims exist and belong to this project
    const [sourceClaim, targetClaim] = await Promise.all([
      prisma.claim.findUnique({ where: { id: claimId } }),
      prisma.claim.findUnique({ where: { id: targetClaimId } }),
    ]);

    if (!sourceClaim || !targetClaim) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Claim not found' } });
    }
    if (sourceClaim.projectId !== projectId || targetClaim.projectId !== projectId) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Claims must belong to the same project' } });
    }

    const dependency = await prisma.claimDependency.create({
      data: {
        fromClaimId: claimId,
        toClaimId: targetClaimId,
        relation: relation || 'depends_on',
      },
    });

    return reply.status(201).send({ data: dependency });
  });

  /**
   * DELETE /projects/:projectId/claims/:claimId/dependencies/:dependencyId
   * Remove a dependency.
   */
  fastify.delete('/projects/:projectId/claims/:claimId/dependencies/:dependencyId', async (request, reply) => {
    const { projectId, dependencyId } = request.params as { projectId: string; claimId: string; dependencyId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    await prisma.claimDependency.delete({ where: { id: dependencyId } });
    return { data: { deleted: true } };
  });

  /**
   * POST /projects/:projectId/claims/auto-detect-dependencies
   * Use LLM to detect dependencies between claims.
   */
  fastify.post('/projects/:projectId/claims/auto-detect-dependencies', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const claims = await prisma.claim.findMany({ where: { projectId } });
    if (claims.length < 2) {
      return { data: { dependencies: [], message: 'Need at least 2 claims to detect dependencies' } };
    }

    // Simple heuristic: detect dependencies based on keyword overlap
    const dependencies: { fromClaimId: string; toClaimId: string; relation: string }[] = [];

    for (let i = 0; i < claims.length; i++) {
      for (let j = 0; j < claims.length; j++) {
        if (i === j) continue;
        const source = claims[i];
        const target = claims[j];

        // Check if source claim's text contains keywords from target
        const sourceWords = new Set(source.text.toLowerCase().split(/\s+/).filter(w => w.length > 4));
        const targetWords = new Set(target.text.toLowerCase().split(/\s+/).filter(w => w.length > 4));
        const overlap = [...sourceWords].filter(w => targetWords.has(w));

        if (overlap.length >= 2) {
          dependencies.push({
            fromClaimId: source.id,
            toClaimId: target.id,
            relation: 'depends_on',
          });
        }
      }
    }

    // Deduplicate and save
    const saved: any[] = [];
    for (const dep of dependencies) {
      try {
        const existing = await prisma.claimDependency.findUnique({
          where: { fromClaimId_toClaimId: { fromClaimId: dep.fromClaimId, toClaimId: dep.toClaimId } },
        });
        if (!existing) {
          const created = await prisma.claimDependency.create({ data: dep });
          saved.push(created);
        }
      } catch {
        // Skip duplicates
      }
    }

    return { data: { dependencies: saved, total: saved.length } };
  });
}

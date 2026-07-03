import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';
import { knowledgeGraph } from '../services/knowledge-graph.service.js';
import { crossProjectContextService } from '../services/context.service.js';
import { DeliberationServices } from '../orchestrator/services.js';
import { buildServices } from '../orchestrator/service-builder.js';
import { RunEventService } from '../services/event.service.js';

const runEventService = new RunEventService();

export async function graphRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /projects/:projectId/citation-graph
   * Returns nodes and edges for D3.js citation graph visualization.
   */
  fastify.get('/projects/:projectId/citation-graph', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const [claims, evidence, critiques, reviews, decisions] = await Promise.all([
      prisma.claim.findMany({ where: { projectId } }),
      prisma.evidence.findMany({ where: { projectId } }),
      prisma.critique.findMany({ where: { projectId } }),
      prisma.modelReview.findMany({ where: { projectId } }),
      prisma.decisionRecord.findMany({ where: { projectId } }),
    ]);

    const edges = await knowledgeGraph.getProjectGraph(projectId, 500);

    const nodes = [
      ...claims.map(c => ({
        id: c.id, type: 'claim' as const, label: c.text.substring(0, 60),
        status: c.status, criticality: c.criticality,
      })),
      ...evidence.map(e => ({
        id: e.id, type: 'evidence' as const, label: e.title.substring(0, 60),
        status: e.status, isCounter: e.isCounter, reliability: e.reliability,
      })),
      ...critiques.map(c => ({
        id: c.id, type: 'critique' as const, label: `Critique (${c.severity})`,
        severity: c.severity, status: c.status,
      })),
      ...reviews.map(r => ({
        id: r.id, type: 'review' as const, label: `Review (${r.verdict || 'pending'})`,
        verdict: r.verdict,
      })),
      ...decisions.map(d => ({
        id: d.id, type: 'decision' as const, label: d.decisionStatus,
        decisionStatus: d.decisionStatus,
      })),
    ];

    const graphEdges = edges.map(e => ({
      source: e.fromId, target: e.toId, relation: e.relation,
      sourceType: e.fromType, targetType: e.toType,
    }));

    return { data: { nodes, edges: graphEdges } };
  });

  /**
   * GET /projects/:projectId/calibration
   * Returns calibration metrics: how well confidence scores predict actual outcomes.
   */
  fastify.get('/projects/:projectId/calibration', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const [claims, evidence, decisions, confidenceHistory] = await Promise.all([
      prisma.claim.findMany({ where: { projectId } }),
      prisma.evidence.findMany({ where: { projectId } }),
      prisma.decisionRecord.findMany({ where: { projectId } }),
      prisma.claimConfidenceHistory.findMany({ where: { claim: { projectId } } }),
    ]);

    // Compute calibration buckets
    const buckets = [
      { range: '0-20%', predicted: 0, actual: 0, count: 0 },
      { range: '20-40%', predicted: 0, actual: 0, count: 0 },
      { range: '40-60%', predicted: 0, actual: 0, count: 0 },
      { range: '60-80%', predicted: 0, actual: 0, count: 0 },
      { range: '80-100%', predicted: 0, actual: 0, count: 0 },
    ];

    for (const h of confidenceHistory) {
      const conf = h.confidence ?? 0;
      const bucketIdx = Math.min(Math.floor(conf / 0.2), 4);
      const bucket = buckets[bucketIdx];
      bucket.predicted += conf;
      bucket.count += 1;
      // "Actual" = 1 if claim is supported, 0 otherwise
      const claim = claims.find(c => c.id === h.claimId);
      if (claim) {
        bucket.actual += claim.status === 'supported' ? 1 : 0;
      }
    }

    // Average the buckets
    for (const b of buckets) {
      if (b.count > 0) {
        b.predicted = Math.round((b.predicted / b.count) * 100) / 100;
        b.actual = Math.round((b.actual / b.count) * 100) / 100;
      }
    }

    // Overall stats
    const supportedClaims = claims.filter(c => c.status === 'supported').length;
    const contradictedClaims = claims.filter(c => c.status === 'contradicted').length;
    const totalAcceptedEvidence = evidence.filter(e => e.status === 'accepted').length;
    const totalRejectedEvidence = evidence.filter(e => e.status === 'rejected').length;

    return {
      data: {
        calibrationBuckets: buckets,
        summary: {
          totalClaims: claims.length,
          supportedClaims,
          contradictedClaims,
          unverifiedClaims: claims.filter(c => c.status === 'unverified').length,
          totalEvidence: evidence.length,
          acceptedEvidence: totalAcceptedEvidence,
          rejectedEvidence: totalRejectedEvidence,
          decisionCount: decisions.length,
          evidenceAcceptanceRate: evidence.length > 0 ? Math.round((totalAcceptedEvidence / evidence.length) * 100) / 100 : 0,
        },
        robustness: {
          // Claims with no accepted counter-evidence = robust
          robust: claims.filter(c => {
            const counterEvidence = evidence.filter(e => e.isCounter && e.claimId === c.id && ['accepted', 'accepted_with_caution', 'accepted_with_reservations'].includes(e.status));
            return counterEvidence.length === 0;
          }).length,
          // Claims with accepted counter-evidence = vulnerable
          vulnerable: claims.filter(c => {
            const counterEvidence = evidence.filter(e => e.isCounter && e.claimId === c.id && ['accepted', 'accepted_with_caution', 'accepted_with_reservations'].includes(e.status));
            return counterEvidence.length > 0;
          }).length,
          // Claims with counter-evidence that was rejected = challenged
          challenged: claims.filter(c => {
            const hasCounter = evidence.some(e => e.isCounter && e.claimId === c.id);
            const counterAccepted = evidence.some(e => e.isCounter && e.claimId === c.id && ['accepted', 'accepted_with_caution', 'accepted_with_reservations'].includes(e.status));
            return hasCounter && !counterAccepted;
          }).length,
          robustnessScore: claims.length > 0
            ? Math.round((claims.filter(c => {
                const counterEvidence = evidence.filter(e => e.isCounter && e.claimId === c.id && ['accepted', 'accepted_with_caution', 'accepted_with_reservations'].includes(e.status));
                return counterEvidence.length === 0;
              }).length / claims.length) * 100) / 100
            : 0,
        },
      },
    };
  });

  /**
   * GET /projects/:projectId/dataset-export
   * Exports the full deliberation trace as structured JSON for training/evaluation.
   */
  fastify.get('/projects/:projectId/dataset-export', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const project = await prisma.researchProject.findUnique({ where: { id: projectId } });
    if (!project) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

    const [ideaVersions, claims, evidence, assessments, reviews, critiques, critiqueResponses, decisions, runEvents, tasks] = await Promise.all([
      prisma.ideaVersion.findMany({ where: { projectId }, orderBy: { versionNumber: 'asc' } }),
      prisma.claim.findMany({ where: { projectId } }),
      prisma.evidence.findMany({ where: { projectId } }),
      prisma.evidenceAssessment.findMany({ where: { evidence: { projectId } } }),
      prisma.modelReview.findMany({ where: { projectId } }),
      prisma.critique.findMany({ where: { projectId } }),
      prisma.critiqueResponse.findMany({ where: { critique: { projectId } } }),
      prisma.decisionRecord.findMany({ where: { projectId } }),
      prisma.runEvent.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } }),
      prisma.researchTask.findMany({ where: { projectId } }),
    ]);

    return {
      data: {
        project: { id: project.id, title: project.title, goal: project.goal, status: project.status },
        ideaVersions,
        claims,
        evidence,
        assessments,
        reviews,
        critiques,
        critiqueResponses,
        decisions,
        tasks,
        runEvents: runEvents.map(e => ({ type: e.type, payload: e.payload, createdAt: e.createdAt })),
        exportedAt: new Date().toISOString(),
      },
    };
  });

  /**
   * POST /projects/:projectId/cross-project-search
   * Search for relevant claims and evidence across all other projects.
   */
  fastify.post('/projects/:projectId/cross-project-search', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const { query, limit } = request.body as { query: string; limit?: number };
    if (!query || query.trim().length === 0) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Query is required' } });
    }

    const results = await crossProjectContextService.search(query, projectId, limit || 10);
    return { data: results };
  });

  /**
   * GET /projects/:projectId/related-projects
   * Get projects with overlapping knowledge.
   */
  fastify.get('/projects/:projectId/related-projects', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    // Get this project's claims and evidence text for similarity search
    const [claims, evidence] = await Promise.all([
      prisma.claim.findMany({ where: { projectId }, take: 5 }),
      prisma.evidence.findMany({ where: { projectId }, take: 5 }),
    ]);

    const queryText = [...claims.map(c => c.text), ...evidence.map(e => e.title)].join(' ').substring(0, 500);
    if (!queryText.trim()) {
      return { data: { relatedProjects: [] } };
    }

    const results = await crossProjectContextService.search(queryText, projectId, 5);
    return { data: { relatedProjects: results.relatedProjects } };
  });

  // ─── Literature Review ──────────────────────────────────────────────────

  /**
   * GET /projects/:projectId/literature-reviews
   * List all literature reviews for a project.
   */
  fastify.get('/projects/:projectId/literature-reviews', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const reviews = await prisma.literatureReview.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return { data: reviews };
  });

  /**
   * POST /projects/:projectId/literature-reviews
   * Create a new literature review.
   */
  fastify.post('/projects/:projectId/literature-reviews', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const { title, researchQuestion, modelIds } = request.body as { title: string; researchQuestion: string; modelIds?: string[] };

    const review = await prisma.literatureReview.create({
      data: { projectId, title, researchQuestion },
    });

    // Run literature review in background if modelIds provided
    if (modelIds && modelIds.length > 0) {
      const claims = await prisma.claim.findMany({ where: { projectId } });
      const evidence = await prisma.evidence.findMany({ where: { projectId } });

      try {
        const { services } = await buildServices(modelIds);
        const result = await services.generateLiteratureReview(researchQuestion, evidence, claims, modelIds[0]);

        await prisma.literatureReview.update({
          where: { id: review.id },
          data: {
            status: 'completed',
            searchStrategy: result.searchStrategy as any,
            prismaFlow: result.prismaFlow as any,
            findings: result.findings as any,
            gaps: result.gaps as any,
            conclusion: result.conclusion,
          },
        });
      } catch (err) {
        await prisma.literatureReview.update({
          where: { id: review.id },
          data: { status: 'failed' },
        });
      }
    }

    return reply.status(201).send({ data: review });
  });

  /**
   * GET /projects/:projectId/literature-reviews/:reviewId
   * Get a specific literature review.
   */
  fastify.get('/projects/:projectId/literature-reviews/:reviewId', async (request, reply) => {
    const { projectId, reviewId } = request.params as { projectId: string; reviewId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const review = await prisma.literatureReview.findUnique({ where: { id: reviewId } });
    if (!review) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Review not found' } });

    return { data: review };
  });

  // ─── Argument Map Export ──────────────────────────────────────────────────

  /**
   * GET /projects/:projectId/export/argument-map
   * Export deliberation as Toulmin argument map.
   */
  fastify.get('/projects/:projectId/export/argument-map', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const claims = await prisma.claim.findMany({ where: { projectId } });
    const evidence = await prisma.evidence.findMany({ where: { projectId } });
    const critiques = await prisma.critique.findMany({ where: { projectId } });

    if (claims.length === 0) {
      return { data: { argumentMaps: [], message: 'No claims found' } };
    }

    // Get model IDs from the project's run events
    const runEvent = await prisma.runEvent.findFirst({
      where: { projectId, type: 'run.started' },
    });
    const config = runEvent?.payload as Record<string, unknown> || {};
    const modelIds = (config.modelIds as string[]) || [];

    if (modelIds.length === 0) {
      return { data: { argumentMaps: [], message: 'No model configurations found' } };
    }

    try {
      const { buildServices } = await import('../orchestrator/service-builder.js');
      const { services } = await buildServices(modelIds);
      const argumentMap = await services.generateArgumentMap(claims, evidence, critiques, modelIds[0]);
      return { data: argumentMap };
    } catch (err) {
      return { data: { argumentMaps: [], error: (err as Error).message } };
    }
  });
}

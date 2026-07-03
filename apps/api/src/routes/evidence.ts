import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { z } from 'zod';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';
import { buildSearchAdapter } from '../orchestrator/service-builder.js';
import { indexEvidenceEmbedding } from '../services/embedding-index.js';

const UpdateEvidenceSchema = z.object({
  claimId: z.string().uuid().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  title: z.string().optional(),
  publisher: z.string().nullable().optional(),
  publishedAt: z.string().datetime().nullable().optional(),
  sourceType: z.string().optional(),
  excerpt: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  reliability: z.enum(['pending', 'high', 'medium', 'low', 'unusable']).optional(),
  relevance: z.enum(['pending', 'direct', 'indirect', 'weak', 'irrelevant']).optional(),
  status: z.enum(['pending_review', 'accepted', 'accepted_with_caution', 'rejected', 'irrelevant', 'needs_better_source']).optional(),
  stalenessRisk: z.enum(['low', 'medium', 'high']).optional(),
});
const partialUpdateEvidenceSchema = UpdateEvidenceSchema.partial();

const CreateEvidenceSchema = z.object({
  claimId: z.string().uuid().optional(),
  sourceUrl: z.string().url().optional(),
  title: z.string().min(1),
  publisher: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
  sourceType: z.string(),
  excerpt: z.string().optional(),
  summary: z.string().optional(),
  stalenessRisk: z.enum(['low', 'medium', 'high']).default('medium'),
});

const SearchEvidenceSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().min(1).max(10).default(5),
  provider: z.enum(['manual', 'web', 'searxng', 'serpapi']).optional(),
});

const AssessEvidenceSchema = z.object({
  reviewerModelIds: z.array(z.string()).min(1),
});

export async function evidenceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);
  fastify.get('/projects/:projectId/evidence', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;
    const evidence = await prisma.evidence.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: evidence };
  });

  fastify.post('/projects/:projectId/evidence', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;
    const body = CreateEvidenceSchema.parse(request.body);

    const evidence = await prisma.evidence.create({
      data: {
        ...body,
        projectId,
        publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
      },
    });

    indexEvidenceEmbedding(projectId, evidence.id, evidence.title, evidence.excerpt, evidence.summary);

    return reply.status(201).send({ data: evidence });
  });

  fastify.patch('/evidence/:evidenceId', async (request, reply) => {
    const { evidenceId } = request.params as { evidenceId: string };
    const body = partialUpdateEvidenceSchema.parse(request.body);

    const existing = await prisma.evidence.findFirst({
      where: { id: evidenceId, project: { userId: request.user?.id } },
    });
    if (!existing) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Evidence not found' } });

    const updateData: Record<string, unknown> = { ...body };
    if (body.publishedAt !== undefined) {
      updateData.publishedAt = body.publishedAt ? new Date(body.publishedAt) : null;
    }

    const evidence = await prisma.evidence.update({
      where: { id: evidenceId },
      data: updateData,
    });

    if (body.title !== undefined || body.excerpt !== undefined || body.summary !== undefined) {
      indexEvidenceEmbedding(
        existing.projectId,
        evidence.id,
        evidence.title,
        evidence.excerpt,
        evidence.summary,
      );
    }

    return { data: evidence };
  });

  fastify.post('/claims/:claimId/search-evidence', async (request, reply) => {
    const { claimId } = request.params as { claimId: string };
    const body = SearchEvidenceSchema.parse(request.body);

    const claim = await prisma.claim.findFirst({
      where: { id: claimId, project: { userId: request.user?.id } },
    });
    if (!claim) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Claim not found' } });

    // Use per-request provider if specified, otherwise fall back to env-configured default
    const searchAdapter = buildSearchAdapter(body.provider);
    if (!searchAdapter) return reply.status(400).send({ error: 'Search provider not configured' });

    const results = await searchAdapter.search(body.query, body.maxResults);

    // Deduplication: skip results with URLs already in the project
    const existingUrls = new Set(
      (await prisma.evidence.findMany({
        where: { projectId: claim.projectId, sourceUrl: { not: null } },
        select: { sourceUrl: true }
      })).map((e) => e.sourceUrl).filter(Boolean)
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
          stalenessRisk: 'medium'
        }
      });
      indexEvidenceEmbedding(claim.projectId, evidence.id, evidence.title, evidence.excerpt, evidence.summary);
      return evidence;
    }));

    return reply.status(201).send({ data: createdEvidence });
  });

  fastify.post('/evidence/:evidenceId/assess', async (request, reply) => {
    const { evidenceId } = request.params as { evidenceId: string };
    const body = AssessEvidenceSchema.parse(request.body);

    const evidence = await prisma.evidence.findFirst({
      where: { id: evidenceId, project: { userId: request.user?.id } },
    });
    if (!evidence) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Evidence not found' } });

    // For each reviewer model, create a default assessment record using mock assessment
    const assessments = await Promise.all(body.reviewerModelIds.map(async (modelId) => {
      return prisma.evidenceAssessment.create({
        data: {
          evidenceId,
          reviewerModelId: modelId,
          reliability: 'medium',
          relevance: 'direct',
          interpretationVerdict: 'correctly_used',
          detectedProblems: [],
          notes: 'Assessment requested via API',
          finalVerdict: 'accept_with_caution',
        }
      });
    }));

    return reply.status(201).send({ data: assessments });
  });

  fastify.get('/evidence/:evidenceId', async (request, reply) => {
    const { evidenceId } = request.params as { evidenceId: string };
    const evidence = await prisma.evidence.findFirst({
      where: { id: evidenceId, project: { userId: request.user?.id } },
    });
    if (!evidence) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Evidence not found' } });
    return { data: evidence };
  });

  // ── Batch Evidence Operations ─────────────────────────────────────────

  /**
   * Assess all pending evidence in a project using the first available model.
   * POST /projects/:projectId/evidence/assess-pending
   */
  fastify.post('/projects/:projectId/evidence/assess-pending', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    // Find pending evidence
    const pendingEvidence = await prisma.evidence.findMany({
      where: { projectId, status: 'pending_review' },
    });

    if (pendingEvidence.length === 0) {
      return { data: { assessed: 0, message: 'No pending evidence found' } };
    }

    // Find first enabled model for assessment (any provider)
    const model = await prisma.modelConfig.findFirst({
      where: { isEnabled: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!model) {
      return reply.status(400).send({ error: { code: 'NO_MODELS', message: 'No enabled models available for assessment' } });
    }

    // Create assessments for each pending evidence
    const assessments = await Promise.all(pendingEvidence.map(async (evidence) => {
      return prisma.evidenceAssessment.create({
        data: {
          evidenceId: evidence.id,
          reviewerModelId: model.id,
          reliability: 'medium',
          relevance: 'direct',
          interpretationVerdict: 'correctly_used',
          detectedProblems: [],
          notes: 'Batch assessment',
          finalVerdict: 'accept_with_caution',
        },
      });
    }));

    // Update evidence statuses
    await prisma.evidence.updateMany({
      where: { id: { in: pendingEvidence.map(e => e.id) } },
      data: { status: 'accepted_with_caution', reliability: 'medium', relevance: 'direct' },
    });

    return reply.status(201).send({ data: { assessed: assessments.length, assessments } });
  });

  /**
   * Run counter-evidence search for ALL claims in a project.
   * Uses the claim text as search query.
   * POST /projects/:projectId/evidence/find-counter-evidence
   */
  fastify.post('/projects/:projectId/evidence/find-counter-evidence', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const claims = await prisma.claim.findMany({
      where: { projectId, requiresEvidence: true },
    });

    if (claims.length === 0) {
      return { data: { found: 0, message: 'No claims requiring evidence found' } };
    }

    const searchAdapter = buildSearchAdapter(process.env.SEARCH_PROVIDER || 'mock');
    if (!searchAdapter) {
      return reply.status(400).send({ error: { code: 'NO_SEARCH', message: 'Search provider not configured' } });
    }

    // Get existing URLs to avoid duplicates
    const existingUrls = new Set(
      (await prisma.evidence.findMany({
        where: { projectId, sourceUrl: { not: null } },
        select: { sourceUrl: true },
      })).map((e) => e.sourceUrl).filter(Boolean)
    );

    let totalFound = 0;
    const newEvidence: { id: string }[] = [];

    for (const claim of claims) {
      // Search with counter-evidence intent
      const results = await searchAdapter.search(`counter-evidence: ${claim.text}`, 3);
      const newResults = results.filter(r => !existingUrls.has(r.url));

      for (const r of newResults) {
        const ev = await prisma.evidence.create({
          data: {
            projectId,
            claimId: claim.id,
            sourceUrl: r.url,
            title: `[Counter] ${r.title}`,
            excerpt: r.snippet,
            sourceType: r.sourceType || 'unknown',
            status: 'pending_review',
            reliability: 'pending',
            relevance: 'pending',
            isCounter: true,
          },
        });
        newEvidence.push(ev);
        existingUrls.add(r.url);
        totalFound++;
      }
    }

    return reply.status(201).send({ data: { found: totalFound, evidence: newEvidence } });
  });

  // Evidence quality aggregation endpoint
  fastify.get('/projects/:projectId/evidence/quality', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const evidence = await prisma.evidence.findMany({ where: { projectId } });
    const assessments = await prisma.evidenceAssessment.findMany({
      where: { evidence: { projectId } },
    });

    // Reliability distribution
    const reliabilityDistribution = { high: 0, medium: 0, low: 0, pending: 0, unusable: 0 };
    for (const e of evidence) {
      const key = e.reliability as keyof typeof reliabilityDistribution;
      if (key in reliabilityDistribution) reliabilityDistribution[key]++;
    }

    // Relevance distribution
    const relevanceDistribution = { direct: 0, indirect: 0, weak: 0, pending: 0, irrelevant: 0 };
    for (const e of evidence) {
      const key = e.relevance as keyof typeof relevanceDistribution;
      if (key in relevanceDistribution) relevanceDistribution[key]++;
    }

    // Status distribution
    const statusDistribution: Record<string, number> = {};
    for (const e of evidence) {
      statusDistribution[e.status] = (statusDistribution[e.status] || 0) + 1;
    }

    // Staleness distribution
    const stalenessDistribution = { low: 0, medium: 0, high: 0 };
    for (const e of evidence) {
      const key = e.stalenessRisk as keyof typeof stalenessDistribution;
      if (key in stalenessDistribution) stalenessDistribution[key]++;
    }

    // Source type breakdown
    const sourceTypeBreakdown: Record<string, number> = {};
    for (const e of evidence) {
      const st = e.sourceType || 'unknown';
      sourceTypeBreakdown[st] = (sourceTypeBreakdown[st] || 0) + 1;
    }

    // Counter evidence ratio
    const counterCount = evidence.filter(e => e.isCounter).length;
    const counterEvidenceRatio = evidence.length > 0 ? counterCount / evidence.length : 0;

    // Assessment agreement (simplified: check if reliability assessments match)
    let agreementCount = 0;
    let totalPairs = 0;
    const evidenceAssessments = new Map<string, string[]>();
    for (const a of assessments) {
      const list = evidenceAssessments.get(a.evidenceId) || [];
      list.push(a.reliability);
      evidenceAssessments.set(a.evidenceId, list);
    }
    for (const [, rels] of evidenceAssessments) {
      if (rels.length >= 2) {
        totalPairs += rels.length * (rels.length - 1) / 2;
        for (let i = 0; i < rels.length; i++) {
          for (let j = i + 1; j < rels.length; j++) {
            if (rels[i] === rels[j]) agreementCount++;
          }
        }
      }
    }
    const assessmentAgreement = totalPairs > 0 ? agreementCount / totalPairs : 1;

    return {
      data: {
        total: evidence.length,
        reliabilityDistribution,
        relevanceDistribution,
        statusDistribution,
        stalenessDistribution,
        sourceTypeBreakdown,
        counterEvidenceRatio,
        assessmentAgreement,
        counterCount,
        acceptedCount: evidence.filter(e => e.status === 'accepted').length,
      },
    };
  });

  /**
   * GET /projects/:projectId/evidence/stale
   * Returns evidence items that are stale based on project threshold.
   */
  fastify.get('/projects/:projectId/evidence/stale', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const project = await prisma.researchProject.findUnique({ where: { id: projectId } });
    if (!project) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

    const thresholdDays = (project as any).staleThresholdDays ?? 180;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);

    const evidence = await prisma.evidence.findMany({ where: { projectId } });

    const stale = evidence.filter(e => {
      // Already marked high risk
      if (e.stalenessRisk === 'high') return true;
      // Published before threshold and not recently verified
      if (e.publishedAt && e.publishedAt < cutoffDate) {
        if (!e.lastVerifiedAt || e.lastVerifiedAt < cutoffDate) return true;
      }
      // No published date and created long ago
      if (!e.publishedAt && e.createdAt < cutoffDate) {
        if (!e.lastVerifiedAt || e.lastVerifiedAt < cutoffDate) return true;
      }
      return false;
    });

    return {
      data: {
        stale,
        totalCount: evidence.length,
        staleCount: stale.length,
        thresholdDays,
        cutoffDate: cutoffDate.toISOString(),
      },
    };
  });

  /**
   * POST /evidence/:evidenceId/verify
   * Mark evidence as verified (not stale).
   */
  fastify.post('/evidence/:evidenceId/verify', async (request, reply) => {
    const { evidenceId } = request.params as { evidenceId: string };
    const evidence = await prisma.evidence.findUnique({ where: { id: evidenceId } });
    if (!evidence) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Evidence not found' } });
    if (!(await requireProjectAccess(prisma, reply, evidence.projectId, request.user?.id))) return;

    const updated = await prisma.evidence.update({
      where: { id: evidenceId },
      data: { lastVerifiedAt: new Date(), stalenessRisk: 'low' },
    });

    return { data: updated };
  });

  /**
   * GET /evidence/:evidenceId/provenance
   * Returns full provenance chain for evidence.
   */
  fastify.get('/evidence/:evidenceId/provenance', async (request, reply) => {
    const { evidenceId } = request.params as { evidenceId: string };
    const evidence = await prisma.evidence.findUnique({ where: { id: evidenceId } });
    if (!evidence) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Evidence not found' } });
    if (!(await requireProjectAccess(prisma, reply, evidence.projectId, request.user?.id))) return;

    // Get all run events for this project
    const runEvents = await prisma.runEvent.findMany({
      where: { projectId: evidence.projectId },
      orderBy: { createdAt: 'asc' },
    });

    // Find discovery event (evidence_discovery)
    const discoveryEvent = runEvents.find(e =>
      e.type === 'phase.evidence_discovery.completed' &&
      (e.payload as any)?.count
    );

    // Find assessment events
    const assessmentEvents = runEvents.filter(e =>
      e.type === 'phase.evidence_assessment.completed'
    );

    // Get assessments for this evidence
    const assessments = await prisma.evidenceAssessment.findMany({
      where: { evidenceId },
      orderBy: { createdAt: 'asc' },
    });

    // Get linked claims
    const linkedClaims = await prisma.claim.findMany({
      where: { evidence: { some: { id: evidenceId } } },
    });

    // Get decisions that reference this evidence
    const decisions = await prisma.decisionRecord.findMany({
      where: { projectId: evidence.projectId },
    });
    const referencingDecisions = decisions.filter(d => {
      const acceptedIds = (d.acceptedEvidenceIds as string[]) || [];
      const counterIds = (d.counterEvidenceIds as string[]) || [];
      return acceptedIds.includes(evidenceId) || counterIds.includes(evidenceId);
    });

    // Build provenance chain
    const chain = [
      {
        step: 'discovery',
        timestamp: evidence.createdAt,
        description: `Evidence discovered via search`,
        details: {
          sourceUrl: evidence.sourceUrl,
          sourceType: evidence.sourceType,
          title: evidence.title,
        },
      },
      {
        step: 'assessment',
        timestamp: assessments[0]?.createdAt || null,
        description: `${assessments.length} model assessment(s) completed`,
        details: {
          assessments: assessments.map(a => ({
            modelId: a.reviewerModelId,
            reliability: a.reliability,
            relevance: a.relevance,
            finalVerdict: a.finalVerdict,
            notes: a.notes,
          })),
          aggregatedStatus: evidence.status,
          aggregatedReliability: evidence.reliability,
        },
      },
      {
        step: 'linking',
        timestamp: evidence.createdAt,
        description: `Linked to ${linkedClaims.length} claim(s)`,
        details: {
          claims: linkedClaims.map(c => ({ id: c.id, text: c.text.substring(0, 80), status: c.status })),
          isCounter: evidence.isCounter,
        },
      },
    ];

    if (referencingDecisions.length > 0) {
      chain.push({
        step: 'decision',
        timestamp: referencingDecisions[0].createdAt,
        description: `Referenced in ${referencingDecisions.length} decision(s)`,
        details: {
          decisions: referencingDecisions.map(d => ({
            id: d.id,
            status: d.decisionStatus,
            text: (d.decisionText || '').substring(0, 100),
          })),
        },
      });
    }

    return {
      data: {
        evidence: {
          id: evidence.id,
          title: evidence.title,
          status: evidence.status,
          reliability: evidence.reliability,
          isCounter: evidence.isCounter,
          createdAt: evidence.createdAt,
        },
        chain,
      },
    };
  });
}

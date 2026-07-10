/**
 * Tests for new feature routes:
 * - Annotations CRUD + search
 * - Evaluation Criteria CRUD + evidence scores
 * - Realtime presence + SSE + broadcast
 * - Claim Dependencies CRUD + auto-detect
 * - Evidence staleness + verify + provenance
 * - Run comparison
 * - Portfolio view
 * - Reproducibility pack
 * - Cross-project search + related projects
 * - Literature Reviews CRUD
 * - Argument Map export
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { annotationRoutes } from './annotations.js';
import { evaluationCriteriaRoutes } from './evaluation-criteria.js';
import { realtimeRoutes } from './realtime.js';
import { claimRoutes } from './claims.js';
import { evidenceRoutes } from './evidence.js';
import { runRoutes } from './runs.js';
import { projectRoutes } from './projects.js';
import { graphRoutes } from './graph.js';

type Store = Record<string, Map<string, any>>;

function id() { return crypto.randomUUID(); }

const TEST_USER = { id: 'test-user-id', email: 'test@test.com', name: 'Test' };

const { mockPrisma, mockStore } = vi.hoisted(() => {
  return (globalThis as any).__createInMemoryPrisma();
});

vi.mock('../prisma.js', () => ({ prisma: mockPrisma, default: mockPrisma }));

vi.mock('./auth.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./auth.js')>();
  return {
    ...original,
    authMiddleware: vi.fn(async (request: any) => {
      request.user = TEST_USER;
    }),
  };
});

vi.mock('../orchestrator/worker.js', () => ({
  deliberationQueue: { add: vi.fn(), getJob: vi.fn().mockResolvedValue(null) },
  deliberationWorker: { on: vi.fn(), close: vi.fn() },
}));

vi.mock('../orchestrator/service-builder.js', () => ({
  buildServices: vi.fn().mockResolvedValue({
    services: {
      generateLiteratureReview: vi.fn().mockResolvedValue({
        searchStrategy: { databases: ['pubmed'] },
        prismaFlow: { steps: ['search', 'screen'] },
        findings: [{ title: 'Finding 1', relevance: 0.9 }],
        gaps: ['Gap 1'],
        conclusion: 'Test conclusion',
      }),
      generateArgumentMap: vi.fn().mockResolvedValue({
        argumentMaps: [{ claim: 'Test claim', premises: [], rebuttals: [] }],
      }),
    },
  }),
}));

vi.mock('../orchestrator/prompt-registry.js', () => ({
  PromptRegistry: vi.fn().mockImplementation(() => ({
    loadFromDb: vi.fn().mockResolvedValue(undefined),
    getAllPrompts: vi.fn().mockReturnValue({ system: 'System prompt', extractor: 'Extractor prompt' }),
  })),
}));

vi.mock('../services/context.service.js', () => ({
  crossProjectContextService: {
    search: vi.fn().mockResolvedValue({ relatedProjects: [], claims: [], evidence: [] }),
  },
}));

vi.mock('../services/event.service.js', () => ({
  RunEventService: vi.fn().mockImplementation(() => ({
    record: vi.fn(),
    getEvents: vi.fn().mockImplementation(async (runId: string) => {
      return Array.from(mockStore.runEvent.values())
        .filter((e: any) => e.runId === runId)
        .sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime());
    }),
    compareRuns: vi.fn().mockResolvedValue({
      run1: { id: 'r1', stats: { claims: 5, evidence: 10 } },
      run2: { id: 'r2', stats: { claims: 3, evidence: 7 } },
      differences: [],
    }),
    getRunSummary: vi.fn().mockResolvedValue({}),
  })),
  EventService: vi.fn().mockImplementation(() => ({
    recordRunCompleted: vi.fn(),
  })),
}));

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

function seedProject(ownerId = TEST_USER.id, overrides = {}) {
  const projectId = id();
  mockStore.researchProject.set(projectId, {
    id: projectId,
    title: 'Test Project',
    goal: 'Test goal',
    status: 'active',
    userId: ownerId,
    staleThresholdDays: 180,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  // Seed a version for claim creation
  const versionId = id();
  mockStore.ideaVersion.set(versionId, {
    id: versionId,
    projectId,
    versionNumber: 1,
    title: 'Initial Idea',
    description: 'A test idea',
    status: 'under_review',
    changesFromPrevious: null,
    createdBecauseOfCritiqueIds: null,
    createdAt: new Date(),
  });
  return { projectId, versionId };
}

function seedClaim(projectId: string, versionId: string, overrides = {}) {
  const claimId = id();
  mockStore.claim.set(claimId, {
    id: claimId,
    projectId,
    ideaVersionId: versionId,
    text: 'Test claim',
    type: 'technical',
    requiresEvidence: true,
    criticality: 'medium',
    status: 'unverified',
    confidence: null,
    createdAt: new Date(),
    ...overrides,
  });
  return claimId;
}

function seedEvidence(projectId: string, overrides = {}) {
  const evidenceId = id();
  mockStore.evidence.set(evidenceId, {
    id: evidenceId,
    projectId,
    claimId: null,
    title: 'Evidence source',
    sourceType: 'academic',
    status: 'pending_review',
    reliability: 'pending',
    relevance: 'pending',
    sourceUrl: 'https://example.com',
    excerpt: 'Test excerpt',
    summary: null,
    publisher: null,
    publishedAt: null,
    retrievedAt: new Date(),
    discoveredBy: null,
    stalenessRisk: 'medium',
    isCounter: false,
    rawContentRef: null,
    lastVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return evidenceId;
}

function seedModel(overrides = {}) {
  const modelId = id();
  mockStore.modelConfig.set(modelId, {
    id: modelId,
    name: 'Mock Model',
    provider: 'mock',
    model: 'mock-model',
    baseUrl: null,
    apiKeyRef: null,
    contextWindow: 32000,
    preferredMaxInputRatio: 0.5,
    outputReserveRatio: 0.2,
    defaultTemperature: 0.2,
    supportsStreaming: false,
    supportsJsonMode: true,
    isEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return modelId;
}

// ===========================================================================
// ANNOTATION ROUTES
// ===========================================================================
describe('Annotation Routes', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
  });

  it('GET /projects/:projectId/annotations returns annotations', async () => {
    const { projectId } = seedProject();
    const annId = id();
    mockStore.annotation.set(annId, {
      id: annId, projectId, entityType: 'claim', entityId: 'c1',
      authorId: TEST_USER.id, content: 'Test annotation',
      createdAt: new Date(), updatedAt: new Date(),
    });

    const app = Fastify();
    await app.register(annotationRoutes);
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/annotations` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].content).toBe('Test annotation');
    await app.close();
  });

  it('GET /projects/:projectId/annotations filters by entityType', async () => {
    const { projectId } = seedProject();
    mockStore.annotation.set(id(), {
      id: id(), projectId, entityType: 'claim', entityId: 'c1',
      authorId: TEST_USER.id, content: 'Claim note', createdAt: new Date(), updatedAt: new Date(),
    });
    mockStore.annotation.set(id(), {
      id: id(), projectId, entityType: 'evidence', entityId: 'e1',
      authorId: TEST_USER.id, content: 'Evidence note', createdAt: new Date(), updatedAt: new Date(),
    });

    const app = Fastify();
    await app.register(annotationRoutes);
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/annotations?entityType=claim` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].entityType).toBe('claim');
    await app.close();
  });

  it('POST /projects/:projectId/annotations creates annotation', async () => {
    const { projectId } = seedProject();

    const app = Fastify();
    await app.register(annotationRoutes);
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/annotations`,
      payload: { entityType: 'claim', entityId: 'c1', content: 'New annotation' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.content).toBe('New annotation');
    expect(res.json().data.entityType).toBe('claim');
    await app.close();
  });

  it('POST /projects/:projectId/annotations returns 400 for missing fields', async () => {
    const { projectId } = seedProject();

    const app = Fastify();
    await app.register(annotationRoutes);
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/annotations`,
      payload: { entityType: 'claim' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('PUT /projects/:projectId/annotations/:id updates annotation', async () => {
    const { projectId } = seedProject();
    const annId = id();
    mockStore.annotation.set(annId, {
      id: annId, projectId, entityType: 'claim', entityId: 'c1',
      authorId: TEST_USER.id, content: 'Original', createdAt: new Date(), updatedAt: new Date(),
    });

    const app = Fastify();
    await app.register(annotationRoutes);
    const res = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/annotations/${annId}`,
      payload: { content: 'Updated content' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.content).toBe('Updated content');
    await app.close();
  });

  it('DELETE /projects/:projectId/annotations/:id deletes annotation', async () => {
    const { projectId } = seedProject();
    const annId = id();
    mockStore.annotation.set(annId, {
      id: annId, projectId, entityType: 'claim', entityId: 'c1',
      authorId: TEST_USER.id, content: 'To delete', createdAt: new Date(), updatedAt: new Date(),
    });

    const app = Fastify();
    await app.register(annotationRoutes);
    const res = await app.inject({ method: 'DELETE', url: `/projects/${projectId}/annotations/${annId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.deleted).toBe(true);
    expect(mockStore.annotation.has(annId)).toBe(false);
    await app.close();
  });

  it('GET /projects/:projectId/annotations/search finds annotations by content', async () => {
    const { projectId } = seedProject();
    mockStore.annotation.set(id(), {
      id: id(), projectId, entityType: 'claim', entityId: 'c1',
      authorId: TEST_USER.id, content: 'Important finding about NLP', createdAt: new Date(), updatedAt: new Date(),
    });
    mockStore.annotation.set(id(), {
      id: id(), projectId, entityType: 'claim', entityId: 'c2',
      authorId: TEST_USER.id, content: 'Irrelevant note', createdAt: new Date(), updatedAt: new Date(),
    });

    const app = Fastify();
    await app.register(annotationRoutes);
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/annotations/search?q=NLP` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].content).toContain('NLP');
    await app.close();
  });

  it('GET /projects/:projectId/annotations/search returns empty for empty query', async () => {
    const { projectId } = seedProject();

    const app = Fastify();
    await app.register(annotationRoutes);
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/annotations/search?q=` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
    await app.close();
  });
});

// ===========================================================================
// EVALUATION CRITERIA ROUTES
// ===========================================================================
describe('Evaluation Criteria Routes', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
  });

  it('GET /projects/:projectId/evaluation-criteria returns criteria', async () => {
    const { projectId } = seedProject();
    const criteriaId = id();
    mockStore.evaluationCriteria.set(criteriaId, {
      id: criteriaId, projectId, name: 'Accuracy', description: 'How accurate',
      scale: '1-5', weight: 1.0, createdAt: new Date(), updatedAt: new Date(),
    });

    const app = Fastify();
    await app.register(evaluationCriteriaRoutes);
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/evaluation-criteria` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].name).toBe('Accuracy');
    await app.close();
  });

  it('POST /projects/:projectId/evaluation-criteria creates criteria', async () => {
    const { projectId } = seedProject();

    const app = Fastify();
    await app.register(evaluationCriteriaRoutes);
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/evaluation-criteria`,
      payload: { name: 'Novelty', description: 'How novel is this', scale: 'low/medium/high', weight: 2.0 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.name).toBe('Novelty');
    expect(res.json().data.weight).toBe(2.0);
    await app.close();
  });

  it('POST /projects/:projectId/evaluation-criteria returns 400 for missing fields', async () => {
    const { projectId } = seedProject();

    const app = Fastify();
    await app.register(evaluationCriteriaRoutes);
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/evaluation-criteria`,
      payload: { name: 'Only name' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('PUT /projects/:projectId/evaluation-criteria/:id updates criteria', async () => {
    const { projectId } = seedProject();
    const criteriaId = id();
    mockStore.evaluationCriteria.set(criteriaId, {
      id: criteriaId, projectId, name: 'Old Name', description: 'Old desc',
      scale: '1-5', weight: 1.0, createdAt: new Date(), updatedAt: new Date(),
    });

    const app = Fastify();
    await app.register(evaluationCriteriaRoutes);
    const res = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/evaluation-criteria/${criteriaId}`,
      payload: { name: 'New Name', weight: 3.0 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe('New Name');
    expect(res.json().data.weight).toBe(3.0);
    await app.close();
  });

  it('DELETE /projects/:projectId/evaluation-criteria/:id deletes criteria and scores', async () => {
    const { projectId } = seedProject();
    const criteriaId = id();
    mockStore.evaluationCriteria.set(criteriaId, {
      id: criteriaId, projectId, name: 'To Delete', description: 'Del',
      scale: '1-5', weight: 1.0, createdAt: new Date(), updatedAt: new Date(),
    });
    // Seed a score for this criteria
    const scoreId = id();
    mockStore.evidenceCustomScore.set(scoreId, {
      id: scoreId, evidenceId: 'ev-1', criteriaId, score: 'high', modelId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const app = Fastify();
    await app.register(evaluationCriteriaRoutes);
    const res = await app.inject({ method: 'DELETE', url: `/projects/${projectId}/evaluation-criteria/${criteriaId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.deleted).toBe(true);
    expect(mockStore.evaluationCriteria.has(criteriaId)).toBe(false);
    expect(mockStore.evidenceCustomScore.has(scoreId)).toBe(false);
    await app.close();
  });

  it('POST /evidence/:evidenceId/scores adds score to evidence', async () => {
    const { projectId } = seedProject();
    const evidenceId = seedEvidence(projectId);
    const criteriaId = id();
    mockStore.evaluationCriteria.set(criteriaId, {
      id: criteriaId, projectId, name: 'Quality', description: 'Quality score',
      scale: 'low/high', weight: 1.0, createdAt: new Date(), updatedAt: new Date(),
    });

    const app = Fastify();
    await app.register(evaluationCriteriaRoutes);
    const res = await app.inject({
      method: 'POST',
      url: `/evidence/${evidenceId}/scores`,
      payload: { criteriaId, score: 'high' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.score).toBe('high');
    expect(res.json().data.criteriaId).toBe(criteriaId);
    await app.close();
  });

  it('POST /evidence/:evidenceId/scores returns 404 for nonexistent evidence', async () => {
    const app = Fastify();
    await app.register(evaluationCriteriaRoutes);
    const res = await app.inject({
      method: 'POST',
      url: '/evidence/nonexistent/scores',
      payload: { criteriaId: 'x', score: 'high' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('POST /evidence/:evidenceId/scores returns 404 for nonexistent criteria', async () => {
    const { projectId } = seedProject();
    const evidenceId = seedEvidence(projectId);

    const app = Fastify();
    await app.register(evaluationCriteriaRoutes);
    const res = await app.inject({
      method: 'POST',
      url: `/evidence/${evidenceId}/scores`,
      payload: { criteriaId: 'nonexistent', score: 'high' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('POST /evidence/:evidenceId/scores upserts existing score', async () => {
    const { projectId } = seedProject();
    const evidenceId = seedEvidence(projectId);
    const criteriaId = id();
    mockStore.evaluationCriteria.set(criteriaId, {
      id: criteriaId, projectId, name: 'Quality', description: 'Quality score',
      scale: 'low/high', weight: 1.0, createdAt: new Date(), updatedAt: new Date(),
    });
    // Seed existing score
    const scoreId = id();
    mockStore.evidenceCustomScore.set(scoreId, {
      id: scoreId, evidenceId, criteriaId, score: 'low', modelId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const app = Fastify();
    await app.register(evaluationCriteriaRoutes);
    const res = await app.inject({
      method: 'POST',
      url: `/evidence/${evidenceId}/scores`,
      payload: { criteriaId, score: 'high' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.score).toBe('high');
    await app.close();
  });

  it('GET /evidence/:evidenceId/scores returns scores with criteria', async () => {
    const { projectId } = seedProject();
    const evidenceId = seedEvidence(projectId);
    const criteriaId = id();
    mockStore.evaluationCriteria.set(criteriaId, {
      id: criteriaId, projectId, name: 'Quality', description: 'Quality',
      scale: 'low/high', weight: 1.0, createdAt: new Date(), updatedAt: new Date(),
    });
    mockStore.evidenceCustomScore.set(id(), {
      id: id(), evidenceId, criteriaId, score: 'high', modelId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const app = Fastify();
    await app.register(evaluationCriteriaRoutes);
    const res = await app.inject({ method: 'GET', url: `/evidence/${evidenceId}/scores` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    await app.close();
  });

  it('GET /evidence/:evidenceId/scores returns 404 for nonexistent evidence', async () => {
    const app = Fastify();
    await app.register(evaluationCriteriaRoutes);
    const res = await app.inject({ method: 'GET', url: '/evidence/nonexistent/scores' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ===========================================================================
// REALTIME ROUTES
// ===========================================================================
describe('Realtime Routes', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
  });

  it('POST /projects/:projectId/presence updates presence', async () => {
    const { projectId } = seedProject();

    const app = Fastify();
    await app.register(realtimeRoutes);
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/presence`,
      payload: { userName: 'Alice', page: '/dashboard' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.ok).toBe(true);
    await app.close();
  });

  it('GET /projects/:projectId/presence returns current presence', async () => {
    const { projectId } = seedProject();
    const presenceId = id();
    mockStore.userPresence.set(presenceId, {
      id: presenceId, projectId, userId: TEST_USER.id, userName: 'Alice',
      page: '/dashboard', lastSeenAt: new Date(),
    });

    const app = Fastify();
    await app.register(realtimeRoutes);
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/presence` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.presence).toBeDefined();
    expect(Array.isArray(body.data.presence)).toBe(true);
    await app.close();
  });

  it('GET /projects/:projectId/events/live returns SSE stream', async () => {
    const { projectId } = seedProject();

    const app = Fastify();
    await app.register(realtimeRoutes);
    await app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const addr = app.server.address() as { port: number };
      const res = await fetch(`http://127.0.0.1:${addr.port}/projects/${projectId}/events/live`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const reader = res.body!.getReader();
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      expect(text).toContain('connected');
      await reader.cancel();
    } finally {
      await app.close();
    }
  }, 10000);

  it('POST /projects/:projectId/broadcast sends event', async () => {
    const { projectId } = seedProject();

    const app = Fastify();
    await app.register(realtimeRoutes);
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/broadcast`,
      payload: { event: 'test.event', data: { message: 'hello' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.broadcast).toBe(true);
    await app.close();
  });
});

// ===========================================================================
// CLAIM DEPENDENCY ROUTES
// ===========================================================================
describe('Claim Dependency Routes', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
  });

  it('GET /projects/:projectId/claims/:claimId/dependencies returns dependencies', async () => {
    const { projectId, versionId } = seedProject();
    const claimId = seedClaim(projectId, versionId);
    const depId = id();
    mockStore.claimDependency.set(depId, {
      id: depId, fromClaimId: claimId, toClaimId: 'other-claim',
      relation: 'depends_on', createdAt: new Date(),
    });

    const app = Fastify();
    await app.register(claimRoutes);
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/claims/${claimId}/dependencies` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].relation).toBe('depends_on');
    await app.close();
  });

  it('POST /projects/:projectId/claims/:claimId/dependencies creates dependency', async () => {
    const { projectId, versionId } = seedProject();
    const claimId1 = seedClaim(projectId, versionId, { text: 'Source claim' });
    const claimId2 = seedClaim(projectId, versionId, { text: 'Target claim' });

    const app = Fastify();
    await app.register(claimRoutes);
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/claims/${claimId1}/dependencies`,
      payload: { targetClaimId: claimId2, relation: 'supports' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.relation).toBe('supports');
    expect(res.json().data.fromClaimId).toBe(claimId1);
    expect(res.json().data.toClaimId).toBe(claimId2);
    await app.close();
  });

  it('POST /projects/:projectId/claims/:claimId/dependencies returns 404 for nonexistent claim', async () => {
    const { projectId } = seedProject();

    const app = Fastify();
    await app.register(claimRoutes);
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/claims/nonexistent/dependencies`,
      payload: { targetClaimId: 'also-nonexistent' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('DELETE /projects/:projectId/claims/:claimId/dependencies/:dependencyId deletes dependency', async () => {
    const { projectId, versionId } = seedProject();
    const claimId = seedClaim(projectId, versionId);
    const depId = id();
    mockStore.claimDependency.set(depId, {
      id: depId, fromClaimId: claimId, toClaimId: 'other',
      relation: 'depends_on', createdAt: new Date(),
    });

    const app = Fastify();
    await app.register(claimRoutes);
    const res = await app.inject({
      method: 'DELETE',
      url: `/projects/${projectId}/claims/${claimId}/dependencies/${depId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.deleted).toBe(true);
    expect(mockStore.claimDependency.has(depId)).toBe(false);
    await app.close();
  });

  it('POST /projects/:projectId/claims/auto-detect-dependencies detects keyword overlap', async () => {
    const { projectId, versionId } = seedProject();
    seedClaim(projectId, versionId, { text: 'Machine learning models are effective for classification tasks' });
    seedClaim(projectId, versionId, { text: 'Deep learning models achieve state-of-the-art performance' });

    const app = Fastify();
    await app.register(claimRoutes);
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/claims/auto-detect-dependencies`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.dependencies).toBeDefined();
    expect(Array.isArray(body.data.dependencies)).toBe(true);
    await app.close();
  });

  it('POST /projects/:projectId/claims/auto-detect-dependencies returns empty for <2 claims', async () => {
    const { projectId, versionId } = seedProject();
    seedClaim(projectId, versionId);

    const app = Fastify();
    await app.register(claimRoutes);
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/claims/auto-detect-dependencies`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.dependencies).toHaveLength(0);
    await app.close();
  });
});

// ===========================================================================
// EVIDENCE STALENESS ROUTES
// ===========================================================================
describe('Evidence Staleness Routes', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
  });

  it('GET /projects/:projectId/evidence/stale returns stale evidence', async () => {
    const { projectId } = seedProject();
    // Old evidence with no verification
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 200);
    seedEvidence(projectId, { createdAt: oldDate, publishedAt: oldDate, lastVerifiedAt: null });
    // Recent evidence
    seedEvidence(projectId, { createdAt: new Date(), publishedAt: new Date() });

    const app = Fastify();
    await app.register(evidenceRoutes);
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/evidence/stale` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.staleCount).toBe(1);
    expect(body.data.totalCount).toBe(2);
    expect(body.data.thresholdDays).toBe(180);
    await app.close();
  });

  it('GET /projects/:projectId/evidence/stale marks high-risk as stale', async () => {
    const { projectId } = seedProject();
    seedEvidence(projectId, { stalenessRisk: 'high' });

    const app = Fastify();
    await app.register(evidenceRoutes);
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/evidence/stale` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.staleCount).toBe(1);
    await app.close();
  });

  it('POST /evidence/:evidenceId/verify marks evidence as verified', async () => {
    const { projectId } = seedProject();
    const evidenceId = seedEvidence(projectId, { stalenessRisk: 'high' });

    const app = Fastify();
    await app.register(evidenceRoutes);
    const res = await app.inject({ method: 'POST', url: `/evidence/${evidenceId}/verify` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.stalenessRisk).toBe('low');
    expect(res.json().data.lastVerifiedAt).toBeDefined();
    await app.close();
  });

  it('POST /evidence/:evidenceId/verify returns 404 for nonexistent evidence', async () => {
    const app = Fastify();
    await app.register(evidenceRoutes);
    const res = await app.inject({ method: 'POST', url: '/evidence/nonexistent/verify' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('GET /evidence/:evidenceId/provenance returns provenance chain', async () => {
    const { projectId } = seedProject();
    const evidenceId = seedEvidence(projectId);

    const app = Fastify();
    await app.register(evidenceRoutes);
    const res = await app.inject({ method: 'GET', url: `/evidence/${evidenceId}/provenance` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.chain).toBeDefined();
    expect(Array.isArray(body.data.chain)).toBe(true);
    expect(body.data.chain[0].step).toBe('discovery');
    await app.close();
  });

  it('GET /evidence/:evidenceId/provenance returns 404 for nonexistent evidence', async () => {
    const app = Fastify();
    await app.register(evidenceRoutes);
    const res = await app.inject({ method: 'GET', url: '/evidence/nonexistent/provenance' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ===========================================================================
// RUN COMPARISON ROUTES
// ===========================================================================
describe('Run Comparison Routes', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
  });

  it('GET /projects/:projectId/runs/compare returns comparison', async () => {
    const { projectId } = seedProject();

    const app = Fastify();
    await app.register(runRoutes);
    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/runs/compare?run1=r1&run2=r2`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.run1).toBeDefined();
    expect(body.data.run2).toBeDefined();
    await app.close();
  });

  it('GET /projects/:projectId/runs/compare returns 400 without run params', async () => {
    const { projectId } = seedProject();

    const app = Fastify();
    await app.register(runRoutes);
    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/runs/compare`,
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ===========================================================================
// PORTFOLIO VIEW ROUTES
// ===========================================================================
describe('Portfolio View Routes', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
  });

  it('GET /portfolio returns projects with aggregate stats', async () => {
    const { projectId } = seedProject();
    seedClaim(projectId, id(), { status: 'supported' });
    seedClaim(projectId, id(), { status: 'unverified' });
    seedEvidence(projectId, { status: 'accepted' });

    const app = Fastify();
    await app.register(projectRoutes);
    const res = await app.inject({ method: 'GET', url: '/portfolio' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].stats.totalClaims).toBe(2);
    expect(body.data[0].stats.supportedClaims).toBe(1);
    expect(body.data[0].stats.totalEvidence).toBe(1);
    expect(body.data[0].stats.healthScore).toBe(50);
    await app.close();
  });

  it('GET /portfolio returns empty array when no projects', async () => {
    const app = Fastify();
    await app.register(projectRoutes);
    const res = await app.inject({ method: 'GET', url: '/portfolio' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(0);
    await app.close();
  });
});

// ===========================================================================
// REPRODUCIBILITY PACK ROUTES
// ===========================================================================
describe('Reproducibility Pack Routes', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
  });

  it('GET /projects/:projectId/export/reproducibility-pack returns pack', async () => {
    const { projectId } = seedProject();
    seedModel();

    const app = Fastify();
    await app.register(projectRoutes);
    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/export/reproducibility-pack`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.metadata).toBeDefined();
    expect(body.data.metadata.projectId).toBe(projectId);
    expect(body.data.project).toBeDefined();
    expect(body.data.project.title).toBe('Test Project');
    expect(body.data.modelConfigs).toBeDefined();
    expect(body.data.prompts).toBeDefined();
    expect(body.data.pipeline).toBeDefined();
    expect(body.data.results).toBeDefined();
    await app.close();
  });

  it('GET /projects/:projectId/export/reproducibility-pack returns 404 for nonexistent project', async () => {
    const app = Fastify();
    await app.register(projectRoutes);
    const res = await app.inject({
      method: 'GET',
      url: '/projects/nonexistent/export/reproducibility-pack',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ===========================================================================
// CROSS-PROJECT SEARCH & RELATED PROJECTS
// ===========================================================================
describe('Cross-Project Routes', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
  });

  it('POST /projects/:projectId/cross-project-search returns results', async () => {
    const { projectId } = seedProject();

    const app = Fastify();
    await app.register(graphRoutes);
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/cross-project-search`,
      payload: { query: 'machine learning', limit: 5 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeDefined();
    await app.close();
  });

  it('POST /projects/:projectId/cross-project-search returns 400 for empty query', async () => {
    const { projectId } = seedProject();

    const app = Fastify();
    await app.register(graphRoutes);
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/cross-project-search`,
      payload: { query: '' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('GET /projects/:projectId/related-projects returns related projects', async () => {
    const { projectId } = seedProject();
    seedClaim(projectId, id(), { text: 'Test claim for related projects' });

    const app = Fastify();
    await app.register(graphRoutes);
    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/related-projects`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.relatedProjects).toBeDefined();
    await app.close();
  });
});

// ===========================================================================
// LITERATURE REVIEW ROUTES
// ===========================================================================
describe('Literature Review Routes', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
  });

  it('GET /projects/:projectId/literature-reviews returns reviews', async () => {
    const { projectId } = seedProject();
    const reviewId = id();
    mockStore.literatureReview.set(reviewId, {
      id: reviewId, projectId, title: 'Review 1', researchQuestion: 'What?',
      status: 'completed', searchStrategy: null, prismaFlow: null,
      findings: null, gaps: null, conclusion: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const app = Fastify();
    await app.register(graphRoutes);
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/literature-reviews` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0].title).toBe('Review 1');
    await app.close();
  });

  it('POST /projects/:projectId/literature-reviews creates review', async () => {
    const { projectId } = seedProject();

    const app = Fastify();
    await app.register(graphRoutes);
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/literature-reviews`,
      payload: { title: 'New Review', researchQuestion: 'What is the impact?' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.title).toBe('New Review');
    await app.close();
  });

  it('GET /projects/:projectId/literature-reviews/:reviewId returns single review', async () => {
    const { projectId } = seedProject();
    const reviewId = id();
    mockStore.literatureReview.set(reviewId, {
      id: reviewId, projectId, title: 'Specific Review', researchQuestion: 'Why?',
      status: 'completed', searchStrategy: null, prismaFlow: null,
      findings: null, gaps: null, conclusion: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const app = Fastify();
    await app.register(graphRoutes);
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/literature-reviews/${reviewId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.title).toBe('Specific Review');
    await app.close();
  });

  it('GET /projects/:projectId/literature-reviews/:reviewId returns 404 for nonexistent', async () => {
    const { projectId } = seedProject();

    const app = Fastify();
    await app.register(graphRoutes);
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/literature-reviews/nonexistent` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

// ===========================================================================
// ARGUMENT MAP EXPORT
// ===========================================================================
describe('Argument Map Export', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
  });

  it('GET /projects/:projectId/export/argument-map returns empty when no claims', async () => {
    const { projectId } = seedProject();

    const app = Fastify();
    await app.register(graphRoutes);
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/export/argument-map` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.argumentMaps).toHaveLength(0);
    expect(res.json().data.message).toBe('No claims found');
    await app.close();
  });

  it('GET /projects/:projectId/export/argument-map returns empty when no models configured', async () => {
    const { projectId, versionId } = seedProject();
    seedClaim(projectId, versionId);

    const app = Fastify();
    await app.register(graphRoutes);
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/export/argument-map` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.message).toBe('No model configurations found');
    await app.close();
  });
});

// ===========================================================================
// CITATION GRAPH
// ===========================================================================
describe('Citation Graph', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
  });

  it('GET /projects/:projectId/citation-graph returns nodes and edges', async () => {
    const { projectId, versionId } = seedProject();
    seedClaim(projectId, versionId);
    seedEvidence(projectId);

    const app = Fastify();
    await app.register(graphRoutes);
    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/citation-graph` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.nodes).toBeDefined();
    expect(body.data.edges).toBeDefined();
    expect(Array.isArray(body.data.nodes)).toBe(true);
    expect(Array.isArray(body.data.edges)).toBe(true);
    await app.close();
  });
});

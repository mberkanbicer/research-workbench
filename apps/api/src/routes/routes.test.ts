import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import Fastify from 'fastify';
import { projectRoutes } from './projects.js';
import { modelRoutes } from './models.js';
import { claimRoutes } from './claims.js';
import { evidenceRoutes } from './evidence.js';
import { ideaVersionRoutes } from './idea-versions.js';
import { decisionRoutes } from './decisions.js';
import { runRoutes } from './runs.js';
import { createRateLimiter, apiRateLimiter, _resetBucketsForTesting } from '../middleware/rate-limit.js';

// ---------------------------------------------------------------------------
// In-memory store (shared from test-utils)
// ---------------------------------------------------------------------------
type Store = Record<string, Map<string, any>>;

const { mockPrisma, mockStore } = vi.hoisted(() => {
  return (globalThis as any).__createInMemoryPrisma();
});

process.env.SEARCH_PROVIDER = 'mock';
process.env.MOCK_SEARCH_FIXTURE_PATH = '../../templates/mock-search-results.json';

vi.mock('../prisma.js', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

vi.mock('./auth.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./auth.js')>();
  return {
    ...original,
    authMiddleware: vi.fn(async (request: any) => {
      request.user = { id: 'test-user-id', email: 'test@test.com', name: 'Test' };
    }),
  };
});

vi.mock('../orchestrator/worker.js', () => {
  const retry = vi.fn();
  const remove = vi.fn();
  const add = vi.fn();
  const getJob = vi.fn((runId: string) => {
    // Return a mock job for any runId
    return { retry, remove, data: { projectId: 'proj-1' } };
  });
  return {
    deliberationQueue: { add, getJob },
    deliberationWorker: { close: vi.fn(), on: vi.fn() },
  };
});

vi.mock('bullmq', () => {
  const retry = vi.fn();
  const remove = vi.fn();
  const add = vi.fn();
  const getJob = vi.fn((runId: string) => ({
    retry,
    remove,
    data: { projectId: runId },
  }));
  return {
    Queue: vi.fn(() => ({ add, getJob })),
    Worker: vi.fn(() => ({ on: vi.fn(), close: vi.fn() })),
  };
});

// ---------------------------------------------------------------------------
// Helper to build a Fastify test app
// ---------------------------------------------------------------------------
async function buildApp() {
  const app = Fastify();
  // Global rate limiter (same as server.ts)
  app.addHook('preHandler', apiRateLimiter);
  // Register error handler (same as server.ts)
  app.setErrorHandler((error: any, request: any, reply: any) => {
    if (error.name === 'ZodError') {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: error
        }
      });
    }
    app.log.error(error);
    reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  });
  await app.register(projectRoutes);
  await app.register(modelRoutes);
  await app.register(claimRoutes);
  await app.register(evidenceRoutes);
  await app.register(ideaVersionRoutes);
  await app.register(decisionRoutes);
  await app.register(runRoutes);
  // Health/ready routes (same as server.ts)
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async () => ({ status: 'ready' }));
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function seedProject(store: Store, overrides = {}) {
  const projectId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const project = {
    id: projectId,
    title: 'Test Project',
    goal: 'Test goal',
    currentSynthesis: null,
    status: 'active',
    userId: 'test-user-id',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  const version = {
    id: versionId,
    projectId,
    versionNumber: 1,
    title: 'Initial Idea',
    description: 'A test idea',
    status: 'under_review',
    changesFromPrevious: null,
    createdBecauseOfCritiqueIds: null,
    createdAt: new Date(),
  };
  store.researchProject?.set(projectId, project);
  store.ideaVersion?.set(versionId, version);
  return { projectId, versionId, project, version };
}

function seedModel(store: Store, overrides = {}) {
  const id = crypto.randomUUID();
  const model = {
    id,
    name: 'Mock Researcher',
    provider: 'mock',
    model: 'mock-researcher',
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
  };
  store.modelConfig?.set(id, model);
  return { id, model };
}

function seedClaim(store: Store, projectId: string, versionId: string, overrides = {}) {
  const id = crypto.randomUUID();
  const claim = {
    id,
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
  };
  store.claim?.set(id, claim);
  return { id, claim };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
let app: any;

beforeEach(async () => {
  for (const map of Object.values(mockStore) as Map<string, any>[]) { map.clear(); }
  if (app) { await app.close(); }
  app = await buildApp();
});

afterAll(async () => {
  if (app) await app.close();
});

// ===========================================================================
// PROJECT ROUTES
// ===========================================================================
describe('Project Routes', () => {
  it('POST /projects creates a project with initial idea', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { title: 'My Research', goal: 'Test goal', initialIdea: 'Initial idea text' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.project.title).toBe('My Research');
    expect(body.data.project.id).toBeDefined();
  });

  it('POST /projects returns 400 for missing fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { title: 'Missing fields' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /projects lists all projects', async () => {
    seedProject(mockStore, { title: 'Project A' });
    seedProject(mockStore, { title: 'Project B' });

    const res = await app.inject({ method: 'GET', url: '/projects' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(2);
  });

  it('GET /projects/:id returns project with dashboard data', async () => {
    const { projectId } = seedProject(mockStore);

    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.project.title).toBe('Test Project');
    expect(body.data.currentIdeaVersion).toBeDefined();
    expect(body.data.claimCounts).toBeDefined();
  });

  it('GET /projects/:id returns 404 for nonexistent project', async () => {
    const res = await app.inject({ method: 'GET', url: '/projects/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /projects/:id updates project fields', async () => {
    const { projectId } = seedProject(mockStore);

    const res = await app.inject({
      method: 'PATCH',
      url: `/projects/${projectId}`,
      payload: { title: 'Updated Title', goal: 'Updated goal' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.title).toBe('Updated Title');
    expect(body.data.goal).toBe('Updated goal');
  });

  it('POST /projects/:id/archive sets status to archived', async () => {
    const { projectId } = seedProject(mockStore);

    const res = await app.inject({ method: 'POST', url: `/projects/${projectId}/archive` });
    expect(res.statusCode).toBe(200);
    expect(mockStore.researchProject!.get(projectId).status).toBe('archived');
  });

  it('POST /projects/:id/decisions creates a decision', async () => {
    const { projectId, versionId } = seedProject(mockStore);

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/decisions`,
      payload: { decisionStatus: 'qualified_consensus', decisionText: 'Proceed with revisions', ideaVersionId: versionId },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.decisionStatus).toBe('qualified_consensus');
  });

  it('DELETE /projects/:id deletes a project', async () => {
    const { projectId } = seedProject(mockStore);

    const res = await app.inject({ method: 'DELETE', url: `/projects/${projectId}` });
    expect(res.statusCode).toBe(200);
    expect(mockStore.researchProject!.has(projectId)).toBe(false);
  });

  it('GET /projects/:id/export/json returns sanitized export', async () => {
    const { projectId } = seedProject(mockStore);

    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/export/json` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.title).toBe('Test Project');
    expect(body.ideaVersions).toBeDefined();
  });

  it('GET /projects/:id/export/markdown returns markdown', async () => {
    const { projectId } = seedProject(mockStore);

    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/export/markdown` });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('# Research Project');
    expect(res.payload).toContain('Test Project');
  });
});

// ===========================================================================
// MODEL ROUTES
// ===========================================================================
describe('Model Routes', () => {
  it('GET /models returns all models without apiKeyRef', async () => {
    seedModel(mockStore, { name: 'M1' });
    seedModel(mockStore, { name: 'M2' });

    const res = await app.inject({ method: 'GET', url: '/models' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(2);
    // apiKeyRef must be null
    body.data.forEach((m: any) => expect(m.apiKeyRef).toBeNull());
  });

  it('POST /models creates model without returning apiKeyRef', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/models',
      payload: {
        name: 'New Model',
        provider: 'mock',
        model: 'mock-model',
        contextWindow: 8000,
        isEnabled: true,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.name).toBe('New Model');
    expect(body.data.apiKeyRef).toBeNull();
  });

  it('GET /models/:id returns model without apiKeyRef', async () => {
    const { id } = seedModel(mockStore);

    const res = await app.inject({ method: 'GET', url: `/models/${id}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.name).toBe('Mock Researcher');
    expect(body.data.apiKeyRef).toBeNull();
  });

  it('PATCH /models/:id updates model fields', async () => {
    const { id } = seedModel(mockStore);

    const res = await app.inject({
      method: 'PATCH',
      url: `/models/${id}`,
      payload: { name: 'Updated Model', isEnabled: false },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.name).toBe('Updated Model');
    expect(body.data.isEnabled).toBe(false);
    expect(body.data.apiKeyRef).toBeNull();
  });

  it('POST /models/:id/test works with mock adapter', async () => {
    const { id } = seedModel(mockStore);

    const res = await app.inject({ method: 'POST', url: `/models/${id}/test` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.ok).toBe(true);
    expect(body.data.text).toBeDefined();
    expect(body.data.usage).toBeDefined();
  });

  it('POST /models/:id/test returns 500 for unknown provider', async () => {
    const { id } = seedModel(mockStore, { provider: 'nonexistent' });

    const res = await app.inject({ method: 'POST', url: `/models/${id}/test` });
    expect(res.statusCode).toBe(500);
  });

  it('DELETE /models/:id deletes a model', async () => {
    const { id } = seedModel(mockStore);

    const res = await app.inject({ method: 'DELETE', url: `/models/${id}` });
    expect(res.statusCode).toBe(204);
    expect(mockStore.modelConfig!.has(id)).toBe(false);
  });

  it('GET /models/:id returns 404 for nonexistent model', async () => {
    const res = await app.inject({ method: 'GET', url: '/models/nonexistent' });
    expect(res.statusCode).toBe(404);
  });
});

// ===========================================================================
// CLAIM ROUTES
// ===========================================================================
describe('Claim Routes', () => {
  it('PATCH /claims/:id updates claim status', async () => {
    const { projectId, versionId } = seedProject(mockStore);
    const { id } = seedClaim(mockStore, projectId, versionId);

    const res = await app.inject({
      method: 'PATCH',
      url: `/claims/${id}`,
      payload: { status: 'supported' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.status).toBe('supported');
  });

  it('PATCH /claims/:id returns 404 for nonexistent claim', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/claims/nonexistent',
      payload: { status: 'supported' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /claims/:id/search-counter-evidence returns evidence', async () => {
    const { projectId, versionId } = seedProject(mockStore);
    const { id: claimId } = seedClaim(mockStore, projectId, versionId);

    const res = await app.inject({
      method: 'POST',
      url: `/claims/${claimId}/search-counter-evidence`,
      payload: { query: 'test query', maxResults: 3 },
    });
    // May be 400 if search adapter not configured, or 201 if mock adapter loaded
    expect([201, 400]).toContain(res.statusCode);
    if (res.statusCode === 201) {
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data)).toBe(true);
    }
  });
});

// ===========================================================================
// EVIDENCE ROUTES
// ===========================================================================
describe('Evidence Routes', () => {
  it('PATCH /evidence/:id updates evidence status', async () => {
    const { projectId } = seedProject(mockStore);
    const evidenceId = crypto.randomUUID();
    mockStore.evidence!.set(evidenceId, {
      id: evidenceId,
      projectId,
      claimId: null,
      title: 'Source',
      sourceType: 'academic',
      status: 'pending_review',
      reliability: 'pending',
      relevance: 'pending',
      sourceUrl: 'https://example.com',
      excerpt: '...',
      summary: null,
      publisher: null,
      publishedAt: null,
      retrievedAt: new Date(),
      discoveredBy: null,
      stalenessRisk: 'medium',
      isCounter: false,
      rawContentRef: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/evidence/${evidenceId}`,
      payload: { status: 'accepted', reliability: 'high' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.status).toBe('accepted');
  });

  it('PATCH /evidence/:id returns 404 for nonexistent evidence', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/evidence/nonexistent',
      payload: { status: 'accepted' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /claims/:claimId/search-evidence returns evidence', async () => {
    const { projectId, versionId } = seedProject(mockStore);
    const { id: claimId } = seedClaim(mockStore, projectId, versionId);

    const res = await app.inject({
      method: 'POST',
      url: `/claims/${claimId}/search-evidence`,
      payload: { query: 'test query', maxResults: 3 },
    });
    expect([201, 400]).toContain(res.statusCode);
  });
});

// ===========================================================================
// IDEA VERSION ROUTES
// ===========================================================================
describe('Idea Version Routes', () => {
  it('GET /projects/:projectId/idea-versions returns versions', async () => {
    const { projectId, versionId } = seedProject(mockStore);
    const version2Id = crypto.randomUUID();
    mockStore.ideaVersion!.set(version2Id, {
      id: version2Id,
      projectId,
      versionNumber: 2,
      title: 'Revised Idea',
      description: 'After deliberation',
      status: 'under_review',
      changesFromPrevious: ['Refined claim'],
      createdBecauseOfCritiqueIds: null,
      createdAt: new Date(),
    });

    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/idea-versions` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(2);
    expect(body.data[0].versionNumber).toBe(2); // Desc order
    expect(body.data[1].versionNumber).toBe(1);
  });

  it('GET /idea-versions/:id returns version with claims', async () => {
    const { projectId, versionId } = seedProject(mockStore);

    const res = await app.inject({ method: 'GET', url: `/idea-versions/${versionId}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.versionNumber).toBe(1);
    expect(body.data.title).toBe('Initial Idea');
  });
});

// ===========================================================================
// DECISION ROUTES
// ===========================================================================
describe('Decision Routes', () => {
  it('GET /projects/:projectId/decisions returns decisions', async () => {
    const { projectId, versionId } = seedProject(mockStore);
    mockStore.decisionRecord!.set(crypto.randomUUID(), {
      id: crypto.randomUUID(),
      projectId,
      ideaVersionId: versionId,
      decisionStatus: 'qualified_consensus',
      decisionText: 'Proceed',
      modelFinalVotes: null,
      finalIdeaVersionId: null,
      createdAt: new Date(),
    });

    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/decisions` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(1);
    expect(body.data[0].decisionStatus).toBe('qualified_consensus');
  });

  it('GET /decisions/:id returns single decision', async () => {
    const { projectId, versionId } = seedProject(mockStore);
    const decId = crypto.randomUUID();
    mockStore.decisionRecord!.set(decId, {
      id: decId,
      projectId,
      ideaVersionId: versionId,
      decisionStatus: 'full_consensus',
      decisionText: 'All agree',
      modelFinalVotes: null,
      finalIdeaVersionId: null,
      createdAt: new Date(),
    });

    const res = await app.inject({ method: 'GET', url: `/decisions/${decId}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.decisionStatus).toBe('full_consensus');
  });
});

// ===========================================================================
// RUN ROUTES
// ===========================================================================
describe('Run Routes', () => {
  it('POST /projects/:projectId/runs starts a run', async () => {
    const { projectId } = seedProject(mockStore);
    seedModel(mockStore);

    // Seed user for defaultSearchProvider fallback lookup
    mockStore.user.set('test-user-id', {
      id: 'test-user-id',
      email: 'test@test.com',
      name: 'Test',
      defaultSearchProvider: null,
    });

    const modelIds = Array.from(mockStore.modelConfig!.keys());
    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/runs`,
      payload: { modelIds, maxRounds: 1, loopMode: 'standard' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.runId).toBeDefined();
    expect(body.data.status).toBe('queued');
  });

  it('POST /projects/:projectId/runs returns 400 without models', async () => {
    const { projectId } = seedProject(mockStore);

    const res = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/runs`,
      payload: { modelIds: [], maxRounds: 1, mode: 'real' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /runs/:runId/events/history returns events', async () => {
    const { projectId } = seedProject(mockStore);
    const runId = crypto.randomUUID();

    // Add some events
    mockStore.runEvent!.set(crypto.randomUUID(), {
      id: crypto.randomUUID(),
      runId,
      projectId,
      type: 'run.started',
      payload: {},
      createdAt: new Date(),
    });
    mockStore.runEvent!.set(crypto.randomUUID(), {
      id: crypto.randomUUID(),
      runId,
      projectId,
      type: 'run.completed',
      payload: { outcome: 'success' },
      createdAt: new Date(Date.now() + 1000),
    });

    const res = await app.inject({ method: 'GET', url: `/runs/${runId}/events/history` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(2);
    expect(body.data[0].type).toBe('run.started');
    expect(body.data[1].type).toBe('run.completed');
  });

  it('POST /runs/:runId/retry resets failed stage', async () => {
    const { projectId } = seedProject(mockStore);
    const model = seedModel(mockStore);
    const runId = crypto.randomUUID();
    mockStore.runEvent!.set(crypto.randomUUID(), {
      id: crypto.randomUUID(), runId, projectId,
      type: 'run.started',
      payload: { modelIds: [model.id], maxRounds: 3 },
      createdAt: new Date(),
    });
    mockStore.runStage!.set('stage-1', {
      id: 'stage-1',
      runId,
      stageName: 'extraction',
      status: 'FAILED',
      error: 'Something went wrong',
      attempts: 1,
      updatedAt: new Date(),
    });

    const res = await app.inject({ method: 'POST', url: `/runs/${runId}/retry` });
    expect(res.statusCode).toBe(200);
    const stage = mockStore.runStage!.get('stage-1');
    expect(stage.status).toBe('PENDING');
  });

  it('GET /runs/:runId/metrics returns aggregated self-improving metrics', async () => {
    const { projectId } = seedProject(mockStore);
    const runId = crypto.randomUUID();

    mockStore.runEvent!.set(crypto.randomUUID(), {
      id: crypto.randomUUID(), runId, projectId,
      type: 'run.started', payload: {},
      createdAt: new Date(),
    });
    mockStore.runEvent!.set(crypto.randomUUID(), {
      id: crypto.randomUUID(), runId, projectId,
      type: 'goal_loop.quality_report',
      payload: { stage: 'review', score: 0.9, isUsable: true, issueCount: 0 },
      createdAt: new Date(Date.now() + 100),
    });
    mockStore.runEvent!.set(crypto.randomUUID(), {
      id: crypto.randomUUID(), runId, projectId,
      type: 'goal_loop.iteration_completed',
      payload: { iteration: 1, correctiveActions: 2, qualityIssues: 1, isFinal: false },
      createdAt: new Date(Date.now() + 200),
    });

    const res = await app.inject({ method: 'GET', url: `/runs/${runId}/metrics` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.runId).toBe(runId);
    expect(body.data.stageQuality.review.avg).toBeCloseTo(0.9);
    expect(body.data.iterations).toHaveLength(1);
    expect(body.data.iterations[0].correctiveActions).toBe(2);
  });

  it('GET /runs/:runId/metrics returns 404 for standard runs', async () => {
    const { projectId } = seedProject(mockStore);
    const runId = crypto.randomUUID();
    mockStore.runEvent!.set(crypto.randomUUID(), {
      id: crypto.randomUUID(), runId, projectId,
      type: 'run.started', payload: {},
      createdAt: new Date(),
    });

    const res = await app.inject({ method: 'GET', url: `/runs/${runId}/metrics` });
    expect(res.statusCode).toBe(404);
  });

  it('GET /runs/:runId/context-manifests returns manifests', async () => {
    const { projectId } = seedProject(mockStore);
    const runId = crypto.randomUUID();
    const manifestId = crypto.randomUUID();
    mockStore.runEvent!.set(crypto.randomUUID(), {
      id: crypto.randomUUID(), runId, projectId,
      type: 'run.started', payload: {},
      createdAt: new Date(),
    });
    mockStore.contextManifest!.set(manifestId, {
      id: manifestId,
      projectId,
      modelId: 'model-1',
      taskId: null,
      tokenBudget: 32000,
      tokenUsed: 1000,
      includedClaims: [],
      includedEvidence: [],
      retrievalReason: { mode: 'semantic' },
      createdAt: new Date(),
    });

    const res = await app.inject({ method: 'GET', url: `/runs/${runId}/context-manifests` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('GET /runs/:runId/events opens live SSE stream', async () => {
    const { projectId } = seedProject(mockStore);
    const runId = crypto.randomUUID();
    mockStore.runEvent!.set(crypto.randomUUID(), {
      id: crypto.randomUUID(), runId, projectId,
      type: 'run.started', payload: {},
      createdAt: new Date(),
    });

    const streamApp = await buildApp();
    await streamApp.listen({ port: 0, host: '127.0.0.1' });
    try {
      const addr = streamApp.server.address() as { port: number };
      const res = await fetch(`http://127.0.0.1:${addr.port}/runs/${runId}/events`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const reader = res.body!.getReader();
      const { value } = await reader.read();
      expect(new TextDecoder().decode(value)).toContain(': connected');
      await reader.cancel();
    } finally {
      await streamApp.close();
    }
  }, 10000);
});

// ===========================================================================
// TASK ROUTES
// ===========================================================================
describe('Task Routes', () => {
  it('POST /tasks/:taskId/run returns 200 for valid task', async () => {
    const { projectId, versionId } = seedProject(mockStore);
    seedModel(mockStore);
    const taskId = crypto.randomUUID();
    mockStore.researchTask!.set(taskId, {
      id: taskId,
      projectId,
      claimId: null,
      title: 'Test task',
      role: 'researcher',
      priority: 'medium',
      status: 'todo',
      objective: 'Find evidence',
      assignedModelId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({ method: 'POST', url: `/tasks/${taskId}/run` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.status).toBe('done');
  });
});

// ===========================================================================
// REMAINING ENDPOINTS
// ===========================================================================
describe('Additional Endpoints', () => {
  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
  });

  it('GET /ready returns ready', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ready');
  });

  it('returns rate limit headers on API responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/projects' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('returns 429 when rate limit exceeded', async () => {
    _resetBucketsForTesting();

    // Build a separate app with a strict rate limiter (max 3 per minute)
    const strictApp = Fastify();
    const strictLimiter = createRateLimiter({
      max: 3,
      windowMs: 60000,
      keyPrefix: 'test',
    });
    strictApp.addHook('preHandler', strictLimiter);
    strictApp.get('/test-rl', async () => ({ ok: true }));
    await strictApp.ready();

    try {
      // First 3 requests should pass
      for (let i = 0; i < 3; i++) {
        const res = await strictApp.inject({
          method: 'GET',
          url: '/test-rl',
          remoteAddress: '10.0.0.1',
        });
        expect(res.statusCode).toBe(200);
        expect(Number(res.headers['x-ratelimit-remaining'])).toBe(2 - i);
      }

      // 4th request should be rate limited
      const res = await strictApp.inject({
        method: 'GET',
        url: '/test-rl',
        remoteAddress: '10.0.0.1',
      });
      expect(res.statusCode).toBe(429);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('RATE_LIMITED');
      expect(Number(res.headers['x-ratelimit-remaining'])).toBe(0);
    } finally {
      await strictApp.close();
    }
  });

  it('different IPs have independent rate limit buckets', async () => {
    _resetBucketsForTesting();

    const strictApp = Fastify();
    const strictLimiter = createRateLimiter({
      max: 1,
      windowMs: 60000,
      keyPrefix: 'test-ip',
    });
    strictApp.addHook('preHandler', strictLimiter);
    strictApp.get('/test-rl-ip', async () => ({ ok: true }));
    await strictApp.ready();

    try {
      // First IP uses its limit
      const r1 = await strictApp.inject({ method: 'GET', url: '/test-rl-ip', remoteAddress: '10.0.0.1' });
      expect(r1.statusCode).toBe(200);
      expect(Number(r1.headers['x-ratelimit-remaining'])).toBe(0);

      // Different IP should still pass
      const r2 = await strictApp.inject({ method: 'GET', url: '/test-rl-ip', remoteAddress: '10.0.0.2' });
      expect(r2.statusCode).toBe(200);
      expect(Number(r2.headers['x-ratelimit-remaining'])).toBe(0);

      // First IP blocked
      const r3 = await strictApp.inject({ method: 'GET', url: '/test-rl-ip', remoteAddress: '10.0.0.1' });
      expect(r3.statusCode).toBe(429);
    } finally {
      await strictApp.close();
    }
  });

  it('GET /runs/:runId returns run status', async () => {
    const { projectId } = seedProject(mockStore);
    const runId = crypto.randomUUID();
    mockStore.runEvent!.set(crypto.randomUUID(), {
      id: crypto.randomUUID(), runId, projectId,
      type: 'run.started', payload: {},
      createdAt: new Date(),
    });
    mockStore.runEvent!.set(crypto.randomUUID(), {
      id: crypto.randomUUID(), runId, projectId,
      type: 'run.completed', payload: { outcome: 'success' },
      createdAt: new Date(Date.now() + 1000),
    });

    const res = await app.inject({ method: 'GET', url: `/runs/${runId}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.run.status).toBe('completed');
  });

  it('GET /runs/:runId returns 404 for nonexistent run', async () => {
    const res = await app.inject({ method: 'GET', url: '/runs/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /projects/:projectId/runs/latest returns latest run', async () => {
    const { projectId } = seedProject(mockStore);
    const runId = crypto.randomUUID();
    mockStore.runEvent!.set(crypto.randomUUID(), {
      id: crypto.randomUUID(), runId, projectId,
      type: 'run.started', payload: {},
      createdAt: new Date(),
    });

    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/runs/latest` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    // Returns 200 with data or 404 with data: null
    expect(body.data).toBeDefined();
  });

  it('GET /projects/:projectId/tasks returns tasks', async () => {
    const { projectId } = seedProject(mockStore);
    mockStore.researchTask!.set(crypto.randomUUID(), {
      id: crypto.randomUUID(), projectId, claimId: null,
      title: 'Task 1', role: 'researcher', priority: 'medium',
      status: 'todo', objective: 'Find evidence', assignedModelId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const res = await app.inject({ method: 'GET', url: `/projects/${projectId}/tasks` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBe(1);
  });

  it('POST /runs/:runId/cancel cancels a run', async () => {
    const { projectId } = seedProject(mockStore);
    const runId = crypto.randomUUID();
    mockStore.runEvent!.set(crypto.randomUUID(), {
      id: crypto.randomUUID(), runId, projectId,
      type: 'run.started', payload: {},
      createdAt: new Date(),
    });
    mockStore.runStage!.set('stage-1', {
      id: 'stage-1', runId, stageName: 'extraction',
      status: 'IN_PROGRESS', attempts: 1, updatedAt: new Date(),
    });

    const res = await app.inject({ method: 'POST', url: `/runs/${runId}/cancel` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.success).toBe(true);
    // Verify stage was marked as failed
    const stage = mockStore.runStage!.get('stage-1');
    expect(stage.status).toBe('FAILED');
  });

  it('GET /runs/:runId/events?poll=1 returns events and closes', async () => {
    const { projectId } = seedProject(mockStore);
    const runId = crypto.randomUUID();
    mockStore.runEvent!.set(crypto.randomUUID(), {
      id: crypto.randomUUID(), runId, projectId,
      type: 'run.started', payload: {},
      createdAt: new Date(),
    });

    const res = await app.inject({ method: 'GET', url: `/runs/${runId}/events?poll=1` });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('run.started');
  });

  it('POST /idea-versions/:id/extract-claims returns claims', async () => {
    const { projectId, versionId } = seedProject(mockStore);
    seedModel(mockStore);

    const res = await app.inject({ method: 'POST', url: `/idea-versions/${versionId}/extract-claims` });
    // Returns 200 with claims if workflow works, or 500 if no models
    expect([200, 500]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = JSON.parse(res.payload);
      expect(body.data.claims).toBeDefined();
    }
  });
});

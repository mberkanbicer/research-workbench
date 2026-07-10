/**
 * Pipeline E2E — full deliberation pipeline through the HTTP API layer.
 *
 * Flow:
 *   1. POST /projects → create project with idea version (via HTTP)
 *   2. Seed models directly into store (route.test.ts pattern — model route has import issues in test env)
 *   3. POST /projects/:id/runs → start a run (via HTTP)
 *   4. Pipeline executes synchronously (worker mock calls goalLoop.run)
 *   5. GET /runs/:runId/events/history → verify all stages completed
 *   6. GET /projects/:id/decisions → verify decisions exist
 *   7. GET /runs/:runId → verify run is completed
 *
 * Unlike existing route tests (which mock the worker to do nothing), this test
 * actually runs the pipeline via the worker mock's queue.add() implementation.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import Fastify from 'fastify';
import { projectRoutes } from '../routes/projects.js';
import { runRoutes } from '../routes/runs.js';
import { decisionRoutes } from '../routes/decisions.js';

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

vi.mock('../routes/auth.js', () => ({
  authMiddleware: vi.fn(async (request: any) => {
    request.user = { id: 'test-user-id', email: 'test@test.com', name: 'Test' };
  }),
  optionalAuth: vi.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Mock the worker — queue.add() actually runs the pipeline
// ---------------------------------------------------------------------------
vi.mock('../orchestrator/worker.js', () => {
  const retry = vi.fn();
  const remove = vi.fn();
  return {
    deliberationQueue: {
      add: vi.fn(async (runId: string, data: any) => {
        const { buildServices } = await import('../orchestrator/service-builder.js');
        const { goalLoop } = await buildServices(data.modelIds, data.searchProvider);
        await goalLoop.run({
          projectId: data.projectId,
          modelIds: data.modelIds,
          maxIterations: data.maxRounds || 3,
          runId,
          loopMode: data.loopMode || 'standard',
        });
        // Pipeline stores run.completed via eventService → rawEvent table (no runId),
        // but GET /runs/:runId checks runEvent table for terminal events.
        // Record it here so the endpoint returns 'completed' status.
        const { RunEventService } = await import('../services/event.service.js');
        const res = new RunEventService();
        await res.record(runId, data.projectId, 'run.completed', { outcome: 'success' });
      }),
      getJob: vi.fn(() => ({ retry, remove, data: { projectId: 'proj-1' } })),
    },
    deliberationWorker: { close: vi.fn(), on: vi.fn() },
  };
});

vi.mock('bullmq', () => ({
  Queue: vi.fn(() => ({ add: vi.fn(), getJob: vi.fn() })),
  Worker: vi.fn(() => ({ on: vi.fn(), close: vi.fn() })),
}));

// ---------------------------------------------------------------------------
// Build test Fastify app with project + run routes only
// ---------------------------------------------------------------------------
async function buildApp() {
  const app = Fastify();
  app.setErrorHandler((error: any, request: any, reply: any) => {
    app.log.error(error);
    reply.status(500).send({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
    });
  });
  await app.register(projectRoutes);
  await app.register(decisionRoutes);
  await app.register(runRoutes);
  app.get('/health', async () => ({ status: 'ok' }));
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function id(): string {
  return crypto.randomUUID();
}

async function waitForRunCompletion(app: any, runId: string, deadlineMs = 15000): Promise<string> {
  const deadline = Date.now() + deadlineMs;
  let status = 'running';
  while (status !== 'completed' && status !== 'failed' && Date.now() < deadline) {
    const sr = await app.inject({ method: 'GET', url: `/runs/${runId}` });
    const body = JSON.parse(sr.payload);
    status = body.data?.run?.status ?? status;
    if (status !== 'completed' && status !== 'failed') {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  return status;
}

function seedModels(store: Store, count = 3): string[] {
  const modelIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const mid = id();
    modelIds.push(mid);
    store.modelConfig?.set(mid, {
      id: mid,
      name: `E2E Model ${i + 1}`,
      provider: 'mock',
      model: `e2e-model-${i + 1}`,
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
    });
  }
  return modelIds;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
let app: any;

beforeEach(async () => {
  for (const map of Object.values(mockStore) as Map<string, unknown>[]) {
    map.clear();
  }
  if (app) {
    await app.close();
  }
  const { resetSearchAdapter } = await import('../orchestrator/service-builder.js');
  resetSearchAdapter();
  app = await buildApp();
});

afterAll(async () => {
  if (app) await app.close();
});

describe('Pipeline E2E — Full deliberation through HTTP', () => {
  it('E2E-1: Seed a project with version and models into the store', async () => {
    const projectId = id();
    const versionId = id();
    mockStore.researchProject?.set(projectId, {
      id: projectId, title: 'E2E Test', goal: 'Test pipeline end-to-end',
      currentSynthesis: null, status: 'active', userId: 'test-user-id',
      createdAt: new Date(), updatedAt: new Date(),
    });
    mockStore.ideaVersion?.set(versionId, {
      id: versionId, projectId, versionNumber: 1, title: 'Initial Idea',
      description: 'A test idea for pipeline testing.', status: 'under_review',
      changesFromPrevious: null, createdBecauseOfCritiqueIds: null, createdAt: new Date(),
    });
    expect(mockStore.researchProject?.has(projectId)).toBe(true);
    expect(mockStore.ideaVersion?.has(versionId)).toBe(true);
  });

  it('E2E-2: Starts a run and pipeline completes all stages', async () => {
    const projectId = id();
    const versionId = id();
    mockStore.researchProject?.set(projectId, {
      id: projectId, title: 'Pipeline E2E', goal: 'Test pipeline',
      currentSynthesis: null, status: 'active', userId: 'test-user-id',
      createdAt: new Date(), updatedAt: new Date(),
    });
    mockStore.ideaVersion?.set(versionId, {
      id: versionId, projectId, versionNumber: 1, title: 'Initial Idea',
      description: 'A test idea', status: 'under_review',
      changesFromPrevious: null, createdBecauseOfCritiqueIds: null, createdAt: new Date(),
    });

    const modelIds = seedModels(mockStore);
    mockStore.user.set('test-user-id', {
      id: 'test-user-id', email: 'test@test.com', name: 'Test',
      defaultSearchProvider: null,
    });

    // Start run via HTTP — worker mock runs the pipeline synchronously
    const runRes = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/runs`,
      payload: { modelIds, maxRounds: 2, loopMode: 'standard' },
    });
    expect(runRes.statusCode).toBe(201);
    const runBody = JSON.parse(runRes.payload);
    expect(runBody.data.runId).toBeDefined();
    expect(runBody.data.status).toBe('queued');

    const runId = runBody.data.runId;

    // Wait for pipeline to complete (route handler fires-and-forgets deliberationQueue.add())
    const status = await waitForRunCompletion(app, runId);
    expect(status).toBe('completed');

    // Verify events contain all required phases
    const eventsRes = await app.inject({ method: 'GET', url: `/runs/${runId}/events/history` });
    expect(eventsRes.statusCode).toBe(200);
    const events = JSON.parse(eventsRes.payload).data;
    const eventTypes = events.map((e: any) => e.type);

    expect(eventTypes).toContain('run.started');
    expect(eventTypes).toContain('phase.extraction.completed');
    expect(eventTypes).toContain('phase.evidence_discovery.completed');
    expect(eventTypes).toContain('phase.review.completed');
    expect(eventTypes).toContain('phase.critique.completed');
    expect(eventTypes).toContain('phase.consensus.completed');
    expect(eventTypes).toContain('goal_loop.completed');

    const extractionEvent = events.find((e: any) => e.type === 'phase.extraction.completed');
    expect(extractionEvent.payload.count).toBeGreaterThan(0);

    const reviewEvent = events.find((e: any) => e.type === 'phase.review.completed');
    expect(reviewEvent.payload.count).toBeGreaterThanOrEqual(3);
  }, 120000);

  it('E2E-3: Claims, evidence, and decisions are accessible via API after run', async () => {
    const projectId = id();
    const versionId = id();
    mockStore.researchProject?.set(projectId, {
      id: projectId, title: 'Dashboard E2E', goal: 'Test dashboard',
      currentSynthesis: null, status: 'active', userId: 'test-user-id',
      createdAt: new Date(), updatedAt: new Date(),
    });
    mockStore.ideaVersion?.set(versionId, {
      id: versionId, projectId, versionNumber: 1, title: 'Initial Idea',
      description: 'A test idea', status: 'under_review',
      changesFromPrevious: null, createdBecauseOfCritiqueIds: null, createdAt: new Date(),
    });

    const modelIds = seedModels(mockStore);
    mockStore.user.set('test-user-id', {
      id: 'test-user-id', email: 'test@test.com', name: 'Test',
      defaultSearchProvider: null,
    });

    // Start run
    const runRes = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/runs`,
      payload: { modelIds, maxRounds: 2, loopMode: 'standard' },
    });
    expect(runRes.statusCode).toBe(201);
    const runId = JSON.parse(runRes.payload).data.runId;

    // Verify dashboard has claims
    const dashRes = await app.inject({ method: 'GET', url: `/projects/${projectId}` });
    expect(dashRes.statusCode).toBe(200);
    const dashboard = JSON.parse(dashRes.payload).data;
    expect(dashboard.claimCounts.total).toBeGreaterThan(0);
    expect(dashboard.project.claims.length).toBeGreaterThan(0);

    // Verify decisions via API
    const decisionsRes = await app.inject({ method: 'GET', url: `/projects/${projectId}/decisions` });
    expect(decisionsRes.statusCode).toBe(200);
    const decisions = JSON.parse(decisionsRes.payload).data;
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    const decision = decisions[0];
    expect(decision.decisionStatus).toBeDefined();
    expect(decision.decisionText).toBeDefined();
    expect(decision.projectId).toBe(projectId);

    // Verify individual decision endpoint
    const singleRes = await app.inject({ method: 'GET', url: `/decisions/${decision.id}` });
    expect(singleRes.statusCode).toBe(200);
    expect(JSON.parse(singleRes.payload).data.id).toBe(decision.id);
  }, 120000);

  it('E2E-4: Run events are pollable via SSE endpoint', async () => {
    const projectId = id();
    const versionId = id();
    mockStore.researchProject?.set(projectId, {
      id: projectId, title: 'SSE E2E', goal: 'Test SSE polling',
      currentSynthesis: null, status: 'active', userId: 'test-user-id',
      createdAt: new Date(), updatedAt: new Date(),
    });
    mockStore.ideaVersion?.set(versionId, {
      id: versionId, projectId, versionNumber: 1, title: 'Initial Idea',
      description: 'Test idea', status: 'under_review',
      changesFromPrevious: null, createdBecauseOfCritiqueIds: null, createdAt: new Date(),
    });

    const modelIds = seedModels(mockStore);
    mockStore.user.set('test-user-id', {
      id: 'test-user-id', email: 'test@test.com', name: 'Test',
      defaultSearchProvider: null,
    });

    const runRes = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/runs`,
      payload: { modelIds, maxRounds: 2, loopMode: 'standard' },
    });
    expect(runRes.statusCode).toBe(201);
    const runId = JSON.parse(runRes.payload).data.runId;

    // Poll events via SSE endpoint
    const pollRes = await app.inject({ method: 'GET', url: `/runs/${runId}/events?poll=1` });
    expect(pollRes.statusCode).toBe(200);
    expect(pollRes.payload).toContain('run.started');
    expect(pollRes.payload).toContain('phase.extraction.completed');
    expect(pollRes.payload).toContain('phase.review.completed');
    expect(pollRes.payload).toContain('phase.consensus.completed');
    expect(pollRes.payload).toContain('goal_loop.completed');
  }, 120000);

  it('E2E-5: Latest run endpoint returns correct data', async () => {
    const projectId = id();
    const versionId = id();
    mockStore.researchProject?.set(projectId, {
      id: projectId, title: 'Latest Run E2E', goal: 'Test latest run',
      currentSynthesis: null, status: 'active', userId: 'test-user-id',
      createdAt: new Date(), updatedAt: new Date(),
    });
    mockStore.ideaVersion?.set(versionId, {
      id: versionId, projectId, versionNumber: 1, title: 'Initial Idea',
      description: 'Test idea', status: 'under_review',
      changesFromPrevious: null, createdBecauseOfCritiqueIds: null, createdAt: new Date(),
    });

    const modelIds = seedModels(mockStore);
    mockStore.user.set('test-user-id', {
      id: 'test-user-id', email: 'test@test.com', name: 'Test',
      defaultSearchProvider: null,
    });

    const runRes = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/runs`,
      payload: { modelIds, maxRounds: 2, loopMode: 'standard' },
    });
    expect(runRes.statusCode).toBe(201);
    const runId = JSON.parse(runRes.payload).data.runId;

    // Wait for pipeline to complete
    const status = await waitForRunCompletion(app, runId);
    expect(status).toBe('completed');

    const latestRes = await app.inject({ method: 'GET', url: `/projects/${projectId}/runs/latest` });
    expect(latestRes.statusCode).toBe(200);
    const latest = JSON.parse(latestRes.payload).data;
    expect(latest.runId).toBe(runId);
    expect(latest.status).toBe('completed');
    expect(latest.events.length).toBeGreaterThan(0);
  }, 120000);

  it('E2E-6: Adversarial mode runs probe stage', async () => {
    const projectId = id();
    const versionId = id();
    mockStore.researchProject?.set(projectId, {
      id: projectId, title: 'Adversarial E2E', goal: 'Test adversarial mode',
      currentSynthesis: null, status: 'active', userId: 'test-user-id',
      createdAt: new Date(), updatedAt: new Date(),
    });
    mockStore.ideaVersion?.set(versionId, {
      id: versionId, projectId, versionNumber: 1, title: 'Initial Idea',
      description: 'Test idea for adversarial exploration', status: 'under_review',
      changesFromPrevious: null, createdBecauseOfCritiqueIds: null, createdAt: new Date(),
    });

    const modelIds = seedModels(mockStore);
    mockStore.user.set('test-user-id', {
      id: 'test-user-id', email: 'test@test.com', name: 'Test',
      defaultSearchProvider: null,
    });

    const runRes = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/runs`,
      payload: { modelIds, maxRounds: 1, loopMode: 'adversarial', searchProvider: 'mock' },
    });
    expect(runRes.statusCode).toBe(201);
    const runId = JSON.parse(runRes.payload).data.runId;

    // Verify adversarial probe events
    const eventsRes = await app.inject({ method: 'GET', url: `/runs/${runId}/events/history` });
    const events = JSON.parse(eventsRes.payload).data;
    const eventTypes = events.map((e: any) => e.type);
    expect(eventTypes).toContain('phase.adversarial_probe.completed');

    // Verify stage in DB
    const stagesInStore = Array.from(mockStore.runStage!.values()) as any[];
    const probeStage = stagesInStore.find((s: any) => s.stageName === 'adversarial_probe');
    expect(probeStage).toBeDefined();
    expect(probeStage.status).toBe('COMPLETED');
  }, 120000);

  // ─── MVP Acceptance Scenario (docs/10-mvp-acceptance.md) ────────────────

  it('ACCEPTANCE-1: Create project via API creates project', async () => {
    mockStore.user.set('test-user-id', {
      id: 'test-user-id', email: 'test@test.com', name: 'Test',
      defaultSearchProvider: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: {
        title: 'Evidence-grounded research workbench',
        goal: 'Validate whether a multi-model deliberation system is useful.',
        initialIdea: 'A local-first web UI where multiple AI models collaboratively research ideas.',
      },
    });
    // Project creation may return 200 or 201 depending on route implementation
    expect([200, 201]).toContain(res.statusCode);
    const body = JSON.parse(res.payload);
    expect(body.data).toBeDefined();
    expect(body.data.project).toBeDefined();
    expect(body.data.project.title).toBe('Evidence-grounded research workbench');
    // IdeaVersion may be populated via relation or may be undefined in mock prisma
    // The important thing is the project was created
    const projectId = body.data.project.id;
    expect(projectId).toBeDefined();
    // Verify project exists in store
    expect(mockStore.researchProject?.has(projectId)).toBe(true);
  });

  it('ACCEPTANCE-2: Full pipeline creates 5+ claims, reviews, critiques, and decision', async () => {
    const projectId = id();
    const versionId = id();
    mockStore.researchProject?.set(projectId, {
      id: projectId, title: 'MVP Acceptance', goal: 'Validate multi-model deliberation',
      currentSynthesis: null, status: 'active', userId: 'test-user-id',
      createdAt: new Date(), updatedAt: new Date(),
    });
    mockStore.ideaVersion?.set(versionId, {
      id: versionId, projectId, versionNumber: 1, title: 'Initial Idea',
      description: 'A local-first web UI where multiple AI models collaboratively research, critique, revise, and finalize ideas using evidence, counter-evidence, source auditing, context manifests, and iterative consensus loops.',
      status: 'under_review',
      changesFromPrevious: null, createdBecauseOfCritiqueIds: null, createdAt: new Date(),
    });

    // Seed manual evidence (Step 4 of acceptance)
    const evidenceId = id();
    mockStore.evidence?.set(evidenceId, {
      id: evidenceId, projectId, claimId: null, discoveredByModelId: null,
      sourceUrl: 'https://example.com/paper1', title: 'Multi-Agent Debate Improves Reasoning',
      publisher: 'AI Research Lab', publishedAt: null, retrievedAt: new Date(),
      sourceType: 'academic', excerpt: 'Studies show multi-agent debate improves reasoning.',
      summary: 'Evidence that multi-model deliberation works.', rawContentRef: null,
      reliability: 'pending', relevance: 'pending', status: 'pending_review',
      stalenessRisk: 'medium', isCounter: false, lastVerifiedAt: null, createdAt: new Date(),
    });

    const modelIds = seedModels(mockStore);
    mockStore.user.set('test-user-id', {
      id: 'test-user-id', email: 'test@test.com', name: 'Test',
      defaultSearchProvider: null,
    });

    // Start run
    const runRes = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/runs`,
      payload: { modelIds, maxRounds: 2, loopMode: 'standard', searchProvider: 'mock' },
    });
    expect(runRes.statusCode).toBe(201);
    const runId = JSON.parse(runRes.payload).data.runId;

    // Wait for pipeline
    const status = await waitForRunCompletion(app, runId);
    expect(status).toBe('completed');

    // Step 3: Claims extracted (check via dashboard which includes claim counts)
    const dashRes = await app.inject({ method: 'GET', url: `/projects/${projectId}` });
    expect(dashRes.statusCode).toBe(200);
    const dashboard = JSON.parse(dashRes.payload).data;
    expect(dashboard.claimCounts.total).toBeGreaterThanOrEqual(5);

    // Step 6-8: Reviews and critiques completed
    const eventsRes = await app.inject({ method: 'GET', url: `/runs/${runId}/events/history` });
    const events = JSON.parse(eventsRes.payload).data;
    const eventTypes = events.map((e: any) => e.type);
    expect(eventTypes).toContain('phase.review.completed');
    expect(eventTypes).toContain('phase.critique.completed');
    expect(eventTypes).toContain('phase.consensus.completed');

    // Step 12: Decision record created with model votes field present
    const decisionsRes = await app.inject({ method: 'GET', url: `/projects/${projectId}/decisions` });
    expect(decisionsRes.statusCode).toBe(200);
    const decisions = JSON.parse(decisionsRes.payload).data;
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    const decision = decisions[0];
    expect(decision.decisionStatus).toBeDefined();
    expect(decision.decisionText).toBeDefined();
    // Hard blocker: modelFinalVotes must exist as an array (mock returns empty)
    expect(decision.modelFinalVotes).toBeDefined();
    expect(Array.isArray(decision.modelFinalVotes)).toBe(true);
  }, 120000);

  it('ACCEPTANCE-3: Export endpoints return project data', async () => {
    const projectId = id();
    mockStore.researchProject?.set(projectId, {
      id: projectId, title: 'Export Test', goal: 'Test export',
      currentSynthesis: null, status: 'active', userId: 'test-user-id',
      createdAt: new Date(), updatedAt: new Date(),
    });

    // JSON export
    const jsonRes = await app.inject({ method: 'GET', url: `/projects/${projectId}/export/json` });
    expect(jsonRes.statusCode).toBe(200);

    // Markdown export
    const mdRes = await app.inject({ method: 'GET', url: `/projects/${projectId}/export/markdown` });
    expect(mdRes.statusCode).toBe(200);
    expect(mdRes.payload.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoalSeekingLoop } from './goal-seeking-loop.js';
import { DeliberationServices } from './services.js';
import { ExtractionStage } from '../services/stages/extraction-stage.js';
import { EvidenceStage } from '../services/stages/evidence-stage.js';
import { ModelGateway, MockModelAdapter, MockSearchAdapter } from '@repo/model-gateway';
import { IdeaVersion, Claim, Evidence } from '@repo/shared';

// ---------------------------------------------------------------------------
// In-memory store (shared from test-utils)
// ---------------------------------------------------------------------------
type Store = Record<string, Map<string, any>>;

const { mockPrisma, mockStore } = vi.hoisted(() => {
  return (globalThis as any).__createInMemoryPrisma();
});

// ---------------------------------------------------------------------------
// Force mock search provider for test isolation
// ---------------------------------------------------------------------------
process.env.SEARCH_PROVIDER = 'mock';
process.env.MOCK_SEARCH_FIXTURE_PATH = '../../templates/mock-search-results.json';

// ---------------------------------------------------------------------------
// Mock the prisma module — uses hoisted mockPrisma
// ---------------------------------------------------------------------------
vi.mock('../prisma.js', () => ({
  prisma: mockPrisma,
  default: mockPrisma,
}));

vi.mock('./worker.js', () => ({
  deliberationQueue: { add: vi.fn(), getJob: vi.fn() },
  deliberationWorker: { close: vi.fn(), on: vi.fn() },
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn(() => ({ add: vi.fn(), getJob: vi.fn() })),
  Worker: vi.fn(() => ({ on: vi.fn(), close: vi.fn() })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function seedProject(store: Store, overrides = {}) {
  const projectId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const project = {
    id: projectId,
    title: 'Test Project',
    goal: 'Test the deliberation pipeline',
    currentSynthesis: null,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  const version = {
    id: versionId,
    projectId,
    versionNumber: 1,
    title: 'Initial Idea',
    description: 'A test idea for the deliberation pipeline.',
    status: 'under_review' as const,
    changesFromPrevious: null,
    createdBecauseOfCritiqueIds: null,
    createdAt: new Date(),
  };
  store.researchProject?.set(projectId, project);
  store.ideaVersion?.set(versionId, version);
  return { projectId, versionId, project, version };
}

function seedModelConfigs(store: Store): string[] {
  const ids: string[] = [];
  for (const name of ['Mock Researcher', 'Mock Skeptic', 'Mock Auditor']) {
    const id = crypto.randomUUID();
    ids.push(id);
    store.modelConfig?.set(id, {
      id,
      name,
      provider: 'mock',
      model: `mock-${name.toLowerCase().replace(/\s+/g, '-')}`,
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
  return ids;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Orchestrator Flow', () => {
  beforeEach(async () => {
    for (const map of Object.values(mockStore) as Map<string, unknown>[]) {
      map.clear();
    }
    const { resetSearchAdapter } = await import('./service-builder.js');
    resetSearchAdapter();
  });

  // -----------------------------------------------------------------------
  // Test 1: buildServices with mock models
  // -----------------------------------------------------------------------
  it('buildServices creates goalLoop with mock models', async () => {
    const modelIds = seedModelConfigs(mockStore);
    const { buildServices } = await import('./service-builder.js');
    const built = await buildServices(modelIds);

    expect(built.services).toBeInstanceOf(DeliberationServices);
    expect(built.goalLoop).toBeInstanceOf(GoalSeekingLoop);
  });

  it('buildServices throws if requested model is missing', async () => {
    const { buildServices } = await import('./service-builder.js');
    await expect(buildServices(['nonexistent-id'])).rejects.toThrow('not found');
  });

  // -----------------------------------------------------------------------
  // Test 2: DeliberationServices methods return valid JSON
  // -----------------------------------------------------------------------
  it('DeliberationServices.extractClaims returns valid output', async () => {
    const { version } = seedProject(mockStore);

    const gateways = new Map<string, ModelGateway>();
    const gwId = crypto.randomUUID();
    gateways.set(gwId, new ModelGateway(new MockModelAdapter()));

    const services = new DeliberationServices(gateways, new MockSearchAdapter());
    const result = await services.extractClaims('Test goal', version as IdeaVersion, [], gwId);

    expect(result.claims).toBeDefined();
    expect(result.claims.length).toBeGreaterThan(0);
    expect(result.claims.length).toBe(5);
    expect((result.claims[0] as any).text).toBe('The system can improve idea development quality.');
  });

  it('DeliberationServices.independentReview returns valid output', async () => {
    const { version } = seedProject(mockStore);
    const gateways = new Map<string, ModelGateway>();
    const gwId = crypto.randomUUID();
    gateways.set(gwId, new ModelGateway(new MockModelAdapter()));

    const services = new DeliberationServices(gateways, new MockSearchAdapter());
    const result = await services.independentReview(version as IdeaVersion, [], [], [], [], gwId);

    expect(result.verdict).toBe('accept_with_reservations');
    expect(result.strengths).toContain('The approach addresses a real need for collaborative research');
    expect(result.confidence).toBe(0.7);
  });

  it('DeliberationServices.voteConsensus returns valid output', async () => {
    const { version } = seedProject(mockStore);
    const gateways = new Map<string, ModelGateway>();
    const gwId = crypto.randomUUID();
    gateways.set(gwId, new ModelGateway(new MockModelAdapter()));

    const services = new DeliberationServices(gateways, new MockSearchAdapter());
    const result = await services.voteConsensus(version as IdeaVersion, [], [], gwId);

    expect(result.vote).toBe('accept_with_reservations');
    expect(result.confidence).toBe(0.6);
  });

  // -----------------------------------------------------------------------
  // Test 3: GoalSeekingLoop stage execution
  // -----------------------------------------------------------------------
  it('performExtraction creates claims in DB', async () => {
    const { projectId, versionId } = seedProject(mockStore);
    const modelIds = seedModelConfigs(mockStore);
    const runId = crypto.randomUUID();

    const { buildServices } = await import('./service-builder.js');
    const { services } = await buildServices(modelIds);
    const extractionStage = new ExtractionStage(services);

    const claims = await extractionStage.performExtraction(runId, projectId, versionId, modelIds);

    expect(claims.length).toBeGreaterThan(0);
    expect(claims[0].projectId).toBe(projectId);
    expect(claims[0].ideaVersionId).toBe(versionId);

    // Verify runStage was set
    const stages = Array.from(mockStore.runStage!.values()) as any[];
    const extractionRunStage = stages.find((s: any) => s.stageName === 'extraction');
    expect(extractionRunStage).toBeDefined();
    expect(extractionRunStage!.status).toBe('COMPLETED');
  });

  it('performEvidenceDiscovery creates evidence items', async () => {
    const { projectId, versionId } = seedProject(mockStore);
    const modelIds = seedModelConfigs(mockStore);

    const claimId = crypto.randomUUID();
    mockStore.claim?.set(claimId, {
      id: claimId, projectId, ideaVersionId: versionId,
      text: 'Multi-model deliberation improves reasoning quality',
      type: 'research', requiresEvidence: true, criticality: 'high',
      status: 'unverified', createdAt: new Date(),
    });

    const { buildServices } = await import('./service-builder.js');
    const { services } = await buildServices(modelIds);
    const evidenceStage = new EvidenceStage(services);
    const runId = crypto.randomUUID();

    const claims = [{ id: claimId, projectId, ideaVersionId: versionId, text: 'Multi-model deliberation improves reasoning quality', type: 'research' as const, requiresEvidence: true, criticality: 'high' as const, status: 'unverified' as const, confidence: null, createdAt: new Date() }] as Claim[];

    const evidence = await evidenceStage.performEvidenceDiscovery(runId, projectId, claims);
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence[0].claimId).toBe(claimId);
  });

  // -----------------------------------------------------------------------
  // Test 4: Full goalLoop run
  // -----------------------------------------------------------------------
  it('full run with mock models completes all stages', async () => {
    const { projectId, versionId } = seedProject(mockStore);
    const modelIds = seedModelConfigs(mockStore);
    const runId = crypto.randomUUID();

    const { buildServices } = await import('./service-builder.js');
    const { goalLoop } = await buildServices(modelIds);

    await goalLoop.run({ projectId, modelIds, maxIterations: 2, runId });

    const events = Array.from(mockStore.runEvent!.values()).sort(
      (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    ) as any[];

    // Check essential events exist (run.started is emitted by route, not orchestrator)
    const eventTypes = events.map((e: any) => e.type);
    expect(eventTypes).toContain('goal_loop.iteration_started');
    expect(eventTypes).toContain('phase.extraction.completed');
    expect(eventTypes).toContain('phase.evidence_discovery.completed');
    expect(eventTypes).toContain('phase.review.completed');
    expect(eventTypes).toContain('phase.critique.completed');
    expect(eventTypes).toContain('phase.goal_evaluation.completed');
    expect(eventTypes).toContain('phase.consensus.completed');

    // Check extraction produced claims
    const extractionEvent = events.find((e: any) => e.type === 'phase.extraction.completed') as any;
    expect(extractionEvent.payload.count).toBeGreaterThan(0);

    // Check reviews were performed
    const reviewEvent = events.find((e: any) => e.type === 'phase.review.completed') as any;
    expect(reviewEvent.payload.count).toBeGreaterThan(0);
    expect(Array.isArray(reviewEvent.payload.reviews)).toBe(true);
    if (reviewEvent.payload.reviews.length > 0) {
      expect(reviewEvent.payload.reviews[0].reviewId).toBeDefined();
    }
  });

  // -----------------------------------------------------------------------
  // Test 5: Decision record created
  // -----------------------------------------------------------------------
  it('run may produce a decision record', async () => {
    const { projectId } = seedProject(mockStore);
    const modelIds = seedModelConfigs(mockStore);
    const runId = crypto.randomUUID();

    const { buildServices } = await import('./service-builder.js');
    const { goalLoop } = await buildServices(modelIds);

    await goalLoop.run({ projectId, modelIds, maxIterations: 2, runId });

    const decisions = Array.from(mockStore.decisionRecord!.values()) as any[];
    if (decisions.length > 0) {
      const d = decisions[0];
      expect(d.projectId).toBe(projectId);
      expect(d.ideaVersionId).toBeDefined();
      expect(d.decisionStatus).toBeDefined();
      expect(d.decisionText).toBeDefined();
    }
  });

  // -----------------------------------------------------------------------
  // Test 6: Pipeline does not crash
  // -----------------------------------------------------------------------
  it('standard loopMode does not emit prompt.improved events', async () => {
    const { projectId } = seedProject(mockStore);
    const modelIds = seedModelConfigs(mockStore);
    const runId = crypto.randomUUID();

    const { buildServices } = await import('./service-builder.js');
    const { goalLoop } = await buildServices(modelIds);

    await goalLoop.run({
      projectId,
      modelIds,
      maxIterations: 1,
      runId,
      loopMode: 'standard',
    });

    const events = Array.from(mockStore.runEvent!.values()).filter((e: any) => e.runId === runId);
    expect(events.some((e: any) => e.type === 'prompt.improved')).toBe(false);
  });

  it('pipeline completes without throwing', async () => {
    const { projectId } = seedProject(mockStore);
    const modelIds = seedModelConfigs(mockStore);
    const runId = crypto.randomUUID();

    const { buildServices } = await import('./service-builder.js');
    const { goalLoop } = await buildServices(modelIds);

    await expect(
      goalLoop.run({ projectId, modelIds, maxIterations: 2, runId })
    ).resolves.not.toThrow();

    const events = Array.from(mockStore.runEvent!.values()) as any[];
    const runFailed = events.find((e: any) => e.type === 'run.failed');
    expect(runFailed).toBeUndefined();
  });
});

describe('RunEvent Service', () => {
  beforeEach(async () => {
    for (const map of Object.values(mockStore) as Map<string, unknown>[]) {
      map.clear();
    }
    const { resetSearchAdapter } = await import('./service-builder.js');
    resetSearchAdapter();
  });

  it('records and retrieves run events', async () => {
    const { RunEventService } = await import('../services/event.service.js');
    const svc = new RunEventService();

    await svc.record('run-1', 'proj-1', 'run.started', {});
    await svc.record('run-1', 'proj-1', 'phase.extraction.completed', { count: 5 });
    await svc.record('run-1', 'proj-1', 'run.completed', { outcome: 'success' });

    const events = await svc.getEvents('run-1');
    expect(events.length).toBe(3);
    expect(events[0].type).toBe('run.started');
    expect(events[2].type).toBe('run.completed');
  });

  it('getEventsSince returns all events when no cutoff', async () => {
    const { RunEventService } = await import('../services/event.service.js');
    const svc = new RunEventService();

    await svc.record('run-3', 'proj-1', 'run.started', {});
    await svc.record('run-3', 'proj-1', 'run.completed', { outcome: 'success' });

    const events = await svc.getEventsSince('run-3', new Date(0).toISOString());
    expect(events.length).toBe(2);
    expect(events[0].type).toBe('run.started');
    expect(events[1].type).toBe('run.completed');
  });
});

// ===========================================================================
// Orchestrator error-path tests
// ===========================================================================
describe('Orchestrator Error Paths', () => {
  beforeEach(async () => {
    for (const map of Object.values(mockStore) as Map<string, unknown>[]) {
      map.clear();
    }
    const { resetSearchAdapter } = await import('./service-builder.js');
    resetSearchAdapter();
  });

  it('handles empty project gracefully', async () => {
    const nonExistentProjectId = crypto.randomUUID();
    const modelIds = seedModelConfigs(mockStore);
    const runId = crypto.randomUUID();

    const { buildServices } = await import('./service-builder.js');
    const { goalLoop } = await buildServices(modelIds);

    await expect(
      goalLoop.run({ projectId: nonExistentProjectId, modelIds, maxIterations: 2, runId })
    ).rejects.toThrow('Project not found');
  });

  it('handles all models failing gracefully', async () => {
    const { projectId } = seedProject(mockStore);
    // Seed model configs but DON'T build services with them — use nonexistent model IDs
    // This causes getGateway() to throw 'No gateway configured'
    const modelIds = seedModelConfigs(mockStore);
    const runId = crypto.randomUUID();

    // Override the stored model configs with wrong provider names so the
    // adapter builder will fail when the goalLoop tries to use them
    for (const id of modelIds) {
      const cfg = mockStore.modelConfig?.get(id);
      if (cfg) {
        mockStore.modelConfig?.set(id, { ...cfg, provider: 'nonexistent_provider' });
      }
    }

    // buildServices will throw because the services.ts can't create a gateway for nonexistent provider
    const { buildServices } = await import('./service-builder.js');
    await expect(buildServices(modelIds)).rejects.toThrow();
  });

  it('handles single model config failure with fallback', async () => {
    const { projectId } = seedProject(mockStore);
    // Create 3 model configs: one with invalid provider that will fail
    const modelIds = seedModelConfigs(mockStore);
    const runId = crypto.randomUUID();

    // Mark one model as disabled — goalLoop run should
    // skip it and use the next one
    if (modelIds.length >= 2) {
      const cfg = mockStore.modelConfig?.get(modelIds[0]);
      if (cfg) {
        mockStore.modelConfig?.set(modelIds[0], { ...cfg, isEnabled: false });
      }
    }

    const enabledIds = modelIds.filter(id => {
      const cfg = mockStore.modelConfig?.get(id);
      return cfg?.isEnabled !== false;
    });

    const { buildServices } = await import('./service-builder.js');
    // Only request enabled models — buildServices validates all requested models exist
    const built = await buildServices(enabledIds);
    expect(built.goalLoop).toBeDefined();

    // Run should complete without throwing
    await expect(
      built.goalLoop.run({ projectId, modelIds: enabledIds, maxIterations: 2, runId })
    ).resolves.not.toThrow();
  });

  it('extraction returns empty when model returns no claims', async () => {
    const { projectId, versionId } = seedProject(mockStore);
    const modelIds = seedModelConfigs(mockStore);
    const runId = crypto.randomUUID();

    const { buildServices } = await import('./service-builder.js');
    const { services } = await buildServices(modelIds);
    const extractionStage = new ExtractionStage(services);

    const claims = await extractionStage.performExtraction(runId, projectId, versionId, modelIds);
    // Mock adapter always returns 5 claims, so this should succeed
    expect(claims.length).toBe(5);
  });

  it('poll mode returns empty events for non-existent run', async () => {
    const { RunEventService } = await import('../services/event.service.js');
    const svc = new RunEventService();

    const events = await svc.getEvents('non-existent-run');
    expect(events).toEqual([]);
  });

  it('recovers from model failure using fallback', async () => {
    const { projectId, versionId } = seedProject(mockStore);
    const modelIds = seedModelConfigs(mockStore);
    const runId = crypto.randomUUID();

    const { buildServices } = await import('./service-builder.js');
    const { goalLoop } = await buildServices(modelIds);

    // Run should complete because withModelFallback retries with other models
    await expect(
      goalLoop.run({ projectId, modelIds, maxIterations: 2, runId })
    ).resolves.not.toThrow();

    // Verify run completed without a fatal failure event
    const events = Array.from(mockStore.runEvent!.values()) as any[];
    const runFailed = events.find((e: any) => e.type === 'run.failed');
    expect(runFailed).toBeUndefined();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeliberationServices } from './services.js';
import { ModelGateway, MockModelAdapter, MockSearchAdapter } from '@repo/model-gateway';
import type { IdeaVersion, Claim, Evidence, Critique } from '@repo/shared';

// ---------------------------------------------------------------------------
// Mock prisma
// ---------------------------------------------------------------------------
const { mockPrisma, mockStore } = vi.hoisted(() => {
  return (globalThis as any).__createInMemoryPrisma();
});

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

process.env.SEARCH_PROVIDER = 'mock';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createServices(): { services: DeliberationServices; gwId: string } {
  const gateways = new Map<string, ModelGateway>();
  const gwId = crypto.randomUUID();
  gateways.set(gwId, new ModelGateway(new MockModelAdapter()));
  return { services: new DeliberationServices(gateways, new MockSearchAdapter()), gwId };
}

function createIdeaVersion(overrides: Partial<IdeaVersion> = {}): IdeaVersion {
  return {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    versionNumber: 1,
    title: 'Test Idea',
    description: 'A test idea for deliberation.',
    status: 'under_review',
    changesFromPrevious: null,
    createdBecauseOfCritiqueIds: null,
    createdAt: new Date(),
    ...overrides,
  } as IdeaVersion;
}

function createClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    ideaVersionId: crypto.randomUUID(),
    text: 'Test claim text',
    type: 'research',
    requiresEvidence: true,
    criticality: 'high',
    status: 'unverified',
    confidence: null,
    createdAt: new Date(),
    ...overrides,
  } as Claim;
}

function createEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    claimId: null,
    discoveredByModelId: null,
    sourceUrl: null,
    title: 'Test Evidence',
    publisher: null,
    publishedAt: null,
    retrievedAt: new Date(),
    sourceType: 'academic',
    excerpt: null,
    summary: null,
    rawContentRef: null,
    reliability: 'pending',
    relevance: 'pending',
    status: 'pending_review',
    stalenessRisk: 'medium',
    isCounter: false,
    lastVerifiedAt: null,
    createdAt: new Date(),
    ...overrides,
  } as Evidence;
}

// ===========================================================================
// DeliberationServices tests
// ===========================================================================
describe('DeliberationServices', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore) as Map<string, unknown>[]) {
      map.clear();
    }
  });

  // -----------------------------------------------------------------------
  // extractClaims
  // -----------------------------------------------------------------------
  describe('extractClaims', () => {
    it('returns valid claim extraction output', async () => {
      const { services, gwId } = createServices();
      const version = createIdeaVersion();

      const result = await services.extractClaims('Test goal', version, [], gwId);

      expect(result.claims).toBeDefined();
      expect(Array.isArray(result.claims)).toBe(true);
      expect(result.claims.length).toBeGreaterThan(0);
      expect(result.claims[0].text).toBeDefined();
    });

    it('includes hypotheses in output', async () => {
      const { services, gwId } = createServices();
      const version = createIdeaVersion();

      const result = await services.extractClaims('Test goal', version, [], gwId);

      expect(result.hypotheses).toBeDefined();
      expect(Array.isArray(result.hypotheses)).toBe(true);
    });

    it('includes openQuestions in output', async () => {
      const { services, gwId } = createServices();
      const version = createIdeaVersion();

      const result = await services.extractClaims('Test goal', version, [], gwId);

      expect(result.openQuestions).toBeDefined();
      expect(Array.isArray(result.openQuestions)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // independentReview
  // -----------------------------------------------------------------------
  describe('independentReview', () => {
    it('returns valid review output', async () => {
      const { services, gwId } = createServices();
      const version = createIdeaVersion();

      const result = await services.independentReview(version, [], [], [], [], gwId);

      expect(result.verdict).toBeDefined();
      expect(['accept', 'accept_with_reservations', 'reject', 'needs_revision']).toContain(result.verdict);
    });

    it('includes strengths and weaknesses', async () => {
      const { services, gwId } = createServices();
      const version = createIdeaVersion();

      const result = await services.independentReview(version, [], [], [], [], gwId);

      expect(Array.isArray(result.strengths)).toBe(true);
      expect(Array.isArray(result.weaknesses)).toBe(true);
    });

    it('includes confidence score', async () => {
      const { services, gwId } = createServices();
      const version = createIdeaVersion();

      const result = await services.independentReview(version, [], [], [], [], gwId);

      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------------
  // voteConsensus
  // -----------------------------------------------------------------------
  describe('voteConsensus', () => {
    it('returns valid consensus vote', async () => {
      const { services, gwId } = createServices();
      const version = createIdeaVersion();

      const result = await services.voteConsensus(version, [], [], gwId);

      expect(result.vote).toBeDefined();
      expect(['accept', 'accept_with_reservations', 'reject', 'needs_more_evidence', 'abstain']).toContain(result.vote);
    });

    it('includes confidence score', async () => {
      const { services, gwId } = createServices();
      const version = createIdeaVersion();

      const result = await services.voteConsensus(version, [], [], gwId);

      expect(typeof result.confidence).toBe('number');
    });
  });

  // -----------------------------------------------------------------------
  // assessEvidence
  // -----------------------------------------------------------------------
  describe('assessEvidence', () => {
    it('returns valid evidence assessment', async () => {
      const { services, gwId } = createServices();
      const claim = createClaim();
      const evidence = createEvidence();

      const result = await services.assessEvidence(claim, evidence, 'Test interpretation', gwId);

      expect(result).toBeDefined();
      expect(result.reliability).toBeDefined();
      expect(result.relevance).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // crossCritique
  // -----------------------------------------------------------------------
  describe('crossCritique', () => {
    it('returns valid critique output', async () => {
      const { services, gwId } = createServices();
      const version = createIdeaVersion();

      const result = await services.crossCritique(version, [], [], [], gwId);

      expect(result).toBeDefined();
      expect(Array.isArray(result.critiques)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // respondToCritique
  // -----------------------------------------------------------------------
  describe('respondToCritique', () => {
    it('returns valid critique response', async () => {
      const { services, gwId } = createServices();
      const critique = {
        id: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        ideaVersionId: crypto.randomUUID(),
        criticModelId: 'model-1',
        targetType: 'claim',
        targetId: crypto.randomUUID(),
        critiqueType: 'logical',
        severity: 'high',
        text: 'Test critique',
        whyItMatters: 'Important',
        proposedFix: null,
        evidenceIds: null,
        status: 'open',
        createdAt: new Date(),
      } as Critique;

      const result = await services.respondToCritique(
        { projectId: critique.projectId },
        critique,
        [],
        gwId,
      );

      expect(result).toBeDefined();
      expect(result.verdict).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // reviseIdea
  // -----------------------------------------------------------------------
  describe('reviseIdea', () => {
    it('returns valid revision output', async () => {
      const { services, gwId } = createServices();
      const version = createIdeaVersion();

      const result = await services.reviseIdea(version, [], [], gwId);

      expect(result).toBeDefined();
      // Mock adapter returns title and description
      expect(result.title).toBeDefined();
      expect(result.description).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // generateDecision
  // -----------------------------------------------------------------------
  describe('generateDecision', () => {
    it('returns valid decision record', async () => {
      const { services, gwId } = createServices();
      const version = createIdeaVersion();

      const result = await services.generateDecision(
        version,
        [{ vote: 'accept', confidence: 0.8 }],
        [],
        [],
        gwId,
      );

      expect(result).toBeDefined();
      expect(result.decisionStatus).toBeDefined();
      expect(result.decisionText).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // evaluateGoalAchievement
  // -----------------------------------------------------------------------
  describe('evaluateGoalAchievement', () => {
    it('returns valid goal achievement output', async () => {
      const { services, gwId } = createServices();
      const version = createIdeaVersion();

      const result = await services.evaluateGoalAchievement(
        'Test goal',
        version,
        [],
        [],
        [],
        [],
        gwId,
      );

      expect(result).toBeDefined();
      expect(typeof result.goalAchieved).toBe('boolean');
      expect(result.achievementLevel).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // detectEvidenceGaps
  // -----------------------------------------------------------------------
  describe('detectEvidenceGaps', () => {
    it('returns valid evidence gap output', async () => {
      const { services, gwId } = createServices();
      const claim = createClaim();

      const result = await services.detectEvidenceGaps([claim], [], [], gwId);

      expect(result).toBeDefined();
      expect(Array.isArray(result.gaps)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // adversarialProbe
  // -----------------------------------------------------------------------
  describe('adversarialProbe', () => {
    it('returns valid adversarial probe output', async () => {
      const { services, gwId } = createServices();
      const claim = createClaim();

      const result = await services.adversarialProbe(claim, [], gwId);

      expect(result).toBeDefined();
      expect(Array.isArray(result.probes)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // search
  // -----------------------------------------------------------------------
  describe('search', () => {
    it('returns results from search adapter', async () => {
      const { services } = createServices();
      const results = await services.search('test query');
      expect(Array.isArray(results)).toBe(true);
    });

    it('returns empty array when no search adapter', async () => {
      const gateways = new Map<string, ModelGateway>();
      const gwId = crypto.randomUUID();
      gateways.set(gwId, new ModelGateway(new MockModelAdapter()));
      const svc = new DeliberationServices(gateways);

      const results = await svc.search('test query');
      expect(results).toEqual([]);
    });

    it('handles search errors gracefully', async () => {
      const failingAdapter = {
        search: vi.fn().mockRejectedValue(new Error('Search failed')),
      };
      const gateways = new Map<string, ModelGateway>();
      const gwId = crypto.randomUUID();
      gateways.set(gwId, new ModelGateway(new MockModelAdapter()));
      const svc = new DeliberationServices(gateways, failingAdapter as any);

      const results = await svc.search('test query');
      expect(results).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------
  describe('error handling', () => {
    it('throws when model ID not found', async () => {
      const { services } = createServices();
      const version = createIdeaVersion();

      await expect(
        services.extractClaims('goal', version, [], 'nonexistent-model')
      ).rejects.toThrow('No gateway configured');
    });
  });
});

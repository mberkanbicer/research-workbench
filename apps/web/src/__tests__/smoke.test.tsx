import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Mock the hooks module — return deterministic empty data
// ---------------------------------------------------------------------------
vi.mock('@/hooks/useApi', () => ({
  // Projects
  useProjects: () => ({ data: { data: [] }, isLoading: false, error: null }),
  useProject: () => ({
    data: {
      data: {
        project: { id: 'p1', title: 'Test Project', goal: 'Test goal', status: 'active' },
        currentIdeaVersion: { id: 'v1', versionNumber: 1, title: 'Initial Idea', description: 'Idea desc', status: 'under_review' },
        latestDecision: { id: 'd1', decisionStatus: 'qualified_consensus' },
        claimCounts: { total: 5, supported: 2, contradicted: 1, unverified: 2 },
        evidenceCounts: { total: 3, accepted: 1, pending_review: 2 },
        openCriticalIssues: [],
        activeTasks: [],
        nextBestAction: null,
      }
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useExport: () => ({ mutateAsync: vi.fn(), isPending: false }),

  // Ideas
  useIdeaVersions: () => ({
    data: {
      data: [
        { id: 'v2', versionNumber: 2, title: 'Revised Idea', description: 'After revision', status: 'under_review', changesFromPrevious: ['Refined'] },
        { id: 'v1', versionNumber: 1, title: 'Initial Idea', description: 'First version', status: 'superseded', changesFromPrevious: null },
      ]
    },
    isLoading: false,
  }),

  // Claims
  useClaims: () => ({
    data: {
      data: [
        { id: 'c1', text: 'Test claim 1', type: 'technical', status: 'unverified', criticality: 'high' },
        { id: 'c2', text: 'Test claim 2', type: 'research', status: 'supported', criticality: 'medium' },
      ]
    },
    isLoading: false,
  }),
  useUpdateClaim: () => ({ mutateAsync: vi.fn(), isPending: false }),

  // Evidence
  useEvidence: () => ({
    data: {
      data: [
        { id: 'e1', title: 'Source 1', sourceType: 'academic', status: 'accepted', reliability: 'high', relevance: 'direct' },
        { id: 'e2', title: 'Source 2', sourceType: 'company', status: 'pending_review', reliability: 'pending', relevance: 'pending' },
      ]
    },
    isLoading: false,
  }),
  useSearchEvidence: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSearchCounterEvidence: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAssessEvidence: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEvidence: () => ({ mutateAsync: vi.fn(), isPending: false }),

  // Models
  useModels: () => ({
    data: {
      data: [
        { id: 'm1', name: 'Mock Researcher', provider: 'mock', isEnabled: true, apiKeyRef: null },
        { id: 'm2', name: 'Mock Skeptic', provider: 'mock', isEnabled: true, apiKeyRef: null },
        { id: 'm3', name: 'Mock Auditor', provider: 'mock', isEnabled: true, apiKeyRef: null },
      ]
    },
    isLoading: false,
    refetch: vi.fn(),
  }),
  useCreateModel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateModel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteModel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTestModel: () => ({ mutateAsync: vi.fn(), isPending: false }),

  // Runs
  useStartRun: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRetryRun: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLatestRun: () => ({
    data: {
      data: {
        id: 'r1',
        status: 'completed',
        events: [
          { id: 'ev1', type: 'run.started', createdAt: new Date().toISOString() },
          { id: 'ev2', type: 'run.completed', createdAt: new Date().toISOString() },
        ]
      }
    },
    isLoading: false,
  }),
  useRunEvents: () => ({ data: { data: [] }, isLoading: false }),

  // Tasks
  useTasks: () => ({ data: { data: [] }, isLoading: false }),

  // Decisions
  useDecisions: () => ({
    data: {
      data: [
        { id: 'd1', decisionStatus: 'qualified_consensus', decisionText: 'Proceed', ideaVersionId: 'v1' },
      ]
    },
    isLoading: false,
  }),

  // Extraction
  useExtractClaims: () => ({ mutateAsync: vi.fn(), isPending: false }),

  // Hypotheses
  useHypotheses: () => ({ data: { data: [] }, isLoading: false }),
  useCreateHypothesis: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateHypothesis: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteHypothesis: () => ({ mutateAsync: vi.fn(), isPending: false }),

  // Evidence Quality
  useEvidenceQuality: () => ({ data: { data: { total: 0 } }, isLoading: false }),

  // Prompts
  usePromptRoles: () => ({ data: { data: [] }, isLoading: false }),
  usePromptHistory: () => ({ data: { data: null }, isLoading: false }),
  useUpdatePrompt: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResetPrompt: () => ({ mutateAsync: vi.fn(), isPending: false }),

  // Templates
  useTemplates: () => ({ data: { data: [] }, isLoading: false }),
  useCreateProjectFromTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),

  // Claim Confidence
  useClaimConfidenceHistory: () => ({ data: { data: [] }, isLoading: false }),

  // Version Comparison
  useCompareVersions: () => ({ data: { data: null }, isLoading: false }),

  // Citation Graph
  useCitationGraph: () => ({ data: { data: { nodes: [], edges: [] } }, isLoading: false }),
  useCalibration: () => ({ data: { data: { calibrationBuckets: [], summary: {} } }, isLoading: false }),
  useDatasetExport: () => ({ data: { data: null }, isLoading: false }),

  // Evidence Staleness
  useStaleEvidence: () => ({ data: { data: { stale: [], totalCount: 0, staleCount: 0, thresholdDays: 180 } }, isLoading: false }),
  useVerifyEvidence: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),

  // Cross-Project Search
  useCrossProjectSearch: () => ({ data: { data: { claims: [], evidence: [], relatedProjects: [] } }, isLoading: false }),
  useRelatedProjects: () => ({ data: { data: { relatedProjects: [] } }, isLoading: false }),

  // Run Comparison
  useRunComparison: () => ({ data: { data: null }, isLoading: false }),

  // Claim Dependencies
  useClaimDependencies: () => ({ data: { data: [] }, isLoading: false }),
  useAddClaimDependency: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useAutoDetectDependencies: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),

  // Literature Reviews
  useLiteratureReviews: () => ({ data: { data: [] }, isLoading: false }),
  useCreateLiteratureReview: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useLiteratureReview: () => ({ data: { data: null }, isLoading: false }),

  // Portfolio
  usePortfolio: () => ({ data: { data: [] }, isLoading: false }),

  // Evidence Provenance
  useEvidenceProvenance: () => ({ data: { data: { evidence: {}, chain: [] } }, isLoading: false }),

  // Annotations
  useAnnotations: () => ({ data: { data: [] }, isLoading: false }),
  useCreateAnnotation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteAnnotation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSearchAnnotations: () => ({ data: { data: [] }, isLoading: false }),

  // Evaluation Criteria
  useEvaluationCriteria: () => ({ data: { data: [] }, isLoading: false }),
  useCreateCriteria: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useEvidenceScores: () => ({ data: { data: [] }, isLoading: false }),
  useAddEvidenceScore: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),

  // Reproducibility Pack
  useReproducibilityPack: () => ({ data: { data: null }, isLoading: false }),

  // Argument Map
  useArgumentMap: () => ({ data: { data: null }, isLoading: false }),

  // Real-time Presence
  usePresence: () => ({ data: { data: { presence: [] } }, isLoading: false }),
  useUpdatePresence: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ projectId: 'test-project-123' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/projects/test-project-123',
}));

// Mock fetch for pages that use direct HTTP (e.g., Model Config page)
const originalFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = () =>
    Promise.resolve({
      json: () => Promise.resolve({ data: [] }),
      ok: true,
    } as any);
});

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

// Mock next/font/google
vi.mock('next/font/google', () => ({
  Outfit: () => ({ className: 'mocked-font' }),
}));

// ---------------------------------------------------------------------------
// Wrapper with QueryClient
// ---------------------------------------------------------------------------
function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderWithProviders(ui: ReactNode) {
  return render(<Wrapper>{ui}</Wrapper>);
}

// ===========================================================================
// SMOKE TESTS
// ===========================================================================
describe('Project List page', () => {
  it('renders project list page', async () => {
    const { default: ProjectsPage } = await import('@/app/projects/page');
    renderWithProviders(<ProjectsPage />);
    expect(screen.getByText('Research Projects')).toBeDefined();
  });
});

describe('Create Project page', () => {
  it('renders create project form', async () => {
    const { default: NewProjectPage } = await import('@/app/projects/new/page');
    renderWithProviders(<NewProjectPage />);
    expect(screen.getByText('Start New Research')).toBeDefined();
  });
});

describe('Project Dashboard page', () => {
  it('renders project dashboard with mock data', async () => {
    const { default: ProjectDashboard } = await import('@/app/projects/[projectId]/page');
    renderWithProviders(<ProjectDashboard />);
    expect(screen.getByText('Test Project')).toBeDefined();
    expect(screen.getByText('Test goal')).toBeDefined();
  });
});

describe('Evidence Commons page', () => {
  it('renders evidence table', async () => {
    const { default: EvidencePage } = await import('@/app/projects/[projectId]/evidence/page');
    renderWithProviders(<EvidencePage />);
    expect(screen.getByText('Evidence Commons')).toBeDefined();
  });
});

describe('Idea Evolution page', () => {
  it('renders idea versions', async () => {
    const { default: IdeasPage } = await import('@/app/projects/[projectId]/ideas/page');
    renderWithProviders(<IdeasPage />);
    expect(screen.getByText('Idea Evolution')).toBeDefined();
  });
});

describe('Decision Ledger page', () => {
  it('renders decisions', async () => {
    const { default: DecisionsPage } = await import('@/app/projects/[projectId]/decisions/page');
    renderWithProviders(<DecisionsPage />);
    expect(screen.getByText('Decision Ledger')).toBeDefined();
  });
});

describe('Model Config page', () => {
  it('renders model configuration page', async () => {
    const { default: ModelsPage } = await import('@/app/settings/models/page');
    renderWithProviders(<ModelsPage />);
    // Mock resolves immediately so page shows full content
    expect(screen.getByText('Mock Researcher')).toBeDefined();
  });
});

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------
const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();
const mockRouterBack = vi.fn();
let mockPathname = '/projects/test-project-123';

vi.mock('next/navigation', () => ({
  useParams: () => ({ projectId: 'test-project-123' }),
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace, back: mockRouterBack }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => mockPathname,
}));

// ---------------------------------------------------------------------------
// Mock next/link — render as plain <a> for testing
// ---------------------------------------------------------------------------
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

// ---------------------------------------------------------------------------
// Mock next/font/google
// ---------------------------------------------------------------------------
vi.mock('next/font/google', () => ({
  Outfit: () => ({ className: 'mocked-font' }),
}));

// ---------------------------------------------------------------------------
// Mock recharts — jsdom doesn't support SVG animations well
// ---------------------------------------------------------------------------
vi.mock('recharts', () => {
  const MockResponsiveContainer = ({ children }: any) => <div className="recharts-responsive-container">{children}</div>;
  const MockLineChart = ({ children }: any) => <div className="recharts-line-chart">{children}</div>;
  const MockLine = () => <div className="recharts-line" />;
  const MockXAxis = () => <div className="recharts-x-axis" />;
  const MockYAxis = () => <div className="recharts-y-axis" />;
  const MockTooltip = () => <div className="recharts-tooltip" />;
  const MockReferenceLine = () => <div className="recharts-reference-line" />;
  return {
    ResponsiveContainer: MockResponsiveContainer,
    LineChart: MockLineChart,
    Line: MockLine,
    XAxis: MockXAxis,
    YAxis: MockYAxis,
    Tooltip: MockTooltip,
    ReferenceLine: MockReferenceLine,
  };
});

// ---------------------------------------------------------------------------
// Mock @/hooks/useApi — deterministic data for all hooks
// ---------------------------------------------------------------------------
vi.mock('@/hooks/useApi', () => ({
  // Projects
  useProjects: () => ({ data: { data: [] }, isLoading: false, error: null }),
  useProject: vi.fn().mockReturnValue({
    data: {
      data: {
        project: { id: 'p1', title: 'Test Project', goal: 'Test goal', status: 'active', evidence: [], critiques: [], modelReviews: [], decisions: [], ideaVersions: [] },
        currentIdeaVersion: { id: 'v1', versionNumber: 1, title: 'Initial Idea', description: 'Idea desc', status: 'under_review' },
        latestDecision: { id: 'd1', decisionStatus: 'qualified_consensus' },
        claimCounts: { total: 5, supported: 2, contradicted: 1, unverified: 2 },
        evidenceCounts: { total: 3, accepted: 1, pending_review: 2 },
        openCriticalIssues: [], activeTasks: [], nextBestAction: null,
      }
    },
    isLoading: false, error: null, refetch: vi.fn(),
  }),
  useCreateProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useExport: () => ({ mutateAsync: vi.fn(), isPending: false }),

  useIdeaVersions: () => ({ data: { data: [] }, isLoading: false }),
  useClaims: vi.fn().mockReturnValue({ data: { data: [] }, isLoading: false }),
  useUpdateClaim: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEvidence: () => ({ data: { data: [] }, isLoading: false }),
  useSearchEvidence: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSearchCounterEvidence: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAssessEvidence: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEvidence: () => ({ mutateAsync: vi.fn(), isPending: false }),

  useModels: () => ({ data: { data: [] }, isLoading: false, refetch: vi.fn() }),
  useCreateModel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateModel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteModel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTestModel: () => ({ mutateAsync: vi.fn(), isPending: false }),

  useStartRun: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRetryRun: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLatestRun: () => ({ data: { data: null }, isLoading: false }),
  useRunEvents: () => ({ data: { data: [] }, isLoading: false }),

  useTasks: () => ({ data: { data: [] }, isLoading: false }),
  useDecisions: () => ({ data: { data: [] }, isLoading: false }),
  useExtractClaims: () => ({ mutateAsync: vi.fn(), isPending: false }),

  useHypotheses: () => ({ data: { data: [] }, isLoading: false }),
  useCreateHypothesis: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateHypothesis: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteHypothesis: () => ({ mutateAsync: vi.fn(), isPending: false }),

  useEvidenceQuality: () => ({ data: { data: { total: 0 } }, isLoading: false }),
  usePromptRoles: () => ({ data: { data: [] }, isLoading: false }),
  usePromptHistory: () => ({ data: { data: null }, isLoading: false }),
  useUpdatePrompt: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResetPrompt: () => ({ mutateAsync: vi.fn(), isPending: false }),

  useTemplates: () => ({ data: { data: [] }, isLoading: false }),
  useCreateProjectFromTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),

  useClaimConfidenceHistory: () => ({ data: { data: [] }, isLoading: false }),
  useCompareVersions: () => ({ data: { data: null }, isLoading: false }),

  useCitationGraph: () => ({ data: { data: { nodes: [], edges: [] } }, isLoading: false }),
  useCalibration: () => ({ data: { data: { calibrationBuckets: [], summary: {} } }, isLoading: false }),
  useDatasetExport: () => ({ data: { data: null }, isLoading: false }),

  useStaleEvidence: () => ({ data: { data: { stale: [], totalCount: 0, staleCount: 0, thresholdDays: 180 } }, isLoading: false }),
  useVerifyEvidence: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),

  useCrossProjectSearch: () => ({ data: { data: { claims: [], evidence: [], relatedProjects: [] } }, isLoading: false }),
  useRelatedProjects: () => ({ data: { data: { relatedProjects: [] } }, isLoading: false }),
  useRunComparison: () => ({ data: { data: null }, isLoading: false }),

  useClaimDependencies: () => ({ data: { data: [] }, isLoading: false }),
  useAddClaimDependency: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useAutoDetectDependencies: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),

  useLiteratureReviews: () => ({ data: { data: [] }, isLoading: false }),
  useCreateLiteratureReview: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useLiteratureReview: () => ({ data: { data: null }, isLoading: false }),

  usePortfolio: () => ({ data: { data: [] }, isLoading: false }),
  useEvidenceProvenance: () => ({ data: { data: { evidence: {}, chain: [] } }, isLoading: false }),

  useAnnotations: () => ({ data: { data: [] }, isLoading: false }),
  useCreateAnnotation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteAnnotation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSearchAnnotations: () => ({ data: { data: [] }, isLoading: false }),

  useEvaluationCriteria: () => ({ data: { data: [] }, isLoading: false }),
  useCreateCriteria: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useEvidenceScores: () => ({ data: { data: [] }, isLoading: false }),
  useAddEvidenceScore: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),

  useReproducibilityPack: () => ({ data: { data: null }, isLoading: false }),
  useArgumentMap: () => ({ data: { data: null }, isLoading: false }),

  usePresence: vi.fn().mockReturnValue({ data: { data: { presence: [] } }, isLoading: false }),
  useUpdatePresence: () => ({ mutate: vi.fn(), isPending: false }),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/auth — needed by NavBar and AuthGuard
// ---------------------------------------------------------------------------
let mockAuthState = { user: null, isLoading: false, token: null };

vi.mock('@/lib/auth', () => ({
  useAuth: () => mockAuthState,
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuthHeaders: () => ({}),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderWithProviders(ui: ReactNode) {
  return render(<Wrapper>{ui}</Wrapper>);
}

// ===========================================================================
// NavBar Tests
// ===========================================================================
describe('NavBar', () => {
  beforeEach(() => {
    mockAuthState = { user: null, isLoading: false, token: null };
  });

  it('renders the brand name and logo', async () => {
    const NavBar = (await import('@/components/NavBar')).default;
    renderWithProviders(<NavBar />);
    expect(screen.getByText('Research Workbench')).toBeDefined();
    // Logo "R" in the brand
    expect(screen.getByText('R')).toBeDefined();
  });

  it('shows Sign In link when user is not authenticated', async () => {
    const NavBar = (await import('@/components/NavBar')).default;
    renderWithProviders(<NavBar />);
    const signIn = screen.getByText('Sign In');
    expect(signIn).toBeDefined();
    expect(signIn.closest('a')).toHaveAttribute('href', '/login');
  });

  it('shows navigation links and user email when authenticated', async () => {
    mockAuthState = {
      user: { id: 'u1', email: 'alice@test.com', name: 'Alice' },
      isLoading: false,
      token: 'abc123',
    };
    const NavBar = (await import('@/components/NavBar')).default;
    renderWithProviders(<NavBar />);

    expect(screen.getByText('Projects')).toBeDefined();
    expect(screen.getByText('Models')).toBeDefined();
    expect(screen.getByText('Search')).toBeDefined();
    expect(screen.getByText('Prompts')).toBeDefined();
    expect(screen.getByText('alice@test.com')).toBeDefined();
    expect(screen.getByText('Logout')).toBeDefined();
    expect(screen.queryByText('Sign In')).toBeNull();
  });

  it('shows nothing while auth is loading', async () => {
    mockAuthState = { user: null, isLoading: true, token: null };
    const NavBar = (await import('@/components/NavBar')).default;
    renderWithProviders(<NavBar />);

    // Brand should still show
    expect(screen.getByText('Research Workbench')).toBeDefined();
    // Navigation links and sign in should not show while loading
    expect(screen.queryByText('Projects')).toBeNull();
    expect(screen.queryByText('Sign In')).toBeNull();
  });

  it('navigation links have correct hrefs', async () => {
    mockAuthState = {
      user: { id: 'u1', email: 'bob@test.com', name: 'Bob' },
      isLoading: false,
      token: 'xyz',
    };
    const NavBar = (await import('@/components/NavBar')).default;
    renderWithProviders(<NavBar />);

    expect(screen.getByText('Projects').closest('a')).toHaveAttribute('href', '/projects');
    expect(screen.getByText('Models').closest('a')).toHaveAttribute('href', '/settings/models');
    expect(screen.getByText('Search').closest('a')).toHaveAttribute('href', '/settings/search-provider');
    expect(screen.getByText('Prompts').closest('a')).toHaveAttribute('href', '/settings/prompts');
  });
});

// ===========================================================================
// AuthGuard Tests
// ===========================================================================
describe('AuthGuard', () => {
  beforeEach(() => {
    mockAuthState = { user: null, isLoading: false, token: null };
    mockRouterPush.mockClear();
  });

  it('renders children when user is authenticated', async () => {
    mockAuthState = {
      user: { id: 'u1', email: 'test@test.com', name: 'Test' },
      isLoading: false,
      token: 'tok',
    };
    const AuthGuard = (await import('@/components/AuthGuard')).default;
    renderWithProviders(
      <AuthGuard>
        <div data-testid="protected-content">Protected Content</div>
      </AuthGuard>
    );
    expect(screen.getByTestId('protected-content')).toBeDefined();
    expect(screen.getByText('Protected Content')).toBeDefined();
  });

  it('shows loading spinner while checking auth', async () => {
    mockAuthState = { user: null, isLoading: true, token: null };
    const AuthGuard = (await import('@/components/AuthGuard')).default;
    renderWithProviders(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    );
    expect(screen.getByText('Checking authentication...')).toBeDefined();
    expect(screen.queryByText('Protected Content')).toBeNull();
  });

  it('redirects to /login when not authenticated', async () => {
    mockAuthState = { user: null, isLoading: false, token: null };
    const AuthGuard = (await import('@/components/AuthGuard')).default;
    renderWithProviders(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    );
    // Should show redirect message
    expect(screen.getByText('Redirecting to login...')).toBeDefined();
    expect(screen.queryByText('Protected Content')).toBeNull();
    // Should navigate to /login
    expect(mockRouterPush).toHaveBeenCalledWith('/login');
  });

  it('does not redirect when still loading', async () => {
    mockAuthState = { user: null, isLoading: true, token: null };
    const AuthGuard = (await import('@/components/AuthGuard')).default;
    renderWithProviders(
      <AuthGuard>
        <div>Protected</div>
      </AuthGuard>
    );
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// ConfidenceChart Tests
// ===========================================================================
describe('ConfidenceChart', () => {
  it('shows empty state when no history provided', async () => {
    const ConfidenceChart = (await import('@/components/ConfidenceChart')).default;
    renderWithProviders(<ConfidenceChart history={[]} />);
    expect(screen.getByText('No confidence data yet')).toBeDefined();
  });

  it('shows empty state when history is null/undefined', async () => {
    const ConfidenceChart = (await import('@/components/ConfidenceChart')).default;
    const { container } = renderWithProviders(<ConfidenceChart history={undefined as any} />);
    expect(screen.getByText('No confidence data yet')).toBeDefined();
  });

  it('renders chart when history has data', async () => {
    const ConfidenceChart = (await import('@/components/ConfidenceChart')).default;
    const history = [
      { round: 1, confidence: 0.5, reason: 'Initial assessment', createdAt: '2026-01-01T00:00:00Z' },
      { round: 2, confidence: 0.75, reason: 'After evidence review', createdAt: '2026-01-02T00:00:00Z' },
    ];
    const { container } = renderWithProviders(<ConfidenceChart history={history} />);
    // Should not show empty state
    expect(screen.queryByText('No confidence data yet')).toBeNull();
    // Should render the recharts container
    expect(container.querySelector('.recharts-responsive-container')).toBeDefined();
    expect(container.querySelector('.recharts-line-chart')).toBeDefined();
  });

  it('handles single data point', async () => {
    const ConfidenceChart = (await import('@/components/ConfidenceChart')).default;
    const history = [
      { round: 1, confidence: 0.8, reason: 'First round', createdAt: '2026-01-01T00:00:00Z' },
    ];
    const { container } = renderWithProviders(<ConfidenceChart history={history} />);
    expect(screen.queryByText('No confidence data yet')).toBeNull();
    expect(container.querySelector('.recharts-line-chart')).toBeDefined();
  });
});

// ===========================================================================
// PresenceIndicator Tests
// ===========================================================================
describe('PresenceIndicator', () => {
  beforeEach(() => {
    mockPathname = '/projects/test-project-123';
  });

  it('returns null when no other users are present', async () => {
    // Mock usePresence to return empty
    const useApi = await import('@/hooks/useApi');
    const PresenceIndicator = (await import('@/components/PresenceIndicator')).default;
    const { container } = renderWithProviders(<PresenceIndicator userName="You" />);
    expect(container.innerHTML).toBe('');
  });

  it('shows other users when present', async () => {
    // Override the usePresence mock for this test
    const useApi = await import('@/hooks/useApi');
    // We need to re-mock usePresence to return data
    vi.mocked(useApi.usePresence).mockReturnValue({
      data: {
        data: {
          presence: [
            { userName: 'Alice', page: '/projects/test-project-123/timeline', lastSeenAt: new Date().toISOString() },
            { userName: 'Bob', page: '/projects/test-project-123/evidence', lastSeenAt: new Date().toISOString() },
          ]
        }
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isError: false,
      isSuccess: true,
      isPending: false,
      isRefetching: false,
      isStale: false,
      isFetching: false,
      dataUpdatedAt: Date.now(),
      errorUpdatedAt: 0,
      failureCount: 0,
      failureReason: null,
      status: 'success',
      promise: Promise.resolve(),
    } as any);

    const PresenceIndicator = (await import('@/components/PresenceIndicator')).default;
    renderWithProviders(<PresenceIndicator userName="You" />);

    // Should show the user count
    expect(screen.getByText('2 others')).toBeDefined();
    // Click to expand
    fireEvent.click(screen.getByText('2 others'));
    expect(screen.getByText('Currently viewing')).toBeDefined();
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
  });

  it('shows "1 other" for a single other user', async () => {
    const useApi = await import('@/hooks/useApi');
    vi.mocked(useApi.usePresence).mockReturnValue({
      data: {
        data: {
          presence: [
            { userName: 'Alice', page: '/projects/test-project-123', lastSeenAt: new Date().toISOString() },
          ]
        }
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isError: false,
      isSuccess: true,
      isPending: false,
      isRefetching: false,
      isStale: false,
      isFetching: false,
      dataUpdatedAt: Date.now(),
      errorUpdatedAt: 0,
      failureCount: 0,
      failureReason: null,
      status: 'success',
      promise: Promise.resolve(),
    } as any);

    const PresenceIndicator = (await import('@/components/PresenceIndicator')).default;
    renderWithProviders(<PresenceIndicator userName="You" />);
    expect(screen.getByText('1 other')).toBeDefined();
  });

  it('toggles dropdown on click', async () => {
    const useApi = await import('@/hooks/useApi');
    vi.mocked(useApi.usePresence).mockReturnValue({
      data: {
        data: {
          presence: [
            { userName: 'Alice', page: '/projects/test-project-123', lastSeenAt: new Date().toISOString() },
          ]
        }
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isError: false,
      isSuccess: true,
      isPending: false,
      isRefetching: false,
      isStale: false,
      isFetching: false,
      dataUpdatedAt: Date.now(),
      errorUpdatedAt: 0,
      failureCount: 0,
      failureReason: null,
      status: 'success',
      promise: Promise.resolve(),
    } as any);

    const PresenceIndicator = (await import('@/components/PresenceIndicator')).default;
    renderWithProviders(<PresenceIndicator userName="You" />);

    // Dropdown should be hidden initially
    expect(screen.queryByText('Currently viewing')).toBeNull();

    // Click to open
    fireEvent.click(screen.getByText('1 other'));
    expect(screen.getByText('Currently viewing')).toBeDefined();

    // Click again to close
    fireEvent.click(screen.getByText('1 other'));
    expect(screen.queryByText('Currently viewing')).toBeNull();
  });

  it('filters out the current user from other users count', async () => {
    const useApi = await import('@/hooks/useApi');
    vi.mocked(useApi.usePresence).mockReturnValue({
      data: {
        data: {
          presence: [
            { userName: 'You', page: '/projects/test-project-123', lastSeenAt: new Date().toISOString() },
          ]
        }
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isError: false,
      isSuccess: true,
      isPending: false,
      isRefetching: false,
      isStale: false,
      isFetching: false,
      dataUpdatedAt: Date.now(),
      errorUpdatedAt: 0,
      failureCount: 0,
      failureReason: null,
      status: 'success',
      promise: Promise.resolve(),
    } as any);

    const PresenceIndicator = (await import('@/components/PresenceIndicator')).default;
    const { container } = renderWithProviders(<PresenceIndicator userName="You" />);
    // Only "You" in the list — should return null
    expect(container.innerHTML).toBe('');
  });
});

// ===========================================================================
// InspectorPanel Tests
// ===========================================================================
describe('InspectorPanel', () => {
  let store: { useInspectorStore: any };

  beforeEach(async () => {
    store = await import('@/store/inspectorStore');
    store.useInspectorStore.getState().closeInspector();
    mockPathname = '/projects/test-project-123';
  });

  it('returns null when inspector is closed', async () => {
    const InspectorPanel = (await import('@/components/InspectorPanel')).default;
    const { container } = renderWithProviders(<InspectorPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('opens and closes with Escape key', async () => {
    const InspectorPanel = (await import('@/components/InspectorPanel')).default;

    act(() => {
      store.useInspectorStore.getState().openInspector('claim', 'c1');
    });

    renderWithProviders(<InspectorPanel />);
    expect(screen.getByText('Claim')).toBeDefined();

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(store.useInspectorStore.getState().inspectorOpen).toBe(false);
  });

  it('shows claim details when a claim is selected', async () => {
    const useApi = await import('@/hooks/useApi');
    vi.mocked(useApi.useClaims).mockReturnValue({
      data: { data: [{ id: 'c1', text: 'Test claim text', type: 'technical', status: 'supported', criticality: 'high', confidence: 0.85 }] },
      isLoading: false, error: null, refetch: vi.fn(),
      isError: false, isSuccess: true, isPending: false, isRefetching: false, isStale: false, isFetching: false,
      dataUpdatedAt: Date.now(), errorUpdatedAt: 0, failureCount: 0, failureReason: null, status: 'success',
      promise: Promise.resolve(),
    } as any);

    const InspectorPanel = (await import('@/components/InspectorPanel')).default;

    act(() => { store.useInspectorStore.getState().openInspector('claim', 'c1'); });

    renderWithProviders(<InspectorPanel />);
    expect(screen.getByText('Claim')).toBeDefined();
    expect(screen.getByText('Test claim text')).toBeDefined();
    expect(screen.getByText('supported')).toBeDefined();
    expect(screen.getByText('technical')).toBeDefined();
    expect(screen.getByText('high')).toBeDefined();
  });

  it('shows evidence details when evidence is selected', async () => {
    const useApi = await import('@/hooks/useApi');
    vi.mocked(useApi.useProject).mockReturnValue({
      data: {
        data: {
          project: {
            id: 'p1', title: 'Test', goal: 'Test goal', status: 'active',
            evidence: [{ id: 'e1', title: 'Important Study', sourceUrl: 'https://example.com/study', excerpt: 'Key finding excerpt', status: 'accepted', reliability: 'high', relevance: 'direct' }],
            critiques: [], modelReviews: [], decisions: [], ideaVersions: [],
          },
          currentIdeaVersion: { id: 'v1', versionNumber: 1, title: 'Idea', description: 'Desc', status: 'under_review' },
          latestDecision: null,
          claimCounts: { total: 0, supported: 0, contradicted: 0, unverified: 0 },
          evidenceCounts: { total: 0, accepted: 0, pending_review: 0 },
          openCriticalIssues: [], activeTasks: [], nextBestAction: null,
        }
      },
      isLoading: false, error: null, refetch: vi.fn(),
      isError: false, isSuccess: true, isPending: false, isRefetching: false, isStale: false, isFetching: false,
      dataUpdatedAt: Date.now(), errorUpdatedAt: 0, failureCount: 0, failureReason: null, status: 'success',
      promise: Promise.resolve(),
    } as any);

    const InspectorPanel = (await import('@/components/InspectorPanel')).default;

    act(() => { store.useInspectorStore.getState().openInspector('evidence', 'e1'); });

    renderWithProviders(<InspectorPanel />);
    expect(screen.getByText('Evidence')).toBeDefined();
    expect(screen.getByText('Important Study')).toBeDefined();
    expect(screen.getByText('Key finding excerpt')).toBeDefined();
    expect(screen.getByText('https://example.com/study')).toBeDefined();
  });

  it('shows critique details when critique is selected', async () => {
    const useApi = await import('@/hooks/useApi');
    vi.mocked(useApi.useProject).mockReturnValue({
      data: {
        data: {
          project: {
            id: 'p1', title: 'Test', goal: 'Test goal', status: 'active',
            evidence: [],
            critiques: [{ id: 'cr1', text: 'Methodological concern', status: 'open', severity: 'high', critiqueType: 'methodological', whyItMatters: 'Affects validity', proposedFix: 'Add cross-validation' }],
            modelReviews: [], decisions: [], ideaVersions: [],
          },
          currentIdeaVersion: { id: 'v1', versionNumber: 1, title: 'Idea', description: 'Desc', status: 'under_review' },
          latestDecision: null,
          claimCounts: { total: 0, supported: 0, contradicted: 0, unverified: 0 },
          evidenceCounts: { total: 0, accepted: 0, pending_review: 0 },
          openCriticalIssues: [], activeTasks: [], nextBestAction: null,
        }
      },
      isLoading: false, error: null, refetch: vi.fn(),
      isError: false, isSuccess: true, isPending: false, isRefetching: false, isStale: false, isFetching: false,
      dataUpdatedAt: Date.now(), errorUpdatedAt: 0, failureCount: 0, failureReason: null, status: 'success',
      promise: Promise.resolve(),
    } as any);

    const InspectorPanel = (await import('@/components/InspectorPanel')).default;

    act(() => { store.useInspectorStore.getState().openInspector('critique', 'cr1'); });

    renderWithProviders(<InspectorPanel />);
    expect(screen.getByText('Critique')).toBeDefined();
    expect(screen.getByText('Methodological concern')).toBeDefined();
    expect(screen.getByText('Affects validity')).toBeDefined();
    expect(screen.getByText('Add cross-validation')).toBeDefined();
  });

  it('shows decision details when decision is selected', async () => {
    const useApi = await import('@/hooks/useApi');
    vi.mocked(useApi.useProject).mockReturnValue({
      data: {
        data: {
          project: {
            id: 'p1', title: 'Test', goal: 'Test goal', status: 'active',
            evidence: [], critiques: [], modelReviews: [],
            decisions: [{ id: 'd1', decisionStatus: 'qualified_consensus', decisionText: 'Proceed with caution', whyGood: ['Clear evidence'], whyBad: ['Limited sample'], knownWeaknesses: null, unresolvedRisks: null, modelFinalVotes: null, nextActions: null }],
            ideaVersions: [],
          },
          currentIdeaVersion: null,
          latestDecision: null,
          claimCounts: { total: 0, supported: 0, contradicted: 0, unverified: 0 },
          evidenceCounts: { total: 0, accepted: 0, pending_review: 0 },
          openCriticalIssues: [], activeTasks: [], nextBestAction: null,
        }
      },
      isLoading: false, error: null, refetch: vi.fn(),
      isError: false, isSuccess: true, isPending: false, isRefetching: false, isStale: false, isFetching: false,
      dataUpdatedAt: Date.now(), errorUpdatedAt: 0, failureCount: 0, failureReason: null, status: 'success',
      promise: Promise.resolve(),
    } as any);

    const InspectorPanel = (await import('@/components/InspectorPanel')).default;

    act(() => { store.useInspectorStore.getState().openInspector('decision', 'd1'); });

    renderWithProviders(<InspectorPanel />);
    expect(screen.getByText('Decision')).toBeDefined();
    expect(screen.getByText('qualified_consensus')).toBeDefined();
    expect(screen.getByText('Proceed with caution')).toBeDefined();
    expect(screen.getByText('Clear evidence')).toBeDefined();
    expect(screen.getByText('Limited sample')).toBeDefined();
  });

  it('shows model review details when review is selected', async () => {
    const useApi = await import('@/hooks/useApi');
    vi.mocked(useApi.useProject).mockReturnValue({
      data: {
        data: {
          project: {
            id: 'p1', title: 'Test', goal: 'Test goal', status: 'active',
            evidence: [], critiques: [],
            modelReviews: [{ id: 'r1', verdict: 'accept_with_reservations', confidence: 0.78, strengths: ['Good methodology'], weaknesses: ['Small sample'], blockingIssues: [], modelId: 'm1' }],
            decisions: [], ideaVersions: [],
          },
          currentIdeaVersion: null,
          latestDecision: null,
          claimCounts: { total: 0, supported: 0, contradicted: 0, unverified: 0 },
          evidenceCounts: { total: 0, accepted: 0, pending_review: 0 },
          openCriticalIssues: [], activeTasks: [], nextBestAction: null,
        }
      },
      isLoading: false, error: null, refetch: vi.fn(),
      isError: false, isSuccess: true, isPending: false, isRefetching: false, isStale: false, isFetching: false,
      dataUpdatedAt: Date.now(), errorUpdatedAt: 0, failureCount: 0, failureReason: null, status: 'success',
      promise: Promise.resolve(),
    } as any);

    const InspectorPanel = (await import('@/components/InspectorPanel')).default;

    act(() => { store.useInspectorStore.getState().openInspector('review', 'r1'); });

    renderWithProviders(<InspectorPanel />);
    expect(screen.getByText('Model Review')).toBeDefined();
    expect(screen.getByText('accept_with_reservations')).toBeDefined();
    expect(screen.getByText('Good methodology')).toBeDefined();
    expect(screen.getByText('Small sample')).toBeDefined();
  });

  it('shows idea version details when version is selected', async () => {
    const useApi = await import('@/hooks/useApi');
    vi.mocked(useApi.useProject).mockReturnValue({
      data: {
        data: {
          project: {
            id: 'p1', title: 'Test', goal: 'Test goal', status: 'active',
            evidence: [], critiques: [], modelReviews: [], decisions: [],
            ideaVersions: [{ id: 'v2', versionNumber: 2, title: 'Revised Idea', description: 'After revision', status: 'under_review' }],
          },
          currentIdeaVersion: null,
          latestDecision: null,
          claimCounts: { total: 0, supported: 0, contradicted: 0, unverified: 0 },
          evidenceCounts: { total: 0, accepted: 0, pending_review: 0 },
          openCriticalIssues: [], activeTasks: [], nextBestAction: null,
        }
      },
      isLoading: false, error: null, refetch: vi.fn(),
      isError: false, isSuccess: true, isPending: false, isRefetching: false, isStale: false, isFetching: false,
      dataUpdatedAt: Date.now(), errorUpdatedAt: 0, failureCount: 0, failureReason: null, status: 'success',
      promise: Promise.resolve(),
    } as any);

    const InspectorPanel = (await import('@/components/InspectorPanel')).default;

    act(() => { store.useInspectorStore.getState().openInspector('idea_version', 'v2'); });

    renderWithProviders(<InspectorPanel />);
    expect(screen.getByText('Idea Version')).toBeDefined();
    expect(screen.getByText('#2')).toBeDefined();
    expect(screen.getByText('Revised Idea')).toBeDefined();
    expect(screen.getByText('After revision')).toBeDefined();
  });

  it('shows "Claim not found" for nonexistent claim ID', async () => {
    const InspectorPanel = (await import('@/components/InspectorPanel')).default;

    act(() => { store.useInspectorStore.getState().openInspector('claim', 'nonexistent-id'); });

    renderWithProviders(<InspectorPanel />);
    expect(screen.getByText('Claim')).toBeDefined();
    expect(screen.getByText('Claim not found.')).toBeDefined();
  });

  it('closes when clicking the backdrop', async () => {
    const InspectorPanel = (await import('@/components/InspectorPanel')).default;

    act(() => { store.useInspectorStore.getState().openInspector('claim', 'c1'); });

    renderWithProviders(<InspectorPanel />);
    expect(screen.getByText('Claim')).toBeDefined();

    fireEvent.click(screen.getByLabelText('Close inspector'));
    expect(store.useInspectorStore.getState().inspectorOpen).toBe(false);
  });
});

// ─── Modal ──────────────────────────────────────────────────────────────────

describe('Modal', () => {
  it('renders children when open', async () => {
    const Modal = (await import('@/components/Modal')).default;
    renderWithProviders(
      <Modal isOpen={true} onClose={() => {}}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.getByText('Modal content')).toBeDefined();
  });

  it('does not render when closed', async () => {
    const Modal = (await import('@/components/Modal')).default;
    renderWithProviders(
      <Modal isOpen={false} onClose={() => {}}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.queryByText('Modal content')).toBeNull();
  });

  it('renders title when provided', async () => {
    const Modal = (await import('@/components/Modal')).default;
    renderWithProviders(
      <Modal isOpen={true} onClose={() => {}} title="Test Title">
        <p>Content</p>
      </Modal>
    );
    expect(screen.getByText('Test Title')).toBeDefined();
  });

  it('has role="dialog" and aria-modal="true"', async () => {
    const Modal = (await import('@/components/Modal')).default;
    renderWithProviders(
      <Modal isOpen={true} onClose={() => {}}>
        <p>Content</p>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('calls onClose when Escape is pressed', async () => {
    const Modal = (await import('@/components/Modal')).default;
    const onClose = vi.fn();
    renderWithProviders(
      <Modal isOpen={true} onClose={onClose}>
        <p>Content</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking overlay', async () => {
    const Modal = (await import('@/components/Modal')).default;
    const onClose = vi.fn();
    const { container } = renderWithProviders(
      <Modal isOpen={true} onClose={onClose}>
        <p>Content</p>
      </Modal>
    );
    // Click on the overlay (the fixed backdrop)
    const overlay = container.querySelector('[role="dialog"]');
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking modal content', async () => {
    const Modal = (await import('@/components/Modal')).default;
    const onClose = vi.fn();
    renderWithProviders(
      <Modal isOpen={true} onClose={onClose}>
        <p>Content</p>
      </Modal>
    );
    fireEvent.click(screen.getByText('Content'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

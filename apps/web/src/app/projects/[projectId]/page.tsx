'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  useProject,
  useClaims,
  useStartRun,
  useExport,
  useExtractClaims,
  useRetryRun,
  useLatestRun,
  useUpdateProject,
  useUpdateClaim,
  useSearchEvidence,
  useSearchCounterEvidence,
} from '@/hooks/useApi';
import { phaseLabels } from '@/lib/eventLabels';
import { useState, useEffect, useMemo } from 'react';
import { apiFetch, API_BASE } from '@/lib/apiFetch';
import AddEvidenceModal from '@/components/AddEvidenceModal';
import { ModelSelector } from '@/components/ModelSelector';
import ProjectHeader from '@/components/ProjectHeader';
import RunTimeline from '@/components/RunTimeline';
import { useRunEvents } from '@/hooks/useRunEvents';
import { useModelSelectionStore } from '@/store/modelSelectionStore';
import { useInspectorStore } from '@/store/inspectorStore';
import { useUIStore } from '@/store/uiStore';

type Tab = 'overview' | 'claims' | 'evidence' | 'timeline' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '\u25A3' },
  { id: 'claims', label: 'Claims', icon: '\u2694' },
  { id: 'evidence', label: 'Evidence', icon: '\uD83D\uDD0D' },
  { id: 'timeline', label: 'Timeline', icon: '\u23F1' },
  { id: 'settings', label: 'Settings', icon: '\u2699' },
];

export default function ProjectDashboard() {
  const { projectId } = useParams() as { projectId: string };
  const { data: projectData, isLoading } = useProject(projectId);
  const { data: claimsData } = useClaims(projectId);
  const startRun = useStartRun();
  const retryRun = useRetryRun();
  const extractClaims = useExtractClaims();
  const { download } = useExport(projectId);
  const { data: latestRun } = useLatestRun(projectId);
  const [isAddEvidenceOpen, setIsAddEvidenceOpen] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [checkpointStages, setCheckpointStages] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [exporting, setExporting] = useState<string | null>(null);
  const [claimSearch, setClaimSearch] = useState('');
  const [claimStatusFilter, setClaimStatusFilter] = useState<string>('all');
  const [evidenceSearch, setEvidenceSearch] = useState('');
  const [evidenceStatusFilter, setEvidenceStatusFilter] = useState<string>('all');
  const [evidenceTypeFilter, setEvidenceTypeFilter] = useState<string>('all');
  const {
    selectedModelIds,
    searchProvider,
    loopMode,
    setSelectedModelIds,
    setSearchProvider,
    setLoopMode,
  } = useModelSelectionStore();
  const openInspector = useInspectorStore((s) => s.openInspector);
  const setRunInProgress = useUIStore((s) => s.setRunInProgress);
  const isRunInProgress = useUIStore((s) => s.isRunInProgress);
  const updateProject = useUpdateProject();
  const updateClaim = useUpdateClaim();

  useEffect(() => {
    if (startRun.data?.data?.runId) {
      setActiveRunId(startRun.data.data.runId);
      return;
    }
    if (latestRun?.data?.runId && !activeRunId) {
      setActiveRunId(latestRun.data.runId);
    }
  }, [startRun.data?.data?.runId, latestRun, activeRunId]);

  const initialRunEvents = (latestRun?.data?.events || []).map((e: any) => ({
    id: e.id || crypto.randomUUID(),
    type: e.type,
    payload: e.payload ?? e,
    createdAt: e.createdAt,
  }));

  const { events } = useRunEvents(activeRunId, initialRunEvents);

  const isRunLive =
    !events.some(
      (e) => e.type === 'run.completed' || e.type === 'run.failed' || e.type === 'run.cancelled',
    ) && events.length > 0;

  useEffect(() => {
    const live =
      events.length > 0 &&
      !events.some(
        (e) => e.type === 'run.completed' || e.type === 'run.failed' || e.type === 'run.cancelled',
      );
    setRunInProgress(live);
  }, [events, setRunInProgress]);

  if (isLoading) return <div className="p-8 text-center text-gray-500">Loading project...</div>;

  const project = projectData?.data?.project;
  const version = projectData?.data?.currentIdeaVersion;
  const claims = claimsData?.data || [];
  const evidence = projectData?.data?.project?.evidence || [];
  const decisions = projectData?.data?.project?.decisions || [];
  const latestDecision = projectData?.data?.latestDecision;

  const lastEvent = events[events.length - 1];
  const isFailed = lastEvent?.type?.endsWith('.failed') || lastEvent?.type === 'run.failed';

  // Derived stats
  const supportedCount = claims.filter((c: any) => c.status === 'supported').length;
  const contradictedCount = claims.filter((c: any) => c.status === 'contradicted').length;
  const unverifiedCount = claims.filter(
    (c: any) => c.status === 'unverified' || c.status === 'partially_supported',
  ).length;
  const resolutionRate = claims.length > 0 ? Math.round((supportedCount / claims.length) * 100) : 0;

  const modelVerdicts = events
    .filter((e) => e.type === 'phase.consensus.completed' && e.payload?.individualVotes)
    .flatMap((e) => e.payload.individualVotes || []);
  const totalVotes = modelVerdicts.length;
  const agreeVotes = modelVerdicts.filter(
    (v: any) => v.vote === 'accept' || v.vote === 'accept_with_reservations',
  ).length;
  const agreementRate = totalVotes > 0 ? Math.round((agreeVotes / totalVotes) * 100) : null;

  // Filtered claims
  const filteredClaims = useMemo(() => {
    const q = claimSearch.toLowerCase().trim();
    return claims.filter((c: any) => {
      if (claimStatusFilter !== 'all' && c.status !== claimStatusFilter) return false;
      if (q && !c.text.toLowerCase().includes(q) && !c.type?.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [claims, claimSearch, claimStatusFilter]);

  // Filtered evidence
  const filteredEvidence = useMemo(() => {
    const q = evidenceSearch.toLowerCase().trim();
    return evidence.filter((ev: any) => {
      if (evidenceStatusFilter !== 'all' && ev.status !== evidenceStatusFilter) return false;
      if (evidenceTypeFilter === 'counter' && !ev.isCounter) return false;
      if (evidenceTypeFilter === 'supporting' && ev.isCounter) return false;
      if (q && !ev.title?.toLowerCase().includes(q) && !ev.snippet?.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [evidence, evidenceSearch, evidenceStatusFilter, evidenceTypeFilter]);

  const handleExport = async (format: string) => {
    setExporting(format);
    try {
      if (format === 'json' || format === 'markdown' || format === 'pdf') {
        download(format);
      } else if (format === 'reproducibility') {
        const res = await apiFetch(`${API_BASE}/projects/${projectId}/export/reproducibility-pack`);
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reproducibility-pack-${projectId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (format === 'argument') {
        const res = await apiFetch(`${API_BASE}/projects/${projectId}/export/argument-map`);
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `argument-map-${projectId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <ProjectHeader
            projectTitle={project?.title || 'Project'}
            projectGoal={project?.goal || ''}
            projectId={projectId}
            isRunInProgress={isRunInProgress}
            isRunPending={startRun.isPending}
            selectedModelCount={selectedModelIds.length}
            showModelSelector={showModelSelector}
            isFailed={isFailed}
            showRetry={isFailed && !!activeRunId}
            activeRunId={activeRunId}
            retryPending={retryRun.isPending}
            onStartRun={() => {
              if (selectedModelIds.length > 0) {
                startRun.mutate({
                  projectId,
                  modelIds: selectedModelIds,
                  searchProvider: searchProvider || undefined,
                  loopMode,
                  checkpointStages,
                });
                setShowModelSelector(false);
              } else {
                setShowModelSelector(true);
              }
            }}
            onRetryRun={() => retryRun.mutate(activeRunId!)}
            onToggleModelSelector={() => setShowModelSelector(!showModelSelector)}
            onSaveProject={(title, goal) =>
              updateProject.mutate({ projectId, data: { title, goal } })
            }
          />
        </div>
      </div>

      {/* Model selector dropdown */}
      {showModelSelector && (
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
            <ModelSelector selectedIds={selectedModelIds} onChange={setSelectedModelIds} />
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">
                  Search Provider
                </label>
                <select
                  value={searchProvider}
                  onChange={(e) => setSearchProvider(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-3 py-1.5 bg-white"
                >
                  <option value="">Default</option>
                  <option value="mock">Mock</option>
                  <option value="searxng">SearXNG</option>
                  <option value="serpapi">SerpAPI</option>
                  <option value="web">Web Search</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Run Mode</label>
                <select
                  value={loopMode}
                  onChange={(e) => setLoopMode(e.target.value as any)}
                  className="text-sm border border-gray-300 rounded px-3 py-1.5 bg-white"
                >
                  <option value="standard">Standard</option>
                  <option value="self_improving">Self-Improving</option>
                  <option value="adversarial">Adversarial</option>
                </select>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => {
                    if (selectedModelIds.length > 0) {
                      startRun.mutate({
                        projectId,
                        modelIds: selectedModelIds,
                        searchProvider: searchProvider || undefined,
                        loopMode,
                        checkpointStages,
                      });
                      setShowModelSelector(false);
                    }
                  }}
                  disabled={selectedModelIds.length === 0 || startRun.isPending || isRunInProgress}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  Start Run ({selectedModelIds.length} models)
                </button>
                <button
                  onClick={() => setShowModelSelector(false)}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-gray-500">Claims</span>
              <span className="font-bold text-gray-900">{claims.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-gray-500">Evidence</span>
              <span className="font-bold text-gray-900">{evidence.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-600 font-bold">{resolutionRate}%</span>
              <span className="text-gray-400">resolved</span>
            </div>
            {agreementRate !== null && (
              <div className="flex items-center gap-2">
                <span className="text-purple-600 font-bold">{agreementRate}%</span>
                <span className="text-gray-400">agreement</span>
              </div>
            )}
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              <span className="text-gray-400 text-xs">
                {latestDecision ? latestDecision.decisionStatus.replace(/_/g, ' ') : 'No decision'}
              </span>
              <span className="text-gray-300 mx-1">|</span>
              <span className="text-gray-400 text-xs">
                {version?.status?.replace(/_/g, ' ') || project?.status || 'active'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex gap-0 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
                {tab.id === 'claims' && claims.length > 0 && (
                  <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                    {claims.length}
                  </span>
                )}
              </button>
            ))}
            <div className="flex-1" />
            {/* Quick actions in tab bar */}
            <div className="flex items-center gap-1 py-1">
              <button
                onClick={() => version?.id && extractClaims.mutate(version.id)}
                disabled={extractClaims.isPending || !version?.id}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
              >
                {extractClaims.isPending ? 'Extracting...' : 'Extract Claims'}
              </button>
              <button
                onClick={() => setIsAddEvidenceOpen(true)}
                className="px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 rounded"
              >
                + Evidence
              </button>
              <div className="relative group">
                <button className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded">
                  Export \u25BE
                </button>
                <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg py-1 z-50 hidden group-hover:block min-w-[180px]">
                  {[
                    { key: 'json', label: 'Export JSON' },
                    { key: 'markdown', label: 'Export Markdown' },
                    { key: 'pdf', label: 'Export PDF' },
                    { key: 'reproducibility', label: 'Reproducibility Pack' },
                    { key: 'argument', label: 'Argument Map' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => handleExport(item.key)}
                      disabled={exporting === item.key}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {exporting === item.key ? 'Exporting...' : item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isAddEvidenceOpen && (
        <AddEvidenceModal projectId={projectId} onClose={() => setIsAddEvidenceOpen(false)} />
      )}

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column — 2/3 */}
            <div className="lg:col-span-2 space-y-6">
              {/* Idea version */}
              <section className="bg-white rounded-xl border p-6">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Current Idea
                </h2>
                <p className="font-semibold text-lg text-gray-900">{version?.title}</p>
                <p className="text-gray-600 mt-2 whitespace-pre-wrap leading-relaxed">
                  {version?.description}
                </p>
              </section>

              {/* Evidence coverage — visual bar */}
              {claims.length > 0 && (
                <section className="bg-white rounded-xl border p-6">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Evidence Coverage
                  </h2>
                  <div className="flex h-4 rounded-full overflow-hidden bg-gray-100 mb-3">
                    {supportedCount > 0 && (
                      <div
                        className="bg-green-500 transition-all"
                        style={{ width: `${(supportedCount / claims.length) * 100}%` }}
                      />
                    )}
                    {unverifiedCount > 0 && (
                      <div
                        className="bg-yellow-400 transition-all"
                        style={{ width: `${(unverifiedCount / claims.length) * 100}%` }}
                      />
                    )}
                    {contradictedCount > 0 && (
                      <div
                        className="bg-red-500 transition-all"
                        style={{ width: `${(contradictedCount / claims.length) * 100}%` }}
                      />
                    )}
                  </div>
                  <div className="flex gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="text-gray-600">Supported</span>
                      <span className="font-bold text-green-700">{supportedCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <span className="text-gray-600">Unverified</span>
                      <span className="font-bold text-yellow-700">{unverifiedCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-gray-600">Contradicted</span>
                      <span className="font-bold text-red-700">{contradictedCount}</span>
                    </div>
                  </div>
                </section>
              )}

              {/* Critical issues + Next action */}
              {((projectData?.data?.openCriticalIssues?.length ?? 0) > 0 ||
                projectData?.data?.nextBestAction) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(projectData?.data?.openCriticalIssues?.length ?? 0) > 0 && (
                    <section className="bg-white rounded-xl border p-5">
                      <h2 className="text-sm font-semibold text-red-500 uppercase tracking-wider mb-3">
                        Critical Issues
                      </h2>
                      <ul className="space-y-2">
                        {projectData!.data.openCriticalIssues.map((issue: any, i: number) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <span className="text-red-500 mt-0.5 shrink-0">{'\u26A0'}</span>
                            <span className="text-gray-700">
                              {typeof issue === 'string' ? issue : issue.text || issue.title}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {projectData?.data?.nextBestAction && (
                    <section className="bg-white rounded-xl border p-5">
                      <h2 className="text-sm font-semibold text-blue-500 uppercase tracking-wider mb-3">
                        Next Action
                      </h2>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {typeof projectData.data.nextBestAction === 'string'
                          ? projectData.data.nextBestAction
                          : projectData.data.nextBestAction.action ||
                            projectData.data.nextBestAction.description}
                      </p>
                    </section>
                  )}
                </div>
              )}

              {/* Active tasks */}
              {(projectData?.data?.activeTasks?.length ?? 0) > 0 && (
                <section className="bg-white rounded-xl border p-6">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Active Tasks
                  </h2>
                  <div className="space-y-2">
                    {(projectData!.data.activeTasks as any[]).slice(0, 5).map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                      >
                        <span className="text-sm text-gray-700 truncate">
                          {t.title || t.objective}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                            t.status === 'running'
                              ? 'bg-sky-100 text-sky-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Right sidebar — 1/3 */}
            <div className="space-y-6">
              {/* Quick nav */}
              <section className="bg-white rounded-xl border p-4">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Navigate
                </h2>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { href: '/evidence', label: 'Evidence', color: 'text-green-600' },
                    { href: '/graph', label: 'Argument Graph', color: 'text-blue-600' },
                    { href: '/ideas', label: 'Ideas', color: 'text-purple-600' },
                    { href: '/decisions', label: 'Decisions', color: 'text-red-600' },
                    { href: '/claim-dependencies', label: 'Dependencies', color: 'text-amber-600' },
                    { href: '/hypotheses', label: 'Hypotheses', color: 'text-indigo-600' },
                    { href: '/tasks', label: 'Tasks', color: 'text-gray-600' },
                    { href: '/timeline', label: 'Timeline', color: 'text-teal-600' },
                    { href: '/analytics', label: 'Analytics', color: 'text-pink-600' },
                    { href: '/references', label: 'References', color: 'text-orange-600' },
                    { href: '/literature-reviews', label: 'Literature', color: 'text-cyan-600' },
                    { href: '/latex', label: 'LaTeX', color: 'text-slate-600' },
                    { href: '/runs/compare', label: 'Compare Runs', color: 'text-violet-600' },
                    { href: '/audit-log', label: 'Audit Log', color: 'text-gray-500' },
                  ].map((link) => (
                    <Link
                      key={link.href}
                      href={`/projects/${projectId}${link.href}`}
                      className="px-3 py-2 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <span className={link.color}>{link.label}</span>
                    </Link>
                  ))}
                </div>
              </section>

              {/* Run timeline */}
              <section className="bg-white rounded-xl border p-4">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Run Timeline
                </h2>
                <RunTimeline events={events} activeRunId={activeRunId} isRunLive={isRunLive} />
              </section>
            </div>
          </div>
        )}

        {activeTab === 'claims' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <section className="bg-white rounded-xl border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">
                    Key Claims ({filteredClaims.length}
                    {filteredClaims.length !== claims.length ? ` of ${claims.length}` : ''})
                  </h2>
                  <button
                    onClick={() => version?.id && extractClaims.mutate(version.id)}
                    disabled={extractClaims.isPending}
                    className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 disabled:opacity-50"
                  >
                    {extractClaims.isPending ? 'Extracting...' : 'Re-extract'}
                  </button>
                </div>
                {/* Search and filters */}
                <div className="flex gap-2 mb-4">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={claimSearch}
                      onChange={(e) => setClaimSearch(e.target.value)}
                      placeholder="Search claims..."
                      className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-2 bg-gray-50 focus:bg-white focus:border-blue-300 outline-none"
                    />
                    <svg
                      className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    {claimSearch && (
                      <button
                        onClick={() => setClaimSearch('')}
                        className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600 text-xs"
                      >
                        {'\u2715'}
                      </button>
                    )}
                  </div>
                  <select
                    value={claimStatusFilter}
                    onChange={(e) => setClaimStatusFilter(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:border-blue-300 outline-none"
                  >
                    <option value="all">All Status</option>
                    <option value="supported">Supported</option>
                    <option value="contradicted">Contradicted</option>
                    <option value="unverified">Unverified</option>
                    <option value="partially_supported">Partial</option>
                    <option value="unsupported">Unsupported</option>
                    <option value="needs_external_validation">Needs Validation</option>
                  </select>
                </div>
                <ul className="space-y-3">
                  {filteredClaims.map((claim: any) => (
                    <ClaimRowItem
                      key={claim.id}
                      claim={claim}
                      onInspect={() => openInspector('claim', claim.id)}
                      onStatusChange={(id, status) =>
                        updateClaim.mutate({ claimId: id, data: { status } })
                      }
                    />
                  ))}
                  {claims.length === 0 && (
                    <p className="text-sm text-gray-400 italic py-8 text-center">
                      No claims extracted yet. Run claim extraction or start a deliberation run.
                    </p>
                  )}
                  {claims.length > 0 && filteredClaims.length === 0 && (
                    <p className="text-sm text-gray-400 italic py-8 text-center">
                      No claims match your search. Try adjusting your filters.
                    </p>
                  )}
                </ul>
              </section>
            </div>
            <div className="space-y-6">
              {/* Critiques & Revisions */}
              <section className="bg-white rounded-xl border p-5">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Critiques & Revisions
                </h2>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {events
                    .filter(
                      (e) =>
                        e.type === 'critique.created' ||
                        e.type === 'critique.responded' ||
                        e.type === 'idea.revised',
                    )
                    .map((e, i) => (
                      <div
                        key={i}
                        className="p-3 border-l-2 border-purple-300 bg-purple-50 rounded text-sm"
                      >
                        <span className="font-medium text-purple-700">
                          {phaseLabels[e.type] || e.type}
                        </span>
                        {e.payload && (
                          <pre className="text-[10px] text-gray-500 mt-1 overflow-auto max-h-20">
                            {JSON.stringify(e.payload, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  {events.filter(
                    (e) =>
                      e.type === 'critique.created' ||
                      e.type === 'critique.responded' ||
                      e.type === 'idea.revised',
                  ).length === 0 && (
                    <p className="text-sm text-gray-400 italic">No critiques or revisions yet</p>
                  )}
                </div>
              </section>
              <section className="bg-white rounded-xl border p-4">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Run Timeline
                </h2>
                <RunTimeline events={events} activeRunId={activeRunId} isRunLive={isRunLive} />
              </section>
            </div>
          </div>
        )}

        {activeTab === 'evidence' && (
          <section className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                Evidence ({filteredEvidence.length}
                {filteredEvidence.length !== evidence.length ? ` of ${evidence.length}` : ''})
              </h2>
              <button
                onClick={() => setIsAddEvidenceOpen(true)}
                className="text-xs bg-green-50 text-green-600 hover:bg-green-100 px-3 py-1.5 rounded-lg border border-green-200"
              >
                + Add Evidence
              </button>
            </div>
            {/* Search and filters */}
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={evidenceSearch}
                  onChange={(e) => setEvidenceSearch(e.target.value)}
                  placeholder="Search evidence..."
                  className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-2 bg-gray-50 focus:bg-white focus:border-blue-300 outline-none"
                />
                <svg
                  className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                {evidenceSearch && (
                  <button
                    onClick={() => setEvidenceSearch('')}
                    className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600 text-xs"
                  >
                    {'\u2715'}
                  </button>
                )}
              </div>
              <select
                value={evidenceStatusFilter}
                onChange={(e) => setEvidenceStatusFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:border-blue-300 outline-none"
              >
                <option value="all">All Status</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="pending">Pending</option>
              </select>
              <select
                value={evidenceTypeFilter}
                onChange={(e) => setEvidenceTypeFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:bg-white focus:border-blue-300 outline-none"
              >
                <option value="all">All Types</option>
                <option value="supporting">Supporting</option>
                <option value="counter">Counter</option>
              </select>
            </div>
            {evidence.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-8 text-center">
                No evidence yet. Add evidence manually or run the pipeline.
              </p>
            ) : filteredEvidence.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-8 text-center">
                No evidence matches your search. Try adjusting your filters.
              </p>
            ) : (
              <div className="space-y-3">
                {filteredEvidence.map((ev: any) => (
                  <div key={ev.id} className="p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-gray-900">{ev.title}</h3>
                        {ev.snippet && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{ev.snippet}</p>
                        )}
                        {ev.sourceUrl && (
                          <a
                            href={ev.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-500 hover:underline mt-1 block truncate"
                          >
                            {ev.sourceUrl}
                          </a>
                        )}
                        <div className="flex gap-2 mt-2 text-[10px]">
                          {ev.status && (
                            <span
                              className={`px-1.5 py-0.5 rounded ${
                                ev.status === 'accepted'
                                  ? 'bg-green-100 text-green-700'
                                  : ev.status === 'rejected'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {ev.status}
                            </span>
                          )}
                          {ev.isCounter && (
                            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                              Counter
                            </span>
                          )}
                          {ev.reliability && (
                            <span className="text-gray-400">Reliability: {ev.reliability}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'timeline' && (
          <section className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold mb-4">Deliberation Timeline</h2>
            <RunTimeline events={events} activeRunId={activeRunId} isRunLive={isRunLive} />
          </section>
        )}

        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white rounded-xl border p-6">
              <h2 className="text-lg font-semibold mb-4">Project Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Title</label>
                  <input
                    type="text"
                    defaultValue={project?.title}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Goal</label>
                  <textarea
                    defaultValue={project?.goal}
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                  />
                </div>
                <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                  Save Changes
                </button>
              </div>
            </section>
            <section className="bg-white rounded-xl border p-6">
              <h2 className="text-lg font-semibold mb-4">Evaluation Criteria</h2>
              <Link
                href="/settings/evaluation-criteria"
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Configure evaluation criteria for this project &rarr;
              </Link>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function ClaimRowItem({
  claim,
  onInspect,
  onStatusChange,
}: {
  claim: any;
  onInspect: () => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  const searchSupporting = useSearchEvidence(claim.id);
  const searchCounter = useSearchCounterEvidence(claim.id);

  return (
    <li className="flex items-start justify-between p-4 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors">
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={onInspect}
          className="text-sm font-medium text-left hover:text-blue-700"
        >
          {claim.text}
        </button>
        <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">
          {claim.type} | Criticality: {claim.criticality}
        </p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => searchSupporting.mutate(claim.text)}
            disabled={searchSupporting.isPending}
            className="text-[11px] bg-green-50 text-green-600 hover:bg-green-100 px-2 py-0.5 rounded border border-green-200 disabled:opacity-50"
          >
            {searchSupporting.isPending ? '...' : '+ Evidence'}
          </button>
          <button
            onClick={() => searchCounter.mutate(claim.text)}
            disabled={searchCounter.isPending}
            className="text-[11px] bg-red-50 text-red-600 hover:bg-red-100 px-2 py-0.5 rounded border border-red-200 disabled:opacity-50"
          >
            {searchCounter.isPending ? '...' : '+ Counter'}
          </button>
        </div>
      </div>
      <select
        value={claim.status}
        onChange={(e) => onStatusChange(claim.id, e.target.value)}
        className={`text-xs font-medium px-2 py-1 rounded border ml-3 shrink-0 ${
          claim.status === 'supported'
            ? 'bg-green-100 text-green-800 border-green-200'
            : claim.status === 'contradicted'
              ? 'bg-red-100 text-red-800 border-red-200'
              : claim.status === 'partially_supported'
                ? 'bg-blue-100 text-blue-800 border-blue-200'
                : claim.status === 'unsupported'
                  ? 'bg-orange-100 text-orange-800 border-orange-200'
                  : 'bg-yellow-100 text-yellow-800 border-yellow-200'
        }`}
      >
        <option value="unverified">Unverified</option>
        <option value="supported">Supported</option>
        <option value="partially_supported">Partial</option>
        <option value="contradicted">Contradicted</option>
        <option value="unsupported">Unsupported</option>
        <option value="needs_external_validation">Needs Validation</option>
      </select>
    </li>
  );
}

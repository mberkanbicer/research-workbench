'use client';

import { useParams } from "next/navigation";
import { useProject, useClaims, useStartRun, useExport, useExtractClaims, useRetryRun, useLatestRun, useUpdateProject, useUpdateClaim, useSearchEvidence, useSearchCounterEvidence } from "@/hooks/useApi";
import { phaseLabels } from "@/lib/eventLabels";

import { useState, useEffect } from "react";
import { apiFetch, API_BASE } from "@/lib/apiFetch";
import AddEvidenceModal from "@/components/AddEvidenceModal";
import { ModelSelector } from "@/components/ModelSelector";
import ProjectHeader from "@/components/ProjectHeader";
import ProjectStatsGrid from "@/components/ProjectStatsGrid";
import RunTimeline from "@/components/RunTimeline";
import ProjectNavLinks from "@/components/ProjectNavLinks";
import { useRunEvents } from "@/hooks/useRunEvents";
import { useModelSelectionStore } from "@/store/modelSelectionStore";
import { useInspectorStore } from "@/store/inspectorStore";
import { useUIStore } from "@/store/uiStore";

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
  const [exportingRepro, setExportingRepro] = useState(false);
  const [exportingArgument, setExportingArgument] = useState(false);
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

  const isRunLive = !events.some(
    e => e.type === 'run.completed' || e.type === 'run.failed' || e.type === 'run.cancelled'
  ) && events.length > 0;

  useEffect(() => {
    const live = events.length > 0 && !events.some(
      (e) => e.type === 'run.completed' || e.type === 'run.failed' || e.type === 'run.cancelled',
    );
    setRunInProgress(live);
  }, [events, setRunInProgress]);

  if (isLoading) return <div className="p-8">Loading project...</div>;

  const project = projectData?.data?.project;
  const version = projectData?.data?.currentIdeaVersion;
  const claims = claimsData?.data || [];
  const evidence = projectData?.data?.project?.evidence || [];
  const decisions = projectData?.data?.project?.decisions || [];
  const latestDecision = projectData?.data?.latestDecision;

  const lastEvent = events[events.length - 1];
  const isFailed = lastEvent?.type?.endsWith('.failed') || lastEvent?.type === 'run.failed';

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
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
            startRun.mutate({ projectId, modelIds: selectedModelIds, searchProvider: searchProvider || undefined, loopMode, checkpointStages });
            setShowModelSelector(false);
          } else {
            setShowModelSelector(true);
          }
        }}
        onRetryRun={() => retryRun.mutate(activeRunId!)}
        onToggleModelSelector={() => setShowModelSelector(!showModelSelector)}
        onSaveProject={(title, goal) => updateProject.mutate({ projectId, data: { title, goal } })}
      />

      {showModelSelector && (
        <div className="bg-white p-4 rounded-lg border shadow-sm">
          <ModelSelector
            selectedIds={selectedModelIds}
            onChange={setSelectedModelIds}
          />
          <div className="mt-4 flex items-center gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Search Provider</label>
              <select
                value={searchProvider}
                onChange={e => setSearchProvider(e.target.value)}
                className="text-sm border border-gray-300 rounded px-3 py-1.5 bg-white"
              >
                <option value="">Default (env SEARCH_PROVIDER)</option>
                <option value="mock">Mock (no real search)</option>
                <option value="searxng">SearXNG</option>
                <option value="serpapi">SerpAPI</option>
                <option value="web">Web Search</option>
                <option value="manual">Manual Entry</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Run Mode</label>
              <select
                value={loopMode}
                onChange={e => setLoopMode(e.target.value as 'standard' | 'self_improving' | 'adversarial')}
                className="text-sm border border-gray-300 rounded px-3 py-1.5 bg-white"
              >
                <option value="standard">Standard</option>
                <option value="self_improving">Self-Improving</option>
                <option value="adversarial">Adversarial (Probe)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Checkpoints</label>
              <div className="flex gap-1 flex-wrap">
                {['review', 'consensus'].map(stage => (
                  <label key={stage} className="flex items-center gap-1 text-xs bg-gray-100 px-2 py-1 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checkpointStages.includes(stage)}
                      onChange={e => {
                        if (e.target.checked) setCheckpointStages([...checkpointStages, stage]);
                        else setCheckpointStages(checkpointStages.filter(s => s !== stage));
                      }}
                      className="rounded"
                    />
                    {stage}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (selectedModelIds.length > 0) {
                    startRun.mutate({ projectId, modelIds: selectedModelIds, searchProvider: searchProvider || undefined, loopMode, checkpointStages });
                    setShowModelSelector(false);
                  }
                }}
                disabled={selectedModelIds.length === 0 || startRun.isPending || isRunInProgress}
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
              >
                Start with Selected ({selectedModelIds.length})
              </button>
              <button
                onClick={() => setShowModelSelector(false)}
                className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ProjectStatsGrid
        claimsCount={claims.length}
        evidenceCount={evidence.length}
        latestDecisionLabel={latestDecision ? latestDecision.decisionStatus.replace(/_/g, ' ') : '—'}
        ideaStatus={version?.status ? version.status.replace(/_/g, ' ') : project?.status || 'active'}
      />

      <div className="flex gap-4">
        <button
          onClick={() => version?.id && extractClaims.mutate(version.id)}
          disabled={extractClaims.isPending}
          className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1 rounded border border-blue-200"
        >
          {extractClaims.isPending ? 'Extracting...' : 'Extract Claims'}
        </button>
        <button
          onClick={() => setIsAddEvidenceOpen(true)}
          className="text-xs bg-green-50 text-green-600 hover:bg-green-100 px-3 py-1 rounded border border-green-200"
        >
          Add Evidence
        </button>
        <button onClick={() => download('json')} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded border">Export JSON</button>
        <button onClick={() => download('markdown')} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded border">Export Markdown</button>
        <button onClick={() => download('pdf')} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded border">Export PDF</button>
        <button onClick={async () => {
          setExportingRepro(true);
          try {
            const res = await apiFetch(`${API_BASE}/projects/${projectId}/export/reproducibility-pack`);
            const data = await res.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `reproducibility-pack-${projectId}.json`;
            a.click(); URL.revokeObjectURL(url);
          } finally { setExportingRepro(false); }
        }} disabled={exportingRepro} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded border disabled:opacity-50">
          {exportingRepro ? 'Exporting...' : 'Reproducibility Pack'}
        </button>
        <button onClick={async () => {
          setExportingArgument(true);
          try {
            const res = await apiFetch(`${API_BASE}/projects/${projectId}/export/argument-map`);
            const data = await res.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `argument-map-${projectId}.json`;
            a.click(); URL.revokeObjectURL(url);
          } finally { setExportingArgument(false); }
        }} disabled={exportingArgument} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded border disabled:opacity-50">
          {exportingArgument ? 'Exporting...' : 'Argument Map'}
        </button>
      </div>

      {isAddEvidenceOpen && (
        <AddEvidenceModal
          projectId={projectId}
          onClose={() => setIsAddEvidenceOpen(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4 border-b pb-2">Current Idea Version</h2>
            <div className="prose prose-sm max-w-none">
              <p className="font-medium text-lg">{version?.title}</p>
              <p className="text-gray-700 whitespace-pre-wrap">{version?.description}</p>
            </div>
          </section>

          <section className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4 border-b pb-2">Key Claims ({claims.length})</h2>
            <ul className="space-y-3">
              {claims.map((claim: any) => (
                <ClaimRowItem key={claim.id} claim={claim} onInspect={() => openInspector('claim', claim.id)} onStatusChange={(id, status) => updateClaim.mutate({ claimId: id, data: { status } })} />
              ))}
              {claims.length === 0 && <p className="text-sm text-gray-400 italic">No claims extracted yet. Run claim extraction or start a deliberation run.</p>}
            </ul>
          </section>

          {/* Evidence Coverage Card */}
          {claims.length > 0 && (
            <section className="bg-white border rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 border-b pb-2">Evidence Coverage</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-black text-green-600">
                    {claims.filter((c: any) => c.status === 'supported').length}
                  </p>
                  <p className="text-xs text-gray-500 font-medium mt-1">Supported</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-red-500">
                    {claims.filter((c: any) => c.status === 'contradicted').length}
                  </p>
                  <p className="text-xs text-gray-500 font-medium mt-1">Contradicted</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-gray-400">
                    {claims.filter((c: any) => c.status === 'unverified' || c.status === 'partially_supported').length}
                  </p>
                  <p className="text-xs text-gray-500 font-medium mt-1">Unverified / Partial</p>
                </div>
              </div>
            </section>
          )}

          {/* Active Tasks Card */}
          {(projectData?.data?.activeTasks?.length ?? 0) > 0 && projectData && (
            <section className="bg-white border rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 border-b pb-2">Active Tasks ({projectData.data.activeTasks.length})</h2>
              <ul className="space-y-2">
                {(projectData.data.activeTasks as { id: string; title?: string; objective?: string; status: string }[]).slice(0, 5).map((t) => (
                  <li key={t.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 truncate">{t.title || t.objective}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      t.status === 'running' ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-600'
                    }`}>{t.status}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Open Critical Issues Card */}
          {(projectData?.data?.openCriticalIssues?.length ?? 0) > 0 && projectData && (
            <section className="bg-white border rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 border-b pb-2">Open Critical Issues</h2>
              <ul className="space-y-2">
                {projectData.data.openCriticalIssues.map((issue: any, i: number) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">⚠</span>
                    <span className="text-gray-700">{typeof issue === 'string' ? issue : issue.text || issue.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Next Best Action Card */}
          {projectData?.data?.nextBestAction && (
            <section className="bg-white border rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 border-b pb-2">Next Best Action</h2>
              <p className="text-sm text-gray-700">
                {typeof projectData.data.nextBestAction === 'string'
                  ? projectData.data.nextBestAction
                  : projectData.data.nextBestAction.action || projectData.data.nextBestAction.description}
              </p>
            </section>
          )}

          {/* Analytics: Claim Resolution Rate */}
          {(claimsData?.data?.length ?? 0) > 0 && claimsData?.data && (() => {
            const total = claimsData.data.length;
            const supported = claimsData.data.filter((c: any) => ['supported', 'partially_supported'].includes(c.status)).length;
            const contradicted = claimsData.data.filter((c: any) => c.status === 'contradicted').length;
            const unverified = claimsData.data.filter((c: any) => c.status === 'unverified').length;
            const resolutionRate = total > 0 ? Math.round((supported / total) * 100) : 0;

            // Model agreement analysis from run events
            const modelVerdicts = events
              .filter(e => e.type === 'phase.consensus.completed' && e.payload?.individualVotes)
              .flatMap(e => e.payload.individualVotes || []);
            const totalVotes = modelVerdicts.length;
            const agreeVotes = modelVerdicts.filter((v: any) => v.vote === 'accept' || v.vote === 'accept_with_reservations').length;
            const agreementRate = totalVotes > 0 ? Math.round((agreeVotes / totalVotes) * 100) : null;

            // Evidence accumulation from events
            const evidenceFound = events.filter(e => e.type === 'phase.evidence_discovery.completed').reduce((sum: number, e: any) => sum + (e.payload?.count || 0), 0);

            return (
              <section className="bg-white border rounded-lg p-6">
                <h2 className="text-lg font-semibold mb-4 border-b pb-2">Analytics</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-xl">
                    <div className="text-2xl font-bold text-blue-700">{resolutionRate}%</div>
                    <div className="text-xs text-blue-600 mt-1">Claims Resolved</div>
                    <div className="text-[10px] text-blue-400 mt-0.5">{supported}/{total} supported</div>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-xl">
                    <div className="text-2xl font-bold text-purple-700">{evidenceFound}</div>
                    <div className="text-xs text-purple-600 mt-1">Evidence Items</div>
                    <div className="text-[10px] text-purple-400 mt-0.5">{contradicted} contradicted</div>
                  </div>
                  <div className="text-center p-3 bg-emerald-50 rounded-xl">
                    <div className="text-2xl font-bold text-emerald-700">{agreementRate !== null ? `${agreementRate}%` : '—'}</div>
                    <div className="text-xs text-emerald-600 mt-1">Model Agreement</div>
                    <div className="text-[10px] text-emerald-400 mt-0.5">{totalVotes} total votes</div>
                  </div>
                </div>
              </section>
            );
          })()}

          <section className="bg-white border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4 border-b pb-2">Critiques & Revisions</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {events.filter(e => e.type === 'critique.created' || e.type === 'critique.responded' || e.type === 'idea.revised').map((e, i) => (
                <div key={i} className="p-2 border-l-2 border-purple-300 bg-purple-50 rounded text-sm">
                  <span className="font-medium text-purple-700">{phaseLabels[e.type] || e.type}</span>
                  {e.payload && <pre className="text-[10px] text-gray-500 mt-1 overflow-auto">{JSON.stringify(e.payload, null, 2)}</pre>}
                </div>
              ))}
              {events.filter(e => e.type === 'critique.created' || e.type === 'critique.responded' || e.type === 'idea.revised').length === 0 &&
                <p className="text-sm text-gray-400 italic">No critiques or revisions yet</p>}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <RunTimeline
            events={events}
            activeRunId={activeRunId}
            isRunLive={isRunLive}
          />
          <ProjectNavLinks projectId={projectId} />
        </aside>
      </div>
    </div>
  );
}

function ClaimRowItem({ claim, onInspect, onStatusChange }: { claim: any; onInspect: () => void; onStatusChange: (id: string, status: string) => void }) {
  const searchSupporting = useSearchEvidence(claim.id);
  const searchCounter = useSearchCounterEvidence(claim.id);

  return (
    <li className="flex items-start justify-between p-3 bg-gray-50 rounded border">
      <div className="flex-1 min-w-0">
        <button type="button" onClick={onInspect} className="text-sm font-medium text-left hover:text-blue-700">{claim.text}</button>
        <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">{claim.type} | Criticality: {claim.criticality}</p>
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
      <div className="flex items-center gap-2 ml-3 shrink-0">
        <select
          value={claim.status}
          onChange={e => onStatusChange(claim.id, e.target.value)}
          className={`text-xs font-medium px-2 py-1 rounded border ${
            claim.status === 'supported' ? 'bg-green-100 text-green-800 border-green-200' :
            claim.status === 'contradicted' ? 'bg-red-100 text-red-800 border-red-200' :
            claim.status === 'partially_supported' ? 'bg-blue-100 text-blue-800 border-blue-200' :
            claim.status === 'unsupported' ? 'bg-orange-100 text-orange-800 border-orange-200' :
            'bg-yellow-100 text-yellow-800 border-yellow-200'
          }`}
        >
          <option value="unverified">Unverified</option>
          <option value="supported">Supported</option>
          <option value="partially_supported">Partially Supported</option>
          <option value="contradicted">Contradicted</option>
          <option value="unsupported">Unsupported</option>
          <option value="needs_external_validation">Needs External Validation</option>
        </select>
      </div>
    </li>
  );
}

'use client';

import { useParams } from "next/navigation";
import Link from "next/link";
import { useProject, useClaims, useStartRun, useExport, useExtractClaims, useRetryRun, useLatestRun, useUpdateProject, useUpdateClaim, useSearchEvidence, useSearchCounterEvidence } from "@/hooks/useApi";

import { useState, useEffect, useRef, useCallback } from "react";
import AddEvidenceModal from "@/components/AddEvidenceModal";
import { ModelSelector } from "@/components/ModelSelector";
import { useRunEvents } from "@/hooks/useRunEvents";
import { useModelSelectionStore } from "@/store/modelSelectionStore";
import { useInspectorStore } from "@/store/inspectorStore";
import { useUIStore } from "@/store/uiStore";
import PresenceIndicator from "@/components/PresenceIndicator";

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
  const [isEditingProject, setIsEditingProject] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editGoal, setEditGoal] = useState('');
  const updateProject = useUpdateProject();
  const updateClaim = useUpdateClaim();
  const timelineEndRef = useRef<HTMLDivElement>(null);

  const phaseLabels: Record<string, string> = {
    'phase.extraction.started': 'Extracting Claims',
    'phase.evidence_discovery.started': 'Searching for Evidence',
    'phase.evidence_assessment.started': 'Assessing Evidence',
    'phase.review.started': 'Running Model Reviews',
    'phase.critique.started': 'Cross-Critiquing Reviews',
    'phase.critique_response.started': 'Responding to Critiques',
    'phase.revision.started': 'Revising Idea',
    'phase.consensus.started': 'Building Consensus',
    'phase.gap_detection.started': 'Detecting Evidence Gaps',
    'phase.gap_detection.completed': 'Gap Analysis Done',
    'phase.gap_detection.failed': 'Gap Detection Failed',
    'phase.goal_evaluation.started': 'Evaluating Goal Achievement',
    'phase.goal_evaluation.completed': 'Goal Evaluation Done',
    'phase.goal_evaluation.failed': 'Goal Evaluation Failed',
    'phase.extraction.completed': 'Claims Extracted',
    'phase.evidence_discovery.completed': 'Evidence Discovery Done',
    'phase.evidence_assessment.completed': 'Assessment Finished',
    'phase.review.completed': 'Reviews Collected',
    'phase.critique.completed': 'Critiques Complete',
    'phase.critique_response.completed': 'Critique Responses Done',
    'phase.revision.completed': 'Idea Revised',
    'phase.consensus.completed': 'Consensus Reached',
    'phase.adversarial_probe.started': 'Running Adversarial Probe',
    'phase.adversarial_probe.completed': 'Adversarial Probe Done',
    'phase.adversarial_probe.claim_probed': 'Claim Probed',
    'phase.consensus.evidence_gap_noted': 'Evidence Gap (Not Blocking)',
    'phase.consensus.evidence_floor_failed': 'Evidence Floor Failed (Blocked)',
    'phase.extraction.failed': 'Extraction Failed',
    'phase.discovery.failed': 'Discovery Failed',
    'phase.assessment.failed': 'Assessment Failed',
    'phase.review.failed': 'Review Failed',
    'phase.critique.failed': 'Critique Failed',
    'phase.critique_response.failed': 'Critique Response Failed',
    'phase.revision.failed': 'Revision Failed',
    'phase.consensus.failed': 'Consensus Failed',
    'critique.created': 'New Critique',
    'critique.responded': 'Critique Response',
    'idea.revised': 'Idea Revised',
    'idea.version_advanced': 'Version Advanced',
    'review.context_requested': 'Model Requested More Context',
    'iteration.started': 'Iteration Started',
    'iteration.completed': 'Iteration Completed',
    'iteration.failed': 'Iteration Failed',
    'goal.not_achieved': 'Goal Not Yet Achieved',
  };

  const eventMeta: Record<string, { icon: string; color: string }> = {
    'run.started': { icon: '\u25B6', color: 'text-emerald-500' },
    'run.completed': { icon: '\u2714', color: 'text-emerald-500' },
    'run.failed': { icon: '\u2718', color: 'text-red-500' },
    'run.cancelled': { icon: '\u25A0', color: 'text-gray-400' },
    'iteration.started': { icon: '\u21BB', color: 'text-violet-500' },
    'iteration.completed': { icon: '\u2714', color: 'text-violet-400' },
    'iteration.failed': { icon: '\u2718', color: 'text-red-500' },
    'goal.not_achieved': { icon: '\u25B3', color: 'text-amber-500' },
    'phase.consensus.evidence_gap_noted': { icon: '\u26A0', color: 'text-amber-500' },
    'phase.consensus.evidence_floor_failed': { icon: '\u2718', color: 'text-red-500' },
    'error': { icon: '\u26A0', color: 'text-red-400' },
  };

  const getEventIcon = (type: string) => {
    if (eventMeta[type]) return eventMeta[type];
    if (type.endsWith('.started')) return { icon: '\u25CB', color: 'text-sky-500' };
    if (type.endsWith('.completed')) return { icon: '\u25CF', color: 'text-emerald-500' };
    if (type.endsWith('.failed')) return { icon: '\u2718', color: 'text-red-500' };
    return { icon: '\u2022', color: 'text-gray-400' };
  };

  const getEventDescription = (e: any): string | null => {
    const p = e.payload || {};
    if (e.type === 'phase.extraction.completed' && p.count != null) return `Extracted ${p.count} claim${p.count !== 1 ? 's' : ''} from the idea`;
    if (e.type === 'phase.evidence_discovery.started' && p.claimCount) return `Searching for evidence across ${p.claimCount} claim${p.claimCount !== 1 ? 's' : ''}`;
    if (e.type === 'phase.evidence_discovery.completed' && p.count != null) return `Found ${p.count} piece${p.count !== 1 ? 's' : ''} of evidence`;
    if (e.type === 'phase.evidence_assessment.started' && p.evidenceCount) return `Evaluating ${p.evidenceCount} evidence item${p.evidenceCount !== 1 ? 's' : ''}`;
    if (e.type === 'phase.evidence_assessment.completed' && p.count != null) return `Assessed ${p.count} evidence item${p.count !== 1 ? 's' : ''}`;
    if (e.type === 'phase.review.started' && p.modelCount) return `${p.modelCount} model${p.modelCount !== 1 ? 's' : ''} reviewing independently`;
    if (e.type === 'phase.review.completed' && p.count != null) return `${p.count} review${p.count !== 1 ? 's' : ''} collected`;
    if (e.type === 'phase.critique.started' && p.modelCount) return `${p.modelCount} model${p.modelCount !== 1 ? 's' : ''} cross-examining`;
    if (e.type === 'phase.critique.completed' && p.count != null) return `${p.count} critique${p.count !== 1 ? 's' : ''} registered`;
    if (e.type === 'phase.critique_response.started' && p.critiqueCount) return `Responding to ${p.critiqueCount} critique${p.critiqueCount !== 1 ? 's' : ''}`;
    if (e.type === 'phase.critique_response.completed' && p.count != null) return `${p.count} response${p.count !== 1 ? 's' : ''} recorded`;
    if (e.type === 'phase.consensus.completed' && p.vote) return `Consensus: ${p.vote.replace(/_/g, ' ')}`;
    if (e.type === 'phase.consensus.evidence_gap_noted') return `Evidence gap (${p.supportRatio || 0}% coverage) — not blocking`;
    if (e.type === 'phase.consensus.evidence_floor_failed') return `Evidence quality floor blocked — insufficient accepted evidence`;
    if (e.type === 'idea.version_advanced' && p.round) return `Idea advanced to v${p.round + 1}`;
    if (e.type === 'critique.created') return `New critique raised`;
    if (e.type === 'critique.responded' && p.verdict) return `Critique ${p.verdict}`;
    if (e.type === 'review.context_requested') return `Model requested additional context`;
    if (e.type === 'run.completed' && p.outcome) return p.outcome === 'success' ? 'Run finished successfully' : `Run ended: ${p.outcome.replace(/_/g, ' ')}`;
    if (e.type === 'phase.gap_detection.completed' && p.gapCount != null) return `Found ${p.gapCount} gap${p.gapCount !== 1 ? 's' : ''} (${p.criticalGapCount || 0} critical) — evidence strength: ${p.overallStrength || 'unknown'}`;
    if (e.type === 'phase.goal_evaluation.completed') return p.goalAchieved ? `Goal achieved (${p.achievementLevel || 'confirmed'})` : `Goal not achieved: ${p.reason || 'see details'}`;
    if (e.type === 'goal.not_achieved' && p.achievementLevel) return `Achievement level: ${p.achievementLevel.replace(/_/g, ' ')}${p.missingAspects?.length ? ' — missing: ' + p.missingAspects.slice(0, 2).join(', ') : ''}`;
    if (e.type === 'iteration.started' && p.iteration && p.maxRounds) return `Iteration ${p.iteration} of ${p.maxRounds}`;
    if (e.type === 'iteration.completed' && p.iteration) return p.revisionGenerated ? `Iteration ${p.iteration} done — new idea version generated` : p.maxRoundsReached ? 'Max iterations reached' : `Iteration ${p.iteration} done`;
    if (e.type === 'round.started' && p.round) return `Round ${p.round} begins`;
    if (e.type === 'round.completed' && p.round) return `Round ${p.round} complete`;
    if (e.type === 'run.failed' && p.error) return p.error;
    if (e.type === 'run.cancelled') return 'Run was cancelled by user';
    if (e.type === 'error' && p.message) return p.message;
    if (e.type === 'run.started') return 'Deliberation pipeline started';
    return null;
  };

  const formatTime = (ts: string | undefined) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  useEffect(() => {
    if (startRun.data?.data?.runId) {
      setActiveRunId(startRun.data.data.runId);
      return;
    }
    if (latestRun?.runId && !activeRunId) {
      setActiveRunId(latestRun.runId);
    }
  }, [startRun.data?.data?.runId, latestRun, activeRunId]);

  const initialRunEvents = (latestRun?.events || []).map((e: any) => ({
    id: e.id || crypto.randomUUID(),
    type: e.type,
    payload: e.payload ?? e,
    createdAt: e.createdAt,
  }));

  const { events, connectionStatus } = useRunEvents(activeRunId, initialRunEvents);

  const isRunLive = !events.some(
    e => e.type === 'run.completed' || e.type === 'run.failed' || e.type === 'run.cancelled'
  ) && events.length > 0;

  useEffect(() => {
    const live = events.length > 0 && !events.some(
      (e) => e.type === 'run.completed' || e.type === 'run.failed' || e.type === 'run.cancelled',
    );
    setRunInProgress(live);
  }, [events, setRunInProgress]);

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

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
      <header className="flex flex-col md:flex-row justify-between items-start gap-4 bg-white p-6 md:p-10 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex-1 w-full">
          {isEditingProject ? (
            <div className="space-y-3">
              <input
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="w-full text-3xl font-extrabold text-black tracking-tight bg-gray-50 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <textarea
                value={editGoal}
                onChange={e => setEditGoal(e.target.value)}
                rows={3}
                className="w-full text-gray-500 text-lg leading-relaxed bg-gray-50 border rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    updateProject.mutate({ projectId, data: { title: editTitle, goal: editGoal } });
                    setIsEditingProject(false);
                  }}
                  disabled={updateProject.isPending}
                  className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateProject.isPending ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setIsEditingProject(false)}
                  className="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="group flex items-start gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                <h1 className="text-4xl font-extrabold mb-3 text-black tracking-tight">{project?.title || 'Project'}</h1>
                <PresenceIndicator userName="You" />
              </div>
                <p className="text-gray-500 text-lg max-w-2xl leading-relaxed">{project?.goal}</p>
              </div>
              <button
                onClick={() => {
                  setEditTitle(project?.title || '');
                  setEditGoal(project?.goal || '');
                  setIsEditingProject(true);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-600 text-sm px-2 py-1 rounded hover:bg-blue-50"
                title="Edit project details"
              >
                &#9998;
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          {isFailed && activeRunId && (
            <button
              onClick={() => retryRun.mutate(activeRunId)}
              disabled={retryRun.isPending}
              className="bg-orange-600 text-white px-6 py-3 rounded-2xl font-bold shadow-sm hover:shadow hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 w-full md:w-auto"
            >
              {retryRun.isPending ? 'Retrying...' : 'Retry Failed Stage'}
            </button>
          )}
          <button
            onClick={() => {
              if (selectedModelIds.length > 0) {
                // Start the run and close the selector
                startRun.mutate({ projectId, modelIds: selectedModelIds, searchProvider: searchProvider || undefined, loopMode, checkpointStages });
                setShowModelSelector(false);
              } else {
                // Show the model selector
                setShowModelSelector(true);
              }
            }}
            disabled={startRun.isPending || isRunInProgress}
            className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold shadow-sm hover:shadow hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 w-full md:w-auto"
          >
            {isRunInProgress ? 'Run In Progress...' : startRun.isPending ? 'Starting...' : selectedModelIds.length > 0 ? `Start with ${selectedModelIds.length} Model${selectedModelIds.length > 1 ? 's' : ''}` : showModelSelector ? 'Cancel' : 'Start New Run'}
          </button>
        </div>
      </header>

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-blue-50/50 border border-blue-100 p-6 rounded-3xl">
          <p className="text-xs font-extrabold text-blue-400 uppercase tracking-widest mb-1">Claims</p>
          <p className="text-4xl font-black text-blue-700">{claims.length}</p>
        </div>
        <div className="bg-green-50/50 border border-green-100 p-6 rounded-3xl">
          <p className="text-xs font-extrabold text-green-400 uppercase tracking-widest mb-1">Evidence</p>
          <p className="text-4xl font-black text-green-700">{evidence.length}</p>
        </div>
        <div className="bg-purple-50/50 border border-purple-100 p-6 rounded-3xl">
          <p className="text-xs font-extrabold text-purple-400 uppercase tracking-widest mb-1">Latest Decision</p>
          <p className="text-2xl md:text-3xl font-black text-purple-700 capitalize break-words">{latestDecision ? latestDecision.decisionStatus.replace(/_/g, ' ') : '—'}</p>
        </div>
        <div className="bg-yellow-50/50 border border-yellow-100 p-6 rounded-3xl">
          <p className="text-xs font-extrabold text-yellow-400 uppercase tracking-widest mb-1">Idea Status</p>
          <p className="text-2xl md:text-3xl font-black text-yellow-700 capitalize break-words">{version?.status ? version.status.replace(/_/g, ' ') : project?.status}</p>
        </div>
      </div>

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

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
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
              <div className="grid grid-cols-3 gap-4">
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
                <div className="grid grid-cols-3 gap-4">
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
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-700">Run Timeline</h2>
                {isRunLive && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                )}
              </div>
              {activeRunId && (
                <span className="text-[10px] font-mono text-gray-300 select-all" title={activeRunId}>{activeRunId.slice(0, 8)}</span>
              )}
            </div>
            <div className="h-[520px] overflow-y-auto scroll-smooth">
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                    <span className="text-gray-300 text-xl">&#9654;</span>
                  </div>
                  <p className="text-sm text-gray-400 font-medium">No active run</p>
                  <p className="text-xs text-gray-300 mt-1">Start a run to see live progress here</p>
                </div>
              ) : (
                <div className="px-4 py-3">
                  {events.map((e, i) => {
                    const meta = getEventIcon(e.type);
                    const label = phaseLabels[e.type] || (e.type === 'run.started' ? 'Run Started' : e.type);
                    const desc = getEventDescription(e);
                    const isFailed = e.type?.endsWith('.failed') || e.type === 'run.failed' || e.type === 'error';
                    const isLast = i === events.length - 1;

                    return (
                      <div
                        key={i}
                        className={`animate-fade-slide-in flex gap-3 ${i < events.length - 1 ? 'pb-1' : ''}`}
                        style={{ animationDelay: isLast ? '0ms' : '0ms' }}
                      >
                        <div className="flex flex-col items-center">
                          <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs ${isFailed ? 'bg-red-50' : e.type?.endsWith('.completed') || e.type === 'run.completed' ? 'bg-emerald-50' : e.type?.endsWith('.started') ? 'bg-sky-50' : 'bg-gray-50'} ${meta.color}`}>
                            {meta.icon}
                          </div>
                          {i < events.length - 1 && (
                            <div className="w-px flex-1 bg-gray-100 my-1"></div>
                          )}
                        </div>
                        <div className={`flex-1 min-w-0 pb-3 ${isLast ? '' : ''}`}>
                          <div className="flex items-baseline gap-2">
                            <p className={`text-sm font-medium leading-tight ${isFailed ? 'text-red-600' : 'text-gray-800'}`}>
                              {label}
                            </p>
                          </div>
                          {desc && (
                            <p className={`text-xs mt-0.5 leading-relaxed ${isFailed ? 'text-red-400' : 'text-gray-400'}`}>
                              {desc}
                            </p>
                          )}
                          <p className="text-[10px] text-gray-300 mt-1 tabular-nums">
                            {formatTime(e.createdAt || e.payload?.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {isRunLive && (
                    <div className="flex items-center gap-2 pl-10 pt-1">
                      <div className="flex gap-1">
                        <span className="w-1 h-1 rounded-full bg-gray-300 animate-pulse-soft" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1 h-1 rounded-full bg-gray-300 animate-pulse-soft" style={{ animationDelay: '300ms' }}></span>
                        <span className="w-1 h-1 rounded-full bg-gray-300 animate-pulse-soft" style={{ animationDelay: '600ms' }}></span>
                      </div>
                      <span className="text-[10px] text-gray-300 animate-pulse-soft">waiting for next event</span>
                    </div>
                  )}
                  <div ref={timelineEndRef} />
                </div>
              )}
            </div>
          </div>

          <nav className="flex flex-col space-y-1">
            <Link href={`/projects/${projectId}/timeline`} className="p-3 hover:bg-white hover:shadow-sm rounded border border-transparent hover:border-gray-200 transition-all text-sm font-medium">Deliberation Timeline</Link>
            <Link href={`/projects/${projectId}/evidence`} className="p-3 hover:bg-white hover:shadow-sm rounded border border-transparent hover:border-gray-200 transition-all text-sm font-medium">Evidence Commons</Link>
            <Link href={`/projects/${projectId}/ideas`} className="p-3 hover:bg-white hover:shadow-sm rounded border border-transparent hover:border-gray-200 transition-all text-sm font-medium">Idea Evolution</Link>
            <Link href={`/projects/${projectId}/decisions`} className="p-3 hover:bg-white hover:shadow-sm rounded border border-transparent hover:border-gray-200 transition-all text-sm font-medium">Decision Ledger</Link>
            <Link href={`/projects/${projectId}/hypotheses`} className="p-3 hover:bg-white hover:shadow-sm rounded border border-transparent hover:border-gray-200 transition-all text-sm font-medium">Hypotheses</Link>
            <Link href={`/projects/${projectId}/tasks`} className="p-3 hover:bg-white hover:shadow-sm rounded border border-transparent hover:border-gray-200 transition-all text-sm font-medium">Research Tasks</Link>
            <Link href={`/projects/${projectId}/graph`} className="p-3 hover:bg-white hover:shadow-sm rounded border border-transparent hover:border-gray-200 transition-all text-sm font-medium">Citation Graph</Link>
            <Link href={`/projects/${projectId}/runs/compare`} className="p-3 hover:bg-white hover:shadow-sm rounded border border-transparent hover:border-gray-200 transition-all text-sm font-medium">Compare Runs</Link>
            <Link href={`/projects/${projectId}/literature-reviews`} className="p-3 hover:bg-white hover:shadow-sm rounded border border-transparent hover:border-gray-200 transition-all text-sm font-medium">Literature Reviews</Link>
            <Link href="/settings/evaluation-criteria" className="p-3 hover:bg-white hover:shadow-sm rounded border border-transparent hover:border-gray-200 transition-all text-sm font-medium">Evaluation Criteria</Link>
          </nav>
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

'use client';

import { useParams } from "next/navigation";
import Link from "next/link";
import { useProject, useLatestRun, useRetryRun, useRunModelCalls } from "@/hooks/useApi";
import { useState, useEffect, useRef } from "react";
import { API_BASE } from "@/lib/apiFetch";
import { useRunEvents } from "@/hooks/useRunEvents";
import FeedbackButton from "@/components/FeedbackButton";
import { useInspectorStore } from "@/store/inspectorStore";

const STAGE_ORDER = [
  'extraction', 'discovery', 'assessment', 'gap_detection',
  'review', 'critique', 'critique_response', 'revision',
  'goal_evaluation', 'consensus', 'decision'
] as const;

const STAGE_LABELS: Record<string, string> = {
  extraction: 'Claim Extraction', discovery: 'Evidence Discovery',
  assessment: 'Evidence Assessment', gap_detection: 'Gap Detection',
  review: 'Model Review', critique: 'Cross-Critique',
  critique_response: 'Critique Response', revision: 'Idea Revision',
  goal_evaluation: 'Goal Evaluation', consensus: 'Consensus', decision: 'Decision',
};

const STAGE_ICONS: Record<string, string> = {
  extraction: '\u{1F50D}', discovery: '\u{1F4E1}', assessment: '\u2696\uFE0F',
  gap_detection: '\u{1F573}\uFE0F', review: '\u{1F4DD}', critique: '\u2694\uFE0F',
  critique_response: '\u{1F4AC}', revision: '\u2702\uFE0F',
  goal_evaluation: '\u{1F3AF}', consensus: '\u{1F91D}', decision: '\u2705',
};

const phaseLabels: Record<string, string> = {
  'run.started': 'Run Started', 'run.completed': 'Run Completed',
  'run.failed': 'Run Failed', 'run.cancelled': 'Run Cancelled',
  'run.retried': 'Run Retried', 'run.paused': 'Run Paused', 'run.resumed': 'Run Resumed',
  'goal_loop.iteration_started': 'Iteration Started',
  'goal_loop.iteration_completed': 'Iteration Completed',
  'goal_loop.completed': 'Pipeline Completed',
  'goal_loop.stage_started': 'Stage Started',
  'goal_loop.stage_completed': 'Stage Completed',
  'goal_loop.stage_failed': 'Stage Failed',
  'goal_loop.stage_retry': 'Stage Retry', 'goal_loop.stage_recovered': 'Stage Recovered',
  'goal_loop.quality_report': 'Quality Report',
  'goal_loop.corrective_action': 'Corrective Action',
  'phase.extraction.started': 'Extracting Claims',
  'phase.extraction.completed': 'Claims Extracted',
  'phase.evidence_discovery.started': 'Searching Evidence',
  'phase.evidence_discovery.completed': 'Evidence Found',
  'phase.evidence_assessment.started': 'Assessing Evidence',
  'phase.evidence_assessment.completed': 'Evidence Assessed',
  'phase.review.started': 'Running Model Reviews',
  'phase.review.completed': 'Reviews Complete',
  'phase.critique.started': 'Cross-Critiquing',
  'phase.critique.completed': 'Critiques Complete',
  'phase.critique_response.started': 'Critique Responses',
  'phase.critique_response.completed': 'Responses Complete',
  'phase.gap_detection.started': 'Gap Detection',
  'phase.gap_detection.completed': 'Gap Analysis Done',
  'phase.goal_evaluation.started': 'Goal Evaluation',
  'phase.goal_evaluation.completed': 'Goal Evaluation Done',
  'phase.consensus.started': 'Building Consensus',
  'phase.consensus.completed': 'Consensus Reached',
  'phase.consensus.evidence_floor_failed': 'Evidence Floor Not Met',
  'critique.created': 'Critique Created', 'critique.responded': 'Critique Responded',
  'idea.version_advanced': 'Version Advanced', 'prompt.improved': 'Prompt Improved',
  'phase.revision.started': 'Idea Revision',
  'phase.revision.completed': 'Idea Revised',
  'idea.revised': 'Idea Updated',
  'phase.discovery.started': 'Evidence Discovery',
  'phase.discovery.completed': 'Evidence Discovery Done',
  'phase.assessment.started': 'Evidence Assessment',
  'phase.assessment.completed': 'Evidence Assessment Done',
};

const eventMeta: Record<string, { icon: string; color: string; bg: string }> = {
  'run.started': { icon: '\u25B6', color: 'text-emerald-600', bg: 'bg-emerald-100' },
  'run.completed': { icon: '\u2713', color: 'text-emerald-600', bg: 'bg-emerald-100' },
  'run.failed': { icon: '\u2717', color: 'text-red-600', bg: 'bg-red-100' },
  'run.cancelled': { icon: '\u25A0', color: 'text-gray-500', bg: 'bg-gray-100' },
  'run.retried': { icon: '\u21BB', color: 'text-orange-600', bg: 'bg-orange-100' },
  'run.paused': { icon: '\u23F8', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  'run.resumed': { icon: '\u25B6', color: 'text-emerald-600', bg: 'bg-emerald-100' },
};

function getMeta(type: string) {
  if (eventMeta[type]) return eventMeta[type];
  if (type.endsWith('.started')) return { icon: '\u25CB', color: 'text-sky-600', bg: 'bg-sky-100' };
  if (type.endsWith('.completed')) return { icon: '\u25CF', color: 'text-emerald-600', bg: 'bg-emerald-100' };
  if (type.endsWith('.failed') || type === 'phase.consensus.evidence_floor_failed')
    return { icon: '\u2717', color: 'text-red-600', bg: 'bg-red-100' };
  if (type.startsWith('critique')) return { icon: '\u26A1', color: 'text-purple-600', bg: 'bg-purple-100' };
  if (type.startsWith('prompt')) return { icon: '\u270E', color: 'text-violet-600', bg: 'bg-violet-100' };
  if (type.includes('corrective')) return { icon: '\u{1F527}', color: 'text-orange-600', bg: 'bg-orange-100' };
  if (type.startsWith('goal_loop')) return { icon: '\u21BB', color: 'text-violet-500', bg: 'bg-violet-50' };
  return { icon: '\u2022', color: 'text-gray-500', bg: 'bg-gray-100' };
}

function getDescription(e: any): string | null {
  const count = val(e, 'count');
  const vote = val(e, 'vote');
  const stage = val(e, 'stage');
  const iteration = val(e, 'iteration');
  const durationMs = val(e, 'durationMs');
  const score = val(e, 'score');
  const actionType = val(e, 'type');
  const actionTarget = val(e, 'target');
  const role = val(e, 'role');
  const outcome = val(e, 'outcome');
  const error = val(e, 'error');
  const gapCount = val(e, 'gapCount');
  const goalAchieved = val(e, 'goalAchieved');
  const supportedCount = val(e, 'supportedCount');
  const totalRequiring = val(e, 'totalRequiring');

  if (e.type === 'phase.extraction.completed' && count != null) return 'Extracted ' + count;
  if (e.type === 'phase.evidence_discovery.completed' && count != null) return 'Found ' + count + ' evidence';
  if (e.type === 'phase.evidence_assessment.completed' && count != null) return 'Assessed ' + count;
  if (e.type === 'phase.review.completed' && count != null) return count + ' reviews';
  if (e.type === 'phase.critique.completed' && count != null) return count + ' critiques';
  if (e.type === 'phase.critique_response.completed' && count != null) return count + ' responses';
  if (e.type === 'phase.consensus.completed' && vote) return 'Vote: ' + vote.replace(/_/g, ' ');
  if (e.type === 'phase.consensus.evidence_floor_failed') return 'Floor: ' + supportedCount + '/' + totalRequiring;
  if (e.type === 'phase.gap_detection.completed' && gapCount != null) return gapCount + ' gaps';
  if (e.type === 'phase.goal_evaluation.completed') return goalAchieved ? 'Achieved' : 'Not achieved';
  if (e.type === 'goal_loop.iteration_started' && iteration) return 'Iteration ' + iteration;
  if (e.type === 'goal_loop.iteration_completed' && durationMs) return (durationMs / 1000).toFixed(1) + 's';
  if (e.type === 'goal_loop.quality_report' && score != null) return (score * 100).toFixed(0) + '%';
  if (e.type === 'goal_loop.corrective_action' && actionType) return actionType + ': ' + actionTarget;
  if (e.type === 'prompt.improved' && role) return role + ' improved';
  if (e.type === 'goal_loop.stage_started' && stage) return stage;
  if (e.type === 'goal_loop.stage_completed' && stage) return stage + ' done';
  if (e.type === 'goal_loop.stage_failed' && stage) return stage + ' failed';
  if (e.type === 'goal_loop.stage_retry') return 'Retrying';
  if (e.type === 'goal_loop.stage_recovered') return 'Recovered';
  if (e.type === 'goal_loop.completed' && outcome) return outcome;
  if (e.type === 'run.completed' && outcome) return outcome;
  if (e.type === 'run.failed' && error) return error;
  if (e.type === 'run.started') return 'Started';
  return null;
}

function computeProgress(events: any[]) {
  const started = new Set<string>(); const completed = new Set<string>();
  for (const e of events) {
    const stage = val(e, 'stage');
    if (e.type === 'goal_loop.stage_started' && stage) started.add(stage);
    if (e.type === 'goal_loop.stage_completed' && stage) completed.add(stage);
    if (e.type === 'phase.extraction.completed') completed.add('extraction');
    if (e.type === 'phase.evidence_discovery.completed') completed.add('discovery');
    if (e.type === 'phase.evidence_assessment.completed') completed.add('assessment');
    if (e.type === 'phase.gap_detection.completed') completed.add('gap_detection');
    if (e.type === 'phase.review.completed') completed.add('review');
    if (e.type === 'phase.critique.completed') completed.add('critique');
    if (e.type === 'phase.critique_response.completed') completed.add('critique_response');
    if (e.type === 'phase.revision.completed') completed.add('revision');
    if (e.type === 'phase.goal_evaluation.completed') completed.add('goal_evaluation');
    if (e.type === 'phase.consensus.completed') completed.add('consensus');
  }
  let idx = 0;
  for (let i = 0; i < STAGE_ORDER.length; i++) {
    if (completed.has(STAGE_ORDER[i])) { idx = i + 1; continue; }
    if (started.has(STAGE_ORDER[i])) { idx = i; break; }
    break;
  }
  idx = Math.max(0, Math.min(idx, STAGE_ORDER.length - 1));
  const pct = Math.round((idx / (STAGE_ORDER.length - 1)) * 100);
  return { currentStage: STAGE_ORDER[idx], stageIndex: idx, percent: Math.min(100, pct) };
}

function val(e: any, key: string, def?: any): any {
  const p = e.payload || {};
  const v = p[key] !== undefined ? p[key] : e[key];
  return v !== undefined ? v : def;
}

function EventDetail({
  event,
  projectId,
  onInspectCritique,
  onInspectReview,
}: {
  event: any;
  projectId: string;
  onInspectCritique: (critiqueId: string) => void;
  onInspectReview: (reviewId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const vl = (key: string, def?: any) => val(event, key, def);
  const individualVotes = vl('individualVotes') || [];
  const reviews = vl('reviews') || [];

  const renderDetail = () => {
    switch (event.type) {
      case 'phase.consensus.completed':
        return (
          <div className="bg-white rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-gray-500 uppercase">Verdict:</span>
              <span className={'px-3 py-1 rounded-full text-sm font-bold ' + (vl('vote') === 'accept' || vl('vote') === 'accept_with_reservations' ? 'bg-emerald-100 text-emerald-800' : vl('vote') === 'reject' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800')}>{vl('vote', '?').replace(/_/g, ' ')}</span>
            </div>
            {individualVotes.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">Model Votes</p>
                {individualVotes.map((v: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg p-2 mb-1">
                    <span className="font-mono text-xs text-gray-400 w-20 truncate">{v.modelId?.slice(0, 8) || 'M' + (i + 1)}</span>
                    <span className={'px-2 py-0.5 rounded text-xs font-bold ' + (v.vote === 'accept' ? 'bg-green-100 text-green-800' : v.vote === 'accept_with_reservations' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800')}>{v.vote.replace(/_/g, ' ')}</span>
                    {v.confidence != null && <span className="text-xs text-gray-400">c={v.confidence}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'phase.consensus.evidence_floor_failed':
        return (
          <div className="bg-white rounded-lg border border-red-200 p-3">
            <p className="text-sm text-red-700">Evidence floor not met: {vl('supportedCount')}/{vl('totalRequiring')} claims</p>
            <div className="mt-2 w-full bg-gray-200 rounded-full h-2"><div className="bg-red-500 h-2 rounded-full" style={{ width: Math.min(100, ((vl('supportRatio', 0) || 0) / 0.5) * 100) + '%' }}></div></div>
            <p className="text-xs text-gray-500 mt-1">Threshold: 50% &ndash; current: {((vl('supportRatio', 0) || 0) * 100).toFixed(0)}%</p>
          </div>
        );
      case 'phase.review.completed':
        return reviews.length > 0 ? (
          <div className="bg-white rounded-lg border p-3 space-y-2">
            {reviews.map((r: { reviewId: string; modelId?: string; verdict?: string; confidence?: number }, i: number) => (
              <div key={r.reviewId || i} className="flex flex-wrap items-center gap-2 text-sm bg-gray-50 rounded-lg p-2">
                <span className="font-mono text-xs text-gray-400 truncate max-w-[8rem]">{r.modelId?.slice(0, 8) || 'Model'}</span>
                {r.verdict && <span className="px-2 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-800">{r.verdict.replace(/_/g, ' ')}</span>}
                {r.confidence != null && <span className="text-xs text-gray-400">c={r.confidence}</span>}
                {r.reviewId && (
                  <>
                    <button
                      type="button"
                      onClick={() => onInspectReview(r.reviewId)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Inspect review
                    </button>
                    <FeedbackButton projectId={projectId} targetType="model_review" targetId={r.reviewId} />
                  </>
                )}
              </div>
            ))}
          </div>
        ) : null;
      case 'critique.created':
        return (
          <div className="bg-white rounded-lg border p-3 space-y-2">
            <span className={'inline-block px-2 py-0.5 rounded text-xs font-bold mb-1 ' + (vl('severity') === 'high' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800')}>{vl('severity', 'medium')}</span>
            <p className="text-sm text-gray-700">{vl('text')}</p>
            {vl('whyItMatters') && <p className="text-xs text-gray-500 mt-1">{vl('whyItMatters')}</p>}
            {vl('critiqueId') && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onInspectCritique(vl('critiqueId'))}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Inspect critique
                </button>
                <FeedbackButton projectId={projectId} targetType="critique" targetId={vl('critiqueId')} />
              </div>
            )}
          </div>
        );
      case 'goal_loop.quality_report':
        return (
          <div className="bg-white rounded-lg border p-3">
            <p className="text-sm">Score: <span className="font-bold">{(vl('score', 0) * 100).toFixed(0)}%</span></p>
            <p className="text-xs text-gray-500">Issues: {vl('issueCount', 0)}</p>
          </div>
        );
      case 'goal_loop.corrective_action':
        return (
          <div className="bg-white rounded-lg border p-3">
            <span className={'inline-block px-2 py-0.5 rounded text-xs font-bold ' + (vl('priority') === 'critical' ? 'bg-red-100 text-red-800' : vl('priority') === 'high' ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800')}>{vl('type')}</span>
            <p className="text-sm mt-1">Target: <span className="font-mono text-xs">{vl('target')}</span></p>
            <p className="text-xs text-gray-500">{vl('reason')}</p>
          </div>
        );
      default: {
        const raw = vl('__raw') || event.payload;
        if (raw && Object.keys(raw).length > 0) {
          return <pre className="text-xs text-gray-500 bg-white p-3 rounded border overflow-auto max-h-40">{JSON.stringify(raw, null, 2)}</pre>;
        }
        return null;
      }
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-4 hover:bg-gray-50">
        <div className="flex items-center gap-4 min-w-0">
          <div className={'w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ' + getMeta(event.type).bg + ' ' + getMeta(event.type).color}>{getMeta(event.type).icon}</div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{phaseLabels[event.type] || event.type}</p>
            {getDescription(event) && <p className="text-xs text-gray-500 mt-0.5">{getDescription(event)}</p>}
          </div>
        </div>
        <span className="text-xs text-gray-400 shrink-0">{event.createdAt ? new Date(event.createdAt).toLocaleTimeString() : ''}</span>
      </button>
      {expanded && <div className="border-t border-gray-100 bg-gray-50 p-4">{renderDetail()}</div>}
    </div>
  );
}

function TranscriptEntry({ event }: { event: any }) {
  return (
    <div className="flex gap-2 text-xs py-1.5 px-2 hover:bg-gray-50 rounded font-mono">
      <span className="text-gray-300 w-16 shrink-0">{event.createdAt ? new Date(event.createdAt).toLocaleTimeString() : ''}</span>
      <span className={'w-4 shrink-0 ' + getMeta(event.type).color}>{getMeta(event.type).icon}</span>
      <span className="text-gray-700 truncate">{phaseLabels[event.type] || event.type}</span>
    </div>
  );
}

export default function TimelinePage() {
  const { projectId } = useParams() as { projectId: string };
  const { data: projectData, isLoading } = useProject(projectId);
  const { data: latestRun } = useLatestRun(projectId);
  const retryRun = useRetryRun();

  const openInspector = useInspectorStore((s) => s.openInspector);
  const [activeModelCall, setActiveModelCall] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'timeline' | 'transcript' | 'calls'>('timeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const timelineEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (latestRun?.runId && !activeRunId) {
      setActiveRunId(latestRun.runId);
    }
  }, [latestRun, activeRunId]);

  const initialRunEvents = (latestRun?.events || []).map((e: any) => ({
    id: e.id || crypto.randomUUID(),
    type: e.type,
    payload: e.payload ?? e,
    createdAt: e.createdAt || new Date().toISOString(),
  }));

  const { events } = useRunEvents(activeRunId, initialRunEvents);

  const terminalTypes = new Set(['run.completed', 'run.failed', 'run.cancelled']);
  const runIsTerminal = events.some((e) => terminalTypes.has(e.type));
  const { data: modelCallsData } = useRunModelCalls(activeRunId, runIsTerminal);
  const modelCalls = modelCallsData?.data || [];

  useEffect(() => { timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [events]);

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (projectData?.error) return null;

  const project = projectData?.data?.project;
  const decisions = project?.decisions || [];
  const claims = project?.claims || [];
  const evidence = project?.evidence || [];
  const isLive = events.length > 0 && !events.some(e => ['run.completed', 'run.failed', 'run.cancelled'].includes(e.type));
  const isRunFailed = events.some(e => e.type === 'run.failed');
  const lastPause = events.filter(e => e.type === 'run.paused').pop();
  const lastResume = events.filter(e => e.type === 'run.resumed').pop();
  const isPaused = !!lastPause && (!lastResume || (lastPause.createdAt ?? '') > (lastResume.createdAt ?? ''));
  const progress = computeProgress(events);

  // Filter: skip redundant goal_loop.stage_* events when phase.* events exist
  const importantPhaseTypes = new Set([
    'phase.extraction.started', 'phase.extraction.completed',
    'phase.evidence_discovery.started', 'phase.evidence_discovery.completed',
    'phase.evidence_assessment.started', 'phase.evidence_assessment.completed',
    'phase.gap_detection.started', 'phase.gap_detection.completed',
    'phase.review.started', 'phase.review.completed',
    'phase.critique.started', 'phase.critique.completed',
    'phase.critique_response.started', 'phase.critique_response.completed',
    'phase.revision.started', 'phase.revision.completed',
    'phase.goal_evaluation.started', 'phase.goal_evaluation.completed',
    'phase.consensus.started', 'phase.consensus.completed',
    'phase.consensus.evidence_floor_failed',
    'critique.created', 'critique.responded',
    'idea.version_advanced', 'prompt.improved',
    'goal_loop.iteration_started', 'goal_loop.iteration_completed',
    'goal_loop.quality_report', 'goal_loop.corrective_action',
    'goal_loop.completed',
    'run.started', 'run.completed', 'run.failed', 'run.cancelled', 'run.retried', 'run.paused', 'run.resumed',
  ]);
  const displayEvents = events.filter(e => importantPhaseTypes.has(e.type) || e.type.startsWith('run.'));
  const filteredEvents = searchQuery
    ? displayEvents.filter(e => {
        const q = searchQuery.toLowerCase();
        return (phaseLabels[e.type] || e.type).toLowerCase().includes(q) || (getDescription(e) || '').toLowerCase().includes(q) || JSON.stringify(e.payload || '').toLowerCase().includes(q);
      })
    : displayEvents;

  const qualityReports = events.filter(e => e.type === 'goal_loop.quality_report');
  const avgQuality = qualityReports.length > 0 ? qualityReports.reduce((s, e) => s + val(e, 'score', 0), 0) / qualityReports.length : null;

  const handlePause = async () => {
    if (!activeRunId) return;
    setError(null);
    const t = localStorage.getItem('auth_token');
    const res = await fetch(`${API_BASE}/runs/${activeRunId}/pause`, { method: 'POST', headers: { Authorization: 'Bearer ' + t } });
    if (!res.ok) setError('Pause failed: ' + ((await res.json()).error || 'unknown'));
  };

  const handleResume = async () => {
    if (!activeRunId) return;
    setError(null);
    const t = localStorage.getItem('auth_token');
    const res = await fetch(`${API_BASE}/runs/${activeRunId}/resume`, { method: 'POST', headers: { Authorization: 'Bearer ' + t } });
    if (!res.ok) setError('Resume failed: ' + ((await res.json()).error || 'unknown'));
  };

  const handleCancel = async () => {
    if (!activeRunId) return;
    setError(null);
    const t = localStorage.getItem('auth_token');
    const res = await fetch(`${API_BASE}/runs/${activeRunId}/cancel`, { method: 'POST', headers: { Authorization: 'Bearer ' + t } });
    if (!res.ok) setError('Cancel failed: ' + ((await res.json()).error || 'unknown'));
  };

  const handleRetry = () => {
    if (!activeRunId) return;
    setError(null);
    retryRun.mutate(activeRunId, {
      onError: (err: any) => setError(err?.message || 'Retry failed'),
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${projectId}`} className="text-blue-600 hover:underline text-sm">&larr; Dashboard</Link>
          <h1 className="text-2xl font-bold">Deliberation Timeline</h1>
          {isLive && <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full font-medium"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>Live</span>}
          {isPaused && <span className="text-xs text-yellow-600 bg-yellow-50 px-3 py-1 rounded-full font-medium">Paused</span>}
          {!isLive && !isPaused && events.length > 0 && <span className="text-xs text-blue-600 bg-blue-50 px-3 py-1 rounded-full font-medium">Complete</span>}
        </div>
        <p className="text-sm text-gray-400 truncate max-w-xs">{project?.title}</p>
      </header>

      <div className="flex gap-2 flex-wrap items-center">
        {isLive && <button onClick={handlePause} className="bg-yellow-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-yellow-600">Pause</button>}
        {isPaused && <button onClick={handleResume} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-emerald-700">Resume</button>}
        {(isRunFailed || isPaused) && <button onClick={handleRetry} disabled={retryRun.isPending} className="bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-orange-700">{retryRun.isPending ? '...' : 'Retry'}</button>}
        {isLive && <button onClick={handleCancel} className="bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-600">Cancel</button>}
        {!isLive && !isPaused && activeRunId && <button onClick={handleRetry} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700">Re-run</button>}
        {activeRunId && <span className="text-[10px] font-mono text-gray-300 ml-2">{activeRunId.slice(0, 8)}</span>}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-bold">✖</button>
        </div>
      )}

      {events.length > 0 && (
        <>
          <div className="bg-white rounded-2xl border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">{isLive ? (STAGE_LABELS[progress.currentStage] || progress.currentStage) : isPaused ? 'Paused' : 'Complete'}</span>
              <span className="text-xs font-medium text-gray-400">{progress.percent}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div className={'h-3 rounded-full transition-all duration-500 ease-out ' + (isLive ? 'bg-emerald-500' : isPaused ? 'bg-yellow-400' : 'bg-blue-500')} style={{ width: progress.percent + '%' }}></div>
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-gray-400">
              {STAGE_ORDER.map((s, i) => (
                <span key={s} className={(i <= progress.stageIndex ? 'text-gray-700 font-medium' : '') + (s === progress.currentStage && isLive ? ' text-emerald-600 font-bold' : '')}>{STAGE_ICONS[s]}</span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border p-4"><p className="text-xs font-bold text-gray-400 uppercase">Claims</p><p className="text-2xl font-black text-gray-800">{claims.length}</p></div>
            <div className="bg-white rounded-xl border p-4"><p className="text-xs font-bold text-gray-400 uppercase">Evidence</p><p className="text-2xl font-black text-gray-800">{evidence.length}</p></div>
            <div className="bg-white rounded-xl border p-4"><p className="text-xs font-bold text-gray-400 uppercase">Quality</p><p className="text-2xl font-black text-gray-800">{avgQuality != null ? (avgQuality * 100).toFixed(0) + '%' : '\u2014'}</p></div>
            <div className="bg-white rounded-xl border p-4"><p className="text-xs font-bold text-gray-400 uppercase">Decisions</p><p className="text-2xl font-black text-gray-800">{decisions.length}</p></div>
          </div>
        </>
      )}

      <div className="flex gap-1 border-b flex-wrap">
        {(['timeline', 'transcript', 'calls'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={'px-4 py-2 text-sm font-medium border-b-2 transition-colors ' + (activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700')}>
            {tab === 'timeline' ? 'Timeline' : tab === 'transcript' ? 'Transcript' : 'Model Calls' + (modelCalls.length ? ' (' + modelCalls.length + ')' : '')}
          </button>
        ))}
        {activeTab === 'transcript' && (
          <div className="ml-auto"><input type="text" placeholder="Search events..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="text-xs border rounded px-2 py-1 w-48" /></div>
        )}
      </div>

      {activeTab === 'timeline' && (
        events.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed">
            <div className="text-4xl mb-4">{'\u{1F4CB}'}</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">No events yet</h3>
            <Link href={`/projects/${projectId}`} className="text-blue-600 font-bold hover:underline">Go to Dashboard</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.map((e, i) => (
              <EventDetail
                key={e.id || i}
                event={e}
                projectId={projectId}
                onInspectCritique={(id) => openInspector('critique', id)}
                onInspectReview={(id) => openInspector('review', id)}
              />
            ))}
            {isLive && (
              <div className="flex items-center gap-2 py-4 text-gray-400">
                <div className="flex gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse"></span><span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse" style={{ animationDelay: '300ms' }}></span><span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse" style={{ animationDelay: '600ms' }}></span></div>
                <span className="text-xs">Listening...</span>
              </div>
            )}
            <div ref={timelineEndRef} />
          </div>
        )
      )}

      {activeTab === 'transcript' && (
        events.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed">
            <div className="text-4xl mb-4">{'\u{1F4DC}'}</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">No transcript</h3>
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              {filteredEvents.map((e, i) => <TranscriptEntry key={e.id || i} event={e} />)}
              <div ref={timelineEndRef} />
            </div>
          </div>
        )
      )}

      {activeTab === 'calls' && (
        modelCalls.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed">
            <div className="text-4xl mb-4">{'\u{1F4AD}'}</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">No model calls recorded</h3>
            <p className="text-sm text-gray-500">Model calls appear after a run completes.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {modelCalls.map(c => (
              <div key={c.id} className="border rounded-xl overflow-hidden bg-white">
                <button
                  onClick={() => setActiveModelCall(activeModelCall === c.id ? null : c.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className={'w-3 h-3 rounded-full ' + (c.status === 'success' ? 'bg-emerald-500' : c.status === 'failed' ? 'bg-red-500' : 'bg-gray-300')}></span>
                    <div>
                      <p className="font-medium text-sm">{c.model || c.provider}</p>
                      <p className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleTimeString()} — {c.status}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">{activeModelCall === c.id ? '\u25B2' : '\u25BC'}</span>
                </button>
                {activeModelCall === c.id && (
                  <div className="border-t bg-gray-50 p-4 space-y-4 max-h-[600px] overflow-y-auto">
                    {(c.messages || []).map((m: any, i: number) => (
                      <div key={i} className="bg-white rounded-lg border p-3">
                        <p className="text-xs font-bold text-gray-500 uppercase mb-1">{m.role}</p>
                        <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{m.content}</pre>
                      </div>
                    ))}
                    {c.responseText && (
                      <div className="bg-white rounded-lg border p-3">
                        <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Response</p>
                        <div className="prose prose-sm max-w-none text-gray-700">
                          {c.responseText.split('\n').map((line: string, i: number) => (
                            <p key={i} className="text-xs mb-1">{line}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {c.responseJson != null && (
                      <div className="bg-white rounded-lg border p-3">
                        <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Response (JSON)</p>
                        <pre className="text-xs text-gray-700 overflow-auto max-h-60">{JSON.stringify(c.responseJson, null, 2)}</pre>
                      </div>
                    )}
                    {c.usage != null && (
                      <div className="bg-gray-100 rounded-lg px-3 py-2 text-xs text-gray-500">
                        Tokens: {JSON.stringify(c.usage)}
                      </div>
                    )}
                    {c.error && (
                      <div className="bg-red-50 rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600">
                        Error: {c.error}
                      </div>
                    )}
                    {c.contextManifest && (
                      <div className="bg-white rounded-lg border p-3">
                        <p className="text-xs font-bold text-violet-600 uppercase mb-1">Context Manifest</p>
                        <p className="text-xs text-gray-600">Claims: {(c.contextManifest.includedClaims || []).length} · Evidence: {(c.contextManifest.includedEvidence || []).length}</p>
                        {c.contextManifest.retrievalReason && (
                          <pre className="text-xs text-gray-500 mt-2 overflow-auto max-h-32">{JSON.stringify(c.contextManifest.retrievalReason, null, 2)}</pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

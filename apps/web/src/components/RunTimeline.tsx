'use client';

import { useRef, useEffect } from 'react';
import { phaseLabels } from '@/lib/eventLabels';

interface TimelineEvent {
  id: string;
  type: string;
  payload?: any;
  createdAt?: string;
}

interface RunTimelineProps {
  events: TimelineEvent[];
  activeRunId: string | null;
  isRunLive: boolean;
}

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

function getEventIcon(type: string): { icon: string; color: string } {
  if (eventMeta[type]) return eventMeta[type];
  if (type.endsWith('.started')) return { icon: '\u25CB', color: 'text-sky-500' };
  if (type.endsWith('.completed')) return { icon: '\u25CF', color: 'text-emerald-500' };
  if (type.endsWith('.failed')) return { icon: '\u2718', color: 'text-red-500' };
  return { icon: '\u2022', color: 'text-gray-400' };
}

function getEventDescription(e: TimelineEvent): string | null {
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
  if (e.type === 'critique.created') return 'New critique raised';
  if (e.type === 'critique.responded' && p.verdict) return `Critique ${p.verdict}`;
  if (e.type === 'review.context_requested') return 'Model requested additional context';
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
}

function formatTime(ts: string | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function RunTimeline({ events, activeRunId, isRunLive }: RunTimelineProps) {
  const timelineEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
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
          <span className="text-[10px] font-mono text-gray-300 select-all" title={activeRunId}>
            {activeRunId.slice(0, 8)}
          </span>
        )}
      </div>
      <div className="h-[520px] overflow-y-auto scroll-smooth">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
              <span className="text-gray-300 text-xl">{'\u25B6'}</span>
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
              const isFailedEvent = e.type?.endsWith('.failed') || e.type === 'run.failed' || e.type === 'error';
              const isLast = i === events.length - 1;

              return (
                <div
                  key={i}
                  className={`animate-fade-slide-in flex gap-3 ${i < events.length - 1 ? 'pb-1' : ''}`}
                >
                  <div className="flex flex-col items-center">
                    <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs ${
                      isFailedEvent ? 'bg-red-50' : e.type?.endsWith('.completed') || e.type === 'run.completed' ? 'bg-emerald-50' : e.type?.endsWith('.started') ? 'bg-sky-50' : 'bg-gray-50'
                    } ${meta.color}`}>
                      {meta.icon}
                    </div>
                    {i < events.length - 1 && <div className="w-px flex-1 bg-gray-100 my-1"></div>}
                  </div>
                  <div className="flex-1 min-w-0 pb-3">
                    <div className="flex items-baseline gap-2">
                      <p className={`text-sm font-medium leading-tight ${isFailedEvent ? 'text-red-600' : 'text-gray-800'}`}>
                        {label}
                      </p>
                    </div>
                    {desc && (
                      <p className={`text-xs mt-0.5 leading-relaxed ${isFailedEvent ? 'text-red-400' : 'text-gray-400'}`}>
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
  );
}

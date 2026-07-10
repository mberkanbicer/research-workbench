'use client';

import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRunComparison, useLatestRun } from '@/hooks/useApi';
import { useState, useEffect } from 'react';
import type { RunComparisonData } from '@/lib/types';

function RunComparison() {
  const { projectId } = useParams() as { projectId: string };
  const searchParams = useSearchParams();
  const { data: latestRun } = useLatestRun(projectId);

  const [run1Id, setRun1Id] = useState(searchParams.get('run1') || '');
  const [run2Id, setRun2Id] = useState(searchParams.get('run2') || '');
  const [runIds, setRunIds] = useState<string[]>([]);

  // Collect all known run IDs from events
  useEffect(() => {
    if (latestRun?.data?.runId) {
      const runId = latestRun.data.runId;
      setRunIds(prev => prev.includes(runId) ? prev : [...prev, runId]);
    }
  }, [latestRun]);

  const { data: comparison, isLoading } = useRunComparison(projectId, run1Id, run2Id);
  const comparisonData = comparison?.data as RunComparisonData | undefined;

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const winner = (a: number, b: number, higher: boolean = true) =>
    a > b ? 'text-green-600' : a < b ? 'text-red-600' : 'text-gray-600';

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-6">
        <Link href={`/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-700">← Back to Dashboard</Link>
        <h1 className="text-2xl font-bold mt-1">Run Comparison</h1>
      </div>

      {/* Run Selectors */}
      <div className="flex gap-4 mb-8">
        <div className="flex-1">
          <label className="text-sm font-medium text-gray-700 block mb-1">Run 1</label>
          <select value={run1Id} onChange={e => setRun1Id(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm">
            <option value="">Select run...</option>
            {runIds.map(id => <option key={id} value={id}>{id.substring(0, 8)}...</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium text-gray-700 block mb-1">Run 2</label>
          <select value={run2Id} onChange={e => setRun2Id(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm">
            <option value="">Select run...</option>
            {runIds.map(id => <option key={id} value={id}>{id.substring(0, 8)}...</option>)}
          </select>
        </div>
      </div>

      {!run1Id || !run2Id ? (
        <div className="text-center py-12 text-gray-400">Select two runs to compare</div>
      ) : isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading comparison...</div>
      ) : comparisonData ? (
        <div className="space-y-6">
          {/* Configuration Comparison */}
          <div className="border rounded-lg bg-white p-6">
            <h2 className="font-semibold mb-4">Configuration</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-gray-500">Setting</div>
              <div className="font-medium">Run 1</div>
              <div className="font-medium">Run 2</div>
              {['loopMode', 'maxRounds', 'searchProvider'].map(key => (
                <React.Fragment key={key}>
                  <div className="text-gray-500">{key}</div>
                  <div>{String(comparisonData.run1.config?.[key] || 'N/A')}</div>
                  <div>{String(comparisonData.run2.config?.[key] || 'N/A')}</div>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Metrics Comparison */}
          <div className="border rounded-lg bg-white p-6">
            <h2 className="font-semibold mb-4">Metrics</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-gray-500">Metric</div>
              <div className="font-medium">Run 1</div>
              <div className="font-medium">Run 2</div>
              {[
                ['Duration', formatDuration(comparisonData.run1.metrics.durationMs), formatDuration(comparisonData.run2.metrics.durationMs)],
                ['Iterations', comparisonData.run1.metrics.iterationCount, comparisonData.run2.metrics.iterationCount],
                ['Phases Completed', comparisonData.run1.metrics.completedPhases, comparisonData.run2.metrics.completedPhases],
                ['Phases Failed', comparisonData.run1.metrics.failedPhases, comparisonData.run2.metrics.failedPhases],
                ['Stages Completed', comparisonData.run1.metrics.stagesCompleted, comparisonData.run2.metrics.stagesCompleted],
              ].map(([label, v1, v2]) => (
                <React.Fragment key={label}>
                  <div className="text-gray-500">{label}</div>
                  <div>{String(v1)}</div>
                  <div>{String(v2)}</div>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Claims Comparison */}
          <div className="border rounded-lg bg-white p-6">
            <h2 className="font-semibold mb-4">Claims</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-gray-500">Metric</div>
              <div className="font-medium">Run 1</div>
              <div className="font-medium">Run 2</div>
              {[
                ['Total', comparisonData.run1.claims.total, comparisonData.run2.claims.total],
                ['Supported', comparisonData.run1.claims.supported, comparisonData.run2.claims.supported],
                ['Contradicted', comparisonData.run1.claims.contradicted, comparisonData.run2.claims.contradicted],
                ['Unverified', comparisonData.run1.claims.unverified, comparisonData.run2.claims.unverified],
              ].map(([label, v1, v2]) => (
                <React.Fragment key={label}>
                  <div className="text-gray-500">{label}</div>
                  <div className={winner(v1 as number, v2 as number)}>{String(v1)}</div>
                  <div className={winner(v2 as number, v1 as number)}>{String(v2)}</div>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Evidence Comparison */}
          <div className="border rounded-lg bg-white p-6">
            <h2 className="font-semibold mb-4">Evidence</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-gray-500">Metric</div>
              <div className="font-medium">Run 1</div>
              <div className="font-medium">Run 2</div>
              {[
                ['Total', comparisonData.run1.evidence.total, comparisonData.run2.evidence.total],
                ['Accepted', comparisonData.run1.evidence.accepted, comparisonData.run2.evidence.accepted],
                ['Rejected', comparisonData.run1.evidence.rejected, comparisonData.run2.evidence.rejected],
                ['Counter', comparisonData.run1.evidence.counter, comparisonData.run2.evidence.counter],
              ].map(([label, v1, v2]) => (
                <React.Fragment key={label}>
                  <div className="text-gray-500">{label}</div>
                  <div className={winner(v1 as number, v2 as number)}>{String(v1)}</div>
                  <div className={winner(v2 as number, v1 as number)}>{String(v2)}</div>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Decision Comparison */}
          <div className="border rounded-lg bg-white p-6">
            <h2 className="font-semibold mb-4">Decision</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-gray-500">Metric</div>
              <div className="font-medium">Run 1</div>
              <div className="font-medium">Run 2</div>
              <div className="text-gray-500">Vote</div>
              <div>{comparisonData.run1.decision.vote || 'N/A'}</div>
              <div>{comparisonData.run2.decision.vote || 'N/A'}</div>
              <div className="text-gray-500">Status</div>
              <div>{comparisonData.run1.decision.decisionStatus || 'N/A'}</div>
              <div>{comparisonData.run2.decision.decisionStatus || 'N/A'}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">No comparison data available</div>
      )}
    </div>
  );
}

// Need React import for fragments
import React from 'react';

export default RunComparison;

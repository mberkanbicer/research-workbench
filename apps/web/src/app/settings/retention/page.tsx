'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';

export default function RetentionSettingsPage() {
  const queryClient = useQueryClient();
  const [retentionDays, setRetentionDays] = useState(90);
  const [dryRun, setDryRun] = useState(true);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['retentionStats'],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/settings/retention/stats`);
      return await res.json();
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`${API_BASE}/settings/retention/cleanup`, {
        method: 'POST',
        body: JSON.stringify({ days: retentionDays, dryRun }),
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retentionStats'] });
    },
  });

  const data = stats?.data;

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">Data Retention Settings</h1>
      <p className="text-gray-500 text-sm mb-6">
        Configure how long run events, model calls, and other temporary data are retained.
      </p>

      {/* Current Stats */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="font-semibold mb-4">Current Data Volume</h2>
        {statsLoading ? (
          <p className="text-gray-500">Loading stats...</p>
        ) : data ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{data.runEvents?.toLocaleString() || 0}</div>
              <div className="text-xs text-gray-500">Run Events</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{data.modelCalls?.toLocaleString() || 0}</div>
              <div className="text-xs text-gray-500">Model Calls</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{data.contextManifests?.toLocaleString() || 0}</div>
              <div className="text-xs text-gray-500">Context Manifests</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{data.runStages?.toLocaleString() || 0}</div>
              <div className="text-xs text-gray-500">Run Stages</div>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">No data available</p>
        )}
      </div>

      {/* Cleanup Controls */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="font-semibold mb-4">Cleanup Configuration</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Retention Period (days)
            </label>
            <input
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(parseInt(e.target.value) || 90)}
              min={7}
              max={365}
              className="w-32 border rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Data older than {retentionDays} days will be eligible for cleanup.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="dryRun"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="dryRun" className="text-sm text-gray-700">
              Dry run (preview what would be deleted without actually deleting)
            </label>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => cleanupMutation.mutate()}
              disabled={cleanupMutation.isPending}
              className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${
                dryRun
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              {cleanupMutation.isPending
                ? 'Running...'
                : dryRun
                ? 'Preview Cleanup'
                : 'Run Cleanup'}
            </button>
          </div>

          {cleanupMutation.data && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm">
              <h3 className="font-medium mb-2">
                {dryRun ? 'Preview Results' : 'Cleanup Results'}
              </h3>
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(cleanupMutation.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <h3 className="font-medium mb-1">About Data Retention</h3>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Run Events, Model Calls, Context Manifests, and Run Stages are cleaned up based on their creation date.</li>
          <li>Core data (projects, claims, evidence, critiques, decisions) is never auto-deleted.</li>
          <li>You can also run cleanup via the CLI: <code className="bg-blue-100 px-1 rounded">./scripts/cleanup-old-data.sh --days=90</code></li>
          <li>Consider scheduling cleanup as a cron job for production use.</li>
        </ul>
      </div>
    </div>
  );
}

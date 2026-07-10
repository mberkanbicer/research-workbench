'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';
import { useState } from 'react';

interface RawEvent {
  id: string;
  projectId: string;
  type: string;
  payload: Record<string, unknown>;
  sourceIds: string[] | null;
  createdBy: string;
  hash: string;
  createdAt: string;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  'project.created': 'bg-green-100 text-green-800',
  'claim.extracted': 'bg-blue-100 text-blue-800',
  'evidence.added': 'bg-purple-100 text-purple-800',
  'run.started': 'bg-yellow-100 text-yellow-800',
  'run.completed': 'bg-green-100 text-green-800',
  'run.failed': 'bg-red-100 text-red-800',
  'decision.created': 'bg-indigo-100 text-indigo-800',
};

export default function AuditLogPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ['rawEvents', projectId, typeFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
      if (typeFilter) params.set('type', typeFilter);
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/events?${params}`);
      const json = await res.json();
      return json as { data: RawEvent[]; meta: { total: number; limit: number; offset: number } };
    },
  });

  const events = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const eventTypes = [...new Set(events.map((e) => e.type))].sort();

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-gray-500 text-sm mt-1">
            Immutable record of all project events ({total} total)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All types</option>
            {eventTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading events...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No events found. Events are recorded automatically during project operations.
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Time</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Created By</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Payload</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(event.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${EVENT_TYPE_COLORS[event.type] || 'bg-gray-100 text-gray-800'}`}>
                        {event.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{event.createdBy}</td>
                    <td className="px-4 py-3">
                      <details className="group">
                        <summary className="cursor-pointer text-blue-600 hover:text-blue-800 text-xs">
                          View payload
                        </summary>
                        <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-x-auto max-w-md">
                          {JSON.stringify(event.payload, null, 2)}
                        </pre>
                      </details>
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                      {event.hash.substring(0, 12)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Showing {page * limit + 1}-{Math.min((page + 1) * limit, total)} of {total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

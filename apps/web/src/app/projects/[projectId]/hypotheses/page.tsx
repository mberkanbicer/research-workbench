'use client';

import { useParams } from "next/navigation";
import Link from "next/link";
import { useProject, useHypotheses, useCreateHypothesis, useUpdateHypothesis, useDeleteHypothesis } from "@/hooks/useApi";
import { useState } from "react";
import Pagination from "@/components/Pagination";
import type { Hypothesis } from "@/hooks/useHypotheses";

const PAGE_SIZE = 20;

const statusColors: Record<string, string> = {
  unexamined: 'bg-gray-100 text-gray-800',
  testing: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  inconclusive: 'bg-yellow-100 text-yellow-800',
};

export default function HypothesesPage() {
  const { projectId } = useParams() as { projectId: string };
  const { data: projectData, isLoading: projectLoading } = useProject(projectId);
  const { data: hypothesesData, isLoading: hypothesesLoading } = useHypotheses(projectId);
  const createHypothesis = useCreateHypothesis(projectId);
  const updateHypothesis = useUpdateHypothesis(projectId);
  const deleteHypothesis = useDeleteHypothesis(projectId);
  const [showCreate, setShowCreate] = useState(false);
  const [newStatement, setNewStatement] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const hypotheses = (hypothesesData?.data || []) as Hypothesis[];
  const totalPages = Math.ceil(hypotheses.length / PAGE_SIZE);
  const paginatedHypotheses = hypotheses.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (projectLoading || hypothesesLoading) return <div className="p-8">Loading hypotheses...</div>;

  const handleCreate = async () => {
    if (!newStatement.trim()) return;
    await createHypothesis.mutateAsync({ statement: newStatement.trim() });
    setNewStatement('');
    setShowCreate(false);
  };

  const handleStatusChange = async (id: string, status: string) => {
    await updateHypothesis.mutateAsync({ hypothesisId: id, data: { status } });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this hypothesis?')) return;
    await deleteHypothesis.mutateAsync(id);
  };

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${projectId}`} className="text-blue-600 hover:underline text-sm">← Back to Dashboard</Link>
          <h1 className="text-2xl font-bold">Hypotheses</h1>
          <span className="text-sm text-gray-500">{hypotheses.length} total</span>
        </div>
        <button onClick={() => setShowCreate(true)} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">
          + New Hypothesis
        </button>
      </header>

      {showCreate && (
        <div className="bg-white border rounded-lg p-5 space-y-4">
          <h2 className="font-semibold text-sm text-gray-700">New Hypothesis</h2>
          <textarea
            value={newStatement}
            onChange={e => setNewStatement(e.target.value)}
            placeholder="State your hypothesis..."
            className="w-full border rounded px-3 py-2 text-sm min-h-[80px]"
          />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={createHypothesis.isPending || !newStatement.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50">
              {createHypothesis.isPending ? 'Creating...' : 'Create'}
            </button>
            <button onClick={() => { setShowCreate(false); setNewStatement(''); }}
              className="px-4 py-2 rounded text-sm font-medium text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {hypotheses.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed">
          <div className="text-4xl mb-4">🔬</div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">No hypotheses yet</h3>
          <p className="text-gray-500">Hypotheses are extracted during claim extraction or can be created manually.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paginatedHypotheses.map((h: any) => (
              <div key={h.id} className="bg-white border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm text-gray-800 flex-1">{h.statement}</p>
                  <button onClick={() => handleDelete(h.id)}
                    className="text-xs text-red-500 hover:text-red-700 shrink-0">
                    Delete
                  </button>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <select
                    value={h.status}
                    onChange={e => handleStatusChange(h.id, e.target.value)}
                    className={`text-xs font-medium px-2 py-1 rounded-full border-0 ${statusColors[h.status] || 'bg-gray-100 text-gray-800'}`}
                  >
                    <option value="unexamined">Unexamined</option>
                    <option value="testing">Testing</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="rejected">Rejected</option>
                    <option value="inconclusive">Inconclusive</option>
                  </select>
                  {h.confidence != null && (
                    <span className="text-xs text-gray-500">
                      Confidence: {(h.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    Created: {new Date(h.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
        </>
      )}
    </div>
  );
}

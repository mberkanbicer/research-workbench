'use client';

import { useParams } from "next/navigation";
import Link from "next/link";
import { useProject, useCreateIdeaVersion } from "@/hooks/useApi";
import { useState } from "react";

function CreateIdeaVersionModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [formData, setFormData] = useState({ title: '', description: '' });
  const createVersion = useCreateIdeaVersion(projectId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createVersion.mutateAsync(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        <header className="bg-gray-50 px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Evolve Idea Version</h2>
        </header>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">New Version Title</label>
            <input required className="w-full border rounded px-3 py-2 text-sm" value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Description of Changes</label>
            <textarea required rows={5} className="w-full border rounded px-3 py-2 text-sm" value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={createVersion.isPending} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50">
              {createVersion.isPending ? 'Saving...' : 'Create Version'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VersionDiff({ changes }: { changes: string[] | null }) {
  if (!changes || changes.length === 0) return null;
  return (
    <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg p-4">
      <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-2">Changes from Previous Version</p>
      <ul className="space-y-1">
        {changes.map((c, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="text-blue-500 mt-0.5">→</span>
            <span className="text-blue-900">{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function IdeasPage() {
  const { projectId } = useParams() as { projectId: string };
  const { data: projectData, isLoading } = useProject(projectId);
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading) return <div className="p-8">Loading versions...</div>;
  if (projectData?.error) {
    return (
      <div className="p-8">
        <Link href={`/projects/${projectId}`} className="text-blue-600 hover:underline text-sm">← Back to Dashboard</Link>
        <div className="mt-6 bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <div className="text-4xl mb-4">⚠</div>
          <h2 className="text-lg font-bold text-red-700 mb-2">Failed to load project</h2>
          <p className="text-red-600 text-sm">The API may be unavailable or the project does not exist.</p>
        </div>
      </div>
    );
  }

  const versions = projectData?.data?.project?.ideaVersions || [];

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${projectId}`} className="text-blue-600 hover:underline text-sm">← Back to Dashboard</Link>
          <h1 className="text-2xl font-bold">Idea Evolution</h1>
        </div>
        <div className="flex gap-2">
          {versions.length >= 2 && (
            <Link href={`/projects/${projectId}/ideas/compare?v1=${versions[1]?.id}&v2=${versions[0]?.id}`}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-200">
              Compare Versions
            </Link>
          )}
          <button onClick={() => setIsOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium">Evolve Idea</button>
        </div>
      </header>

      {isOpen && <CreateIdeaVersionModal projectId={projectId} onClose={() => setIsOpen(false)} />}

      {versions.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed">
          <div className="text-4xl mb-4">💡</div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">No idea versions yet</h3>
          <p className="text-gray-500">Start a deliberation run to generate idea versions, or create one manually.</p>
        </div>
      ) : (
        <>
          {/* Version Chain */}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {versions.map((v: any, i: number) => (
              <span key={v.id} className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full font-bold ${
                  v.status === 'under_review' ? 'bg-blue-100 text-blue-700' :
                  v.status === 'accepted' ? 'bg-green-100 text-green-700' :
                  v.status === 'superseded' ? 'bg-gray-100 text-gray-500' :
                  'bg-yellow-100 text-yellow-700'
                }`}>v{v.versionNumber}</span>
                {i < versions.length - 1 && <span className="text-gray-300">→</span>}
              </span>
            ))}
          </div>

          {/* Version Cards */}
          <div className="space-y-8">
            {versions.map((v: any) => (
              <section key={v.id} className="relative pl-8 border-l-2 border-gray-200">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-500 border-4 border-white"></div>
                <div className="bg-white border rounded-lg p-6 shadow-sm">
                  <header className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-lg font-bold">v{v.versionNumber}: {v.title}</h2>
                      <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        v.status === 'under_review' ? 'bg-blue-100 text-blue-700' :
                        v.status === 'accepted' ? 'bg-green-100 text-green-700' :
                        v.status === 'superseded' ? 'bg-gray-100 text-gray-500' :
                        v.status === 'needs_revision' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{v.status?.replace(/_/g, ' ')}</span>
                    </div>
                    <span className="text-xs text-gray-400">{new Date(v.createdAt).toLocaleDateString()}</span>
                  </header>

                  <p className="text-gray-700 whitespace-pre-wrap">{v.description}</p>

                  {/* Diff View */}
                  <VersionDiff changes={v.changesFromPrevious} />

                  {/* Resolved Critiques */}
                  {v.createdBecauseOfCritiqueIds?.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                        Created in Response to Critiques ({v.createdBecauseOfCritiqueIds.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {v.createdBecauseOfCritiqueIds.map((cid: string) => (
                          <span key={cid} className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-mono">{cid.slice(0, 8)}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Status indicator */}
                  {v.status === 'superseded' && (
                    <div className="mt-4 pt-4 border-t">
                      <span className="text-xs text-gray-400 italic">This version was superseded by a newer version.</span>
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

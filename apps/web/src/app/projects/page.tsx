'use client';

import Link from "next/link";
import { useState } from "react";
import { useProjects, useDeleteProject, useArchiveProject, useExport, usePortfolio } from "@/hooks/useApi";
import { apiFetch, API_BASE } from "@/lib/apiFetch";
import type { PortfolioProjectStats } from "@/lib/types";

// Prevent static prerendering — this page uses client-side data fetching
export const dynamic = 'force-dynamic';

export default function ProjectsPage() {
  const { data, isLoading, error } = useProjects();
  const { data: portfolioData } = usePortfolio();
  const deleteProject = useDeleteProject();
  const archiveProject = useArchiveProject();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-600">Error loading projects</div>;

  const projects = data?.data || [];

  const handleDelete = (id: string, title: string) => {
    if (window.confirm(`Are you sure you want to permanently delete the project "${title}" and all its related data? This cannot be undone.`)) {
      setActionLoading(id);
      deleteProject.mutate(id, { onSettled: () => setActionLoading(null) });
    }
  };

  const handleArchive = (id: string, title: string) => {
    if (window.confirm(`Archive the project "${title}"? It will be hidden from the active list.`)) {
      setActionLoading(id);
      archiveProject.mutate(id, { onSettled: () => setActionLoading(null) });
    }
  };

  const handleExport = (projectId: string, format: 'json' | 'markdown') => {
    setActionLoading(`export-${projectId}`);
    const ext = format === 'json' ? 'json' : 'md';
    apiFetch(`${API_BASE}/projects/${projectId}/export/${format}`)
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `project-${projectId}.${ext}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      })
      .catch(err => console.error('Export failed:', err))
      .finally(() => setActionLoading(null));
  };

  const isBusy = (id: string) => actionLoading === id || actionLoading === `export-${id}`;

  return (
    <div className="py-6">
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-3xl font-extrabold text-black">Research Projects</h1>
          <p className="text-gray-500 mt-2">Manage your ongoing and completed research.</p>
        </div>
        <Link
          href="/projects/new"
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:shadow hover:-translate-y-0.5 transition-all"
        >
          + New Project
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {projects.length === 0 ? (
          <div className="col-span-full bg-white p-12 rounded-3xl border border-gray-100 shadow-sm text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">📝</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">No projects yet</h3>
            <p className="text-gray-500 mb-6">Create your first project to get started with evidence-grounded research.</p>
            <Link href="/projects/new" className="text-blue-600 font-bold hover:underline">Create a project →</Link>
          </div>
        ) : (
          projects.map((project: any) => (
            <div key={project.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative flex flex-col">
              <div className="mb-4 flex items-center justify-between">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  project.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${project.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                  {project.status.toUpperCase()}
                </span>
              </div>

              <h2 className="text-xl font-bold mb-3 text-black leading-tight">{project.title}</h2>
              <p className="text-gray-600 text-sm mb-4 flex-1 line-clamp-3">{project.goal}</p>

              {/* Portfolio Stats */}
              {portfolioData?.data ? (() => {
                const portfolio = portfolioData.data as PortfolioProjectStats[];
                const projectStats = portfolio.find((p) => p.id === project.id)?.stats;
                if (!projectStats) return null;
                return (
                  <div className="flex gap-3 text-xs text-gray-500 mb-4">
                    <span>{projectStats.totalClaims} claims</span>
                    <span>•</span>
                    <span>{projectStats.totalEvidence} evidence</span>
                    <span>•</span>
                    <span className={projectStats.healthScore >= 70 ? 'text-green-600' : projectStats.healthScore >= 40 ? 'text-yellow-600' : 'text-red-600'}>
                      {projectStats.healthScore}% health
                    </span>
                  </div>
                );
              })() : null}
              
              <div className="pt-4 border-t border-gray-50 mt-auto space-y-3">
                <Link href={`/projects/${project.id}`} className="block w-full text-center bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:shadow hover:-translate-y-0.5 transition-all">
                  Open Dashboard
                </Link>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleExport(project.id, 'json')}
                    disabled={isBusy(project.id)}
                    className="flex-1 text-xs font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
                    title="Export as JSON"
                  >
                    JSON
                  </button>
                  <button
                    onClick={() => handleExport(project.id, 'markdown')}
                    disabled={isBusy(project.id)}
                    className="flex-1 text-xs font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
                    title="Export as Markdown"
                  >
                    MD
                  </button>
                  {project.status === 'active' && (
                    <button
                      onClick={() => handleArchive(project.id, project.title)}
                      disabled={isBusy(project.id)}
                      className="flex-none text-xs font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
                      title="Archive project"
                    >
                      Archive
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(project.id, project.title)}
                    disabled={isBusy(project.id)}
                    className="flex-none text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
                    title="Delete project permanently"
                  >
                    {actionLoading === project.id ? '...' : '✕'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

'use client';

import { useParams } from "next/navigation";
import Link from "next/link";
import { useProject, useRunTask, useUpdateTask } from "@/hooks/useApi";
import { useState, useMemo } from "react";
import Pagination from "@/components/Pagination";
import { useToast } from "@/components/Toast";

const PAGE_SIZE = 20;

export default function TasksPage() {
  const { projectId } = useParams() as { projectId: string };
  const { data: projectData, isLoading, refetch } = useProject(projectId);
  const runTask = useRunTask();
  const updateTask = useUpdateTask();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const { addToast } = useToast();

  if (isLoading) return <div className="p-8">Loading tasks...</div>;
  if (projectData?.error) {
    return (
      <div className="p-8">
        <Link href={`/projects/${projectId}`} className="text-blue-600 hover:underline text-sm">← Back to Dashboard</Link>
        <div className="mt-6 bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <div className="text-4xl mb-4">⚠</div>
          <h2 className="text-lg font-bold text-red-700 mb-2">Failed to load tasks</h2>
          <p className="text-red-600 text-sm">The API may be unavailable or the project does not exist.</p>
        </div>
      </div>
    );
  }

  const tasks = projectData?.data?.project?.tasks || [];
  const totalPages = Math.ceil(tasks.length / PAGE_SIZE);
  const paginatedTasks = tasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleRunTask = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      await runTask.mutateAsync(taskId);
      addToast('Task started successfully', 'success');
    } catch (err) {
      addToast('Failed to start task', 'error');
    }
    setActionLoading(null);
    refetch();
  };

  const handleCancelTask = async (taskId: string) => {
    if (!window.confirm('Cancel this running task?')) return;
    setActionLoading(taskId);
    try {
      await updateTask.mutateAsync({ taskId, data: { status: 'cancelled' } });
      addToast('Task cancelled', 'success');
    } catch (err) {
      addToast('Failed to cancel task', 'error');
    }
    setActionLoading(null);
    refetch();
  };

  const handleBlockTask = async (taskId: string) => {
    if (!window.confirm('Block this task?')) return;
    setActionLoading(taskId);
    try {
      await updateTask.mutateAsync({ taskId, data: { status: 'blocked' } });
      addToast('Task blocked', 'success');
    } catch (err) {
      addToast('Failed to block task', 'error');
    }
    setActionLoading(null);
    refetch();
  };

  const editObjective = async (taskId: string) => {
    const newObjective = window.prompt('Enter new objective:');
    if (!newObjective) return;
    setActionLoading(taskId);
    try {
      await updateTask.mutateAsync({ taskId, data: { objective: newObjective } });
      addToast('Task objective updated', 'success');
    } catch (err) {
      addToast('Failed to update task', 'error');
    }
    setActionLoading(null);
    refetch();
  };

  const isBusy = (id: string) => actionLoading === id;

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center gap-4">
        <Link href={`/projects/${projectId}`} className="text-blue-600 hover:underline text-sm">← Back to Dashboard</Link>
        <h1 className="text-2xl font-bold">Research Tasks</h1>
        <span className="text-sm text-gray-500">{tasks.length} total</span>
      </header>

      {tasks.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed">
          <div className="text-4xl mb-4">📋</div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">No tasks created</h3>
          <p className="text-gray-500">Tasks are automatically created during deliberation runs. Start a run to generate tasks.</p>
          <Link href={`/projects/${projectId}`} className="mt-4 inline-block text-blue-600 font-bold hover:underline">Go to Dashboard →</Link>
        </div>
      ) : (
        <>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedTasks.map((task: any) => (
                  <tr key={task.id}>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{task.title || 'Untitled'}</p>
                      {task.objective && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{task.objective}</p>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{task.role}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        task.priority === 'critical' ? 'bg-red-100 text-red-800' :
                        task.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                        task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>{task.priority}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        task.status === 'done' ? 'bg-green-100 text-green-800' :
                        task.status === 'running' ? 'bg-sky-100 text-sky-800' :
                        task.status === 'failed' ? 'bg-red-100 text-red-800' :
                        task.status === 'blocked' ? 'bg-orange-100 text-orange-800' :
                        task.status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
                        'bg-gray-100 text-gray-800'
                      }`}>{task.status}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex gap-1.5">
                        {task.status === 'todo' && (
                          <button onClick={() => handleRunTask(task.id)} disabled={isBusy(task.id)}
                            className="text-xs font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 px-2.5 py-1.5 rounded transition-colors disabled:opacity-50">
                            {isBusy(task.id) ? '...' : 'Run'}
                          </button>
                        )}
                        {task.status === 'running' && (
                          <button onClick={() => handleCancelTask(task.id)} disabled={isBusy(task.id)}
                            className="text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 px-2.5 py-1.5 rounded transition-colors disabled:opacity-50">
                            Cancel
                          </button>
                        )}
                        <button onClick={() => editObjective(task.id)} disabled={isBusy(task.id)}
                          className="text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 px-2.5 py-1.5 rounded transition-colors disabled:opacity-50">
                          Edit
                        </button>
                        <button onClick={() => handleBlockTask(task.id)}
                          disabled={isBusy(task.id) || !['todo', 'running'].includes(task.status)}
                          className="text-xs font-medium text-orange-600 border border-orange-200 hover:bg-orange-50 px-2.5 py-1.5 rounded transition-colors disabled:opacity-50">
                          Block
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
        </>
      )}
    </div>
  );
}

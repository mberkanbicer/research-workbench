'use client';

import Link from "next/link";
import { usePromptRoles, usePromptHistory, useUpdatePrompt, useResetPrompt } from "@/hooks/useApi";
import { useState } from "react";

export default function PromptsPage() {
  const { data: rolesData, isLoading } = usePromptRoles();
  const [selectedRole, setSelectedRole] = useState<string>('');
  const { data: historyData } = usePromptHistory(selectedRole);
  const updatePrompt = useUpdatePrompt();
  const resetPrompt = useResetPrompt();
  const [editText, setEditText] = useState('');
  const [editReason, setEditReason] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const roles = (rolesData?.data as any[]) || [];
  const history = historyData?.data as any;
  const currentVersion = history?.versions?.[0];

  const handleEdit = () => {
    if (currentVersion) {
      setEditText(currentVersion.text);
      setEditReason('');
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (!selectedRole || !editText.trim()) return;
    await updatePrompt.mutateAsync({ role: selectedRole, text: editText.trim(), reason: editReason || undefined });
    setIsEditing(false);
  };

  const handleReset = async () => {
    if (!selectedRole) return;
    if (!window.confirm('Reset this prompt to default? All custom versions will be removed.')) return;
    await resetPrompt.mutateAsync(selectedRole);
    setIsEditing(false);
  };

  if (isLoading) return <div className="p-8">Loading prompts...</div>;

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center gap-4">
        <Link href="/settings" className="text-blue-600 hover:underline text-sm">← Settings</Link>
        <h1 className="text-2xl font-bold">Prompt Templates</h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Role list */}
        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-semibold text-sm text-gray-700 mb-3">Prompt Roles</h2>
          <div className="space-y-1">
            {roles.map((r: any) => (
              <button
                key={r.role}
                onClick={() => { setSelectedRole(r.role); setIsEditing(false); }}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${selectedRole === r.role ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}
              >
                <span className="block">{r.role.replace(/_/g, ' ')}</span>
                <span className="text-xs text-gray-400">
                  v{r.latestVersion} · {r.totalVersions} version{r.totalVersions !== 1 ? 's' : ''}
                  {r.hasCustomPrompt && <span className="ml-1 text-blue-500">(custom)</span>}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Prompt detail */}
        <div className="lg:col-span-2 bg-white border rounded-lg p-4">
          {!selectedRole ? (
            <div className="text-center py-12 text-gray-400">Select a role to view its prompt</div>
          ) : isEditing ? (
            <div className="space-y-4">
              <h2 className="font-semibold text-sm text-gray-700">Edit Prompt: {selectedRole.replace(/_/g, ' ')}</h2>
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm min-h-[300px] font-mono"
              />
              <input
                type="text"
                value={editReason}
                onChange={e => setEditReason(e.target.value)}
                placeholder="Reason for change (optional)"
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={updatePrompt.isPending || !editText.trim()}
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50">
                  {updatePrompt.isPending ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setIsEditing(false)}
                  className="px-4 py-2 rounded text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          ) : history ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm text-gray-700">{selectedRole.replace(/_/g, ' ')}</h2>
                <div className="flex gap-2">
                  <button onClick={handleEdit}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium">
                    Edit
                  </button>
                  {currentVersion && (
                    <button onClick={handleReset}
                      className="px-3 py-1.5 rounded text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50">
                      Reset to Default
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 rounded p-4">
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">
                  Current Prompt (v{currentVersion?.version || 1})
                </p>
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                  {currentVersion?.text || history.defaultText}
                </pre>
              </div>

              {history.versions?.length > 1 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">Version History</p>
                  <div className="space-y-2">
                    {history.versions.map((v: any) => (
                      <div key={v.version} className="bg-gray-50 rounded p-3 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">v{v.version}</span>
                          <span className="text-gray-400">{new Date(v.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="text-gray-500">{v.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import {
  useDocumentVersions,
  useCreateDocumentVersion,
  useRestoreDocumentVersion,
  useDocumentVersionCompare,
  type DocumentVersion,
  type VersionComparison,
} from '@/hooks/useCollaboration';

interface VersionHistoryProps {
  documentId: string;
  onRestore?: (content: string) => void;
}

export function VersionHistory({ documentId, onRestore }: VersionHistoryProps) {
  const { data: versions = [], isLoading } = useDocumentVersions(documentId);
  const createVersion = useCreateDocumentVersion();
  const restoreVersion = useRestoreDocumentVersion();

  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<number[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const handleSaveVersion = async () => {
    await createVersion.mutateAsync({ documentId, message: saveMessage || undefined });
    setShowSaveModal(false);
    setSaveMessage('');
  };

  const handleRestore = async (version: number) => {
    if (!confirm(`Restore to version ${version}? Current changes will be saved as a new version.`)) return;
    const result = await restoreVersion.mutateAsync({ documentId, version });
    const data = result.data as { content?: string };
    if (data?.content) {
      onRestore?.(data.content);
    }
  };

  const toggleCompareSelection = (version: number) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(version)) return prev.filter((v) => v !== version);
      if (prev.length >= 2) return [prev[1], version];
      return [...prev, version];
    });
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading version history...</div>;
  }

  return (
    <div className="border rounded-lg bg-white">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="font-medium text-sm">Version History</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setCompareMode(!compareMode);
              setSelectedForCompare([]);
            }}
            className={`text-xs px-2 py-1 rounded ${compareMode ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {compareMode ? 'Cancel' : 'Compare'}
          </button>
          <button
            onClick={() => setShowSaveModal(true)}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            + Save version
          </button>
        </div>
      </div>

      {/* Compare panel */}
      {compareMode && selectedForCompare.length === 2 && (
        <ComparePanel documentId={documentId} v1={selectedForCompare[0]} v2={selectedForCompare[1]} />
      )}

      {/* Version list */}
      <div className="divide-y max-h-96 overflow-y-auto">
        {versions.map((v) => {
          const isSelected = selectedForCompare.includes(v.version);
          return (
            <div
              key={v.id}
              className={`px-4 py-3 ${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  {compareMode && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCompareSelection(v.version)}
                      className="mt-1"
                    />
                  )}
                  <div>
                    <div className="text-sm font-medium">
                      Version {v.version}
                      {v.message && (
                        <span className="text-gray-500 font-normal ml-2">{v.message}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {v.author?.name || v.author?.email || 'Unknown'} &middot;{' '}
                      {new Date(v.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>

                {!compareMode && (
                  <button
                    onClick={() => handleRestore(v.version)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 shrink-0"
                  >
                    Restore
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {versions.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-gray-500">
            No versions saved yet. Save a version to track changes.
          </div>
        )}
      </div>

      {/* Save version modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h2 className="text-lg font-semibold mb-4">Save Version</h2>
            <input
              type="text"
              value={saveMessage}
              onChange={(e) => setSaveMessage(e.target.value)}
              placeholder="Version message (optional)"
              className="w-full border rounded-lg px-3 py-2 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowSaveModal(false); setSaveMessage(''); }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveVersion}
                disabled={createVersion.isPending}
                className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"
              >
                {createVersion.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Compare Panel ──────────────────────────────────────────────────────────

function ComparePanel({ documentId, v1, v2 }: { documentId: string; v1: number; v2: number }) {
  const { data: comparison, isLoading } = useDocumentVersionCompare(documentId, v1, v2);

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-b bg-gray-50 text-sm text-gray-500">
        Computing diff...
      </div>
    );
  }

  if (!comparison) return null;

  const { diff } = comparison;

  return (
    <div className="border-b">
      {/* Diff stats */}
      <div className="px-4 py-2 bg-gray-50 flex items-center gap-4 text-xs">
        <span className="text-gray-600">
          Comparing v{comparison.version1.version} → v{comparison.version2.version}
        </span>
        <span className="text-green-600">+{diff.stats.additions}</span>
        <span className="text-red-600">-{diff.stats.deletions}</span>
        <span className="text-gray-400">{diff.stats.unchanged} unchanged</span>
      </div>

      {/* Diff view */}
      <div className="max-h-64 overflow-y-auto font-mono text-xs">
        {diff.lines.map((line, i) => (
          <div
            key={i}
            className={`px-4 py-0.5 ${
              line.type === 'insert'
                ? 'bg-green-50 text-green-800'
                : line.type === 'delete'
                ? 'bg-red-50 text-red-800'
                : 'text-gray-600'
            }`}
          >
            <span className="inline-block w-8 text-gray-400 text-right mr-2 select-none">
              {line.oldLineNum ?? ''}
            </span>
            <span className="inline-block w-8 text-gray-400 text-right mr-2 select-none">
              {line.newLineNum ?? ''}
            </span>
            <span className="inline-block w-4 text-center mr-1 select-none">
              {line.type === 'insert' ? '+' : line.type === 'delete' ? '-' : ' '}
            </span>
            {line.content}
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { ConflictInfo } from '@/hooks/useWebSocket';

interface ConflictResolutionProps {
  conflict: ConflictInfo;
  onResolve: (choice: 'mine' | 'theirs' | 'merge') => void;
  onDismiss: () => void;
}

export function ConflictResolution({ conflict, onResolve, onDismiss }: ConflictResolutionProps) {
  const [view, setView] = useState<'choice' | 'diff'>('choice');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[48rem] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-amber-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Edit Conflict Detected</h2>
              <p className="text-sm text-gray-600">{conflict.message}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {view === 'choice' ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Another user made changes while you were editing. Your changes (v{conflict.clientVersion}) conflict with their changes (v{conflict.serverVersion}).
              </p>

              <div className="grid grid-cols-2 gap-4">
                {/* Their version */}
                <button
                  onClick={() => onResolve('theirs')}
                  className="p-4 border-2 rounded-lg text-left hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="font-medium text-sm">Keep Their Version</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Discard your changes and use the latest version (v{conflict.serverVersion}).
                  </p>
                </button>

                {/* My version */}
                <button
                  onClick={() => onResolve('mine')}
                  className="p-4 border-2 rounded-lg text-left hover:border-green-500 hover:bg-green-50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="font-medium text-sm">Keep My Version</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Override their changes with your version (v{conflict.clientVersion}).
                  </p>
                </button>
              </div>

              {/* View diff */}
              <button
                onClick={() => setView('diff')}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                View diff before deciding →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                onClick={() => setView('choice')}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ← Back to choices
              </button>

              {/* Side-by-side diff */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    Your Version (v{conflict.clientVersion})
                  </div>
                  <pre className="text-xs bg-green-50 border rounded p-3 overflow-auto max-h-64 font-mono whitespace-pre-wrap">
                    {conflict.serverContent}
                  </pre>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    Their Version (v{conflict.serverVersion})
                  </div>
                  <pre className="text-xs bg-blue-50 border rounded p-3 overflow-auto max-h-64 font-mono whitespace-pre-wrap">
                    {conflict.serverContent}
                  </pre>
                </div>
              </div>

              {/* Resolve buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => onResolve('theirs')}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                >
                  Keep Theirs
                </button>
                <button
                  onClick={() => onResolve('mine')}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                >
                  Keep Mine
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

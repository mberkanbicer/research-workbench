'use client';

import { useState, useEffect } from 'react';
import type { Collaborator } from '@/hooks/useCollaboration';
import { TypingIndicator } from '@/components/TypingIndicator';

interface UserPresenceListProps {
  collaborators: Collaborator[];
  currentUserId?: string;
  currentUserName?: string;
}

interface PresenceEntry {
  id: string;
  userName: string;
  color: string;
  status: 'editing' | 'viewing' | 'idle';
  isTyping?: boolean;
  cursorLine?: number;
  selectionCount?: number;
  lastActive: number;
}

export function UserPresenceList({
  collaborators,
  currentUserId = '',
  currentUserName = 'You',
}: UserPresenceListProps) {
  const [, setTick] = useState(0);

  // Force re-render every 10 seconds to update idle status
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  // Build presence entries
  const entries: PresenceEntry[] = [];

  // Add current user
  entries.push({
    id: currentUserId || 'self',
    userName: currentUserName,
    color: '#6366f1',
    status: 'editing',
    lastActive: Date.now(),
  });

  // Add remote collaborators
  for (const collab of collaborators) {
    if (collab.userId === currentUserId) continue;

    const status: PresenceEntry['status'] = collab.cursor
      ? 'editing'
      : collab.selection
      ? 'viewing'
      : 'viewing';

    entries.push({
      id: collab.id,
      userName: collab.userName,
      color: collab.color,
      status,
      isTyping: collab.isTyping,
      cursorLine: collab.cursor?.line,
      selectionCount: collab.selection
        ? collab.selection.end - collab.selection.start
        : undefined,
      lastActive: Date.now(),
    });
  }

  return (
    <div className="border rounded-lg bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="font-medium text-sm">Who's Here</h3>
        <span className="text-xs text-gray-500">
          {entries.length} user{entries.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Typing indicator */}
      <TypingIndicator
        collaborators={collaborators}
        currentUserId={currentUserId}
      />

      {/* User list */}
      <div className="divide-y">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50"
          >
            {/* Avatar */}
            <div className="relative">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                style={{ backgroundColor: entry.color }}
              >
                {entry.userName.charAt(0).toUpperCase()}
              </div>
              {/* Status dot */}
              <div
                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                  entry.status === 'editing'
                    ? 'bg-green-500'
                    : entry.status === 'viewing'
                    ? 'bg-blue-400'
                    : 'bg-gray-400'
                }`}
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 truncate">
                  {entry.userName}
                </span>
                {entry.id === (currentUserId || 'self') && (
                  <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-medium rounded">
                    You
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {entry.isTyping ? (
                  <span className="flex items-center gap-1 text-indigo-600 font-medium">
                    <div className="flex gap-0.5">
                      <div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    Typing
                    {entry.cursorLine && (
                      <span className="text-gray-400 font-normal">at line {entry.cursorLine}</span>
                    )}
                  </span>
                ) : entry.status === 'editing' ? (
                  entry.cursorLine ? (
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 8 12">
                        <path d="M1 1h6l-3 10z" />
                      </svg>
                      Editing line {entry.cursorLine}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 8 12">
                        <path d="M1 1h6l-3 10z" />
                      </svg>
                      Editing
                    </span>
                  )
                ) : (
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Viewing
                    {entry.selectionCount && entry.selectionCount > 0 && (
                      <span className="text-gray-400">
                        ({entry.selectionCount} chars selected)
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Activity indicator */}
            {entry.status === 'editing' && (
              <div className="flex gap-0.5">
                <div className="w-1 h-3 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                <div className="w-1 h-3 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                <div className="w-1 h-3 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer with keyboard shortcuts hint */}
      <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" /> Editing
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-400" /> Viewing
          </span>
        </div>
      </div>
    </div>
  );
}

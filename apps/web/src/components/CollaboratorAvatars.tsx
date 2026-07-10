'use client';

import { useState } from 'react';
import type { Collaborator } from '@/hooks/useCollaboration';

interface CollaboratorAvatarsProps {
  collaborators: Collaborator[];
  currentUserId?: string;
  maxVisible?: number;
}

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-500',
  idle: 'bg-yellow-500',
  offline: 'bg-gray-400',
};

export function CollaboratorAvatars({
  collaborators,
  currentUserId,
  maxVisible = 5,
}: CollaboratorAvatarsProps) {
  const [expanded, setExpanded] = useState(false);

  // Filter out current user
  const others = collaborators.filter((c) => c.userId !== currentUserId);
  const visible = others.slice(0, maxVisible);
  const remaining = others.length - maxVisible;

  if (others.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
      >
        {/* Avatar stack */}
        <div className="flex -space-x-2">
          {visible.map((collaborator) => (
            <div
              key={collaborator.id}
              className="relative group"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white border-2 border-white shadow-sm cursor-default"
                style={{ backgroundColor: collaborator.color }}
                title={collaborator.userName}
              >
                {collaborator.userName.charAt(0).toUpperCase()}
              </div>
              {/* Online dot */}
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white" />

              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {collaborator.userName}
                {collaborator.cursor && (
                  <span className="text-gray-400 ml-1">
                    (line {collaborator.cursor.line})
                  </span>
                )}
              </div>
            </div>
          ))}
          {remaining > 0 && (
            <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600 border-2 border-white">
              +{remaining}
            </div>
          )}
        </div>

        {/* Label */}
        <span className="text-xs text-gray-500">
          {others.length} other{others.length !== 1 ? 's' : ''}
        </span>

        {/* Chevron */}
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded list */}
      {expanded && (
        <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-50 min-w-[200px] py-1">
          <div className="px-3 py-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
            Collaborators
          </div>
          {others.map((collaborator) => (
            <div
              key={collaborator.id}
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
            >
              <div className="relative">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                  style={{ backgroundColor: collaborator.color }}
                >
                  {collaborator.userName.charAt(0).toUpperCase()}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {collaborator.userName}
                </div>
                <div className="text-xs text-gray-500">
                  {collaborator.cursor
                    ? `Editing line ${collaborator.cursor.line}`
                    : 'Viewing'}
                </div>
              </div>
              {collaborator.selection && (
                <div className="text-xs text-gray-400">
                  {collaborator.selection.end - collaborator.selection.start} chars selected
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

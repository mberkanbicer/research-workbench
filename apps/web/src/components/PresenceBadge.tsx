'use client';

import type { Collaborator } from '@/hooks/useCollaboration';

interface PresenceBadgeProps {
  collaborators: Collaborator[];
  currentUserId?: string;
  wsStatus: 'idle' | 'connecting' | 'open' | 'closed' | 'error';
}

export function PresenceBadge({
  collaborators,
  currentUserId,
  wsStatus,
}: PresenceBadgeProps) {
  const others = collaborators.filter((c) => c.userId !== currentUserId);

  const statusConfig = {
    idle: { color: 'bg-gray-400', label: 'Offline' },
    connecting: { color: 'bg-yellow-400', label: 'Connecting...' },
    open: { color: 'bg-green-500', label: 'Connected' },
    closed: { color: 'bg-gray-400', label: 'Disconnected' },
    error: { color: 'bg-red-500', label: 'Connection error' },
  };

  const status = statusConfig[wsStatus];

  return (
    <div className="flex items-center gap-2">
      {/* Connection status */}
      <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full ${status.color}`} />
        <span className="text-xs text-gray-500">{status.label}</span>
      </div>

      {/* Separator */}
      {others.length > 0 && (
        <div className="w-px h-4 bg-gray-200" />
      )}

      {/* Online users */}
      {others.length > 0 && (
        <div className="flex items-center gap-1">
          <div className="flex -space-x-1.5">
            {others.slice(0, 4).map((collab) => (
              <div
                key={collab.id}
                className="relative group"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white"
                  style={{ backgroundColor: collab.color }}
                >
                  {collab.userName.charAt(0).toUpperCase()}
                </div>

                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  {collab.userName}
                  {collab.cursor && (
                    <span className="text-gray-400 ml-1">
                      (line {collab.cursor.line})
                    </span>
                  )}
                </div>
              </div>
            ))}
            {others.length > 4 && (
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-600 border-2 border-white">
                +{others.length - 4}
              </div>
            )}
          </div>
          <span className="text-xs text-gray-500">
            {others.length} online
          </span>
        </div>
      )}
    </div>
  );
}

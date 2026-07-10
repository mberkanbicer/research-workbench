'use client';

import { useEffect, useState } from 'react';
import { usePresence, useUpdatePresence } from '@/hooks/useApi';
import { useParams, usePathname } from 'next/navigation';
import type { PresenceData } from '@/hooks/usePresence';

interface PresenceIndicatorProps {
  userName?: string;
}

export default function PresenceIndicator({ userName = 'You' }: PresenceIndicatorProps) {
  const { projectId } = useParams() as { projectId: string };
  const pathname = usePathname();
  const { data: presenceData } = usePresence(projectId);
  const updatePresence = useUpdatePresence();
  const [isExpanded, setIsExpanded] = useState(false);

  // Send heartbeat every 15 seconds
  useEffect(() => {
    if (!projectId) return;
    updatePresence.mutate({ projectId, userName, page: pathname });
    const interval = setInterval(() => {
      updatePresence.mutate({ projectId, userName, page: pathname });
    }, 15000);
    return () => clearInterval(interval);
  }, [projectId, pathname, userName]);

  const presence = (presenceData?.data?.presence || []) as PresenceData[];
  const otherUsers = presence.filter((p: any) => p.userName !== userName);

  if (otherUsers.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
      >
        <div className="flex -space-x-1">
          {otherUsers.slice(0, 3).map((p: any, i: number) => (
            <div key={i} className="w-5 h-5 rounded-full bg-blue-100 border border-white flex items-center justify-center text-[8px] font-bold text-blue-600">
              {p.userName.charAt(0).toUpperCase()}
            </div>
          ))}
        </div>
        <span>{otherUsers.length} other{otherUsers.length !== 1 ? 's' : ''}</span>
      </button>

      {isExpanded && (
        <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg p-2 z-50 min-w-[150px]">
          <div className="text-xs font-medium text-gray-500 mb-1">Currently viewing</div>
          {presence.map((p: any, i: number) => (
            <div key={i} className="flex items-center gap-2 py-1 text-sm">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="truncate">{p.userName}</span>
              <span className="text-xs text-gray-400 ml-auto">{p.page.split('/').pop() || '/'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

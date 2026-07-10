'use client';

import { useEffect } from 'react';
import { useSSE, type SSEEvent } from './useSSE';
import { useRunStore } from '@/store/runStore';

/**
 * Subscribe to run events via SSE and keep useRunStore in sync.
 * Both dashboard and timeline should use this hook for a single source of truth.
 */
export function useRunEvents(runId: string | null, initialEvents: SSEEvent[] = []) {
  const eventLog = useRunStore((s) => s.eventLog);
  const connectionStatus = useRunStore((s) => s.runConnectionStatus);
  const activeRunId = useRunStore((s) => s.activeRunId);
  const { setActiveRunId, hydrateEvents, setRunConnectionStatus, clearEvents } = useRunStore();

  useEffect(() => {
    if (!runId) return;
    if (activeRunId !== runId) {
      clearEvents();
      setActiveRunId(runId);
    }
    if (initialEvents.length > 0 && eventLog.length === 0) {
      // Ensure all events have an id
      const eventsWithIds = initialEvents.map(e => ({
        ...e,
        id: e.id || crypto.randomUUID(),
      }));
      hydrateEvents(eventsWithIds);
    }
  }, [runId]);

  const { status } = useSSE(runId, { syncToStore: true });

  useEffect(() => {
    setRunConnectionStatus(status);
  }, [status, setRunConnectionStatus]);

  return {
    events: eventLog,
    connectionStatus,
    activeRunId: runId ?? activeRunId,
    clearEvents,
  };
}
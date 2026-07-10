'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { apiFetch, API_BASE } from '@/lib/apiFetch';
import { useRunStore } from '@/store/runStore';

// ─── Original useSSE for run events (used by useRunEvents) ──────────────────

export interface SSEEvent {
  id?: string;
  type: string;
  payload?: any;
  createdAt?: string;
}

interface UseRunSSEOptions {
  syncToStore?: boolean;
}

export function useSSE(runId: string | null, options: UseRunSSEOptions = {}) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'open' | 'error'>('idle');
  const eventSourceRef = useRef<EventSource | null>(null);
  const { addEvent } = useRunStore();

  useEffect(() => {
    if (!runId) {
      setStatus('idle');
      return;
    }

    setStatus('connecting');
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const url = `${API_BASE}/runs/${runId}/events${token ? `?token=${token}` : ''}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => setStatus('open');

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as SSEEvent;
        if (options.syncToStore) {
          // Ensure event has an id
          addEvent({
            ...event,
            id: event.id || crypto.randomUUID(),
          });
        }
      } catch {}
    };

    es.onerror = () => {
      setStatus('error');
      es.close();
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (eventSourceRef.current === es) {
          setStatus('connecting');
        }
      }, 3000);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [runId]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setStatus('idle');
  }, []);

  return { status, disconnect };
}

// ─── Real-time SSE for project events (annotations, presence) ──────────────

type SSEEventType = 'connected' | 'annotation.created' | 'annotation.deleted' | 'presence' | string;

interface UseRealtimeSSEOptions {
  projectId: string;
  events?: SSEEventType[];
  onEvent?: (event: string, data: any) => void;
  enabled?: boolean;
}

export function useRealtimeSSE({ projectId, events, onEvent, enabled = true }: UseRealtimeSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !projectId) return;

    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const url = `${API_BASE}/projects/${projectId}/events/live${token ? `?token=${token}` : ''}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onEventRef.current?.('message', data);
      } catch {}
    };

    const eventTypes = events || ['annotation.created', 'annotation.deleted', 'presence'];
    for (const eventType of eventTypes) {
      es.addEventListener(eventType, ((e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          onEventRef.current?.(eventType, data);
        } catch {}
      }) as EventListener);
    }

    es.onerror = () => {
      setTimeout(() => {
        if (eventSourceRef.current === es) {
          es.close();
        }
      }, 3000);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [projectId, enabled]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  return { disconnect };
}

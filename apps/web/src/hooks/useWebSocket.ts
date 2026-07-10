'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { API_BASE } from '@/lib/apiFetch';
import type { Collaborator } from './useCollaboration';

export type WSMessageType =
  | 'join'
  | 'joined'
  | 'change'
  | 'cursor:update'
  | 'selection:update'
  | 'typing:start'
  | 'typing:stop'
  | 'collaborator:join'
  | 'collaborator:leave'
  | 'conflict'
  | 'ping'
  | 'pong'
  | 'error'
  | string;

export interface WSMessage {
  type: WSMessageType;
  [key: string]: unknown;
}

export interface ConflictInfo {
  serverVersion: number;
  serverContent: string;
  clientVersion: number;
  message: string;
}

interface QueuedChange {
  change: { type: string; position: number; content?: string; length?: number };
  clientVersion: number;
  timestamp: number;
}

interface UseWebSocketOptions {
  documentId: string;
  userId: string;
  userName: string;
  onMessage?: (message: WSMessage) => void;
  onConnected?: (data: { collaboratorId: string; color: string; content: string; version: number; collaborators: unknown[] }) => void;
  onCollaboratorJoin?: (data: { id: string; userName: string; color: string }) => void;
  onCollaboratorLeave?: (data: { collaboratorId: string }) => void;
  onChange?: (data: { change: unknown; collaboratorId: string }) => void;
  onConflict?: (conflict: ConflictInfo) => void;
  enabled?: boolean;
}

export function useWebSocket({
  documentId,
  userId,
  userName,
  onMessage,
  onConnected,
  onCollaboratorJoin,
  onCollaboratorLeave,
  onChange,
  onConflict,
  enabled = true,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle');
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const versionRef = useRef(0);
  const offlineQueueRef = useRef<QueuedChange[]>([]);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onMessageRef = useRef(onMessage);
  const onConnectedRef = useRef(onConnected);
  const onCollaboratorJoinRef = useRef(onCollaboratorJoin);
  const onCollaboratorLeaveRef = useRef(onCollaboratorLeave);
  const onChangeRef = useRef(onChange);
  const onConflictRef = useRef(onConflict);

  onMessageRef.current = onMessage;
  onConnectedRef.current = onConnected;
  onCollaboratorJoinRef.current = onCollaboratorJoin;
  onCollaboratorLeaveRef.current = onCollaboratorLeave;
  onChangeRef.current = onChange;
  onConflictRef.current = onConflict;

  const connect = useCallback(() => {
    if (!enabled || !documentId || !userId) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    setStatus('connecting');
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const wsUrl = API_BASE.replace(/^http/, 'ws') + `/ws/collaborate/${documentId}${token ? `?token=${token}` : ''}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      // Send join message
      ws.send(JSON.stringify({
        type: 'join',
        userId,
        userName,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        onMessageRef.current?.(message);

        switch (message.type) {
          case 'joined':
            onConnectedRef.current?.(message as any);
            setCollaborators((message as any).collaborators || []);
            versionRef.current = (message as any).version || 0;
            // Replay offline queue
            replayOfflineQueue();
            break;
          case 'collaborator:join':
            onCollaboratorJoinRef.current?.(message as any);
            setCollaborators((prev) => [...prev, (message as any).collaborator]);
            break;
          case 'collaborator:leave':
            onCollaboratorLeaveRef.current?.(message as any);
            setCollaborators((prev) => prev.filter((c) => c.id !== (message as any).collaboratorId));
            break;
          case 'change':
            onChangeRef.current?.(message as any);
            versionRef.current = (message as any).change?.version || versionRef.current;
            break;
          case 'conflict':
            onConflictRef.current?.(message as unknown as ConflictInfo);
            break;
          case 'cursor:update':
            setCollaborators((prev) =>
              prev.map((c) =>
                c.id === (message as any).collaboratorId
                  ? { ...c, cursor: (message as any).cursor }
                  : c
              )
            );
            break;
          case 'selection:update':
            setCollaborators((prev) =>
              prev.map((c) =>
                c.id === (message as any).collaboratorId
                  ? { ...c, selection: (message as any).selection }
                  : c
              )
            );
            break;
          case 'typing:start':
            setCollaborators((prev) =>
              prev.map((c) =>
                c.id === (message as any).collaboratorId
                  ? { ...c, isTyping: true, typingStartedAt: Date.now() }
                  : c
              )
            );
            break;
          case 'typing:stop':
            setCollaborators((prev) =>
              prev.map((c) =>
                c.id === (message as any).collaboratorId
                  ? { ...c, isTyping: false }
                  : c
              )
            );
            break;
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      setStatus('closed');
      // Auto-reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        if (wsRef.current === ws) {
          connect();
        }
      }, 3000);
    };

    ws.onerror = () => {
      setStatus('error');
    };
  }, [documentId, userId, userName, enabled]);

  // Replay offline queue when connected
  const replayOfflineQueue = useCallback(() => {
    const queue = offlineQueueRef.current;
    if (queue.length === 0) return;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Flush queue
    offlineQueueRef.current = [];
    for (const queued of queue) {
      ws.send(JSON.stringify({
        type: 'change',
        change: queued.change,
        clientVersion: queued.clientVersion,
      }));
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((message: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Heartbeat — send ping every 30s to keep connection alive
  useEffect(() => {
    if (status !== 'open') return;
    const interval = setInterval(() => {
      send({ type: 'ping' });
    }, 30000);
    return () => clearInterval(interval);
  }, [status, send]);

  const sendChange = useCallback((change: { type: string; position: number; content?: string; length?: number }) => {
    const ws = wsRef.current;
    const clientVersion = versionRef.current;

    if (ws?.readyState === WebSocket.OPEN) {
      // Online — send immediately with version
      ws.send(JSON.stringify({
        type: 'change',
        change,
        clientVersion,
      }));
    } else {
      // Offline — queue for later
      offlineQueueRef.current.push({
        change,
        clientVersion,
        timestamp: Date.now(),
      });
    }
  }, []);

  const sendCursor = useCallback((cursor: { line: number; column: number }) => {
    send({ type: 'cursor:update', cursor });
  }, [send]);

  const sendSelection = useCallback((selection: { start: number; end: number }) => {
    send({ type: 'selection:update', selection });
  }, [send]);

  const sendTypingStart = useCallback(() => {
    send({ type: 'typing:start' });
  }, [send]);

  const sendTypingStop = useCallback(() => {
    send({ type: 'typing:stop' });
  }, [send]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('idle');
  }, []);

  const getOfflineQueueSize = useCallback(() => offlineQueueRef.current.length, []);

  return {
    status,
    collaborators,
    send,
    sendChange,
    sendCursor,
    sendSelection,
    sendTypingStart,
    sendTypingStop,
    disconnect,
    getOfflineQueueSize,
  };
}

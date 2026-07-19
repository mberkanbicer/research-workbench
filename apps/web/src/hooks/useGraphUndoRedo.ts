import { useCallback, useRef, useState } from 'react';
import type { Node } from 'reactflow';

const MAX_HISTORY = 50;

interface PositionSnapshot {
  id: string;
  position: { x: number; y: number };
}

interface UndoRedoState {
  past: PositionSnapshot[][];
  future: PositionSnapshot[][];
}

export function useGraphUndoRedo(nodes: Node[]) {
  const [history, setHistory] = useState<UndoRedoState>({ past: [], future: [] });
  const lastSnapshotRef = useRef<string>('');
  const isUndoRedoRef = useRef(false);

  const snapshot = useCallback((nodeList: Node[]): PositionSnapshot[] => {
    return nodeList.map((n) => ({
      id: n.id,
      position: { x: n.position.x, y: n.position.y },
    }));
  }, []);

  const pushToHistory = useCallback(
    (nodeList: Node[]) => {
      if (isUndoRedoRef.current) return;
      const snap = snapshot(nodeList);
      const snapKey = JSON.stringify(snap);
      if (snapKey === lastSnapshotRef.current) return;
      lastSnapshotRef.current = snapKey;
      setHistory((prev) => ({
        past: [...prev.past.slice(-MAX_HISTORY + 1), snap],
        future: [],
      }));
    },
    [snapshot],
  );

  const undo = useCallback(
    (currentNodes: Node[]): Node[] | null => {
      if (history.past.length === 0) return null;
      const previous = history.past[history.past.length - 1];
      const currentSnap = snapshot(currentNodes);

      isUndoRedoRef.current = true;
      setHistory((prev) => ({
        past: prev.past.slice(0, -1),
        future: [currentSnap, ...prev.future.slice(0, MAX_HISTORY - 1)],
      }));
      setTimeout(() => {
        isUndoRedoRef.current = false;
      }, 0);

      return currentNodes.map((n) => {
        const prev = previous.find((p) => p.id === n.id);
        return prev ? { ...n, position: prev.position } : n;
      });
    },
    [history.past, snapshot],
  );

  const redo = useCallback(
    (currentNodes: Node[]): Node[] | null => {
      if (history.future.length === 0) return null;
      const next = history.future[0];
      const currentSnap = snapshot(currentNodes);

      isUndoRedoRef.current = true;
      setHistory((prev) => ({
        past: [...prev.past, currentSnap],
        future: prev.future.slice(1),
      }));
      setTimeout(() => {
        isUndoRedoRef.current = false;
      }, 0);

      return currentNodes.map((n) => {
        const nextPos = next.find((p) => p.id === n.id);
        return nextPos ? { ...n, position: nextPos.position } : n;
      });
    },
    [history.future, snapshot],
  );

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  return { pushToHistory, undo, redo, canUndo, canRedo };
}

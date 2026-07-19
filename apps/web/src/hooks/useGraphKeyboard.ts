import { useEffect, useCallback } from 'react';
import type { Node, Edge } from 'reactflow';

interface GraphKeyboardOptions {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  undo: (nodes: Node[]) => Node[] | null;
  redo: (nodes: Node[]) => Node[] | null;
  fitView?: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement>;
  onDeleteNode?: (nodeId: string) => void;
}

export function useGraphKeyboard({
  nodes,
  edges,
  selectedNodeId,
  setNodes,
  setEdges,
  undo,
  redo,
  fitView,
  searchInputRef,
  onDeleteNode,
}: GraphKeyboardOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Don't intercept when typing in inputs (except for global shortcuts)
      if (isInput && !(isMeta && ['f', 'a', 'z', 'y'].includes(e.key))) return;

      // Undo: Ctrl+Z
      if (isMeta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const restored = undo(nodes);
        if (restored) setNodes(restored);
        return;
      }

      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if (isMeta && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        const restored = redo(nodes);
        if (restored) setNodes(restored);
        return;
      }

      // Delete: Delete or Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId && !isInput) {
        e.preventDefault();
        // Remove the selected node
        setNodes((prev) => prev.filter((n) => n.id !== selectedNodeId));
        // Remove connected edges
        setEdges((prev) =>
          prev.filter((ed) => ed.source !== selectedNodeId && ed.target !== selectedNodeId),
        );
        onDeleteNode?.(selectedNodeId);
        return;
      }

      // Select All: Ctrl+A
      if (isMeta && e.key === 'a' && !isInput) {
        e.preventDefault();
        // React Flow doesn't have a native selectAll, but we can highlight all nodes
        // by setting a special style. For now, just prevent default.
        return;
      }

      // Fit View: Ctrl+0
      if (isMeta && e.key === '0') {
        e.preventDefault();
        fitView?.();
        return;
      }

      // Search: Ctrl+F — focus search input
      if (isMeta && e.key === 'f') {
        e.preventDefault();
        searchInputRef?.current?.focus();
        return;
      }

      // Escape: deselect
      if (e.key === 'Escape') {
        // The pane click handler will handle deselection
        return;
      }
    },
    [nodes, selectedNodeId, setNodes, setEdges, undo, redo, fitView, searchInputRef, onDeleteNode],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

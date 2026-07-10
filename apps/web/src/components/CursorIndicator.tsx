'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import type { Collaborator } from '@/hooks/useCollaboration';

interface CursorIndicatorProps {
  collaborators: Collaborator[];
  currentUserId?: string;
  content: string;
  /** Scroll position of the editor textarea */
  scrollTop?: number;
  scrollLeft?: number;
}

interface CursorPosition {
  collaborator: Collaborator;
  top: number;
  left: number;
  line: number;
  column: number;
  visible: boolean;
}

// Font metrics for monospace text-sm (14px) with leading-5 (20px line height)
const LINE_HEIGHT = 20;
const CHAR_WIDTH = 8.4; // measured for 14px mono
const LEFT_PADDING = 48; // line numbers gutter
const CURSOR_HEIGHT = 20;

/**
 * Renders remote cursor indicators and selection highlights
 * overlaid on the editor, scroll-aware.
 */
export function CursorIndicator({
  collaborators,
  currentUserId,
  content,
  scrollTop = 0,
  scrollLeft = 0,
}: CursorIndicatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(400);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerHeight(entry.contentRect.height);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const cursorPositions = useMemo(() => {
    const lines = content.split('\n');
    const positions: CursorPosition[] = [];

    for (const collab of collaborators) {
      // Skip self
      if (currentUserId && collab.userId === currentUserId) continue;
      if (!collab.cursor) continue;

      const { line, column } = collab.cursor;
      const lineIndex = Math.max(0, Math.min(line - 1, lines.length - 1));

      // Absolute position in document coordinates
      const absTop = lineIndex * LINE_HEIGHT;
      const absLeft = LEFT_PADDING + column * CHAR_WIDTH;

      // Visible if within the viewport (with some margin)
      const viewTop = scrollTop - CURSOR_HEIGHT;
      const viewBottom = scrollTop + containerHeight;
      const visible = absTop >= viewTop && absTop <= viewBottom;

      // Position relative to viewport (accounting for scroll)
      positions.push({
        collaborator: collab,
        top: absTop - scrollTop,
        left: absLeft - scrollLeft,
        line,
        column,
        visible,
      });
    }

    return positions;
  }, [collaborators, currentUserId, content, scrollTop, scrollLeft, containerHeight]);

  // Selection highlights (also scroll-aware)
  const selectionHighlights = useMemo(() => {
    const lines = content.split('\n');
    const highlights: Array<{
      key: string;
      top: number;
      left: number;
      width: number;
      height: number;
      color: string;
      visible: boolean;
    }> = [];

    for (const collab of collaborators) {
      if (currentUserId && collab.userId === currentUserId) continue;
      if (!collab.selection) continue;
      if (collab.selection.start === collab.selection.end) continue;

      const { start, end } = collab.selection;
      let charCount = 0;
      let startLine = -1;
      let startCol = 0;
      let endLine = -1;
      let endCol = 0;

      for (let i = 0; i < lines.length; i++) {
        const lineLen = lines[i].length + 1;
        if (startLine === -1 && charCount + lineLen > start) {
          startLine = i;
          startCol = start - charCount;
        }
        if (charCount + lineLen >= end) {
          endLine = i;
          endCol = end - charCount;
          break;
        }
        charCount += lineLen;
      }

      if (startLine === -1 || endLine === -1) continue;

      // Generate highlight rectangles per line
      for (let i = startLine; i <= endLine; i++) {
        const colStart = i === startLine ? startCol : 0;
        const colEnd = i === endLine ? endCol : lines[i].length;
        if (colEnd <= colStart) continue;

        const absTop = i * LINE_HEIGHT;
        const absLeft = LEFT_PADDING + colStart * CHAR_WIDTH;
        const width = (colEnd - colStart) * CHAR_WIDTH;

        const viewTop = scrollTop - LINE_HEIGHT;
        const viewBottom = scrollTop + containerHeight;
        const visible = absTop >= viewTop && absTop <= viewBottom;

        highlights.push({
          key: `${collab.id}-sel-${i}`,
          top: absTop - scrollTop,
          left: absLeft - scrollLeft,
          width,
          height: LINE_HEIGHT,
          color: collab.color,
          visible,
        });
      }
    }

    return highlights;
  }, [collaborators, currentUserId, content, scrollTop, scrollLeft, containerHeight]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {/* Selection highlights */}
      {selectionHighlights.map((hl) => (
        <div
          key={hl.key}
          className="absolute rounded-sm transition-opacity duration-150"
          style={{
            top: `${hl.top}px`,
            left: `${hl.left}px`,
            width: `${hl.width}px`,
            height: `${hl.height}px`,
            backgroundColor: hl.color,
            opacity: hl.visible ? 0.18 : 0,
          }}
        />
      ))}

      {/* Cursor lines */}
      {cursorPositions.map((pos) => (
        <div
          key={pos.collaborator.id}
          className="absolute transition-all duration-100 ease-out"
          style={{
            top: `${pos.top}px`,
            left: `${pos.left}px`,
            opacity: pos.visible ? 1 : 0,
          }}
        >
          {/* Cursor caret */}
          <div
            className="w-[2px] rounded-full animate-pulse"
            style={{
              height: `${CURSOR_HEIGHT}px`,
              backgroundColor: pos.collaborator.color,
              boxShadow: `0 0 4px ${pos.collaborator.color}80`,
            }}
          />

          {/* Name label */}
          <div
            className="absolute -top-5 left-0 px-1.5 py-0.5 text-[10px] font-semibold text-white rounded-t-sm whitespace-nowrap shadow-sm"
            style={{ backgroundColor: pos.collaborator.color }}
          >
            {pos.collaborator.userName}
          </div>
        </div>
      ))}
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface CommentHighlight {
  id: string;
  start: number;
  end: number;
  color?: string;
}

interface LaTeXEditorProps {
  content: string;
  onChange: (content: string) => void;
  onCursorChange?: (cursor: { line: number; column: number }) => void;
  onSelectionChange?: (selection: { start: number; end: number } | null) => void;
  onScroll?: (scroll: { top: number; left: number }) => void;
  contentVersion?: number;
  status: string;
  lastError: string | null;
  saveState?: 'idle' | 'saving' | 'saved';
  commentHighlights?: CommentHighlight[];
  onHighlightClick?: (commentId: string) => void;
}

const LATEX_KEYWORDS = new Set([
  'documentclass', 'usepackage', 'begin', 'end', 'title', 'author', 'date',
  'maketitle', 'tableofcontents', 'section', 'subsection', 'subsubsection',
  'paragraph', 'subparagraph', 'includegraphics', 'caption', 'label', 'ref',
  'cite', 'bibliography', 'bibliographystyle', 'newcommand', 'renewcommand',
  'textbf', 'textit', 'textsc', 'emph', 'underline', 'footnote',
  'item', 'enumerate', 'itemize', 'description', 'figure', 'table',
  'equation', 'align', 'gather', 'multline', 'matrix', 'pmatrix',
  'frac', 'sqrt', 'sum', 'int', 'prod', 'lim',
  'quad', 'qquad', 'hspace', 'vspace', 'newline', 'pagebreak',
  'href', 'url', 'input', 'include',
]);

const LATEX_ENVIRONMENTS = new Set([
  'document', 'abstract', 'article', 'report', 'book', 'letter',
  'figure', 'table', 'equation', 'align', 'gather', 'multline',
  'enumerate', 'itemize', 'description', 'tabular', 'array',
  'center', 'quote', 'verbatim', 'minipage',
]);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightLine(line: string): string {
  let safe = escapeHtml(line);

  // Comments
  const commentIdx = safe.indexOf('%');
  if (commentIdx >= 0) {
    const before = safe.substring(0, commentIdx);
    const comment = safe.substring(commentIdx);
    safe = highlightCommands(before) + `<span style="color:#6b7280;font-style:italic">${comment}</span>`;
    return safe;
  }

  return highlightCommands(safe);
}

function highlightCommands(text: string): string {
  // Highlight \command{env} patterns
  return text.replace(/\\(begin|end)\{(\w+)\}/g, (_m, cmd, env) => {
    const envClass = LATEX_ENVIRONMENTS.has(env) ? 'color:#7c3aed;font-weight:600' : 'color:#7c3aed';
    return `<span style="color:#7c3aed">\\${cmd}{</span><span style="${envClass}">${env}</span><span style="color:#7c3aed">}</span>`;
  }).replace(/\\(\w+)/g, (_m, cmd) => {
    const style = LATEX_KEYWORDS.has(cmd) ? 'color:#2563eb;font-weight:600' : 'color:#2563eb';
    return `<span style="${style}">\\${cmd}</span>`;
  }).replace(/(\{|\})/g, '<span style="color:#f97316">$1</span>');
}

export function LaTeXEditor({ content, onChange, onCursorChange, onSelectionChange, onScroll, contentVersion, status, lastError, saveState, commentHighlights, onHighlightClick }: LaTeXEditorProps) {
  const [localContent, setLocalContent] = useState(content);
  const [lineCount, setLineCount] = useState(0);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const lineNumRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevVersionRef = useRef(contentVersion);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchReplace, setSearchReplace] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);

  useEffect(() => {
    if (contentVersion !== undefined && contentVersion !== prevVersionRef.current) {
      const pos = textareaRef.current?.selectionStart ?? 0;
      setLocalContent(content);
      prevVersionRef.current = contentVersion;
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = Math.min(pos, content.length);
        }
      }, 0);
    } else if (contentVersion === undefined) {
      setLocalContent(content);
    }
  }, [content, contentVersion]);

  useEffect(() => { setLineCount(localContent.split('\n').length); }, [localContent]);

  const handleChange = useCallback((val: string) => {
    setLocalContent(val);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => onChange(val), 500);
  }, [onChange]);

  useEffect(() => () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); }, []);

  const handleSelect = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const text = ta.value.substring(0, ta.selectionStart);
    const lines = text.split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    setCursorLine(line);
    setCursorCol(col);
    onCursorChange?.({ line, column: col });
    onSelectionChange?.(ta.selectionStart !== ta.selectionEnd ? { start: ta.selectionStart, end: ta.selectionEnd } : null);
  }, [onCursorChange, onSelectionChange]);

  // Sync scroll across all three elements
  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const top = ta.scrollTop;
    const left = ta.scrollLeft;
    if (overlayRef.current) { overlayRef.current.scrollTop = top; overlayRef.current.scrollLeft = left; }
    if (lineNumRef.current) { lineNumRef.current.scrollTop = top; }
    onScroll?.({ top, left });
  }, [onScroll]);

  // Search logic
  const searchMatches = useMemo(() => {
    if (!searchQuery) return [];
    const matches: number[] = [];
    let idx = 0;
    const lower = localContent.toLowerCase();
    const query = searchQuery.toLowerCase();
    while (idx < localContent.length) {
      const found = lower.indexOf(query, idx);
      if (found === -1) break;
      matches.push(found);
      idx = found + 1;
    }
    return matches;
  }, [localContent, searchQuery]);

  useEffect(() => {
    setMatchCount(searchMatches.length);
    if (searchMatches.length > 0 && currentMatch >= searchMatches.length) {
      setCurrentMatch(0);
    }
  }, [searchMatches, currentMatch]);

  const navigateMatch = useCallback((direction: 1 | -1) => {
    if (searchMatches.length === 0) return;
    const next = (currentMatch + direction + searchMatches.length) % searchMatches.length;
    setCurrentMatch(next);
    const pos = searchMatches[next];
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(pos, pos + searchQuery.length);
      // Scroll into view
      const linesBefore = localContent.substring(0, pos).split('\n').length;
      const lineHeight = 20;
      textareaRef.current.scrollTop = Math.max(0, (linesBefore - 5) * lineHeight);
    }
  }, [searchMatches, currentMatch, searchQuery, localContent]);

  const handleReplace = useCallback(() => {
    if (searchMatches.length === 0 || currentMatch >= searchMatches.length) return;
    const pos = searchMatches[currentMatch];
    const before = localContent.substring(0, pos);
    const after = localContent.substring(pos + searchQuery.length);
    const newContent = before + searchReplace + after;
    setLocalContent(newContent);
    onChange(newContent);
    setTimeout(() => navigateMatch(1), 0);
  }, [searchMatches, currentMatch, localContent, searchQuery, searchReplace, onChange, navigateMatch]);

  const handleReplaceAll = useCallback(() => {
    if (!searchQuery) return;
    const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const newContent = localContent.replace(regex, searchReplace);
    setLocalContent(newContent);
    onChange(newContent);
  }, [localContent, searchQuery, searchReplace, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart, end = ta.selectionEnd;
      const newContent = localContent.substring(0, s) + '  ' + localContent.substring(end);
      handleChange(newContent);
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + 2; }, 0);
    }
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onChange(localContent); }
    if (e.key === 'b' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); wrap('\\textbf{', '}'); }
    if (e.key === 'i' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); wrap('\\textit{', '}'); }
    if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setShowSearch(true);
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
    if (e.key === 'Escape' && showSearch) {
      setShowSearch(false);
      setSearchQuery('');
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const s = ta.selectionStart;
      const before = localContent.substring(0, s);
      const currentLine = before.split('\n').pop() || '';
      const indent = currentLine.match(/^\s*/)?.[0] || '';
      const newContent = localContent.substring(0, s) + '\n' + indent + localContent.substring(s);
      handleChange(newContent);
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + 1 + indent.length; }, 0);
    }
  }, [localContent, handleChange, onChange]);

  const wrap = useCallback((prefix: string, suffix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const s = ta.selectionStart, end = ta.selectionEnd;
    const newContent = localContent.substring(0, s) + prefix + localContent.substring(s, end) + suffix + localContent.substring(end);
    handleChange(newContent);
    setTimeout(() => { ta.selectionStart = s + prefix.length; ta.selectionEnd = end + prefix.length; ta.focus(); }, 0);
  }, [localContent, handleChange]);

  // Build highlighted HTML — one <div> per line for alignment
  const highlightedLines = localContent.split('\n').map((line, i) =>
    `<div class="leading-5">${highlightLine(line) || '&nbsp;'}</div>`
  ).join('');

  // Compute comment highlight positions (line-based for overlay)
  const commentHighlightsByLine = useMemo(() => {
    if (!commentHighlights?.length) return new Map<number, Array<{ id: string; startCol: number; endCol: number; color: string }>>();
    const lines = localContent.split('\n');
    const map = new Map<number, Array<{ id: string; startCol: number; endCol: number; color: string }>>();
    for (const hl of commentHighlights) {
      let charCount = 0;
      for (let i = 0; i < lines.length; i++) {
        const lineLen = lines[i].length + 1; // +1 for newline
        const lineStart = charCount;
        const lineEnd = charCount + lineLen;
        if (hl.end <= lineStart) break; // past the highlight
        if (hl.start < lineEnd && hl.end > lineStart) {
          const startCol = Math.max(0, hl.start - lineStart);
          const endCol = Math.min(lines[i].length, hl.end - lineStart);
          if (!map.has(i)) map.set(i, []);
          map.get(i)!.push({ id: hl.id, startCol, endCol, color: hl.color || '#fbbf24' });
        }
        charCount = lineEnd;
      }
    }
    return map;
  }, [commentHighlights, localContent]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between text-sm shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-gray-500">Line {cursorLine}, Col {cursorCol}</span>
          <span className="text-gray-500">{lineCount} lines</span>
          <span className="text-gray-500">{localContent.split(/\s+/).filter(Boolean).length} words</span>
          <span className="text-gray-500">{localContent.length} chars</span>
          {saveState && (
            <span className={`text-xs px-2 py-0.5 rounded ${
              saveState === 'saving' ? 'bg-yellow-100 text-yellow-700' :
              saveState === 'saved' ? 'bg-green-100 text-green-700' :
              'text-gray-400'
            }`}>
              {saveState === 'saving' ? 'Saving...' :
               saveState === 'saved' ? 'Saved' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs ${status === 'compiled' ? 'bg-green-100 text-green-800' : status === 'error' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
            {status}
          </span>
          {lastError && <span className="text-red-500 text-xs max-w-xs truncate" title={lastError}>{lastError}</span>}
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-1 border-b bg-gray-50 flex items-center gap-1 shrink-0">
        <button onClick={() => wrap('\\textbf{', '}')} className="p-1 hover:bg-gray-200 rounded" title="Bold"><span className="font-bold">B</span></button>
        <button onClick={() => wrap('\\textit{', '}')} className="p-1 hover:bg-gray-200 rounded" title="Italic"><span className="italic">I</span></button>
        <button onClick={() => wrap('\\textsc{', '}')} className="p-1 hover:bg-gray-200 rounded text-xs" title="Small Caps">SC</button>
        <div className="w-px h-4 bg-gray-300 mx-1" />
        <button onClick={() => wrap('\\[', '\\]')} className="p-1 hover:bg-gray-200 rounded text-xs" title="Display Math">Math</button>
        <button onClick={() => wrap('$', '$')} className="p-1 hover:bg-gray-200 rounded text-xs" title="Inline Math">$</button>
        <div className="w-px h-4 bg-gray-300 mx-1" />
        <button onClick={() => wrap('\\cite{', '}')} className="p-1 hover:bg-gray-200 rounded text-xs">cite</button>
        <button onClick={() => wrap('\\ref{', '}')} className="p-1 hover:bg-gray-200 rounded text-xs">ref</button>
        <button onClick={() => wrap('\\begin{enumerate}\n\\item ', '\\end{enumerate}')} className="p-1 hover:bg-gray-200 rounded text-xs">1.</button>
        <button onClick={() => wrap('\\begin{itemize}\n\\item ', '\\end{itemize}')} className="p-1 hover:bg-gray-200 rounded text-xs">•</button>
        <div className="flex-1" />
        <button
          onClick={() => setWordWrap(!wordWrap)}
          className={`p-1 hover:bg-gray-200 rounded text-xs ${wordWrap ? 'bg-gray-200' : ''}`}
          title={wordWrap ? 'Word wrap on' : 'Word wrap off'}
        >
          ↵
        </button>
        <button onClick={() => setShowHelp(true)} className="p-1 hover:bg-gray-200 rounded text-xs text-gray-500" title="Keyboard shortcuts">?</button>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2 border-b bg-gray-100 flex items-center gap-2 shrink-0">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentMatch(0); }}
            placeholder="Search..."
            className="border rounded px-2 py-1 text-sm font-mono w-48"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                navigateMatch(e.shiftKey ? -1 : 1);
              }
            }}
          />
          <span className="text-xs text-gray-500 w-16 text-center">
            {matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : 'No results'}
          </span>
          <button onClick={() => navigateMatch(-1)} className="p-1 hover:bg-gray-200 rounded text-xs" title="Previous (Shift+Enter)">↑</button>
          <button onClick={() => navigateMatch(1)} className="p-1 hover:bg-gray-200 rounded text-xs" title="Next (Enter)">↓</button>
          <div className="w-px h-4 bg-gray-300" />
          <input
            type="text"
            value={searchReplace}
            onChange={(e) => setSearchReplace(e.target.value)}
            placeholder="Replace..."
            className="border rounded px-2 py-1 text-sm font-mono w-48"
          />
          <button onClick={handleReplace} disabled={matchCount === 0} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50 disabled:opacity-50">Replace</button>
          <button onClick={handleReplaceAll} disabled={matchCount === 0} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50 disabled:opacity-50">All</button>
          <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="p-1 hover:bg-gray-200 rounded text-xs ml-1">✕</button>
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Line numbers */}
        <div ref={lineNumRef} className="w-12 bg-gray-50 border-r overflow-hidden pointer-events-none shrink-0">
          <div className="p-2 text-right text-gray-400 text-sm font-mono leading-5">
            {Array.from({ length: lineCount }, (_, i) => <div key={i + 1}>{i + 1}</div>)}
          </div>
        </div>

        {/* Scrollable editor container */}
        <div className="flex-1 relative overflow-auto">
          {/* Highlighted text behind */}
          <div
            ref={overlayRef}
            className="absolute inset-0 p-2 font-mono text-sm pointer-events-none"
            style={{ whiteSpace: wordWrap ? 'pre-wrap' : 'pre', wordWrap: wordWrap ? 'break-word' : 'normal', overflowWrap: wordWrap ? 'break-word' : 'normal', lineHeight: '1.25rem' }}
            dangerouslySetInnerHTML={{ __html: highlightedLines }}
          />

          {/* Comment highlights overlay */}
          {commentHighlightsByLine.size > 0 && (
            <div
              className="absolute inset-0 p-2 pointer-events-auto"
              style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', lineHeight: '1.25rem' }}
            >
              {Array.from(commentHighlightsByLine.entries()).map(([lineIdx, highlights]) =>
                highlights.map((hl: { id: string; startCol: number; endCol: number; color: string }) => (
                  <span
                    key={`${hl.id}-${lineIdx}`}
                    className="absolute cursor-pointer rounded-sm opacity-30 hover:opacity-60 transition-opacity"
                    style={{
                      top: `${lineIdx * 20 + 8}px`,
                      left: `${hl.startCol * 8.4 + 8}px`,
                      width: `${(hl.endCol - hl.startCol) * 8.4}px`,
                      height: '20px',
                      backgroundColor: hl.color,
                    }}
                    onClick={() => onHighlightClick?.(hl.id)}
                    title="Click to view comment"
                  />
                ))
              )}
            </div>
          )}

          {/* Textarea on top — fully transparent */}
          <textarea
            ref={textareaRef}
            value={localContent}
            onChange={(e) => handleChange(e.target.value)}
            onSelect={handleSelect}
            onClick={handleSelect}
            onKeyDown={handleKeyDown}
            onScroll={syncScroll}
            className="absolute inset-0 p-2 w-full h-full font-mono text-sm resize-none outline-none"
            style={{
              color: 'transparent',
              caretColor: 'black',
              background: 'transparent',
              whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
              wordWrap: wordWrap ? 'break-word' : 'normal',
              overflowWrap: wordWrap ? 'break-word' : 'normal',
              lineHeight: '1.25rem',
            }}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
          />
        </div>
      </div>

      {/* Keyboard shortcuts help modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowHelp(false)}>
          <div className="bg-white rounded-lg p-6 w-[32rem] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
              <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <h3 className="font-medium text-gray-700 mb-1">Editing</h3>
                <div className="grid grid-cols-2 gap-1">
                  <ShortcutRow keys="Ctrl+S" desc="Save document" />
                  <ShortcutRow keys="Ctrl+B" desc="Bold (\\textbf)" />
                  <ShortcutRow keys="Ctrl+I" desc="Italic (\\textit)" />
                  <ShortcutRow keys="Tab" desc="Insert 2 spaces" />
                  <ShortcutRow keys="Enter" desc="New line with indent" />
                </div>
              </div>
              <div>
                <h3 className="font-medium text-gray-700 mb-1">Search</h3>
                <div className="grid grid-cols-2 gap-1">
                  <ShortcutRow keys="Ctrl+F" desc="Find in document" />
                  <ShortcutRow keys="Enter" desc="Next match" />
                  <ShortcutRow keys="Shift+Enter" desc="Previous match" />
                  <ShortcutRow keys="Escape" desc="Close search" />
                </div>
              </div>
              <div>
                <h3 className="font-medium text-gray-700 mb-1">Collaboration</h3>
                <div className="grid grid-cols-2 gap-1">
                  <ShortcutRow keys="Ctrl+Shift+C" desc="Toggle collab panel" />
                  <ShortcutRow keys="Ctrl+Shift+V" desc="Versions tab" />
                  <ShortcutRow keys="Ctrl+Shift+M" desc="Comments tab" />
                  <ShortcutRow keys="Ctrl+Shift+R" desc="References tab" />
                  <ShortcutRow keys="Ctrl+Shift+T" desc="Compile document" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShortcutRow({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="flex items-center justify-between">
      <kbd className="px-1.5 py-0.5 bg-gray-100 border rounded text-xs font-mono">{keys}</kbd>
      <span className="text-gray-600 text-xs">{desc}</span>
    </div>
  );
}

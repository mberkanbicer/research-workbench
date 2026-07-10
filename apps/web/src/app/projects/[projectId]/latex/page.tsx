'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';
import { useState, useEffect, useCallback, useRef } from 'react';
import { LaTeXEditor } from '@/components/LaTeXEditor';
import { LaTeXPreview } from '@/components/LaTeXPreview';
import { DocumentList } from '@/components/DocumentList';
import { DocumentPermissions } from '@/components/DocumentPermissions';
import { VersionHistory } from '@/components/VersionHistory';
import { DocumentComments } from '@/components/DocumentComments';
import { ReferenceManager } from '@/components/ReferenceManager';
import { TemplateMarketplace } from '@/components/TemplateMarketplace';
import { CollaboratorAvatars } from '@/components/CollaboratorAvatars';
import { CursorIndicator } from '@/components/CursorIndicator';
import { PresenceBadge } from '@/components/PresenceBadge';
import { UserPresenceList } from '@/components/UserPresenceList';
import { TypingIndicator, TypingIndicatorInline } from '@/components/TypingIndicator';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useTypingTracker } from '@/hooks/useTypingTracker';
import { useAuth } from '@/lib/auth';
import { CollabErrorBoundary } from '@/components/CollabErrorBoundary';
import { useToast } from '@/components/Toast';
import { useDocumentComments } from '@/hooks/useCollaboration';
import { ConflictResolution } from '@/components/ConflictResolution';
import type { ConflictInfo } from '@/hooks/useWebSocket';

interface LaTeXDocument {
  id: string;
  projectId: string;
  title: string;
  content: string;
  template: string;
  metadata: Record<string, unknown> | null;
  compiledPdf: string | null;
  status: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CompileResult {
  success: boolean;
  pdf?: string;
  error?: string;
  warnings?: string[];
}

type CollabTab = 'comments' | 'versions' | 'permissions' | 'references' | 'templates';

export default function LaTeXPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { addToast } = useToast();
  const projectId = params.projectId as string;

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocTemplate, setNewDocTemplate] = useState('article');
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [splitPosition, setSplitPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [showCollabPanel, setShowCollabPanel] = useState(false);
  const [collabTab, setCollabTab] = useState<CollabTab>('comments');
  const [showPresenceList, setShowPresenceList] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editorScroll, setEditorScroll] = useState({ top: 0, left: 0 });
  const [pendingConflict, setPendingConflict] = useState<ConflictInfo | null>(null);
  const [pendingCommentSelection, setPendingCommentSelection] = useState<{ start: number; end: number } | null>(null);
  const [saveIndicator, setSaveIndicator] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);

  // Track content version for remote sync
  const [remoteContentVersion, setRemoteContentVersion] = useState(0);
  const localContentRef = useRef<string>('');

  // WebSocket for real-time collaboration
  const { status: wsStatus, collaborators, sendChange, sendCursor, sendSelection, sendTypingStart, sendTypingStop } = useWebSocket({
    documentId: selectedDocId || '',
    userId: user?.id || '',
    userName: user?.name || user?.email || 'Anonymous',
    onConflict: (conflict) => {
      setPendingConflict(conflict);
      addToast('Conflict detected — someone edited while you were away', 'error');
    },
    onCollaboratorJoin: (data) => {
      addToast(`${data.userName} joined the document`, 'info');
    },
    onCollaboratorLeave: (data) => {
      const name = collaborators.find(c => c.id === data.collaboratorId)?.userName || 'Someone';
      addToast(`${name} left the document`, 'info');
    },
    onChange: (msg) => {
      // Handle incoming changes from other collaborators
      const change = msg.change as { type: string; position: number; content?: string; length?: number; fullContent?: string };
      if (change && selectedDocId) {
        // If the change includes full content, apply it directly
        if (change.fullContent) {
          localContentRef.current = change.fullContent;
          setRemoteContentVersion((v) => v + 1);
          queryClient.setQueryData(['latex-document', selectedDocId], (old: any) =>
            old ? { ...old, content: change.fullContent } : old
          );
        } else {
          // Otherwise refetch the document
          queryClient.invalidateQueries({ queryKey: ['latex-document', selectedDocId] });
        }
      }
    },
    enabled: !!selectedDocId,
  });

  // Typing tracker — sends typing:start/stop with debounce
  const { handleInput: onTypingInput } = useTypingTracker({
    onStartTyping: sendTypingStart,
    onStopTyping: sendTypingStop,
  });

  // Fetch documents
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['latex-documents', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/latex/documents`);
      const json = await res.json();
      return json.data as LaTeXDocument[];
    }
  });

  // Fetch comments for inline highlights
  const { data: comments = [] } = useDocumentComments(selectedDocId);
  const commentHighlights = comments.map((c) => ({
    id: c.id,
    start: c.startOffset,
    end: c.endOffset,
    color: c.resolved ? '#9ca3af' : '#fbbf24',
  }));

  // Fetch selected document
  const { data: selectedDoc } = useQuery({
    queryKey: ['latex-document', selectedDocId],
    queryFn: async () => {
      if (!selectedDocId) return null;
      const res = await apiFetch(`${API_BASE}/latex/documents/${selectedDocId}`);
      const json = await res.json();
      return json.data as LaTeXDocument;
    },
    enabled: !!selectedDocId
  });

  // Create document mutation
  const createMutation = useMutation({
    mutationFn: async (data: { title: string; template: string }) => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/latex/documents`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['latex-documents', projectId] });
      setSelectedDocId(data.data.id);
      setShowNewDocModal(false);
      setNewDocTitle('');
    }
  });

  // Update document mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<LaTeXDocument> }) => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data.updates)
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['latex-documents', projectId] });
    }
  });

  // Delete document mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${id}`, {
        method: 'DELETE'
      });
      return res.json();
    },
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['latex-documents', projectId] });
      if (selectedDocId === deletedId) {
        setSelectedDocId(null);
      }
    }
  });

  // Duplicate document mutation
  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${id}/duplicate`, {
        method: 'POST'
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['latex-documents', projectId] });
      setSelectedDocId(data.data.id);
    }
  });

  // Compile mutation
  const compileMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${id}/compile`, {
        method: 'POST'
      });
      return res.json();
    },
    onSuccess: (data) => {
      setCompileResult(data.data);
      queryClient.invalidateQueries({ queryKey: ['latex-documents', projectId] });
    }
  });

  // Handle save — also triggers typing indicator and broadcasts via WebSocket
  const handleSave = useCallback(async (content: string) => {
    onTypingInput();
    localContentRef.current = content;
    if (!selectedDocId) return;
    setSaveIndicator('saving');

    // Broadcast change to other collaborators
    sendChange({
      type: 'replace',
      position: 0,
      content,
      length: 0,
    });

    try {
      await updateMutation.mutateAsync({
        id: selectedDocId,
        updates: { content }
      });
      setSaveIndicator('saved');
      setTimeout(() => setSaveIndicator('idle'), 2000);
    } catch {
      setSaveIndicator('idle');
    }
  }, [selectedDocId, updateMutation, onTypingInput, sendChange]);

  // Handle compile
  const handleCompile = useCallback(async () => {
    if (!selectedDocId) return;
    setIsCompiling(true);
    try {
      await compileMutation.mutateAsync(selectedDocId);
    } finally {
      setIsCompiling(false);
    }
  }, [selectedDocId, compileMutation]);

  // Handle download PDF
  const handleDownloadPdf = useCallback(() => {
    if (!compileResult?.pdf || !selectedDoc) return;
    
    const binary = atob(compileResult.pdf);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedDoc.title}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [compileResult, selectedDoc]);

  // Handle download LaTeX
  const handleDownloadLatex = useCallback(() => {
    if (!selectedDoc) return;
    
    const blob = new Blob([selectedDoc.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedDoc.title}.tex`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [selectedDoc]);

  // Handle document rename
  const handleRename = useCallback(async () => {
    if (!renameValue.trim() || !selectedDocId) return;
    await updateMutation.mutateAsync({
      id: selectedDocId,
      updates: { title: renameValue.trim() }
    });
    setIsRenaming(false);
  }, [renameValue, selectedDocId, updateMutation]);

  // Handle version restore
  const handleVersionRestore = useCallback((content: string) => {
    queryClient.invalidateQueries({ queryKey: ['latex-document', selectedDocId] });
  }, [queryClient, selectedDocId]);

  // Handle using a template
  const handleUseTemplate = useCallback((content: string) => {
    if (selectedDocId) {
      updateMutation.mutateAsync({ id: selectedDocId, updates: { content } });
    }
  }, [selectedDocId, updateMutation]);

  // Handle conflict resolution
  const handleConflictResolve = useCallback((choice: 'mine' | 'theirs' | 'merge') => {
    if (!pendingConflict || !selectedDocId) return;

    if (choice === 'theirs') {
      // Accept server version
      localContentRef.current = pendingConflict.serverContent;
      setRemoteContentVersion((v) => v + 1);
      queryClient.setQueryData(['latex-document', selectedDocId], (old: any) =>
        old ? { ...old, content: pendingConflict.serverContent } : old
      );
    } else if (choice === 'mine') {
      // Re-send our version
      sendChange({
        type: 'replace',
        position: 0,
        content: localContentRef.current,
        length: 0,
      });
    }
    // 'merge' would show a merge editor — for now just accept theirs
    setPendingConflict(null);
  }, [pendingConflict, selectedDocId, queryClient, sendChange]);

  // Mouse handlers for split pane resizing
  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    setSplitPosition(Math.max(20, Math.min(80, percentage)));
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Keyboard shortcuts for collaboration
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+C: Toggle collaboration panel
      if (e.key === 'C' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        setShowCollabPanel((prev) => !prev);
      }
      // Ctrl+Shift+V: Switch to versions tab
      if (e.key === 'V' && e.ctrlKey && e.shiftKey && selectedDocId) {
        e.preventDefault();
        setShowCollabPanel(true);
        setCollabTab('versions');
      }
      // Ctrl+Shift+M: Switch to comments tab
      if (e.key === 'M' && e.ctrlKey && e.shiftKey && selectedDocId) {
        e.preventDefault();
        setShowCollabPanel(true);
        setCollabTab('comments');
      }
      // Ctrl+Shift+R: Switch to references tab
      if (e.key === 'R' && e.ctrlKey && e.shiftKey && selectedDocId) {
        e.preventDefault();
        setShowCollabPanel(true);
        setCollabTab('references');
      }
      // Ctrl+Shift+T: Compile
      if (e.key === 'T' && e.ctrlKey && e.shiftKey && selectedDocId) {
        e.preventDefault();
        handleCompile();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedDocId, handleCompile]);

  // Close export menu on outside click
  useEffect(() => {
    if (!showExportMenu) return;
    const handleClick = () => setShowExportMenu(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showExportMenu]);

  // Close template menu on outside click
  useEffect(() => {
    if (!showTemplateMenu) return;
    const handleClick = () => setShowTemplateMenu(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showTemplateMenu]);

  if (isLoading) {
    return <div className="p-8">Loading documents...</div>;
  }

  const collabTabConfig: { id: CollabTab; label: string }[] = [
    { id: 'comments', label: 'Comments' },
    { id: 'versions', label: 'Versions' },
    { id: 'permissions', label: 'Sharing' },
    { id: 'references', label: 'References' },
    { id: 'templates', label: 'Templates' },
  ];

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="text-gray-500 hover:text-gray-700"
          >
            ← Back to Project
          </button>
          <h1 className="text-xl font-semibold">LaTeX Editor</h1>
          {selectedDoc && (
            isRenaming ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') setIsRenaming(false);
                }}
                className="text-lg font-medium border-b-2 border-indigo-500 outline-none bg-transparent px-1"
                autoFocus
              />
            ) : (
              <button
                onClick={() => { setRenameValue(selectedDoc.title); setIsRenaming(true); }}
                className="text-lg text-gray-600 hover:text-gray-900 hover:border-b hover:border-gray-300 transition-colors"
                title="Click to rename"
              >
                {selectedDoc.title}
              </button>
            )
          )}
          {wsStatus === 'open' && (
            <CollaboratorAvatars
              collaborators={collaborators}
              currentUserId={user?.id || ''}
            />
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {selectedDoc && (
            <>
              {/* Export dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 flex items-center gap-1"
                >
                  Export
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-50 min-w-[160px] py-1">
                    <button
                      onClick={() => { handleDownloadLatex(); setShowExportMenu(false); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      Download .tex
                    </button>
                    {compileResult?.success && (
                      <button
                        onClick={() => { handleDownloadPdf(); setShowExportMenu(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        Download PDF
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={handleCompile}
                disabled={isCompiling}
                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {isCompiling ? 'Compiling...' : 'Compile'}
              </button>
              <div className="w-px h-6 bg-gray-200" />
              {/* Template quick-apply */}
              <div className="relative">
                <button
                  onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                  className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 flex items-center gap-1"
                >
                  Templates
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showTemplateMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-50 min-w-[180px] py-1">
                    {['article', 'report', 'book', 'beamer', 'letter', 'blank'].map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          if (confirm(`Apply ${t} template? Current content will be replaced.`)) {
                            const templates: Record<string, string> = {
                              article: '\\documentclass[12pt]{article}\n\\usepackage[utf8]{inputenc}\n\\title{Title}\n\\author{Author}\n\\date{\\today}\n\\begin{document}\n\\maketitle\n\\begin{abstract}\nAbstract here.\n\\end{abstract}\n\\section{Introduction}\nContent here.\n\\end{document}',
                              report: '\\documentclass[12pt]{report}\n\\usepackage[utf8]{inputenc}\n\\title{Title}\n\\author{Author}\n\\date{\\today}\n\\begin{document}\n\\maketitle\n\\tableofcontents\n\\chapter{Introduction}\nContent here.\n\\end{document}',
                              book: '\\documentclass[12pt]{book}\n\\usepackage[utf8]{inputenc}\n\\title{Title}\n\\author{Author}\n\\date{\\today}\n\\begin{document}\n\\maketitle\n\\tableofcontents\n\\chapter{Introduction}\nContent here.\n\\end{document}',
                              beamer: '\\documentclass{beamer}\n\\usetheme{default}\n\\title{Title}\n\\author{Author}\n\\date{\\today}\n\\begin{document}\n\\maketitle\n\\begin{frame}{Title}\nContent here.\n\\end{frame}\n\\end{document}',
                              letter: '\\documentclass{letter}\n\\usepackage[utf8]{inputenc}\n\\begin{document}\n\\begin{letter}{Recipient}\n\\opening{Dear,}\nContent here.\n\\closing{Sincerely,}\n\\end{letter}\n\\end{document}',
                              blank: '',
                            };
                            handleUseTemplate(templates[t] || '');
                          }
                          setShowTemplateMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 capitalize"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="w-px h-6 bg-gray-200" />
              <button
                onClick={() => setShowCollabPanel(!showCollabPanel)}
                className={`px-3 py-1.5 text-sm rounded ${
                  showCollabPanel
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'border hover:bg-gray-50'
                }`}
              >
                Collaborate
              </button>
            </>
          )}
          <button
            onClick={() => setShowNewDocModal(true)}
            className="px-3 py-1.5 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600"
          >
            New Document
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Document List Sidebar */}
        <div className="w-64 border-r bg-gray-50 overflow-y-auto">
          <DocumentList
            documents={documents}
            selectedId={selectedDocId}
            onSelect={setSelectedDocId}
            onDelete={(id) => {
              if (confirm('Are you sure you want to delete this document?')) {
                deleteMutation.mutate(id);
              }
            }}
            onDuplicate={(id) => duplicateMutation.mutate(id)}
          />
        </div>

        {/* Editor Area */}
        {selectedDoc ? (
          <div ref={containerRef} className="flex-1 flex">
            {/* Editor Panel */}
            <div style={{ width: `${splitPosition}%` }} className="overflow-hidden relative">
              <LaTeXEditor
                content={selectedDoc.content}
                onChange={handleSave}
                onCursorChange={sendCursor}
                onSelectionChange={(sel) => {
                  if (sel) {
                    sendSelection(sel);
                    // If comments tab is active, also set pending comment selection
                    if (collabTab === 'comments' && sel.start !== sel.end) {
                      setPendingCommentSelection(sel);
                    }
                  }
                }}
                onScroll={setEditorScroll}
                contentVersion={remoteContentVersion}
                status={selectedDoc.status}
                lastError={selectedDoc.lastError}
                saveState={saveIndicator}
                commentHighlights={selectedDocId ? commentHighlights : undefined}
                onHighlightClick={(commentId) => {
                  setActiveCommentId(commentId);
                  setShowCollabPanel(true);
                  setCollabTab('comments');
                }}
              />
              {/* Remote cursors */}
              <CursorIndicator
                collaborators={collaborators}
                currentUserId={user?.id || ''}
                content={selectedDoc.content}
                scrollTop={editorScroll.top}
                scrollLeft={editorScroll.left}
              />
              {/* Typing indicator (inline, bottom-left) */}
              <div className="absolute bottom-2 left-14 z-10">
                <TypingIndicatorInline
                  collaborators={collaborators}
                  currentUserId={user?.id || ''}
                />
              </div>
            </div>

            {/* Resizer */}
            <div
              className="w-1 bg-gray-200 hover:bg-gray-300 cursor-col-resize"
              onMouseDown={handleMouseDown}
            />

            {/* Preview Panel */}
            <div style={{ width: `${100 - splitPosition}%` }} className="overflow-hidden">
              <LaTeXPreview
                content={selectedDoc.content}
                compiledPdf={compileResult?.pdf || selectedDoc.compiledPdf}
                isCompiling={isCompiling}
              />
            </div>

            {/* Collaboration Panel */}
            {showCollabPanel && (
              <div className="w-80 border-l bg-white flex flex-col overflow-hidden">
                {/* Header with presence */}
                <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
                  <div className="flex border-b overflow-x-auto -mx-3 -mt-2 pt-2">
                    {collabTabConfig.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setCollabTab(tab.id);
                          if (tab.id !== 'comments') setPendingCommentSelection(null);
                        }}
                        className={`px-3 py-2 text-xs font-medium whitespace-nowrap ${
                          collabTab === tab.id
                            ? 'text-indigo-600 border-b-2 border-indigo-600'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-3 py-2 border-b">
                  <PresenceBadge
                    collaborators={collaborators}
                    currentUserId={user?.id || ''}
                    wsStatus={wsStatus}
                  />
                </div>

                {/* Presence list toggle */}
                <button
                  onClick={() => setShowPresenceList(!showPresenceList)}
                  className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 flex items-center justify-between border-b"
                >
                  <span className="font-medium">Who's Here ({collaborators.length + 1})</span>
                  <svg
                    className={`w-3 h-3 transition-transform ${showPresenceList ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Presence list */}
                {showPresenceList && (
                  <div className="border-b max-h-48 overflow-y-auto">
                    <UserPresenceList
                      collaborators={collaborators}
                      currentUserId={user?.id || ''}
                      currentUserName={user?.name || user?.email || 'You'}
                    />
                  </div>
                )}

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto">
                  <CollabErrorBoundary>
                    {collabTab === 'comments' && selectedDocId && (
                      <DocumentComments
                        documentId={selectedDocId}
                        pendingSelection={pendingCommentSelection}
                        onClearSelection={() => setPendingCommentSelection(null)}
                        activeCommentId={activeCommentId}
                        onClearActiveComment={() => setActiveCommentId(null)}
                      />
                    )}
                    {collabTab === 'versions' && selectedDocId && (
                      <VersionHistory documentId={selectedDocId} onRestore={handleVersionRestore} />
                    )}
                    {collabTab === 'permissions' && selectedDocId && (
                      <DocumentPermissions documentId={selectedDocId} />
                    )}
                    {collabTab === 'references' && (
                    <ReferenceManager projectId={projectId} />
                  )}
                  {collabTab === 'templates' && (
                    <TemplateMarketplace onUseTemplate={handleUseTemplate} />
                  )}
                  </CollabErrorBoundary>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="text-lg mb-2">No document selected</p>
              <p className="text-sm">Select a document from the sidebar or create a new one</p>
            </div>
          </div>
        )}
      </div>

      {/* Conflict Resolution Modal */}
      {pendingConflict && (
        <ConflictResolution
          conflict={pendingConflict}
          onResolve={handleConflictResolve}
          onDismiss={() => setPendingConflict(null)}
        />
      )}

      {/* New Document Modal */}
      {showNewDocModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h2 className="text-lg font-semibold mb-4">New LaTeX Document</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Title
                </label>
                <input
                  type="text"
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="My Research Paper"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template
                </label>
                <select
                  value={newDocTemplate}
                  onChange={(e) => setNewDocTemplate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="article">Article - Academic paper</option>
                  <option value="report">Report - Longer document</option>
                  <option value="book">Book - Full book</option>
                  <option value="beamer">Presentation - Slides</option>
                  <option value="letter">Letter - Formal letter</option>
                  <option value="blank">Blank - Start from scratch</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowNewDocModal(false);
                  setNewDocTitle('');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newDocTitle.trim()) {
                    createMutation.mutate({
                      title: newDocTitle.trim(),
                      template: newDocTemplate
                    });
                  }
                }}
                disabled={!newDocTitle.trim() || createMutation.isPending}
                className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

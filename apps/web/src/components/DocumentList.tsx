'use client';

import { useState, useEffect } from 'react';

interface Document {
  id: string;
  title: string;
  template: string;
  status: string;
  updatedAt: string;
}

interface DocumentListProps {
  documents: Document[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
}

const TEMPLATE_LABELS: Record<string, string> = {
  article: 'Article',
  report: 'Report',
  book: 'Book',
  beamer: 'Slides',
  letter: 'Letter',
  blank: 'Blank'
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-600' },
  compiled: { label: 'Compiled', color: 'bg-green-100 text-green-700' },
  error: { label: 'Error', color: 'bg-red-100 text-red-700' }
};

export function DocumentList({ documents, selectedId, onSelect, onDelete, onDuplicate }: DocumentListProps) {
  const [isLoading, setIsLoading] = useState(true);

  // Simulate loading on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b">
        <h2 className="text-sm font-semibold text-gray-700">Documents</h2>
        <p className="text-xs text-gray-500">{documents.length} document(s)</p>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="divide-y">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="flex items-center gap-2">
                  <div className="h-3 bg-gray-200 rounded w-16" />
                  <div className="h-3 bg-gray-200 rounded w-12" />
                </div>
                <div className="h-3 bg-gray-200 rounded w-20 mt-1" />
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            No documents yet.
            <br />
            Click "New Document" to get started.
          </div>
        ) : (
          <ul className="divide-y">
            {documents.map((doc) => {
              const statusInfo = STATUS_LABELS[doc.status] || STATUS_LABELS.draft;
              const isSelected = doc.id === selectedId;
              
              return (
                <li
                  key={doc.id}
                  className={`group p-3 cursor-pointer hover:bg-gray-100 transition-colors ${
                    isSelected ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''
                  }`}
                  onClick={() => onSelect(doc.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 truncate">
                        {doc.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">
                          {TEMPLATE_LABELS[doc.template] || doc.template}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDate(doc.updatedAt)}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicate?.(doc.id);
                        }}
                        className="p-1 text-gray-400 hover:text-blue-500 rounded hover:bg-blue-50"
                        title="Duplicate document"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(doc.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                        title="Delete document"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

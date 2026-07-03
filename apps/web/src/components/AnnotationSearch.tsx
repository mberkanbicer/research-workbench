'use client';

import { useState } from 'react';
import { useSearchAnnotations } from '@/hooks/useApi';

interface AnnotationSearchProps {
  projectId: string;
  onSelect?: (annotation: any) => void;
}

const ENTITY_LABELS: Record<string, string> = {
  claim: 'Claim',
  evidence: 'Evidence',
  critique: 'Critique',
  review: 'Review',
  decision: 'Decision',
  idea_version: 'Idea',
};

export default function AnnotationSearch({ projectId, onSelect }: AnnotationSearchProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const { data: results, isLoading } = useSearchAnnotations(projectId, debouncedQuery);

  const handleSearch = (value: string) => {
    setQuery(value);
    // Debounce: only search after user stops typing for 300ms
    clearTimeout((globalThis as any).__annotationSearchTimeout);
    (globalThis as any).__annotationSearchTimeout = setTimeout(() => {
      setDebouncedQuery(value);
    }, 300);
  };

  const annotations = results?.data || [];

  return (
    <div className="border rounded-lg bg-white">
      <div className="p-3 border-b">
        <input
          type="text"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search annotations..."
          className="w-full text-sm border-none outline-none focus:ring-0"
        />
      </div>
      <div className="max-h-80 overflow-y-auto">
        {query.trim().length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">
            Type to search across all annotations
          </div>
        ) : isLoading ? (
          <div className="p-4 text-center text-gray-400 text-sm">Searching...</div>
        ) : annotations.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">No results found</div>
        ) : (
          <div className="divide-y">
            {annotations.map((a: any) => (
              <button
                key={a.id}
                onClick={() => onSelect?.(a)}
                className="w-full text-left p-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium bg-gray-100 px-1.5 py-0.5 rounded">
                    {ENTITY_LABELS[a.entityType] || a.entityType}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(a.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-gray-700 line-clamp-2">{a.content}</p>
              </button>
            ))}
          </div>
        )}
      </div>
      {annotations.length > 0 && (
        <div className="p-2 border-t text-xs text-gray-400 text-center">
          {annotations.length} result{annotations.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useAnnotations, useCreateAnnotation, useDeleteAnnotation } from '@/hooks/useApi';
import type { Annotation } from '@/hooks/useAnnotations';

interface AnnotationsSectionProps {
  projectId: string;
  entityType: string;
  entityId: string;
}

export default function AnnotationsSection({ projectId, entityType, entityId }: AnnotationsSectionProps) {
  const { data: annotationsData, isLoading } = useAnnotations(projectId, entityType, entityId);
  const createAnnotation = useCreateAnnotation();
  const deleteAnnotation = useDeleteAnnotation();
  const [newContent, setNewContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const annotations = (annotationsData?.data || []) as Annotation[];

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    await createAnnotation.mutateAsync({ projectId, entityType, entityId, content: newContent });
    setNewContent('');
    setIsAdding(false);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this annotation?')) {
      await deleteAnnotation.mutateAsync({ projectId, id });
    }
  };

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-gray-500 uppercase">Annotations</h4>
        <button onClick={() => setIsAdding(!isAdding)}
          className="text-xs text-blue-600 hover:text-blue-800">
          {isAdding ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {isAdding && (
        <div className="mb-3">
          <textarea value={newContent} onChange={e => setNewContent(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm" rows={2}
            placeholder="Add a note or comment..." />
          <button onClick={handleAdd} disabled={!newContent.trim() || createAnnotation.isPending}
            className="mt-1 bg-blue-600 text-white px-2 py-1 rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
            {createAnnotation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-gray-400">Loading...</p>
      ) : annotations.length === 0 ? (
        <p className="text-xs text-gray-400">No annotations yet</p>
      ) : (
        <div className="space-y-2">
          {annotations.map((a: any) => (
            <div key={a.id} className="bg-gray-50 rounded p-2 text-xs">
              <p className="text-gray-700">{a.content}</p>
              <div className="flex justify-between items-center mt-1">
                <span className="text-gray-400">{new Date(a.createdAt).toLocaleDateString()}</span>
                <button onClick={() => handleDelete(a.id)}
                  className="text-red-400 hover:text-red-600 text-xs">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

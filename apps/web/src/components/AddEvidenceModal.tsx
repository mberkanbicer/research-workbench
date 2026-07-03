'use client';

import { useState } from 'react';
import { useCreateEvidence } from '@/hooks/useApi';

export default function AddEvidenceModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [formData, setFormData] = useState({
    title: '',
    sourceUrl: '',
    excerpt: '',
    sourceType: 'web_article',
  });

  const createEvidence = useCreateEvidence(projectId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createEvidence.mutateAsync(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        <header className="bg-gray-50 px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Add Manual Evidence</h2>
        </header>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Title</label>
            <input
              required
              className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.title}
              onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Source Title"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Source URL</label>
            <input
              required
              type="url"
              className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.sourceUrl}
              onChange={e => setFormData(prev => ({ ...prev, sourceUrl: e.target.value }))}
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Source Type</label>
            <select
              className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.sourceType}
              onChange={e => setFormData(prev => ({ ...prev, sourceType: e.target.value }))}
            >
              <option value="official">Official</option>
              <option value="academic">Academic</option>
              <option value="government">Government</option>
              <option value="company">Company</option>
              <option value="news">News</option>
              <option value="benchmark">Benchmark</option>
              <option value="blog">Blog</option>
              <option value="forum">Forum</option>
              <option value="user_input">User Input</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Excerpt / Key Points</label>
            <textarea
              required
              rows={4}
              className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.excerpt}
              onChange={e => setFormData(prev => ({ ...prev, excerpt: e.target.value }))}
              placeholder="Copy relevant text here..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createEvidence.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {createEvidence.isPending ? 'Adding...' : 'Add Evidence'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

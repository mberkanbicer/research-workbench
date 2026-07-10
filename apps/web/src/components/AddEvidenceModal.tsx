'use client';

import { useState } from 'react';
import { useCreateEvidence } from '@/hooks/useApi';
import Modal from './Modal';

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
    <Modal isOpen={true} onClose={onClose} title="Add Manual Evidence">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="evidence-title" className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Title</label>
          <input
            id="evidence-title"
            required
            className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={formData.title}
            onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Source Title"
          />
        </div>

        <div>
          <label htmlFor="evidence-url" className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Source URL</label>
          <input
            id="evidence-url"
            required
            type="url"
            className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={formData.sourceUrl}
            onChange={e => setFormData(prev => ({ ...prev, sourceUrl: e.target.value }))}
            placeholder="https://..."
          />
        </div>

        <div>
          <label htmlFor="evidence-type" className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Source Type</label>
          <select
            id="evidence-type"
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
          <label htmlFor="evidence-excerpt" className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Excerpt / Key Points</label>
          <textarea
            id="evidence-excerpt"
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
    </Modal>
  );
}

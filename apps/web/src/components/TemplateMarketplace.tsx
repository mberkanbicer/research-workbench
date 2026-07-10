'use client';

import { useState } from 'react';
import {
  useMarketplaceTemplates,
  useMarketplaceTemplate,
  useMarketplaceCategories,
  usePublishTemplate,
  useUseMarketplaceTemplate,
  type TemplateMarketplaceItem,
} from '@/hooks/useCollaboration';

interface TemplateMarketplaceProps {
  onUseTemplate?: (content: string) => void;
}

export function TemplateMarketplace({ onUseTemplate }: TemplateMarketplaceProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);

  const { data, isLoading } = useMarketplaceTemplates({
    q: search || undefined,
    category: category || undefined,
    page,
    limit: 12,
  });
  const { data: categories = [] } = useMarketplaceCategories();
  const { data: selectedTemplate } = useMarketplaceTemplate(selectedId);
  const useTemplate = useUseMarketplaceTemplate();

  const templates = data?.templates || [];
  const pagination = data?.pagination;

  const handleUse = async (templateId: string) => {
    const result = await useTemplate.mutateAsync(templateId);
    onUseTemplate?.(result.content);
    setSelectedId(null);
  };

  return (
    <div className="border rounded-lg bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-sm">Template Marketplace</h3>
          <button
            onClick={() => setShowPublishModal(true)}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            + Publish template
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search templates..."
            className="flex-1 border rounded px-2 py-1 text-sm"
          />
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Templates grid */}
      {isLoading ? (
        <div className="p-4 text-sm text-gray-500">Loading templates...</div>
      ) : (
        <div className="p-4 grid grid-cols-2 gap-3 max-h-[32rem] overflow-y-auto">
          {templates.map((template) => (
            <div
              key={template.id}
              className="border rounded-lg p-3 hover:border-indigo-300 cursor-pointer transition-colors"
              onClick={() => setSelectedId(template.id)}
            >
              <div className="text-sm font-medium truncate">{template.name}</div>
              {template.description && (
                <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{template.description}</div>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded capitalize">
                  {template.category}
                </span>
                <span className="text-xs text-gray-400">
                  {template.downloads} uses
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                by {template.author.name || 'Anonymous'}
              </div>
            </div>
          ))}

          {templates.length === 0 && (
            <div className="col-span-2 py-8 text-center text-sm text-gray-500">
              No templates found matching your search.
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="px-4 py-3 border-t flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Page {pagination.page} of {pagination.pages} ({pagination.total} templates)
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-2 py-1 text-xs border rounded disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(Math.min(pagination.pages, page + 1))}
              disabled={page === pagination.pages}
              className="px-2 py-1 text-xs border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Template detail modal */}
      {selectedTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[40rem] max-h-[80vh] flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">{selectedTemplate.name}</h2>
                {selectedTemplate.description && (
                  <p className="text-sm text-gray-500 mt-1">{selectedTemplate.description}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                x
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded capitalize">
                {selectedTemplate.category}
              </span>
              <span className="text-xs text-gray-400">
                {selectedTemplate.downloads} downloads
              </span>
              <span className="text-xs text-gray-400">
                by {selectedTemplate.author.name || 'Anonymous'}
              </span>
              {selectedTemplate.tags.map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 bg-green-50 text-green-600 text-xs rounded">
                  {tag}
                </span>
              ))}
            </div>

            {/* Template preview */}
            <div className="flex-1 overflow-auto border rounded bg-gray-50 p-3 font-mono text-xs text-gray-700 whitespace-pre-wrap max-h-64">
              {selectedTemplate.content}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setSelectedId(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Close
              </button>
              <button
                onClick={() => handleUse(selectedTemplate.id)}
                disabled={useTemplate.isPending}
                className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"
              >
                {useTemplate.isPending ? 'Using...' : 'Use Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish modal */}
      {showPublishModal && (
        <PublishTemplateModal onClose={() => setShowPublishModal(false)} />
      )}
    </div>
  );
}

// ─── Publish Template Modal ─────────────────────────────────────────────────

function PublishTemplateModal({ onClose }: { onClose: () => void }) {
  const publishTemplate = usePublishTemplate();
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: 'academic',
    content: '',
    tags: '',
  });

  const handlePublish = async () => {
    if (!form.name.trim() || !form.content.trim()) return;
    await publishTemplate.mutateAsync({
      name: form.name,
      description: form.description || undefined,
      category: form.category,
      content: form.content,
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()) : [],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[32rem]">
        <h2 className="text-lg font-semibold mb-4">Publish Template</h2>
        <div className="space-y-3">
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Template name *"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description (optional)"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            <option value="academic">Academic</option>
            <option value="business">Business</option>
            <option value="book">Book</option>
            <option value="presentation">Presentation</option>
            <option value="other">Other</option>
          </select>
          <textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder="LaTeX content *"
            className="w-full border rounded px-2 py-1.5 text-sm font-mono h-32 resize-none"
          />
          <input
            type="text"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="Tags (comma-separated)"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            onClick={handlePublish}
            disabled={!form.name.trim() || !form.content.trim() || publishTemplate.isPending}
            className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"
          >
            {publishTemplate.isPending ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}

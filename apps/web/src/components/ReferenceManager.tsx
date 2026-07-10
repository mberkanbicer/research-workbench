'use client';

import { useState, useRef } from 'react';
import {
  useReferences,
  useCreateReference,
  useDeleteReference,
  useImportReferences,
  useExportReferences,
  type Reference,
} from '@/hooks/useCollaboration';

interface ReferenceManagerProps {
  projectId: string;
}

export function ReferenceManager({ projectId }: ReferenceManagerProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFormat, setImportFormat] = useState<'bibtex' | 'ris'>('bibtex');
  const [importContent, setImportContent] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: references = [], isLoading } = useReferences(projectId, {
    search: search || undefined,
    type: typeFilter || undefined,
  });
  const createReference = useCreateReference();
  const deleteReference = useDeleteReference();
  const importReferences = useImportReferences();
  const { downloadBibTeX, downloadCSV } = useExportReferences();

  const [newRef, setNewRef] = useState({
    title: '',
    authors: '',
    year: '',
    journal: '',
    volume: '',
    pages: '',
    doi: '',
    url: '',
    abstract: '',
    citationKey: '',
    type: 'article',
    tags: '',
  });

  const handleCreate = async () => {
    if (!newRef.title.trim() || !newRef.authors.trim()) return;
    await createReference.mutateAsync({
      projectId,
      title: newRef.title,
      authors: newRef.authors.split(',').map((a) => a.trim()),
      year: newRef.year ? parseInt(newRef.year) : null,
      journal: newRef.journal || null,
      volume: newRef.volume || null,
      pages: newRef.pages || null,
      doi: newRef.doi || null,
      url: newRef.url || null,
      abstract: newRef.abstract || null,
      citationKey: newRef.citationKey || '',
      type: newRef.type,
      tags: newRef.tags ? newRef.tags.split(',').map((t) => t.trim()) : [],
      metadata: null,
    });
    setNewRef({ title: '', authors: '', year: '', journal: '', volume: '', pages: '', doi: '', url: '', abstract: '', citationKey: '', type: 'article', tags: '' });
    setShowAddForm(false);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportContent(reader.result as string);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importContent.trim()) return;
    const result = await importReferences.mutateAsync({
      projectId,
      content: importContent,
      format: importFormat,
    });
    alert(`Imported ${result.data.imported} references. Skipped ${result.data.skipped} duplicates.`);
    setShowImportModal(false);
    setImportContent('');
  };

  const handleDelete = async (referenceId: string) => {
    if (!confirm('Delete this reference?')) return;
    await deleteReference.mutateAsync({ projectId, referenceId });
  };

  const referenceTypes = ['article', 'book', 'inproceedings', 'incollection', 'phthesis', 'mastersthesis', 'misc'];

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading references...</div>;
  }

  return (
    <div className="border rounded-lg bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-sm">References</h3>
          <span className="text-xs text-gray-500">{references.length} entries</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 border rounded px-2 py-1 text-sm"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">All types</option>
            {referenceTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            + Add
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            Import
          </button>
          <button
            onClick={() => downloadBibTeX(projectId)}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            Export .bib
          </button>
          <button
            onClick={() => downloadCSV(projectId)}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            Export .csv
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="px-4 py-3 border-b bg-gray-50 space-y-2">
          <input
            type="text"
            value={newRef.title}
            onChange={(e) => setNewRef({ ...newRef, title: e.target.value })}
            placeholder="Title *"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
          <input
            type="text"
            value={newRef.authors}
            onChange={(e) => setNewRef({ ...newRef, authors: e.target.value })}
            placeholder="Authors (comma-separated) *"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              value={newRef.year}
              onChange={(e) => setNewRef({ ...newRef, year: e.target.value })}
              placeholder="Year"
              className="border rounded px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              value={newRef.volume}
              onChange={(e) => setNewRef({ ...newRef, volume: e.target.value })}
              placeholder="Volume"
              className="border rounded px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              value={newRef.pages}
              onChange={(e) => setNewRef({ ...newRef, pages: e.target.value })}
              placeholder="Pages"
              className="border rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={newRef.journal}
              onChange={(e) => setNewRef({ ...newRef, journal: e.target.value })}
              placeholder="Journal"
              className="border rounded px-2 py-1.5 text-sm"
            />
            <select
              value={newRef.type}
              onChange={(e) => setNewRef({ ...newRef, type: e.target.value })}
              className="border rounded px-2 py-1.5 text-sm"
            >
              {referenceTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={newRef.doi}
              onChange={(e) => setNewRef({ ...newRef, doi: e.target.value })}
              placeholder="DOI"
              className="border rounded px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              value={newRef.citationKey}
              onChange={(e) => setNewRef({ ...newRef, citationKey: e.target.value })}
              placeholder="Citation key (auto-generated if empty)"
              className="border rounded px-2 py-1.5 text-sm"
            />
          </div>
          <input
            type="text"
            value={newRef.tags}
            onChange={(e) => setNewRef({ ...newRef, tags: e.target.value })}
            placeholder="Tags (comma-separated)"
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
          <textarea
            value={newRef.abstract}
            onChange={(e) => setNewRef({ ...newRef, abstract: e.target.value })}
            placeholder="Abstract (optional)"
            className="w-full border rounded px-2 py-1.5 text-sm resize-none"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs text-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newRef.title.trim() || !newRef.authors.trim() || createReference.isPending}
              className="px-3 py-1.5 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"
            >
              {createReference.isPending ? 'Adding...' : 'Add Reference'}
            </button>
          </div>
        </div>
      )}

      {/* References list */}
      <div className="divide-y max-h-[32rem] overflow-y-auto">
        {references.map((ref) => (
          <div key={ref.id} className="px-4 py-3 hover:bg-gray-50 group">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{ref.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {ref.authors.join(', ')}
                  {ref.year && ` (${ref.year})`}
                </div>
                {ref.journal && (
                  <div className="text-xs text-gray-400 italic mt-0.5">{ref.journal}</div>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded font-mono">
                    {ref.citationKey}
                  </span>
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-xs rounded">
                    {ref.type}
                  </span>
                  {ref.tags.map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 bg-green-50 text-green-600 text-xs rounded">
                      {tag}
                    </span>
                  ))}
                  {ref.doi && (
                    <a
                      href={`https://doi.org/${ref.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:text-blue-700"
                    >
                      DOI
                    </a>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(ref.id)}
                className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 ml-2"
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {references.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-gray-500">
            No references yet. Add manually or import from BibTeX/RIS.
          </div>
        )}
      </div>

      {/* Import modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[32rem]">
            <h2 className="text-lg font-semibold mb-4">Import References</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setImportFormat('bibtex')}
                    className={`px-3 py-1.5 text-sm rounded ${importFormat === 'bibtex' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}
                  >
                    BibTeX (.bib)
                  </button>
                  <button
                    onClick={() => setImportFormat('ris')}
                    className={`px-3 py-1.5 text-sm rounded ${importFormat === 'ris' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}
                  >
                    RIS (.ris)
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Upload file or paste content</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={importFormat === 'bibtex' ? '.bib' : '.ris'}
                  onChange={handleImportFile}
                  className="mb-2"
                />
                <textarea
                  value={importContent}
                  onChange={(e) => setImportContent(e.target.value)}
                  placeholder={`Paste ${importFormat.toUpperCase()} content here...`}
                  className="w-full border rounded px-2 py-1.5 text-sm font-mono h-40 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowImportModal(false); setImportContent(''); }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!importContent.trim() || importReferences.isPending}
                className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"
              >
                {importReferences.isPending ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

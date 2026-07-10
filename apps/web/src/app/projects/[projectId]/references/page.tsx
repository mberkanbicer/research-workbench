'use client';

import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useReferences,
  useCreateReference,
  useDeleteReference,
  useImportReferences,
  useExportReferences,
  type Reference,
} from '@/hooks/useCollaboration';

const REFERENCE_TYPES = [
  'article', 'book', 'inproceedings', 'incollection',
  'phthesis', 'mastersthesis', 'techreport', 'misc',
];

export default function ReferencesPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFormat, setImportFormat] = useState<'bibtex' | 'ris'>('bibtex');
  const [importContent, setImportContent] = useState('');
  const [selectedRef, setSelectedRef] = useState<Reference | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: references = [], isLoading } = useReferences(projectId, {
    search: search || undefined,
    type: typeFilter || undefined,
    tag: tagFilter || undefined,
  });
  const createReference = useCreateReference();
  const deleteReference = useDeleteReference();
  const importReferences = useImportReferences();
  const { downloadBibTeX, downloadCSV } = useExportReferences();

  // Collect all unique tags
  const allTags = Array.from(new Set(references.flatMap((r) => r.tags)));

  // Stats
  const stats = {
    total: references.length,
    byType: REFERENCE_TYPES.reduce((acc, t) => {
      acc[t] = references.filter((r) => r.type === t).length;
      return acc;
    }, {} as Record<string, number>),
    withDoi: references.filter((r) => r.doi).length,
    withAbstract: references.filter((r) => r.abstract).length,
  };

  // Form state
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
    reader.onload = () => setImportContent(reader.result as string);
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importContent.trim()) return;
    const result = await importReferences.mutateAsync({ projectId, content: importContent, format: importFormat });
    alert(`Imported ${result.data.imported} references. Skipped ${result.data.skipped} duplicates.`);
    setShowImportModal(false);
    setImportContent('');
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="text-sm text-gray-500 hover:text-gray-700 mb-1"
          >
            ← Back to Project
          </button>
          <h1 className="text-2xl font-bold">Reference Manager</h1>
          <p className="text-sm text-gray-500 mt-1">
            {stats.total} references &middot; {stats.withDoi} with DOI &middot; {stats.withAbstract} with abstract
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            Import
          </button>
          <button
            onClick={() => downloadBibTeX(projectId)}
            className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            Export .bib
          </button>
          <button
            onClick={() => downloadCSV(projectId)}
            className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            Export .csv
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
          >
            + Add Reference
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-indigo-600">{stats.total}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
        <div className="bg-white border rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.byType.article || 0}</div>
          <div className="text-xs text-gray-500">Articles</div>
        </div>
        <div className="bg-white border rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.byType.book || 0}</div>
          <div className="text-xs text-gray-500">Books</div>
        </div>
        <div className="bg-white border rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-600">{allTags.length}</div>
          <div className="text-xs text-gray-500">Tags</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, author, citation key..."
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          {REFERENCE_TYPES.filter((t) => stats.byType[t] > 0).map((t) => (
            <option key={t} value={t}>{t} ({stats.byType[t]})</option>
          ))}
        </select>
        {allTags.length > 0 && (
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <h3 className="font-medium text-sm">Add Reference</h3>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={newRef.title} onChange={(e) => setNewRef({ ...newRef, title: e.target.value })} placeholder="Title *" className="border rounded px-2 py-1.5 text-sm" />
            <input type="text" value={newRef.authors} onChange={(e) => setNewRef({ ...newRef, authors: e.target.value })} placeholder="Authors (comma-separated) *" className="border rounded px-2 py-1.5 text-sm" />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <input type="number" value={newRef.year} onChange={(e) => setNewRef({ ...newRef, year: e.target.value })} placeholder="Year" className="border rounded px-2 py-1.5 text-sm" />
            <input type="text" value={newRef.journal} onChange={(e) => setNewRef({ ...newRef, journal: e.target.value })} placeholder="Journal" className="border rounded px-2 py-1.5 text-sm" />
            <input type="text" value={newRef.volume} onChange={(e) => setNewRef({ ...newRef, volume: e.target.value })} placeholder="Volume" className="border rounded px-2 py-1.5 text-sm" />
            <select value={newRef.type} onChange={(e) => setNewRef({ ...newRef, type: e.target.value })} className="border rounded px-2 py-1.5 text-sm">
              {REFERENCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input type="text" value={newRef.doi} onChange={(e) => setNewRef({ ...newRef, doi: e.target.value })} placeholder="DOI" className="border rounded px-2 py-1.5 text-sm" />
            <input type="text" value={newRef.citationKey} onChange={(e) => setNewRef({ ...newRef, citationKey: e.target.value })} placeholder="Citation key" className="border rounded px-2 py-1.5 text-sm" />
            <input type="text" value={newRef.tags} onChange={(e) => setNewRef({ ...newRef, tags: e.target.value })} placeholder="Tags (comma-separated)" className="border rounded px-2 py-1.5 text-sm" />
          </div>
          <textarea value={newRef.abstract} onChange={(e) => setNewRef({ ...newRef, abstract: e.target.value })} placeholder="Abstract (optional)" className="w-full border rounded px-2 py-1.5 text-sm resize-none" rows={2} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-sm text-gray-600">Cancel</button>
            <button onClick={handleCreate} disabled={!newRef.title.trim() || !newRef.authors.trim() || createReference.isPending} className="px-4 py-1.5 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50">
              {createReference.isPending ? 'Adding...' : 'Add Reference'}
            </button>
          </div>
        </div>
      )}

      {/* References list */}
      <div className="bg-white border rounded-lg divide-y">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading references...</div>
        ) : references.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg mb-2">No references yet</p>
            <p className="text-sm">Add manually or import from BibTeX/RIS files</p>
          </div>
        ) : (
          references.map((ref) => (
            <div
              key={ref.id}
              className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${selectedRef?.id === ref.id ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''}`}
              onClick={() => setSelectedRef(selectedRef?.id === ref.id ? null : ref)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{ref.title}</span>
                    {ref.doi && (
                      <a href={`https://doi.org/${ref.doi}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:text-blue-700" onClick={(e) => e.stopPropagation()}>
                        DOI
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {ref.authors.join(', ')}
                    {ref.year && ` (${ref.year})`}
                    {ref.journal && ` — ${ref.journal}`}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded font-mono">{ref.citationKey}</span>
                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] rounded">{ref.type}</span>
                    {ref.tags.map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 bg-green-50 text-green-600 text-[10px] rounded">{tag}</span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm('Delete this reference?')) deleteReference.mutateAsync({ projectId, referenceId: ref.id }); }}
                  className="text-xs text-red-400 hover:text-red-600 ml-2 opacity-0 group-hover:opacity-100"
                >
                  Delete
                </button>
              </div>

              {/* Expanded detail */}
              {selectedRef?.id === ref.id && (
                <div className="mt-3 pt-3 border-t text-sm space-y-2">
                  {ref.abstract && (
                    <div>
                      <span className="font-medium text-gray-700">Abstract: </span>
                      <span className="text-gray-600">{ref.abstract}</span>
                    </div>
                  )}
                  {ref.url && (
                    <div>
                      <span className="font-medium text-gray-700">URL: </span>
                      <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">{ref.url}</a>
                    </div>
                  )}
                  {ref.volume && (
                    <div>
                      <span className="font-medium text-gray-700">Volume: </span>
                      <span className="text-gray-600">{ref.volume}</span>
                      {ref.pages && <>, Pages: {ref.pages}</>}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
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
                  <button onClick={() => setImportFormat('bibtex')} className={`px-3 py-1.5 text-sm rounded ${importFormat === 'bibtex' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>BibTeX (.bib)</button>
                  <button onClick={() => setImportFormat('ris')} className={`px-3 py-1.5 text-sm rounded ${importFormat === 'ris' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>RIS (.ris)</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Upload file or paste content</label>
                <input ref={fileInputRef} type="file" accept={importFormat === 'bibtex' ? '.bib' : '.ris'} onChange={handleImportFile} className="mb-2" />
                <textarea value={importContent} onChange={(e) => setImportContent(e.target.value)} placeholder={`Paste ${importFormat.toUpperCase()} content here...`} className="w-full border rounded px-2 py-1.5 text-sm font-mono h-40 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setShowImportModal(false); setImportContent(''); }} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleImport} disabled={!importContent.trim() || importReferences.isPending} className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50">
                {importReferences.isPending ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

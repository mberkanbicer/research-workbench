'use client';

import { useState, useEffect } from 'react';
import { useSearchProviderSettings, useUpdateSearchProviderSettings } from '@/hooks/useApi';

export const dynamic = 'force-dynamic';

const PROVIDERS = [
  { value: '', label: 'Default (env SEARCH_PROVIDER)', description: 'Use the SEARCH_PROVIDER environment variable' },
  { value: 'mock', label: 'Mock', description: 'Fake search results from local fixtures — fast, no network' },
  { value: 'searxng', label: 'SearXNG', description: 'Self-hosted metasearch at search.bicers.me' },
  { value: 'serpapi', label: 'SerpAPI', description: 'Google search via SerpAPI (requires SERPAPI_API_KEY)' },
  { value: 'web', label: 'Web Search', description: 'Generic web search adapter' },
  { value: 'manual', label: 'Manual Entry', description: 'No automatic search — add evidence by hand' },
];

export default function SearchProviderSettingsPage() {
  const [selected, setSelected] = useState<string>('');
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useSearchProviderSettings();
  const saveMutation = useUpdateSearchProviderSettings();

  useEffect(() => {
    if (!isLoading && data?.data && selected === '' && data.data.provider !== undefined) {
      setSelected(data.data.provider || '');
    }
  }, [isLoading, data, selected]);

  const handleSave = async () => {
    await saveMutation.mutateAsync(selected || null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-extrabold mb-2 text-black">Search Provider</h1>
      <p className="text-gray-500 mb-8">Choose the default search backend for new research runs.</p>

      <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm">
        <div className="space-y-3">
          {PROVIDERS.map((p) => (
            <label
              key={p.value}
              className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                selected === p.value
                  ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                  : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="searchProvider"
                value={p.value}
                checked={selected === p.value}
                onChange={(e) => setSelected(e.target.value)}
                className="mt-1 accent-blue-600"
              />
              <div>
                <span className="font-bold text-gray-900 text-base">{p.label}</span>
                <p className="text-sm text-gray-500 mt-0.5">{p.description}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Default'}
          </button>
          {saved && (
            <span className="text-sm text-green-600 font-medium animate-pulse">Saved ✓</span>
          )}
        </div>
      </div>

      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <strong>Note:</strong> This is the <em>default</em> provider for new runs. You can still override it per-run
        from the project dashboard model selector panel.
      </div>
    </div>
  );
}
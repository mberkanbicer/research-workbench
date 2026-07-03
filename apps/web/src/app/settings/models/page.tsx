'use client';

import { useState, useEffect } from 'react';
import type { ModelConfig } from '@/lib/types';
import {
  useModels,
  useCreateModel,
  useUpdateModel,
  useTestModel,
  useModelKey,
  useUpdateModelKey,
} from '@/hooks/useApi';

export const dynamic = 'force-dynamic';

type ModelFormData = {
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  contextWindow: number;
};

function ModelFormModal({ onClose, initialData }: { onClose: () => void; initialData?: ModelConfig }) {
  const isEdit = !!initialData;
  const createModel = useCreateModel();
  const updateModel = useUpdateModel();
  const updateModelKey = useUpdateModelKey();
  const { data: keyData } = useModelKey(initialData?.id);

  const [formData, setFormData] = useState<ModelFormData>({
    name: initialData?.name || '',
    provider: initialData?.provider || 'openrouter',
    model: initialData?.model || '',
    baseUrl: initialData?.baseUrl || '',
    contextWindow: initialData?.contextWindow || 128000,
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const hasKey = keyData?.data?.hasKey ?? false;
  const isSaving = createModel.isPending || updateModel.isPending || updateModelKey.isPending;

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        provider: initialData.provider,
        model: initialData.model,
        baseUrl: initialData.baseUrl || '',
        contextWindow: initialData.contextWindow,
      });
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      baseUrl: formData.baseUrl || null,
      contextWindow: Number(formData.contextWindow),
    } as Partial<ModelConfig>;

    const result = isEdit
      ? await updateModel.mutateAsync({ modelId: initialData!.id, data: payload })
      : await createModel.mutateAsync(payload);

    if (apiKeyInput) {
      const targetId = isEdit ? initialData!.id : result.data.id;
      await updateModelKey.mutateAsync({ modelId: targetId, apiKeyRef: apiKeyInput });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        <header className="bg-gray-50 px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">{isEdit ? 'Edit Model' : 'Add New Model'}</h2>
        </header>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Friendly Name</label>
            <input required className="w-full border rounded px-3 py-2 text-sm" value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g. Claude 3.5 Sonnet" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Provider</label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={formData.provider} onChange={(e) => setFormData((prev) => ({ ...prev, provider: e.target.value }))}>
                <option value="mock">Mock</option>
                <option value="openrouter">OpenRouter</option>
                <option value="ollama">Ollama</option>
                <option value="openai_compatible">OpenAI Compatible</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Model ID</label>
              <input required className="w-full border rounded px-3 py-2 text-sm" value={formData.model} onChange={(e) => setFormData((prev) => ({ ...prev, model: e.target.value }))} placeholder="anthropic/claude-3.5-sonnet" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Base URL (Optional)</label>
            <input className="w-full border rounded px-3 py-2 text-sm" value={formData.baseUrl} onChange={(e) => setFormData((prev) => ({ ...prev, baseUrl: e.target.value }))} placeholder="http://localhost:11434" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Context Window</label>
            <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={formData.contextWindow} onChange={(e) => setFormData((prev) => ({ ...prev, contextWindow: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
              API Key Environment Variable
              {isEdit && hasKey && <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Set</span>}
            </label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="OPENROUTER_API_KEY"
              disabled={isSaving}
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isSaving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50">
              {isSaving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Model'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ModelSettingsPage() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({});

  const { data: modelsData, isLoading } = useModels();
  const testModel = useTestModel();
  const updateModel = useUpdateModel();

  const models = modelsData?.data || [];

  const handleTest = async (id: string) => {
    try {
      await testModel.mutateAsync(id);
      setTestResults((prev) => ({ ...prev, [id]: { type: 'success', message: 'Connection successful!' } }));
      setTimeout(() => {
        setTestResults((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 3000);
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { type: 'error', message: err instanceof Error ? err.message : 'Test failed' },
      }));
    }
  };

  if (isLoading) return <div className="p-8">Loading configurations...</div>;

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-extrabold mb-8 text-black">Model Configurations</h1>

      <div className="space-y-6">
        <section className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm">
          <h2 className="text-xl font-bold mb-6 text-black">Available Models</h2>
          <div className="divide-y divide-gray-50">
            {models.map((m) => (
              <div key={m.id} className={`py-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${m.isEnabled ? '' : 'opacity-60 grayscale'}`}>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-lg">
                    {m.name}
                    {!m.isEnabled && <span className="ml-3 text-xs bg-gray-200 text-gray-600 px-3 py-1 rounded-full font-extrabold tracking-widest">DISABLED</span>}
                  </p>
                  <p className="text-sm text-gray-500 uppercase tracking-wide mt-1">{m.provider} • {m.model}</p>
                  {testResults[m.id] && (
                    <div className={`mt-3 px-4 py-2 rounded-lg text-sm font-medium ${
                      testResults[m.id].type === 'success'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {testResults[m.id].message}
                    </div>
                  )}
                </div>
                <div className="flex space-x-3 w-full sm:w-auto">
                  <button
                    onClick={() => handleTest(m.id)}
                    disabled={testModel.isPending || !m.isEnabled}
                    className="flex-1 sm:flex-none text-sm font-bold text-blue-600 border border-blue-200 px-4 py-2 rounded-xl hover:bg-blue-50 disabled:opacity-50 transition-colors"
                  >
                    {testModel.isPending && testModel.variables === m.id ? 'Testing...' : 'Test'}
                  </button>
                  <button onClick={() => setEditingModel(m)} className="flex-1 sm:flex-none text-sm font-bold text-gray-600 border border-gray-200 px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                    Edit
                  </button>
                  <button
                    onClick={() => updateModel.mutate({ modelId: m.id, data: { isEnabled: !m.isEnabled } })}
                    disabled={updateModel.isPending}
                    className={`flex-1 sm:flex-none text-sm font-bold border px-4 py-2 rounded-xl disabled:opacity-50 transition-colors ${
                      m.isEnabled
                        ? 'text-red-600 border-red-200 hover:bg-red-50'
                        : 'text-green-600 border-green-200 hover:bg-green-50'
                    }`}
                  >
                    {m.isEnabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            ))}
            {models.length === 0 && <p className="py-12 text-center text-gray-400 font-medium">No models configured.</p>}
          </div>
        </section>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="w-full border-2 border-dashed border-gray-200 py-8 rounded-3xl text-gray-500 font-bold text-lg hover:border-blue-400 hover:text-blue-600 transition-all bg-gray-50/30 hover:bg-blue-50/20"
        >
          + Add New Model Configuration
        </button>
      </div>

      {isAddModalOpen && <ModelFormModal onClose={() => setIsAddModalOpen(false)} />}
      {editingModel && <ModelFormModal onClose={() => setEditingModel(null)} initialData={editingModel} />}
    </div>
  );
}
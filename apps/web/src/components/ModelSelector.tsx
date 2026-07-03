'use client';

import { useModels } from '@/hooks/useApi';

interface ModelSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function ModelSelector({ selectedIds, onChange }: ModelSelectorProps) {
  const { data, isLoading, error } = useModels();
  const models = data?.data || [];

  if (isLoading) return <div className="text-sm text-gray-500">Loading models...</div>;
  if (error) return <div className="text-sm text-red-500">Error loading models</div>;
  if (models.length === 0) return <div className="text-sm text-gray-500">No models available. Configure models in Settings.</div>;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">Select Models</label>
      <div className="space-y-1">
        {models.map((model: any) => (
          <label key={model.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selectedIds.includes(model.id)}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange([...selectedIds, model.id]);
                } else {
                  onChange(selectedIds.filter(id => id !== model.id));
                }
              }}
              className="rounded border-gray-300"
            />
            <span>{model.name}</span>
            <span className="text-gray-400 text-xs">({model.provider})</span>
          </label>
        ))}
      </div>
    </div>
  );
}

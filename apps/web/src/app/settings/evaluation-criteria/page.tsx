'use client';

import { useState } from 'react';
import { useProjects, useEvaluationCriteria, useCreateCriteria } from '@/hooks/useApi';

export default function EvaluationCriteriaPage() {
  const { data: projectsData } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const { data: criteriaData, isLoading } = useEvaluationCriteria(selectedProjectId);
  const createCriteria = useCreateCriteria();
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scale, setScale] = useState('low/medium/high');
  const [weight, setWeight] = useState('1.0');

  const projects = projectsData?.data || [];
  const criteria = criteriaData?.data || [];

  const handleCreate = async () => {
    if (!name.trim() || !description.trim() || !selectedProjectId) return;
    await createCriteria.mutateAsync({
      projectId: selectedProjectId,
      name,
      description,
      scale,
      weight: parseFloat(weight),
    });
    setIsCreating(false);
    setName('');
    setDescription('');
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Evaluation Criteria</h1>
      <p className="text-gray-600 mb-6">Define custom scoring dimensions for evidence evaluation.</p>

      <div className="mb-6">
        <label className="text-sm font-medium text-gray-700 block mb-1">Project</label>
        <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm">
          <option value="">Select a project...</option>
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>

      {selectedProjectId && (
        <>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold">Criteria ({criteria.length})</h2>
            <button onClick={() => setIsCreating(!isCreating)}
              className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700">
              {isCreating ? 'Cancel' : '+ Add Criteria'}
            </button>
          </div>

          {isCreating && (
            <div className="border rounded-lg bg-white p-4 mb-4 space-y-3">
              <input value={name} onChange={e => setName(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="Criteria name (e.g., Methodology Rigor)" />
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm" rows={2} placeholder="What does this criteria measure?" />
              <div className="flex gap-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Scale</label>
                  <select value={scale} onChange={e => setScale(e.target.value)}
                    className="border rounded px-2 py-1 text-sm">
                    <option value="low/medium/high">low/medium/high</option>
                    <option value="1-5">1-5</option>
                    <option value="0-100">0-100</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Weight</label>
                  <input type="number" value={weight} onChange={e => setWeight(e.target.value)}
                    className="w-20 border rounded px-2 py-1 text-sm" step="0.1" min="0" />
                </div>
              </div>
              <button onClick={handleCreate} disabled={!name.trim() || !description.trim() || createCriteria.isPending}
                className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {createCriteria.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading...</div>
          ) : criteria.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No criteria defined yet</div>
          ) : (
            <div className="space-y-3">
              {criteria.map((c: any) => (
                <div key={c.id} className="border rounded-lg bg-white p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{c.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">{c.description}</p>
                    </div>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span className="bg-gray-100 px-2 py-0.5 rounded">{c.scale}</span>
                      <span className="bg-gray-100 px-2 py-0.5 rounded">weight: {c.weight}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useLiteratureReviews, useCreateLiteratureReview, useModels } from '@/hooks/useApi';
import { useState } from 'react';

function LiteratureReviews() {
  const { projectId } = useParams() as { projectId: string };
  const { data: reviewsData, isLoading } = useLiteratureReviews(projectId);
  const { data: modelsData } = useModels();
  const createReview = useCreateLiteratureReview();
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [researchQuestion, setResearchQuestion] = useState('');
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);

  const reviews = reviewsData?.data || [];
  const models = modelsData?.data || [];

  const handleCreate = async () => {
    if (!title.trim() || !researchQuestion.trim()) return;
    await createReview.mutateAsync({ projectId, title, researchQuestion, modelIds: selectedModelIds.length > 0 ? selectedModelIds : undefined });
    setIsCreating(false);
    setTitle('');
    setResearchQuestion('');
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href={`/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-700">← Back to Dashboard</Link>
          <h1 className="text-2xl font-bold mt-1">Literature Reviews</h1>
        </div>
        <button onClick={() => setIsCreating(!isCreating)}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700">
          {isCreating ? 'Cancel' : 'New Review'}
        </button>
      </div>

      {isCreating && (
        <div className="border rounded-lg bg-white p-6 mb-6">
          <h2 className="font-semibold mb-4">Create Literature Review</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="e.g., Systematic Review of Multi-Agent Deliberation" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Research Question</label>
              <textarea value={researchQuestion} onChange={e => setResearchQuestion(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm" rows={3}
                placeholder="e.g., How does multi-agent deliberation improve research quality compared to single-agent approaches?" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Models (optional - uses all if none selected)</label>
              <div className="flex gap-2 flex-wrap">
                {models.map((m: any) => (
                  <label key={m.id} className="flex items-center gap-1 text-xs bg-gray-100 px-2 py-1 rounded cursor-pointer">
                    <input type="checkbox" checked={selectedModelIds.includes(m.id)}
                      onChange={e => {
                        if (e.target.checked) setSelectedModelIds([...selectedModelIds, m.id]);
                        else setSelectedModelIds(selectedModelIds.filter(id => id !== m.id));
                      }} />
                    {m.name}
                  </label>
                ))}
              </div>
            </div>
            <button onClick={handleCreate} disabled={!title.trim() || !researchQuestion.trim() || createReview.isPending}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {createReview.isPending ? 'Creating...' : 'Create Review'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading reviews...</div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No literature reviews yet. Create one to get started.</div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review: any) => (
            <div key={review.id} className="border rounded-lg bg-white p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{review.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{review.researchQuestion}</p>
                  <div className="flex gap-2 mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${review.status === 'completed' ? 'bg-green-100 text-green-700' : review.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {review.status}
                    </span>
                    {review.strengthOfEvidence && (
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                        Evidence: {review.strengthOfEvidence}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-400">{new Date(review.createdAt).toLocaleDateString()}</span>
              </div>

              {review.status === 'completed' && review.findings && (
                <div className="mt-4 space-y-3">
                  <h4 className="text-sm font-medium text-gray-700">Findings</h4>
                  {(Array.isArray(review.findings) ? review.findings : []).map((finding: any, i: number) => (
                    <div key={i} className="border-l-2 border-blue-300 pl-3">
                      <div className="text-sm font-medium">{finding.theme}</div>
                      <div className="text-xs text-gray-600 mt-1">{finding.summary}</div>
                      <div className="text-xs text-gray-400 mt-1">Consensus: {finding.consensus}</div>
                    </div>
                  ))}

                  {review.gaps && (Array.isArray(review.gaps) ? review.gaps : []).length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Research Gaps</h4>
                      {(Array.isArray(review.gaps) ? review.gaps : []).map((gap: any, i: number) => (
                        <div key={i} className="text-xs text-amber-700 bg-amber-50 rounded p-2 mb-1">
                          <span className="font-medium">[{gap.importance}]</span> {gap.description}
                        </div>
                      ))}
                    </div>
                  )}

                  {review.conclusion && (
                    <div className="mt-3 text-sm text-gray-700 bg-gray-50 rounded p-3">
                      <strong>Conclusion:</strong> {review.conclusion}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default LiteratureReviews;

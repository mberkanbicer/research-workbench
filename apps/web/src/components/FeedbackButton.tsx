'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';

type FeedbackType = 'positive' | 'negative';
type TargetType = 'critique' | 'evidence' | 'model_review';

interface FeedbackButtonProps {
  projectId: string;
  targetType: TargetType;
  targetId: string;
  size?: 'sm' | 'md';
}

export default function FeedbackButton({ projectId, targetType, targetId, size = 'sm' }: FeedbackButtonProps) {
  const [submittedType, setSubmittedType] = useState<FeedbackType | null>(null);

  const submitFeedback = useMutation({
    mutationFn: async (feedbackType: FeedbackType) => {
      const res = await apiFetch(`${API_BASE}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ projectId, targetType, targetId, feedbackType }),
      });
      if (!res.ok) throw new Error('Feedback submission failed');
      return res.json();
    },
    onSuccess: (_data, feedbackType) => setSubmittedType(feedbackType),
  });

  const iconSize = size === 'sm' ? 'text-lg' : 'text-2xl';
  const btnSize = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';

  return (
    <div className="inline-flex items-center gap-1">
      <button
        onClick={() => {
          if (submittedType !== 'positive') {
            submitFeedback.mutate('positive');
            setSubmittedType('positive');
          }
        }}
        disabled={submitFeedback.isPending}
        className={`${btnSize} flex items-center justify-center rounded-full transition-all ${
          submittedType === 'positive'
            ? 'bg-emerald-100 text-emerald-600'
            : 'text-gray-400 hover:text-emerald-500 hover:bg-emerald-50'
        }`}
        title="Helpful"
      >
        <span className={iconSize}>{submittedType === 'positive' ? '\u{1F44D}' : '\u{1F44D}'}</span>
      </button>
      <button
        onClick={() => {
          if (submittedType !== 'negative') {
            submitFeedback.mutate('negative');
            setSubmittedType('negative');
          }
        }}
        disabled={submitFeedback.isPending}
        className={`${btnSize} flex items-center justify-center rounded-full transition-all ${
          submittedType === 'negative'
            ? 'bg-red-100 text-red-600'
            : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
        }`}
        title="Not helpful"
      >
        <span className={iconSize}>{submittedType === 'negative' ? '\u{1F44E}' : '\u{1F44E}'}</span>
      </button>
    </div>
  );
}

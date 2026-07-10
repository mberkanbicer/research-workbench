import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';

export interface Hypothesis {
  id: string;
  projectId: string;
  ideaVersionId?: string;
  statement: string;
  status: string;
  confidence?: number;
  acceptedEvidenceIds?: unknown;
  counterEvidenceIds?: unknown;
  openQuestions?: unknown;
  createdAt: string;
  updatedAt?: string;
}

async function parseJson<T>(res: Response): Promise<{ data: T }> {
  return res.json() as Promise<{ data: T }>;
}

export function useHypotheses(projectId: string) {
  return useQuery({
    queryKey: ['hypotheses', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/hypotheses`);
      return parseJson<Hypothesis[]>(res);
    },
    enabled: !!projectId,
  });
}

export function useCreateHypothesis(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { statement: string; ideaVersionId?: string }) => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/hypotheses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return parseJson(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hypotheses', projectId] }),
  });
}

export function useUpdateHypothesis(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ hypothesisId, data }: { hypothesisId: string; data: any }) => {
      const res = await apiFetch(`${API_BASE}/hypotheses/${hypothesisId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return parseJson(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hypotheses', projectId] }),
  });
}

export function useDeleteHypothesis(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (hypothesisId: string) => {
      const res = await apiFetch(`${API_BASE}/hypotheses/${hypothesisId}`, {
        method: 'DELETE',
      });
      return parseJson(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hypotheses', projectId] }),
  });
}

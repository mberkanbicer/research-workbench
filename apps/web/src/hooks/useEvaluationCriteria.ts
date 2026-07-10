import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';

export interface EvaluationCriteria {
  id: string;
  projectId: string;
  name: string;
  description: string;
  scale: string;
  weight: number;
  createdAt: string;
}

async function parseJson<T>(res: Response): Promise<{ data: T }> {
  return res.json() as Promise<{ data: T }>;
}

export function useEvaluationCriteria(projectId: string) {
  return useQuery({
    queryKey: ['evaluationCriteria', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/evaluation-criteria`);
      return parseJson<EvaluationCriteria[]>(res);
    },
    enabled: !!projectId,
  });
}

export function useCreateCriteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, name, description, scale, weight }: { projectId: string; name: string; description: string; scale?: string; weight?: number }) => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/evaluation-criteria`, {
        method: 'POST',
        body: JSON.stringify({ name, description, scale, weight }),
      });
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluationCriteria'] });
    },
  });
}

export function useEvidenceScores(evidenceId: string) {
  return useQuery({
    queryKey: ['evidenceScores', evidenceId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/evidence/${evidenceId}/scores`);
      return parseJson(res);
    },
    enabled: !!evidenceId,
  });
}

export function useAddEvidenceScore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ evidenceId, criteriaId, score, modelId }: { evidenceId: string; criteriaId: string; score: string; modelId?: string }) => {
      const res = await apiFetch(`${API_BASE}/evidence/${evidenceId}/scores`, {
        method: 'POST',
        body: JSON.stringify({ criteriaId, score, modelId }),
      });
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidenceScores'] });
    },
  });
}

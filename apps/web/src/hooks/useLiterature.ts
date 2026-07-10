import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';

export interface LiteratureReview {
  id: string;
  projectId: string;
  title: string;
  researchQuestion: string;
  status: string;
  searchStrategy?: unknown;
  prismaFlow?: unknown;
  findings?: unknown;
  gaps?: unknown;
  conclusion?: string;
  strengthOfEvidence?: string;
  createdAt: string;
  updatedAt?: string;
}

async function parseJson<T>(res: Response): Promise<{ data: T }> {
  return res.json() as Promise<{ data: T }>;
}

export function useLiteratureReviews(projectId: string) {
  return useQuery({
    queryKey: ['literatureReviews', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/literature-reviews`);
      return parseJson<LiteratureReview[]>(res);
    },
    enabled: !!projectId,
  });
}

export function useCreateLiteratureReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, title, researchQuestion, modelIds }: { projectId: string; title: string; researchQuestion: string; modelIds?: string[] }) => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/literature-reviews`, {
        method: 'POST',
        body: JSON.stringify({ title, researchQuestion, modelIds }),
      });
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['literatureReviews'] });
    },
  });
}

export function useLiteratureReview(projectId: string, reviewId: string) {
  return useQuery({
    queryKey: ['literatureReview', projectId, reviewId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/literature-reviews/${reviewId}`);
      return parseJson(res);
    },
    enabled: !!projectId && !!reviewId,
  });
}

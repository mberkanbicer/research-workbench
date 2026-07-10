import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';

export interface Annotation {
  id: string;
  projectId: string;
  entityType: string;
  entityId: string;
  authorId?: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

async function parseJson<T>(res: Response): Promise<{ data: T }> {
  return res.json() as Promise<{ data: T }>;
}

export function useAnnotations(projectId: string, entityType?: string, entityId?: string) {
  return useQuery({
    queryKey: ['annotations', projectId, entityType, entityId],
    queryFn: async () => {
      let url = `${API_BASE}/projects/${projectId}/annotations`;
      const params = new URLSearchParams();
      if (entityType) params.set('entityType', entityType);
      if (entityId) params.set('entityId', entityId);
      const qs = params.toString();
      if (qs) url += `?${qs}`;
      const res = await apiFetch(url);
      return parseJson<Annotation[]>(res);
    },
    enabled: !!projectId,
  });
}

export function useCreateAnnotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, entityType, entityId, content }: { projectId: string; entityType: string; entityId: string; content: string }) => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/annotations`, {
        method: 'POST',
        body: JSON.stringify({ entityType, entityId, content }),
      });
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations'] });
    },
  });
}

export function useDeleteAnnotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, id }: { projectId: string; id: string }) => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/annotations/${id}`, { method: 'DELETE' });
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations'] });
    },
  });
}

export function useSearchAnnotations(projectId: string, query: string) {
  return useQuery({
    queryKey: ['annotationsSearch', projectId, query],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/annotations/search?q=${encodeURIComponent(query)}`);
      return parseJson<Annotation[]>(res);
    },
    enabled: !!projectId && query.trim().length > 0,
  });
}

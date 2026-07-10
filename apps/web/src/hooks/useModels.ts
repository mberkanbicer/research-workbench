import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';
import type { ApiResponse, ModelConfig } from '@/lib/types';

async function parseJson<T>(res: Response): Promise<ApiResponse<T>> {
  return res.json() as Promise<ApiResponse<T>>;
}

export function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: async (): Promise<ApiResponse<ModelConfig[]>> => {
      const res = await apiFetch(`${API_BASE}/models`);
      return parseJson<ModelConfig[]>(res);
    },
  });
}

export function useCreateModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<ModelConfig>): Promise<ApiResponse<ModelConfig>> => {
      const res = await apiFetch(`${API_BASE}/models`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return parseJson<ModelConfig>(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['models'] }),
  });
}

export function useUpdateModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      modelId,
      data,
    }: {
      modelId: string;
      data: Partial<ModelConfig>;
    }): Promise<ApiResponse<ModelConfig>> => {
      const res = await apiFetch(`${API_BASE}/models/${modelId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return parseJson<ModelConfig>(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['models'] }),
  });
}

export function useDeleteModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (modelId: string): Promise<ApiResponse<{ success: boolean }>> => {
      const res = await apiFetch(`${API_BASE}/models/${modelId}`, { method: 'DELETE' });
      return parseJson(res);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['models'] }),
  });
}

export function useTestModel() {
  return useMutation({
    mutationFn: async (modelId: string): Promise<ApiResponse<unknown>> => {
      const res = await apiFetch(`${API_BASE}/models/${modelId}/test`, { method: 'POST' });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(errorData.error?.message || `HTTP error ${res.status}`);
      }
      return parseJson(res);
    },
  });
}

export function useUpdateModelKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      modelId,
      apiKeyRef,
    }: {
      modelId: string;
      apiKeyRef: string | null;
    }): Promise<ApiResponse<ModelConfig>> => {
      const res = await apiFetch(`${API_BASE}/models/${modelId}/key`, {
        method: 'PATCH',
        body: JSON.stringify({ apiKeyRef }),
      });
      return parseJson<ModelConfig>(res);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['model-key', variables.modelId] });
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });
}

export function useModelKey(modelId: string | undefined) {
  return useQuery({
    queryKey: ['model-key', modelId],
    queryFn: async (): Promise<ApiResponse<{ hasKey: boolean }>> => {
      const res = await apiFetch(`${API_BASE}/models/${modelId}/key`);
      return parseJson(res);
    },
    enabled: !!modelId,
  });
}

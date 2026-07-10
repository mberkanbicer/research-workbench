import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';

async function parseJson<T>(res: Response): Promise<{ data: T }> {
  return res.json() as Promise<{ data: T }>;
}

export function useSearchProviderSettings() {
  return useQuery({
    queryKey: ['search-provider'],
    queryFn: async (): Promise<{ data: { provider: string | null } }> => {
      const res = await apiFetch(`${API_BASE}/settings/search-provider`);
      return parseJson(res);
    },
  });
}

export function useUpdateSearchProviderSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (provider: string | null) => {
      const res = await apiFetch(`${API_BASE}/settings/search-provider`, {
        method: 'PUT',
        body: JSON.stringify({ provider }),
      });
      return parseJson<{ provider: string | null }>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search-provider'] });
    },
  });
}

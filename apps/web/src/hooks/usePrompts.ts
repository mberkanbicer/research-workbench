import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';

async function parseJson<T>(res: Response): Promise<{ data: T }> {
  return res.json() as Promise<{ data: T }>;
}

export function usePromptRoles() {
  return useQuery({
    queryKey: ['promptRoles'],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/prompts`);
      return parseJson(res);
    },
  });
}

export function usePromptHistory(role: string) {
  return useQuery({
    queryKey: ['promptHistory', role],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/prompts/${role}`);
      return parseJson(res);
    },
    enabled: !!role,
  });
}

export function useUpdatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ role, text, reason }: { role: string; text: string; reason?: string }) => {
      const res = await apiFetch(`${API_BASE}/prompts/${role}/override`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, reason }),
      });
      return parseJson(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promptRoles'] });
      qc.invalidateQueries({ queryKey: ['promptHistory'] });
    },
  });
}

export function useResetPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (role: string) => {
      const res = await apiFetch(`${API_BASE}/prompts/${role}/reset`, {
        method: 'POST',
      });
      return parseJson(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promptRoles'] });
      qc.invalidateQueries({ queryKey: ['promptHistory'] });
    },
  });
}

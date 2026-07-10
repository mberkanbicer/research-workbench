import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';

export interface PresenceData {
  id: string;
  projectId: string;
  userId?: string;
  userName: string;
  page: string;
  lastSeenAt: string;
}

async function parseJson<T>(res: Response): Promise<{ data: T }> {
  return res.json() as Promise<{ data: T }>;
}

export function usePresence(projectId: string) {
  return useQuery({
    queryKey: ['presence', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/presence`);
      return parseJson<{ presence: PresenceData[] }>(res);
    },
    enabled: !!projectId,
    refetchInterval: 15000,
  });
}

export function useUpdatePresence() {
  return useMutation({
    mutationFn: async ({ projectId, userName, page }: { projectId: string; userName: string; page: string }) => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/presence`, {
        method: 'POST',
        body: JSON.stringify({ userName, page }),
      });
      return parseJson(res);
    },
  });
}

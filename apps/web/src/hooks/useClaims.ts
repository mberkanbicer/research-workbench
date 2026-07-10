import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';
import type { ApiResponse, Claim } from '@/lib/types';

async function parseJson<T>(res: Response): Promise<ApiResponse<T>> {
  return res.json() as Promise<ApiResponse<T>>;
}

export function useClaims(projectId: string) {
  return useQuery({
    queryKey: ['claims', projectId],
    queryFn: async (): Promise<ApiResponse<Claim[]>> => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/claims`);
      return parseJson<Claim[]>(res);
    },
    enabled: !!projectId,
  });
}

export function useExtractClaims() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string): Promise<ApiResponse<{ claims: Claim[] }>> => {
      const res = await apiFetch(`${API_BASE}/idea-versions/${versionId}/extract-claims`, {
        method: 'POST',
      });
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
    },
  });
}

export function useUpdateClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      claimId,
      data,
    }: {
      claimId: string;
      data: Partial<{ status: string; criticality: string; confidence: number }>;
    }): Promise<ApiResponse<Claim>> => {
      const res = await apiFetch(`${API_BASE}/claims/${claimId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return parseJson<Claim>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
    },
  });
}

export function useClaimConfidenceHistory(projectId: string, claimId: string) {
  return useQuery({
    queryKey: ['claimConfidence', projectId, claimId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/claims/${claimId}/confidence-history`);
      return parseJson(res);
    },
    enabled: !!projectId && !!claimId,
  });
}

export function useCompareVersions(v1: string, v2: string) {
  return useQuery({
    queryKey: ['compareVersions', v1, v2],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/idea-versions/compare?v1=${v1}&v2=${v2}`);
      return parseJson(res);
    },
    enabled: !!v1 && !!v2 && v1 !== v2,
  });
}

export function useProjectClaimDependencies(projectId: string) {
  return useQuery({
    queryKey: ['claimDependencies', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/claims/dependencies`);
      return parseJson<any[]>(res);
    },
    enabled: !!projectId,
  });
}

export function useClaimDependencies(claimId: string, projectId?: string) {
  return useQuery({
    queryKey: ['claimDependencies', claimId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId || 'placeholder'}/claims/${claimId}/dependencies`);
      return parseJson(res);
    },
    enabled: !!claimId,
  });
}

export function useAddClaimDependency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, claimId, targetClaimId, relation }: { projectId: string; claimId: string; targetClaimId: string; relation?: string }) => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/claims/${claimId}/dependencies`, {
        method: 'POST',
        body: JSON.stringify({ targetClaimId, relation }),
      });
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claimDependencies'] });
    },
  });
}

export function useAutoDetectDependencies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/claims/auto-detect-dependencies`, { method: 'POST' });
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claimDependencies'] });
    },
  });
}

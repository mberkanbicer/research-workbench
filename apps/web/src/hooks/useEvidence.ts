import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';
import type { ApiResponse, Evidence, CreateEvidenceInput } from '@/lib/types';

export interface StaleEvidenceData {
  stale: Evidence[];
  total: number;
  staleCount: number;
  totalCount: number;
  thresholdDays: number;
}

async function parseJson<T>(res: Response): Promise<ApiResponse<T>> {
  return res.json() as Promise<ApiResponse<T>>;
}

export function useEvidence(projectId: string) {
  return useQuery({
    queryKey: ['evidence', projectId],
    queryFn: async (): Promise<ApiResponse<Evidence[]>> => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/evidence`);
      return parseJson<Evidence[]>(res);
    },
    enabled: !!projectId,
  });
}

export function useCreateEvidence(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateEvidenceInput): Promise<ApiResponse<Evidence>> => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/evidence`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return parseJson<Evidence>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['evidence', projectId] });
    },
  });
}

export function useSearchEvidence(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (query: string): Promise<ApiResponse<Evidence[]>> => {
      const res = await apiFetch(`${API_BASE}/claims/${claimId}/search-evidence`, {
        method: 'POST',
        body: JSON.stringify({ query, maxResults: 5 }),
      });
      return parseJson<Evidence[]>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence'] });
    },
  });
}

export function useSearchCounterEvidence(claimId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (query: string): Promise<ApiResponse<Evidence[]>> => {
      const res = await apiFetch(`${API_BASE}/claims/${claimId}/search-counter-evidence`, {
        method: 'POST',
        body: JSON.stringify({ query, maxResults: 5 }),
      });
      return parseJson<Evidence[]>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence'] });
    },
  });
}

export function useAssessEvidence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      evidenceId,
      modelIds,
    }: {
      evidenceId: string;
      modelIds: string[];
    }): Promise<ApiResponse<unknown>> => {
      const res = await apiFetch(`${API_BASE}/evidence/${evidenceId}/assess`, {
        method: 'POST',
        body: JSON.stringify({ reviewerModelIds: modelIds }),
      });
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence'] });
    },
  });
}

export function useEvidenceQuality(projectId: string) {
  return useQuery({
    queryKey: ['evidenceQuality', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/evidence/quality`);
      return parseJson(res);
    },
    enabled: !!projectId,
  });
}

export function useStaleEvidence(projectId: string) {
  return useQuery({
    queryKey: ['staleEvidence', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/evidence/stale`);
      return parseJson<StaleEvidenceData>(res);
    },
    enabled: !!projectId,
  });
}

export function useVerifyEvidence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (evidenceId: string) => {
      const res = await apiFetch(`${API_BASE}/evidence/${evidenceId}/verify`, { method: 'POST' });
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staleEvidence'] });
      queryClient.invalidateQueries({ queryKey: ['evidence'] });
    },
  });
}

export function useEvidenceProvenance(evidenceId: string) {
  return useQuery({
    queryKey: ['evidenceProvenance', evidenceId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/evidence/${evidenceId}/provenance`);
      return parseJson(res);
    },
    enabled: !!evidenceId,
  });
}

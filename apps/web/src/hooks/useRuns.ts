import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';
import type {
  ApiResponse,
  LatestRunSummary,
  ContextManifest,
  ModelCallSummary,
  StartRunInput,
} from '@/lib/types';

async function parseJson<T>(res: Response): Promise<ApiResponse<T>> {
  return res.json() as Promise<ApiResponse<T>>;
}

export function useLatestRun(projectId: string) {
  return useQuery({
    queryKey: ['latestRun', projectId],
    queryFn: async (): Promise<ApiResponse<LatestRunSummary | null>> => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/runs/latest`);
      if (!res.ok) return { data: null };
      return parseJson<LatestRunSummary | null>(res);
    },
    enabled: !!projectId,
    refetchInterval: (query) => {
      const data = query.state.data?.data;
      if (data && data.status === 'running') return 3000;
      return false;
    },
  });
}

export function useStartRun() {
  return useMutation({
    mutationFn: async ({
      projectId,
      modelIds,
      searchProvider,
      loopMode = 'standard',
      maxRounds = 3,
      checkpointStages = [],
    }: StartRunInput): Promise<ApiResponse<{ runId: string; status: string }>> => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/runs`, {
        method: 'POST',
        body: JSON.stringify({ modelIds, maxRounds, loopMode, searchProvider, checkpointStages }),
      });
      return parseJson(res);
    },
  });
}

export function useRetryRun() {
  return useMutation({
    mutationFn: async (runId: string): Promise<ApiResponse<{ runId: string; status: string }>> => {
      const res = await apiFetch(`${API_BASE}/runs/${runId}/retry`, {
        method: 'POST',
      });
      return parseJson(res);
    },
  });
}

export function useRunModelCalls(runId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['runModelCalls', runId],
    queryFn: async (): Promise<ApiResponse<ModelCallSummary[]>> => {
      const res = await apiFetch(`${API_BASE}/runs/${runId}/model-calls`);
      return parseJson<ModelCallSummary[]>(res);
    },
    enabled: !!runId && enabled,
  });
}

export function useRunContextManifests(runId: string | null) {
  return useQuery({
    queryKey: ['runContextManifests', runId],
    queryFn: async (): Promise<ApiResponse<ContextManifest[]>> => {
      const res = await apiFetch(`${API_BASE}/runs/${runId}/context-manifests`);
      return parseJson<ContextManifest[]>(res);
    },
    enabled: !!runId,
  });
}

export function useRunTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string): Promise<ApiResponse<unknown>> => {
      const res = await apiFetch(`${API_BASE}/tasks/${taskId}/run`, { method: 'POST' });
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      data,
    }: {
      taskId: string;
      data: Partial<{ status: string; objective: string; title: string }>;
    }): Promise<ApiResponse<unknown>> => {
      const res = await apiFetch(`${API_BASE}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useRunComparison(projectId: string, run1Id: string, run2Id: string) {
  return useQuery({
    queryKey: ['runComparison', projectId, run1Id, run2Id],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/runs/compare?run1=${run1Id}&run2=${run2Id}`);
      return parseJson(res);
    },
    enabled: !!projectId && !!run1Id && !!run2Id && run1Id !== run2Id,
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';
import type {
  ApiResponse,
  Claim,
  Evidence,
  ModelConfig,
  Project,
  ProjectDashboard,
  LatestRunSummary,
  CreateProjectInput,
  StartRunInput,
  CreateEvidenceInput,
  CreateDecisionInput,
  IdeaVersion,
  DecisionRecord,
  ContextManifest,
  ModelCallSummary,
} from '@/lib/types';

async function parseJson<T>(res: Response): Promise<ApiResponse<T>> {
  return res.json() as Promise<ApiResponse<T>>;
}

export function useLatestRun(projectId: string) {
  return useQuery({
    queryKey: ['latestRun', projectId],
    queryFn: async (): Promise<LatestRunSummary | null> => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/runs/latest`);
      if (!res.ok) return null;
      const json = await parseJson<LatestRunSummary | null>(res);
      return json.data;
    },
    enabled: !!projectId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && data.status === 'running') return 3000;
      return false;
    },
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async (): Promise<ApiResponse<Project[]>> => {
      const res = await apiFetch(`${API_BASE}/projects`);
      return parseJson<Project[]>(res);
    },
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: async (): Promise<ApiResponse<ProjectDashboard>> => {
      const res = await apiFetch(`${API_BASE}/projects/${id}`);
      return parseJson<ProjectDashboard>(res);
    },
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateProjectInput): Promise<ApiResponse<{ project: Project; ideaVersion: IdeaVersion }>> => {
      const res = await apiFetch(`${API_BASE}/projects`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      data,
    }: {
      projectId: string;
      data: Partial<{ title: string; goal: string; currentSynthesis: string; status: string }>;
    }): Promise<ApiResponse<Project>> => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return parseJson<Project>(res);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects', variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string): Promise<ApiResponse<{ success: boolean }>> => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete project');
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useArchiveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string): Promise<ApiResponse<Project>> => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/archive`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to archive project');
      return parseJson<Project>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
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

export function useExport(projectId: string) {
  const download = async (format: 'json' | 'markdown' | 'pdf') => {
    const res = await apiFetch(`${API_BASE}/projects/${projectId}/export/${format}`);
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ext = format === 'json' ? 'json' : format === 'pdf' ? 'pdf' : 'md';
    a.download = `project-${projectId}.${ext}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return { download };
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

export function useCreateIdeaVersion(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { title: string; description: string }): Promise<ApiResponse<IdeaVersion>> => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/idea-versions`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
    },
  });
}

export function useCreateDecision(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateDecisionInput): Promise<ApiResponse<DecisionRecord>> => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/decisions`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
    },
  });
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

export function useIdeaVersions(projectId: string) {
  return useQuery({
    queryKey: ['ideaVersions', projectId],
    queryFn: async (): Promise<ApiResponse<IdeaVersion[]>> => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/idea-versions`);
      return parseJson<IdeaVersion[]>(res);
    },
    enabled: !!projectId,
  });
}

export function useDecisions(projectId: string) {
  return useQuery({
    queryKey: ['decisions', projectId],
    queryFn: async (): Promise<ApiResponse<DecisionRecord[]>> => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/decisions`);
      return parseJson<DecisionRecord[]>(res);
    },
    enabled: !!projectId,
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

export function useSearchProviderSettings() {
  return useQuery({
    queryKey: ['search-provider'],
    queryFn: async (): Promise<ApiResponse<{ provider: string | null }>> => {
      const res = await apiFetch(`${API_BASE}/settings/search-provider`);
      return parseJson(res);
    },
  });
}

export function useUpdateSearchProviderSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (provider: string | null): Promise<ApiResponse<{ provider: string | null }>> => {
      const res = await apiFetch(`${API_BASE}/settings/search-provider`, {
        method: 'PUT',
        body: JSON.stringify({ provider }),
      });
      return parseJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search-provider'] });
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

// ─── Hypotheses ─────────────────────────────────────────────────────────────

export function useHypotheses(projectId: string) {
  return useQuery({
    queryKey: ['hypotheses', projectId],
    queryFn: async (): Promise<ApiResponse<any[]>> => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/hypotheses`);
      return parseJson(res);
    },
    enabled: !!projectId,
  });
}

export function useCreateHypothesis(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { statement: string; ideaVersionId?: string }) => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/hypotheses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return parseJson(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hypotheses', projectId] }),
  });
}

export function useUpdateHypothesis(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ hypothesisId, data }: { hypothesisId: string; data: any }) => {
      const res = await apiFetch(`${API_BASE}/hypotheses/${hypothesisId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return parseJson(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hypotheses', projectId] }),
  });
}

export function useDeleteHypothesis(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (hypothesisId: string) => {
      const res = await apiFetch(`${API_BASE}/hypotheses/${hypothesisId}`, {
        method: 'DELETE',
      });
      return parseJson(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hypotheses', projectId] }),
  });
}

// ─── Evidence Quality ────────────────────────────────────────────────────────

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

// ─── Prompts ────────────────────────────────────────────────────────────────

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

// ─── Templates ──────────────────────────────────────────────────────────────

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/templates`);
      return parseJson(res);
    },
  });
}

export function useCreateProjectFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { templateId: string; title: string; topic: string }) => {
      const res = await apiFetch(`${API_BASE}/projects/from-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return parseJson(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

// ─── Claim Confidence History ────────────────────────────────────────────────

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

// ─── Version Comparison ──────────────────────────────────────────────────────

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

// ─── Citation Graph ─────────────────────────────────────────────────────────

export function useCitationGraph(projectId: string) {
  return useQuery({
    queryKey: ['citationGraph', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/citation-graph`);
      return parseJson(res);
    },
    enabled: !!projectId,
  });
}

// ─── Calibration Metrics ────────────────────────────────────────────────────

export function useCalibration(projectId: string) {
  return useQuery({
    queryKey: ['calibration', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/calibration`);
      return parseJson(res);
    },
    enabled: !!projectId,
  });
}

// ─── Dataset Export ─────────────────────────────────────────────────────────

export function useDatasetExport(projectId: string) {
  return useQuery({
    queryKey: ['datasetExport', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/dataset-export`);
      return parseJson(res);
    },
    enabled: !!projectId,
  });
}

// ─── Evidence Staleness ─────────────────────────────────────────────────────

export function useStaleEvidence(projectId: string) {
  return useQuery({
    queryKey: ['staleEvidence', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/evidence/stale`);
      return parseJson(res);
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

// ─── Cross-Project Search ───────────────────────────────────────────────────

export function useCrossProjectSearch(projectId: string, query: string) {
  return useQuery({
    queryKey: ['crossProjectSearch', projectId, query],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/cross-project-search`, {
        method: 'POST',
        body: JSON.stringify({ query, limit: 10 }),
      });
      return parseJson(res);
    },
    enabled: !!projectId && query.trim().length > 0,
  });
}

export function useRelatedProjects(projectId: string) {
  return useQuery({
    queryKey: ['relatedProjects', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/related-projects`);
      return parseJson(res);
    },
    enabled: !!projectId,
  });
}

// ─── Run Comparison ─────────────────────────────────────────────────────────

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

// ─── Claim Dependencies ─────────────────────────────────────────────────────

export function useClaimDependencies(claimId: string) {
  return useQuery({
    queryKey: ['claimDependencies', claimId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/placeholder/claims/${claimId}/dependencies`);
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

// ─── Literature Reviews ─────────────────────────────────────────────────────

export function useLiteratureReviews(projectId: string) {
  return useQuery({
    queryKey: ['literatureReviews', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/literature-reviews`);
      return parseJson(res);
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

// ─── Portfolio ──────────────────────────────────────────────────────────────

export function usePortfolio() {
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/portfolio`);
      return parseJson(res);
    },
  });
}

// ─── Evidence Provenance ────────────────────────────────────────────────────

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

// ─── Annotations ────────────────────────────────────────────────────────────

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
      return parseJson(res);
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
      return parseJson(res);
    },
    enabled: !!projectId && query.trim().length > 0,
  });
}

// ─── Evaluation Criteria ────────────────────────────────────────────────────

export function useEvaluationCriteria(projectId: string) {
  return useQuery({
    queryKey: ['evaluationCriteria', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/evaluation-criteria`);
      return parseJson(res);
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

// ─── Reproducibility Pack ───────────────────────────────────────────────────

export function useReproducibilityPack(projectId: string) {
  return useQuery({
    queryKey: ['reproducibilityPack', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/export/reproducibility-pack`);
      return parseJson(res);
    },
    enabled: !!projectId,
  });
}

// ─── Argument Map ───────────────────────────────────────────────────────────

export function useArgumentMap(projectId: string) {
  return useQuery({
    queryKey: ['argumentMap', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/export/argument-map`);
      return parseJson(res);
    },
    enabled: !!projectId,
  });
}

// ─── Real-time Presence ─────────────────────────────────────────────────────

export function usePresence(projectId: string) {
  return useQuery({
    queryKey: ['presence', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/presence`);
      return parseJson(res);
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
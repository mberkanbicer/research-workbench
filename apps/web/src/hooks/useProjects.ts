import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';
import type {
  ApiResponse,
  Project,
  ProjectDashboard,
  CreateProjectInput,
  IdeaVersion,
  DecisionRecord,
  CreateDecisionInput,
} from '@/lib/types';

async function parseJson<T>(res: Response): Promise<ApiResponse<T>> {
  return res.json() as Promise<ApiResponse<T>>;
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

export function usePortfolio() {
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/portfolio`);
      return parseJson(res);
    },
  });
}

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

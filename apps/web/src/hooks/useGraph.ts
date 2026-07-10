import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';

export interface DatasetExport {
  claims?: unknown[];
  evidence?: unknown[];
  reviews?: unknown[];
  critiques?: unknown[];
  decisions?: unknown[];
  ideaVersions?: unknown[];
  runEvents?: unknown[];
  tasks?: unknown[];
}

export interface CalibrationData {
  calibration?: {
    totalClaims: number;
    calibratedClaims: number;
    calibrationScore: number;
  };
  robustness?: {
    robust: number;
    challenged: number;
    vulnerable: number;
    robustnessScore: number;
  };
  calibrationBuckets?: unknown[];
  summary?: Record<string, unknown>;
}

export interface CitationGraphData {
  nodes: GraphNode[];
  edges: CitationGraphEdge[];
}

interface GraphNode {
  id: string;
  type: 'claim' | 'evidence' | 'critique' | 'review' | 'decision';
  label: string;
}

export interface CitationGraphEdge {
  source: string;
  target: string;
  type: string;
  relation?: string;
  sourceType?: string;
  targetType?: string;
}

async function parseJson<T>(res: Response): Promise<{ data: T }> {
  return res.json() as Promise<{ data: T }>;
}

export function useCitationGraph(projectId: string) {
  return useQuery({
    queryKey: ['citationGraph', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/citation-graph`);
      return parseJson<CitationGraphData>(res);
    },
    enabled: !!projectId,
  });
}

export function useCalibration(projectId: string) {
  return useQuery({
    queryKey: ['calibration', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/calibration`);
      return parseJson<CalibrationData>(res);
    },
    enabled: !!projectId,
  });
}

export function useDatasetExport(projectId: string) {
  return useQuery({
    queryKey: ['datasetExport', projectId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/dataset-export`);
      return parseJson<DatasetExport>(res);
    },
    enabled: !!projectId,
  });
}

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

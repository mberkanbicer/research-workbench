'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API_BASE } from '@/lib/apiFetch';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DocumentPermission {
  userId: string;
  email: string;
  name: string;
  role: 'viewer' | 'editor' | 'admin';
  isOwner?: boolean;
}

export interface PermissionsResponse {
  permissions: DocumentPermission[];
  owner: DocumentPermission | null;
  yourRole: string | null;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  content: string;
  title: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  authorId: string | null;
  author: { id: string; email: string; name: string } | null;
  createdAt: string;
}

export interface DiffLine {
  type: 'equal' | 'insert' | 'delete';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  unchanged: number;
}

export interface VersionComparison {
  version1: { version: number; title: string; author: any; createdAt: string; message: string | null };
  version2: { version: number; title: string; author: any; createdAt: string; message: string | null };
  diff: { lines: DiffLine[]; stats: DiffStats; html: string };
}

export interface DocumentComment {
  id: string;
  documentId: string;
  userId: string;
  content: string;
  parentId: string | null;
  startOffset: number;
  endOffset: number;
  resolved: boolean;
  user: { id: string; email: string; name: string };
  replies?: DocumentComment[];
  createdAt: string;
  updatedAt: string;
}

export interface Reference {
  id: string;
  projectId: string;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  volume: string | null;
  pages: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  citationKey: string;
  type: string;
  tags: string[];
  metadata: Record<string, unknown> | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  skippedKeys: string[];
  references: Reference[];
}

export interface TemplateMarketplaceItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  authorId: string;
  downloads: number;
  rating: number;
  tags: string[];
  createdAt: string;
  author: { id: string; name: string };
}

export interface TemplateMarketplaceDetail extends TemplateMarketplaceItem {
  content: string;
  metadata: Record<string, unknown> | null;
}

// ─── Permissions ────────────────────────────────────────────────────────────

async function parseJson<T>(res: Response): Promise<{ data: T }> {
  return res.json() as Promise<{ data: T }>;
}

export function useDocumentPermissions(documentId: string | null) {
  return useQuery({
    queryKey: ['document-permissions', documentId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${documentId}/permissions`);
      const json = await res.json();
      return json.data as PermissionsResponse;
    },
    enabled: !!documentId,
  });
}

export function useCheckDocumentAccess(documentId: string | null) {
  return useQuery({
    queryKey: ['document-access-check', documentId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${documentId}/permissions/check`);
      const json = await res.json();
      return json.data as { hasAccess: boolean; role: string | null; canView: boolean; canEdit: boolean; canAdmin: boolean };
    },
    enabled: !!documentId,
  });
}

export function useGrantDocumentPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, userId, role }: { documentId: string; userId: string; role: string }) => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${documentId}/permissions`, {
        method: 'POST',
        body: JSON.stringify({ userId, role }),
      });
      return parseJson(res);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['document-permissions', vars.documentId] });
    },
  });
}

export function useUpdateDocumentPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, targetUserId, role }: { documentId: string; targetUserId: string; role: string }) => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${documentId}/permissions/${targetUserId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      return parseJson(res);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['document-permissions', vars.documentId] });
    },
  });
}

export function useRevokeDocumentPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, targetUserId }: { documentId: string; targetUserId: string }) => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${documentId}/permissions/${targetUserId}`, {
        method: 'DELETE',
      });
      return parseJson(res);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['document-permissions', vars.documentId] });
    },
  });
}

// ─── Version History ────────────────────────────────────────────────────────

export function useDocumentVersions(documentId: string | null) {
  return useQuery({
    queryKey: ['document-versions', documentId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${documentId}/versions`);
      const json = await res.json();
      return json.data as DocumentVersion[];
    },
    enabled: !!documentId,
  });
}

export function useDocumentVersion(documentId: string, version: number | null) {
  return useQuery({
    queryKey: ['document-version', documentId, version],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${documentId}/versions/${version}`);
      const json = await res.json();
      return json.data as DocumentVersion;
    },
    enabled: !!documentId && version !== null,
  });
}

export function useCreateDocumentVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, message }: { documentId: string; message?: string }) => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${documentId}/versions`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      return parseJson(res);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['document-versions', vars.documentId] });
    },
  });
}

export function useRestoreDocumentVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, version }: { documentId: string; version: number }) => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${documentId}/versions/${version}/restore`, {
        method: 'POST',
      });
      return parseJson(res);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['document-versions', vars.documentId] });
      qc.invalidateQueries({ queryKey: ['latex-document'] });
    },
  });
}

export function useDocumentVersionCompare(documentId: string | null, v1: number | null, v2: number | null) {
  return useQuery({
    queryKey: ['document-version-compare', documentId, v1, v2],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${documentId}/versions/compare?v1=${v1}&v2=${v2}`);
      const json = await res.json();
      return json.data as VersionComparison;
    },
    enabled: !!documentId && v1 !== null && v2 !== null && v1 !== v2,
  });
}

// ─── Comments ───────────────────────────────────────────────────────────────

export function useDocumentComments(documentId: string | null, resolved?: boolean) {
  return useQuery({
    queryKey: ['document-comments', documentId, resolved],
    queryFn: async () => {
      const params = resolved !== undefined ? `?resolved=${resolved}` : '';
      const res = await apiFetch(`${API_BASE}/latex/documents/${documentId}/comments${params}`);
      const json = await res.json();
      return json.data as DocumentComment[];
    },
    enabled: !!documentId,
  });
}

export function useCreateDocumentComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      documentId: string;
      content: string;
      startOffset: number;
      endOffset: number;
      parentId?: string;
    }) => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${data.documentId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          content: data.content,
          startOffset: data.startOffset,
          endOffset: data.endOffset,
          parentId: data.parentId,
        }),
      });
      return parseJson(res);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['document-comments', vars.documentId] });
    },
  });
}

export function useUpdateDocumentComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, commentId, content }: { documentId: string; commentId: string; content: string }) => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${documentId}/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
      return parseJson(res);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['document-comments', vars.documentId] });
    },
  });
}

export function useDeleteDocumentComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, commentId }: { documentId: string; commentId: string }) => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${documentId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      return parseJson(res);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['document-comments', vars.documentId] });
    },
  });
}

export function useResolveDocumentComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentId, commentId }: { documentId: string; commentId: string }) => {
      const res = await apiFetch(`${API_BASE}/latex/documents/${documentId}/comments/${commentId}/resolve`, {
        method: 'POST',
      });
      return parseJson(res);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['document-comments', vars.documentId] });
    },
  });
}

// ─── References ─────────────────────────────────────────────────────────────

export function useReferences(projectId: string | null, filters?: { search?: string; tag?: string; type?: string }) {
  return useQuery({
    queryKey: ['references', projectId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.search) params.set('search', filters.search);
      if (filters?.tag) params.set('tag', filters.tag);
      if (filters?.type) params.set('type', filters.type);
      const qs = params.toString();
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/references${qs ? `?${qs}` : ''}`);
      const json = await res.json();
      return json.data as Reference[];
    },
    enabled: !!projectId,
  });
}

export function useCreateReference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, ...data }: { projectId: string } & Omit<Reference, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'source'>) => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/references`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return parseJson(res);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['references', vars.projectId] });
    },
  });
}

export function useDeleteReference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, referenceId }: { projectId: string; referenceId: string }) => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/references/${referenceId}`, {
        method: 'DELETE',
      });
      return parseJson(res);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['references', vars.projectId] });
    },
  });
}

export function useImportReferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, content, format }: { projectId: string; content: string; format: 'bibtex' | 'ris' }) => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/references/import`, {
        method: 'POST',
        body: JSON.stringify({ content, format }),
      });
      return parseJson(res) as Promise<{ data: ImportResult }>;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['references', vars.projectId] });
    },
  });
}

export function useExportReferences() {
  return {
    downloadBibTeX: async (projectId: string) => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/references/export`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `references-${projectId}.bib`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    downloadCSV: async (projectId: string) => {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/references/export?format=csv`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `references-${projectId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };
}

// ─── Template Marketplace ───────────────────────────────────────────────────

export function useMarketplaceTemplates(filters?: { q?: string; category?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['marketplace-templates', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.q) params.set('q', filters.q);
      if (filters?.category) params.set('category', filters.category);
      if (filters?.page) params.set('page', String(filters.page));
      if (filters?.limit) params.set('limit', String(filters.limit));
      const qs = params.toString();
      const res = await apiFetch(`${API_BASE}/latex/templates/marketplace${qs ? `?${qs}` : ''}`);
      const json = await res.json();
      return json.data as { templates: TemplateMarketplaceItem[]; pagination: { page: number; limit: number; total: number; pages: number } };
    },
  });
}

export function useMarketplaceTemplate(id: string | null) {
  return useQuery({
    queryKey: ['marketplace-template', id],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/latex/templates/marketplace/${id}`);
      const json = await res.json();
      return json.data as TemplateMarketplaceDetail;
    },
    enabled: !!id,
  });
}

export function useMarketplaceCategories() {
  return useQuery({
    queryKey: ['marketplace-categories'],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/latex/templates/marketplace/categories`);
      const json = await res.json();
      return json.data as { id: string; name: string; count: number }[];
    },
  });
}

export function usePublishTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; category: string; content: string; tags?: string[] }) => {
      const res = await apiFetch(`${API_BASE}/latex/templates/marketplace`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return parseJson(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketplace-templates'] });
    },
  });
}

export function useUseMarketplaceTemplate() {
  return useMutation({
    mutationFn: async (templateId: string) => {
      const res = await apiFetch(`${API_BASE}/latex/templates/marketplace/${templateId}/use`, {
        method: 'POST',
      });
      const json = await res.json();
      return json.data as { content: string };
    },
  });
}

// ─── Collaborators ──────────────────────────────────────────────────────────

export interface Collaborator {
  id: string;
  collaboratorId?: string;
  userId?: string;
  userName: string;
  color: string;
  cursor?: { line: number; column: number };
  selection?: { start: number; end: number };
  isTyping?: boolean;
  typingStartedAt?: number;
}

export function useCollaborators(documentId: string | null) {
  return useQuery({
    queryKey: ['collaborators', documentId],
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/documents/${documentId}/collaborators`);
      const json = await res.json();
      return json.data as Collaborator[];
    },
    enabled: !!documentId,
    refetchInterval: 5000,
  });
}

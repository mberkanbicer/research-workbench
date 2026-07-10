/**
 * Tests for collaboration routes:
 * - Document Permissions CRUD + role checks
 * - Document Versions CRUD + compare + restore
 * - Document Comments CRUD + resolve + threaded replies
 * - References CRUD + import/export
 * - Template Marketplace CRUD + use + categories
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

function id() { return crypto.randomUUID(); }

const TEST_USER = { id: '11111111-1111-1111-1111-111111111111', email: 'test@test.com', name: 'Test' };
const OTHER_USER = { id: '22222222-2222-2222-2222-222222222222', email: 'other@test.com', name: 'Other' };

// In-memory stores
const docs = new Map<string, any>();
const permissions = new Map<string, any>();
const versions = new Map<string, any>();
const comments = new Map<string, any>();
const refs = new Map<string, any>();
const templates = new Map<string, any>();
const projects = new Map<string, any>();

function resetStores() {
  docs.clear();
  permissions.clear();
  versions.clear();
  comments.clear();
  refs.clear();
  templates.clear();
  projects.clear();
  projects.set('project-id', { id: 'project-id', title: 'Test', userId: TEST_USER.id });
}

// Build mock prisma that uses our stores
const mockPrisma = {
  laTeXDocument: {
    findUnique: vi.fn(({ where }: any) => {
      const doc = docs.get(where.id);
      if (!doc) return Promise.resolve(null);
      // Handle select parameter
      if (where.select) {
        const result: any = {};
        for (const key of Object.keys(where.select)) {
          result[key] = doc[key];
        }
        return Promise.resolve(result);
      }
      return Promise.resolve(doc);
    }),
    findMany: vi.fn(({ where }: any) => {
      return Promise.resolve(Array.from(docs.values()).filter(d => !where?.projectId || d.projectId === where.projectId));
    }),
    update: vi.fn(({ where, data }: any) => {
      const doc = docs.get(where.id);
      if (!doc) return Promise.reject(new Error('Not found'));
      Object.assign(doc, data);
      return Promise.resolve(doc);
    }),
  },
  documentPermission: {
    findMany: vi.fn(({ where }: any) => {
      return Promise.resolve(Array.from(permissions.values()).filter(p => p.documentId === where.documentId));
    }),
    findUnique: vi.fn(({ where }: any) => {
      const key = `${where.documentId_userId?.documentId}_${where.documentId_userId?.userId}`;
      return Promise.resolve(permissions.get(key) || null);
    }),
    upsert: vi.fn(({ where, create, update }: any) => {
      const key = `${where.documentId_userId?.documentId}_${where.documentId_userId?.userId}`;
      const existing = permissions.get(key);
      if (existing) {
        if (update) Object.assign(existing, update);
        return Promise.resolve(existing);
      }
      const perm = { id: id(), ...create, createdAt: new Date() };
      permissions.set(key, perm);
      return Promise.resolve(perm);
    }),
    delete: vi.fn(({ where }: any) => {
      const key = `${where.documentId_userId?.documentId}_${where.documentId_userId?.userId}`;
      permissions.delete(key);
      return Promise.resolve({});
    }),
  },
  documentVersion: {
    findMany: vi.fn(({ where, orderBy }: any) => {
      let v = Array.from(versions.values()).filter(v => v.documentId === where.documentId);
      if (orderBy?.version === 'desc') v.sort((a, b) => b.version - a.version);
      return Promise.resolve(v);
    }),
    findFirst: vi.fn(({ where, orderBy }: any) => {
      let v = Array.from(versions.values()).filter(v => v.documentId === where.documentId);
      if (orderBy?.version === 'desc') v.sort((a, b) => b.version - a.version);
      return Promise.resolve(v[0] || null);
    }),
    findUnique: vi.fn(({ where }: any) => {
      const key = `${where.documentId_version?.documentId}_${where.documentId_version?.version}`;
      return Promise.resolve(versions.get(key) || null);
    }),
    create: vi.fn(({ data }: any) => {
      const v = { id: id(), ...data, createdAt: new Date() };
      versions.set(`${v.documentId}_${v.version}`, v);
      return Promise.resolve(v);
    }),
  },
  documentComment: {
    findMany: vi.fn(({ where }: any) => {
      return Promise.resolve(Array.from(comments.values()).filter(c =>
        c.documentId === where.documentId && (where.parentId === undefined || c.parentId === where.parentId)
      ));
    }),
    findUnique: vi.fn(({ where }: any) => Promise.resolve(comments.get(where.id) || null)),
    create: vi.fn(({ data }: any) => {
      const c = { id: id(), ...data, createdAt: new Date(), updatedAt: new Date() };
      comments.set(c.id, c);
      return Promise.resolve(c);
    }),
    update: vi.fn(({ where, data }: any) => {
      const c = comments.get(where.id);
      if (!c) return Promise.reject(new Error('Not found'));
      Object.assign(c, data);
      return Promise.resolve(c);
    }),
    delete: vi.fn(({ where }: any) => {
      comments.delete(where.id);
      return Promise.resolve({});
    }),
    deleteMany: vi.fn(({ where }: any) => {
      for (const [key, val] of comments) {
        if (val.parentId === where.parentId) comments.delete(key);
      }
      return Promise.resolve({});
    }),
  },
  reference: {
    findMany: vi.fn(({ where }: any) => {
      return Promise.resolve(Array.from(refs.values()).filter(r => r.projectId === where.projectId));
    }),
    findUnique: vi.fn(({ where }: any) => Promise.resolve(refs.get(where.id) || null)),
    findFirst: vi.fn(({ where }: any) => {
      const r = Array.from(refs.values()).find(r =>
        r.projectId === where.projectId && (where.id ? r.id === where.id : r.citationKey === where.citationKey)
      );
      return Promise.resolve(r || null);
    }),
    create: vi.fn(({ data }: any) => {
      const r = { id: id(), ...data, createdAt: new Date(), updatedAt: new Date() };
      refs.set(r.id, r);
      return Promise.resolve(r);
    }),
    delete: vi.fn(({ where }: any) => {
      refs.delete(where.id);
      return Promise.resolve({});
    }),
  },
  researchProject: {
    findUnique: vi.fn(({ where }: any) => {
      const project = projects.get(where.id);
      if (!project) return Promise.resolve(null);
      // Handle select parameter
      if (where.select) {
        const result: any = {};
        for (const key of Object.keys(where.select)) {
          result[key] = project[key];
        }
        return Promise.resolve(result);
      }
      return Promise.resolve(project);
    }),
  },
  laTeXTemplate: {
    findMany: vi.fn(() => Promise.resolve(Array.from(templates.values()).filter(t => t.isPublic))),
    count: vi.fn(() => Promise.resolve(0)),
    groupBy: vi.fn(() => Promise.resolve([])),
    findUnique: vi.fn(({ where }: any) => Promise.resolve(templates.get(where.id) || null)),
    create: vi.fn(({ data }: any) => {
      const t = { id: id(), ...data, downloads: 0, rating: null, createdAt: new Date(), updatedAt: new Date() };
      templates.set(t.id, t);
      return Promise.resolve(t);
    }),
    update: vi.fn(({ where, data }: any) => {
      const t = templates.get(where.id);
      if (!t) return Promise.reject(new Error('Not found'));
      // Handle Prisma increment operations
      for (const [key, val] of Object.entries(data)) {
        if (val && typeof val === 'object' && 'increment' in (val as any)) {
          t[key] = (t[key] || 0) + (val as any).increment;
        } else {
          t[key] = val;
        }
      }
      return Promise.resolve(t);
    }),
    delete: vi.fn(({ where }: any) => {
      templates.delete(where.id);
      return Promise.resolve({});
    }),
  },
};

vi.mock('../prisma.js', () => ({ prisma: mockPrisma, default: mockPrisma }));

vi.mock('./auth.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./auth.js')>();
  return {
    ...original,
    authMiddleware: vi.fn(async (request: any) => {
      request.user = TEST_USER;
    }),
  };
});

vi.mock('../middleware/document-auth.js', () => ({
  requireDocumentPermission: vi.fn(async () => {}),
  getDocumentRole: vi.fn().mockResolvedValue('admin'),
}));

vi.mock('./ownership.js', () => ({
  requireProjectAccess: vi.fn(async () => true),
}));

vi.mock('../utils/diff.js', () => ({
  computeDiff: vi.fn().mockReturnValue({
    lines: [
      { type: 'equal', content: 'unchanged', oldLineNum: 1, newLineNum: 1 },
      { type: 'delete', content: 'removed', oldLineNum: 2 },
      { type: 'insert', content: 'added', newLineNum: 2 },
    ],
    stats: { additions: 1, deletions: 1, unchanged: 1 },
  }),
  diffToHtml: vi.fn().mockReturnValue('<div>diff html</div>'),
}));

vi.mock('../services/reference-import.service.js', () => ({
  parseBibTeX: vi.fn().mockReturnValue([
    { title: 'Imported', authors: ['Author'], year: 2024, citationKey: 'auth2024', type: 'article', tags: [] },
  ]),
  parseRIS: vi.fn().mockReturnValue([
    { title: 'RIS Paper', authors: ['Author'], year: 2023, citationKey: 'auth2023', type: 'article', tags: [] },
  ]),
  generateBibTeXFile: vi.fn().mockReturnValue('@article{key,\n  title={Test}\n}'),
  generateCitationKey: vi.fn().mockReturnValue('auto2024'),
  ImportedReference: {},
}));

async function buildApp() {
  const app = Fastify();
  const { documentPermissionsRoutes } = await import('./document-permissions.js');
  const { documentVersionsRoutes } = await import('./document-versions.js');
  const { documentCommentsRoutes } = await import('./document-comments.js');
  const { referencesRoutes } = await import('./references.js');
  const { templateMarketplaceRoutes } = await import('./template-marketplace.js');
  app.register(documentPermissionsRoutes);
  app.register(documentVersionsRoutes);
  app.register(documentCommentsRoutes);
  app.register(referencesRoutes);
  app.register(templateMarketplaceRoutes);
  await app.ready();
  return app;
}

function seedDoc(overrides: Record<string, any> = {}) {
  const docId = id();
  const doc = {
    id: docId, projectId: 'project-id', title: 'Doc', content: 'Hello',
    template: 'article', metadata: null, compiledPdf: null, status: 'draft',
    lastError: null, createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
  docs.set(docId, doc);
  return doc;
}

// ─── Document Permissions ───────────────────────────────────────────────────

describe('Document Permissions', () => {
  let app: any;
  beforeEach(async () => { resetStores(); app = await buildApp(); });

  it('GET /latex/documents/:id/permissions returns list', async () => {
    const doc = seedDoc();
    const res = await app.inject({ method: 'GET', url: `/latex/documents/${doc.id}/permissions` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data).toHaveProperty('yourRole');
  });

  it('GET /latex/documents/:id/permissions returns 404 for missing doc', async () => {
    const res = await app.inject({ method: 'GET', url: `/latex/documents/${id()}/permissions` });
    expect(res.statusCode).toBe(404);
  });

  it('POST /latex/documents/:id/permissions grants permission', async () => {
    const doc = seedDoc();
    const res = await app.inject({ method: 'POST', url: `/latex/documents/${doc.id}/permissions`,
      payload: { userId: OTHER_USER.id, role: 'editor' } });
    if (res.statusCode !== 201) {
      console.log('Response:', res.payload);
    }
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).data.role).toBe('editor');
  });

  it('DELETE /latex/documents/:id/permissions/:userId revokes', async () => {
    const doc = seedDoc();
    await app.inject({ method: 'POST', url: `/latex/documents/${doc.id}/permissions`,
      payload: { userId: OTHER_USER.id, role: 'viewer' } });
    const res = await app.inject({ method: 'DELETE', url: `/latex/documents/${doc.id}/permissions/${OTHER_USER.id}` });
    expect(res.statusCode).toBe(200);
  });

  it('GET /latex/documents/:id/permissions/check returns access', async () => {
    const doc = seedDoc();
    const res = await app.inject({ method: 'GET', url: `/latex/documents/${doc.id}/permissions/check` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data).toHaveProperty('canEdit');
  });
});

// ─── Document Versions ──────────────────────────────────────────────────────

describe('Document Versions', () => {
  let app: any;
  beforeEach(async () => { resetStores(); app = await buildApp(); });

  it('GET /latex/documents/:id/versions returns list', async () => {
    const doc = seedDoc();
    const res = await app.inject({ method: 'GET', url: `/latex/documents/${doc.id}/versions` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data).toEqual([]);
  });

  it('POST /latex/documents/:id/versions creates version', async () => {
    const doc = seedDoc();
    const res = await app.inject({ method: 'POST', url: `/latex/documents/${doc.id}/versions`,
      payload: { message: 'v1' } });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).data.version).toBe(1);
  });

  it('GET /latex/documents/:id/versions/compare computes diff', async () => {
    const doc = seedDoc();
    await app.inject({ method: 'POST', url: `/latex/documents/${doc.id}/versions`, payload: {} });
    docs.get(doc.id).content = 'Changed';
    await app.inject({ method: 'POST', url: `/latex/documents/${doc.id}/versions`, payload: {} });
    const res = await app.inject({ method: 'GET', url: `/latex/documents/${doc.id}/versions/compare?v1=1&v2=2` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data).toHaveProperty('diff');
  });

  it('POST /latex/documents/:id/versions/:v/restore restores', async () => {
    const doc = seedDoc();
    await app.inject({ method: 'POST', url: `/latex/documents/${doc.id}/versions`, payload: {} });
    const res = await app.inject({ method: 'POST', url: `/latex/documents/${doc.id}/versions/1/restore` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.restoredVersion).toBe(1);
  });
});

// ─── Document Comments ──────────────────────────────────────────────────────

describe('Document Comments', () => {
  let app: any;
  beforeEach(async () => { resetStores(); app = await buildApp(); });

  it('GET /latex/documents/:id/comments returns list', async () => {
    const doc = seedDoc();
    const res = await app.inject({ method: 'GET', url: `/latex/documents/${doc.id}/comments` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data).toEqual([]);
  });

  it('POST /latex/documents/:id/comments creates comment', async () => {
    const doc = seedDoc();
    const res = await app.inject({ method: 'POST', url: `/latex/documents/${doc.id}/comments`,
      payload: { content: 'Nice', startOffset: 0, endOffset: 4 } });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).data.content).toBe('Nice');
  });

  it('PATCH /latex/documents/:id/comments/:cid updates', async () => {
    const doc = seedDoc();
    const cr = await app.inject({ method: 'POST', url: `/latex/documents/${doc.id}/comments`,
      payload: { content: 'Old', startOffset: 0, endOffset: 3 } });
    const cid = JSON.parse(cr.payload).data.id;
    const res = await app.inject({ method: 'PATCH', url: `/latex/documents/${doc.id}/comments/${cid}`,
      payload: { content: 'New' } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.content).toBe('New');
  });

  it('POST /latex/documents/:id/comments/:cid/resolve toggles', async () => {
    const doc = seedDoc();
    const cr = await app.inject({ method: 'POST', url: `/latex/documents/${doc.id}/comments`,
      payload: { content: 'Resolve', startOffset: 0, endOffset: 7 } });
    const cid = JSON.parse(cr.payload).data.id;
    const res = await app.inject({ method: 'POST', url: `/latex/documents/${doc.id}/comments/${cid}/resolve` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.resolved).toBe(true);
  });

  it('DELETE /latex/documents/:id/comments/:cid deletes', async () => {
    const doc = seedDoc();
    const cr = await app.inject({ method: 'POST', url: `/latex/documents/${doc.id}/comments`,
      payload: { content: 'Del', startOffset: 0, endOffset: 3 } });
    const cid = JSON.parse(cr.payload).data.id;
    const res = await app.inject({ method: 'DELETE', url: `/latex/documents/${doc.id}/comments/${cid}` });
    expect(res.statusCode).toBe(200);
  });
});

// ─── References ─────────────────────────────────────────────────────────────

describe('References', () => {
  let app: any;
  beforeEach(async () => { resetStores(); app = await buildApp(); });

  it('GET /projects/:pid/references returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/projects/project-id/references' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data).toEqual([]);
  });

  it('POST /projects/:pid/references creates reference', async () => {
    const res = await app.inject({ method: 'POST', url: '/projects/project-id/references',
      payload: { title: 'Paper', authors: ['A'], type: 'article', tags: [] } });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).data).toHaveProperty('citationKey');
  });

  it('POST /projects/:pid/references/import imports BibTeX', async () => {
    const res = await app.inject({ method: 'POST', url: '/projects/project-id/references/import',
      payload: { content: '@article{k,t={T}}', format: 'bibtex' } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data.imported).toBe(1);
  });

  it('GET /projects/:pid/references/export returns BibTeX', async () => {
    await app.inject({ method: 'POST', url: '/projects/project-id/references',
      payload: { title: 'X', authors: ['A'], type: 'article', tags: [] } });
    const res = await app.inject({ method: 'GET', url: '/projects/project-id/references/export' });
    expect(res.statusCode).toBe(200);
  });

  it('DELETE /projects/:pid/references/:rid deletes', async () => {
    const cr = await app.inject({ method: 'POST', url: '/projects/project-id/references',
      payload: { title: 'Del', authors: ['A'], type: 'article', tags: [] } });
    const rid = JSON.parse(cr.payload).data.id;
    const res = await app.inject({ method: 'DELETE', url: `/projects/project-id/references/${rid}` });
    expect(res.statusCode).toBe(200);
  });
});

// ─── Template Marketplace ───────────────────────────────────────────────────

describe('Template Marketplace', () => {
  let app: any;
  beforeEach(async () => { resetStores(); app = await buildApp(); });

  it('GET /latex/templates/marketplace returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/latex/templates/marketplace' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data).toHaveProperty('templates');
  });

  it('GET /latex/templates/marketplace/categories returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/latex/templates/marketplace/categories' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /latex/templates/marketplace publishes template', async () => {
    const res = await app.inject({ method: 'POST', url: '/latex/templates/marketplace',
      payload: { name: 'T', category: 'academic', content: '\\doc' } });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).data.name).toBe('T');
  });

  it('POST /latex/templates/marketplace/:id/use increments downloads', async () => {
    const tid = id();
    templates.set(tid, { id: tid, name: 'Use', content: '\\doc', isPublic: true, downloads: 0 });
    const res = await app.inject({ method: 'POST', url: `/latex/templates/marketplace/${tid}/use` });
    expect(res.statusCode).toBe(200);
    expect(templates.get(tid).downloads).toBe(1);
  });

  it('DELETE /latex/templates/marketplace/:id deletes', async () => {
    const tid = id();
    templates.set(tid, { id: tid, name: 'Del', authorId: TEST_USER.id, isPublic: true });
    const res = await app.inject({ method: 'DELETE', url: `/latex/templates/marketplace/${tid}` });
    expect(res.statusCode).toBe(200);
    expect(templates.has(tid)).toBe(false);
  });
});

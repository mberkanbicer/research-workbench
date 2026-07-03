/**
 * Tests for feedback, settings, api-keys, SSE poll mode, and ownership enforcement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { feedbackRoutes } from './feedback.js';
import { settingsRoutes } from './settings.js';
import { apiKeyRoutes } from './api-keys.js';
import { runRoutes } from './runs.js';
import { authMiddleware } from './auth.js';

type Store = Record<string, Map<string, any>>;

function createEmptyStore(): Store {
  return {
    user: new Map(),
    userFeedback: new Map(),
    userApiKey: new Map(),
    researchProject: new Map(),
    runEvent: new Map(),
    runStage: new Map(),
    modelConfig: new Map(),
    modelCall: new Map(),
    authSession: new Map(),
    ideaVersion: new Map(),
    claim: new Map(),
    evidence: new Map(),
    decisionRecord: new Map(),
    researchTask: new Map(),
    rawEvent: new Map(),
    evidenceAssessment: new Map(),
    modelReview: new Map(),
    critique: new Map(),
    critiqueResponse: new Map(),
    contextManifest: new Map(),
    knowledgeEdge: new Map(),
    hypothesis: new Map(),
    summary: new Map(),
    sourceEmbedding: new Map(),
    researchSession: new Map(),
    promptVersion: new Map(),
    promptCall: new Map(),
  };
}

function id() {
  return crypto.randomUUID();
}

const TEST_USER = { id: 'user-a', email: 'a@test.com', name: 'User A' };
const OTHER_USER = { id: 'user-b', email: 'b@test.com', name: 'User B' };

const { mockPrisma, mockStore } = vi.hoisted(() => {
  const store = createEmptyStore();

  function makeModel(table: string, s: Store) {
    return {
      findUnique: (args: any) => {
        if (args.where.id) return s[table]?.get(args.where.id) || null;
        if (args.where.email) {
          for (const v of (s[table] || new Map()).values()) {
            if (v.email === args.where.email) return v;
          }
        }
        return null;
      },
      findFirst: (args: any) => {
        let items = Array.from((s[table] || new Map()).values());
        const where = args?.where;
        if (where) {
          for (const [key, val] of Object.entries(where)) {
            if (val !== undefined && val !== null && typeof val !== 'object') {
              items = items.filter((item: any) => item[key] === val);
            }
          }
        }
        if (args?.orderBy) {
          for (const [field, dir] of Object.entries(args.orderBy)) {
            const mul = dir === 'desc' ? -1 : 1;
            items.sort((a: any, b: any) => {
              const av = a[field] instanceof Date ? a[field].getTime() : a[field];
              const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
              return av > bv ? mul : av < bv ? -mul : 0;
            });
          }
        }
        return items[0] || null;
      },
      findMany: (args: any) => {
        let items = Array.from((s[table] || new Map()).values());
        const where = args?.where;
        if (where) {
          for (const [key, val] of Object.entries(where)) {
            if (val !== undefined && val !== null && typeof val !== 'object') {
              items = items.filter((item: any) => item[key] === val);
            }
          }
        }
        if (args?.orderBy) {
          for (const [field, dir] of Object.entries(args.orderBy)) {
            const mul = dir === 'desc' ? -1 : 1;
            items.sort((a: any, b: any) => {
              const av = a[field] instanceof Date ? a[field].getTime() : a[field];
              const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
              return av > bv ? mul : av < bv ? -mul : 0;
            });
          }
        }
        return items;
      },
      create: (args: any) => {
        const record = { ...args.data, id: args.data.id || id(), createdAt: new Date(), updatedAt: new Date() };
        s[table]?.set(record.id, record);
        return record;
      },
      update: (args: any) => {
        const existing = s[table]?.get(args.where.id);
        const record = { ...existing, ...args.data, updatedAt: new Date() };
        s[table]?.set(args.where.id, record);
        return record;
      },
      delete: (args: any) => {
        const existing = s[table]?.get(args.where.id);
        s[table]?.delete(args.where.id);
        return existing;
      },
      updateMany: async () => ({ count: 0 }),
      deleteMany: async () => ({ count: 0 }),
      count: async () => 0,
      upsert: async (args: any) => {
        const existing = s[table]?.get(args.where.id);
        if (existing) return makeModel(table, s).update({ where: args.where, data: args.update });
        return makeModel(table, s).create({ data: { ...args.create, id: args.where.id } });
      },
    };
  }

  function buildPrisma(s: Store) {
    const models: Record<string, ReturnType<typeof makeModel>> = {};
    for (const table of Object.keys(s)) {
      models[table] = makeModel(table, s);
    }
    return { ...models, $disconnect: () => {} };
  }

  return { mockPrisma: buildPrisma(store), mockStore: store };
});

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

vi.mock('../orchestrator/worker.js', () => ({
  deliberationQueue: { add: vi.fn(), getJob: vi.fn().mockResolvedValue(null) },
  deliberationWorker: { on: vi.fn(), close: vi.fn() },
}));

vi.mock('../services/event.service.js', () => ({
  RunEventService: vi.fn().mockImplementation(() => ({
    record: vi.fn(),
    getEvents: vi.fn().mockImplementation(async (runId: string) => {
      return Array.from(mockStore.runEvent.values())
        .filter((e: any) => e.runId === runId)
        .sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime());
    }),
  })),
  EventService: vi.fn().mockImplementation(() => ({
    recordRunCompleted: vi.fn(),
  })),
}));

function seedProject(ownerId: string, projectId = id()) {
  mockStore.researchProject.set(projectId, {
    id: projectId,
    title: 'Test Project',
    goal: 'Test goal',
    status: 'active',
    userId: ownerId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return projectId;
}

function seedRun(projectId: string, runId = id()) {
  const eventId = id();
  mockStore.runEvent.set(eventId, {
    id: eventId,
    runId,
    projectId,
    type: 'run.started',
    payload: { modelIds: [], maxRounds: 3 },
    createdAt: new Date(),
  });
  return runId;
}

describe('Feedback routes', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore)) map.clear();
  });

  it('creates and lists feedback', async () => {
    const projectId = seedProject(TEST_USER.id);
    const app = Fastify();
    await app.register(feedbackRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/feedback',
      payload: {
        projectId,
        targetType: 'evidence',
        targetId: 'ev-1',
        feedbackType: 'positive',
      },
    });
    expect(createRes.statusCode).toBe(201);

    const listRes = await app.inject({ method: 'GET', url: `/feedback/${projectId}` });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data).toHaveLength(1);
  });

  it('returns 404 for another user project', async () => {
    const projectId = seedProject(OTHER_USER.id);
    const app = Fastify();
    await app.register(feedbackRoutes);

    const res = await app.inject({ method: 'GET', url: `/feedback/${projectId}` });
    expect(res.statusCode).toBe(404);
  });
});

describe('Settings routes', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore)) map.clear();
    mockStore.user.set(TEST_USER.id, {
      id: TEST_USER.id,
      email: TEST_USER.email,
      name: TEST_USER.name,
      defaultSearchProvider: null,
      passwordHash: 'x',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('updates default search provider', async () => {
    const app = Fastify();
    await app.register(settingsRoutes);

    const putRes = await app.inject({
      method: 'PUT',
      url: '/settings/search-provider',
      payload: { provider: 'mock' },
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().data.provider).toBe('mock');

    const getRes = await app.inject({ method: 'GET', url: '/settings/search-provider' });
    expect(getRes.json().data.provider).toBe('mock');
  });
});

describe('API key routes', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore)) map.clear();
  });

  it('stores keys without returning secret material', async () => {
    const app = Fastify();
    await app.register(apiKeyRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/user/keys',
      payload: { label: 'Test Key', provider: 'openrouter', apiKey: 'sk-secret-key-12345' },
    });
    expect(createRes.statusCode).toBe(201);
    const body = createRes.json().data;
    expect(body.keyPrefix).toBeDefined();
    expect(body.encryptedKey).toBeUndefined();
    expect(body.keyHash).toBeUndefined();

    const listRes = await app.inject({ method: 'GET', url: '/user/keys' });
    const listed = listRes.json().data[0];
    expect(listed.encryptedKey).toBeUndefined();
    expect(listed.keyHash).toBeUndefined();
  });
});

describe('Run events SSE poll mode', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore)) map.clear();
  });

  it('returns poll events for owned run', async () => {
    const projectId = seedProject(TEST_USER.id);
    const runId = seedRun(projectId);
    const app = Fastify();
    await app.register(runRoutes);

    const res = await app.inject({
      method: 'GET',
      url: `/runs/${runId}/events?poll=1`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toContain('run.started');
  });

  it('returns 404 for unknown run', async () => {
    const app = Fastify();
    await app.register(runRoutes);

    const res = await app.inject({
      method: 'GET',
      url: `/runs/${id()}/events?poll=1`,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('Ownership enforcement', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore)) map.clear();
  });

  it('returns 404 when accessing another user project', async () => {
    const projectId = seedProject(OTHER_USER.id);
    const app = Fastify();
    await app.register(feedbackRoutes);
    const res = await app.inject({ method: 'GET', url: `/feedback/${projectId}` });
    expect(res.statusCode).toBe(404);
  });
});
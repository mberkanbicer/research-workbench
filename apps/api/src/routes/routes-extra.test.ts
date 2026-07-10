/**
 * Tests for feedback, settings, api-keys, SSE poll mode, and ownership enforcement.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { feedbackRoutes } from './feedback.js';
import { settingsRoutes } from './settings.js';
import { apiKeyRoutes } from './api-keys.js';
import { runRoutes } from './runs.js';
import { authMiddleware } from './auth.js';

type Store = Record<string, Map<string, any>>;

function id() {
  return crypto.randomUUID();
}

const TEST_USER = { id: 'user-a', email: 'a@test.com', name: 'User A' };
const OTHER_USER = { id: 'user-b', email: 'b@test.com', name: 'User B' };

const { mockPrisma, mockStore } = vi.hoisted(() => {
  return (globalThis as any).__createInMemoryPrisma();
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
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
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
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
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
  const originalEnv = process.env.API_KEY_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.API_KEY_ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests';
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.API_KEY_ENCRYPTION_KEY;
    else process.env.API_KEY_ENCRYPTION_KEY = originalEnv;
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
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
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
    for (const map of Object.values(mockStore) as Map<string, any>[]) map.clear();
  });

  it('returns 404 when accessing another user project', async () => {
    const projectId = seedProject(OTHER_USER.id);
    const app = Fastify();
    await app.register(feedbackRoutes);
    const res = await app.inject({ method: 'GET', url: `/feedback/${projectId}` });
    expect(res.statusCode).toBe(404);
  });
});
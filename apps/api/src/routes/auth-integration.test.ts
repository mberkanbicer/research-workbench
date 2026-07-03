/**
 * Auth integration test — verifies the full auth chain:
 *   register → login → use token → GET /me → logout → token invalid
 *
 * Uses the same mock prisma store as other tests, so no real DB needed.
 * The value is catching wiring bugs between auth routes, middleware, and prisma.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import { authRoutes, authMiddleware } from './auth.js';

// ─── Mock the prisma module ────────────────────────────────────────────────
type Store = Record<string, Map<string, any>>;

function createEmptyStore(): Store {
  return { user: new Map(), authSession: new Map() };
}

function id() { return crypto.randomUUID(); }

const { mockPrisma, mockStore } = vi.hoisted(() => {
  const store = createEmptyStore();

  function makeModel(table: string, s: Store) {
    return {
      findUnique: (args: any) => {
        let item: any = null;
        if (args.where.id) item = s[table]?.get(args.where.id) || null;
        else if (args.where.email) {
          for (const v of (s[table] || new Map()).values()) { if (v.email === args.where.email) { item = v; break; } }
        } else if (args.where.token) {
          for (const v of (s[table] || new Map()).values()) { if (v.token === args.where.token) { item = v; break; } }
        }
        if (!item) return null;
        // Support include: { user: true } for authSession
        if (args.include && table === 'authSession' && args.include.user) {
          const userEntry = s.user?.get(item.userId);
          return { ...item, user: userEntry || null };
        }
        return item;
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
      deleteMany: (args: any) => {
        let count = 0;
        const where = args?.where || {};
        for (const [kid, item] of (s[table] || new Map()).entries()) {
          let matches = true;
          for (const [key, val] of Object.entries(where)) {
            if (item[key] !== val) { matches = false; break; }
          }
          if (matches) { s[table]?.delete(kid); count++; }
        }
        return { count };
      },
    };
  }

  function buildPrisma(s: Store) {
    return { user: makeModel('user', s), authSession: makeModel('authSession', s), $disconnect: () => {} };
  }

  return { mockPrisma: buildPrisma(store), mockStore: store };
});

vi.mock('../prisma.js', () => ({ prisma: mockPrisma, default: mockPrisma }));

function buildServer() {
  const app = Fastify();
  app.register(authRoutes);
  app.get('/protected', { preHandler: authMiddleware }, async (req) => ({ data: { user: req.user } }));
  return app;
}

describe('Auth Integration Chain', () => {
  beforeEach(() => {
    for (const map of Object.values(mockStore)) map.clear();
  });

  it('register → login → GET /me → logout → token invalid', async () => {
    const server = buildServer();

    // 1. Register
    const regRes = await server.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: 'test@example.com', password: 'secret1234', name: 'Test User' },
    });
    expect(regRes.statusCode).toBe(201);
    const regBody = regRes.json();
    expect(regBody.data.user.email).toBe('test@example.com');
    expect(regBody.data.token).toBeDefined();

    // Verify user and session in store
    expect(Array.from(mockStore.user!.values()).length).toBe(1);
    expect(Array.from(mockStore.authSession!.values()).length).toBe(1);

    // 2. Login
    const loginRes = await server.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'test@example.com', password: 'secret1234' },
    });
    expect(loginRes.statusCode).toBe(200);
    const token = loginRes.json().data.token;
    expect(token).toBeDefined();

    // New session created (register + login = 2 sessions)
    expect(Array.from(mockStore.authSession!.values()).length).toBe(2);

    // 3. Access protected route with valid token
    const meRes = await server.inject({
      method: 'GET', url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().data.user.email).toBe('test@example.com');

    // 4. Protected route without token → 401
    const noTokenRes = await server.inject({ method: 'GET', url: '/protected' });
    expect(noTokenRes.statusCode).toBe(401);

    // 5. Logout
    const logoutRes = await server.inject({
      method: 'POST', url: '/auth/logout',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logoutRes.statusCode).toBe(200);

    // 6. Token now invalid → 401
    const afterLogoutRes = await server.inject({
      method: 'GET', url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(afterLogoutRes.statusCode).toBe(401);

    await server.close();
  });

  it('rejects duplicate registration', async () => {
    const server = buildServer();

    await server.inject({ method: 'POST', url: '/auth/register', payload: { email: 'dup@example.com', password: 'secret1234' } });
    const dupRes = await server.inject({ method: 'POST', url: '/auth/register', payload: { email: 'dup@example.com', password: 'secret1234' } });

    expect(dupRes.statusCode).toBe(409);
    expect(dupRes.json().error.code).toBe('EMAIL_EXISTS');
    await server.close();
  });

  it('rejects wrong password', async () => {
    const server = buildServer();

    await server.inject({ method: 'POST', url: '/auth/register', payload: { email: 'wrong@example.com', password: 'correct' } });
    const loginRes = await server.inject({ method: 'POST', url: '/auth/login', payload: { email: 'wrong@example.com', password: 'incorrect' } });

    expect(loginRes.statusCode).toBe(401);
    expect(loginRes.json().error.code).toBe('INVALID_CREDENTIALS');
    await server.close();
  });

  it('upgrades legacy SHA-256 password hash on login', async () => {
    const server = buildServer();
    const legacySalt = 'abc123';
    const legacyHash = createHash('sha256').update(legacySalt + 'secret1234').digest('hex');
    const userId = id();
    mockStore.user!.set(userId, {
      id: userId,
      email: 'legacy@example.com',
      passwordHash: `${legacySalt}:${legacyHash}`,
      name: 'Legacy',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const loginRes = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'legacy@example.com', password: 'secret1234' },
    });
    expect(loginRes.statusCode).toBe(200);

    const user = mockStore.user!.get(userId);
    expect(user.passwordHash.startsWith('bcrypt:')).toBe(true);
    await server.close();
  });

  it('rejects expired token', async () => {
    const server = buildServer();

    const regRes = await server.inject({ method: 'POST', url: '/auth/register', payload: { email: 'exp@example.com', password: 'secret1234' } });
    const token = regRes.json().data.token;

    // Expire the session
    for (const [sid, session] of mockStore.authSession!.entries()) {
      if (session.token === token) {
        mockStore.authSession!.set(sid, { ...session, expiresAt: new Date(0) });
      }
    }

    const meRes = await server.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(meRes.statusCode).toBe(401);
    await server.close();
  });
});

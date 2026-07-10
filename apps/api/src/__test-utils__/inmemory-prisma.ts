/**
 * Shared in-memory Prisma mock factory for deterministic testing.
 *
 * Usage in test files:
 *
 *   const { mockPrisma, mockStore } = vi.hoisted(() => {
 *     return (globalThis as any).__createInMemoryPrisma();
 *   });
 *
 *   vi.mock('../prisma.js', () => ({ prisma: mockPrisma, default: mockPrisma }));
 */

export type InMemoryStore = Record<string, Map<string, any>>;

function id(): string {
  return crypto.randomUUID();
}

export function createEmptyStore(): InMemoryStore {
  return {
    researchProject: new Map(),
    ideaVersion: new Map(),
    claim: new Map(),
    evidence: new Map(),
    evidenceAssessment: new Map(),
    modelConfig: new Map(),
    modelReview: new Map(),
    critique: new Map(),
    critiqueResponse: new Map(),
    decisionRecord: new Map(),
    researchTask: new Map(),
    runEvent: new Map(),
    rawEvent: new Map(),
    runStage: new Map(),
    knowledgeEdge: new Map(),
    contextManifest: new Map(),
    modelCall: new Map(),
    hypothesis: new Map(),
    summary: new Map(),
    sourceEmbedding: new Map(),
    claimConfidenceHistory: new Map(),
    promptVersion: new Map(),
    promptCall: new Map(),
    researchSession: new Map(),
    userFeedback: new Map(),
    authSession: new Map(),
    user: new Map(),
    annotation: new Map(),
    evaluationCriteria: new Map(),
    evidenceCustomScore: new Map(),
    claimDependency: new Map(),
    userPresence: new Map(),
    literatureReview: new Map(),
    userApiKey: new Map(),
  };
}

function resolveRelationTable(relation: string): string {
  const map: Record<string, string> = {
    ideaVersions: 'ideaVersion',
    claims: 'claim',
    evidence: 'evidence',
    decisions: 'decisionRecord',
    critiques: 'critique',
    modelReviews: 'modelReview',
    scores: 'evidenceCustomScore',
    criteria: 'evaluationCriteria',
  };
  return map[relation] || relation;
}

function sortItems(arr: any[], orderBy: Record<string, string>) {
  if (!orderBy) return;
  for (const [field, dir] of Object.entries(orderBy)) {
    const mul = dir === 'desc' ? -1 : 1;
    arr.sort((a: any, b: any) => {
      const av = a[field] instanceof Date ? a[field].getTime() : (a[field] ?? 0);
      const bv = b[field] instanceof Date ? b[field].getTime() : (b[field] ?? 0);
      if (av > bv) return mul;
      if (av < bv) return -mul;
      return 0;
    });
  }
}

function applyWhere(items: any[], where: Record<string, any> | undefined): any[] {
  if (!where) return items;

  // Handle OR
  if (where.OR) {
    const orFilters = where.OR;
    return items.filter((item: any) => {
      return orFilters.some((filter: any) => {
        return Object.entries(filter).every(([k, v]) => {
          if (v && typeof v === 'object') {
            if ('contains' in (v as any)) {
              return String(item[k] || '').toLowerCase().includes(String((v as any).contains || '').toLowerCase());
            }
            if ('in' in (v as any)) return (v as any).in?.includes(item[k]);
          }
          return item[k] === v;
        });
      });
    });
  }

  for (const [key, val] of Object.entries(where)) {
    if (key === 'OR') continue;
    if (val && typeof val === 'object') {
      if ('in' in (val as any)) {
        items = items.filter((item: any) => (val as any).in?.includes(item[key]));
      } else if ('notIn' in (val as any)) {
        items = items.filter((item: any) => !(val as any).notIn?.includes(item[key]));
      } else if ('contains' in (val as any)) {
        const needle = String((val as any).contains || '').toLowerCase();
        const mode = (val as any).mode;
        items = items.filter((item: any) => {
          const v = String(item[key] || '');
          return mode === 'insensitive' ? v.toLowerCase().includes(needle) : v.includes(needle);
        });
      } else if ('startsWith' in (val as any)) {
        items = items.filter((item: any) => String(item[key] || '').startsWith((val as any).startsWith));
      } else if ('gt' in (val as any)) {
        items = items.filter((item: any) => new Date(item[key]) > new Date((val as any).gt));
      } else if ('gte' in (val as any)) {
        items = items.filter((item: any) => {
          const itemVal = item[key] instanceof Date ? item[key] : item[key] ? new Date(item[key]) : null;
          const cmpVal = (val as any).gte instanceof Date ? (val as any).gte : new Date((val as any).gte);
          return itemVal && itemVal >= cmpVal;
        });
      } else if ('lt' in (val as any)) {
        items = items.filter((item: any) => {
          const itemVal = item[key] instanceof Date ? item[key] : item[key] ? new Date(item[key]) : null;
          const cmpVal = (val as any).lt instanceof Date ? (val as any).lt : new Date((val as any).lt);
          return itemVal && itemVal < cmpVal;
        });
      } else if ('not' in (val as any)) {
        const notVal = (val as any).not;
        if (notVal && typeof notVal === 'object' && 'in' in notVal) {
          items = items.filter((item: any) => !(notVal as any).in?.includes(item[key]));
        }
      } else if ('some' in (val as any)) {
        // Simplified: skip relation filters like { evidence: { some: { id } } }
      } else {
        for (const [subKey, subVal] of Object.entries(val)) {
          if (subKey === 'in') {
            items = items.filter((item: any) => (subVal as any[])?.includes(item[key]));
          }
        }
      }
    } else if (val !== undefined && val !== null) {
      items = items.filter((item: any) => item[key] === val);
    }
  }
  return items;
}

function resolveIncludes(item: any, table: string, store: InMemoryStore, include: Record<string, any> | undefined): any {
  if (!include) return item;
  const resolved: any = { ...item };
  for (const [relation] of Object.entries(include)) {
    const relTable = resolveRelationTable(relation);
    let related = Array.from((store[relTable] || new Map()).values())
      .filter((r: any) =>
        r.projectId === item.id ||
        r[table.toLowerCase() + 'Id'] === item.id ||
        r.evidenceId === item.id ||
        r.criteriaId === item.id
      );
    if (include[relation] && typeof include[relation] === 'object' && 'orderBy' in (include[relation] as any)) {
      sortItems(related, (include[relation] as any).orderBy);
    }
    if (include[relation] && typeof include[relation] === 'object' && 'take' in (include[relation] as any)) {
      related = related.slice(0, (include[relation] as any).take);
    }
    resolved[relation] = related;
  }
  return resolved;
}

function makeModel(table: string, store: InMemoryStore) {
  return {
    findUnique: (args: any) => {
      if (args.where.id) {
        const item = store[table]?.get(args.where.id);
        if (!item) return null;
        return resolveIncludes(item, table, store, args?.include);
      }
      if (args.where.email) {
        for (const v of (store[table] || new Map()).values()) {
          if (v.email === args.where.email) {
            return resolveIncludes(v, table, store, args?.include);
          }
        }
      }
      // Compound unique: e.g. evidenceId_criteriaId
      const compoundKeys = Object.keys(args.where).filter(k => k.includes('_'));
      if (compoundKeys.length > 0) {
        for (const item of (store[table] || new Map()).values()) {
          let match = true;
          for (const k of Object.keys(args.where)) {
            if (item[k] !== args.where[k]) { match = false; break; }
          }
          if (match) return resolveIncludes(item, table, store, args?.include);
        }
      }
      return null;
    },

    findFirst: (args: any) => {
      let items = Array.from((store[table] || new Map()).values());
      items = applyWhere(items, args?.where);
      sortItems(items, args?.orderBy);
      const item = items[0] || null;
      return item ? resolveIncludes(item, table, store, args?.include) : null;
    },

    findMany: (args: any) => {
      let items = Array.from((store[table] || new Map()).values());
      items = applyWhere(items, args?.where);
      items = items.map((item: any) => resolveIncludes(item, table, store, args?.include));
      sortItems(items, args?.orderBy);
      return args?.take ? items.slice(0, args.take) : items;
    },

    create: (args: any) => {
      const record = { ...args.data, id: args.data.id || id(), createdAt: new Date(), updatedAt: new Date() };
      store[table]?.set(record.id, record);
      return record;
    },

    update: (args: any) => {
      const existing = store[table]?.get(args.where.id);
      if (!existing) throw new Error(`Record not found: ${args.where.id}`);
      const updated = { ...existing, ...args.data, updatedAt: new Date() };
      store[table]?.set(updated.id, updated);
      return updated;
    },

    delete: (args: any) => {
      const existing = store[table]?.get(args.where.id);
      store[table]?.delete(args.where.id);
      return existing || {};
    },

    deleteMany: (args: any) => {
      let count = 0;
      for (const [itemId, item] of (store[table] || new Map()).entries()) {
        let matches = true;
        const where = args?.where || {};
        for (const [key, val] of Object.entries(where)) {
          if (val && typeof val === 'object') {
            if ('in' in (val as any)) {
              if (!(val as any).in?.includes(item[key])) { matches = false; break; }
            } else if ('lt' in (val as any)) {
              const itemVal = item[key] instanceof Date ? item[key] : item[key] ? new Date(item[key]) : null;
              const cmpVal = (val as any).lt instanceof Date ? (val as any).lt : new Date((val as any).lt);
              if (!itemVal || itemVal >= cmpVal) { matches = false; break; }
            } else if ('gte' in (val as any)) {
              const itemVal = item[key] instanceof Date ? item[key] : item[key] ? new Date(item[key]) : null;
              const cmpVal = (val as any).gte instanceof Date ? (val as any).gte : new Date((val as any).gte);
              if (!itemVal || itemVal < cmpVal) { matches = false; break; }
            } else if (item[key] !== val) { matches = false; break; }
          } else if (item[key] !== val) { matches = false; break; }
        }
        if (matches) { store[table]?.delete(itemId); count++; }
      }
      return { count };
    },

    updateMany: (args: any) => {
      let count = 0;
      for (const [itemId, item] of (store[table] || new Map()).entries()) {
        let matches = true;
        const where = args?.where || {};
        for (const [key, val] of Object.entries(where)) {
          if (val && typeof val === 'object' && 'in' in (val as any)) {
            if (!(val as any).in?.includes(item[key])) { matches = false; break; }
          } else if (val !== undefined && val !== null && item[key] !== val) { matches = false; break; }
        }
        if (matches) {
          const updated = { ...item, ...args.data, updatedAt: new Date() };
          store[table]?.set(itemId, updated);
          count++;
        }
      }
      return { count };
    },

    count: (args: any) => {
      let items = Array.from((store[table] || new Map()).values());
      items = applyWhere(items, args?.where);
      return items.length;
    },

    upsert: (args: any) => {
      let existing: any = null;

      // Handle compound unique keys
      if (args.where.runId_stageName) {
        const { runId, stageName } = args.where.runId_stageName;
        for (const item of (store[table] || new Map()).values()) {
          if (item.runId === runId && item.stageName === stageName) { existing = item; break; }
        }
      } else if (args.where.evidenceId_criteriaId) {
        const { evidenceId, criteriaId } = args.where.evidenceId_criteriaId;
        for (const item of (store[table] || new Map()).values()) {
          if (item.evidenceId === evidenceId && item.criteriaId === criteriaId) { existing = item; break; }
        }
      } else if (args.where.fromClaimId_toClaimId) {
        const { fromClaimId, toClaimId } = args.where.fromClaimId_toClaimId;
        for (const item of (store[table] || new Map()).values()) {
          if (item.fromClaimId === fromClaimId && item.toClaimId === toClaimId) { existing = item; break; }
        }
      } else if (args.where.fromType_fromId_toType_toId_relation) {
        const { fromType, fromId, toType, toId, relation } = args.where.fromType_fromId_toType_toId_relation;
        for (const item of (store[table] || new Map()).values()) {
          if (item.fromType === fromType && item.fromId === fromId &&
              item.toType === toType && item.toId === toId &&
              item.relation === relation) { existing = item; break; }
        }
      } else if (args.where.id) {
        existing = store[table]?.get(args.where.id);
      } else if (args.where.not) {
        // Skip - handle as create
      } else {
        // Try to match any flat where condition
        for (const item of (store[table] || new Map()).values()) {
          let matches = true;
          for (const [key, val] of Object.entries(args.where)) {
            if (typeof val === 'object' && val !== null) continue;
            if (item[key] !== val) { matches = false; break; }
          }
          if (matches) { existing = item; break; }
        }
      }

      if (existing) {
        const updated = { ...existing, ...args.update, updatedAt: new Date() };
        store[table]?.set(updated.id, updated);
        return updated;
      }
      const record = { ...args.create, id: args.create.id || id(), createdAt: new Date(), updatedAt: new Date() };
      store[table]?.set(record.id, record);
      return record;
    },
  };
}

function buildPrisma(store: InMemoryStore) {
  const models: Record<string, ReturnType<typeof makeModel>> = {};
  for (const table of Object.keys(store)) {
    models[table] = makeModel(table, store);
  }
  return {
    ...models,
    $transaction: (arg: any) => {
      if (typeof arg === 'function') {
        return arg(models);
      }
      return arg;
    },
    $disconnect: () => {},
  };
}

export function createInMemoryPrisma(): { mockPrisma: any; mockStore: InMemoryStore } {
  const store = createEmptyStore();
  return { mockPrisma: buildPrisma(store), mockStore: store };
}

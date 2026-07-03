import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../prisma.js', () => ({
  prisma: {
    contextManifest: {
      create: vi.fn(),
      update: vi.fn(),
    },
    claim: { findMany: vi.fn() },
    evidence: { findMany: vi.fn() },
    ideaVersion: { findMany: vi.fn() },
  },
}));

vi.mock('./embedding.service.js', () => ({
  embeddingService: { hybridSearch: vi.fn() },
}));

import { prisma } from '../prisma.js';
import { embeddingService } from './embedding.service.js';
import { ContextManifestService, ContextService } from './context.service.js';

const mockPrisma = prisma as any;
const mockEmbeddingService = embeddingService as any;

describe('ContextManifestService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('record creates a context manifest', async () => {
    mockPrisma.contextManifest.create.mockResolvedValue({ id: 'manifest-1' });
    const service = new ContextManifestService();

    const id = await service.record('p1', 'model-1', 4000, {
      includedClaims: ['c1'],
      includedEvidence: ['e1'],
    });

    expect(id).toBe('manifest-1');
    expect(mockPrisma.contextManifest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'p1',
        modelId: 'model-1',
        tokenBudget: 4000,
        includedClaims: ['c1'],
        includedEvidence: ['e1'],
      }),
    });
  });

  it('updateTokenUsage updates the manifest', async () => {
    mockPrisma.contextManifest.update.mockResolvedValue({});
    const service = new ContextManifestService();

    await service.updateTokenUsage('manifest-1', 1500);

    expect(mockPrisma.contextManifest.update).toHaveBeenCalledWith({
      where: { id: 'manifest-1' },
      data: { tokenUsed: 1500 },
    });
  });
});

describe('ContextService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getProjectContext returns claims, evidence, and latest version', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([{ id: 'c1' }]);
    mockPrisma.evidence.findMany.mockResolvedValue([{ id: 'e1' }]);
    mockPrisma.ideaVersion.findMany.mockResolvedValue([{ id: 'v1', versionNumber: 1 }]);

    const service = new ContextService();
    const result = await service.getProjectContext('p1');

    expect(result.claims).toEqual([{ id: 'c1' }]);
    expect(result.acceptedEvidence).toEqual([{ id: 'e1' }]);
    expect(result.ideaVersion).toEqual({ id: 'v1', versionNumber: 1 });
  });

  it('getRelevantContext falls back to getProjectContext when embeddings disabled', async () => {
    delete process.env.EMBEDDING_ENABLED;
    mockPrisma.claim.findMany.mockResolvedValue([{ id: 'c1' }]);
    mockPrisma.evidence.findMany.mockResolvedValue([]);
    mockPrisma.ideaVersion.findMany.mockResolvedValue([]);

    const service = new ContextService();
    const result = await service.getRelevantContext('p1', 'test query');

    expect(result.retrievalReason).toBeUndefined();
    expect(mockEmbeddingService.hybridSearch).not.toHaveBeenCalled();
  });

  it('EdgeService is removed from exports', async () => {
    const mod = await import('./context.service.js');
    expect((mod as any).EdgeService).toBeUndefined();
  });
});

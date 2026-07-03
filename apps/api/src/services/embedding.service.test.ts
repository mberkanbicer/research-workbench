import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockUpsert = vi.fn();
const mockFindMany = vi.fn();
const mockExecuteRaw = vi.fn();
const mockQueryRaw = vi.fn();

vi.mock('../prisma.js', () => ({
  prisma: {
    sourceEmbedding: {
      upsert: mockUpsert,
      findMany: mockFindMany,
    },
    $executeRaw: mockExecuteRaw,
    $queryRaw: mockQueryRaw,
  },
}));

describe('EmbeddingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.PGVECTOR_ENABLED;
    process.env.EMBEDDING_ENABLED = 'true';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('generates deterministic mock embeddings', async () => {
    const { embeddingService } = await import('./embedding.service.js');
    const a = await embeddingService.generateEmbedding('same text');
    const b = await embeddingService.generateEmbedding('same text');
    const c = await embeddingService.generateEmbedding('different');

    expect(a).toHaveLength(768);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('stores embeddings as JSON when pgvector is disabled', async () => {
    mockUpsert.mockResolvedValue({});
    const { embeddingService } = await import('./embedding.service.js');

    await embeddingService.storeEmbedding('proj-1', 'claim', 'claim-1', 'Test claim text');

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'proj-1:claim:claim-1' },
        create: expect.objectContaining({
          projectId: 'proj-1',
          objectType: 'claim',
          objectId: 'claim-1',
          text: 'Test claim text',
        }),
      }),
    );
    const call = mockUpsert.mock.calls[0][0];
    const parsed = JSON.parse(call.create.embedding);
    expect(parsed).toHaveLength(768);
  });

  it('falls back to mock when OpenAI key is missing', async () => {
    process.env.EMBEDDING_PROVIDER = 'openai';
    const { embeddingService } = await import('./embedding.service.js');
    const embedding = await embeddingService.generateEmbedding('fallback test');
    expect(embedding).toHaveLength(768);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses OpenAI embeddings when API key is set', async () => {
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    } as Response);

    const { embeddingService } = await import('./embedding.service.js');
    const embedding = await embeddingService.generateEmbedding('openai test');

    expect(fetch).toHaveBeenCalled();
    expect(embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it('ranks stored embeddings by cosine similarity', async () => {
    mockFindMany.mockResolvedValue([
      { objectType: 'claim', objectId: 'a', text: 'alpha', embedding: JSON.stringify([1, 0, 0]) },
      { objectType: 'claim', objectId: 'b', text: 'beta', embedding: JSON.stringify([0, 1, 0]) },
    ]);

    const { embeddingService } = await import('./embedding.service.js');
    const original = embeddingService.generateEmbedding.bind(embeddingService);
    vi.spyOn(embeddingService, 'generateEmbedding').mockResolvedValue([1, 0, 0]);

    const results = await embeddingService.semanticSearch('proj-1', ['claim'], 'query', 2);

    expect(results[0].objectId).toBe('a');
    expect(results[0].score).toBeGreaterThan(results[1].score);
    embeddingService.generateEmbedding = original;
  });
});
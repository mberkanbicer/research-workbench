import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./embedding.service.js', () => ({
  embeddingService: { storeEmbedding: vi.fn().mockResolvedValue(undefined) },
}));

import { embeddingService } from './embedding.service.js';
import { indexClaimEmbedding, indexEvidenceEmbedding, indexCritiqueEmbedding, indexReviewEmbedding, indexDecisionEmbedding } from './embedding-index.js';

const mockStoreEmbedding = embeddingService.storeEmbedding as any;

describe('embedding-index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EMBEDDING_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.EMBEDDING_ENABLED;
  });

  it('indexClaimEmbedding calls storeEmbedding with claim type', () => {
    indexClaimEmbedding('p1', 'c1', 'claim text');
    expect(mockStoreEmbedding).toHaveBeenCalledWith('p1', 'claim', 'c1', 'claim text');
  });

  it('indexEvidenceEmbedding joins title, excerpt, summary', () => {
    indexEvidenceEmbedding('p1', 'e1', 'title', 'excerpt', 'summary');
    expect(mockStoreEmbedding).toHaveBeenCalledWith('p1', 'evidence', 'e1', 'title\nexcerpt\nsummary');
  });

  it('indexEvidenceEmbedding handles null fields', () => {
    indexEvidenceEmbedding('p1', 'e1', 'title', null, null);
    expect(mockStoreEmbedding).toHaveBeenCalledWith('p1', 'evidence', 'e1', 'title');
  });

  it('indexCritiqueEmbedding calls storeEmbedding with critique type', () => {
    indexCritiqueEmbedding('p1', 'cr1', 'critique text');
    expect(mockStoreEmbedding).toHaveBeenCalledWith('p1', 'critique', 'cr1', 'critique text');
  });

  it('indexReviewEmbedding calls storeEmbedding with review type', () => {
    indexReviewEmbedding('p1', 'r1', 'review text');
    expect(mockStoreEmbedding).toHaveBeenCalledWith('p1', 'review', 'r1', 'review text');
  });

  it('indexDecisionEmbedding calls storeEmbedding with decision type', () => {
    indexDecisionEmbedding('p1', 'd1', 'decision text');
    expect(mockStoreEmbedding).toHaveBeenCalledWith('p1', 'decision', 'd1', 'decision text');
  });

  it('skips embedding when EMBEDDING_ENABLED is not true', () => {
    process.env.EMBEDDING_ENABLED = 'false';
    indexClaimEmbedding('p1', 'c1', 'text');
    expect(mockStoreEmbedding).not.toHaveBeenCalled();
  });

  it('skips embedding when EMBEDDING_ENABLED is undefined', () => {
    delete process.env.EMBEDDING_ENABLED;
    indexClaimEmbedding('p1', 'c1', 'text');
    expect(mockStoreEmbedding).not.toHaveBeenCalled();
  });
});

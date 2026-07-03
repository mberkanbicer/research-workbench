import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the service
vi.mock('../prisma.js', () => ({
  prisma: {
    knowledgeEdge: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    claim: { findMany: vi.fn() },
    evidence: { findMany: vi.fn() },
    critique: { findMany: vi.fn() },
    modelReview: { findMany: vi.fn() },
    decisionRecord: { findMany: vi.fn() },
    ideaVersion: { findMany: vi.fn() },
  },
}));

import { KnowledgeGraphService } from './knowledge-graph.service.js';
import { prisma } from '../prisma.js';

const mockPrisma = prisma as any;

describe('KnowledgeGraphService', () => {
  let kg: KnowledgeGraphService;

  beforeEach(() => {
    vi.clearAllMocks();
    kg = new KnowledgeGraphService();
  });

  describe('addEdge', () => {
    it('creates an edge when none exists', async () => {
      mockPrisma.knowledgeEdge.create.mockResolvedValue({ id: '1' });

      await kg.addEdge('claim', 'c1', 'evidence', 'e1', 'supports');

      expect(mockPrisma.knowledgeEdge.create).toHaveBeenCalledWith({
        data: { fromType: 'claim', fromId: 'c1', toType: 'evidence', toId: 'e1', relation: 'supports' },
      });
    });

    it('ignores duplicate edge (P2002 error)', async () => {
      const error = new Error('Unique constraint');
      (error as any).code = 'P2002';
      mockPrisma.knowledgeEdge.create.mockRejectedValue(error);

      // Should not throw
      await kg.addEdge('claim', 'c1', 'evidence', 'e1', 'supports');
    });

    it('logs and swallows non-duplicate errors', async () => {
      mockPrisma.knowledgeEdge.create.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await kg.addEdge('claim', 'c1', 'evidence', 'e1', 'supports');
    });
  });

  describe('link methods', () => {
    it('linkEvidenceToClaim creates supports edge', async () => {
      mockPrisma.knowledgeEdge.create.mockResolvedValue({ id: '1' });
      await kg.linkEvidenceToClaim('e1', 'c1', false);
      expect(mockPrisma.knowledgeEdge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ relation: 'supports' }),
      });
    });

    it('linkEvidenceToClaim creates contradicts edge for counter evidence', async () => {
      mockPrisma.knowledgeEdge.create.mockResolvedValue({ id: '1' });
      await kg.linkEvidenceToClaim('e1', 'c1', true);
      expect(mockPrisma.knowledgeEdge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ relation: 'contradicts' }),
      });
    });

    it('linkCritiqueToTarget creates critiques edge', async () => {
      mockPrisma.knowledgeEdge.create.mockResolvedValue({ id: '1' });
      await kg.linkCritiqueToTarget('cr1', 'claim', 'c1');
      expect(mockPrisma.knowledgeEdge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ relation: 'critiques' }),
      });
    });

    it('linkVersionSupersession creates supersedes edge', async () => {
      mockPrisma.knowledgeEdge.create.mockResolvedValue({ id: '1' });
      await kg.linkVersionSupersession('v2', 'v1');
      expect(mockPrisma.knowledgeEdge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ relation: 'supersedes' }),
      });
    });

    it('linkDecisionToVersion creates references edge', async () => {
      mockPrisma.knowledgeEdge.create.mockResolvedValue({ id: '1' });
      await kg.linkDecisionToVersion('d1', 'v1');
      expect(mockPrisma.knowledgeEdge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ relation: 'references' }),
      });
    });

    it('linkReviewToClaim creates supports edge when accepted', async () => {
      mockPrisma.knowledgeEdge.create.mockResolvedValue({ id: '1' });
      await kg.linkReviewToClaim('r1', 'c1', true);
      expect(mockPrisma.knowledgeEdge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ relation: 'supports' }),
      });
    });

    it('linkReviewToClaim creates contradicts edge when rejected', async () => {
      mockPrisma.knowledgeEdge.create.mockResolvedValue({ id: '1' });
      await kg.linkReviewToClaim('r1', 'c1', false);
      expect(mockPrisma.knowledgeEdge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ relation: 'contradicts' }),
      });
    });
  });

  describe('query methods', () => {
    it('getOutgoingEdges queries by fromType and fromId', async () => {
      mockPrisma.knowledgeEdge.findMany.mockResolvedValue([]);
      await kg.getOutgoingEdges('claim', 'c1');
      expect(mockPrisma.knowledgeEdge.findMany).toHaveBeenCalledWith({
        where: { fromType: 'claim', fromId: 'c1' },
      });
    });

    it('getIncomingEdges queries by toType and toId', async () => {
      mockPrisma.knowledgeEdge.findMany.mockResolvedValue([]);
      await kg.getIncomingEdges('evidence', 'e1');
      expect(mockPrisma.knowledgeEdge.findMany).toHaveBeenCalledWith({
        where: { toType: 'evidence', toId: 'e1' },
      });
    });

    it('getClaimGraph queries edges where claim is source or target', async () => {
      mockPrisma.knowledgeEdge.findMany.mockResolvedValue([]);
      await kg.getClaimGraph('c1');
      expect(mockPrisma.knowledgeEdge.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { fromId: 'c1', fromType: 'claim' },
            { toId: 'c1', toType: 'claim' },
          ],
        },
      });
    });
  });

  describe('getProjectGraph', () => {
    it('returns edges for all project entities with pagination', async () => {
      mockPrisma.claim.findMany.mockResolvedValue([{ id: 'c1' }]);
      mockPrisma.evidence.findMany.mockResolvedValue([{ id: 'e1' }]);
      mockPrisma.critique.findMany.mockResolvedValue([]);
      mockPrisma.modelReview.findMany.mockResolvedValue([]);
      mockPrisma.decisionRecord.findMany.mockResolvedValue([]);
      mockPrisma.ideaVersion.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeEdge.findMany.mockResolvedValue([{ id: 'edge1' }]);

      const result = await kg.getProjectGraph('p1', 50, 10);

      expect(result).toEqual([{ id: 'edge1' }]);
      expect(mockPrisma.knowledgeEdge.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { fromId: { in: ['c1', 'e1'] } },
            { toId: { in: ['c1', 'e1'] } },
          ],
        },
        take: 50,
        skip: 10,
      });
    });
  });
});

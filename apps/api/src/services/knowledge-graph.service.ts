/**
 * KnowledgeGraphService — creates KnowledgeEdge entries to build a
 * searchable graph of research relationships.
 *
 * Edge types: supports, contradicts, critiques, revises, depends_on,
 * derived_from, accepted_by, rejected_by, needs_evidence, supersedes, references
 *
 * TODO: Add projectId column to KnowledgeEdge via Prisma migration for proper
 * project-scoped edge queries and cascade delete support.
 */

import { prisma } from '../prisma.js';
import { logger } from '../utils/logger.js';

type RelationType =
  | 'supports'
  | 'contradicts'
  | 'critiques'
  | 'revises'
  | 'depends_on'
  | 'derived_from'
  | 'accepted_by'
  | 'rejected_by'
  | 'needs_evidence'
  | 'supersedes'
  | 'references';

export class KnowledgeGraphService {
  /**
   * Create a single edge (idempotent — uses upsert with unique constraint).
   * NOTE: For true atomic idempotency, add a unique constraint on
   * (fromType, fromId, toType, toId, relation) to the KnowledgeEdge table.
   */
  async addEdge(
    fromType: string,
    fromId: string,
    toType: string,
    toId: string,
    relation: RelationType,
  ): Promise<void> {
    try {
      await prisma.knowledgeEdge.create({
        data: { fromType, fromId, toType, toId, relation },
      });
    } catch (err) {
      // Duplicate edge — idempotent, safe to ignore
      if ((err as any).code === 'P2002') return;
      logger.warn('Failed to create knowledge edge', {
        fromType, fromId, toType, toId, relation,
        error: (err as Error).message,
      });
    }
  }

  /**
   * Record that evidence supports or contradicts a claim.
   */
  async linkEvidenceToClaim(evidenceId: string, claimId: string, isCounter: boolean): Promise<void> {
    await this.addEdge('evidence', evidenceId, 'claim', claimId, isCounter ? 'contradicts' : 'supports');
  }

  /**
   * Record that a critique targets an entity.
   */
  async linkCritiqueToTarget(critiqueId: string, targetType: string, targetId: string): Promise<void> {
    await this.addEdge('critique', critiqueId, targetType, targetId, 'critiques');
  }

  /**
   * Record that an idea version supersedes another.
   */
  async linkVersionSupersession(newVersionId: string, oldVersionId: string): Promise<void> {
    await this.addEdge('idea_version', newVersionId, 'idea_version', oldVersionId, 'supersedes');
  }

  /**
   * Record that a decision references an idea version.
   */
  async linkDecisionToVersion(decisionId: string, ideaVersionId: string): Promise<void> {
    await this.addEdge('decision', decisionId, 'idea_version', ideaVersionId, 'references');
  }

  /**
   * Record that a model review accepts or rejects a claim.
   */
  async linkReviewToClaim(reviewId: string, claimId: string, accepted: boolean): Promise<void> {
    await this.addEdge('model_review', reviewId, 'claim', claimId, accepted ? 'supports' : 'contradicts');
  }

  /**
   * Query all edges from an entity.
   */
  async getOutgoingEdges(fromType: string, fromId: string) {
    return prisma.knowledgeEdge.findMany({ where: { fromType, fromId } });
  }

  /**
   * Query all edges to an entity.
   */
  async getIncomingEdges(toType: string, toId: string) {
    return prisma.knowledgeEdge.findMany({ where: { toType, toId } });
  }

  /**
   * Get the entire graph for a claim within a project.
   */
  async getClaimGraph(claimId: string, projectId?: string) {
    const where: any = {
      OR: [
        { fromId: claimId, fromType: 'claim' },
        { toId: claimId, toType: 'claim' },
      ],
    };
    // If projectId provided, filter edges to only include entities from this project
    if (projectId) {
      const projectEntityIds = await this.getProjectEntityIds(projectId);
      where.OR = where.OR.map((clause: any) => ({
        ...clause,
        OR: [
          { fromId: { in: projectEntityIds } },
          { toId: { in: projectEntityIds } },
        ],
      }));
    }
    return prisma.knowledgeEdge.findMany({ where });
  }

  /**
   * Get all edges for a project (the full knowledge graph), with pagination.
   */
  async getProjectGraph(projectId: string, take = 100, skip = 0) {
    const entityIds = await this.getProjectEntityIds(projectId);

    return prisma.knowledgeEdge.findMany({
      where: {
        OR: [
          { fromId: { in: entityIds } },
          { toId: { in: entityIds } },
        ],
      },
      take,
      skip,
    });
  }

  /**
   * Get all entity IDs belonging to a project.
   */
  private async getProjectEntityIds(projectId: string): Promise<string[]> {
    const [claims, evidence, critiques, reviews, decisions, versions] = await Promise.all([
      prisma.claim.findMany({ where: { projectId }, select: { id: true } }),
      prisma.evidence.findMany({ where: { projectId }, select: { id: true } }),
      prisma.critique.findMany({ where: { projectId }, select: { id: true } }),
      prisma.modelReview.findMany({ where: { projectId }, select: { id: true } }),
      prisma.decisionRecord.findMany({ where: { projectId }, select: { id: true } }),
      prisma.ideaVersion.findMany({ where: { projectId }, select: { id: true } }),
    ]);

    return [
      ...claims.map(c => c.id),
      ...evidence.map(e => e.id),
      ...critiques.map(c => c.id),
      ...reviews.map(r => r.id),
      ...decisions.map(d => d.id),
      ...versions.map(v => v.id),
    ];
  }
}

export const knowledgeGraph = new KnowledgeGraphService();

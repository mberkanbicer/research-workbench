/**
 * KnowledgeGraphService — creates KnowledgeEdge entries to build a
 * searchable graph of research relationships.
 *
 * Edge types: supports, contradicts, critiques, revises, depends_on,
 * derived_from, accepted_by, rejected_by, needs_evidence, supersedes, references
 *
 * KnowledgeEdge now includes a projectId column for direct project-scoped
 * queries and cascade delete support.
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
   * Create a single edge. Duplicates are ignored via the unique constraint
   * on (fromType, fromId, toType, toId, relation).
   */
  async addEdge(
    projectId: string,
    fromType: string,
    fromId: string,
    toType: string,
    toId: string,
    relation: RelationType,
  ): Promise<void> {
    try {
      await prisma.knowledgeEdge.create({
        data: { projectId, fromType, fromId, toType, toId, relation },
      });
    } catch (err) {
      // Duplicate edge — idempotent, safe to ignore
      if ((err as any).code === 'P2002') return;
      logger.warn('Failed to create knowledge edge', {
        projectId, fromType, fromId, toType, toId, relation,
        error: (err as Error).message,
      });
    }
  }

  /**
   * Record that evidence supports or contradicts a claim.
   */
  async linkEvidenceToClaim(projectId: string, evidenceId: string, claimId: string, isCounter: boolean): Promise<void> {
    await this.addEdge(projectId, 'evidence', evidenceId, 'claim', claimId, isCounter ? 'contradicts' : 'supports');
  }

  /**
   * Record that a critique targets an entity.
   */
  async linkCritiqueToTarget(projectId: string, critiqueId: string, targetType: string, targetId: string): Promise<void> {
    await this.addEdge(projectId, 'critique', critiqueId, targetType, targetId, 'critiques');
  }

  /**
   * Record that an idea version supersedes another.
   */
  async linkVersionSupersession(projectId: string, newVersionId: string, oldVersionId: string): Promise<void> {
    await this.addEdge(projectId, 'idea_version', newVersionId, 'idea_version', oldVersionId, 'supersedes');
  }

  /**
   * Record that a decision references an idea version.
   */
  async linkDecisionToVersion(projectId: string, decisionId: string, ideaVersionId: string): Promise<void> {
    await this.addEdge(projectId, 'decision', decisionId, 'idea_version', ideaVersionId, 'references');
  }

  /**
   * Record that a model review accepts or rejects a claim.
   */
  async linkReviewToClaim(projectId: string, reviewId: string, claimId: string, accepted: boolean): Promise<void> {
    await this.addEdge(projectId, 'model_review', reviewId, 'claim', claimId, accepted ? 'supports' : 'contradicts');
  }

  /**
   * Query all edges from an entity within a project.
   */
  async getOutgoingEdges(projectId: string, fromType: string, fromId: string) {
    return prisma.knowledgeEdge.findMany({ where: { projectId, fromType, fromId } });
  }

  /**
   * Query all edges to an entity within a project.
   */
  async getIncomingEdges(projectId: string, toType: string, toId: string) {
    return prisma.knowledgeEdge.findMany({ where: { projectId, toType, toId } });
  }

  /**
   * Get the entire graph for a claim within a project.
   */
  async getClaimGraph(projectId: string, claimId: string) {
    return prisma.knowledgeEdge.findMany({
      where: {
        projectId,
        OR: [
          { fromId: claimId, fromType: 'claim' },
          { toId: claimId, toType: 'claim' },
        ],
      },
    });
  }

  /**
   * Get all edges for a project (the full knowledge graph), with pagination.
   * Uses the projectId column directly instead of collecting entity IDs.
   */
  async getProjectGraph(projectId: string, take = 100, skip = 0) {
    return prisma.knowledgeEdge.findMany({
      where: { projectId },
      take,
      skip,
    });
  }
}

export const knowledgeGraph = new KnowledgeGraphService();

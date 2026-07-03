import { prisma } from '../prisma.js';
import type { Prisma } from '@prisma/client';
import { embeddingService } from './embedding.service.js';

// ─── Context manifest types and service ───────────────────────────────────

export interface ManifestContext {
  includedClaims?: string[];
  includedEvidence?: string[];
  includedCritiques?: string[];
  includedDecisions?: string[];
  includedRawEvents?: string[];
  excludedButRelevant?: string[];
}

export class ContextManifestService {
  /**
   * Record a ContextManifest for a model call.
   * Returns the manifest ID for linking with ModelCall records.
   */
  async record(
    projectId: string,
    modelId: string,
    tokenBudget: number,
    context: ManifestContext,
    taskId?: string,
    retrievalReason?: Record<string, unknown>,
  ): Promise<string> {
    const manifest = await prisma.contextManifest.create({
      data: {
        projectId,
        modelId,
        taskId: taskId || null,
        tokenBudget,
        tokenUsed: null,
        includedClaims: context.includedClaims || [],
        includedEvidence: context.includedEvidence || [],
        includedCritiques: context.includedCritiques || [],
        includedDecisions: context.includedDecisions || [],
        includedRawEvents: context.includedRawEvents || [],
        excludedButRelevant: context.excludedButRelevant || [],
        retrievalReason: (retrievalReason || null) as unknown as Prisma.InputJsonValue,
      },
    });
    return manifest.id;
  }

  async updateTokenUsage(manifestId: string, tokenUsed: number): Promise<void> {
    await prisma.contextManifest.update({
      where: { id: manifestId },
      data: { tokenUsed },
    });
  }
}

// ─── Project context assembly service ─────────────────────────────────────

export class ContextService {
  async getProjectContext(projectId: string) {
    const [claims, evidence, ideaVersions] = await Promise.all([
      prisma.claim.findMany({ where: { projectId } }),
      prisma.evidence.findMany({ where: { projectId, status: 'accepted' } }),
      prisma.ideaVersion.findMany({
        where: { projectId },
        orderBy: { versionNumber: 'desc' },
        take: 1,
      }),
    ]);

    return {
      ideaVersion: ideaVersions[0],
      claims,
      acceptedEvidence: evidence,
    };
  }

  /**
   * When EMBEDDING_ENABLED=true, rank claims and evidence by semantic relevance to a task objective.
   */
  async getRelevantContext(projectId: string, queryText: string, limit = 8) {
    if (process.env.EMBEDDING_ENABLED !== 'true') {
      const base = await this.getProjectContext(projectId);
      return { ...base, retrievalReason: undefined as Record<string, unknown> | undefined };
    }

    const [semanticClaims, semanticEvidence, ideaVersions] = await Promise.all([
      embeddingService.hybridSearch(projectId, ['claim'], queryText, limit),
      embeddingService.hybridSearch(projectId, ['evidence'], queryText, limit),
      prisma.ideaVersion.findMany({
        where: { projectId },
        orderBy: { versionNumber: 'desc' },
        take: 1,
      }),
    ]);

    const claimIds = semanticClaims.map((r) => r.objectId);
    const evidenceIds = semanticEvidence.map((r) => r.objectId);

    const [claims, evidence] = await Promise.all([
      claimIds.length
        ? prisma.claim.findMany({ where: { id: { in: claimIds } } })
        : prisma.claim.findMany({ where: { projectId }, take: limit }),
      evidenceIds.length
        ? prisma.evidence.findMany({ where: { id: { in: evidenceIds } } })
        : prisma.evidence.findMany({ where: { projectId, status: 'accepted' }, take: limit }),
    ]);

    return {
      ideaVersion: ideaVersions[0],
      claims,
      acceptedEvidence: evidence,
      retrievalReason: {
        mode: 'semantic',
        queryText,
        claimScores: semanticClaims,
        evidenceScores: semanticEvidence,
      },
    };
  }
}

export const contextService = new ContextService();

// ─── Cross-project search ──────────────────────────────────────────────────

export class CrossProjectContextService {
  async search(query: string, excludeProjectId: string, limit = 10) {
    if (process.env.EMBEDDING_ENABLED !== 'true') {
      // Fallback: text search across all projects
      const [claims, evidence] = await Promise.all([
        prisma.claim.findMany({
          where: { projectId: { not: excludeProjectId }, text: { contains: query, mode: 'insensitive' } },
          take: limit,
        }),
        prisma.evidence.findMany({
          where: { projectId: { not: excludeProjectId }, title: { contains: query, mode: 'insensitive' } },
          take: limit,
        }),
      ]);
      return { claims, evidence, relatedProjects: [] };
    }

    const [semanticClaims, semanticEvidence] = await Promise.all([
      embeddingService.crossProjectSearch(['claim'], query, excludeProjectId, limit),
      embeddingService.crossProjectSearch(['evidence'], query, excludeProjectId, limit),
    ]);

    const claimIds = semanticClaims.map(r => r.objectId);
    const evidenceIds = semanticEvidence.map(r => r.objectId);

    const [claims, evidence] = await Promise.all([
      claimIds.length ? prisma.claim.findMany({ where: { id: { in: claimIds } } }) : [],
      evidenceIds.length ? prisma.evidence.findMany({ where: { id: { in: evidenceIds } } }) : [],
    ]);

    // Get related projects (projects that share similar claims/evidence)
    const projectIds = new Set([...semanticClaims.map(r => r.projectId), ...semanticEvidence.map(r => r.projectId)]);
    const relatedProjects = projectIds.size > 0
      ? await prisma.researchProject.findMany({ where: { id: { in: [...projectIds] } }, take: 5 })
      : [];

    return { claims, evidence, relatedProjects };
  }
}

export const crossProjectContextService = new CrossProjectContextService();

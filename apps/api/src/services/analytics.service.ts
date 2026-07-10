import { prisma } from '../prisma.js';
import { logger } from '../utils/logger.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface TrendData {
  period: string;
  claimCount: number;
  evidenceCount: number;
  critiqueCount: number;
  decisionCount: number;
  avgConfidence: number;
}

export interface CohortMetrics {
  cohortId: string;
  projectCount: number;
  avgClaimsPerProject: number;
  avgEvidencePerProject: number;
  avgDecisionQuality: number;
  topClaimTypes: { type: string; count: number }[];
  collaborationScore: number;
}

export interface PredictionResult {
  claimId: string;
  claimText: string;
  currentConfidence: number;
  predictedOutcome: 'supported' | 'contradicted' | 'inconclusive';
  confidence: number;
  factors: string[];
  timeToResolution: number; // days
}

export interface ResearchInsights {
  trends: TrendData[];
  predictions: PredictionResult[];
  cohortAnalysis: CohortMetrics[];
  recommendations: string[];
}

// ─── Analytics Service ─────────────────────────────────────────────────────

export class AnalyticsService {
  /**
   * Get trend data for a project over time
   */
  async getProjectTrends(projectId: string, days: number = 30): Promise<TrendData[]> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [claims, evidence, critiques, decisions] = await Promise.all([
      prisma.claim.groupBy({
        by: ['createdAt'],
        where: { projectId, createdAt: { gte: startDate } },
        _count: true,
        _avg: { confidence: true },
      }),
      prisma.evidence.groupBy({
        by: ['createdAt'],
        where: { projectId, createdAt: { gte: startDate } },
        _count: true,
      }),
      prisma.critique.groupBy({
        by: ['createdAt'],
        where: { projectId, createdAt: { gte: startDate } },
        _count: true,
      }),
      prisma.decisionRecord.groupBy({
        by: ['createdAt'],
        where: { projectId, createdAt: { gte: startDate } },
        _count: true,
      }),
    ]);

    // Group by day
    const trends: TrendData[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000);
      const dayStr = date.toISOString().split('T')[0];

      trends.push({
        period: dayStr,
        claimCount: claims.filter(c => c.createdAt.toISOString().startsWith(dayStr)).reduce((sum: number, c: { _count: number }) => sum + c._count, 0),
        evidenceCount: evidence.filter(e => e.createdAt.toISOString().startsWith(dayStr)).reduce((sum: number, e: { _count: number }) => sum + e._count, 0),
        critiqueCount: critiques.filter(c => c.createdAt.toISOString().startsWith(dayStr)).reduce((sum: number, c: { _count: number }) => sum + c._count, 0),
        decisionCount: decisions.filter(d => d.createdAt.toISOString().startsWith(dayStr)).reduce((sum: number, d: { _count: number }) => sum + d._count, 0),
        avgConfidence: claims.filter(c => c.createdAt.toISOString().startsWith(dayStr)).reduce((sum: number, c: { _avg: { confidence: number | null } }) => sum + (c._avg.confidence || 0), 0) / Math.max(1, claims.filter(c => c.createdAt.toISOString().startsWith(dayStr)).length),
      });
    }

    return trends;
  }

  /**
   * Predict claim outcomes based on historical patterns
   */
  async predictClaimOutcomes(projectId: string): Promise<PredictionResult[]> {
    const claims = await prisma.claim.findMany({
      where: { projectId, status: 'pending' },
    });

    // Get evidence and critiques for all claims in batch
    const claimIds = claims.map(c => c.id);
    const [allEvidence, allCritiques] = await Promise.all([
      prisma.evidence.findMany({ where: { claimId: { in: claimIds } } }),
      prisma.critique.findMany({ where: { projectId, targetId: { in: claimIds } } }),
    ]);

    const evidenceByClaim = new Map<string, typeof allEvidence>();
    const critiquesByClaim = new Map<string, typeof allCritiques>();
    for (const e of allEvidence) {
      if (e.claimId) {
        const list = evidenceByClaim.get(e.claimId) || [];
        list.push(e);
        evidenceByClaim.set(e.claimId, list);
      }
    }
    for (const c of allCritiques) {
      const list = critiquesByClaim.get(c.targetId) || [];
      list.push(c);
      critiquesByClaim.set(c.targetId, list);
    }

    const predictions: PredictionResult[] = [];

    for (const claim of claims) {
      const claimEvidence = evidenceByClaim.get(claim.id) || [];
      const claimCritiques = critiquesByClaim.get(claim.id) || [];
      const evidenceCount = claimEvidence.length;
      const critiqueCount = claimCritiques.length;
      const supportingEvidence = claimEvidence.filter(e => e.status === 'supported').length;
      const contradictingEvidence = claimEvidence.filter(e => e.status === 'contradicted').length;

      // Simple prediction model based on evidence and critique patterns
      let predictedOutcome: 'supported' | 'contradicted' | 'inconclusive';
      let confidence: number;
      const factors: string[] = [];

      if (supportingEvidence > contradictingEvidence && supportingEvidence >= 2) {
        predictedOutcome = 'supported';
        confidence = Math.min(0.9, 0.5 + (supportingEvidence - contradictingEvidence) * 0.1);
        factors.push(`${supportingEvidence} supporting evidence`);
      } else if (contradictingEvidence > supportingEvidence && contradictingEvidence >= 2) {
        predictedOutcome = 'contradicted';
        confidence = Math.min(0.9, 0.5 + (contradictingEvidence - supportingEvidence) * 0.1);
        factors.push(`${contradictingEvidence} contradicting evidence`);
      } else {
        predictedOutcome = 'inconclusive';
        confidence = 0.3;
        factors.push('Insufficient evidence pattern');
      }

      if (critiqueCount > 3) {
        factors.push(`${critiqueCount} critiques raised`);
        confidence *= 0.9;
      }

      predictions.push({
        claimId: claim.id,
        claimText: claim.text.substring(0, 100),
        currentConfidence: claim.confidence || 0.5,
        predictedOutcome,
        confidence,
        factors,
        timeToResolution: Math.floor(Math.random() * 7) + 1, // Placeholder
      });
    }

    return predictions;
  }

  /**
   * Analyze research cohorts (groups of related projects)
   */
  async analyzeCohorts(cohortIds: string[]): Promise<CohortMetrics[]> {
    const cohorts: CohortMetrics[] = [];

    for (const cohortId of cohortIds) {
      // Get projects in this cohort (using title or goal search)
      const projects = await prisma.researchProject.findMany({
        where: {
          OR: [
            { title: { contains: cohortId, mode: 'insensitive' } },
            { goal: { contains: cohortId, mode: 'insensitive' } },
          ],
        },
      });

      if (projects.length === 0) continue;

      const projectIds = projects.map(p => p.id);
      const [totalClaims, totalEvidence] = await Promise.all([
        prisma.claim.count({ where: { projectId: { in: projectIds } } }),
        prisma.evidence.count({ where: { projectId: { in: projectIds } } }),
      ]);

      // Get claim type distribution
      const claimTypeCounts = new Map<string, number>();
      const projectClaims = await prisma.claim.findMany({ where: { projectId: { in: projectIds } }, select: { type: true } });
      for (const claim of projectClaims) {
        claimTypeCounts.set(claim.type, (claimTypeCounts.get(claim.type) || 0) + 1);
      }

      const topClaimTypes = Array.from(claimTypeCounts.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Collaboration score based on evidence usage and critique activity
      const collaborationScore = Math.min(100, (totalEvidence / Math.max(1, totalClaims)) * 10 + (projects.length * 5));

      cohorts.push({
        cohortId,
        projectCount: projects.length,
        avgClaimsPerProject: totalClaims / projects.length,
        avgEvidencePerProject: totalEvidence / projects.length,
        avgDecisionQuality: 0.75, // Placeholder
        topClaimTypes,
        collaborationScore,
      });
    }

    return cohorts;
  }

  /**
   * Generate research recommendations
   */
  async generateRecommendations(projectId: string): Promise<string[]> {
    const recommendations: string[] = [];

    const [claimCount, evidenceCount, critiqueCount] = await Promise.all([
      prisma.claim.count({ where: { projectId } }),
      prisma.evidence.count({ where: { projectId } }),
      prisma.critique.count({ where: { projectId } }),
    ]);

    if (evidenceCount < claimCount * 2) {
      recommendations.push('Consider gathering more evidence to support your claims. Aim for at least 2 evidence items per claim.');
    }

    if (critiqueCount < claimCount) {
      recommendations.push('Run more cross-critiques to identify weaknesses in your reasoning.');
    }

    const pendingClaims = await prisma.claim.count({
      where: { projectId, status: 'pending' },
    });

    if (pendingClaims > 0) {
      recommendations.push(`You have ${pendingClaims} unresolved claims. Focus on gathering evidence for critical claims first.`);
    }

    const staleEvidence = await prisma.evidence.count({
      where: { projectId, stalenessRisk: 'high' },
    });

    if (staleEvidence > 0) {
      recommendations.push(`${staleEvidence} evidence items are marked as stale. Consider re-validating or finding newer sources.`);
    }

    return recommendations;
  }

  /**
   * Get comprehensive research insights
   */
  async getResearchInsights(projectId: string): Promise<ResearchInsights> {
    const [trends, predictions, recommendations] = await Promise.all([
      this.getProjectTrends(projectId, 30),
      this.predictClaimOutcomes(projectId),
      this.generateRecommendations(projectId),
    ]);

    return {
      trends,
      predictions,
      cohortAnalysis: [], // Placeholder for cohort analysis
      recommendations,
    };
  }
}

export const analyticsService = new AnalyticsService();

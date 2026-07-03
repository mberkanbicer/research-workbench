import { prisma } from '../prisma.js';

export class ProjectRepository {
  async create(title: string, goal: string, initialIdea: string, userId: string) {
    return prisma.researchProject.create({
      data: {
        title,
        goal,
        userId,
        ideaVersions: {
          create: {
            versionNumber: 1,
            title: 'Initial Idea',
            description: initialIdea,
            status: 'under_review',
          },
        },
      },
      include: {
        ideaVersions: true,
      },
    });
  }

  async findById(id: string, userId?: string) {
    const where: { id: string; userId?: string } = { id };
    if (userId) where.userId = userId;
    return prisma.researchProject.findUnique({
      where,
      include: {
        ideaVersions: {
          orderBy: { versionNumber: 'desc' }
        },
        claims: true,
        evidence: true,
        decisions: {
          orderBy: { createdAt: 'desc' }
        },
        tasks: {
          orderBy: { createdAt: 'desc' }
        },
        modelReviews: true,
        critiques: {
          include: {
            responses: true,
          }
        },
      },
    });
  }

  async getExportData(id: string, userId?: string) {
    const where: { id: string; userId?: string } = { id };
    if (userId) where.userId = userId;
    const project = await prisma.researchProject.findUnique({
      where,
      include: {
        ideaVersions: {
          orderBy: { versionNumber: 'desc' }
        },
        claims: true,
        evidence: {
          include: {
            assessments: true
          }
        },
        modelReviews: true,
        critiques: {
          include: {
            responses: true
          }
        },
        decisions: {
          include: {
            ideaVersion: true
          }
        },
        tasks: true,
      }
    });

    if (!project) return null;

    return project;
  }

  async list(userId?: string) {
    const where: { userId?: string } = {};
    if (userId) where.userId = userId;
    return prisma.researchProject.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async delete(id: string) {
    // Delete in dependency order inside a transaction: leaf tables first, root last.
    return prisma.$transaction(async (tx) => {
      // Level 3: grandchildren — fetch parent IDs first, then bulk delete
      const critiqueIds = (await tx.critique.findMany({ where: { projectId: id }, select: { id: true } })).map(c => c.id);
      if (critiqueIds.length > 0) {
        await tx.critiqueResponse.deleteMany({ where: { critiqueId: { in: critiqueIds } } });
      }
      const evidenceIds = (await tx.evidence.findMany({ where: { projectId: id }, select: { id: true } })).map(e => e.id);
      if (evidenceIds.length > 0) {
        await tx.evidenceAssessment.deleteMany({ where: { evidenceId: { in: evidenceIds } } });
      }

      // Level 2: direct children that have their own children
      await tx.claim.deleteMany({ where: { projectId: id } });
      await tx.evidence.deleteMany({ where: { projectId: id } });
      await tx.modelReview.deleteMany({ where: { projectId: id } });
      await tx.critique.deleteMany({ where: { projectId: id } });
      await tx.decisionRecord.deleteMany({ where: { projectId: id } });

      // Level 1: direct children with no sub-children
      await tx.researchSession.deleteMany({ where: { projectId: id } });
      await tx.ideaVersion.deleteMany({ where: { projectId: id } });
      await tx.hypothesis.deleteMany({ where: { projectId: id } });
      await tx.researchTask.deleteMany({ where: { projectId: id } });
      await tx.rawEvent.deleteMany({ where: { projectId: id } });
      await tx.runEvent.deleteMany({ where: { projectId: id } });
      await tx.contextManifest.deleteMany({ where: { projectId: id } });
      await tx.summary.deleteMany({ where: { projectId: id } });
      await tx.sourceEmbedding.deleteMany({ where: { projectId: id } });
      await tx.modelCall.deleteMany({ where: { projectId: id } });
      await tx.userFeedback.deleteMany({ where: { projectId: id } });
      await tx.knowledgeEdge.deleteMany({
        where: {
          OR: [
            { fromType: 'project', fromId: id },
            { toType: 'project', toId: id },
          ],
        },
      });
      // RunStage has no projectId — derive runIds from RunEvent
      const runIds = (await tx.runEvent.findMany({ where: { projectId: id }, select: { runId: true } })).map(r => r.runId);
      if (runIds.length > 0) {
        await tx.runStage.deleteMany({ where: { runId: { in: [...new Set(runIds)] } } });
      }

      // Root: delete the project itself
      return tx.researchProject.delete({ where: { id } });
    });
  }
}

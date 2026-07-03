import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';
import { ExtractionStage } from '../services/stages/extraction-stage.js';
import { buildServices } from '../orchestrator/service-builder.js';

async function getExtractionWithModelId(): Promise<{ extractionStage: ExtractionStage; modelId: string }> {
  const models = await prisma.modelConfig.findMany({ where: { isEnabled: true }, take: 1 });
  if (models.length === 0) {
    throw new Error('No enabled models configured. Cannot start extraction.');
  }
  const modelId = models[0].id;
  const modelIds = [modelId];
  const { services } = await buildServices(modelIds);
  return { extractionStage: new ExtractionStage(services), modelId };
}

const createIdeaVersionSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(10000),
});

export async function ideaVersionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);
  fastify.get('/projects/:projectId/idea-versions', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;
    const versions = await prisma.ideaVersion.findMany({
      where: { projectId },
      orderBy: { versionNumber: 'desc' },
    });
    return { data: versions };
  });

  fastify.get('/idea-versions/:ideaVersionId', async (request, reply) => {
    const { ideaVersionId } = request.params as { ideaVersionId: string };
    const version = await prisma.ideaVersion.findFirst({
      where: { id: ideaVersionId, project: { userId: request.user?.id } },
      include: {
        claims: true,
      }
    });
    if (!version) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Idea version not found' } });
    return { data: version };
  });

  fastify.post('/projects/:projectId/idea-versions', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;
    const { title, description } = createIdeaVersionSchema.parse(request.body);

    const lastVersion = await prisma.ideaVersion.findFirst({
      where: { projectId },
      orderBy: { versionNumber: 'desc' }
    });

    const nextNumber = (lastVersion?.versionNumber || 0) + 1;

    const version = await prisma.ideaVersion.create({
      data: {
        projectId,
        versionNumber: nextNumber,
        title,
        description,
        status: 'draft'
      }
    });

    return reply.status(201).send({ data: version });
  });

  fastify.post('/idea-versions/:ideaVersionId/extract-claims', async (request, reply) => {
    const { ideaVersionId } = request.params as { ideaVersionId: string };
    const version = await prisma.ideaVersion.findFirst({
      where: { id: ideaVersionId, project: { userId: request.user?.id } },
    });
    if (!version) return reply.status(404).send({ error: 'Version not found' });

    const runId = `manual-${Date.now()}`;
    const { extractionStage, modelId } = await getExtractionWithModelId();
    const claims = await extractionStage.performExtraction(runId, version.projectId, ideaVersionId, [modelId]);

    return { data: { claims } };
  });

  // Compare two idea versions
  fastify.get('/idea-versions/compare', async (request, reply) => {
    const { v1, v2 } = request.query as { v1: string; v2: string };
    if (!v1 || !v2) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'v1 and v2 query params required' } });
    }

    const version1 = await prisma.ideaVersion.findUnique({ where: { id: v1 } });
    const version2 = await prisma.ideaVersion.findUnique({ where: { id: v2 } });

    if (!version1 || !version2) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Version not found' } });
    }

    // Fetch claims for both versions
    const [claims1, claims2] = await Promise.all([
      prisma.claim.findMany({ where: { ideaVersionId: v1 } }),
      prisma.claim.findMany({ where: { ideaVersionId: v2 } }),
    ]);

    const claimTexts1 = new Set(claims1.map(c => c.text));
    const claimTexts2 = new Set(claims2.map(c => c.text));

    const added = claims2.filter(c => !claimTexts1.has(c.text));
    const removed = claims1.filter(c => !claimTexts2.has(c.text));
    const kept = claims1.filter(c => claimTexts2.has(c.text));

    return {
      data: {
        version1: { id: version1.id, title: version1.title, description: version1.description, status: version1.status, versionNumber: version1.versionNumber },
        version2: { id: version2.id, title: version2.title, description: version2.description, status: version2.status, versionNumber: version2.versionNumber },
        titleChanged: version1.title !== version2.title,
        descriptionChanged: version1.description !== version2.description,
        claims: { added, removed, kept, totalV1: claims1.length, totalV2: claims2.length },
      },
    };
  });
}

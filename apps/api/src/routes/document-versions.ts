import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';
import { computeDiff, diffToHtml } from '../utils/diff.js';

const CreateVersionSchema = z.object({
  message: z.string().max(500).optional()
});

const CompareVersionsSchema = z.object({
  v1: z.coerce.number().int().min(1),
  v2: z.coerce.number().int().min(1)
});

export async function documentVersionsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // Helper: verify document exists and user owns the project
  async function requireDocAccess(documentId: string, userId: string | undefined, reply: any): Promise<any | null> {
    const doc = await prisma.laTeXDocument.findUnique({ where: { id: documentId } });
    if (!doc) {
      await reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
      return null;
    }
    if (!(await requireProjectAccess(prisma, reply, doc.projectId, userId))) return null;
    return doc;
  }

  // ─── GET /latex/documents/:documentId/versions ──────────────────────────
  fastify.get('/latex/documents/:documentId/versions', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };

    const doc = await requireDocAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    const versions = await prisma.documentVersion.findMany({
      where: { documentId },
      include: {
        author: {
          select: { id: true, email: true, name: true }
        }
      },
      orderBy: { version: 'desc' }
    });

    return { data: versions };
  });

  // ─── GET /latex/documents/:documentId/versions/:version ─────────────────
  fastify.get('/latex/documents/:documentId/versions/:version', async (request, reply) => {
    const { documentId, version } = request.params as { documentId: string; version: string };
    const versionNum = parseInt(version, 10);

    const doc = await requireDocAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    const docVersion = await prisma.documentVersion.findUnique({
      where: { documentId_version: { documentId, version: versionNum } },
      include: {
        author: {
          select: { id: true, email: true, name: true }
        }
      }
    });

    if (!docVersion) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Version not found' } });
    }

    return { data: docVersion };
  });

  // ─── POST /latex/documents/:documentId/versions ─────────────────────────
  fastify.post('/latex/documents/:documentId/versions', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const body = CreateVersionSchema.parse(request.body);
    const userId = request.user?.id;

    const document = await requireDocAccess(documentId, request.user?.id, reply);
    if (!document) return;

    // Get next version number
    const lastVersion = await prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { version: 'desc' }
    });

    const nextVersion = (lastVersion?.version || 0) + 1;

    // Create version snapshot
    const docVersion = await prisma.documentVersion.create({
      data: {
        documentId,
        version: nextVersion,
        content: document.content,
        title: document.title,
        metadata: document.metadata as any,
        authorId: userId,
        message: body.message || `Version ${nextVersion}`
      }
    });

    return reply.status(201).send({ data: docVersion });
  });

  // ─── POST /latex/documents/:documentId/versions/:version/restore ────────
  fastify.post('/latex/documents/:documentId/versions/:version/restore', async (request, reply) => {
    const { documentId, version } = request.params as { documentId: string; version: string };
    const versionNum = parseInt(version, 10);

    const doc = await requireDocAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    const docVersion = await prisma.documentVersion.findUnique({
      where: { documentId_version: { documentId, version: versionNum } }
    });

    if (!docVersion) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Version not found' } });
    }

    // Restore document content
    await prisma.laTeXDocument.update({
      where: { id: documentId },
      data: {
        content: docVersion.content,
        title: docVersion.title,
        metadata: docVersion.metadata as any
      }
    });

    // Create a new version to track the restore
    const lastVersion = await prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { version: 'desc' }
    });

    const nextVersion = (lastVersion?.version || 0) + 1;
    const userId = request.user?.id;

    await prisma.documentVersion.create({
      data: {
        documentId,
        version: nextVersion,
        content: docVersion.content,
        title: docVersion.title,
        metadata: docVersion.metadata as any,
        authorId: userId,
        message: `Restored from version ${versionNum}`
      }
    });

    return { data: { success: true, restoredVersion: versionNum } };
  });

  // ─── GET /latex/documents/:documentId/versions/compare ──────────────────
  fastify.get('/latex/documents/:documentId/versions/compare', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const query = CompareVersionsSchema.parse(request.query);

    const doc = await requireDocAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    if (query.v1 === query.v2) {
      return reply.status(400).send({ error: { code: 'INVALID', message: 'Cannot compare a version with itself' } });
    }

    const [version1, version2] = await Promise.all([
      prisma.documentVersion.findUnique({
        where: { documentId_version: { documentId, version: query.v1 } },
        include: { author: { select: { id: true, email: true, name: true } } }
      }),
      prisma.documentVersion.findUnique({
        where: { documentId_version: { documentId, version: query.v2 } },
        include: { author: { select: { id: true, email: true, name: true } } }
      })
    ]);

    if (!version1 || !version2) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'One or both versions not found' } });
    }

    // Compute diff
    const diff = computeDiff(version1.content, version2.content);
    const diffHtml = diffToHtml(diff);

    return {
      data: {
        version1: {
          version: version1.version,
          title: version1.title,
          author: version1.author,
          createdAt: version1.createdAt,
          message: version1.message
        },
        version2: {
          version: version2.version,
          title: version2.title,
          author: version2.author,
          createdAt: version2.createdAt,
          message: version2.message
        },
        diff: {
          lines: diff.lines,
          stats: diff.stats,
          html: diffHtml
        }
      }
    };
  });
}

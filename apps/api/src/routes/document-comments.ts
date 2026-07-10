import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';

const CreateCommentSchema = z.object({
  content: z.string().min(1).max(5000),
  parentId: z.string().uuid().optional(),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0)
});

const UpdateCommentSchema = z.object({
  content: z.string().min(1).max(5000)
});

export async function documentCommentsRoutes(fastify: FastifyInstance) {
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

  // ─── GET /latex/documents/:documentId/comments ──────────────────────────
  fastify.get('/latex/documents/:documentId/comments', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const { resolved } = request.query as { resolved?: string };

    const doc = await requireDocAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    const where: any = { documentId, parentId: null }; // Only root comments
    if (resolved !== undefined) {
      where.resolved = resolved === 'true';
    }

    const comments = await prisma.documentComment.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Fetch replies for each root comment
    const commentIds = comments.map(c => c.id);
    const replies = await prisma.documentComment.findMany({
      where: { parentId: { in: commentIds } },
      include: {
        user: {
          select: { id: true, email: true, name: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Attach replies to their parent comments
    const repliesByParent = new Map<string, typeof replies>();
    for (const reply of replies) {
      if (reply.parentId) {
        const list = repliesByParent.get(reply.parentId) || [];
        list.push(reply);
        repliesByParent.set(reply.parentId, list);
      }
    }

    const commentsWithReplies = comments.map(c => ({
      ...c,
      replies: repliesByParent.get(c.id) || []
    }));

    return { data: commentsWithReplies };
  });

  // ─── POST /latex/documents/:documentId/comments ─────────────────────────
  fastify.post('/latex/documents/:documentId/comments', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const body = CreateCommentSchema.parse(request.body);
    const userId = request.user?.id;

    const doc = await requireDocAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    // If replying to a comment, verify parent exists
    if (body.parentId) {
      const parentComment = await prisma.documentComment.findUnique({
        where: { id: body.parentId }
      });

      if (!parentComment || parentComment.documentId !== documentId) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Parent comment not found' } });
      }
    }

    const comment = await prisma.documentComment.create({
      data: {
        documentId,
        userId,
        content: body.content,
        parentId: body.parentId,
        startOffset: body.startOffset,
        endOffset: body.endOffset
      },
      include: {
        user: {
          select: { id: true, email: true, name: true }
        }
      }
    });

    // Broadcast comment creation via WebSocket
    // (The collaboration service will handle this)

    return reply.status(201).send({ data: comment });
  });

  // ─── PATCH /latex/documents/:documentId/comments/:commentId ─────────────
  fastify.patch('/latex/documents/:documentId/comments/:commentId', async (request, reply) => {
    const { documentId, commentId } = request.params as { documentId: string; commentId: string };
    const body = UpdateCommentSchema.parse(request.body);
    const userId = request.user?.id;

    // Verify document access
    const doc = await requireDocAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    const comment = await prisma.documentComment.findUnique({
      where: { id: commentId }
    });

    if (!comment || comment.documentId !== documentId) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Comment not found' } });
    }

    // Only comment author can edit
    if (comment.userId !== userId) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Can only edit your own comments' } });
    }

    const updated = await prisma.documentComment.update({
      where: { id: commentId },
      data: { content: body.content },
      include: {
        user: {
          select: { id: true, email: true, name: true }
        }
      }
    });

    return { data: updated };
  });

  // ─── DELETE /latex/documents/:documentId/comments/:commentId ────────────
  fastify.delete('/latex/documents/:documentId/comments/:commentId', async (request, reply) => {
    const { documentId, commentId } = request.params as { documentId: string; commentId: string };
    const userId = request.user?.id;

    // Verify document access
    const doc = await requireDocAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    const comment = await prisma.documentComment.findUnique({
      where: { id: commentId }
    });

    if (!comment || comment.documentId !== documentId) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Comment not found' } });
    }

    // Only comment author can delete
    if (comment.userId !== userId) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Can only delete your own comments' } });
    }

    // Delete replies first
    await prisma.documentComment.deleteMany({
      where: { parentId: commentId }
    });

    await prisma.documentComment.delete({
      where: { id: commentId }
    });

    return { data: { success: true } };
  });

  // ─── POST /latex/documents/:documentId/comments/:commentId/resolve ──────
  fastify.post('/latex/documents/:documentId/comments/:commentId/resolve', async (request, reply) => {
    const { documentId, commentId } = request.params as { documentId: string; commentId: string };

    // Verify document access
    const doc = await requireDocAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    const comment = await prisma.documentComment.findUnique({
      where: { id: commentId }
    });

    if (!comment || comment.documentId !== documentId) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Comment not found' } });
    }

    const updated = await prisma.documentComment.update({
      where: { id: commentId },
      data: { resolved: !comment.resolved },
      include: {
        user: {
          select: { id: true, email: true, name: true }
        }
      }
    });

    return { data: updated };
  });
}

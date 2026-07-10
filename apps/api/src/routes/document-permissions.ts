import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { requireDocumentPermission, getDocumentRole } from '../middleware/document-auth.js';

const GrantPermissionSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['viewer', 'editor', 'admin'])
});

const UpdatePermissionSchema = z.object({
  role: z.enum(['viewer', 'editor', 'admin'])
});

export async function documentPermissionsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // ─── GET /latex/documents/:documentId/permissions ────────────────────────
  fastify.get('/latex/documents/:documentId/permissions', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const userId = request.user?.id;

    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    // Verify document exists
    const document = await prisma.laTeXDocument.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
    }

    // Check if user has at least viewer access
    const userRole = await getDocumentRole(documentId, userId);
    if (!userRole) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'No access to document' } });
    }

    // Get all permissions for this document
    const permissions = await prisma.documentPermission.findMany({
      where: { documentId },
      include: {
        user: {
          select: { id: true, email: true, name: true }
        }
      }
    });

    // Get document owner
    const project = await prisma.researchProject.findUnique({
      where: { id: document.projectId },
      select: { userId: true, user: { select: { id: true, email: true, name: true } } }
    });

    const ownerPermission = project?.user ? {
      userId: project.user.id,
      email: project.user.email,
      name: project.user.name,
      role: 'admin',
      isOwner: true
    } : null;

    return {
      data: {
        permissions: permissions.map(p => ({
          userId: p.user.id,
          email: p.user.email,
          name: p.user.name,
          role: p.role,
          isOwner: false
        })),
        owner: ownerPermission,
        yourRole: userRole
      }
    };
  });

  // ─── POST /latex/documents/:documentId/permissions ───────────────────────
  fastify.post('/latex/documents/:documentId/permissions', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const body = GrantPermissionSchema.parse(request.body);
    const userId = request.user?.id;

    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    // Only admin can grant permissions
    const userRole = await getDocumentRole(documentId, userId);
    if (userRole !== 'admin') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only admins can grant permissions' } });
    }

    // Can't grant permission to document owner
    const document = await prisma.laTeXDocument.findUnique({
      where: { id: documentId },
      select: { projectId: true }
    });

    const project = await prisma.researchProject.findUnique({
      where: { id: document?.projectId },
      select: { userId: true }
    });

    if (project?.userId === body.userId) {
      return reply.status(400).send({ error: { code: 'INVALID', message: 'Cannot modify owner permissions' } });
    }

    // Create or update permission
    const permission = await prisma.documentPermission.upsert({
      where: { documentId_userId: { documentId, userId: body.userId } },
      update: { role: body.role },
      create: {
        documentId,
        userId: body.userId,
        role: body.role,
        grantedBy: userId
      }
    });

    return reply.status(201).send({ data: permission });
  });

  // ─── PATCH /latex/documents/:documentId/permissions/:targetUserId ────────
  fastify.patch('/latex/documents/:documentId/permissions/:targetUserId', async (request, reply) => {
    const { documentId, targetUserId } = request.params as { documentId: string; targetUserId: string };
    const body = UpdatePermissionSchema.parse(request.body);
    const userId = request.user?.id;

    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    // Only admin can update permissions
    const userRole = await getDocumentRole(documentId, userId);
    if (userRole !== 'admin') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only admins can update permissions' } });
    }

    // Can't modify document owner
    const document = await prisma.laTeXDocument.findUnique({
      where: { id: documentId },
      select: { projectId: true }
    });

    const project = await prisma.researchProject.findUnique({
      where: { id: document?.projectId },
      select: { userId: true }
    });

    if (project?.userId === targetUserId) {
      return reply.status(400).send({ error: { code: 'INVALID', message: 'Cannot modify owner permissions' } });
    }

    const permission = await prisma.documentPermission.update({
      where: { documentId_userId: { documentId, userId: targetUserId } },
      data: { role: body.role }
    });

    return { data: permission };
  });

  // ─── DELETE /latex/documents/:documentId/permissions/:targetUserId ───────
  fastify.delete('/latex/documents/:documentId/permissions/:targetUserId', async (request, reply) => {
    const { documentId, targetUserId } = request.params as { documentId: string; targetUserId: string };
    const userId = request.user?.id;

    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    // Only admin can revoke permissions
    const userRole = await getDocumentRole(documentId, userId);
    if (userRole !== 'admin') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only admins can revoke permissions' } });
    }

    // Can't revoke document owner
    const document = await prisma.laTeXDocument.findUnique({
      where: { id: documentId },
      select: { projectId: true }
    });

    const project = await prisma.researchProject.findUnique({
      where: { id: document?.projectId },
      select: { userId: true }
    });

    if (project?.userId === targetUserId) {
      return reply.status(400).send({ error: { code: 'INVALID', message: 'Cannot revoke owner permissions' } });
    }

    await prisma.documentPermission.delete({
      where: { documentId_userId: { documentId, userId: targetUserId } }
    });

    return { data: { success: true } };
  });

  // ─── GET /latex/documents/:documentId/permissions/check ──────────────────
  fastify.get('/latex/documents/:documentId/permissions/check', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const userId = request.user?.id;

    if (!userId) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const role = await getDocumentRole(documentId, userId);

    return {
      data: {
        hasAccess: role !== null,
        role,
        canView: role !== null,
        canEdit: role === 'editor' || role === 'admin',
        canAdmin: role === 'admin'
      }
    };
  });
}

import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../prisma.js';

export type DocumentRole = 'viewer' | 'editor' | 'admin';

const ROLE_HIERARCHY: Record<DocumentRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2
};

/**
 * Check if user has required role for a document
 */
export async function checkDocumentPermission(
  documentId: string,
  userId: string,
  requiredRole: DocumentRole
): Promise<boolean> {
  // Document owner has admin access
  const document = await prisma.laTeXDocument.findUnique({
    where: { id: documentId },
    select: { projectId: true }
  });

  if (!document) return false;

  // Check if user owns the project (project owner = document admin)
  const project = await prisma.researchProject.findUnique({
    where: { id: document.projectId },
    select: { userId: true }
  });

  if (project?.userId === userId) return true;

  // Check document-specific permissions
  const permission = await prisma.documentPermission.findUnique({
    where: { documentId_userId: { documentId, userId } }
  });

  if (!permission) return false;

  return ROLE_HIERARCHY[permission.role as DocumentRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Get user's role for a document
 */
export async function getDocumentRole(
  documentId: string,
  userId: string
): Promise<DocumentRole | null> {
  // Check if user owns the project
  const document = await prisma.laTeXDocument.findUnique({
    where: { id: documentId },
    select: { projectId: true }
  });

  if (!document) return null;

  const project = await prisma.researchProject.findUnique({
    where: { id: document.projectId },
    select: { userId: true }
  });

  if (project?.userId === userId) return 'admin';

  // Check document-specific permissions
  const permission = await prisma.documentPermission.findUnique({
    where: { documentId_userId: { documentId, userId } }
  });

  return permission?.role as DocumentRole | null;
}

/**
 * Fastify preHandler middleware for document permission check
 */
export function requireDocumentPermission(requiredRole: DocumentRole) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { documentId } = request.params as { documentId: string };
    const userId = request.user?.id;

    if (!userId) {
      return reply.status(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
    }

    const hasPermission = await checkDocumentPermission(documentId, userId, requiredRole);

    if (!hasPermission) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: `Requires ${requiredRole} role` }
      });
    }
  };
}

/**
 * Project-ownership guard for routes.
 *
 * Verifies that `projectId` belongs to the authenticated user.
 * Returns `true` if access is allowed; otherwise sends a 404 and returns `false`.
 *
 * Usage:
 *   if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyReply } from 'fastify';

export async function requireProjectAccess(
  prisma: PrismaClient,
  reply: FastifyReply,
  projectId: string,
  userId: string | undefined,
): Promise<boolean> {
  const project = await prisma.researchProject.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) {
    await reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    return false;
  }
  return true;
}

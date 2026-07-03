import { createHash } from 'node:crypto';
import { prisma } from '../prisma.js';
import type { RawEvent } from '@repo/shared';
import type { Prisma } from '@prisma/client';

export class EventRepository {
  async append(projectId: string, type: string, payload: Record<string, unknown>, createdBy: string) {
    // SHA-256 content hash for integrity verification
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

    return prisma.rawEvent.create({
      data: {
        projectId,
        type,
        payload: payload as unknown as Prisma.InputJsonValue,
        createdBy,
        hash,
      },
    });
  }

  async findByProject(projectId: string) {
    return prisma.rawEvent.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }
}

import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma.js';

export async function updateStage(
  runId: string,
  stageName: string,
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'PAUSED',
  error?: string,
  tx?: Prisma.TransactionClient,
) {
  const client = tx || prisma;
  await client.runStage.upsert({
    where: { runId_stageName: { runId, stageName } },
    update: { status, error, updatedAt: new Date() },
    create: { runId, stageName, status, error },
  });
}

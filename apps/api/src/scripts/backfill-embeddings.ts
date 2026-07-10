/**
 * Backfill SourceEmbedding rows for all claims and evidence in a project (or all projects).
 * Usage: EMBEDDING_ENABLED=true tsx src/scripts/backfill-embeddings.ts [--project-id=<uuid>]
 */
import 'dotenv/config';
import { prisma } from '../prisma.js';
import { indexClaimEmbedding, indexEvidenceEmbedding } from '../services/embedding-index.js';
import { logger } from '../utils/logger.js';

async function main() {
  if (process.env.EMBEDDING_ENABLED !== 'true') {
    logger.error('Set EMBEDDING_ENABLED=true before running backfill.');
    process.exit(1);
  }

  const projectArg = process.argv.find((a) => a.startsWith('--project-id='));
  const projectId = projectArg?.split('=')[1];

  const projects = projectId
    ? await prisma.researchProject.findMany({ where: { id: projectId }, select: { id: true, title: true } })
    : await prisma.researchProject.findMany({ select: { id: true, title: true } });

  if (projects.length === 0) {
    logger.info('No projects found.');
    return;
  }

  let claimCount = 0;
  let evidenceCount = 0;

  for (const project of projects) {
    logger.info('Backfilling embeddings', { projectId: project.id, title: project.title });

    const claims = await prisma.claim.findMany({ where: { projectId: project.id } });
    for (const claim of claims) {
      indexClaimEmbedding(project.id, claim.id, claim.text);
      claimCount++;
    }

    const evidence = await prisma.evidence.findMany({ where: { projectId: project.id } });
    for (const item of evidence) {
      indexEvidenceEmbedding(project.id, item.id, item.title, item.excerpt, item.summary);
      evidenceCount++;
    }
  }

  // Allow fire-and-forget indexing to settle
  await new Promise((r) => setTimeout(r, 2000));

  logger.info('Queued indexing', { claimCount, evidenceCount });
}

main()
  .catch((err) => {
    logger.error('Backfill failed', { error: (err as Error).message });
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
/**
 * Backfill SourceEmbedding rows for all claims and evidence in a project (or all projects).
 * Usage: EMBEDDING_ENABLED=true tsx src/scripts/backfill-embeddings.ts [--project-id=<uuid>]
 */
import 'dotenv/config';
import { prisma } from '../prisma.js';
import { indexClaimEmbedding, indexEvidenceEmbedding } from '../services/embedding-index.js';

async function main() {
  if (process.env.EMBEDDING_ENABLED !== 'true') {
    console.error('Set EMBEDDING_ENABLED=true before running backfill.');
    process.exit(1);
  }

  const projectArg = process.argv.find((a) => a.startsWith('--project-id='));
  const projectId = projectArg?.split('=')[1];

  const projects = projectId
    ? await prisma.researchProject.findMany({ where: { id: projectId }, select: { id: true, title: true } })
    : await prisma.researchProject.findMany({ select: { id: true, title: true } });

  if (projects.length === 0) {
    console.log('No projects found.');
    return;
  }

  let claimCount = 0;
  let evidenceCount = 0;

  for (const project of projects) {
    console.log(`Backfilling: ${project.title} (${project.id})`);

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

  console.log(`Queued indexing for ${claimCount} claims and ${evidenceCount} evidence items.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
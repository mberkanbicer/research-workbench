// Standalone test worker — bypasses BullMQ and runs orchestration directly.
// Usage: npx tsx test-worker.ts --projectId=<id> --modelIds=<id1,id2,id3> [--maxRounds=3] [--runId=<id>]
//   or:  npx tsx test-worker.ts   (uses first-enabled model from DB)
import { buildServices } from './apps/api/src/orchestrator/service-builder.js';
import { prisma } from './apps/api/src/prisma.js';

async function main() {
  const args = process.argv.slice(2).reduce((acc: Record<string, string>, arg) => {
    const [key, val] = arg.replace(/^--/, '').split('=');
    if (key && val) acc[key] = val;
    return acc;
  }, {} as Record<string, string>);

  let projectId = args.projectId;
  let rawModelIds = args.modelIds;
  let maxRounds = args.maxRounds ? parseInt(args.maxRounds, 10) : 3;
  const runId = args.runId || `manual-${Date.now()}`;

  // If no arguments, pick first project and first enabled model from DB
  if (!projectId) {
    const project = await prisma.researchProject.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!project) { console.error('No projects found. Create one first.'); process.exit(1); }
    projectId = project.id;
    console.log('Using project:', projectId, project.title);
  }

  if (!rawModelIds) {
    const models = await prisma.modelConfig.findMany({ where: { isEnabled: true } });
    if (models.length === 0) { console.error('No enabled models found.'); process.exit(1); }
    const modelIds = models.map((m: any) => m.id);
    console.log('Using models:', modelIds);
    const { orchestrator } = await buildServices(modelIds);
    await orchestrator.runProjectCycle(projectId, modelIds, maxRounds, runId);
  } else {
    const modelIds = rawModelIds.split(',');
    console.log('Using models:', modelIds);
    const { orchestrator } = await buildServices(modelIds);
    await orchestrator.runProjectCycle(projectId, modelIds, maxRounds, runId);
  }

  console.log('Test job completed successfully');
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Test job failed:', error.message);
  process.exit(1);
});

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/utils/password.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

// ─── Default users ────────────────────────────────────────────────────────

async function ensureDefaultUser(email: string, password: string, name: string) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        name,
      },
    });
    console.log(`Created user: ${email} / ${password}`);

    // Create a session so they can log in immediately
    const token = generateToken();
    await prisma.authSession.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    console.log(`  Session token: ${token}`);
  } else {
    console.log(`User already exists: ${email}`);
  }
  return user;
}

// ─── Adopt orphan projects ────────────────────────────────────────────────

async function adoptOrphanProjects(userId: string) {
  const orphans = await prisma.researchProject.findMany({
    where: { userId: null },
  });
  for (const project of orphans) {
    await prisma.researchProject.update({
      where: { id: project.id },
      data: { userId },
    });
    console.log(`Adopted orphan project: ${project.title} -> user ${userId.slice(0, 8)}`);
  }
  return orphans.length;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  // 1. Create default users
  console.log('=== Users ===');
  const demoUser = await ensureDefaultUser('demo@example.com', 'demo1234', 'Demo User');
  const adminUser = await ensureDefaultUser('admin@example.com', 'admin1234', 'Admin');

  // 2. Adopt any existing ownerless projects
  console.log('');
  console.log('=== Orphan Projects ===');
  const adopted = await adoptOrphanProjects(demoUser.id);
  console.log(`Adopted ${adopted} ownerless project(s) to ${demoUser.email}`);

  // 3. Models — per user
  console.log('');
  console.log('=== Model Configs ===');
  const mockDataPath = path.join(__dirname, '../../../templates/mock-data.json');
  const mockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf-8'));

  // Clean up any global models (userId=null) left from previous schema
  const globalModels = await prisma.modelConfig.findMany({ where: { userId: null } });
  if (globalModels.length > 0) {
    await prisma.modelConfig.deleteMany({ where: { userId: null } });
    console.log(`Removed ${globalModels.length} global model(s) (migrating to per-user)`);
  }

  // Create models for each default user
  for (const user of [demoUser, adminUser]) {
    for (const modelDef of mockData.models) {
      const existing = await prisma.modelConfig.findFirst({
        where: { name: modelDef.name, userId: user.id },
      });
      if (!existing) {
        await prisma.modelConfig.create({ data: { ...modelDef, userId: user.id } });
        console.log(`Created model "${modelDef.name}" for ${user.email}`);
      }
    }

    const existingOllama = await prisma.modelConfig.findFirst({
      where: { provider: 'ollama', userId: user.id },
    });
    if (!existingOllama) {
      await prisma.modelConfig.create({
        data: {
          name: 'Local Llama 3',
          provider: 'ollama',
          model: 'llama3',
          baseUrl: 'http://localhost:11434',
          contextWindow: 8192,
          preferredMaxInputRatio: 0.5,
          isEnabled: true,
          userId: user.id,
        },
      });
      console.log(`Created local model "Local Llama 3" for ${user.email}`);
    }
  }

  // 4. Demo project
  console.log('');
  console.log('=== Demo Project ===');
  const existingProject = await prisma.researchProject.findFirst({
    where: { title: mockData.demoProject.title },
  });
  if (!existingProject) {
    const project = await prisma.researchProject.create({
      data: {
        title: mockData.demoProject.title,
        goal: mockData.demoProject.goal,
        userId: demoUser.id,
        ideaVersions: {
          create: {
            versionNumber: 1,
            title: 'Initial Idea',
            description: mockData.demoProject.initialIdea,
            status: 'under_review',
          },
        },
      },
    });

    console.log('Seeding initial evidence...');
    for (const evidence of mockData.seedEvidence) {
      await prisma.evidence.create({
        data: {
          projectId: project.id,
          title: evidence.title,
          sourceUrl: evidence.sourceUrl,
          sourceType: evidence.sourceType,
          status: evidence.status,
          stalenessRisk: evidence.stalenessRisk,
        },
      });
    }
    console.log('Demo project created.');
  } else {
    console.log('Demo project already exists, skipping.');
  }

  console.log('');
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

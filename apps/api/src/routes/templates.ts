import { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Resolve templates directory relative to the project root
const TEMPLATES_DIR = join(process.cwd(), 'src', 'templates');

function loadTemplates() {
  const files = readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => {
    const content = readFileSync(join(TEMPLATES_DIR, f), 'utf-8');
    return JSON.parse(content);
  });
}

const createFromTemplateSchema = {
  type: 'object',
  required: ['templateId', 'title', 'topic'],
  properties: {
    templateId: { type: 'string' },
    title: { type: 'string' },
    topic: { type: 'string' },
  },
};

export async function templateRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // List available templates
  fastify.get('/templates', async () => {
    const templates = loadTemplates();
    return {
      data: templates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
      })),
    };
  });

  // Get template details
  fastify.get('/templates/:templateId', async (request, reply) => {
    const { templateId } = request.params as { templateId: string };
    const templates = loadTemplates();
    const template = templates.find(t => t.id === templateId);

    if (!template) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Template not found' } });
    }

    return { data: template };
  });

  // Create project from template
  fastify.post('/projects/from-template', async (request, reply) => {
    if (!request.user?.id) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }

    const body = request.body as any;
    const { templateId, title, topic } = body;

    if (!templateId || !title || !topic) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'templateId, title, and topic are required' } });
    }

    const templates = loadTemplates();
    const template = templates.find(t => t.id === templateId);
    if (!template) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Template not found' } });
    }

    const goal = template.goalTemplate.replace(/\{topic\}/g, topic);

    // Create project with initial idea version
    const project = await prisma.researchProject.create({
      data: {
        title,
        goal,
        userId: request.user.id,
        ideaVersions: {
          create: {
            versionNumber: 1,
            title: 'Initial Idea',
            description: `Research proposal for: ${topic}\n\nTemplate: ${template.name}`,
            status: 'under_review',
          },
        },
      },
      include: { ideaVersions: true },
    });

    // Create initial claims from template
    const version = project.ideaVersions[0];
    if (template.initialClaims?.length > 0) {
      await Promise.all(template.initialClaims.map((c: any) =>
        prisma.claim.create({
          data: {
            projectId: project.id,
            ideaVersionId: version.id,
            text: c.text.replace(/\{topic\}/g, topic),
            type: c.type || 'research',
            criticality: c.criticality || 'medium',
            requiresEvidence: true,
            status: 'unverified',
          },
        })
      ));
    }

    return reply.status(201).send({ data: project });
  });
}

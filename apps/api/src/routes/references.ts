import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';
import { 
  parseBibTeX, 
  parseRIS, 
  generateBibTeXFile,
  generateCitationKey,
  ImportedReference 
} from '../services/reference-import.service.js';

const CreateReferenceSchema = z.object({
  title: z.string().min(1),
  authors: z.array(z.string()).min(1),
  year: z.number().int().optional(),
  journal: z.string().optional(),
  volume: z.string().optional(),
  pages: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  abstract: z.string().optional(),
  citationKey: z.string().optional(),
  type: z.string().default('article'),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional()
});

const ImportReferencesSchema = z.object({
  content: z.string(),
  format: z.enum(['bibtex', 'ris'])
});

export async function referencesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // ─── GET /projects/:projectId/references ────────────────────────────────
  fastify.get('/projects/:projectId/references', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { search, tag, type } = request.query as { 
      search?: string; 
      tag?: string; 
      type?: string 
    };

    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const where: any = { projectId };
    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { citationKey: { contains: search, mode: 'insensitive' } },
        { journal: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (tag) {
      where.tags = { has: tag };
    }
    
    if (type) {
      where.type = type;
    }

    const references = await prisma.reference.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    return { data: references };
  });

  // ─── POST /projects/:projectId/references ───────────────────────────────
  fastify.post('/projects/:projectId/references', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = CreateReferenceSchema.parse(request.body);

    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    // Generate citation key if not provided
    const citationKey = body.citationKey || generateCitationKey({
      ...body,
      citationKey: '',
      type: body.type,
      tags: body.tags
    });

    // Check for duplicate citation key
    const existing = await prisma.reference.findUnique({
      where: { projectId_citationKey: { projectId, citationKey } }
    });

    if (existing) {
      return reply.status(409).send({ 
        error: { code: 'CONFLICT', message: `Reference with key '${citationKey}' already exists` } 
      });
    }

    const reference = await prisma.reference.create({
      data: {
        projectId,
        title: body.title,
        authors: body.authors,
        year: body.year,
        journal: body.journal,
        volume: body.volume,
        pages: body.pages,
        doi: body.doi,
        url: body.url,
        abstract: body.abstract,
        citationKey,
        type: body.type,
        tags: body.tags,
        metadata: body.metadata as any,
        source: 'manual'
      }
    });

    return reply.status(201).send({ data: reference });
  });

  // ─── POST /projects/:projectId/references/import ────────────────────────
  fastify.post('/projects/:projectId/references/import', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = ImportReferencesSchema.parse(request.body);

    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    let importedRefs: ImportedReference[];
    
    switch (body.format) {
      case 'bibtex':
        importedRefs = parseBibTeX(body.content);
        break;
      case 'ris':
        importedRefs = parseRIS(body.content);
        break;
      default:
        return reply.status(400).send({ error: { code: 'INVALID_FORMAT', message: 'Unsupported format' } });
    }

    if (importedRefs.length === 0) {
      return reply.status(400).send({ error: { code: 'NO_REFERENCES', message: 'No references found in file' } });
    }

    // Import references
    const imported = [];
    const skipped = [];

    for (const ref of importedRefs) {
      // Check for duplicate
      const existing = await prisma.reference.findUnique({
        where: { projectId_citationKey: { projectId, citationKey: ref.citationKey } }
      });

      if (existing) {
        skipped.push(ref.citationKey);
        continue;
      }

      const reference = await prisma.reference.create({
        data: {
          projectId,
          title: ref.title,
          authors: ref.authors,
          year: ref.year,
          journal: ref.journal,
          volume: ref.volume,
          pages: ref.pages,
          doi: ref.doi,
          url: ref.url,
          abstract: ref.abstract,
          citationKey: ref.citationKey,
          type: ref.type,
          tags: ref.tags,
          metadata: ref.metadata as any,
          source: body.format
        }
      });

      imported.push(reference);
    }

    return {
      data: {
        imported: imported.length,
        skipped: skipped.length,
        skippedKeys: skipped,
        references: imported
      }
    };
  });

  // ─── GET /projects/:projectId/references/export ─────────────────────────
  fastify.get('/projects/:projectId/references/export', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { format } = request.query as { format?: string };

    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const references = await prisma.reference.findMany({
      where: { projectId },
      orderBy: { citationKey: 'asc' }
    });

    if (format === 'csv') {
      const headers = ['citationKey', 'type', 'title', 'authors', 'year', 'journal', 'volume', 'pages', 'doi', 'url', 'tags'];
      const escape = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
      const rows = references.map(r => [
        escape(r.citationKey),
        escape(r.type),
        escape(r.title),
        escape(r.authors.join('; ')),
        escape(String(r.year || '')),
        escape(r.journal || ''),
        escape(r.volume || ''),
        escape(r.pages || ''),
        escape(r.doi || ''),
        escape(r.url || ''),
        escape(r.tags.join('; ')),
      ].join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="references-${projectId}.csv"`);
      return reply.send(csv);
    }

    const bibtex = generateBibTeXFile(references.map(r => ({
      title: r.title,
      authors: r.authors,
      year: r.year || undefined,
      journal: r.journal || undefined,
      volume: r.volume || undefined,
      pages: r.pages || undefined,
      doi: r.doi || undefined,
      url: r.url || undefined,
      abstract: r.abstract || undefined,
      citationKey: r.citationKey,
      type: r.type,
      tags: r.tags
    })));

    reply.header('Content-Type', 'application/x-bibtex');
    reply.header('Content-Disposition', `attachment; filename="references-${projectId}.bib"`);
    return reply.send(bibtex);
  });

  // ─── GET /projects/:projectId/references/:referenceId ───────────────────
  fastify.get('/projects/:projectId/references/:referenceId', async (request, reply) => {
    const { projectId, referenceId } = request.params as { projectId: string; referenceId: string };

    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const reference = await prisma.reference.findFirst({
      where: { id: referenceId, projectId }
    });

    if (!reference) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Reference not found' } });
    }

    return { data: reference };
  });

  // ─── DELETE /projects/:projectId/references/:referenceId ────────────────
  fastify.delete('/projects/:projectId/references/:referenceId', async (request, reply) => {
    const { projectId, referenceId } = request.params as { projectId: string; referenceId: string };

    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const reference = await prisma.reference.findFirst({
      where: { id: referenceId, projectId }
    });

    if (!reference) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Reference not found' } });
    }

    await prisma.reference.delete({
      where: { id: referenceId }
    });

    return { data: { success: true } };
  });
}

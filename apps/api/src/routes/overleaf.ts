import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { overleafService } from '../services/overleaf.service.js';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';

const ExportSchema = z.object({
  format: z.enum(['zip', 'tar', 'git']).optional().default('zip'),
  includeAuxiliary: z.boolean().optional().default(false),
  compiler: z.enum(['pdflatex', 'xelatex', 'lualatex']).optional().default('pdflatex')
});

const ImportSchema = z.object({
  projectJson: z.object({
    name: z.string(),
    files: z.array(z.object({
      path: z.string(),
      content: z.string(),
      type: z.enum(['file', 'folder'])
    })),
    settings: z.object({
      compiler: z.enum(['pdflatex', 'xelatex', 'lualatex']),
      _SYNCTEX: z.boolean(),
      spellCheck: z.boolean(),
      autoCompile: z.boolean()
    })
  })
});

export async function overleafRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // Helper: verify document exists and user owns the project
  async function requireDocAccess(documentId: string, userId: string | undefined, reply: any): Promise<any | null> {
    const doc = await prisma.laTeXDocument.findUnique({ where: { id: documentId } });
    if (!doc) {
      await reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
      return null;
    }
    if (!(await requireProjectAccess(prisma, reply, doc.projectId, userId))) return null;
    return doc;
  }

  // ─── POST /latex/documents/:documentId/export/overleaf ───────────────────
  fastify.post('/latex/documents/:documentId/export/overleaf', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const body = ExportSchema.parse(request.body);

    const doc = await requireDocAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    try {
      const result = await overleafService.exportToOverleaf(documentId, body);

      reply.header('Content-Type', result.mimeType);
      reply.header('Content-Disposition', `attachment; filename="${result.filename}"`);
      
      return reply.send(result.data);
    } catch (error) {
      return reply.status(500).send({
        error: {
          code: 'EXPORT_FAILED',
          message: 'Export failed'
        }
      });
    }
  });

  // ─── GET /latex/documents/:documentId/overleaf-project ───────────────────
  fastify.get('/latex/documents/:documentId/overleaf-project', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };

    const doc = await requireDocAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    try {
      const projectJson = await overleafService.getProjectJson(documentId);
      return { data: projectJson };
    } catch (error) {
      return reply.status(500).send({
        error: {
          code: 'EXPORT_FAILED',
          message: 'Failed to generate project JSON'
        }
      });
    }
  });

  // ─── POST /projects/:projectId/latex/import/overleaf ─────────────────────
  fastify.post('/projects/:projectId/latex/import/overleaf', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = ImportSchema.parse(request.body);

    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    try {
      const documentId = await overleafService.importFromOverleaf(
        projectId,
        body.projectJson
      );

      return reply.status(201).send({ data: { documentId } });
    } catch (error) {
      return reply.status(500).send({
        error: {
          code: 'IMPORT_FAILED',
          message: 'Import failed'
        }
      });
    }
  });
}

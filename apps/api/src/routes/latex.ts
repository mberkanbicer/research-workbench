import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authMiddleware } from './auth.js';
import { requireProjectAccess } from './ownership.js';
import { latexService } from '../services/latex.service.js';

const CreateDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  template: z.enum(['article', 'report', 'book', 'beamer', 'letter', 'blank']).optional().default('article'),
  metadata: z.object({
    author: z.string().optional(),
    abstract: z.string().optional(),
    keywords: z.array(z.string()).optional()
  }).optional()
});

const UpdateDocumentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  template: z.enum(['article', 'report', 'book', 'beamer', 'letter', 'blank']).optional(),
  metadata: z.record(z.unknown()).optional()
});

const CompileSchema = z.object({
  content: z.string().optional() // Optional: compile without saving
});

export async function latexRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // ─── GET /projects/:projectId/latex/documents ────────────────────────────
  fastify.get('/projects/:projectId/latex/documents', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const documents = await latexService.getProjectDocuments(projectId);
    return { data: documents };
  });

  // ─── POST /projects/:projectId/latex/documents ───────────────────────────
  fastify.post('/projects/:projectId/latex/documents', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = CreateDocumentSchema.parse(request.body);

    if (!(await requireProjectAccess(prisma, reply, projectId, request.user?.id))) return;

    const document = await latexService.createDocument(
      projectId,
      body.title,
      body.template,
      body.metadata
    );

    return reply.status(201).send({ data: document });
  });

  // Helper: verify document exists and user owns the project
  async function requireDocumentAccess(documentId: string, userId: string | undefined, reply: any): Promise<any | null> {
    const document = await latexService.getDocument(documentId);
    if (!document) {
      await reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
      return null;
    }
    if (!(await requireProjectAccess(prisma, reply, document.projectId, userId))) return null;
    return document;
  }

  // ─── GET /latex/documents/:documentId ────────────────────────────────────
  fastify.get('/latex/documents/:documentId', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };

    const doc = await requireDocumentAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    return { data: doc };
  });

  // ─── PATCH /latex/documents/:documentId ──────────────────────────────────
  fastify.patch('/latex/documents/:documentId', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const body = UpdateDocumentSchema.parse(request.body);

    const doc = await requireDocumentAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    const updated = await latexService.updateDocument(documentId, body);
    return { data: updated };
  });

  // ─── DELETE /latex/documents/:documentId ─────────────────────────────────
  fastify.delete('/latex/documents/:documentId', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };

    const doc = await requireDocumentAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    await latexService.deleteDocument(documentId);
    return { data: { success: true } };
  });

  // ─── POST /latex/documents/:documentId/duplicate ──────────────────────────
  fastify.post('/latex/documents/:documentId/duplicate', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };

    const doc = await requireDocumentAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    const duplicate = await prisma.laTeXDocument.create({
      data: {
        projectId: doc.projectId,
        title: `${doc.title} (Copy)`,
        content: doc.content,
        template: doc.template,
        metadata: doc.metadata as any,
      }
    });

    return { data: duplicate };
  });

  // ─── POST /latex/documents/:documentId/compile ───────────────────────────
  fastify.post('/latex/documents/:documentId/compile', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };

    const doc = await requireDocumentAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    const result = await latexService.compileDocument(documentId);
    return { data: result };
  });

  // ─── POST /latex/compile-preview ─────────────────────────────────────────
  fastify.post('/latex/compile-preview', async (request) => {
    const { content } = CompileSchema.parse(request.body);

    if (!content) {
      return { data: { success: false, error: 'No content provided' } };
    }

    // Validate without saving
    const warnings: string[] = [];

    // Check balanced braces
    let braceCount = 0;
    for (const char of content) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      if (braceCount < 0) {
        return { data: { success: false, error: 'Unbalanced braces: extra closing brace found' } };
      }
    }
    if (braceCount !== 0) {
      return { data: { success: false, error: `Unbalanced braces: ${braceCount} unclosed brace(s)` } };
    }

    // Check balanced environments
    const envRegex = /\\begin\{(\w+)\}/g;
    const endRegex = /\\end\{(\w+)\}/g;
    const beginEnvs: string[] = [];
    let match;

    while ((match = envRegex.exec(content)) !== null) {
      beginEnvs.push(match[1]);
    }

    while ((match = endRegex.exec(content)) !== null) {
      const envName = match[1];
      const lastBegin = beginEnvs.lastIndexOf(envName);
      if (lastBegin === -1) {
        return { data: { success: false, error: `Unexpected \\end{${envName}} without matching \\begin` } };
      }
      beginEnvs.splice(lastBegin, 1);
    }

    if (beginEnvs.length > 0) {
      return { data: { success: false, error: `Missing \\end for environment(s): ${beginEnvs.join(', ')}` } };
    }

    // Generate mock PDF
    const mockPdf = latexService.generateMockPdf(content, 'Preview');

    return { data: { success: true, pdf: mockPdf, warnings } };
  });

  // ─── GET /latex/templates ────────────────────────────────────────────────
  fastify.get('/latex/templates', async () => {
    return { data: latexService.getTemplates() };
  });

  // ─── POST /latex/documents/:documentId/extract-metadata ──────────────────
  fastify.post('/latex/documents/:documentId/extract-metadata', async (request, reply) => {
    const { documentId } = request.params as { documentId: string };

    const doc = await requireDocumentAccess(documentId, request.user?.id, reply);
    if (!doc) return;

    const metadata = latexService.extractMetadata(doc.content);
    return { data: metadata };
  });
}

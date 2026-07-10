import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authMiddleware, optionalAuth } from './auth.js';

const CreateTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  category: z.enum(['academic', 'business', 'book', 'presentation', 'other']),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional()
});

const SearchTemplatesSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export async function templateMarketplaceRoutes(fastify: FastifyInstance) {
  // ─── GET /latex/templates/marketplace ───────────────────────────────────
  fastify.get('/latex/templates/marketplace', async (request) => {
    const query = SearchTemplatesSchema.parse(request.query);

    const where: any = { isPublic: true };

    if (query.category) {
      where.category = query.category;
    }

    if (query.tags && query.tags.length > 0) {
      where.tags = { hasSome: query.tags };
    }

    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } }
      ];
    }

    const skip = (query.page - 1) * query.limit;

    const [templates, total] = await Promise.all([
      prisma.laTeXTemplate.findMany({
        where,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          authorId: true,
          downloads: true,
          rating: true,
          tags: true,
          createdAt: true,
          author: {
            select: { id: true, name: true }
          }
        },
        orderBy: { downloads: 'desc' },
        skip,
        take: query.limit
      }),
      prisma.laTeXTemplate.count({ where })
    ]);

    return {
      data: {
        templates,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          pages: Math.ceil(total / query.limit)
        }
      }
    };
  });

  // ─── GET /latex/templates/marketplace/categories ────────────────────────
  fastify.get('/latex/templates/marketplace/categories', async () => {
    const categories = await prisma.laTeXTemplate.groupBy({
      by: ['category'],
      where: { isPublic: true },
      _count: { id: true }
    });

    return {
      data: categories.map(c => ({
        id: c.category,
        name: c.category.charAt(0).toUpperCase() + c.category.slice(1),
        count: c._count.id
      }))
    };
  });

  // ─── GET /latex/templates/marketplace/:id ───────────────────────────────
  fastify.get('/latex/templates/marketplace/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const template = await prisma.laTeXTemplate.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        content: true,
        authorId: true,
        downloads: true,
        rating: true,
        tags: true,
        metadata: true,
        createdAt: true,
        author: {
          select: { id: true, name: true }
        }
      }
    });

    if (!template) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Template not found' } });
    }

    return { data: template };
  });

  // ─── POST /latex/templates/marketplace ──────────────────────────────────
  fastify.post('/latex/templates/marketplace', { preHandler: [authMiddleware] }, async (request, reply) => {
    const body = CreateTemplateSchema.parse(request.body);
    const userId = request.user?.id;

    const template = await prisma.laTeXTemplate.create({
      data: {
        name: body.name,
        description: body.description,
        category: body.category,
        content: body.content,
        authorId: userId,
        isPublic: true,
        tags: body.tags,
        metadata: body.metadata as any
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        tags: true,
        createdAt: true
      }
    });

    return reply.status(201).send({ data: template });
  });

  // ─── POST /latex/templates/marketplace/:id/use ──────────────────────────
  fastify.post('/latex/templates/marketplace/:id/use', async (request, reply) => {
    const { id } = request.params as { id: string };

    const template = await prisma.laTeXTemplate.findUnique({
      where: { id }
    });

    if (!template) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Template not found' } });
    }

    // Increment download count
    await prisma.laTeXTemplate.update({
      where: { id },
      data: { downloads: { increment: 1 } }
    });

    return { data: { content: template.content } };
  });

  // ─── DELETE /latex/templates/marketplace/:id ────────────────────────────
  fastify.delete('/latex/templates/marketplace/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user?.id;

    const template = await prisma.laTeXTemplate.findUnique({
      where: { id }
    });

    if (!template) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Template not found' } });
    }

    // Only author can delete
    if (template.authorId !== userId) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only template author can delete' } });
    }

    await prisma.laTeXTemplate.delete({
      where: { id }
    });

    return { data: { success: true } };
  });
}

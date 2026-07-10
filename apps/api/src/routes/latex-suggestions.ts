import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { latexSuggestionsService } from '../services/latex-suggestions.service.js';
import { authMiddleware } from './auth.js';

const GetSuggestionsSchema = z.object({
  content: z.string(),
  cursorPosition: z.number().int().min(0),
  prefix: z.string().optional()
});

const AnalyzeDocumentSchema = z.object({
  content: z.string()
});

export async function latexSuggestionsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // ─── POST /latex/suggestions ─────────────────────────────────────────────
  fastify.post('/latex/suggestions', async (request) => {
    const body = GetSuggestionsSchema.parse(request.body);
    
    const suggestions = latexSuggestionsService.getSuggestions(
      body.content,
      body.cursorPosition,
      body.prefix
    );

    return { data: suggestions };
  });

  // ─── POST /latex/autocompletions ─────────────────────────────────────────
  fastify.post('/latex/autocompletions', async (request) => {
    const body = GetSuggestionsSchema.parse(request.body);
    
    const completions = latexSuggestionsService.getAutocompletions(
      body.content,
      body.cursorPosition
    );

    return { data: completions };
  });

  // ─── POST /latex/analyze ─────────────────────────────────────────────────
  fastify.post('/latex/analyze', async (request) => {
    const body = AnalyzeDocumentSchema.parse(request.body);
    
    const issues = latexSuggestionsService.analyzeDocument(body.content);

    return { data: issues };
  });
}

import Fastify from 'fastify';
import crypto from 'crypto';
import dotenv from 'dotenv';
import cors from '@fastify/cors';
import { FastifySSEPlugin } from 'fastify-sse-v2';
import { projectRoutes } from './routes/projects.js';
import { modelRoutes } from './routes/models.js';
import { claimRoutes } from './routes/claims.js';
import { evidenceRoutes } from './routes/evidence.js';
import { ideaVersionRoutes } from './routes/idea-versions.js';
import { decisionRoutes } from './routes/decisions.js';
import { runRoutes } from './routes/runs.js';
import { feedbackRoutes } from './routes/feedback.js';
import { authRoutes } from './routes/auth.js';
import { settingsRoutes } from './routes/settings.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { hypothesisRoutes } from './routes/hypotheses.js';
import { promptRoutes } from './routes/prompts.js';
import { templateRoutes } from './routes/templates.js';
import { graphRoutes } from './routes/graph.js';
import { annotationRoutes } from './routes/annotations.js';
import { evaluationCriteriaRoutes } from './routes/evaluation-criteria.js';
import { realtimeRoutes } from './routes/realtime.js';
import { analyticsRoutes } from './routes/analytics.js';
import { researchRoutes } from './routes/research.js';
import { latexRoutes } from './routes/latex.js';
import { collaborationWsRoutes } from './routes/collaboration-ws.js';
import { latexSuggestionsRoutes } from './routes/latex-suggestions.js';
import { overleafRoutes } from './routes/overleaf.js';
import { documentPermissionsRoutes } from './routes/document-permissions.js';
import { documentVersionsRoutes } from './routes/document-versions.js';
import { documentCommentsRoutes } from './routes/document-comments.js';
import { referencesRoutes } from './routes/references.js';
import { templateMarketplaceRoutes } from './routes/template-marketplace.js';
import { apiRateLimiter } from './middleware/rate-limit.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { AppError } from './utils/errors.js';

// Start the BullMQ worker (side-effect import)
import('./orchestrator/worker.js').then(() => {
  logger.info('[Worker] Worker module loaded');
}).catch(err => {
  logger.error('[Worker] Failed to load worker', { error: (err as Error).message });
});

dotenv.config({ path: '.env' });

const fastify = Fastify({
  logger: true
});

fastify.register(FastifySSEPlugin);
fastify.register(cors, {
  origin: process.env.WEB_ORIGIN 
    ? process.env.WEB_ORIGIN.split(',')
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002',
      'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:3002'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

// Global rate limit hook — applies to all routes (auth routes get an additional
// stricter auth-specific rate limiter via their own preHandler).
fastify.addHook('preHandler', apiRateLimiter);

// Request ID middleware — adds unique ID to every request for correlation
fastify.addHook('onRequest', async (request) => {
  request.id = crypto.randomUUID();
});

fastify.addHook('onSend', async (request, reply) => {
  reply.header('X-Request-ID', request.id);
});

fastify.setErrorHandler(errorHandler);
fastify.setNotFoundHandler(notFoundHandler);

fastify.register(projectRoutes);
fastify.register(modelRoutes);
fastify.register(claimRoutes);
fastify.register(evidenceRoutes);
fastify.register(ideaVersionRoutes);
fastify.register(decisionRoutes);
fastify.register(runRoutes);
fastify.register(feedbackRoutes);
fastify.register(authRoutes);
fastify.register(settingsRoutes);
fastify.register(apiKeyRoutes);
fastify.register(hypothesisRoutes);
fastify.register(promptRoutes);
fastify.register(templateRoutes);
fastify.register(graphRoutes);
fastify.register(annotationRoutes);
fastify.register(evaluationCriteriaRoutes);
fastify.register(realtimeRoutes);
fastify.register(analyticsRoutes);
fastify.register(researchRoutes);
fastify.register(latexRoutes);
fastify.register(collaborationWsRoutes);
fastify.register(latexSuggestionsRoutes);
fastify.register(overleafRoutes);
fastify.register(documentPermissionsRoutes);
fastify.register(documentVersionsRoutes);
fastify.register(documentCommentsRoutes);
fastify.register(referencesRoutes);
fastify.register(templateMarketplaceRoutes);

fastify.get('/health', async () => {
  return { status: 'ok' };
});

fastify.get('/ready', async () => {
  return { status: 'ready' };
});

// Auth is enforced per-route via preHandler hooks (authMiddleware / optionalAuth).
// See each route file for the specific auth requirement.

const start = async () => {
  try {
    const port = process.env.API_PORT ? parseInt(process.env.API_PORT) : 4000;
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info({ port }, 'Server started');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
async function shutdown(signal: string) {
  fastify.log.info(`Received ${signal}, shutting down gracefully...`);
  try {
    await fastify.close();
    fastify.log.info('Fastify closed');
    const { prisma } = await import('./prisma.js');
    await prisma.$disconnect();
    fastify.log.info('Prisma disconnected');
    const { deliberationWorker } = await import('./orchestrator/worker.js');
    await deliberationWorker.close(true);
    fastify.log.info('BullMQ worker closed gracefully');
  } catch (err) {
    fastify.log.error({ err }, 'Error during shutdown');
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
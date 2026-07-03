import Fastify from 'fastify';
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

// Start the BullMQ worker (side-effect import)
import('./orchestrator/worker.js').then(() => {
  console.log('[Worker] Worker module loaded');
}).catch(err => {
  console.error('[Worker] Failed to load worker (non-fatal — runs continue via direct orchestration):', err.message);
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

fastify.setErrorHandler((error, request, reply) => {
  if (error.name === 'ZodError') {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error
      }
    });
  }

  fastify.log.error(error);
  reply.status(500).send({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred'
    }
  });
});

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
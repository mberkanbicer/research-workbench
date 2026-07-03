import { Queue, Worker, Job, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { buildServices } from './service-builder.js';
import { logger } from '../utils/logger.js';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6380', {
  maxRetriesPerRequest: null
});

interface JobData {
  projectId: string;
  maxRounds: number;
  modelIds: string[];
  loopMode?: 'standard' | 'self_improving' | 'adversarial';
  searchProvider?: string;
  checkpointStages?: string[];
}

export const deliberationQueue = new Queue('deliberate', { connection: connection as ConnectionOptions });

export const deliberationWorker = new Worker('deliberate', async (job: Job<JobData>) => {
  const { projectId, maxRounds, modelIds, loopMode, searchProvider, checkpointStages } = job.data;

  const mode = loopMode || 'standard';
  const { goalLoop } = await buildServices(modelIds, searchProvider);
  await goalLoop.run({
    projectId,
    modelIds,
    maxIterations: maxRounds,
    runId: job.id!,
    loopMode: mode,
    qualityThreshold: mode === 'self_improving' || mode === 'adversarial' ? 0.6 : 0.75,
    checkpointStages,
  });
}, {
  connection: connection as ConnectionOptions,
  concurrency: 2,
  limiter: { max: 5, duration: 1000 },
});

logger.info('BullMQ Worker started', { pid: process.pid });

deliberationWorker.on('ready', () => {
  logger.info('Worker ready to process jobs');
  console.log('[Worker] Ready to process jobs');
});

deliberationWorker.on('completed', job => {
  logger.info('Job completed', { jobId: job.id });
  console.log('[Worker] Job completed:', job.id);
});

deliberationWorker.on('failed', (job, err) => {
  logger.error('Job failed', { jobId: job?.id, error: err.message });
  console.error('[Worker] Job failed:', job?.id, err.message);
});

import { deliberationWorker } from './worker.js';
import { logger } from '../utils/logger.js';
import type { Job } from 'bullmq';

logger.info('BullMQ Worker standalone process started', { pid: process.pid });

deliberationWorker.on('ready', () => {
  logger.info('Worker is ready to process jobs');
});

deliberationWorker.on('completed', (job: Job) => {
  logger.info('Job completed', { jobId: job.id });
});

deliberationWorker.on('failed', (job: Job | undefined, err: Error) => {
  logger.error('Job failed', { jobId: job?.id, error: err.message });
});

// Keep the process alive
process.on('SIGINT', async () => {
  logger.info('Worker shutting down');
  await deliberationWorker.close();
  process.exit(0);
});

logger.info('Waiting for jobs...');

import { deliberationWorker } from './worker.js';
import type { Job } from 'bullmq';

console.log('[Worker] BullMQ Worker standalone process started');
console.log('[Worker] PID:', process.pid);

deliberationWorker.on('ready', () => {
  console.log('[Worker] Worker is ready to process jobs');
});

deliberationWorker.on('completed', (job: Job) => {
  console.log('[Worker] Job completed:', job.id);
});

deliberationWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error('[Worker] Job failed:', job?.id, err.message);
});

// Keep the process alive
process.on('SIGINT', async () => {
  console.log('[Worker] Shutting down...');
  await deliberationWorker.close();
  process.exit(0);
});

console.log('[Worker] Waiting for jobs...');

import 'dotenv/config';
import { JobQueueWorker } from '../workers/jobQueueWorker.js';

/**
 * Start the job queue worker
 */
function main() {
  console.log('Starting job queue worker...');

  const worker = new JobQueueWorker();

  // Handle graceful shutdown
  const shutdown = () => {
    console.log('\nShutting down worker...');
    worker.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start the worker
  worker.start();
}

// Run the worker
try {
  main();
} catch (error) {
  console.error('Failed to start worker:', error);
  process.exit(1);
}

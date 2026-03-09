import { Queue } from './Queue';
import { Worker } from './Worker';

const options = {
  redis: {
    host: 'localhost',
    port: 6379,
  },
  prefix: 'test-queue'
};

async function runTest() {
  const queue = new Queue('email-tasks', options);
  await queue.startDelayedPoller(500); // Poll every 500ms for delayed jobs

  const worker = new Worker('email-tasks', async (job) => {
    console.log(`Processing job ${job.id} of type ${job.type} with data:`, job.data);
    
    if (job.data.shouldFail) {
      throw new Error('Simulated failure');
    }
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 500));
  }, options);

  worker.start();

  console.log('--- Enqueueing normal job ---');
  await queue.add('sendEmail', { to: 'user@example.com', body: 'Hello!' });

  console.log('--- Enqueueing delayed job (5s) ---');
  await queue.add('sendEmail', { to: 'user2@example.com', body: 'Delayed' }, { delay: 5000 });

  console.log('--- Enqueueing failing job (for retry test) ---');
  await queue.add('sendEmail', { shouldFail: true, attempt: 1 }, { maxRetries: 2 });

  // Keep process alive for a bit to see results
  setTimeout(async () => {
    console.log('--- Test complete (stopping) ---');
    await worker.stop();
    await queue.close();
    process.exit(0);
  }, 15000);
}

runTest().catch(console.error);

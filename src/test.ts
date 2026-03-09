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

  console.log('--- Enqueueing jobs with different priorities ---');
  // Enqueue priority 200 (Low)
  await queue.add('lowPriority', { label: 'Low (200)' }, { priority: 200 });
  // Enqueue priority 10 (High)
  await queue.add('highPriority', { label: 'High (10)' }, { priority: 10 });
  // Enqueue priority 100 (Default)
  await queue.add('defaultPriority', { label: 'Default (100)' });
  // Enqueue priority 5 (Highest)
  await queue.add('highestPriority', { label: 'Highest (5)' }, { priority: 5 });

  console.log('--- Enqueueing delayed job (5s) ---');
  await queue.add('delayedJob', { label: 'Delayed (5s)' }, { delay: 5000 });

  // Keep process alive for a bit to see results
  setTimeout(async () => {
    console.log('--- Test complete (stopping) ---');
    await worker.stop();
    await queue.close();
    process.exit(0);
  }, 15000);
}

runTest().catch(console.error);

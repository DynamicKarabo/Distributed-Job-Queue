import { Queue } from './Queue';
import { Worker } from './Worker';
import { Dashboard } from './Dashboard';

const options = {
  redis: {
    host: 'localhost',
    port: 6379,
  },
  prefix: 'test-queue',
  rateLimit: {
    limit: 10,
    windowMs: 5000
  }
};

async function runTest() {
  const queue = new Queue('email-tasks', options);
  await queue.startDelayedPoller(500);

  const dashboard = new Dashboard(queue, 3000);
  dashboard.start();

  const worker = new Worker('email-tasks', async (job) => {
    console.log(`Processing job ${job.id} of type ${job.type} with data:`, job.data);
    
    if (job.data.shouldFail) {
      throw new Error('Simulated failure');
    }
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 500));
  }, options);

  worker.start();

  console.log('--- Enqueueing dependency chain ---');
  // Job A (Parent)
  const jobA = await queue.add('parentJob', { label: 'Parent (A)' });
  // Job B (Child, depends on A)
  const jobB = await queue.add('childJob', { label: 'Child (B)' }, { dependencies: [jobA.id] });
  
  console.log(`Enqueued Parent ${jobA.id} and Child ${jobB.id} (waiting on A)`);

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

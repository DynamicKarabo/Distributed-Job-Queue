# Distributed Job Queue

A reliable, scalable background job processing system built with Node.js, TypeScript, and Redis.

## Features

- **Asynchronous Task Execution**: Offload heavy tasks from your main application loop.
- **Reliable Job Processing**: Jobs are tracked in a 'processing' list and only removed once successfully handled.
- **Automatic Retries**: Supports exponential backoff for failed jobs.
- **Scheduled/Delayed Jobs**: Run jobs at a specific timestamp or after a delay.
- **Dead Letter Queue (DLQ)**: Automatically moves persistently failing jobs to a separate queue for inspection.
- **Horizontal Scalability**: Run multiple workers concurrently on different machines.

## Getting Started

### Prerequisites

- Node.js (v14+)
- Redis Server (running on localhost:6379 by default)

### Installation

```bash
npm install
```

### Usage

#### Enqueueing a Job (Producer)

```typescript
import { Queue } from './src/Queue';

const queue = new Queue('email-tasks', {
  redis: { host: 'localhost', port: 6379 }
});

// Enqueue immediately
await queue.add('sendEmail', { to: 'user@example.com', body: 'Welcome!' });

// Enqueue with delay (5 seconds)
await queue.add('generateReport', { reportId: 123 }, { delay: 5000 });
```

#### Processing Jobs (Worker)

```typescript
import { Worker } from './src/Worker';

const worker = new Worker('email-tasks', async (job) => {
  console.log(`Processing ${job.type} job:`, job.data);
  // Perform work...
}, {
  redis: { host: 'localhost', port: 6379 }
});

await worker.start();
```

### Testing

Run the included end-to-end test script:

```bash
npx ts-node src/test.ts
```

## Future Improvements

- [ ] Priority Queues
- [ ] Rate-limited Workers
- [ ] Job Monitoring Dashboard
- [ ] Job Dependency Graphs
- [ ] Distributed Cluster Coordination (using Redis Redlock)

## License

ISC

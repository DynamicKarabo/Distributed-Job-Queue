import Redis from 'ioredis';
import { Job, QueueOptions } from './types';

export type JobHandler<T = any> = (job: Job<T>) => Promise<void>;

export class Worker {
  private redis: Redis;
  private queueKey: string;
  private processingKey: string;
  private prefix: string;
  private running: boolean = false;

  constructor(
    private name: string,
    private handler: JobHandler,
    options: QueueOptions
  ) {
    this.prefix = options.prefix || 'job-queue';
    this.redis = new Redis(options.redis);
    this.queueKey = `${this.prefix}:${this.name}:jobs`;
    this.processingKey = `${this.prefix}:${this.name}:processing`;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    console.log(`Worker started for queue: ${this.name}`);

    while (this.running) {
      try {
        // Use RPOPLPUSH for reliable queueing (atomic move from queue to processing)
        // Note: In a real distributed system, we'd need to handle the processing list recovery.
        const jobData = await this.redis.brpoplpush(this.queueKey, this.processingKey, 5);
        
        if (jobData) {
          const job: Job = JSON.parse(jobData);
          job.status = 'processing';
          job.processedAt = Date.now();

          try {
            await this.handler(job);
            job.status = 'completed';
            job.finishedAt = Date.now();
            // Remove from processing list on success
            await this.redis.lrem(this.processingKey, 1, jobData);
            console.log(`Job ${job.id} completed successfully.`);
          } catch (error: any) {
            console.error(`Job ${job.id} failed:`, error.message);
            job.status = 'failed';
            job.error = error.message;
            
            // Handle retry logic (Milestone 3)
            await this.handleFailure(job, jobData);
          }
        }
      } catch (error) {
        console.error('Worker error:', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  private async handleFailure(job: Job, jobData: string) {
    if (job.retryCount < job.maxRetries) {
      job.retryCount++;
      job.status = 'queued';

      // Default retry strategy: Fixed delay of 5s if not specified
      let backoffDelay = 5000; 

      // If exponential backoff is specified in job or worker options, calculate it.
      // (For now, let's just use a hardcoded exponential if maxRetries > 1)
      backoffDelay = Math.pow(2, job.retryCount) * 1000;

      const delayedKey = `${this.prefix}:${this.name}:delayed`;
      const runAt = Date.now() + backoffDelay;

      await this.redis.multi()
        .lrem(this.processingKey, 1, jobData)
        .zadd(delayedKey, runAt, JSON.stringify(job))
        .exec();
      
      console.log(`Job ${job.id} failed. Retrying in ${backoffDelay}ms (Attempt ${job.retryCount}/${job.maxRetries})`);
    } else {
      const dlqKey = `${this.prefix}:${this.name}:dlq`;
      await this.redis.multi()
        .lrem(this.processingKey, 1, jobData)
        .lpush(dlqKey, JSON.stringify(job))
        .exec();
      console.log(`Job ${job.id} moved to DLQ after ${job.maxRetries} retries.`);
    }
  }

  async stop() {
    this.running = false;
    await this.redis.quit();
  }
}

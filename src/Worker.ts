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

    // Define Lua script for atomic priority pop and push to processing list
    this.redis.defineCommand('priorityPopPush', {
      numberOfKeys: 2,
      lua: `
        local job = redis.call('ZRANGE', KEYS[1], 0, 0)[1]
        if job then
          redis.call('ZREM', KEYS[1], job)
          redis.call('LPUSH', KEYS[2], job)
          return job
        else
          return nil
        end
      `
    });
  }

  async start() {
    if (this.running) return;
    this.running = true;
    console.log(`Worker started for queue: ${this.name} (Priority enabled)`);

    while (this.running) {
      try {
        // Use the custom Lua script for priority-aware reliable fetching
        const jobData = await (this.redis as any).priorityPopPush(this.queueKey, this.processingKey);
        
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
            
            // Handle retry logic (Milestone 3 / Priority Phase)
            await this.handleFailure(job, jobData);
          }
        } else {
          // No job found, wait a bit before polling again
          await new Promise(resolve => setTimeout(resolve, 1000));
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

      // Exponential backoff
      const backoffDelay = Math.pow(2, job.retryCount) * 1000;

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

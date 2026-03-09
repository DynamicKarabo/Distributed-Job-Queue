import Redis from 'ioredis';
import { ulid } from 'ulid';
import { Job, JobStatus, QueueOptions, AddJobOptions } from './types';

export class Queue {
  private redis: Redis;
  private queueKey: string;
  private prefix: string;

  constructor(private name: string, options: QueueOptions) {
    this.prefix = options.prefix || 'job-queue';
    this.redis = new Redis(options.redis);
    this.queueKey = `${this.prefix}:${this.name}:jobs`;
  }

  async add<T = any>(type: string, data: T, options: AddJobOptions = {}): Promise<Job<T>> {
    const job: Job<T> = {
      id: ulid(),
      type,
      data,
      status: 'queued',
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
      createdAt: Date.now(),
    };

    if (options.delay && options.delay > 0) {
      const delayedKey = `${this.prefix}:${this.name}:delayed`;
      const runAt = Date.now() + options.delay;
      await this.redis.zadd(delayedKey, runAt, JSON.stringify(job));
    } else {
      await this.redis.lpush(this.queueKey, JSON.stringify(job));
    }

    return job;
  }

  /**
   * Starts a poller that moves jobs from the 'delayed' set to the main queue
   * when their scheduled time has arrived.
   */
  async startDelayedPoller(intervalMs: number = 1000) {
    const delayedKey = `${this.prefix}:${this.name}:delayed`;
    
    setInterval(async () => {
      const now = Date.now();
      // Use a Lua script or simple Redis commands to atomically move tasks
      // Fetch jobs where score <= now
      const jobsToMove = await this.redis.zrangebyscore(delayedKey, 0, now);
      
      if (jobsToMove.length > 0) {
        for (const jobData of jobsToMove) {
          await this.redis.multi()
            .zrem(delayedKey, jobData)
            .lpush(this.queueKey, jobData)
            .exec();
        }
        console.log(`Moved ${jobsToMove.length} jobs from delayed to main queue.`);
      }
    }, intervalMs);
  }

  async close() {
    await this.redis.quit();
  }
}

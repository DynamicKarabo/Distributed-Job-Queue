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
      priority: options.priority ?? 100,
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
      createdAt: Date.now(),
      dependencies: options.dependencies,
    };

    if (options.dependencies && options.dependencies.length > 0) {
      job.status = 'queued'; // Still 'queued' but effectively waiting
      const waitingKey = `${this.prefix}:${this.name}:waiting:${job.id}`;
      const waitingSetKey = `${this.prefix}:${this.name}:waiting-set`;
      const parentCounterKey = `${this.prefix}:${this.name}:parents:${job.id}`;
      
      // 1. Store the job data
      await this.redis.set(waitingKey, JSON.stringify(job));
      // 2. Add to waiting set
      await this.redis.sadd(waitingSetKey, job.id);
      // 3. Set the counter of parents it's waiting for
      await this.redis.set(parentCounterKey, options.dependencies.length);
      
      // 4. Register this job as a dependent for each parent
      for (const parentId of options.dependencies) {
        const dependentsKey = `${this.prefix}:${this.name}:dependents:${parentId}`;
        await this.redis.sadd(dependentsKey, job.id);
      }
      
      console.log(`Job ${job.id} is waiting on ${options.dependencies.length} parents.`);
    } else if (options.delay && options.delay > 0) {
      const delayedKey = `${this.prefix}:${this.name}:delayed`;
      const runAt = Date.now() + options.delay;
      await this.redis.zadd(delayedKey, runAt, JSON.stringify(job));
    } else {
      // Use ZSET for the main queue to support priority. 
      // Score = priority.
      await this.redis.zadd(this.queueKey, job.priority, JSON.stringify(job));
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
            .zadd(this.queueKey, JSON.parse(jobData).priority, jobData)
            .exec();
        }
        console.log(`Moved ${jobsToMove.length} jobs from delayed to main queue.`);
      }
    }, intervalMs);
  }

  /**
   * Returns statistics for the queue.
   */
  async getStats() {
    const delayedKey = `${this.prefix}:${this.name}:delayed`;
    const dlqKey = `${this.prefix}:${this.name}:dlq`;
    const processingKey = `${this.prefix}:${this.name}:processing`;
    const waitingSetKey = `${this.prefix}:${this.name}:waiting-set`;

    const [queued, delayed, dlq, processing, waiting] = await Promise.all([
      this.redis.zcard(this.queueKey),
      this.redis.zcard(delayedKey),
      this.redis.llen(dlqKey),
      this.redis.llen(processingKey),
      this.redis.scard(waitingSetKey),
    ]);

    return {
      name: this.name,
      queued,
      delayed,
      dlq,
      processing,
      waiting,
      total: queued + delayed + dlq + processing + waiting
    };
  }

  async close() {
    await this.redis.quit();
  }
}

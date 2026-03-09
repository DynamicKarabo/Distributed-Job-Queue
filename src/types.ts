export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface Job<T = any> {
  id: string;
  type: string;
  data: T;
  status: JobStatus;
  priority: number;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  processedAt?: number;
  finishedAt?: number;
  error?: string;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface QueueOptions {
  redis: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };
  prefix?: string;
  rateLimit?: RateLimitOptions;
}

export interface QueueStats {
  name: string;
  queued: number;
  delayed: number;
  dlq: number;
  processing: number;
  total: number;
}

export interface AddJobOptions {
  priority?: number;
  delay?: number;
  maxRetries?: number;
  retryOptions?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
}

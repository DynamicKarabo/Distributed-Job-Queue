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

export interface QueueOptions {
  redis: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };
  prefix?: string;
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

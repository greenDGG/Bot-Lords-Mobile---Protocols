export type MarchType = 'supply' | 'attack' | 'scout' | 'rally' | 'reinforce' | 'transport';

export type MarchStatus = 'pending' | 'sending' | 'acked' | 'completed' | 'failed' | 'cancelled';

export interface MarchQueueEntry {
  id: number;
  type: MarchType;
  targetName?: string;
  targetCoord?: Buffer;
  status: MarchStatus;
  createdAt: number;
  sentAt?: number;
  ackedAt?: number;
  completedAt?: number;
  error?: string;
  meta?: Record<string, any>;
}

export interface MarchQueueConfig {
  maxConcurrent: number;
  delayBetweenMs: number;
  ackTimeoutMs: number;
}

export const DEFAULT_MARCH_QUEUE_CONFIG: MarchQueueConfig = {
  maxConcurrent: 4,
  delayBetweenMs: 2000,
  ackTimeoutMs: 5000,
};

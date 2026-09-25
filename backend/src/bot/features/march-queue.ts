import { EventEmitter } from 'events';
import type { BotInstance } from '../core/bot-instance';
import { MarchQueueEntry, MarchQueueConfig, DEFAULT_MARCH_QUEUE_CONFIG, MarchType } from '../models/march-queue.types';

type SendFn = (entry: MarchQueueEntry) => Promise<boolean> | boolean;
type AckProto = number | number[];

let nextId = 1;

export class MarchQueue extends EventEmitter {
  private queue: MarchQueueEntry[] = [];
  private activeCount = 0;
  private processing = false;
  private ackResolve: (() => void) | null = null;
  private ackTimer: NodeJS.Timeout | null = null;
  private config: MarchQueueConfig;

  constructor(private bot: BotInstance, config?: Partial<MarchQueueConfig>) {
    super();
    this.config = { ...DEFAULT_MARCH_QUEUE_CONFIG, ...config };
  }

  get pending(): MarchQueueEntry[] { return this.queue.filter(e => e.status === 'pending'); }
  get active(): MarchQueueEntry[] { return this.queue.filter(e => e.status === 'sending'); }
  get all(): MarchQueueEntry[] { return [...this.queue]; }
  get count(): number { return this.pending.length + this.activeCount; }

  enqueue(type: MarchType, sendFn: SendFn, ackProtos: AckProto, meta?: Record<string, any>): number {
    const id = nextId++;
    const entry: MarchQueueEntry = {
      id,
      type,
      status: 'pending',
      createdAt: Date.now(),
      meta,
    };

    (entry as any)._sendFn = sendFn;
    (entry as any)._ackProtos = ackProtos;

    this.queue.push(entry);
    this.bot.bot.log(`[MARCH-Q] #${id} encolado (${type}), pendientes: ${this.pending.length}`);
    this.emit('enqueued', entry);

    this.processNext();
    return id;
  }

  private async processNext(): Promise<void> {
    if (this.processing) return;
    if (this.activeCount >= this.config.maxConcurrent) return;

    const next = this.queue.find(e => e.status === 'pending');
    if (!next) return;

    this.processing = true;
    next.status = 'sending';
    next.sentAt = Date.now();
    this.activeCount++;

    try {
      const sendFn = (next as any)._sendFn as SendFn;
      const ackProtos = (next as any)._ackProtos as AckProto;

      const ok = await sendFn(next);
      if (!ok) {
        next.status = 'failed';
        next.error = 'sendFn returned false';
        next.completedAt = Date.now();
        this.activeCount--;
        this.processing = false;
        this.emit('failed', next);
        this.bot.bot.log(`[MARCH-Q] #${next.id} fallo al enviar`);
        this.processNext();
        return;
      }

      const acked = await this.waitForAck(ackProtos, this.config.ackTimeoutMs);
      if (acked) {
        next.status = 'acked';
        next.ackedAt = Date.now();
        this.bot.bot.log(`[MARCH-Q] #${next.id} ack OK`);
      } else {
        next.status = 'completed';
        next.completedAt = Date.now();
        this.bot.bot.log(`[MARCH-Q] #${next.id} sin ack (timeout), continuando`);
      }

      this.activeCount--;
      this.processing = false;

      this.emit('acked', next);

      if (this.config.delayBetweenMs > 0 && this.pending.length > 0) {
        await new Promise(r => setTimeout(r, this.config.delayBetweenMs));
      }

      this.processNext();
    } catch (err: any) {
      next.status = 'failed';
      next.error = err?.message || String(err);
      next.completedAt = Date.now();
      this.activeCount--;
      this.processing = false;
      this.emit('failed', next);
      this.bot.bot.log(`[MARCH-Q] #${next.id} error: ${next.error}`);
      this.processNext();
    }
  }

  private waitForAck(protos: AckProto, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      const protoList = Array.isArray(protos) ? protos : [protos];
      let resolved = false;

      const cleanup = () => {
        for (const p of protoList) {
          this.bot.bot.removeListener(`proto:${p}`, onProto);
        }
      };

      const onProto = () => {
        if (resolved) return;
        resolved = true;
        if (this.ackTimer) { clearTimeout(this.ackTimer); this.ackTimer = null; }
        cleanup();
        resolve(true);
      };

      for (const p of protoList) {
        this.bot.bot.on(`proto:${p}`, onProto);
      }

      this.ackTimer = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(false);
      }, timeoutMs);
    });
  }

  resolveAck(): void {
    if (this.ackResolve) {
      const r = this.ackResolve;
      this.ackResolve = null;
      r();
    }
  }

  cancel(id: number): boolean {
    const entry = this.queue.find(e => e.id === id && e.status === 'pending');
    if (!entry) return false;
    entry.status = 'cancelled';
    entry.completedAt = Date.now();
    this.emit('cancelled', entry);
    this.bot.bot.log(`[MARCH-Q] #${id} cancelado`);
    return true;
  }

  cancelAll(): number {
    let count = 0;
    for (const entry of this.queue) {
      if (entry.status === 'pending') {
        entry.status = 'cancelled';
        entry.completedAt = Date.now();
        this.emit('cancelled', entry);
        count++;
      }
    }
    this.bot.bot.log(`[MARCH-Q] ${count} entradas canceladas`);
    return count;
  }

  clear(): void {
    this.cancelAll();
    this.queue = this.queue.filter(e => e.status === 'sending');
  }

  reset(): void {
    this.clear();
    this.activeCount = 0;
    this.processing = false;
    this.ackResolve = null;
    if (this.ackTimer) { clearTimeout(this.ackTimer); this.ackTimer = null; }
  }
}

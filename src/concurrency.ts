// src/concurrency.ts — keyed concurrency gate.
//
// The estate's routers (rhodochrosite) use an RPM token bucket (ratelimit.rs),
// which does NOT cap concurrent in-flight requests. Bursts all pass the bucket
// and hit the upstream simultaneously → 429 → "Provider is overloaded —
// retrying with backoff [retrying in 5s attempt #3]". That dumb backoff is the
// defect (architect 2026-11-05): a smart router caps concurrency per
// (provider, model), queues excess, and routes around overload.
//
// This module is the concurrency gate: a keyed semaphore (pattern borrowed from
// keyed-semaphore / node-rate-limiter-flexible) that admits at most `limit`
// concurrent holders per key. Callers `acquire(key)` → run → `release(key)`.
// Excess acquirers queue (FIFO) instead of backing off.
import { Mutex } from "./mutex";

export interface ConcurrencyGateOptions {
  /** Max concurrent in-flight requests per key (default 1). */
  limit?: number;
  /** Per-key limits override the default, e.g. { "freeinference/qwen3.6-35b": 2 }. */
  perKey?: Record<string, number>;
  /** Max queue depth per key; beyond this, acquire rejects instead of queueing. */
  maxQueue?: number;
}

interface KeyState {
  active: number;
  waiting: Array<() => void>;
  limit: number;
}

/**
 * Keyed concurrency gate. `acquire(key)` resolves when a slot is free; the
 * caller MUST `release(key)` (or use `withSlot`) when done. FIFO queueing —
 * never fires-and-backs-off.
 */
export class ConcurrencyGate {
  #states = new Map<string, KeyState>();
  #defaultLimit: number;
  #maxQueue: number;

  constructor(opts: ConcurrencyGateOptions = {}) {
    this.#defaultLimit = Math.max(1, opts.limit ?? 1);
    this.#maxQueue = Math.max(0, opts.maxQueue ?? 1000);
    this.#perKey = opts.perKey ?? {};
  }
  #perKey: Record<string, number>;

  #state(key: string): KeyState {
    let s = this.#states.get(key);
    if (!s) {
      s = { active: 0, waiting: [], limit: this.#perKey[key] ?? this.#defaultLimit };
      this.#states.set(key, s);
    }
    return s;
  }

  /** Current in-flight count for a key (observability). */
  active(key: string): number {
    return this.#state(key).active;
  }

  /** Queued (waiting) count for a key (observability). */
  queued(key: string): number {
    return this.#state(key).waiting.length;
  }

  /**
   * Acquire a slot for `key`. Resolves immediately if under the limit, else
   * queues. Rejects with `QueueFullError` if the queue exceeds maxQueue.
   * Returns a release function.
   */
  acquire(key: string): Promise<() => void> {
    const s = this.#state(key);
    if (s.active < s.limit) {
      s.active += 1;
      return Promise.resolve(() => this.#release(key, s));
    }
    if (s.waiting.length >= this.#maxQueue) {
      return Promise.reject(new QueueFullError(key, s.waiting.length));
    }
    return new Promise((resolve, reject) => {
      const release = () => this.#release(key, s);
      s.waiting.push(() => resolve(release));
    });
  }

  #release(key: string, s: KeyState): void {
    s.active -= 1;
    const next = s.waiting.shift();
    if (next) {
      s.active += 1;
      next();
    }
    if (s.active === 0 && s.waiting.length === 0) {
      this.#states.delete(key);
    }
  }

  /** Run `fn` holding a slot for `key`; releases automatically. */
  async withSlot<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire(key);
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export class QueueFullError extends Error {
  constructor(key: string, queueLen: number) {
    super(`stochos: queue full for ${key} (${queueLen} waiting)`);
    this.name = "QueueFullError";
  }
}

export { Mutex };
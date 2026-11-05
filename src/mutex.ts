// src/mutex.ts — minimal async mutex.
export class Mutex {
  #tail: Promise<void> = Promise.resolve();

  /** Run `fn` exclusively; serializes concurrent callers. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((r) => (release = r));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
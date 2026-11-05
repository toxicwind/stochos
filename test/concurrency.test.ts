// test/concurrency.test.ts — the keyed concurrency gate.
// Pins the fix for "Provider is overloaded — retrying with backoff": a smart
// router caps in-flight per (provider, model), queues excess, never fires-and-
// backs-off. This is the core defect the architect flagged (2026-11-05).
import { test, expect } from "bun:test";
import { ConcurrencyGate, QueueFullError } from "../src/concurrency";

test("gate caps concurrent in-flight per key", async () => {
  const g = new ConcurrencyGate({ limit: 2 });
  const r1 = await g.acquire("p/m");
  const r2 = await g.acquire("p/m");
  expect(g.active("p/m")).toBe(2);
  // Third acquire must queue (not run).
  let thirdRan = false;
  const third = g.acquire("p/m").then((rel) => {
    thirdRan = true;
    return rel;
  });
  await Bun.sleep(10);
  expect(thirdRan).toBe(false);
  expect(g.queued("p/m")).toBe(1);
  r1();
  const rel3 = await third;
  expect(thirdRan).toBe(true);
  rel3();
  r2();
  expect(g.active("p/m")).toBe(0);
});

test("gate is per-key independent (different keys don't share limits)", async () => {
  const g = new ConcurrencyGate({ limit: 1 });
  const a = await g.acquire("p1/m1");
  const b = await g.acquire("p2/m2");
  expect(g.active("p1/m1")).toBe(1);
  expect(g.active("p2/m2")).toBe(1);
  a();
  b();
});

test("perKey overrides the default limit", async () => {
  const g = new ConcurrencyGate({ limit: 1, perKey: { "freeinference/qwen3.6-35b": 2 } });
  const a = await g.acquire("freeinference/qwen3.6-35b");
  const b = await g.acquire("freeinference/qwen3.6-35b");
  expect(g.active("freeinference/qwen3.6-35b")).toBe(2);
  a();
  b();
});

test("queue full rejects instead of blocking (route-around signal)", async () => {
  const g = new ConcurrencyGate({ limit: 1, maxQueue: 1 });
  const a = await g.acquire("p/m");
  const queued = g.acquire("p/m").catch((e) => e);
  const overflow = g.acquire("p/m");
  await expect(overflow).rejects.toBeInstanceOf(QueueFullError);
  a();
  const rel = await queued;
  rel();
});

test("withSlot releases automatically on success and on throw", async () => {
  const g = new ConcurrencyGate({ limit: 1 });
  await g.withSlot("p/m", async () => 42);
  expect(g.active("p/m")).toBe(0);
  await expect(g.withSlot("p/m", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  expect(g.active("p/m")).toBe(0);
});
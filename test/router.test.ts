// test/router.test.ts — the routing engine: route around overload/failure.
import { test, expect } from "bun:test";
import { route, type ProviderClient } from "../src/router";
import { defineMatrix } from "../src/matrix";
import { ConcurrencyGate } from "../src/concurrency";

const matrix = defineMatrix({
  router: "test",
  roles: [
    {
      role: "chat",
      targets: [
        { provider: "slow", model: "m1", concurrency: 1 },
        { provider: "fast", model: "m2" },
      ],
    },
  ],
});

function client(overload: Record<string, boolean> = {}, fail: Record<string, boolean> = {}): ProviderClient {
  return {
    complete: async (t) => {
      if (fail[`${t.provider}/${t.model}`]) throw new Error(`fail ${t.model}`);
      return `ok:${t.model}`;
    },
    overloaded: (t) => overload[`${t.provider}/${t.model}`] ?? false,
  };
}

test("routes to the first available target", async () => {
  const r = await route(matrix, "chat", client(), {});
  expect(r.route.target.model).toBe("m1");
  expect(r.value).toBe("ok:m1");
  expect(r.rerouted).toBe(false);
});

test("routes around an overloaded first target (no dumb backoff)", async () => {
  const r = await route(matrix, "chat", client({ "slow/m1": true }), {});
  expect(r.route.target.model).toBe("m2");
  expect(r.rerouted).toBe(true);
});

test("routes around a failing first target to the next", async () => {
  const r = await route(matrix, "chat", client({}, { "slow/m1": true }), {});
  expect(r.route.target.model).toBe("m2");
  expect(r.rerouted).toBe(true);
});

test("throws when all targets fail", async () => {
  await expect(route(matrix, "chat", client({}, { "slow/m1": true, "fast/m2": true }), {})).rejects.toThrow(
    "all targets failed",
  );
});

test("holds a concurrency slot during dispatch (no pile-on)", async () => {
  const gate = new ConcurrencyGate({ limit: 1 });
  let release: (() => void) | undefined;
  const blocking: ProviderClient = {
    complete: async () => {
      await new Promise<void>((r) => (release = r));
      return "done";
    },
  };
  const p1 = route(matrix, "chat", blocking, {}, { gate });
  await Bun.sleep(10);
  // Second concurrent route must queue (not fire) because slot is held.
  let secondRan = false;
  const p2 = route(matrix, "chat", { ...blocking, complete: async () => { secondRan = true; return "x"; } }, {}, { gate });
  await Bun.sleep(10);
  expect(secondRan).toBe(false);
  release!();
  await p1;
  await p2;
  expect(secondRan).toBe(true);
});
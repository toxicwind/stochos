// test/algo.test.ts — the model-selection algorithm.
import { test, expect } from "bun:test";
import { dominates, paretoFrontier, scoreRow, selectBest, type BenchRow } from "../src/algo";

const rows: BenchRow[] = [
  { lane: "freeinference", model: "qwen3.6-35b", prompt: "P1", ok: true, ms: 2209, textLen: 1021 },
  { lane: "freeinference", model: "glm-5.3-flash", prompt: "P1", ok: true, ms: 5051, textLen: 988 },
  { lane: "nvidia-direct", model: "diffusiongemma", prompt: "P1", ok: true, ms: 2478, textLen: 730 },
  { lane: "freeinference", model: "qwen3.6-35b", prompt: "P2", ok: true, ms: 3031, textLen: 1235 },
  { lane: "nvidia-direct", model: "diffusiongemma", prompt: "P2", ok: true, ms: 2062, textLen: 1300 },
  { lane: "freeinference", model: "glm-5.3-flash", prompt: "P2", ok: false, ms: 0, textLen: 0 },
];

test("dominates: faster with >= content dominates", () => {
  const fast = rows[0];
  const slow = rows[1];
  expect(dominates(fast, slow)).toBe(true);
  expect(dominates(slow, fast)).toBe(false);
});

test("failed rows never dominate", () => {
  const ok = rows[0];
  const failed = rows[5];
  expect(dominates(ok, failed)).toBe(false);
  expect(dominates(failed, ok)).toBe(false);
});

test("scoreRow normalizes latency and content across peers", () => {
  const p1 = rows.filter((r) => r.prompt === "P1");
  const qwen = scoreRow(p1[0], p1);
  const glm = scoreRow(p1[1], p1);
  // qwen is faster and richer -> higher score
  expect(qwen).toBeGreaterThan(glm);
});

test("selectBest ranks candidates and returns the best per prompt", () => {
  const results = selectBest(rows);
  const p1 = results.find((r) => r.prompt === "P1")!;
  expect(p1.best?.model).toBe("qwen3.6-35b");
  expect(p1.ranked[0].model).toBe("qwen3.6-35b");
  // P2: diffusiongemma is faster AND richer -> wins over qwen
  const p2 = results.find((r) => r.prompt === "P2")!;
  expect(p2.best?.model).toBe("diffusiongemma");
  // Failed glm excluded from P2 ranking
  expect(p2.ranked.some((r) => r.model === "glm-5.3-flash")).toBe(false);
});

test("paretoFrontier returns non-dominated candidates within a prompt group", () => {
  const p1 = rows.filter((r) => r.prompt === "P1");
  const frontier = paretoFrontier(p1);
  // qwen dominates both glm and diffusiongemma (faster + richer) -> only qwen survives
  expect(frontier.map((f) => f.model)).toEqual(["qwen3.6-35b"]);
  expect(frontier.every((f) => !p1.some((r) => r !== f && dominates(r, f)))).toBe(true);
});
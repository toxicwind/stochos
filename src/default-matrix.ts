// src/default-matrix.ts — the estate's default routing matrix, grounded in the
// empirical probe (docs/probe-findings.md, 2026-11-05).
//
// Key findings encoded:
//   - vision works ONLY via freeinference-direct (rhodochrosite vision 502s)
//   - minimax-m3 and diffusiongemma are dead on rhodochrosite (excluded)
//   - keypool/freeinference is the fastest chat lane (182ms vs 301ms router)
//   - deepseek-v4-flash is text-only for vision (400) — chat only
import { defineMatrix } from "./matrix";

export function defaultMatrix() {
  return defineMatrix({
    router: "estate",
    roles: [
      {
        role: "default",
        targets: [
          { provider: "keypool", model: "qwen3.6-35b", concurrency: 2 },
          { provider: "freeinference-direct", model: "qwen3.6-35b", concurrency: 2 },
          { provider: "rhodochrosite", model: "glm-5.3-flash", concurrency: 1 },
        ],
      },
      {
        role: "smol",
        targets: [
          { provider: "freeinference-direct", model: "glm-5.3-flash", concurrency: 2 },
          { provider: "keypool", model: "glm-5.3-flash", concurrency: 1 },
        ],
      },
      {
        role: "slow",
        targets: [
          { provider: "rhodochrosite", model: "deepseek-v4-flash", concurrency: 1 },
        ],
      },
      {
        role: "vision",
        targets: [
          { provider: "freeinference-direct", model: "glm-5.3-flash", concurrency: 2 },
          { provider: "freeinference-direct", model: "qwen3.6-35b", concurrency: 2 },
        ],
      },
      {
        role: "plan",
        targets: [
          { provider: "keypool", model: "qwen3.6-35b", concurrency: 1 },
          { provider: "rhodochrosite", model: "qwen3.6-35b", concurrency: 1 },
        ],
      },
      {
        role: "task",
        targets: [
          { provider: "freeinference-direct", model: "glm-5.3-flash", concurrency: 2 },
          { provider: "keypool", model: "qwen3.6-35b", concurrency: 1 },
        ],
      },
      {
        role: "commit",
        targets: [
          { provider: "freeinference-direct", model: "glm-5.3-flash", concurrency: 2 },
        ],
      },
      {
        role: "memory",
        targets: [
          { provider: "freeinference-direct", model: "glm-5.3-flash", concurrency: 2 },
        ],
      },
      {
        role: "verification",
        targets: [
          { provider: "freeinference-direct", model: "glm-5.3-flash", concurrency: 2 },
        ],
      },
      {
        role: "fallback",
        targets: [
          { provider: "freeinference-direct", model: "glm-5.3-flash", concurrency: 1 },
          { provider: "keypool", model: "qwen3.6-35b", concurrency: 1 },
        ],
      },
    ],
  });
}
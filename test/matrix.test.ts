// test/matrix.test.ts — the routing matrix resolution.
import { test, expect } from "bun:test";
import { defineMatrix, resolveAll, resolveRole } from "../src/matrix";

const matrix = defineMatrix({
  router: "rhodochrosite",
  roles: [
    {
      role: "vision",
      targets: [
        { provider: "rhodochrosite", model: "qwen3.6-35b" },
        { provider: "freeinference-direct", model: "glm-5.3-flash" },
      ],
    },
    {
      role: "default",
      targets: [
        { provider: "keypool", model: "qwen3.6-35b" },
        { provider: "freeinference-direct", model: "qwen3.6-35b" },
      ],
    },
  ],
});

test("resolveRole returns the first available target", async () => {
  const r = await resolveRole(matrix, "default", async (t) => t.provider === "keypool");
  expect(r?.target.provider).toBe("keypool");
  expect(r?.target.model).toBe("qwen3.6-35b");
});

test("resolveRole skips unavailable (dead/overloaded) targets", async () => {
  // rhodochrosite vision is dead (502) — must route to freeinference-direct.
  const r = await resolveRole(matrix, "vision", async (t) => t.provider === "freeinference-direct");
  expect(r?.target.provider).toBe("freeinference-direct");
  expect(r?.target.model).toBe("glm-5.3-flash");
});

test("resolveRole returns undefined when no target is available", async () => {
  const r = await resolveRole(matrix, "vision", async () => false);
  expect(r).toBeUndefined();
});

test("resolveAll resolves every role", async () => {
  const all = await resolveAll(matrix, async () => true);
  expect(all.map((r) => r.role).sort()).toEqual(["default", "vision"]);
});
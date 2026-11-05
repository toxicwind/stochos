// test/lua.test.ts — the Lua coercion surface.
import { test, expect } from "bun:test";
import { applyCoercion, coerceWithLua } from "../src/lua";

const input = {
  role: "vision",
  router: "rhodochrosite",
  candidates: [
    { provider: "rhodochrosite", model: "qwen3.6-35b" },
    { provider: "freeinference-direct", model: "glm-5.3-flash" },
  ],
};

test("lua coercion picks a candidate by index", () => {
  const r = coerceWithLua("print(1)", input);
  expect(r.index).toBe(1);
});

test("lua coercion can inspect candidates and choose by provider", () => {
  const script = `
for i, c in ipairs(candidates) do
  if c.provider == "freeinference-direct" then print(i - 1) break end
end
`;
  const r = coerceWithLua(script, input);
  expect(r.index).toBe(1);
});

test("applyCoercion returns -1 when no script (fall through)", () => {
  expect(applyCoercion(undefined, input)).toBe(-1);
});

test("applyCoercion returns -1 for an out-of-range index (fall through)", () => {
  expect(applyCoercion("print(99)", input)).toBe(-1);
});

test("applyCoercion returns -1 on a lua error (never blocks routing)", () => {
  expect(applyCoercion("error('boom')", input)).toBe(-1);
});
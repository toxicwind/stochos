# stochos — per-model-per-provider-per-router model-routing control plane

> στόχος (stóchos) = "target". The targeting/control surface for the estate's
> model routing.

A control plane that declares **which (provider, model) serves which role, per
router**, and dispatches with **concurrency-aware routing** (cap in-flight,
queue, route around overload — never the dumb "Provider is overloaded —
retrying with backoff" the routers exhibit today).

## Why

The architect's directives (2026-11-05):

1. **Model settings are based on FULL PROVIDER, not model** — the provider lane
   (routing, keypool, strikes) is the decision unit.
2. **Super able to control per model per provider per router even** — full
   granularity: the (provider, model) matrix per router.
3. **Add SDK that takes lua for coercion** — a Lua scripting surface for
   runtime model override.
4. **Concurrency is still broken** — routers back off instead of being smart.
   A smart router caps in-flight per (provider, model), queues excess, and
   routes around overload.

## Modules

| Module | Purpose |
|---|---|
| `src/matrix.ts` | The routing matrix: role → ordered (provider, model) candidates per router. |
| `src/concurrency.ts` | Keyed concurrency gate: cap in-flight per key, FIFO queue, reject on full. |
| `src/router.ts` | The routing engine: resolve role, hold a concurrency slot, route around overload/failure. |
| `src/lua.ts` | Lua coercion surface: a Lua script overrides model selection at runtime. |
| `src/default-matrix.ts` | The estate default matrix, grounded in the empirical probe. |

## Empirical grounding

`docs/probe-findings.md` records the live probe (2026-11-05) that grounds the
default matrix:

- **vision works ONLY via freeinference-direct** (rhodochrosite vision 502s).
- **minimax-m3 and diffusiongemma are dead** on rhodochrosite (excluded).
- **keypool/freeinference is the fastest chat lane** (182ms vs 301ms router).
- **deepseek-v4-flash is text-only for vision** (400) — chat only.

## Usage

```ts
import { route, defaultMatrix, ConcurrencyGate } from "stochos";

const matrix = defaultMatrix();
const gate = new ConcurrencyGate({ limit: 2 }); // cap 2 in-flight per (provider,model)

const result = await route(matrix, "vision", {
  complete: async (t, input) => {
    // send to t.provider/t.model; return text
    return text;
  },
  overloaded: (t) => gate.queued(`${t.provider}/${t.model}`) > 5,
}, input, { gate });
```

### Lua coercion

```ts
import { applyCoercion } from "stochos";
const idx = applyCoercion(`
for i, c in ipairs(candidates) do
  if c.provider == "freeinference-direct" then print(i - 1) end
end
`, { role: "vision", router: "estate", candidates });
// idx = the coerced candidate index, or -1 to fall through
```

## CLI

```bash
stochos matrix            # resolve all roles against the default matrix
stochos coerce '<script>' # evaluate a Lua coercion script
```

## Tests

```bash
bun test   # 19 tests: concurrency gate, matrix, router, lua coercion
```

## Status

Core engine (matrix + concurrency gate + router + lua coercion) is built and
TDD-green. Next: wire the matrix into tau+kappa (BE TAU-AWARE AND KAPPA-AWARE)
and integrate the concurrency gate into the rhodochrosite router to eliminate
the dumb backoff.
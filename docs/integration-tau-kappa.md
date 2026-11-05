# Integrating stochos into tau + kappa (the concurrency fix path)

> The architect's directive (2026-11-05): "anything unintentionally blocking
> that causes UX or streaming latency is flawed and must be refactored using the
> new pattern borrow." The "Provider is overloaded (freeinference) — retrying
> with backoff [retrying in 5s attempt #3]" message is that flaw. This doc is
> the concrete integration path.

## Root cause

The "Provider is overloaded — retrying with backoff" message comes from the
**client harness retry loop**, not the router:

- **tau**: `packages/ai/src/error/retryable.ts` classifies 429 as transient →
  the retry loop backs off 5s and retries the SAME provider/model.
- **kappa**: `packages/opencode/src/session/retry.ts` — same pattern.

The router (rhodochrosite) uses an **RPM token bucket** (`proxy/src/ratelimit.rs`),
which does NOT cap concurrent in-flight requests. Bursts all pass the bucket and
hit freeinference simultaneously → 429 → client backs off. A smart router would
cap concurrency so the 429 never happens.

## The fix (stochos pattern)

`stochos` provides the reusable pieces:

| Piece | File | What it fixes |
|---|---|---|
| Keyed concurrency gate | `src/concurrency.ts` | Caps in-flight per (provider, model); FIFO queue; no fire-and-backoff. |
| Routing matrix | `src/matrix.ts` | role → ordered (provider, model) candidates per router. |
| Routing engine | `src/router.ts` | Holds a concurrency slot; routes around overload/failure to the next candidate. |
| Lua coercion | `src/lua.ts` | Runtime model override. |

### tau integration

1. **Cap concurrency per provider/model**: in the provider request path
   (`packages/ai/src/providers/openai-responses.ts`), wrap the dispatch in a
   `ConcurrencyGate.withSlot(key)` where `key = `${provider}/${model}``. The gate
   limit should match freeinference's real ~2-concurrent-per-key ceiling.
2. **Route around on 429, don't back off**: in the retry loop, on a 429 consult
   `retry.fallbackChains` (already configured) and advance to the NEXT provider/
   model immediately instead of backing off 5s on the same one. The config
   already has the chains (`freeinference/*`, `default`, etc.) — the retry loop
   just doesn't use them for 429 overload.
3. **Use the matrix**: replace the hardcoded `modelRoles` fallback with the
   stochos matrix for role→(provider,model) resolution.

### kappa integration

1. In `packages/opencode/src/session/retry.ts`, on a 429 route to the next
   configured provider/model (kappa has no fallbackChains today — add them via
   the stochos matrix) instead of backing off.
2. Cap concurrency per (provider, model) with the stochos gate in the provider
   dispatch.

### rhodochrosite integration (router-side, prevents the 429 entirely)

Replace the RPM token bucket with a concurrency-aware semaphore per
(provider, key): cap in-flight at the provider's real limit, queue excess, and
return a fast 429-with-retry-after only when the queue is truly full (so the
client routes around). This is a Rust change in `proxy/src/ratelimit.rs` +
`proxy/src/dispatch.rs`, per rhodochrosite's work-loop AGENTS.md (plan →
worktree → PR).

## Priority

The **client-side route-around** (tau + kappa retry loops) gives the fastest
UX/streaming-latency win with the least risk — a 429 immediately routes to a
working sibling provider instead of stalling 5s+. The **router-side concurrency
cap** prevents the 429 from ever being generated. Do both; client-side first.

## Not touching live

Per the session constraint, no live daemon/config was modified. This doc is the
integration path; the in-tree changes are follow-on work-items (tau/kappa retry
loops, rhodochrosite ratelimit.rs).
// src/index.ts — stochos public SDK.
//
// Per-model-per-provider-per-router model-routing control plane:
//   - matrix.ts: the routing matrix (which (provider, model) serves each role)
//   - concurrency.ts: keyed concurrency gate (cap, queue, no dumb backoff)
//   - router.ts: the routing engine (route around overload/failure)
//   - lua.ts: Lua coercion surface (runtime model override)
export { ConcurrencyGate, QueueFullError } from "./concurrency";
export { Mutex } from "./mutex";
export { defineMatrix, resolveAll, resolveRole } from "./matrix";
export type { ResolvedRoute, RoleRoute, RouteTarget, RouterMatrix } from "./matrix";
export { route } from "./router";
export type { DispatchResult, ProviderClient, RouterOptions } from "./router";
export { applyCoercion, coerceWithLua } from "./lua";
export type { LuaCoercionInput, LuaCoercionResult } from "./lua";
export { defaultMatrix } from "./default-matrix";
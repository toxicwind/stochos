// src/router.ts — the routing engine.
//
// Combines the matrix (which (provider, model) serves each role) with the
// concurrency gate (cap in-flight per provider/model, queue, no dumb backoff)
// to dispatch a request. If the first candidate is overloaded (queue full) or
// fails, it routes around to the next candidate — never fires-and-backs-off.
import { ConcurrencyGate, QueueFullError } from "./concurrency";
import { resolveRole, type ResolvedRoute, type RouterMatrix, type RouteTarget } from "./matrix";

export interface RouterOptions {
  /** Concurrency gate (shared across routers to respect global per-key caps). */
  gate?: ConcurrencyGate;
  /** Max concurrency default (per key). */
  concurrency?: number;
}

export interface DispatchResult<T> {
  route: ResolvedRoute;
  value: T;
  /** True if we routed around an overloaded/failed first candidate. */
  rerouted: boolean;
}

export interface ProviderClient {
  /** Send a completion and return the text. Throws on failure. */
  complete(target: RouteTarget, input: unknown): Promise<string>;
  /** Whether this target is currently overloaded (queue full). */
  overloaded?(target: RouteTarget): boolean;
}

/**
 * Route a request for `role` to the first available target, holding a
 * concurrency slot. On overload/failure, route around to the next target.
 */
export async function route<T>(
  matrix: RouterMatrix,
  role: string,
  client: ProviderClient,
  input: unknown,
  opts: RouterOptions = {},
): Promise<DispatchResult<T>> {
  const gate = opts.gate ?? new ConcurrencyGate({ limit: opts.concurrency ?? 1 });
  const rr = matrix.roles.find((r) => r.role === role);
  if (!rr) throw new Error(`stochos: no route for role '${role}'`);

  let rerouted = false;
  let lastErr: unknown;
  for (const target of rr.targets) {
    const key = `${target.provider}/${target.model}`;
    // Skip overloaded targets immediately (route around, don't queue).
    if (client.overloaded?.(target)) {
      rerouted = true;
      continue;
    }
    try {
      const value = await gate.withSlot<T>(key, async () => {
        const text = await client.complete(target, input);
        return text as unknown as T;
      });
      return { route: { role, target, router: matrix.router }, value, rerouted };
    } catch (err) {
      if (err instanceof QueueFullError) {
        rerouted = true; // overloaded — try next target
        lastErr = err;
        continue;
      }
      // Real failure — record and try next target.
      rerouted = true;
      lastErr = err;
    }
  }
  throw new Error(`stochos: all targets failed for role '${role}': ${String(lastErr)}`);
}

export { resolveRole };
export type { ResolvedRoute, RouteTarget, RouterMatrix };
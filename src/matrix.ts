// src/matrix.ts — the per-model-per-provider-per-router routing matrix.
//
// The architect's directive (2026-11-05): model settings are based on FULL
// PROVIDER, not model; control must be per-model-per-provider-per-router.
// This matrix is that control surface: for each role, declare the ordered
// candidate (provider, model) pairs per router. Resolution walks the list and
// returns the first that is available (credentialed, not dead, not overloaded).
//
// The empirical probe (probe-findings.md) grounds the defaults:
//   - vision works ONLY via freeinference-direct (rhodochrosite vision 502s)
//   - minimax-m3 and diffusiongemma are dead on rhodochrosite
//   - keypool/freeinference is the fastest chat lane

export interface RouteTarget {
  provider: string;
  model: string;
  /** Concurrency cap for this (provider, model) pair. */
  concurrency?: number;
}

export interface RoleRoute {
  role: string;
  /** Ordered candidates; first available wins. */
  targets: RouteTarget[];
}

export interface RouterMatrix {
  /** The router this matrix applies to (e.g. "rhodochrosite", "keypool", "direct"). */
  router: string;
  roles: RoleRoute[];
}

export interface ResolvedRoute {
  role: string;
  target: RouteTarget;
  router: string;
}

/** Availability predicate: a target is available if it is not dead and not overloaded. */
export type AvailabilityFn = (target: RouteTarget) => boolean | Promise<boolean>;

/** Resolve a role to the first available target in its list. */
export async function resolveRole(
  matrix: RouterMatrix,
  role: string,
  available: AvailabilityFn,
): Promise<ResolvedRoute | undefined> {
  const rr = matrix.roles.find((r) => r.role === role);
  if (!rr) return undefined;
  for (const target of rr.targets) {
    if (await available(target)) {
      return { role, target, router: matrix.router };
    }
  }
  return undefined;
}

/** Resolve every role in a matrix (for a full recalibration snapshot). */
export async function resolveAll(
  matrix: RouterMatrix,
  available: AvailabilityFn,
): Promise<ResolvedRoute[]> {
  const out: ResolvedRoute[] = [];
  for (const rr of matrix.roles) {
    const r = await resolveRole(matrix, rr.role, available);
    if (r) out.push(r);
  }
  return out;
}

/** Build a matrix from a plain object (typed convenience). */
export function defineMatrix(m: RouterMatrix): RouterMatrix {
  return m;
}
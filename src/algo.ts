// src/algo.ts — the stochos model-selection algorithm.
//
// Data-driven routing decision from benchmark rows. For each prompt-type, score
// every (provider, model) candidate on latency + content richness + correctness
// and return a Pareto-optimal ranking. This is the "algo" that turns the
// empirical probe into a routing decision (architect 2026-11-05: "try to make
// a algo").

export interface BenchRow {
  lane: string;
  model: string;
  prompt: string;
  ok: boolean;
  ms: number;
  textLen: number;
}

export interface SelectionOptions {
  /** Latency weight (0..1). Higher = prefer speed. */
  latencyWeight?: number;
  /** Content richness weight (0..1). Higher = prefer longer/detailed output. */
  contentWeight?: number;
  /** Correctness weight (0..1). */
  correctnessWeight?: number;
}

export interface SelectionResult {
  prompt: string;
  /** Ranked candidates (best first). */
  ranked: Array<{ lane: string; model: string; score: number; ms: number; textLen: number }>;
  /** The recommended (provider, model). */
  best: { lane: string; model: string; score: number; ms: number; textLen: number } | undefined;
}

/** Pareto-optimal: a candidate dominates another if faster AND >= content. */
export function dominates(a: BenchRow, b: BenchRow): boolean {
  if (!a.ok || !b.ok) return false;
  return a.ms < b.ms && a.textLen >= b.textLen;
}

/** Score one candidate for a prompt-type. Higher is better. */
export function scoreRow(row: BenchRow, peers: BenchRow[], opts: SelectionOptions = {}): number {
  if (!row.ok) return -Infinity;
  const wLat = opts.latencyWeight ?? 0.5;
  const wContent = opts.contentWeight ?? 0.3;
  const wCorrect = opts.correctnessWeight ?? 0.2;
  // Normalize latency: fastest peer = 1.0, slowest = 0.0.
  const okPeers = peers.filter((p) => p.ok);
  const minMs = Math.min(...okPeers.map((p) => p.ms));
  const maxMs = Math.max(...okPeers.map((p) => p.ms));
  const latNorm = maxMs === minMs ? 1 : 1 - (row.ms - minMs) / (maxMs - minMs);
  // Normalize content length: longest = 1.0.
  const maxLen = Math.max(...okPeers.map((p) => p.textLen));
  const contentNorm = maxLen === 0 ? 0 : row.textLen / maxLen;
  const correct = 1; // row.ok already gates; extendable to a judge score
  return wLat * latNorm + wContent * contentNorm + wCorrect * correct;
}

/**
 * Select the best model per prompt-type from benchmark rows.
 * Groups rows by prompt, scores each, ranks, and returns the recommendation.
 */
export function selectBest(rows: BenchRow[], opts: SelectionOptions = {}): SelectionResult[] {
  const byPrompt = new Map<string, BenchRow[]>();
  for (const r of rows) {
    if (!byPrompt.has(r.prompt)) byPrompt.set(r.prompt, []);
    byPrompt.get(r.prompt)!.push(r);
  }
  const out: SelectionResult[] = [];
  for (const [prompt, group] of byPrompt) {
    const scored = group
      .map((r) => ({ row: r, score: scoreRow(r, group, opts) }))
      .filter((s) => Number.isFinite(s.score))
      .sort((a, b) => b.score - a.score);
    const ranked = scored.map((s) => ({
      lane: s.row.lane,
      model: s.row.model,
      score: s.score,
      ms: s.row.ms,
      textLen: s.row.textLen,
    }));
    out.push({ prompt, ranked, best: ranked[0] });
  }
  return out;
}

/**
 * Pareto frontier: the set of candidates not dominated by any other.
 * These are the "no-regret" options — each is fastest-or-richest for its
 * prompt-type.
 */
export function paretoFrontier(rows: BenchRow[]): BenchRow[] {
  const ok = rows.filter((r) => r.ok);
  return ok.filter((a) => !ok.some((b) => b !== a && dominates(b, a)));
}
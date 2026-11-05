// Regenerate the leaderboard with the FULL dataset + image reference + raw outputs.
import { readFileSync, writeFileSync } from "node:fs";
const fi = JSON.parse(readFileSync("/tmp/kappa-hijack/model-recal/bench-complex-results.json", "utf8"));
const nv = JSON.parse(readFileSync("/tmp/kappa-hijack/model-recal/nv-vl-bench-results.json", "utf8"));
const all = [...fi, ...nv];

// Exact prompt text per prompt id (the subject the models were asked).
const PROMPT_TEXT = {
  P1_UI: "Describe the application running on the phone screen: what app is it, what is it doing, and what are the visible UI elements?",
  P2_CODE: "Extract the verbatim error message text shown in red on the screen, including the file path and the exception details.",
  P3_REASON: "What is the root cause of the problem shown in the terminal? Give a step-by-step reasoning.",
};

function scoreRow(row, peers, wLat = 0.5, wContent = 0.3, wCorrect = 0.2) {
  if (!row.ok || !row.textLen) return -Infinity;
  const okPeers = peers.filter((p) => p.ok && p.textLen);
  const minMs = Math.min(...okPeers.map((p) => p.ms));
  const maxMs = Math.max(...okPeers.map((p) => p.ms));
  const latNorm = maxMs === minMs ? 1 : 1 - (row.ms - minMs) / (maxMs - minMs);
  const maxLen = Math.max(...okPeers.map((p) => p.textLen));
  const contentNorm = maxLen === 0 ? 0 : row.textLen / maxLen;
  return wLat * latNorm + wContent * contentNorm + wCorrect;
}

const byPrompt = new Map();
for (const r of all) {
  if (!byPrompt.has(r.prompt)) byPrompt.set(r.prompt, []);
  byPrompt.get(r.prompt).push(r);
}
const prompts = {};
for (const [prompt, group] of byPrompt) {
  const ranked = group
    .map((r) => ({ row: r, score: scoreRow(r, group) }))
    .filter((s) => Number.isFinite(s.score))
    .sort((a, b) => b.score - a.score)
    .map((s) => ({ lane: s.row.lane, model: s.row.model, ms: s.row.ms, textLen: s.row.textLen, score: Number(s.score.toFixed(3)) }));
  prompts[prompt] = {
    best: ranked[0] || null,
    ranked,
    promptText: PROMPT_TEXT[prompt] || null,
    // FULL dataset for this prompt (all rows incl. failures + raw output)
    all: group.map((r) => ({
      lane: r.lane, model: r.model, ok: r.ok, ms: r.ms, textLen: r.textLen || 0,
      status: r.status || (r.ok ? "ok" : "error"), err: r.err || null,
      // raw model response — the actual proof of correctness
      text: r.text != null ? r.text : null,
    })),
  };
}

const leaderboard = {
  generatedAt: new Date().toISOString(),
  benchmark: "complex-prompt vision · phone screenshot 2026-11-05 · freeinference + NVIDIA",
  image: "Screenshot_20261105-000919.png",
  imageUrl: "https://raw.githubusercontent.com/toxicwind/stochos/gh-pages/Screenshot_20261105-000919.png",
  prompts,
};
writeFileSync("site/leaderboard.json", JSON.stringify(leaderboard, null, 2));
console.log("leaderboard regenerated with FULL data + image");
for (const [p, v] of Object.entries(prompts)) {
  console.log(`${p}: best=${v.best?.model} ${v.best?.ms}ms · ${v.all.length} rows (${v.all.filter(r=>r.ok).length} ok)`);
}
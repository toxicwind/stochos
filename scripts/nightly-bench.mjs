#!/usr/bin/env bun
// scripts/nightly-bench.mjs — regenerate the leaderboard.json nightly.
// Runs the complex-prompt vision benchmark across lanes and writes site/leaderboard.json.
// Invoke via cron / CI nightly. Requires FREEINFERENCE_API_KEY + NVIDIA_API_KEYS.
import { readFileSync } from "node:fs";

const fiKey = process.env.FREEINFERENCE_API_KEY || readFileSync("/home/toxic/.tau/freeinference.key", "utf8").trim();
const nvKey = process.env.NVIDIA_API_KEYS || readFileSync("/home/toxic/.tau/router.key", "utf8").trim();
const IMG = process.argv[2] || "/tmp/kappa-hijack/Screenshot_20261105-000919.png";
const b64 = readFileSync(IMG).toString("base64");

const PROMPTS = {
  P1_UI: "Analyze this terminal UI screenshot in detail. (1) What application is running? (2) Describe the layout. (3) What error is visible? (4) What was the last command? Numbered list.",
  P2_CODE: "Extract verbatim from this coding/debugging screenshot: (1) any error message text, (2) any JSON/code snippet, (3) the git diff. Quote exact text.",
  P3_REASON: "A developer is debugging a JSON issue. Based on the screenshot: (1) root cause? (2) what command caused it? (3) correct next step? Reason step-by-step.",
};

const MODELS = [
  ["freeinference", "https://freeinference.org/v1", fiKey, "qwen3.6-35b"],
  ["freeinference", "https://freeinference.org/v1", fiKey, "glm-5.3-flash"],
  ["nvidia-direct", "https://integrate.api.nvidia.com/v1", nvKey, "google/diffusiongemma-26b-a4b-it"],
];

const rows = [];
for (const [lane, baseUrl, key, model] of MODELS) {
  for (const [pk, prompt] of Object.entries(PROMPTS)) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Reasoning-Passthrough": "false", "User-Agent": "opencode-kilo-provider/1.0 (stochos-nightly)" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } }] }], max_tokens: 300 }),
        signal: AbortSignal.timeout(45000),
      });
      const ms = Date.now() - t0;
      if (!res.ok) { rows.push({ lane, model, prompt: pk, ok: false, ms, status: res.status }); continue; }
      const j = await res.json();
      rows.push({ lane, model, prompt: pk, ok: true, ms, textLen: String(j.choices?.[0]?.message?.content || "").length });
    } catch (e) { rows.push({ lane, model, prompt: pk, ok: false, ms: Date.now() - t0, err: String(e.message || e) }); }
  }
}

// Run the selection algorithm on the fresh rows.
const { selectBest } = await import("../src/algo.ts");
const results = selectBest(rows);
const leaderboard = {
  generatedAt: new Date().toISOString(),
  benchmark: `nightly complex-prompt vision · ${IMG}`,
  image: IMG.split("/").pop(),
  prompts: Object.fromEntries(results.map(r => [r.prompt, {
    best: r.best ? { lane: r.best.lane, model: r.best.model, ms: r.best.ms, textLen: r.best.textLen, score: Number(r.best.score.toFixed(3)) } : null,
    ranked: r.ranked.map(c => ({ lane: c.lane, model: c.model, ms: c.ms, textLen: c.textLen, score: Number(c.score.toFixed(3)) })),
  }])),
};
await Bun.write(new URL("../site/leaderboard.json", import.meta.url), JSON.stringify(leaderboard, null, 2));
console.log(`leaderboard.json regenerated (${rows.length} rows, ${new Date().toISOString()})`);
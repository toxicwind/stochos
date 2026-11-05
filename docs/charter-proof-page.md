# stochos — proof-style benchmark page charter

> στόχος (stóchos) = "target". This charter pins the *proof-style* redesign of
> the stochos model-routing benchmark page, settled by an aesthetic debate
> between two personas (2026-11-05).

## The debate (abridged)

**Persona A — "the metricist"** (keep a leaderboard):
> A benchmark page should rank. Best model on top, crown, ms + score bar. The
> reader wants the answer fast: who wins P1/P2/P3. Raw text is noise — nobody
> reads 18 paragraphs of model output.

**Persona B — "the auditor"** (proof-style):
> A *proof* page is not a ranking — it is an audit trail. The reader must be
> able to *verify* that the winner actually answered the prompt correctly, not
> trust a computed score. The current page shows `ms / textLen / score` and
> throws away the one thing that proves correctness: **the actual model
> response**. A leaderboard with no raw evidence is a claim with no receipt.
> Failures are hidden (the `ok` column exists but errors are collapsed). The
> image is shown but the exact prompts are not. That is not proof — that is
> marketing.

**Adjudication — B wins, with a concession to A:**
- Keep the winner card (A's fast answer) — but as the *conclusion*, not the
  whole page.
- Add the raw response per model per prompt (B's evidence) — collapsible so the
  fast path stays fast, expandable to verify.
- Show the exact prompt text, the source image, and every failure row verbatim.
- The page reads top-down as: **claim → evidence → method**. That is a proof.

## What a proof page must contain

1. **The claim** — the winner per prompt, with score and the weights used.
2. **The evidence** — the full raw model response per model per prompt, so a
   reader can judge correctness directly, not via a proxy score.
3. **The subject** — the exact source image and the exact prompt text.
4. **The method** — the scoring formula, weights, and how ties break.
5. **The failures** — every error row shown verbatim, not collapsed away.
6. **Provenance** — generatedAt timestamp, source lane, model IDs.

## Data contract

The regeneration script (`scripts/_regenerate-lb.mjs`) must carry the raw
`text` field through to `leaderboard.json`. Today:

- FreeInference rows: `text` present. ✅
- NVIDIA rows: `text` **absent** (only `ms`/`textLen`). ❌

**Gap:** NVIDIA raw outputs are not captured by `nv-vl-bench.mjs`. Until that
bench is re-run with `text` persistence, NVIDIA rows show `text: null` and the
page renders "raw output not captured" for them. This is a known data gap, and
the page must say so honestly rather than hide it.

## Scoring (unchanged, pinned)

```
score = 0.5 × latency_norm + 0.3 × content_norm + 0.2 × correctness_bonus
latency_norm = 1 − (row.ms − min_ms) / (max_ms − min_ms)
content_norm = row.textLen / max_textLen
correctness_bonus = 1.0 if ok, 0 if error
```

`ranked[0]` is the winner. Ties break by score desc.

## Layout (top-down proof order)

1. **Header** — title, generatedAt, benchmark description.
2. **Subject** — the source image + caption.
3. **Per prompt:**
   a. **Conclusion** — winner card (model, lane, ms, score).
   b. **Evidence** — collapsible full table: rank, model, lane, ms, chars,
      score, status, **and a "raw" expander per row showing the full response**.
4. **Method** — the algorithm block.
5. **Footer** — repo link, data provenance.

## Acceptance

- [ ] Page shows the full raw response for every FreeInference row.
- [ ] NVIDIA rows honestly display "raw not captured" (data gap surfaced).
- [ ] Every failure row is visible, not collapsed.
- [ ] Exact prompt text + source image present.
- [ ] Scoring formula + weights visible.
- [ ] Live at `https://toxicwind.github.io/stochos/` (served from repo root).
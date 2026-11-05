# Model-routing empirical probe (2026-11-05)

> Experimental recalibration data. The architect's directive: model settings
> are based on FULL PROVIDER not model; control must be per-model-per-provider-
> per-router; concurrency is still broken (routers back off instead of being
> smart). This file records the measured ground truth.

## Probe method

For each provider lane × model, a live chat/vision/reasoning completion was
sent with a 30s timeout. Vision used a 76-byte solid-red PNG. Latency is
wall-clock ms. `X-Reasoning-Passthrough: false` + UA header sent (the working
FreeInference contract).

## Provider lanes probed

| Lane | baseUrl | key | note |
|---|---|---|---|
| `rhodochrosite` | `http://127.0.0.1:25193/v1` | router.key | 429-aware router (freeinference+nvidia+google catalogs) |
| `keypool` | `http://127.0.0.1:25109/freeinference` | freeinference.key | keypool freeinference lane (tau) |
| `freeinference-direct` | `https://freeinference.org/v1` | freeinference.key | direct freeinference (embeddings/vision) |

## Chat results (provider × model)

| provider | model | status | ms | text |
|---|---|---|---|---|
| rhodochrosite | qwen3.6-35b | OK | 301 | OK |
| rhodochrosite | glm-5.3-flash | OK | 22129 | OK |
| rhodochrosite | deepseek-v4-flash | OK | 12866 | OK |
| rhodochrosite | minimax-m3 | **FAIL** | 30013 | timeout |
| rhodochrosite | diffusiongemma | **FAIL** | 30025 | timeout |
| keypool | qwen3.6-35b | OK | 182 | OK |
| keypool | glm-5.3-flash | OK | 4182 | OK |
| freeinference-direct | glm-5.3-flash | OK | 2096 | OK |
| freeinference-direct | qwen3.6-35b | OK | 155 | OK |

## Vision results (provider × model)

| provider | model | status | ms | text |
|---|---|---|---|---|
| rhodochrosite | qwen3.6-35b | **FAIL 502** | 1 | bad_gateway |
| rhodochrosite | glm-5.3-flash | **FAIL 502** | 1 | bad_gateway |
| rhodochrosite | nvidia/nemotron-3.5-super-vl-120b-a12b | **FAIL 502** | 0 | bad_gateway |
| freeinference-direct | glm-5.3-flash | OK | 207 | Red |
| freeinference-direct | qwen3.6-35b | OK | 210 | Red |
| freeinference-direct | deepseek-v4-flash | **FAIL 400** | 109 | Invalid request |

## Reasoning result

| provider | model | status | ms |
|---|---|---|---|
| rhodochrosite | qwen3.6-35b | **FAIL 502** | 0 | bad_gateway |

## Findings (empirical ground truth)

1. **Vision via rhodochrosite :25193 is BROKEN** — every vision request 502s
   immediately (bad_gateway), including nvidia nemotron VL. Vision works ONLY
   via `freeinference-direct`. This is the "flawed qwen in rhodochrosite" the
   architect flagged. The router does not proxy vision/multimodal correctly.
2. **minimax-m3 and diffusiongemma are DEAD** on rhodochrosite (30s timeout).
   They are listed in kappa.jsonc and rhodochrosite's catalog but do not respond.
3. **Concurrency defect**: rhodochrosite's rate limiter is RPM-token-bucket
   (ratelimit.rs), NOT concurrency-aware. It does not cap in-flight requests,
   so bursts all hit freeinference → 429 → "Provider is overloaded — retrying
   with backoff [retrying in 5s attempt #3]". A smart router would cap
   concurrency (freeinference allows ~2 concurrent per key), queue excess, and
   route around overload — never dumb-backoff.
4. **Latency spread**: qwen is fast (155-301ms) on all lanes; glm is slow on
   rhodochrosite (22s) but fast direct (2s); deepseek is slow (12s). The router
   serializes/backs-off, inflating latency.
5. **dead deepseek vision**: deepseek-v4-flash advertises image input but 400s
   on vision (catalog-lies, matches vision-kit finding).

## Recalibration implications

- **Vision role** must route to `freeinference-direct` (glm or qwen), NOT
  rhodochrosite. rhodochrosite's vision lane is a hard defect.
- **Default/chat** works on keypool/freeinference (qwen, 182ms) — fastest lane.
- **Dead models** (minimax-m3, diffusiongemma) must be quarantined/removed
  from kappa.jsonc and rhodochrosite seeds.
- **Concurrency** must be capped per (provider, model) — a semaphore/lease, not
  an RPM bucket — with queueing and route-around, eliminating the 5s backoff.
- **Control surface** must be per-model-per-provider-per-router (the matrix
  above IS that surface), expressed so tau AND kappa consume it.
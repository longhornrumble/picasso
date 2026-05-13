# CORS Hardening — Design (Phase D3)

**Status:** DESIGN — no code shipped yet. Supersedes D3.1–D3.6 from `~/.claude/plans/joyful-dreaming-trinket.md` based on Phase D1 findings.

**Companion docs:**
- `docs/cors/ORIGIN_DISCOVERY_2026-05-13.md` — Phase D1 log-mining results
- `~/.claude/plans/joyful-dreaming-trinket.md` — original plan (per-tenant CORS assumption; **superseded for D3.1–D3.6**)

---

## 1. Why this design is smaller than the original plan

The original plan assumed per-tenant CORS: each tenant carries its own `cors.allowed_origins`, the config builder UI captures them, `Picasso_Config_Manager` passes them through, MFS + BSH merge them with defaults. That architecture matches a world where tenant pages embed the widget cross-origin.

**Phase D1 disproved that assumption.** Findings on 2026-05-13 across 7 days of prod log data:

| Origin | Hits (7d) | Where |
|---|---|---|
| `https://chat.myrecruiter.ai` | 5,041 | prod MFS (LG-1a) |
| `https://staging.chat.myrecruiter.ai` | 19 | staging + prod MFS |
| `null` | 16 | sandboxed iframes / `file://` (rejected, correct) |
| `https://evil.example.com` | 1 | adversarial test sentinel (staging only, rejected, correct) |

**Zero non-myrecruiter origins.** The widget iframe architecture means every customer page loads the widget from `https://chat.myrecruiter.ai/widget.js` and the widget's `fetch` to MFS is same-origin to that CloudFront host — never to the tenant's parent page.

Consequences:
- No per-tenant origin to capture → no tenant config schema change
- No per-tenant origin to display → no config builder UI
- No per-tenant origin to merge → no `Picasso_Config_Manager` change
- The MFS `cors.allowed_origins` merge code in `validate_cors_origin` is dead-but-harmless: zero tenant configs carry that field

The remaining real work is **static-allowlist replacement of wildcards in BSH** and a tiny default fix in MFS.

---

## 2. Current code state (verified 2026-05-13)

### 2.1 MFS — already in target shape

`Master_Function_Staging/lambda_function.py` line 202 — `_CORS_ALLOWED_ORIGINS_DEFAULT`:
```python
_CORS_ALLOWED_ORIGINS_DEFAULT = [
    'http://localhost:8000',         # ← default fallback (issue: should not be the fallback)
    'http://localhost:5173',
    'http://localhost:3000',
    'https://chat.myrecruiter.ai',
    'https://staging.chat.myrecruiter.ai',
    'https://picassocode.s3.amazonaws.com',
    'https://picassostaging.s3.amazonaws.com',
]
```

`add_cors_headers()` (line 267): already reflects allowlist-matched origin; **never falls back to `*`** (Phase-audit B6, 2026-05-11). Only residual issue: when no `Origin` header is present, falls back to `_CORS_ALLOWED_ORIGINS_DEFAULT[0]` = `http://localhost:8000`, which is semantically wrong (should be `https://chat.myrecruiter.ai`).

`validate_cors_origin()` (line 213): same allowlist, plus a tenant-extras merge code path (line 250-254) that reads `config_data["cors"]["allowed_origins"]`. **Dead-but-harmless** — no tenant config carries that field.

### 2.2 BSH — 16 hardcoded `*` literals + spec-invalid Lambda URL config

`Bedrock_Streaming_Handler_Staging/index.js`: 16 instances of `'Access-Control-Allow-Origin': '*'` across the file (lines 101, 120, 153, 165, 183, 194, 221, 234, 255, 278, 812, 856, 919, 935, 1142, 1162).

Lambda URL CORS config (staging account, verified 2026-05-13):
```json
{
  "AllowCredentials": true,
  "AllowHeaders": ["*"],
  "AllowMethods": ["*"],
  "AllowOrigins": ["*"],
  "ExposeHeaders": []
}
```
The `AllowOrigins: ["*"]` + `AllowCredentials: true` combo is **spec-invalid** — browsers reject credentialed requests with wildcard origins. This works today only because callers don't send credentials; tightening will likely surface latent issues.

---

## 3. Design

### 3.1 D3.A — BSH JavaScript CORS helper

**File:** new `Bedrock_Streaming_Handler_Staging/cors-helper.js`

```js
const ALLOWED_ORIGINS = new Set([
  'http://localhost:8000',
  'http://localhost:5173',
  'http://localhost:3000',
  'https://chat.myrecruiter.ai',
  'https://staging.chat.myrecruiter.ai',
  'https://picassocode.s3.amazonaws.com',
  'https://picassostaging.s3.amazonaws.com',
]);

const DEFAULT_ORIGIN = 'https://chat.myrecruiter.ai';

function pickOrigin(event) {
  const headers = event?.headers || {};
  const origin = headers.origin ?? headers.Origin ?? headers.ORIGIN;
  if (!origin) return DEFAULT_ORIGIN;
  if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) return origin;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  return DEFAULT_ORIGIN;
}

function corsHeaders(event, extras = {}) {
  return {
    'Access-Control-Allow-Origin': pickOrigin(event),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    ...extras,
  };
}

module.exports = { corsHeaders, pickOrigin, ALLOWED_ORIGINS };
```

**Migration:** replace all 16 occurrences of inline `'Access-Control-Allow-Origin': '*'` and adjacent CORS headers in `index.js` with `...corsHeaders(event)`. Each callsite must have `event` in scope; spot-check the 16 sites — most are inside handler functions that receive `event` directly, a few are inside helper functions and need `event` passed through.

**Why mirror MFS allowlist exactly:** the two Lambdas serve traffic from the same widget origin set. Drift between MFS and BSH allowlists is a latent class of bug; the literal duplication here is intentional. If/when an allowlist change becomes necessary, it changes in both places in the same PR.

### 3.2 D3.B — BSH staging Lambda URL CORS config tightening

Replace the wildcard with the explicit allowlist via `aws lambda update-function-url-config`:

```bash
aws lambda update-function-url-config \
  --function-name Bedrock_Streaming_Handler_Staging \
  --profile myrecruiter-staging \
  --cors '{
    "AllowCredentials": true,
    "AllowHeaders": ["Content-Type", "Authorization", "X-Requested-With"],
    "AllowMethods": ["GET", "POST", "OPTIONS"],
    "AllowOrigins": [
      "https://chat.myrecruiter.ai",
      "https://staging.chat.myrecruiter.ai",
      "https://picassocode.s3.amazonaws.com",
      "https://picassostaging.s3.amazonaws.com"
    ],
    "ExposeHeaders": []
  }'
```

Note: localhost origins are intentionally omitted from the URL config — the Lambda URL CORS layer is a coarse gatekeeper; dev workflows that need localhost go through the JS helper (which handles localhost) after the URL config admits the request. Since the URL config rejects on origin mismatch BEFORE the Lambda runs, localhost dev calls would be blocked at the edge. **Decision:** include localhost in the URL config too, matching the helper.

Final origin list for the URL config:
```
http://localhost:3000
http://localhost:5173
http://localhost:8000
https://chat.myrecruiter.ai
https://staging.chat.myrecruiter.ai
https://picassocode.s3.amazonaws.com
https://picassostaging.s3.amazonaws.com
```

### 3.3 D3.C — MFS default-origin fix

Change `add_cors_headers()` line 283 default in `Master_Function_Staging/lambda_function.py`:

```python
# Before
allowed_origin = _CORS_ALLOWED_ORIGINS_DEFAULT[0]  # http://localhost:8000
# After — canonical chat host, not the first localhost entry
allowed_origin = 'https://chat.myrecruiter.ai'
```

Also remove the `validate_cors_origin` tenant-extras code path (lines 249-254) since D1 confirms no tenant carries `cors.allowed_origins`. This is hygiene, not security; gated on tests confirming no caller relies on it.

**Decision:** keep the tenant-extras code in `validate_cors_origin` for now. Per the feedback memory `feedback_forward_compatible_reads`, readers tolerate missing fields. Removing dead-but-harmless code is hygiene — defer to a future cleanup pass.

### 3.4 D3.D — `add_cors_headers` / `validate_cors_origin` reconciliation

The two functions share `_CORS_ALLOWED_ORIGINS_DEFAULT` but their reflection logic is duplicated. Phase-audit B6 (2026-05-11) caught this divergence and harmonized the allowlist source but not the code paths.

**Decision:** out of scope for D3. Both functions are correct given the static allowlist. Reconciling into one helper is a refactor, not a CORS hardening fix. File as a future cleanup ticket if surfacing matters; otherwise leave.

### 3.5 D3.E — Out of scope (explicit)

- **Prod API Gateway `kgvc8xnewf` CORS config:** no staging twin (per `~/.claude/plans/joyful-dreaming-trinket.md` Phase D0). Hands-off until twin provisioned. Files as separate plan.
- **Prod `Bedrock_Streaming_Handler` Lambda URL CORS:** prod-account resource. Files as separate plan with operator written authorization.
- **Tenant config schema additions (`cors.allowed_origins`):** D1 shows no tenant needs this. Original D3.1/D3.2/D3.3/D3.6 are obviated. If a future tenant embeds the widget cross-origin (e.g., custom subdomain pointing at the widget JS bundle directly), revisit then.
- **Removing dead tenant-extras merge in `validate_cors_origin`:** see D3.C — deferred.

---

## 4. Verification (post-implementation)

### 4.1 Synthetic curl tests against staging BSH Lambda URL

Pre-cutover baseline:
```bash
curl -is -X OPTIONS "$BSH_URL" -H "Origin: https://attacker.test" -H "Access-Control-Request-Method: POST" | grep -i "access-control-allow-origin"
# expect: Access-Control-Allow-Origin: *  ← current spec-invalid state
```

Post-cutover (URL config tightened):
```bash
curl -is -X OPTIONS "$BSH_URL" -H "Origin: https://attacker.test" -H "Access-Control-Request-Method: POST" | grep -i "access-control-allow-origin"
# expect: no Access-Control-Allow-Origin header  ← URL-config rejects at edge

curl -is -X OPTIONS "$BSH_URL" -H "Origin: https://chat.myrecruiter.ai" -H "Access-Control-Request-Method: POST" | grep -i "access-control-allow-origin"
# expect: Access-Control-Allow-Origin: https://chat.myrecruiter.ai
```

### 4.2 Synthetic curl tests against staging MFS

```bash
curl -is "$MFS_URL/health" -H "Origin: https://chat.myrecruiter.ai" | grep -i "access-control-allow-origin"
# expect: Access-Control-Allow-Origin: https://chat.myrecruiter.ai

curl -is "$MFS_URL/health" -H "Origin: https://evil.test" | grep -i "access-control-allow-origin"
# expect: Access-Control-Allow-Origin: https://chat.myrecruiter.ai  ← default fallback (browser will block at client)

curl -is "$MFS_URL/health" | grep -i "access-control-allow-origin"
# expect: Access-Control-Allow-Origin: https://chat.myrecruiter.ai  ← no-origin default (was http://localhost:8000 before)
```

### 4.3 Real-traffic CloudWatch monitoring (post-deploy)

Re-run Phase D1 queries against `/aws/lambda/Master_Function_v2` and `/aws/lambda/Bedrock_Streaming_Handler_Staging` (staging) for a 24-hour window post-deploy. Expect:
- Allowed origins continue at baseline volume (within ±10%)
- No new `CORS: Origin ... not in allowed list` warnings spike (would indicate a legitimate caller broke)
- BSH starts emitting CORS log lines (helper logs reflected origin) — establishes the BSH observability gap noted in D1 §8.3 is closed

If allowed-origin volume drops or rejection spikes, **roll back the URL config** and revert the JS helper.

---

## 5. Ticket breakdown (D4 territory, included here for one-shot review)

Single PR on `lambda` repo, deploying to staging-account `Bedrock_Streaming_Handler_Staging` only:

**Ticket 1 — BSH CORS hardening (1 PR, deploys to staging-account BSH only)**
- Add `cors-helper.js` with the static allowlist + `corsHeaders(event)` helper
- Refactor 16 `Access-Control-Allow-Origin: '*'` sites to use the helper
- Update staging-account Lambda URL CORS config (AWS-state change in staging only)
- Tests: unit test the helper for each origin class (allowed, localhost, unknown, missing); integration test against deployed staging Lambda URL via curl
- Rollback: re-deploy prior bundle + restore wildcard URL config

**Ticket 2 — MFS default-origin fix (1 small PR on `lambda`, deploys to MFS staging)**
- Change `add_cors_headers()` default from `_CORS_ALLOWED_ORIGINS_DEFAULT[0]` to `'https://chat.myrecruiter.ai'`
- Test: add a no-Origin-header case to the existing MFS test suite
- Trivial — could fold into Ticket 1 if same PR is desired, but keeping separate isolates blast radius

**Ticket 3 — Prod-account cutover (separate plan, gated on operator written authorization)**
- API GW `kgvc8xnewf` CORS config tightening
- Prod `Bedrock_Streaming_Handler` Lambda URL CORS config tightening
- Picasso parent submodule pointer bump after Ticket 1 + Ticket 2 merge
- Files as a separate plan; **not** in scope here.

---

## 6. Open questions resolved by D1

- **Q1 (handoff):** "Brief E smoke test result?" — Resolved: 59 min of post-deploy traffic, 0 errors, PR #107 merged.
- **Q2 (handoff):** "Foster Angels embed domain?" — Resolved as moot: D1 shows tenant parent domains are never in the CORS log surface.
- **Q3 (handoff):** "Brief F timing?" — Out of scope here; operator decision.
- **Q4 (handoff):** "Master_Function_v2 mystery?" — Resolved in `ORIGIN_DISCOVERY_2026-05-13.md` §8.1: log group exists (22 MB historical), Lambda deleted, actual prod `Master_Function` routes logs there via `LoggingConfig.LogGroup`.

---

## 7. Review checklist

- [ ] `tech-lead-reviewer` — does the design honor the staging-first scope constraint?
- [ ] `Security-Reviewer` — does the post-cutover state close the wildcard CORS gap noted in P0a Phase 1?
- [ ] Operator — promote PR #102 (discovery doc) + this design doc to ready before scheduling Ticket 1 implementation.

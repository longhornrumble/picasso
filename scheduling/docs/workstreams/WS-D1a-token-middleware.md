# WS-D1a — Signed-token middleware (§13)

**Plan task:** D1a (the tokenized middleware relocated from B12) + **CI-3d** (token-purpose enum contract test). [plan](../scheduling_implementation_plan.md).
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-d1a` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **FULL** (signed tokens / auth surface — mandatory Security review).

## Goal / done-bar
- A signed-token lib: HMAC-signed tokens carrying a `purpose` from the **LOCKED 6-purpose enum** (§B4), **per-purpose expiry** (§13.6), and **one-time-use** via the **EXISTING** `picasso-token-jti-blacklist-{env}` table (atomic conditional `PutItem` on `attribute_not_exists(jti)` → 410 on reuse; §13.7 — DO NOT provision a new table). Mirrored signer + verifier (single SoT module).
- **CI-3d contract test:** adding a purpose to the issuer without updating the verifier → red CI. Tamper / expiry / replay (reuse → 410) tests all pass.

## You OWN (create/edit ONLY these) — `shared/scheduling/` is scaffolded (pre-launch §4.0 step 2)
- `shared/scheduling/tokens.js` + `shared/scheduling/__tests__/tokens.test.js`

## You CONSUME (frozen — never modify; [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md))
- **§B4 (LOCKED):** the 6 purposes = `cancel` · `reschedule` · `post_application_recovery` · `attended_yes` · `no_show` · `didnt_connect`; the per-purpose expiry table; the existing jti-blacklist table for one-time-use. No "confirm" step — it's locked; build to it.

## You PRODUCE
- §B4 `TOKEN_PURPOSES` (the 6, exactly) + `sign(purpose, claims)` / `verify(token)` — the SoT every D consumer (reschedule/cancel/attendance/disposition endpoints) imports. Honor exactly.

## OUT OF SCOPE / do NOT
- Do NOT build the consumer endpoints or the `schedule.myrecruiter.ai` greenfield CloudFront (§13.8 — later-D infra). Do NOT add a purpose beyond the locked 6. Do NOT provision a jti table — it already exists (A6/PR#52); your lib just does the conditional PutItem against it.

## References
- Canonical §13 (token format + the purposes). Plan D1a, CI-3d. `CLAUDE.md` (never-share-IAM, credential-mutation gate).

## Report-back
- PR `feat(scheduling): WS-D1a signed-token middleware + CI-3d` → main. Snippet: plan D1a + CI-3d → 🟡/🟢. Confirm `TOKEN_PURPOSES` matches the locked §B4.

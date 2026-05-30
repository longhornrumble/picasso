# WS-D1a — Signed-token middleware (§13)

**Plan task:** D1a (the tokenized middleware relocated from B12) + **CI-3d** (token-purpose enum contract test). [plan](../scheduling_implementation_plan.md).
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-d1a` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **FULL** (signed tokens / auth surface — mandatory Security review).

## Goal / done-bar
- A signed-token lib: HMAC-signed tokens carrying a `purpose` from the frozen enum, **one-time-use** enforcement, **per-purpose TTL**. Mirrored signer + verifier (single SoT module).
- **CI-3d contract test:** adding a purpose to the issuer without updating the verifier → red CI. Tamper / expiry / replay (one-time-use) tests all pass.

## You OWN (create/edit ONLY these) — [proposed; integrator confirms in §4.0]
- `shared/scheduling/tokens.js` + `shared/scheduling/__tests__/tokens.test.js`

## You CONSUME (frozen — never modify; [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md))
- §B4 the token-purpose enum — **confirm the exact 6 purposes against canonical §13 with the integrator before coding** (this is one of the §B contracts that locks at launch).

## You PRODUCE
- §B4 `TOKEN_PURPOSES` + `sign(purpose, claims)` / `verify(token)` — the SoT every D consumer (reschedule/cancel/attendance/disposition endpoints) imports. Honor exactly.

## OUT OF SCOPE / do NOT
- Do NOT build the consumer endpoints (later D tasks). Do NOT invent a purpose not in canonical §13. The one-time-use ledger: confirm its store (a DDB table or the existing blacklist pattern) with the integrator — don't provision infra unilaterally.

## References
- Canonical §13 (token format + the purposes). Plan D1a, CI-3d. `CLAUDE.md` (never-share-IAM, credential-mutation gate).

## Report-back
- PR `feat(scheduling): WS-D1a signed-token middleware + CI-3d` → main. Snippet: plan D1a + CI-3d → 🟡/🟢. Confirm `TOKEN_PURPOSES` matches the locked §B4.

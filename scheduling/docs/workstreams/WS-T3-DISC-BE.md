# WS-T3-DISC-BE — calendar Disconnect (backend: OAuth route + ADA endpoint)

Plan task: A6 tail / §E11 remaining scope. Repo/branch/base: lambda repo (`Lambdas/lambda`) · `feature/scheduling-t3-disconnect-be` · base `main`.
Quality gate: verify-before-commit (always) · weave audit = **FULL, HIGH-RISK** (OAuth/secrets surface).

## Goal / done-bar (verifiable)
Implement §E11b exactly (read `scheduling/docs/FROZEN_CONTRACTS.md` §E11b — it is the spec):
1. Calendar_OAuth_Connect: METHOD-ENFORCED `POST /connection/disconnect`, body `{init}`; verify → best-effort `oauth.revokeToken()` (new; failure logs `disconnect_google_revoke_failed` WARN, never blocks) → shipped `secrets.markDisconnected()` → best-effort async Offboarder invoke (mirror the callback's Onboarder pattern). Idempotent on already-revoked/missing secret (generic 200, no detail leak). NO jti burn (contract states why). Tests: route dispatch, method enforcement, verify-fail 4xx, revoke-fail-still-disconnects, offboarder-fail-still-200, idempotency, ordering (verify → revoke → stamp → offboard).
2. ADA: Clerk-authed `POST /scheduling/connection/disconnect`, SELF-ONLY identity (same resolution as the §E0 init mint); mints init token; **server-side POST** to `${OAUTH_FUNCTION_URL}/connection/disconnect` with body-carried token; relays `{status, watch}`; generic errors (no secret-path/URL leakage — mirror the init mint's G3 hygiene). Tests: auth gating, self-only, body-carried token (assert NOT in query), upstream-4xx/5xx relay, timeout handling.
3. Full suites green: Calendar_OAuth_Connect jest + ADA pytest (goldens untouched unless the contract forces it — explain if so).

## You OWN (create/edit ONLY these)
- `Calendar_OAuth_Connect/index.js`, `oauth.js` (add `revokeToken`), their test files; `DEPLOY_NOTES.md` (document the new route + the Offboarder invoke grant the integrator wires).
- `Analytics_Dashboard_API/lambda_function.py` + the relevant `test_scheduling_connection_*.py` (new file ok).

## You CONSUME (frozen — never modify)
- §E11b (the spec), §E11, §E0 mint pattern, `secrets.markDisconnected()` (shipped — use as-is), Calendar_Watch_Offboarder's `{tenant_id, coordinator_id}` interface (do not edit that Lambda).

## OUT OF SCOPE / do NOT
- NO dashboard code (WS-T3-DISC-FE). NO IaC (CloudFront behavior + invoke grant = integrator glue; your code must tolerate the route being unreachable until glue lands). NO secret deletion. NO admin-disconnects-others. NO edits to Calendar_Watch_Offboarder, state.js token formats, or the jti modules.

## Report-back (in your PR)
Title `feat(scheduling): T3 — calendar disconnect (OAuth route + ADA, §E11b)`, base `main`. Include: done-bar status per item, suite summaries, kanban doc-snippet, the exact IAM/CloudFront glue you need (so the integrator wires it sight-unseen), any contract concern (STOP and flag).

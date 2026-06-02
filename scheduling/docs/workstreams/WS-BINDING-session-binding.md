# WS-BINDING — session-binding resolution (B1-backend, §B12)

**Plan task:** B-minimal / Track B1 (backend). [plan](../D_DEPLOY_AND_C_CHAT_INTEGRATION_PLAN.md).
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-binding` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **FULL** (auth-adjacent — it gates who may act on a booking).

## Goal / done-bar (verifiable)
A module `shared/scheduling/sessionBinding.js` exporting **`resolveBinding({ tenantId, sessionId, deps })`** (§B12) that reads the §B10 row from `picasso-conversation-scheduling-session-{env}` (PK `tenantId` · SK `session_id` = the `binding#<uuid>` value WS-D4 writes) and returns `{ intent, booking_id, coordinator_id?, form_submission_id?, expires_at, session_id } | null`.
- **TTL enforced IN CODE:** if `now ≥ expires_at` → return `null` (do NOT rely on DDB-TTL deletion timing for the gate — architect).
- **Tenant isolation (the security crux):** `tenantId` is the PK, supplied by the AUTHENTICATED request context (never the URL). A `sessionId` minted under tenant A simply misses under tenant B → unforgeable cross-tenant. The module just does the tenant-scoped GetItem; it does NOT accept a tenant from untrusted input.
- **Done-bar:** unit tests (`deps={ddb, now}` mocked) — valid unexpired binding → the shape; expired (`now≥expires_at`) → null; missing row → null; a row under a different tenant → null (GetItem miss); forward-compatible reads (tolerate missing optional `coordinator_id`/`form_submission_id`).

## You OWN (create/edit ONLY these)
- `shared/scheduling/sessionBinding.js` + `shared/scheduling/__tests__/sessionBinding.test.js`.
- Do NOT touch `shared/scheduling/package.json`; `npm ci` in `shared/scheduling/` before tests.

## You CONSUME (frozen — never modify)
- **§B12** (your signature) + **§B10** (the binding-row shape WS-D4 writes — read it; do NOT write or re-shape it).
- The `picasso-conversation-scheduling-session` table (PK tenantId · SK session_id) — read-only via injected `deps.ddb`.

## You PRODUCE
- §B12 `resolveBinding` — the read+validate helper WS-CONVO calls as its pre-turn hook.

## OUT OF SCOPE / do NOT
- Do NOT write/mutate bindings (WS-D4 owns the write). Do NOT build the conversation or call reschedule/cancel. Do NOT read PII beyond the booking-reference fields the row carries (it is references-only by §13.3).

## References
- §B12, §B10, §13.4 (binding semantics), §13.5 (bearer model). `CLAUDE.md` (schema discipline — defensive reads).

## Report-back
- PR `feat(scheduling): WS-BINDING session-binding resolution (B1)` → main. Snippet: plan B1-be → 🟢; confirm TTL-in-code + tenant-scoped. Flag any contract issue (STOP, don't fork).

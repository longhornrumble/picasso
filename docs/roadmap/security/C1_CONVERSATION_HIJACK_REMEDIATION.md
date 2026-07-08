# C1 — Cross-Tenant Conversation Hijack: Remediation Brief

> **Status: P1 SHIPPED (server, compat-open) — lambda#401, 2026-07-08. P2–P4 queued (sequenced below).** P1 does NOT close C1 on its own — the raw-`session_id` resume path stays open until P3. Written 2026-07-03 alongside the C3 fix (lambda#372). Source finding: [`docs/audits/SECURITY_REVIEW_2026-07-02.md`](../../audits/SECURITY_REVIEW_2026-07-02.md) §C1 (confirmed-live critical). Code anchors below were current as of 2026-07-03 (P1 landed at drifted lines — see the PR).

## The bug (confirmed live, no auth)

`POST ?action=init_session` (`Lambdas/lambda/Master_Function_Staging/lambda_function.py:1294` `handle_init_session`) accepts a **client-supplied raw `session_id`** and signs a valid conversation state JWT for `(session_id, tenant_hash)` with **no proof the caller owns the session**. The `picasso-conversation-summaries` and `picasso-recent-messages` tables are keyed by `sessionId` **only** (`tenant_id` reaches the DB helpers but is never in a key condition — `conversation_handler.py` `_get/_save/_delete_conversation_from_db`, 610/700/806). `tenant_hash` is public (embedded in the site `<script>` tag).

**Exploit:** learn a victim's `session_id` (leaks via shared links, referrer, history, logs) + the public tenant hash → mint a token → `operation=get` reads the full transcript + PII, `operation=save` injects turns into their live conversation, `operation=clear` deletes their history.

## The load-bearing insight (why this isn't the review's "one-line" fix)

**Tenant-keying the tables does NOT close C1.** The attacker presents the victim's *own* public tenant hash, so cross-tenant keying never triggers — it's a same-tenant, cross-session hijack. The load-bearing fix is an **ownership proof**: resume must require possession of the *previously-issued signed token* (which only the original client received), not a raw `session_id` string.

That fix is **coupled client+server**. Recon of the widget (`Picasso/src/utils/conversationManager.js`) found it already persists the signed token (`picasso_conversation_token`, `saveStateToken`/`loadStateToken` 1199-1235) and already round-trips it as `Bearer`/`state_token` on **get/save/clear/stream** — but on resume it re-sends the **raw `session_id`** to `init_session` (`initializeWithServer()` 476-493) and never presents the token there. So closing C1 requires a server change *and* a widget change, sequenced through a compatibility window.

Table tenant-keying remains worth doing as **defense-in-depth** (P4), but it is not what closes the hole.

## Phased plan (auth-contract-closes-both-sides: server opens compatibly → widget rolls out → server tightens)

### P1 — Server, compat-open (lambda repo, Master_Function) — ✅ SHIPPED lambda#401 (2026-07-08)
- `handle_init_session`: authenticated-resume branch — when a prior signed token is presented (`Authorization: Bearer` **or** body `state_token`), verify sig/`iss`/`exp`, **bind the token `tenantId` to the request tenant hash**, rotate, return the conversation. No token → legacy raw-`session_id` path, **still accepted** during the window and instrumented with a greppable `C1_COMPAT_RAW_SESSION_RESUME` log line (gates P3). Invalid/expired presented token → 401 (client re-inits new).
- Cross-check the token `tenantId` claim against the query param `t` — implemented as a **single chokepoint in `_validate_state_token`** (covers `handle_get/save/clear_conversation` at once, since all three call it) → 401 `TENANT_MISMATCH`; `t` absent → no comparison.
- Tests: `Master_Function_Staging/test_c1_p1_resume_ownership.py` (14) — new/legacy/authenticated branches, wrong-tenant/expired/garbage/wrong-key/no-`sessionId` 401s, DB-read-failure non-fatal, `_validate_state_token` cross-check (match/mismatch/absent). Full MFS suite 319 passed.
- Deliberately deferred: blacklist check in the resume path (nothing in MFS ever blacklists state tokens → unreachable); expired-token UX (P2 decides re-mint vs prompt).

### P2 — Widget (picasso repo)
- `conversationManager.js` `initializeWithServer()`/`initializeConversation()` (476-493 / 79-117): on resume, present the stored `picasso_conversation_token` to `init_session`; keep minting for genuinely-new sessions (no stored/expired token). Handle the expired-token fallback explicitly (today `loadStateToken` silently drops an expired token, 1205-1208 — define: re-mint vs prompt).
- Persistence/rotation plumbing already exists — the change is localized to those two functions. Ship, soak in staging, then to prod widget.

### P3 — Server tighten (lambda repo)
- After the widget rollout is confirmed live (P1's counter of raw-`session_id` resumes trends to ~0), **drop the raw-`session_id` resume acceptance** — resume now requires the token. This is the step that actually closes C1.

### P4 — Defense-in-depth: tenant-scope the tables (per-account migration, gated)
- New key shape mirroring `picasso-session-summaries` (`infra/modules/ddb-session-summaries`): `pk=TENANT#{tenant_hash}`, `sk=SESSION#{sessionId}` for summaries; messages add a `#MSG#{messageTimestamp}` sort segment. Reuse `session_utils.generate_tenant_prefixed_key()` (73-91) / `analytics_writer.py` (232-244) as the format templates.
- **Base-table PK is immutable → new-table + backfill + dual-write cutover**, not in-place. Execute **per account, separately**:
  - **Staging (525):** Terraform-managed (`infra/modules/ddb-conversation-summaries-staging`, `ddb-recent-messages-staging`).
  - **Prod (614):** conversation tables are **unmanaged** (no `aws_dynamodb_table` in `lambda-master-function-prod`; state-imported Lambda only) — manual, out-of-band, **dry-run-first**.
- GSI state to lean on: `conversation-summaries` already has `tenantId-index` (helps enumerate-and-backfill); `recent-messages` has **no GSI**.
- Pin the new key format with a contract test (mirror `analytics_writer_contract.json`).

## Key facts for the follow-up (so they aren't re-derived)
- Keying alone doesn't close C1 (public hash) — P1+P3 are load-bearing, P4 is depth.
- Widget already round-trips the token everywhere *except* `init_session`.
- **`generate_stream_token` is NOT a C1 vector — RESOLVED as dead code 2026-07-08** (server: lambda#402; widget `getStreamTokenUrl`: picasso removal PR). Re-verified: it minted from a raw `session_id` but produced a `purpose:'stream'` token with **no `turn` claim**, and `_validate_state_token` requires `turn`, so the conversation gate (get/save/clear) **already rejected** stream tokens — it could never mint a C1 state token. It was also fully dead: `getStreamTokenUrl` (its only widget builder) had zero callers, and **`Bedrock_Streaming_Handler` requires no JWT** (`jsonwebtoken` isn't a dependency), so the stream token was never consumed. (Corrects the earlier "streaming authorizes via the state token in the request body" note — BSH validates no JWT; it authorizes at the transport layer: CloudFront Lambda@Edge SigV4 + AWS_IAM Function URL, Remedy A #435.)
- **Bedrock_Streaming_Handler (BSH) is OUT of C1 scope (verified 2026-07-08).** BSH reads conversation context from the **request body** (`body.conversation_history`), not the stored `sessionId`-keyed tables → no read-hijack; and it writes only `picasso-session-summaries` (analytics) + redacted logs, **not** the `picasso-conversation-summaries`/`picasso-recent-messages` transcript → no inject/delete. The C1 transcript primitives live entirely in MFS `handle_conversation_action`. (Secondary, non-C1: BSH has no per-session ownership proof, so a request could spoof analytics rows / burn inference for a *known* session — rate-limited by the streaming WAF; tracked separately, not part of C1.)
- Prod Master_Function + its conversation tables are state-imported/unmanaged in Terraform — treat P4 prod as a manual gated op under the repo's dry-run-before-destroy rules.
- Rollout ordering is the whole game: server-open (P1) must land and soak before the widget (P2), and the widget must be confirmed live before server-tighten (P3). Skipping the window breaks resume for in-flight users.

# C1 — Cross-Tenant Conversation Hijack: Remediation Brief

> **Status: designed, queued — no code shipped.** Written 2026-07-03 alongside the C3 fix (lambda#372). Source finding: [`docs/audits/SECURITY_REVIEW_2026-07-02.md`](../../audits/SECURITY_REVIEW_2026-07-02.md) §C1 (confirmed-live critical). This brief exists so a dedicated follow-up session picks the work up cold — all code anchors are current as of 2026-07-03.

## The bug (confirmed live, no auth)

`POST ?action=init_session` (`Lambdas/lambda/Master_Function_Staging/lambda_function.py:1294` `handle_init_session`) accepts a **client-supplied raw `session_id`** and signs a valid conversation state JWT for `(session_id, tenant_hash)` with **no proof the caller owns the session**. The `picasso-conversation-summaries` and `picasso-recent-messages` tables are keyed by `sessionId` **only** (`tenant_id` reaches the DB helpers but is never in a key condition — `conversation_handler.py` `_get/_save/_delete_conversation_from_db`, 610/700/806). `tenant_hash` is public (embedded in the site `<script>` tag).

**Exploit:** learn a victim's `session_id` (leaks via shared links, referrer, history, logs) + the public tenant hash → mint a token → `operation=get` reads the full transcript + PII, `operation=save` injects turns into their live conversation, `operation=clear` deletes their history.

## The load-bearing insight (why this isn't the review's "one-line" fix)

**Tenant-keying the tables does NOT close C1.** The attacker presents the victim's *own* public tenant hash, so cross-tenant keying never triggers — it's a same-tenant, cross-session hijack. The load-bearing fix is an **ownership proof**: resume must require possession of the *previously-issued signed token* (which only the original client received), not a raw `session_id` string.

That fix is **coupled client+server**. Recon of the widget (`Picasso/src/utils/conversationManager.js`) found it already persists the signed token (`picasso_conversation_token`, `saveStateToken`/`loadStateToken` 1199-1235) and already round-trips it as `Bearer`/`state_token` on **get/save/clear/stream** — but on resume it re-sends the **raw `session_id`** to `init_session` (`initializeWithServer()` 476-493) and never presents the token there. So closing C1 requires a server change *and* a widget change, sequenced through a compatibility window.

Table tenant-keying remains worth doing as **defense-in-depth** (P4), but it is not what closes the hole.

## Phased plan (auth-contract-closes-both-sides: server opens compatibly → widget rolls out → server tightens)

### P1 — Server, compat-open (lambda repo, Master_Function)
- `handle_init_session` (`lambda_function.py:1294`): branch **new vs resume**. Resume (client presents a valid prior signed token, via `Authorization: Bearer` or body) → verify the token, reuse/rotate it, return the conversation. Genuinely-new session (no token) → mint as today. **During the window, still accept a raw `session_id`** so un-updated widgets keep working (log-and-count these to measure rollout).
- Cross-check the JWT `tenantId` claim against the query param `t` on **every** conversation call — `handle_get/save/clear_conversation` (`conversation_handler.py:132/187/301`) and `_validate_state_token` (`:363`). Today `t` is extracted (`:110`) but never compared. Reject on mismatch (401).
- Tests: extend `test_conversation_handler_text_en.py` (capture-harness style) + `test_jwt_iss_phase2.py` (token hardening precedent). Add the new-vs-resume branch cases and the `tenantId`≠`t` rejection.

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
- `generate_stream_token` (`lambda_function.py:1515`) has the same raw-`session_id` mint pattern; the widget's `getStreamTokenUrl` helper is **dead** (no callers) — streaming authorizes via the state token in the request body, so P1/P3 should cover `generate_stream_token` too but there's no separate stream-token exchange to migrate.
- Prod Master_Function + its conversation tables are state-imported/unmanaged in Terraform — treat P4 prod as a manual gated op under the repo's dry-run-before-destroy rules.
- Rollout ordering is the whole game: server-open (P1) must land and soak before the widget (P2), and the widget must be confirmed live before server-tighten (P3). Skipping the window breaks resume for in-flight users.

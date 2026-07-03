# Security Review — Picasso / MyRecruiter Platform

**Date:** 2026-07-02
**Scope:** `Picasso/` (widget frontend), `picasso-analytics-dashboard/` (dashboard frontend), `Facebook/` (integration docs), `Lambdas/lambda/` (49 backend functions)
**Method:** 7 parallel domain reviews (auth core, AI/streaming + provisioning, webhooks + OAuth, scheduling + notifications, analytics + attribution + PII/DSAR, widget frontend, dashboard frontend). Every finding was confirmed by reading the actual source and tracing attacker-controlled input to a sink; reachability caveats are marked explicitly. Excluded: `node_modules`, `dist`, build artifacts, and a stale `.claude/worktrees/` duplicate checkout.

---

## Executive summary

The platform's security *primitives* are, in isolation, well built: JWT algorithm pinning is consistent (no `alg=none`/HS-RS confusion anywhere), DynamoDB access is parameterized (no expression injection), IAM roles are dedicated per-Lambda and least-privilege, all five third-party webhook integrations verify signatures correctly (raw-body HMAC / Ed25519, timing-safe, fail-closed), SSRF defenses on the form-webhook path are genuinely correct, and no hardcoded secrets exist in source.

The findings cluster around **one recurring architectural failure mode**, seen in five independent code paths:

> A client-supplied identity claim — a `session_id`, a `tenant_hash`, an `email`+`role` tuple, a path `tenant_id` — is treated as *proof of ownership*, and the system mints a validly-signed credential or performs a privileged write on that basis, with the actual authorization assumed to live in an external layer that (for these paths) does not exist. All sit behind Lambda Function URLs with `AuthType=NONE`.

The correct patterns already exist elsewhere in the same codebase (tenant-prefixed DynamoDB keys, signature-bound claims, in-handler JWT verification) — the remediation is applying them consistently, not new infrastructure.

**The single most urgent item is a live, no-privilege-required cross-tenant conversation hijack in `Master_Function` (C1).** Two more Criticals require an operator to verify Function-URL reachability before they can be ranked live-vs-latent (C2 SSO forgery, C4 tenant-config overwrite).

`Facebook/` contains only an architecture doc and an empty `.env` — no code, no leaked secrets.

---

## Severity summary

| # | Severity | Finding | Component | Status |
|---|----------|---------|-----------|--------|
| C1 | **Critical** | Cross-tenant conversation hijack — `init_session` mints tokens for any `session_id`; conversation tables keyed by `sessionId` only | Master_Function | **Remediation queued** → [brief](../roadmap/security/C1_CONVERSATION_HIJACK_REMEDIATION.md) |
| C2 | **Critical** | SSO token forgery — arbitrary `email`/`role`/`tenants` signed with no caller auth | SSO_Token_Generator | Live IF URL reachable (verify) |
| C3 | **Critical** | Notification-event IDOR — `GET /notifications/events/{id}` returns any tenant's PII | Analytics_Dashboard_API | **FIXED** (lambda#372, 2026-07-03; staging deployed, prod dispatch gated) |
| C4 | **Critical** | Unauthenticated production tenant-config overwrite, writes to hardcoded prod bucket | deploy_tenant_stack | Live IF URL reachable (verify) |
| C5 | **Critical (code)** | Athena SQL injection via unvalidated `tenant_id` | Analytics_Aggregator | Likely dead — delete |
| C6 | **Critical (code)** | Unauthenticated cross-tenant transcript disclosure + CWL regex injection | Analytics_Function | Likely dead — verify + delete |
| H1 | **High** | Unauthenticated channel-management IDOR + OAuth state-nonce lets attacker bind own FB page to victim tenant | Meta_OAuth_Handler | **Confirmed** |
| H2 | **High** | Stored XSS — assistant `content` rendered via `dangerouslySetInnerHTML` unsanitized; reachable from tenant config | Picasso widget | **Confirmed** |
| H3 | **High** | Prod tenant-config S3 bucket anonymously public-readable | `myrecruiter-picasso` | Pre-existing, tracked, unowned |
| H4 | **High** | Prototype pollution via `__proto__` in `setByPath` | kb_proposal_applier | **Confirmed** |
| H5 | **High** | Unescaped HTML injection into transactional emails (custom `body_template`) | BSH form_handler.js | **Confirmed** |
| H6 | **High** | Synthetic-monitor "prod guard" does not actually block prod; mutates real bookings | Scheduling_Synthetic_Monitor | **Confirmed** |
| H7 | **High** | `session_archiver` re-creates DSAR/purge-deleted PII in S3 (erasure-defeating) | picasso_session_archiver | **Confirmed** |
| H8 | **High** | Raw phone numbers + message text logged to CloudWatch (violates own PII policy) | SMS_Webhook_Handler | **Confirmed** |
| M1–M27 | Medium | Authorization, injection-hardening, replay, PII-logging, and consistency gaps | multiple | see below |

---

## Critical findings

### C1 — Cross-tenant conversation hijack (Master_Function) — LIVE
`Master_Function_Staging/lambda_function.py:1294-1595` (`handle_init_session`, `handle_generate_stream_token`), `conversation_handler.py:610-893`, `create_conversation_tables.py:20-104`.

`POST ?action=init_session` accepts a client-supplied `session_id` and `t` (tenant_hash) and signs a valid state JWT for that pair with **no proof the caller owns the session**. The `{env}-conversation-summaries` and `picasso-recent-messages` tables use `sessionId` as the **sole** partition key — `tenant_id` is passed to the DB helpers but never used in the key condition. `tenant_hash` is public (embedded in the website `<script>` tag).

**Exploit:** learn a victim's `session_id` (leaks via shared links, referrer, browser history, logs) + the tenant's public hash → mint a token → `operation=get` reads the victim's full transcript + PII; `operation=save` injects turns into their live conversation; `operation=clear` deletes their history.

**Fix:** add `tenantId` to both tables' keys (mirror the existing `session_utils.generate_tenant_prefixed_key()` / `analytics_writer.py` `pk=TENANT#…,sk=SESSION#…` pattern); require the prior signed token to resume rather than accepting a client `session_id`; cross-check the JWT `tenantId` claim against `t` on every conversation call.

### C2 — SSO token forgery (SSO_Token_Generator) — verify reachability
`SSO_Token_Generator/lambda_function.py:100-219`.

`tenant_id`, `email`, `role`, `tenants` are read from the request body and signed into an 8-hour HS256 JWT with **no caller authentication, no role allowlist, no tenant cross-check**. A body of `{"role":"super_admin","tenants":["*"]}` yields a super-admin token for every tenant.

**Caveat:** no IaC found for its front door (legacy, hand-managed); ~0 invocations/30d; Bubble is being deprecated. **Operator must run `aws lambda get-function-url-config --function-name SSO_Token_Generator`** — if the URL is reachable, this is live-Critical; lock down or decommission immediately regardless.

**Fix:** require a verifiable caller credential (HMAC from Bubble, or IAM auth), re-derive `role`/`tenant_id` server-side; accelerate the planned Clerk-verification replacement and retire this endpoint.

### C3 — Notification-event IDOR (Analytics_Dashboard_API) — LIVE
`Analytics_Dashboard_API/lambda_function.py:7391-7477` (query at 7417-7429).

`GET /notifications/events/{message_id}` queries the `ByMessageId` GSI keyed **only** on `message_id`; the caller's `tenant_id` is used for the feature gate and a log line but never compared to the item's `pk` (`TENANT#<owner>`). The GSI projects ALL attributes, so `detail` (recipient IP, user agent, clicked link, SMTP diagnostics) is returned. The sibling list endpoint does this correctly — isolated regression.

**Exploit:** any authenticated user of any tenant (including `member` role) with a foreign `message_id` receives that tenant's notification PII.

**Fix (one line + test):** filter results to `pk == f'TENANT#{tenant_id}'`, else 404; add a cross-tenant regression test.

### C4 — Unauthenticated production tenant-config overwrite (deploy_tenant_stack) — verify reachability
`deploy_tenant_stack/lambda_function.py:182-421`, `:14` (`PRODUCTION_BUCKET = "myrecruiter-picasso"` hardcoded).

The handler parses an HTTP event ("from Bubble"), does **zero** authentication, validates only the character set of `tenant_id`, then unconditionally `put_object`s a full tenant config to the hardcoded **production** bucket. `Access-Control-Allow-Origin: *`. No IaC in repo (legacy).

**Exploit (if the Function URL is `AuthType=NONE`):** overwrite any existing tenant's live config — including `tone_prompt`, which flows into the AI system prompt — defacing/hijacking their production chatbot.

**Operator must verify** the Function URL AuthType. **Fix:** shared-secret header (mirror BSH `cf-origin-validator.js`) or `AuthType=AWS_IAM`.

### C5 — Athena SQL injection (Analytics_Aggregator) — likely dead, delete
`Analytics_Aggregator` (`deployment.zip`) `lambda_function.py:75` + ~13 query builders. `tenant_id` from the raw event is f-string-interpolated into `WHERE tenant_id = '{tenant_id}'` with no validation. A `tenant_id` of `x' OR '1'='1` breaks the tenant filter and writes cross-tenant data into the attacker's aggregate row.

**Reachability:** `docs/audits/conversation_storage_audit_2026-05-10.md` found this unreachable (0 invocations, no EventBridge rule); `infra/.../main.tf:12` marks it "Dead-but-deployed." **Fix: delete the function** (per the existing audit recommendation) rather than patch dead code; the `lambda:InvokeFunction` grant is a live landmine until then.

### C6 — Unauthenticated transcript disclosure + regex injection (Analytics_Function) — likely dead, verify
`Analytics_Function` (`deployment.zip`) `lambda_function.py:828-848` (no auth anywhere), `cloudwatch_reader.py:19-41` (unescaped `filter @message like /{tenant_hash}/`), `:169,216-219` (result parser only checks `tenant_hash` non-empty, never that it matches the request).

**Exploit:** supply any tenant's hash → their full Q&A transcripts; supply `tenant_hash=.*` → every tenant's transcripts in one unauthenticated call. Same "dead per 2026-05-10 audit" status as C5, but the audit did **not** confirm the HTTP trigger was removed — **higher priority to verify** than C5, then delete.

---

## High findings

### H1 — Meta OAuth channel-management IDOR + tenant-takeover — confirmed
`Meta_OAuth_Handler/lambda_function.py` (routes at `:718-782`, handlers `:324-652`). The docstring claims Clerk-JWT gating, but the handler contains **no** auth check; `tenant_id` is read from the URL path. The config-builder sends a Bearer token *optionally* (`...(token ? {...} : {})`), but for its plain `fetch` to a raw `lambda-url…on.aws` URL to work at all, `AuthType` must be `NONE` — so the token is never verified. `GET/POST /meta/channels/{tenant_id}` (list/toggle/disconnect) are unauthenticated cross-tenant. Compounded by the OAuth `state` nonce being minted but never persisted/checked (`:177-211`): an attacker can complete OAuth with a victim's `state` and bind **their own Facebook Page** to the victim tenant. Popups also `postMessage(..., '*')` and embed `page_name` into a `<script>` with incomplete escaping (`:663-664, 696`) — reflected XSS via a crafted Page name.

**Fix:** verify Clerk JWT in-handler and bind path `tenant_id` to the caller's org; persist+one-time-check the state nonce; `json.dumps()`-escape popup values and target a specific origin.

### H2 — Stored XSS in the chat widget — confirmed
`Picasso/src/context/StreamingChatProvider.jsx:1546-1573` → `components/chat/MessageBubble.jsx:942-947` (`dangerouslySetInnerHTML`). Locally-added assistant messages set `content` verbatim with no sanitization; the real sanitizer (`context/ChatProvider.jsx`) is **dead code, never wired in**. Reachable from tenant-config fields: `content_showcase[].tagline/description` (populated by the KB card-extraction pipeline from **scraped website content**), `cta_definitions[].label/value`, `eligibility_gate.failure_message`. Amplified by the session JWT living in `sessionStorage` (`conversationManager.js:1197-1230`) and permissive iframe `sandbox` flags allowing top-nav.

**Fix:** route every `addMessage({role:'assistant'})` through `processMessageContent()`; also sanitize at the `MessageBubble` render site (as `ChatWidget.jsx:598` already does); delete/quarantine the dead `ChatProvider.jsx`.

### H3 — Prod config bucket anonymously public-readable — tracked, unowned
`s3://myrecruiter-picasso` (prod 614) grants `s3:GetObject` to `*` with all public-access-block flags false (`docs/roadmap/MYR_PICASSO_BUCKET_PUBLIC_READ.md`, UNTRIAGED since 2026-05-19). Any tenant config or `mappings/{hash}.json` is fetchable with no auth, bypassing every hash-validation control. No S3 access logging/CloudTrail data events → no audit trail. `ListBucket` is not public, so enumeration needs a known `tenant_id`. **Assign an owner;** remediation needs a replacement fetch path (Lambda proxy or CloudFront+OAC+signed URLs) before the public ACL is removed.

### H4 — Prototype pollution (kb_proposal_applier) — confirmed
`kb_proposal_applier/configOps.mjs:30-39` (`setByPath`). A `path` segment of `__proto__` passes the `typeof === 'object'` guard and writes onto `Object.prototype`, polluting every subsequent invocation on the warm container. Reachable via a stored proposal doc (needs S3-prefix write access or a prompt-injection foothold in the upstream scanner LLM that a human then approves). **Fix:** reject `__proto__`/`constructor`/`prototype` path segments in `setByPath`/`getByPath`; add a regression test.

### H5 — Unescaped HTML in transactional emails (BSH) — confirmed
`Bedrock_Streaming_Handler_Staging/form_handler.js:1247-1281, 1360-1436`. The **default** internal-notification HTML path was fixed (F-DSAR25 `escapeHtml`), but the **custom `body_template`** branches build `form_data`/`first_name`/`phone` from raw, unescaped, end-user-controlled form values and interpolate into HTML. A visitor submitting `<a href="https://evil/phish">…</a>` in a form field gets that markup rendered live in the staff notification email (phishing from a trusted internal sender). Same class also present in MFS `form_handler.py:1184-1331` (M-tier). **Fix:** HTML-escape every template var for the HTML render target; add a regression test.

### H6 — Synthetic-monitor prod guard doesn't guard — confirmed
`Scheduling_Synthetic_Monitor/prod-guard.js:63-73`. `assertSafeMode()` only throws when `STAGING_TEST_MODE` is truthy, but the cancel/cleanup/disposition/revocation cycles that create+cancel+delete **real** bookings don't need that flag. `prod-guard.test.js` documents `['production','false'] → no throw`. No validation that `SYNTHETIC_TENANT_ID` is a known test tenant. If ever deployed to / pointed at prod, it silently mutates real calendar + DB state each cycle; only account-boundary discipline (not this code) prevents it. **Fix:** refuse any invocation outside a known-safe env regardless of the flag; hard-allowlist `SYNTHETIC_TENANT_ID`.

### H7 — session_archiver re-creates deleted PII (erasure-defeating) — confirmed
`picasso_session_archiver/lambda_function.py:65-99` archives every DynamoDB Stream `REMOVE` (TTL or not) to `s3://picasso-archive-staging/…`. Both `picasso_pii_dsar_staging` and `picasso_pii_tenant_purge_staging` perform real `DeleteItem` on `picasso-session-summaries`; the archiver fires on those deletes and durably re-writes the "erased" PII to an S3 path neither deletion pipeline cleans (DSAR walks a different key shape; purge has no S3 permissions). `pii-inventory.md:136` wrongly claims coverage. **Fix:** skip archiving when `record.userIdentity.principalId` is a PII-deletion role; update the inventory; add S3 cleanup to purge.

### H8 — Raw phone/message-text logged to CloudWatch (SMS_Webhook_Handler) — confirmed
`SMS_Webhook_Handler/index.mjs:111,127,153,169,187,193,199,204`. Logs full E.164 phone numbers and up to 50 chars of inbound SMS text, directly contradicting the sibling `SMS_Sender`'s stated policy (phone is tier-1 PII, `hashPhone()` provided). Anyone with CloudWatch Logs read (broader than DynamoDB access) harvests opt-in/opt-out phone lists. **Fix:** hash the phone (reuse `SMS_Sender.hashPhone`), drop the text snippet.

---

## Medium findings (grouped)

**Authorization / tenant-scoping**
- **M1** Token blacklist not enforced on the primary `?action=chat` path (only on `?action=conversation`) — a revoked token still works for chat. `Master_Function lambda_function.py:828-859`.
- **M2** Config Manager `DELETE` not gated to `super_admin` (CREATE is) — any `member` on the tenant can delete its live config, no restore endpoint. `Picasso_Config_Manager/index.mjs:578-615`.
- **M3** `tenant_hash` merge-editable and not force-restored from base (unlike `tenant_id`) — cross-tenant overwrite. `mergeStrategy.mjs:41-57,86`.
- **M4** Form-fulfillment `lambda`/`s3` targets from tenant config not allowlisted (webhook path *is*) — malicious config invokes arbitrary Lambda / writes arbitrary bucket with form PII. `form_handler.py:979-1037`.
- **M5** Meta_Response_Processor trusts `tenantId`/`tenantHash`/`pageId` from its invocation event without re-deriving from `pageId` — cross-tenant KB/config exfil if the invoke boundary is ever misconfigured. `Meta_Response_Processor/index.js:652-662`.
- **M6** Tenant-purge invocable by any staging PowerUser (dual-gate is payload-level, not authz) — self-documented deferred risk; land the `Deny` resource policy now. `infra/modules/lambda-pii-tenant-purge-staging`.
- **M7** Employee-existence oracle via unscoped registry `Scan` in `POST /team/invite` — cross-tenant PII-association probe. ADA `lambda_function.py:8577-8583`.
- **M8** Test-send `user_id`→email resolution has no org-membership check. ADA `:8080-8086`.
- **M9** Stranded_Booking_Remediator trusts the caller's `offboarding_time`/`choice` with no registry cross-check; `isStranded()` fails open on missing timestamp. `Stranded_Booking_Remediator/index.js:73-96`.
- **M10** `Analytics_Event_Processor` trusts event-supplied `tenant_id` when present (mitigated only by IAM, not code); dead unauthenticated `api_handler` retained. `:230-237, 295-352`.

**Injection / content hardening**
- **M11** MFS SES notification emails don't `html.escape()` visitor form values (H5's MFS-side sibling); `filter_sensitive_fields` imported but never called. `form_handler.py:1184-1331, 20-25`.
- **M12** `send_email` has no CRLF/header sanitization; `disposition.js:303-310` feeds raw `attendee_name` into subject/body (header-injection). `send_email/lambda_function.py:122-207`.
- **M13** Prompt injection via unsigned `conversation_context.messages` — client-supplied "prior turns" rendered verbatim into the LLM prompt. `Master_Function lambda_function.py:844-853`.
- **M14** Dashboard CSV/formula injection — export functions quote but don't neutralize leading `= + - @`; public form input executes in an analyst's spreadsheet. `analyticsApi.ts:519-631`.
- **M15** `notification_hub` request-supplied `action.url` not scheme-restricted before landing in email/Slack href (needs the shared secret). `notification_hub/index.mjs:84,289`.
- **M16** Widget streaming markdown built by regex before sanitizing; unescaped URL interpolated into `href` — safe only while the narrow `ALLOWED_TAGS` holds. `MessageBubble.jsx:328-456`.

**Replay / rate-limit / availability**
- **M17** Public redemption endpoint (`staging.schedule.myrecruiter.ai`) has no WAF (sibling page-API does) + only 5 reserved concurrent — trivial anonymous DoS of cancel/reschedule links. `infra/modules/scheduling-redemption-domain-staging`.
- **M18** Telnyx SMS webhook verifies signature but has no timestamp/replay window (Stripe has 300s) — a captured valid `message.received` UNSTOP can be replayed to flip consent. `SMS_Webhook_Handler/index.mjs:45-70`.
- **M19** Stripe webhook has no event-id idempotency / out-of-order guard — a redelivered older `subscription.updated` can revert tenant tier/status. `Stripe_Webhook_Handler/index.mjs:339-379`.
- **M20** Calendar Watch listener: in-code replay-window check is a documented no-op and the provisioned `RATE_LIMIT_NOTIFICATIONS_PER_MIN` is never wired in — captured notification replayable to burn Google/AWS quota. `Calendar_Watch_Listener/index.js:137-148`.
- **M21** No WAF/rate-limit on the public dashboard-API or unsubscribe Function URLs.

**PII / compliance**
- **M22** Recap suppression-list read **fails open** (DynamoDB error → "nobody suppressed") — opt-outs get re-emailed (CAN-SPAM). `Attribution_Recap_Generator/lambda_function.py:184-221`.
- **M23** Unsubscribe is GET-triggered with no confirmation — mail-scanner link prefetch (Safe Links/Proofpoint) silently unsubscribes recipients; no `List-Unsubscribe-Post`. `Attribution_Unsubscribe/lambda_function.py:249-258`.
- **M24** Calendar Onboarder/Renewer can leak coordinator email via unsanitized Secrets Manager error text (Offboarder was hardened, siblings weren't). `Calendar_Watch_Renewer/index.js:293,447-453`.
- **M25** Coordinator email travels (base64, not encrypted) in the OAuth state/init token in the callback query string — readable in CloudFront logs/history. `Calendar_OAuth_Connect` (`DEPLOY_NOTES.md:182-187`).
- **M26** Platform OAuth `client_secret` duplicated into every per-coordinator Secrets Manager entry — widens blast radius. `Calendar_OAuth_Connect/secrets.js:111-124`.
- **M27** Test-send email relay fails open if `TEST_SEND_ALLOWED_DOMAINS` unset (prod value unverified); no rate limit — tenant admin can relay arbitrary content from `notify@myrecruiter.ai`. ADA `:8059-8146, 7503-7517`.

**Auth-model / SDLC**
- **M28** Clerk JWT verification omits `iss`/`aud`/`azp` pinning in both `Picasso_Config_Manager/auth.mjs:58-92` and `kb_proposal_applier/auth.mjs:58-92`.
- **M29** `ENFORCE_AUTH=false` (dev flag) disables tenant-scoping too, not just authentication, because the scoping check is nested under `if (auth.success && …)` — fail-open trap. `kb_proposal_applier/index.mjs:72-113`, same shape in Config Manager.
- **M30** Dashboard internal JWT stored in `localStorage` (XSS-exfiltratable) — not exploitable today (no XSS sink in the dashboard) but removes a defense layer; pairs with adding a CSP. `AuthContext.tsx`.
- **M31** Three analytics pipeline Lambdas (`Analytics_Aggregator`, `Analytics_Function`, `Aggregator_Function`) have **never had source committed** — only inside gitignored `deployment.zip`s. No PR review / SAST ever ran; this is *how* C5/C6 shipped. Commit-then-delete or delete outright.

---

## Low / Info (batch)

Widget: `?picasso-env=` lets a visitor re-route a prod embed to staging/dev backend (fixed lookup, not open-redirect); dead `getTenantHashFromURL()` staging guard checks the wrong param (`tenant` vs `t`); three divergent DOMPurify configs; `<img src>` permitted in AI/KB content (tracking-pixel); no CSP on `iframe.html`; bump DOMPurify 3.4.0→3.4.11. • Widget/Meta/Calendar: several `postMessage`/targetOrigin `'*'` fallbacks leak session/analytics data when `document.referrer` is stripped (`iframe-main.jsx:150,231,459`); the iframe origin allowlist is self-referential (derives from `document.referrer`) and enforces nothing for an embed-anywhere widget. • Meta webhook GET verify-token uses `!==` (non-constant-time); postback dedup key uses `Date.now()`; intended 24h staleness check is dead (timestamp never forwarded). • `notification_hub` shared-secret compared with `!==` (non-constant-time). • Calendar: no PKCE (confidential client, mitigated); `markDisconnected` doesn't null the refresh_token; init-token not yet single-use (short TTL). • MFS/misc: in-memory Bedrock cache not tenant-keyed; `redact_pii()` covers only email/phone; `tenant_hash` is a deterministic hash of a guessable ID + committed static salt (public by design — document it); verbose config/PII debug logging in several handlers; generic error text leaked to API callers; Clerk-secret caches lack TTL (rotation won't propagate to warm containers). • Dashboard: `mailto:` parameter injection (`CommunicationsCard.tsx:98-107`); dev-dependency `npm audit` findings (build-only). • SBOM: no `pip-audit`/`npm audit`/Dependabot in CI for the scheduling/analytics/PII Lambdas; vendored unused `jinja2`/`markupsafe` in `deploy_tenant_stack`. • `send_email` SES grant scoped to `identity/*` rather than the one sender identity.

---

## Positive controls (verified, worth protecting from regression)

- **Webhook signature verification is uniformly correct** across all five integrations — Meta (raw-body HMAC-SHA256, `timingSafeEqual`, checked before parse), Stripe (HMAC + 300s replay window, fail-closed), Telnyx (Ed25519, fail-closed on missing key), Google Calendar (SHA-256 channel-token compare, constant-time, gates all dispatch). No signature bypass found anywhere.
- **No JWT algorithm confusion** — every `jwt.decode`/verify pins the algorithm; no `alg=none`/HS-RS path.
- **No DynamoDB expression injection, no insecure deserialization** (`pickle`/`eval`/unsafe `yaml.load`), **no hardcoded secrets** in source (all from Secrets Manager).
- **Form-webhook SSRF defense is real** — DNS-resolves and rejects private/loopback/link-local/IMDS ranges, disables redirects.
- **Scheduling token design is sound** — HS256, `iss`/`purpose`/`exp`, CSPRNG `jti`, constant-time compare, one-time-use conditional PutItem; scheduling DynamoDB keys are correctly tenant-scoped.
- **Dashboard frontend** has zero raw-HTML sinks; the one HTML surface (email-template preview) is correctly `<iframe sandbox="">`-isolated; external links scheme-allowlisted; `X-Tenant-Override` verified to be honored **only** for a signature-verified `super_admin` (not an IDOR).
- **Per-Lambda dedicated IAM roles** everywhere (no shared-role antipattern); PII audit tables carry a resource-policy `Deny` on mutation.
- **BSH prod defense-in-depth** (Function URL `AuthType=AWS_IAM` + `REQUIRE_CF_ORIGIN_HEADER`) confirmed live on prod and staging.

---

## Operator verification checklist (reachability determines live-vs-latent)

1. `aws lambda get-function-url-config --function-name SSO_Token_Generator` — is it reachable? (C2)
2. `aws lambda get-function-url-config` for `deploy_tenant_stack` — AuthType NONE? (C4)
3. Confirm no HTTP trigger / current `lambda:InvokeFunction` grants for `Analytics_Aggregator`, `Analytics_Function`, `Aggregator_Function`, then delete (C5, C6, M31).
4. Confirm `TEST_SEND_ALLOWED_DOMAINS` is set in prod ADA (M27).
5. Confirm the Meta_OAuth_Handler Function URL AuthType (H1).

---

## Recommended fix order

1. **C1** — stop unauthenticated resume-token minting (load-bearing) + tenant-key the tables (depth). **Queued** — coupled client+server change + per-account migration; phased plan in [`docs/roadmap/security/C1_CONVERSATION_HIJACK_REMEDIATION.md`](../roadmap/security/C1_CONVERSATION_HIJACK_REMEDIATION.md). (Note: tenant-keying alone does NOT close it — attacker uses the victim's public tenant hash.)
2. ~~**C3** — tenant filter on the notification-event endpoint + regression test.~~ **✅ FIXED** lambda#372 (2026-07-03): post-query `pk == TENANT#{caller}` guard → 404; cross-tenant + PII-absence regression tests; staging deployed, prod dispatch gated.
3. **C2, C4** — verify reachability (checklist 1–2); if reachable, lock down/decommission immediately.
4. **C5, C6, M31** — verify + delete the dead pipeline Lambdas (don't patch dead code; the invoke grants are the risk).
5. **H2, H4, H5** — widget sanitizer bypass, prototype pollution, templated-email escaping.
6. **H1, H3, H6, H7, H8** — Meta OAuth authz, S3 bucket owner, synthetic-monitor guard, archiver/erasure interaction, SMS PII logging.
7. **Medium batch** — authz gaps (M1–M10), injection hardening (M11–M16), replay/WAF (M17–M21), PII/compliance (M22–M27), auth-model/SDLC (M28–M31).
8. **Low/Info** — hardening/consistency backlog; add a CSP to widget + dashboard, add CI dependency scanning for the Lambdas.

# Scoped Security Remediation — Visitor Reschedule Flow + Inherited Widget Surface

**Date:** 2026-07-08
**Scope:** the visitor-facing reschedule/cancel page (`schedule.myrecruiter.ai/reschedule` → redemption → `chat.myrecruiter.ai/schedule/…` rendered by `SchedulingPage`, `mode=schedule` of the widget iframe app) and the widget client surface it inherits by sharing that bundle.
**Basis:** re-verification of [`docs/audits/SECURITY_REVIEW_2026-07-02.md`](../../audits/SECURITY_REVIEW_2026-07-02.md) against *current* source (every item below re-read at the cited `file:line`), plus reachability tracing specific to the reschedule page. Companion brief for the one Critical: [`C1_CONVERSATION_HIJACK_REMEDIATION.md`](./C1_CONVERSATION_HIJACK_REMEDIATION.md).

> **Why this doc exists:** the reschedule page piggybacks on the chat host and the chat front-end bundle, so it inherits the widget's client-side issues. This list scopes *which* of the standing findings actually reach this flow, with reachability nuance, so remediation effort targets real exposure rather than the raw finding list.

---

## TL;DR

- **The scheduling auth path is sound** — signed one-time expiring tokens (HS256, constant-time compare, atomic one-time-use), short-lived per-tenant/per-booking/per-intent session binding, CORS-locked gateway, coordinator PII withheld until confirm, tightly-scoped IAM. See "Positive controls" — protect these from regression.
- **Highest-leverage in-scope fix: M17** — the public redemption endpoint has no WAF + concurrency 5 → cheap anonymous DoS of *every* reschedule/cancel link. Terraform-only fix.
- **The two scariest widget findings are narrower than they look on this page:** the **C1** hijack's frontend trigger is dead code (backend still curl-able, page-independent), and the **H2** stored-XSS site (`MessageBubble`) is **not** on the reschedule page — `SchedulingPage` sanitizes its own bubbles.
- **The redesign itself (PR #723) is security-neutral** — presentation-only (CSS + JSX structure); no auth/token/gateway/sanitizer code touched. Confirmed.

---

## Priority summary

| # | ID | Sev | Title | Reachable on reschedule page? | Effort |
|---|---|---|---|---|---|
| 1 | M17 | Med (avail) | Redemption endpoint: no WAF + concurrency 5 → DoS of reschedule/cancel links | **Yes** (mints every link) | S–M |
| 2 | SR-6 | Low | `Referrer-Policy` header misspelled `referrer`; absent on 302 success path | Yes (redemption pages) | S |
| 3 | SR-3 | Low | No CSP on `iframe.html` / `schedule/index.html` at any layer (incl. CloudFront) | Yes (both pages) | M |
| 4 | SR-4 | Low | DOMPurify resolved at 3.4.0 (not 3.4.11) | Yes (shared bundle) | S |
| 5 | SR-5 | Low | Divergent sanitizer configs; `<img src>` allowed (tracking-pixel) | Yes (companion chat) | S–M |
| 6 | SR-1 | Low | `postMessage(..., '*')` fallbacks in `iframe-main.jsx` | Partial (low practical risk here) | S |
| 7 | SR-2 | Low | Self-referential iframe origin allowlist | Yes (UI-only blast radius) | M |
| 8 | SR-7 | Info | `?picasso-env=` re-routes iframe backend | Yes in principle (breaks link, no access) | S |
| — | C1 | **Critical** | Cross-tenant conversation hijack (`Master_Function init_session`) | **Backend: yes (page-independent). Frontend trigger: no — dead code** | L |
| — | H2 | High | Stored XSS via unsanitized `dangerouslySetInnerHTML` (`MessageBubble.jsx`) | **No** — different, sanitized render path here | S |

---

## Widget-inherited findings (operator priority — addressed first)

### SR-3 — No CSP anywhere in the chain  *(best ROI of the widget-hardening items)*
- **Evidence:** `Picasso/iframe.html` and `Picasso/public/schedule/index.html` carry no `<meta http-equiv="Content-Security-Policy">`; and the CloudFront layer has none either — `infra/modules/cloudfront-widget-staging/*.tf` has no `response_headers_policy`/CSP. (The only CSP in `infra/modules/` is the redemption Lambda's own inline CSP on its thin confirmation pages — unrelated to the widget/schedule static assets.)
- **Why it matters here:** the reschedule page's actual document and its iframe child ship with zero CSP at any layer — no defense-in-depth against an injected-script class bug (e.g. SR-5).
- **Fix:** add a `Content-Security-Policy` response-headers policy on `cloudfront-widget-staging` (script-src self + known CDN; `frame-ancestors` chosen for embed-anywhere). **Start `Content-Security-Policy-Report-Only`** to avoid breaking third-party embeds, then enforce. One infra change protects the whole widget + reschedule surface. **Effort: M.**

### SR-5 — Divergent sanitizer configs; `<img src>` permitted
- **Evidence:** ≥3 distinct DOMPurify configs with no single source of truth: `Picasso/src/utils/security.js:21-47` (`sanitizeHTML`, broad allowlist incl. `img`/`src`) — **the one the reschedule companion chat uses**; `Picasso/src/components/chat/MessageBubble.jsx:50-63` (narrower, also permits `img`/`src`); `Picasso/src/context/ChatProvider.jsx:459` (in dead code).
- **Reachability:** the reschedule page's companion chat uses `security.js`, which allows `<img src>` with no script — a tracking-pixel-style info leak if a compromised KB/CTA source emits `<img>` into assistant content (no code exec).
- **Fix:** consolidate to one sanitizer module/config (or a small set of named intentional variants); drop `img` from the general chat-content allowlist unless a real use case needs it. **Effort: S–M.**

### SR-4 — DOMPurify not bumped
- **Evidence:** `Picasso/package.json:25` `"dompurify": "^3.0.8"`; lockfile resolves 3.4.0 (target 3.4.11).
- **Fix:** `npm update dompurify` (or pin `^3.4.11`), re-test sanitizer behavior. Pairs naturally with SR-5. **Effort: S.**

### SR-1 — `postMessage(..., '*')` fallbacks
- **Evidence:** `Picasso/src/iframe-main.jsx` — `notifyParentReady()` (~194), health-check response (~503), initial `SIZE_CHANGE` (~764), and `notifyParentEvent()` embedded branch (~275) all compute `targetOrigin = document.referrer ? new URL(document.referrer).origin : '*'`.
- **Reachability / residual risk (low here):** `mode=schedule` runs the same entry, and `notifyParentReady`/health-check/`SIZE_CHANGE` fire unconditionally — but on the reschedule page parent (`schedule/index.html`) and child (`iframe.html`) are **same-origin by construction**, so `document.referrer` is populated and the `'*'` branch rarely fires. The analytics-post branch is not even taken in schedule mode (routed to the local-queue path, `iframe-main.jsx:270-271`). Defense-in-depth gap, not a live leak on this page.
- **Fix:** in schedule/fullpage modes derive `window.location.origin` (same-origin); fail closed (drop) rather than wildcard-broadcast for the embedded-widget case. **Effort: S.**

### SR-2 — Self-referential iframe origin allowlist
- **Evidence:** `iframe-main.jsx:141-177` — `getAllowedOrigins()` appends `document.referrer`'s origin with no allowlist check; hardcoded entries omit `staging.chat`/`chat.myrecruiter.ai`, so on this page the control relies entirely on the referrer echo.
- **Blast radius (assessed):** an attacker iframing `iframe.html?...&mode=schedule` on their own page auto-qualifies via the echo and can send `PICASSO_INIT`/`PICASSO_COMMAND` — but those commands are **UI-only** (`OPEN/CLOSE_CHAT`, `SIZE_CHANGE`, `EDGE_MODE`, `MINIMIZE`). Booking/session data flows via URL query params read directly by `SchedulingPage.jsx` `qp()`, **not** postMessage. No data-exfil/CSRF path found via this on the reschedule page.
- **Fix:** explicit per-env allowlist of permitted parent origins instead of echoing the referrer. (Deferred originally because an embed-anywhere widget lacks a clean registry of legitimate embed domains.) **Effort: M.**

### SR-7 — `?picasso-env=` backend re-route *(info)*
- **Evidence:** `Picasso/src/config/environment.js:115,284` — `picasso-env` URL param overrides env selection at runtime.
- **Impact on this flow:** appending `&picasso-env=staging` to a *prod* reschedule link points the widget at the staging backend — a different account with no matching binding/booking/JWT secret, so propose/mutate 401/404. It **breaks** the link; it does not grant access (fixed lookup target, not an open redirect). **Effort: S** — gate to non-prod builds if addressed.

---

## Redemption → gateway → page findings

### M17 — Redemption endpoint: no WAF + capped concurrency  *(top in-scope priority)*
- **Evidence:** `infra/modules/scheduling-redemption-domain-staging/main.tf:42-43` — comment states WAF is out of scope (tracked in `P22_CLOUDFRONT_WAF_PLAN.md`), no `web_acl_id` attached; `infra/modules/lambda-scheduling-redemption-handler-staging/main.tf:275-280` — `reserved_concurrent_executions = 5` (comment flags the availability cap). Sibling `Scheduling_Page_Api` *does* sit behind a WAF (`infra/modules/lambda-scheduling-page-api-staging/main.tf:240-245,296-308`). `P22_CLOUDFRONT_WAF_PLAN.md` covers `/stream` only — not extended to the redemption domain.
- **Attacker path:** the six redemption slugs (`/cancel`, `/reschedule`, `/resume`, `/attended/*`) are the sole entry that redeems every reschedule/cancel link. ~6 concurrent requests (garbage tokens / slow-drip scan) throttle the concurrency-5 pool and 429 legitimate redemptions — a real customer's email link silently fails during the flood. `Errors`/`Throttles` alarms exist (`main.tf:384-428`) so it's **detected, not prevented**.
- **Fix:** attach a regional WAFv2 web ACL (rate-limit rule) to the redemption CloudFront distribution; consider a modest concurrency bump if legitimate burst (e.g. attendance broadcast) needs headroom. Terraform-only — the exact next step the module comments already point at. **Effort: S–M.**

### SR-6 — `Referrer-Policy` header bug in redemption handler  *(new; cheap, clear-cut)*
- **Evidence:** `Lambdas/lambda/Scheduling_Redemption_Handler/index.js:194-200` (`page()`, used for all 4xx/5xx friendly pages + attendance acks) sets header key `referrer: 'no-referrer'` — **the correct name is `Referrer-Policy`**, so browsers ignore it and the intended suppression is inert. Worse, the success path `redirect()` (`index.js:212-218`, the 302 to `/schedule/index.html`) sets only `location` + `cache-control`, no referrer control at all.
- **Impact (realistic):** these URLs carry the one-time token in the query string. A working `Referrer-Policy: no-referrer` would prevent that token leaking via `Referer` on subsequent navigation. Live exposure is limited today — failure pages have no cross-origin `<a>` (only `mailto:`, which sends no Referer), and modern browsers' default `strict-origin-when-cross-origin` already trims the token on the cross-subdomain 302. Defense-in-depth gap, not a demonstrated leak — but a trivially correct fix.
- **Fix:** rename the header key to `Referrer-Policy` in `page()`, add the same header to `redirect()`. **Effort: S** (one line per function + redeploy).

---

## The two flagged widget "headliners" — reachability corrected

### C1 — Cross-tenant conversation hijack  *(Critical; backend page-independent, frontend trigger is dead code)*
- **Backend still vulnerable, unchanged:** `Lambdas/lambda/Master_Function_Staging/lambda_function.py:1311-1314` — `handle_init_session` mints a valid state JWT for any caller-supplied `(session_id, tenant_hash)` with no ownership proof. Public Function URL → an attacker doesn't need the widget JS; a raw POST with a learned `session_id` + the tenant's public hash hijacks the session. **Page-independent** — reachable for every tenant regardless of this flow.
- **New reachability nuance:** the *frontend* path that calls `init_session` is **dead code** — `ChatProviderOrchestrator.jsx:16-17,52` only renders `Streaming`/`HTTPChatProvider`, never `ChatProvider.jsx` (the sole caller of `conversationManager.js`'s `initializeWithServer`). So the reschedule page's companion chat adds **no new trigger** beyond the always-present public-endpoint exposure.
- **Fix:** per the C1 brief — P1 server compat-open + tenant/`t` cross-check → P2 widget presents stored token → P3 server drops raw-`session_id` resume. **Scope note:** because the frontend caller is dead code, P2 may simplify to *deleting* `ChatProvider.jsx` rather than migrating it — confirm with the C1 owner before scoping P2. **Effort: L** (phased, coupled client+server). Tracked in [`C1_CONVERSATION_HIJACK_REMEDIATION.md`](./C1_CONVERSATION_HIJACK_REMEDIATION.md).

### H2 — Stored XSS in `MessageBubble.jsx`  *(High; NOT reachable on the reschedule page)*
- **Still present in the main widget:** `Picasso/src/components/chat/MessageBubble.jsx:952-954` — `dangerouslySetInnerHTML={{ __html: content }}` with no `DOMPurify.sanitize()` at the site (the "real sanitizer" in `ChatProvider.jsx` is the confirmed-dead path).
- **Not reachable here:** `SchedulingPage.jsx` does not import/render `MessageBubble`, `ShowcaseCard`, or CTA buttons. Its companion-chat bubble is sanitized inline — `SchedulingPage.jsx:349-352` `dangerouslySetInnerHTML={{ __html: sanitizeHTML(m.content) }}`.
- **Fix (for the main widget, out of this page's scope):** route assistant `content` through a sanitizer before render, or sanitize at the `MessageBubble` site the way `SchedulingPage` already does. **Effort: S.**

---

## Positive controls reconfirmed — do NOT regress

- **Token design** (`Lambdas/lambda/shared/scheduling/tokens.js`) — HS256, algorithm pinned, `crypto.timingSafeEqual` constant-time compare, issuer-class separation from chat JWTs, per-purpose expiry + min-lifetime floor, atomic one-time-use via conditional `PutItem attribute_not_exists(jti)`.
- **Session binding** (`shared/scheduling/sessionBinding.js`) — tenant isolation by PK GetItem-miss (unforgeable cross-tenant by construction), TTL enforced in code (not relying on DynamoDB lazy TTL), fail-closed on malformed row.
- **`Scheduling_Page_Api`** — CORS locked to one configured origin (not reflected); binding `intent` cross-checked against the requested mutation; `newSlot` validated (regex + length cap + start<end) before forwarding; missing tenant/binding returns an identical 401 to close a tenant-existence oracle.
- **`Scheduling_Redemption_Handler`** — IAM scoped to exactly its 3 DDB ops + 1 secret (no wildcards), dedicated role, PII-free logging, `redeem()` burns the `jti` only after full validation.
- **`SchedulingPage.jsx` / `schedulingGateway.js`** — no raw-HTML sinks in `SchedulingSlots`/`SchedulingMonthCalendar`; companion-chat content explicitly sanitized at the render site.

---

## Recommended fix order

1. **M17** — attach WAF to the redemption CloudFront distribution (protects every future reschedule/cancel link). *Terraform-only, staging-first.* **S–M**
2. **SR-6** — rename `referrer` → `Referrer-Policy` in the redemption handler + add to the 302. *One-liner, cheap.* **S**
3. **SR-3** — CSP on `cloudfront-widget-staging` (Report-Only → enforce). *Best single ROI for the widget+reschedule surface.* **M**
4. **SR-4 + SR-5** — DOMPurify bump + sanitizer consolidation (do together). **S–M**
5. **C1** — phased per its brief; confirm P2 scope given the dead-code finding. **L** (separate track)
6. **SR-1, SR-2, SR-7** — widget-wide hardening backlog; low reachability/impact here. **S–M**
7. **H2** — main-widget fix (not a reschedule-page blocker). **S**

> Sequencing note: items 1–4 are self-contained and staging-first-deployable independently; C1 (5) is a separate coupled client+server track already owned. None block the shipped redesign (security-neutral).

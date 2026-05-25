# PII Writer-Pair Enumeration (M9.G5 Step 1.5 — F-DSAR21 sub-step)

**Date**: 2026-05-25
**Scope**: per-surface enumeration of Python + Node writers across the 5 prod PII surfaces audited in M9.G5 Step 1.
**Goal**: ensure no future code review of a write path misses a parallel writer in the other language (F-DSAR18 v0.14 pattern was the original trigger).
**Method**: read-only `grep` across `Lambdas/lambda/` source (excludes tests + `.claude/worktrees/` parallel checkouts). Caught both AWS SDK v3 method names (`PutCommand` / `UpdateCommand`) and boto3 (`put_item` / `update_item`).

## Enumeration table

| PII surface | Lambda | Lang | File:line(s) | Env var | Default value | Status |
|---|---|---|---|---|---|---|
| `picasso_form_submissions` | Bedrock_Streaming_Handler | Node | `form_handler.js:39,534-568` | `FORM_SUBMISSIONS_TABLE` | `picasso-form-submissions` (hyphenated; ⚠️ does NOT match prod underscore name) | **Active prod writer** (consumer widget chat-form submission) |
| `picasso_form_submissions` | Master_Function_Staging | Python | `form_handler.py:41,637,1043` | `FORM_SUBMISSIONS_TABLE` | `picasso_form_submissions` (matches prod) | Dormant for widget chat per master plan v0.8 (alternate write path; not actively traversed by current widget flow) |
| `picasso_form_submissions` | Analytics_Dashboard_API | Python | `lambda_function.py:4666,4729,4841` | n/a (update-only) | n/a | Updater, not creator — dashboard backend updates row state (e.g., status transitions); does NOT create rows; not subject to the F-DSAR18-class concern (no new-row schema drift possible from update_item) |
| `picasso_form_submissions` | `backfill_form_submissions.py` | Python | one-shot script | — | — | NOT a deployed Lambda — M4.G2 prod backfill one-shot from 2026-05-24 (PR #188). Excluded from runtime writer-pair concerns. |
| `picasso-notification-sends` | Bedrock_Streaming_Handler | Node | `form_handler.js:757-758` | `NOTIFICATION_SENDS_TABLE` | (no default; relies on env var) | **Active prod writer** (one audit row per recipient, success or failure) |
| `picasso-notification-sends` | Master_Function_Staging | Python | `form_handler.py:798,822` | (via `notification_sends_table` object init) | — | Active alternate path (Python submission flow when invoked) |
| `picasso-notification-sends` | Analytics_Dashboard_API | Python | `lambda_function.py` (update_item) | n/a | n/a | Updater only — not subject to writer-pair concern |
| `picasso-notification-events` | ses_event_handler | Python | `lambda_function.py:21,157,209` | hardcoded `picasso-notification-events` | n/a (constant) | **Active prod writer (sole writer)** — SES bounce/complaint event handler. **Single-writer surface**; no Python+Node pair. |
| `picasso-session-summaries` | Bedrock_Streaming_Handler | Node | `analytics_writer.js:149` | `SESSION_SUMMARIES_TABLE` | (no default; relies on env var) | **Active prod writer** (session summary persist) |
| `picasso-session-summaries` | Master_Function_Staging | Python | `analytics_writer.py:64,224` | `SESSION_SUMMARIES_TABLE` | (unset → ⚠️ documented silent no-op per lines 57-58) | Dormant per master plan v0.8 — env var explicitly unset in prod MFS config so all writes silently no-op. **Silent-no-op pattern is the same shape as F-DSAR24 BSH silent-catch** that M9.G8 hardened (with observability layer). MFS path here remains un-hardened but is gated by deliberate env-var-omission. |
| `picasso-session-summaries` | Analytics_Event_Processor | Python | `lambda_function.py:58,457` | `SESSION_SUMMARIES_TABLE` | `picasso-session-summaries` (matches prod) | **Active prod writer** (analytics events pipeline aggregation) |
| `production-recent-messages` | Master_Function_Staging | Python | `conversation_handler.py:26,638,650,733` | `MESSAGES_TABLE_NAME` | `{ENVIRONMENT}-recent-messages` | **Active prod writer** (consumer widget chat message persistence) |
| `production-recent-messages` | Meta_Response_Processor | Node | `index.js:69,282,296` | `RECENT_MESSAGES_TABLE` | `{ENVIRONMENT}-recent-messages` | **Active prod writer** (Meta DM Q&A pair persistence) |

## Writer-pair classification

| Surface | Dual-writer (Python + Node both active)? |
|---|---|
| `picasso_form_submissions` | ⚠️ Latent — BSH Node is active, MFS Python is dormant. Both default values exist; defaults differ (see "Drift concern 1" below) |
| `picasso-notification-sends` | ⚠️ Yes — BSH Node + MFS Python both write rows in their respective flows |
| `picasso-notification-events` | ❌ Single-writer — ses_event_handler Python only. No pair concern. |
| `picasso-session-summaries` | ⚠️ Yes — BSH Node + Analytics_Event_Processor Python both active. (MFS Python path dormant.) |
| `production-recent-messages` | ⚠️ Yes — MFS Python (widget chat) + Meta_Response_Processor Node (Meta DM). Different surfaces of the same table. |

## Drift concerns surfaced

### Concern 1 — `picasso_form_submissions` default-value mismatch

BSH default is `picasso-form-submissions` (hyphenated, no `-staging` suffix). MFS default is `picasso_form_submissions` (underscored, matches prod). If `FORM_SUBMISSIONS_TABLE` env var is ever missing:

- BSH writes to non-existent table `picasso-form-submissions` → `ResourceNotFoundException` (loud failure; would surface via the F-DSAR24/M9.G8 metric filter shipped in lambda#156)
- MFS writes to actual prod `picasso_form_submissions` → silent cross-environment contamination (no failure; data lands in prod from staging Lambda if env var missing in staging)

**Severity**: low (both Lambdas rely on env var being set in deployment; no observed env var omission). **Recorded as a residual concern, NOT a fix-now.** Trigger to fix: any future env var omission OR any change to defaults in either writer.

### Concern 2 — MFS `analytics_writer.py` silent-no-op on session-summaries

Lines 57-58 + 64-69 document the behavior: if `SESSION_SUMMARIES_TABLE` unset, all writes silently no-op (boto3 rejects `TableName=None` as `ValidationException`; the writer's `_classify_error` swallows it).

This is the same shape as the F-DSAR24 BSH silent-catch pattern that M9.G8 hardened with structured logging + metric filter + alarm. The MFS analytics_writer.py path is currently dormant (env var deliberately unset per master plan v0.8 "active writer = BSH"), so the silent-no-op is by design today. **Recorded as a residual concern, NOT a fix-now.** Trigger to fix: any future re-activation of the MFS analytics_writer.py path OR M2 work that flows through it.

### Concern 3 — `picasso-session-summaries` triple-writer not previously enumerated

Three Lambdas write to this surface (BSH Node + Analytics_Event_Processor Python active; MFS Python dormant). The F-DSAR24 audit of M9.G8 considered only the BSH and MFS pair; the Analytics_Event_Processor path was not in scope. Its writes are EMF event aggregation rows from the analytics events pipeline, not session-summary content — different row shapes coexist in the same table. **Recorded for future audit reference, NOT a fix-now.** Trigger to verify: any future schema change to session-summaries OR any consumer DSAR involving a session subject.

## What this closes

- **M9.G5 Step 1.5 sub-item (writer-pair enumeration)**: ✅ closed via this document.
- **F-DSAR21 scope-expansion item (c) Active-writer audit lesson extension (audit-of-audit row 22)**: ✅ closed — Python+Node parity check from F-DSAR18 v0.14 is now re-executed; results documented above.

## What this does NOT close (still M9.G5 sub-step targets)

- Sprint B placeholder-body anomaly investigation (deployed-code SHA vs source SHA per BSH Lambda)
- Audit-table CloudTrail data-events config
- Prod CT→CW Logs export for UpdateTimeToLive alarming

These remain deferred-with-trigger under M9.G5.

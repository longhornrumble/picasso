# Data Retention Strategy — MyRecruiter / Picasso

**Status:** v0.2 — Draft (internal). Operator-decided 2026-06-02; **ground-truth-corrected 2026-06-02** (tech-lead/architect pass against code + live AWS — see revision note at end).
**Owner:** Chris Miller.
**Scope:** Retention + deletion policy for all PII-bearing surfaces in the current product (nonprofit volunteer / donor / supporter / visitor scope per [`README.md`](./README.md)).
**Advisory basis:** privacy-data-governance-advisor + communications-consent-advisor (this session), grounded against the live D2 inventory / D4 classification + live AWS state (staging acct 525, prod acct 614, verified 2026-06-02).
**Citations:** claims below are tagged `code:file:line` (repo) or `live:<acct>` (read-only AWS, 2026-06-02). Where a surface is hand-managed and absent from IaC, only a `live:` citation exists — that is the point.

> **Advisory, not legal advice.** This document sets internal engineering/product policy. It makes no legal determination. Items that require attorney review are listed in §7. **Publication** of any consumer-facing retention schedule is gated on the open counsel controller/processor question (Q1 / G-I) — see §7.

---

## §1 — Principle: separate layers, separate clocks

Per the PII charter (*"retained only as long as needed"*) and the mainstream AI-chat-product playbook (Anthropic, Intercom, Chatwoot, Ada — see §8), retention is set **per data layer**, not as one blanket window. The layers run on different clocks:

| Layer | What it holds | Retention posture |
|---|---|---|
| **Raw transcript** (operational) | full message `content` (24h buffer) + truncated `content_preview` (90d events) | shortest — operational window only |
| **Pseudonymized summary** (derived) | per-session record keyed by `pii_subject_id`, direct identifiers stripped; counts / outcome / topic / timings | medium — powers analytics for the visible-history window |
| **Aggregate analytics** | counts, trends, top-questions — no subject linkage | longest — not PII |
| **Identity / lead records** | name / email / phone captured via forms | per-purpose (per-form_type) |
| **Consent / suppression** | SMS opt-in proof, opt-out, email unsubscribe | longest — legal floor; protective retention |
| **Provider (LLM) logs** | prompts/completions to the model | provider-controlled (Bedrock: not retained / not trained) |
| **Operational logs** (CloudWatch) | Lambda execution logs incl. `QA_COMPLETE` (redacted Q&A) | transient — 7-day AWS retention; gone after that |
| **Log archive** (S3/Glacier) | weekly export of the chat-path log groups (redacted) | durable — 365d, Glacier-tiered |

**Architectural note — the write-time fan-out (traced 2026-06-02, prod acct 614).** A single conversation turn is fanned out to multiple sinks **by the chat Lambda itself**, not by any downstream pipeline:

1. **DynamoDB (durable system of record):** the handler writes `session-summaries` (via `analytics_writer`) and `session-events` (via the SQS → `Analytics_Event_Processor` path) — TTL-governed; this is what the dashboard reads. **This is the surface the retention policy controls.**
2. **CloudWatch Logs (transient, 7-day AWS retention):** the same turn is emitted as a `QA_COMPLETE` log line (redacted Q&A + IDs + metrics). Gone in 7 days.
3. **S3/Glacier archive (durable, 365-day):** `CloudWatch-Log-Exporter` (weekly EventBridge rule) exports the chat-path log groups to `s3://myrecruiter-cloudwatch-logs` before the 7-day expiry; lifecycle: Standard → STANDARD_IA @30d → **GLACIER_IR @90d** → expire @365d.

So "the CloudWatch data is in DDB" is a **simultaneous dual-write from one source**, not a CloudWatch→DDB transfer. CloudWatch is transient; the two *durable* copies are **DynamoDB (TTL'd)** and the **S3/Glacier log archive (365d, redacted)**. The retention policy must name all three clocks.

**A separate, often-conflated surface — `picasso-archive` (STAGING-ONLY).** Distinct from the Glacier log archive above: `picasso-session-archiver` streams `session-summaries` `OLD_IMAGE` on TTL-delete to `s3://picasso-archive-staging/sessions/`, and `Analytics_Dashboard_API` reads it for date ranges older than `ARCHIVE_TTL_DAYS=90` (code:`Analytics_Dashboard_API/lambda_function.py:83-87,2047-2052`). This is a **dashboard >90-day read-back convenience, not the durable retention layer**, and it **does not exist in prod** (no archiver, no bucket — live:614; doc:`archive-reachability-decision.md:90-110`). The bucket is hand-managed (no IaC definition, no IaC lifecycle).

---

## §2 — Retention schedule (per class)

| Class | Surface(s) | Retention | Disposition |
|---|---|---|---|
| **Raw message buffer** | `production-recent-messages` / `staging-recent-messages` (full message `content`) | **24 hours** — writer sets `expires_at = now + 24h` (code:`conversation_handler.py:44,769`) | hard delete on TTL — **BUT TTL is OFF in both envs today → unbounded** (live:614 DISABLED; see §5 #1) |
| **Raw event records** | `picasso-session-events` (`content_preview`, ≤500 char) | **90 days** (code:`Analytics_Event_Processor/lambda_function.py:412,445`) | hard delete (no archiver stream on this table) |
| **Pseudonymized session summary** | `picasso-session-summaries` (redacted `first_question` + counts/outcome; linkable by `pii_subject_id`) | **90 days in DDB today** (code:`analytics_writer.py:29`). The durable 365-day copy is the redacted **log archive** (below) | DDB hard-deletes at 90d in prod; **in staging the row is archived to `picasso-archive` on expiry** and read back by the dashboard for >90d. A 12-month *queryable* window is an **OPEN decision** (§9) |
| **Summary cold tier (STAGING-ONLY)** | `s3://picasso-archive-staging/sessions/` (session-summaries `OLD_IMAGE`) | follows the hand-managed bucket lifecycle (no IaC) | dashboard reads it for ranges older than `ARCHIVE_TTL_DAYS=90`; **prod has no archiver/bucket** (live:614) |
| **Form / lead records** | `picasso_form_submissions` (main row) | **365 days (uniform)** — operator decision 2026-06-02 (supersedes the F-DSAR23 per-form_type matrix) | hard delete; writer sets 365d (code:`form_handler.py:670` / `form_handler.js:602`) |
| **Aggregate analytics** | dashboard metric rollups (no subject linkage) | retained | n/a — not PII |
| **Notifications** | `picasso-notification-sends`, `picasso-notification-events` (recipient email; SES bounce/complaint events) | **90 days** (code:`form_handler.py:826,850`; `ses_event_handler:190`; live:614 ENABLED) | delete on TTL (already enabled). *A durable suppression-reason store is aspirational — no such path exists today* |
| **SMS consent (opt-in)** | `picasso-sms-consent` | **retain (4–5 year floor)** — currently no TTL (live:614 DISABLED); make the retention **deliberate** | retain; integrity-protected. STOP rows **never expire** (exempt from deletion) |
| **Email suppression** | SES account-level suppression list | **never expires** | protective retention; exempt from deletion |
| **SMS rate-limit counters** | `picasso-sms-usage-staging` (no prod table yet — code:`picasso-form-tables/main.tf:57`) | **30 days** | delete (currently no TTL — fix, §5 #4) |
| **Pseudonymization key** | `picasso-pii-subject-index-staging` (`normalized_email` → `pii_subject_id`) | **retained while any pseudonymized layer exists** — no TTL **by design** (code:`ddb-pii-subject-index-staging/main.tf:31-33`) | the DSAR resolution + re-identification key; protect as Tier-3 key material; purged per-subject by the delete pipeline, not by housekeeping |
| **Audit** | `picasso-pii-dsar-audit`, audit tables | per audit policy (`retention_expires_at`, append-only) | existing carve-out |
| **Operational logs** | CloudWatch (MFS / BSH / analytics Lambdas; `QA_COMPLETE` redacted Q&A — code:`lambda_function.py:1040`) | **7 days** prod (live:614), **14 days** staging (code:`infra/main.tf:438`) | auto-delete; align staging → 7d + redaction-at-source |
| **Log archive (S3/Glacier) — the durable long-term layer** | `s3://myrecruiter-cloudwatch-logs` (weekly `CloudWatch-Log-Exporter`, `cron(0 2 ? * MON *)`) | **365 days**: STANDARD_IA@30d → GLACIER_IR@90d → expire@365d (live:614) | **already correctly shaped** — leave as-is. Holds *redacted* Q&A past the DDB 90d; the per-subject DSAR walker does NOT reach it (§4) |
| **Orphaned analytics lake** | `s3://picasso-analytics/analytics/` (raw NDJSON, no reader) | **REMOVE** — operator decision 2026-06-02. Prod: **no lifecycle → unbounded** (live:614 `NoSuchLifecycleConfiguration`); staging: 30d lifecycle | stop the redundant write (code:`Analytics_Event_Processor:335`) + purge existing data (zero consumer; redundant with DDB) — see §5 |

### Why this shape

- **Full raw content shortest (24h), preview 90d:** the full message `content` lives only in the 24-hour `recent-messages` buffer; after that the only retained chat text is the truncated `content_preview` (90d) and the redacted `first_question`. Recruiters read recent conversations in full; past 90 days the dashboard's value is metrics, not verbatim readback. Aligns with the privacy advisor's minimization position and the vulnerable-population context (foster / family / crisis content).
- **Pseudonymized summary:** the dashboard's actual product (Top Questions, trends, heatmap, counts, response times) is computed from summary fields, not raw bodies — so a **pseudonymized** summary keyed by the existing `pii_subject_id` primitive preserves the analytics experience while the raw text is already gone. (Pseudonymized, not de-identified: the `pii_subject_id` is reversible via the subject-index, so the summary remains personal data and DSAR-scoped.) This is the two-layer "operational vs derived" pattern used by Anthropic et al. (§8). **How long that summary stays queryable is the OPEN 12-month decision (§9)** — the redacted 365-day record already exists in the Glacier log archive.
- **Consent longest, content shortest:** consent proof is the affirmative defense (keep it); message content is liability surface (minimize it). The current state had this *inverted by accident* (consent had no TTL by default, not by policy).

---

## §3 — Churn & customer offboarding

When a tenant (nonprofit) churns:

1. **Grace period: 30 days** for export / reactivation. (Operator-decided 2026-06-02.)
2. **Then cascade-purge** the tenant's data across all surfaces (conversations, summaries, forms, notifications, analytics, the `picasso-archive` prefixes). **Caveat:** the Glacier log archive (`myrecruiter-cloudwatch-logs`) is partitioned by **log group, not tenant** — per-tenant purge there is a *build*, not a prefix delete; realistic disposition is age-out at 365d (matches §4). The per-tenant purge job is the one genuine build (§9).
3. **Carve-outs that survive churn:** SMS **consent/opt-out proof** (to the 4–5yr floor) and **audit** records (append-only policy), with documented rationale. Everything else conversational is deleted.

**Compliance hook:** if MyRecruiter is determined a **processor** (open counsel Q1 / G-I), purge-on-instruction at contract-end is a **contractual obligation** (GDPR Art 28 / CCPA service-provider terms), not just hygiene.

---

## §4 — Deletion mechanics & data-subject rights

| Capability | Status |
|---|---|
| **Per-individual deletion** (cascade across chats / SMS / forms / events for one subject) | ✅ **Built** — the DSAR Lambda (`picasso-pii-dsar-staging`); this is the Ada per-identity benchmark |
| **Per-tenant bulk purge** (delete a whole churned workspace across all surfaces + S3) | ❌ **Gap** — DSAR Lambda is per-*subject*, not per-*tenant*; a tenant-offboarding purge job is a named follow-on (§9). Also the eventual consumer of the scheduling project's offboarding trigger. |
| **Defined deletion window** (primary immediately; backups age out on cycle) | target **≤30 days** (market-standard; matches Anthropic backend-purge window) |

**Coverage gap surfaced by the 2026-06-02 trace:** the per-subject DSAR walker reaches the DDB tables + the `picasso-archive` bucket, but **not** the `myrecruiter-cloudwatch-logs` S3/Glacier archive (redacted `QA_COMPLETE` Q&A keyed by `session_id`). Lower-risk (email/phone already redacted) but named: a subject deletion does not currently purge that archive, and it persists 365 days past the DDB 90d. Disposition options — (a) accept (redacted, 365d-bounded, ages out), (b) add the archive prefix to the DSAR/purge walk, (c) shorten its lifecycle. Recommend (a) with a documented note; revisit if the log redaction is ever found incomplete.

**Deletion vs the consent floor (counsel-gated):** a "delete my data" request conflicts with the SMS-consent retention floor. Standard resolution — consent / opt-out / suppression records are **exempt from deletion** (you must retain proof you had consent and proof they said STOP). "Delete everything" means *delete the conversational PII; retain the minimal suppression/consent proof.* This tension needs counsel sign-off (§7).

---

## §5 — Live defects folded in (fix as named follow-ons)

These are *current* anti-minimization gaps surfaced during the M9 audit + this strategy work, confirmed against live AWS 2026-06-02:

1. **recent-messages TTL OFF → full message `content` is unbounded in BOTH envs.** `production-recent-messages` = TTL `DISABLED` (live:614); `staging-recent-messages` has no `ttl{}` block (code:`infra/modules/ddb-recent-messages-staging/main.tf`). The writer already sets `expires_at = now + 24h` (code:`conversation_handler.py:44,769`) — it's a **24-hour** buffer, not a 90-day store. Fix: **enable TTL on `expires_at`** (staging IaC `ttl{}` block; prod via console — hand-managed). Enabling auto-purges the backlog (existing rows' `expires_at` are already in the past); a backfill is only needed for any legacy rows lacking the attribute. **Highest-priority defect** (full raw content, both envs). Routed to **M4**.
2. **Prod `picasso-analytics` lake has no lifecycle → unbounded.** `get-bucket-lifecycle-configuration` returns `NoSuchLifecycleConfiguration` (live:614); holds `content_preview`; not in the DSAR walk; **zero reader**. Staging twin has a 30d lifecycle (code:`analytics-events-pipeline-staging/main.tf:255-267`). Fix per the orphaned-lake decision (stop the write + purge). Routed to **M1 (walker) + ops**.
3. **`picasso-sms-consent` TTL OFF** (live:614 DISABLED). For consent this is the *desired* direction (policy = 4–5yr retention) — the fix is to make it **deliberate** (documented), not to add a short TTL; STOP rows never expire.
4. **`picasso-sms-usage` no TTL** → rate-limit counters indefinite. Staging table only (no prod table — code:`picasso-form-tables/main.tf:57`). Fix: 30-day TTL.
5. **CloudWatch staging retention 14d vs prod 7d** (code:`infra/main.tf:438`; prod live:614 = 7d) → align staging to 7d. *Robustness note:* prod retention (7d) == export cadence (weekly) leaves **zero margin** — a single missed/late weekly export loses a week of logs permanently; consider 8–10d retention or a more frequent export.

**Orphaned analytics lake decision — RESOLVED: REMOVE (operator, 2026-06-02).** Established **zero consumer** (verified 2026-06-02, prod acct 614): no aggregator Lambda deployed; **Athena never queried** (empty query history); **no Glue table or crawler** over the bucket; **no S3 event notifications**; the dashboard reads DDB, not the lake; and the data is a duplicate of `session-events` (which is the used store). Orphaned **and** not useful. **Action:** (1) remove the redundant `put_object` / `write_events_to_s3` in `Analytics_Event_Processor` (the DDB write already covers everything used) — staging-soak → prod; (2) purge the existing `analytics/` prefix in prod (`picasso-analytics`) + staging (`picasso-analytics-staging`) — deliberate prod-data deletion, operator-gated; removes accumulated raw user text that is not in the DSAR walk.

---

## §6 — Operator decisions (RESOLVED 2026-06-02)

1. **Form/lead retention tail:** ✅ **365 days (uniform).** Supersedes the F-DSAR23 per-form_type minimization matrix; chosen for relationship value (leads outlive a single conversation). Writer already sets 365d on the main submission row.
2. **Orphaned analytics lake:** ✅ **REMOVE** — stop the write + purge existing data. Established zero consumer (§5).

---

## §7 — Counsel-gated items (attorney review before treating as final)

1. **Who publishes** the consumer-facing retention schedule — depends on **Q1 / G-I** (controller vs processor, already in counsel queue). Internal schedule (this doc): write now. **Published** schedule (CPRA §1798.100(a)(3) per-category disclosure): gated on Q1.
2. **SMS consent floor** mapping to message type (transactional vs marketing consent standards; state mini-TCPA overlays). Set 4–5yr conservative national floor now; counsel-confirm.
3. **Consent/suppression exemption from deletion** (§4) — the consent-vs-DSAR tension.
4. **Vulnerable-population overlay** (foster / minors / crisis — Austin Angels, Foster Village): any retention horizon on these tenants is a counsel decision, not an engineering default.
5. **Donor-class disclosure** at point of collection (counsel S5).
6. **"De-identified" / pseudonymized claim** — CPRA's deidentification standard + no-reidentification commitment is a legal characterization; counsel confirms the technical severance (raw→summary, subject-join handling) meets it before relying on it to retain the summary layer 12 months.

---

## §8 — Market benchmarks (defensibility)

The schedule above sits squarely within mainstream AI-chat-product practice:

- **Two-layer separation (operational raw vs de-identified derived):** Anthropic — full transcripts during the product window, de-identified content only in the long-term layer; deleted chats purged from backend within ~30 days.
- **Plan-based conversation retention 30d → 1–2yr:** Chatwoot (30d / 6mo / 1yr / 2yr by tier). A 12-month summary window (if adopted — OPEN, §9) would match the "business" tier.
- **Per-identity deletion API:** Ada Data Compliance API — our DSAR Lambda is the equivalent.
- **No PII to LLM vendor / no training:** Intercom contractually; we get this via Bedrock posture (verify invocation logging OFF).
- **Selective redaction:** Intercom regex redaction at ingest — low-priority for us (structured PII is captured in forms; chat free-text rarely carries card numbers); our `redact_pii()` on the summary `first_question` is the right amount.

Plan-tiered retention as a **pricing lever** (Chatwoot model) is a viable *business* decision but is intentionally **out of scope** for this privacy strategy.

---

## §9 — Implementation backlog (the piping is already built)

**Key framing:** the durable infrastructure — the write-time fan-out, the DDB tables with TTL already enabled, the S3 export + Glacier-tiered archive, the per-subject DSAR cascade, the `pii_subject_id` deletion key — **already exists.** This strategy is overwhelmingly **config knobs** (TTL day-values, lifecycle rules, log retention) + a **few small writer edits** (shape). Only one item is net-new. Effort legend: 🔧 knob (config/IaC) · ✏️ small writer/doc edit · 🏗️ genuine build · 🔎 read-only verify · ✅ already correct.

| Item | Change | Effort | Routes to |
|---|---|---|---|
| `session-events` 90d | already 90d TTL | ✅ none | — |
| **`recent-messages` TTL (24h)** | enable TTL on the existing `expires_at` — staging IaC `ttl{}` block + prod console; backfill only any legacy rows lacking the attr (**NOT** 90d; **NOT** a full backfill) | 🔧 | M4 · **WS-A** |
| **Summary 12-month window** | **OPEN decision** — the durable 365d copy already exists (Glacier, redacted). If "12 months" = *queryable in dashboard*, move `analytics_writer.TTL_DAYS` **and** `Analytics_Dashboard_API.ARCHIVE_TTL_DAYS` 90→365 **together** (coupled; mismatch = DDB+archive double-read; prod has no archive). Else already satisfied. Pairs with building the session-summaries DSAR walker (F-DSAR31) | 🔧×2 / decision | M9 (**OPEN**) |
| Pseudonymized-summary shape | `pii_subject_id` linkage + `first_question` redaction already present (code:`analytics_writer.py:177`) — **already there** | ✅ ~none | M9 |
| Form/lead 365d uniform | main row already 365d. The 90d "sub-rows" are **notification-sends** audit rows (staff recipient — a different class) — **resolved, no forms change** | ✅ none | — |
| `sms-usage` 30d TTL | enable TTL (staging table; prod table doesn't exist yet) | 🔧 | M9 · **WS-A** |
| `sms-consent` retention | make the no-expiry **deliberate** (policy 4–5yr; STOP never expires) — doc, not code | ✏️ doc | M9/comms |
| Subject-index table | keep unbounded **by design** (DSAR key); documented as Tier-3 key material | ✏️ doc | M9 |
| CloudWatch staging → 7d | `infra/main.tf:438` 14→7 | 🔧 | M9 · **WS-A** |
| **Remove** orphaned lake | drop `write_events_to_s3` (code:`Analytics_Event_Processor:335`; DDB already covers it) **+ purge** prod + staging `analytics/` | ✏️ **WS-B** + ops (prod purge, **gated**) | M1 + ops |
| CW-logs S3/Glacier archive | already IA@30 → Glacier@90 → expire@365 | ✅ none | — |
| Bedrock invocation-logging | ✅ verified OFF in both accts (2026-05-23, re-confirmed 2026-06-02) — not a retention surface | ✅ done | `bedrock-invocation-logging-decision.md` |
| **Per-tenant offboarding purge** (30d churn → cascade) | net-new cascade across all surfaces incl. `picasso-archive` + the Glacier archive (latter **not tenant-partitioned** = hard) — the only genuine build; shared with the scheduling offboarding trigger | 🏗️ **build** | new capability |

---

## §10 — Relation to the PII program

- Closes the strategy guide's **"retention strategy (Immediate)"** target and extends the **M9 TTL-hygiene** closure (2026-06-02) from audit-of-current-state to a forward policy.
- Does **not** create a new milestone — build items route to existing M1 / M4 / M9 per §9 (per the §3 gap-routing discipline in [`MASTER_PROJECT_PLAN.md`](./MASTER_PROJECT_PLAN.md)).
- Any implementing PR that changes a TTL / lifecycle / PII shape MUST update [`pii-inventory.md`](./pii-inventory.md) per the Living-Inventory Rule.
- Publication of consumer-facing windows is part of the **M8** privacy-notice workstream, gated on counsel Q1.

---

## §11 — Revision note (v0.1 → v0.2, 2026-06-02)

v0.2 is a **ground-truth correction** of v0.1 after a tech-lead/architect pass against the actual code + live AWS (staging 525 + prod 614). v0.1's direction held; these load-bearing facts were corrected:

1. **`recent-messages` is a 24-hour buffer, not a 90-day raw store** — and its TTL is OFF in **both** envs (prod `production-recent-messages` DISABLED), so full message content is unbounded today. Fix = *enable* TTL on the existing `expires_at`, not "90d + backfill."
2. **The durable long-term layer is the CloudWatch → `myrecruiter-cloudwatch-logs` → Glacier (365d, redacted) path**, live-verified — not a long DDB TTL. The "12-month summary" is reframed as an **OPEN decision** coupled to `ARCHIVE_TTL_DAYS` + the archiver + a prod gap (prod has no archive at all).
3. **`picasso-archive` (the dashboard's >90d read-back) is a separate, staging-only surface** — added to §1/§2; distinct from the Glacier log archive.
4. **Forms "365d uniform" holds** — the 90d "sub-rows" are notification-sends staff-recipient rows (a different class), not a forms violation.
5. **Deleted the phantom "SMS body store"** (no such table) and **added the `pii-subject-index`** row (deliberately unbounded de-pseudonymization key).
6. Every §2/§5/§9 claim is now tagged `code:` or `live:`.

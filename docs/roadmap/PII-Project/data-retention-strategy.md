# Data Retention Strategy — MyRecruiter / Picasso

**Status:** v0.1 — Draft (internal). Operator-decided 2026-06-02.
**Owner:** Chris Miller.
**Scope:** Retention + deletion policy for all PII-bearing surfaces in the current product (nonprofit volunteer / donor / supporter / visitor scope per [`README.md`](./README.md)).
**Advisory basis:** privacy-data-governance-advisor + communications-consent-advisor (this session), grounded against the live D2 inventory / D4 classification + live AWS state (staging acct 525, prod acct 614, verified 2026-06-02).

> **Advisory, not legal advice.** This document sets internal engineering/product policy. It makes no legal determination. Items that require attorney review are listed in §7. **Publication** of any consumer-facing retention schedule is gated on the open counsel controller/processor question (Q1 / G-I) — see §7.

---

## §1 — Principle: separate layers, separate clocks

Per the PII charter (*"retained only as long as needed"*) and the mainstream AI-chat-product playbook (Anthropic, Intercom, Chatwoot, Ada — see §8), retention is set **per data layer**, not as one blanket window. The layers run on different clocks:

| Layer | What it holds | Retention posture |
|---|---|---|
| **Raw transcript** (operational) | full chat text incl. anything a visitor typed (`content_preview`) | shortest — operational window only |
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

---

## §2 — Retention schedule (per class)

| Class | Surface(s) | Retention | Disposition |
|---|---|---|---|
| **Raw transcripts** | `picasso-session-events` (`content_preview`), `staging-recent-messages` | **90 days** | hard delete (no cold tier) |
| **Pseudonymized session summary** | `picasso-session-summaries` (keyed by `pii_subject_id`; `first_question` redacted; counts / outcome / topic / timings) | **12 months** | hard delete; **powers dashboard metrics for the full 12-month window** |
| **Form / lead records** | `picasso-form-submissions` | **365 days (uniform)** — operator decision 2026-06-02 (relationship value; supersedes the F-DSAR23 per-form_type minimization matrix) | hard delete; writer already sets 365d on the main submission row |
| **Aggregate analytics** | dashboard metric rollups (no subject linkage) | retained | n/a — not PII |
| **Notifications** | `picasso-notification-sends`, `picasso-notification-events` | **90 days** | delete; copy suppression *reason* to durable store before TTL |
| **SMS consent (opt-in)** | `picasso-sms-consent` | **last-activity + 4–5 years** (deliberate floor) | retain to floor; integrity-protected |
| **SMS opt-out / email suppression** | `picasso-sms-consent` (STOP rows) + SES suppression | **never expires** | protective retention; **exempt from deletion** |
| **SMS message content** | (SMS body store) | **90 days** | delete; carriers hold their own records |
| **SMS rate-limit counters** | `picasso-sms-usage` | **30 days** | delete (currently no TTL — fix) |
| **Audit** | `picasso-audit`, `picasso-pii-dsar-audit` | per audit policy (`retention_expires_at`, append-only) | existing carve-out |
| **Operational logs** | CloudWatch (MFS / BSH / analytics Lambdas) | **7 days** (AWS retention) + redaction-at-source | auto-delete; *current staging = 14–30d — align to prod's 7d* |
| **Log archive (S3/Glacier)** | `s3://myrecruiter-cloudwatch-logs` (weekly export by `CloudWatch-Log-Exporter`) | **365 days**, IA@30d → Glacier-IR@90d → expire | **already correctly shaped** — leave as-is; named here so churn-purge + DSAR account for it (redacted Q&A persists here past the DDB 90d) |
| **Orphaned analytics lake** | `s3://picasso-analytics/analytics/` (raw NDJSON, no reader) | **REMOVE** — operator decision 2026-06-02 | stop the redundant write + purge existing data (zero consumer; redundant with DDB) — see §5 |

### Why this shape

- **Raw 90d → delete:** recruiters read recent conversations in full; past 90 days the dashboard's value is metrics, not verbatim readback, so raw Tier-3 text has no continuing purpose. Aligns with the privacy advisor's minimization position and the vulnerable-population context (foster / family / crisis content).
- **Pseudonymized summary 12mo:** the dashboard's actual product (Top Questions, trends, heatmap, counts, response times) is computed from summary fields, not raw bodies — so a de-identified summary keyed by the existing `pii_subject_id` primitive preserves the entire 12-month analytics experience while the raw text is already gone. This is the two-layer "operational vs derived" pattern used by Anthropic et al. (§8).
- **Consent longest, content shortest:** consent proof is the affirmative defense (keep it); message content is liability surface (minimize it). The current state had this *inverted by accident* (consent had no TTL by default, not by policy).

---

## §3 — Churn & customer offboarding

When a tenant (nonprofit) churns:

1. **Grace period: 30 days** for export / reactivation. (Operator-decided 2026-06-02.)
2. **Then cascade-purge** the tenant's data across all surfaces (conversations, summaries, forms, SMS content, notifications, analytics, the S3 archive/lake prefixes).
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

1. **`staging-recent-messages` TTL DISABLED** → raw transcripts never expire. Fix: add `ttl{attribute_name="expires_at"}` to `ddb-recent-messages-staging` (writer already populates `expires_at`); set to the 90-day raw-transcript target; one-time backfill of existing rows (mirror M4.G2 pattern). Routed to **M4**.
2. **Prod `picasso-analytics` lake has no lifecycle** → raw `content_preview` accumulates forever AND is not in the DSAR walk. Fix per §5/orphaned-lake decision (stop writing, or apply a 30-day lifecycle to the prod bucket). Routed to **M1 (walker) + ops**.
3. **`picasso-sms-consent` TTL DISABLED** → consent records indefinite *by accident*. Fix: deliberate 4–5yr last-activity floor; opt-out rows never expire.
4. **`picasso-sms-usage` TTL DISABLED** → rate-limit counters indefinite. Fix: 30-day TTL.
5. **CloudWatch retention 14–30d (staging) vs 7d policy** → tighten to 7d.

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
- **Plan-based conversation retention 30d → 1–2yr:** Chatwoot (30d / 6mo / 1yr / 2yr by tier). Our 12-month summary window matches the "business" tier.
- **Per-identity deletion API:** Ada Data Compliance API — our DSAR Lambda is the equivalent.
- **No PII to LLM vendor / no training:** Intercom contractually; we get this via Bedrock posture (verify invocation logging OFF).
- **Selective redaction:** Intercom regex redaction at ingest — low-priority for us (structured PII is captured in forms; chat free-text rarely carries card numbers); our `redact_pii()` on the summary `first_question` is the right amount.

Plan-tiered retention as a **pricing lever** (Chatwoot model) is a viable *business* decision but is intentionally **out of scope** for this privacy strategy.

---

## §9 — Implementation backlog (the piping is already built)

**Key framing:** the durable infrastructure — the write-time fan-out, the DDB tables with TTL already enabled, the S3 export + Glacier-tiered archive, the per-subject DSAR cascade, the `pii_subject_id` deletion key — **already exists.** This strategy is overwhelmingly **config knobs** (TTL day-values, lifecycle rules, log retention) + a **few small writer edits** (shape). Only one item is net-new. Effort legend: 🔧 knob (config/IaC) · ✏️ small writer edit · 🏗️ genuine build · ✅ already correct.

| Item | Change | Effort | Routes to |
|---|---|---|---|
| Raw transcripts 90d (`session-events`) | already 90d TTL | ✅ none | — |
| `recent-messages` 90d | add `ttl{attribute_name="expires_at"}` IaC block (writer already sets it) + 1× backfill of existing rows (mirror M4.G2) | 🔧 + script | M4 |
| Summary → **12 months** | change the `analytics_writer` TTL constant to 365d (table TTL already on) | 🔧 (1 constant) | M4/M9 |
| Pseudonymized-summary shape | confirm `pii_subject_id` linkage for deletion; `first_question` already redacted, counts/outcome already present — **mostly already there** | ✏️ tiny | M9 |
| Form/lead **365d uniform** | writer already sets 365d on the main submission row — verify the 90d sub-rows (`form_handler.py:826/850`) aren't lead PII | ✅ ~none | M4 |
| SMS consent 4–5yr + opt-out never-expire; `sms-usage` 30d | enable TTL on both tables; writer sets `last_activity+5y` (STOP rows: no TTL); usage 30d | 🔧 + writer | M9/comms |
| **Remove** orphaned analytics lake | remove `put_object`/`write_events_to_s3` in `Analytics_Event_Processor` (DDB write already covers it) **+ purge** existing `analytics/` prefix in prod + staging | ✏️ + ops (prod-data deletion) | M1 + ops |
| CloudWatch → 7d (staging) | set log-group retention 7d (prod already 7d) + redaction-at-source | 🔧 | M9 |
| CW-logs S3/Glacier archive | already IA@30 → Glacier@90 → expire@365 | ✅ none | — |
| Bedrock invocation-logging | verify OFF (read-only check) | 🔧 | `bedrock-invocation-logging-decision.md` |
| **Per-tenant offboarding purge** (+ 30d churn trigger; must also reach the S3/Glacier archive) | net-new cascade across all tenant surfaces — the only genuine build; shared with the scheduling offboarding trigger | 🏗️ **build** | new capability |

---

## §10 — Relation to the PII program

- Closes the strategy guide's **"retention strategy (Immediate)"** target and extends the **M9 TTL-hygiene** closure (2026-06-02) from audit-of-current-state to a forward policy.
- Does **not** create a new milestone — build items route to existing M1 / M4 / M9 per §9 (per the §3 gap-routing discipline in [`MASTER_PROJECT_PLAN.md`](./MASTER_PROJECT_PLAN.md)).
- Any implementing PR that changes a TTL / lifecycle / PII shape MUST update [`pii-inventory.md`](./pii-inventory.md) per the Living-Inventory Rule.
- Publication of consumer-facing windows is part of the **M8** privacy-notice workstream, gated on counsel Q1.

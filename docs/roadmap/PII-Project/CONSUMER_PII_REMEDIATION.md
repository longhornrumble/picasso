# Consumer PII Handling Remediation

## Status

- **Project state:** Active — **started 2026-05-18** (owner assigned; previously Initiation 2026-04-27, unowned for 21 days).
- **Owner:** Chris — end-to-end ownership.
- **Priority:** High. Regulatory exposure exists today.
- **Timeline target:**
  - **Path B (F0-minimal — gates scheduling Austin v1 prod flip):** identity-driven hard-delete across the full identity graph (`picasso-form-submissions` + `picasso-notification-sends`/`-events` + `picasso-sms-usage` + scheduling's `Booking` + the written Google Calendar event) **plus** the now-items (corrected FTC §5 widget claim, manual DSAR path, CloudWatch retention). **Operational no later than 2026-05-25** (≤7 days from start). Satisfies scheduling F0 — see [`scheduling/docs/launch_blocker_remediation_2026-05-18.md`](../../scheduling/docs/launch_blocker_remediation_2026-05-18.md) → N2.
  - **Path A (full pipeline — gates tenant #2 / Atlanta):** the 5-phase scope below (stable identifier → delete backbone → retention TTLs → DSAR workflow → audit). Original 4–6-week estimate stands; continuing track after Path B, audited before tenant #2 onboards.
- **Surfaced from:** Scheduling project design discussions ([`scheduling/docs/design_discussion.md`](../../scheduling/docs/design_discussion.md)). Scheduling does not own this remediation; this is platform-level work scheduling depends on indirectly.

## Purpose of this document

This document seeds a dedicated remediation project. It captures the audit findings on Picasso's current consumer-PII deletion capability, the regulatory framing, and the scope of remediation needed. The agent or engineer who picks up the project should read this as background, then plan implementation against the gap analysis below.

The primary regulatory drivers are:

- **FTC §5** — deceptive practices (the "delete my data" button currently makes promises the code does not keep).
- **GDPR / UK GDPR** — right to erasure for any EU/UK user.
- **CCPA / CPRA + state privacy laws** (Virginia, Colorado, Connecticut, Utah, Texas, Montana, etc.) — right to deletion, access, correction, opt-out.
- **State breach notification laws** — PII held without a deletion path amplifies breach exposure.
- **TCPA / CAN-SPAM / COPPA** — separate retention rules apply (carve-outs documented below).

MyRecruiter does **not** handle PHI and is not in HIPAA scope (the platform is a pre-volunteer/pre-employee recruitment tool; volunteer assignment to patients lives in the customer's own workforce-management software). HIPAA-specific remediation work is **not** in scope for this project. Build to BAA-compatible AWS services (already the norm: Lambda, DynamoDB, S3, SES, SNS, Bedrock are HIPAA-eligible) so non-BAA dependencies don't accidentally enter the stack, but no HIPAA technical safeguards are required.

---

## Path A Re-baseline & Charter (2026-05-18) — authoritative

> This section re-baselines the project against **verified current code/infra** and records
> the **ratified governance decision** and **locked design decisions** for **Path A** (the
> full platform pipeline; gates tenant #2 / Atlanta). The 2026-04-27 narrative below
> ("Scope clarification" → "Cross-references") is **retained as original analysis** — much
> of it (regulatory framing, identity-bearing-conversation scoping, defensive design) is
> evergreen — but **where it conflicts with this section, this section governs.** Path B
> (gates scheduling Austin v1) and the "Short-term mitigation / now-items" are owned by the
> **parallel scheduling session**, not Path A — see the Status block and the Coordination
> seam below.

### Verified current state (vs. the 2026-04-27 body — that body is materially stale)

| 2026-04-27 claim (below) | Verified 2026-05-18 |
|---|---|
| `state_clear_handler.py` exists as dead code to wire up | **Gone.** Not at `Lambdas/lambda/Master_Function_Staging/`. The Phase-2 "wire up the existing handler" premise is **invalid** — the delete service is **greenfield**. |
| `picasso-notification-sends` never deleted | **90-day TTL written** ([form_handler.py:796](../../Lambdas/lambda/Master_Function_Staging/form_handler.py#L796), [:820](../../Lambdas/lambda/Master_Function_Staging/form_handler.py#L820)). |
| `picasso-form-submissions` has no TTL infra | Table TTL **enabled in IaC** ([ddb-form-submissions-staging/main.tf:80](../../infra/modules/ddb-form-submissions-staging/main.tf#L80)) on attr `ttl`. |
| …form submissions persist forever | **Still true in effect** — [`_store_submission`](../../Lambdas/lambda/Master_Function_Staging/form_handler.py#L624-L642) writes **no `ttl` attribute**, so the enabled TTL never fires. The FTC §5 "no personal information stored permanently" claim is still false. |
| session/analytics never deleted | Analytics writes now set a `ttl` attr ([analytics_writer.py:162](../../Lambdas/lambda/Master_Function_Staging/analytics_writer.py#L162)) — partial TTL coverage exists. |
| No identity-driven delete code | **Still true.** |
| `privacy@myrecruiter.ai` configured for DSAR | **Still true** — not configured anywhere in code/config. |

**Identity model today:** `picasso-form-submissions` is keyed `tenant_id` (PK) + `submission_id`
(uuid4, SK); the record carries `session_id` + raw `form_data` (name/email/phone). **No stable
cross-session person identifier exists.** Scheduling Path B consumes identity via the existing
`form_submission_id` reference, not a user_id.

**Account model:** `account = env`. Path A code targets the **staging account
(525409062831)** via the `infra/modules/<name>-staging/` per-resource pattern; promoted on
its own staging→prod track; forward-compatible-read discipline applies (CLAUDE.md). The
authoritative current PII table inventory is the `infra/modules/ddb-*-staging` set (Phase 1
produces the field-level inventory that replaces the stale "What is NOT being deleted" table).

### Locked decisions (Path A)

1. **Stable identifier = opaque `pii_subject_id`** minted at first identifying input (form
   submission), **plus** a `normalized-email → pii_subject_id` index table for DSAR lookup.
   `pii_subject_id` is **additive** — scheduling keeps consuming `form_submission_id`; the
   subject id links submissions for graph-walk + DSAR, it does not replace that reference.
   (Resolves the "Identifier strategy" open question below.)
2. **Multi-tenant deletion = per-tenant.** Each tenant is its own GDPR data controller; every
   PII table is already `tenant_id`-partitioned. (Resolves the "Multi-tenant deletion" open
   question below.)
3. **Backfill** = best-effort email-match to assign `pii_subject_id` to existing rows;
   un-matchable legacy rows age out under the Phase-3 retention TTL.
4. **Carve-outs excluded from delete + TTL:** TCPA SMS opt-in/STOP consent (4-yr retention;
   lives in the **SMS-twin project** surface, not MFS), COPPA artifacts. Path A *enumerates
   and coordinates*, does not own or delete these.
5. **Now-items are NOT Path A scope.** Corrected widget claim, manual DSAR, CloudWatch
   retention are owned by the **parallel scheduling Path B / F0** session. Path A *automates*
   what Path B does manually.

### Regulatory coverage (target: meet-or-exceed)

Engineering builds the *capability*; the legal *meet/exceed determination* is privacy
counsel's and is a hard Phase-5 gate. Strategy: **exceed** on high-frequency rights
(delete, access) via automation; **meet** on low-frequency rights (correction, appeal) via
the DSAR runbook (manual-first, automate later).

| Statutory right / duty | Source | Phase |
|---|---|---|
| Delete / erasure | CCPA §1798.105, GDPR Art 17, VA/CO/CT/UT/TX/MT | 2 (automated) |
| Access / know | CCPA §1798.110, GDPR Art 15 | 4 (automated) |
| Correction / rectification | CCPA §1798.106, GDPR Art 16, 2023+ state laws | 4 (runbook, manual-first) |
| Data portability — structured machine-readable export | GDPR Art 20, several state laws | 4 (JSON export, not a usage summary) |
| Verifiable consumer request — identity challenge before delete/export | CCPA, GDPR Art 12 + security duty | 4 (email round-trip to the email index; refusing imposters = the security control) |
| Storage limitation / minimization | GDPR Art 5(1)(e), CPRA | 3 (exceeds) |
| Retention carve-outs (over-deletion is itself non-compliant) | TCPA, COPPA, CAN-SPAM | Locked decision #4 |
| Deceptive privacy claim | FTC §5 | Path B seam |
| Response-deadline + appeal tracking | CCPA 45-day, GDPR 1-month, VA/CO/CT appeal | 4 (intake timestamps + deadline field; appeal intake = runbook) |
| RoPA, sale/share determination, EU/UK applicability, COPPA-age | GDPR Art 30; statute applicability | Phase 5 legal-scoping gate |

**Legal-scoping inputs (counsel-owned; gate the tenant-#2 cutover):** (a) does MyRecruiter
"sell"/"share" PI under CCPA — if no, opt-out-of-sale is N/A and that must be a *documented
determination*, not a silent assumption; (b) EU/UK data-subject applicability (sets the
erasure/portability bar); (c) COPPA under-13 exposure; (d) privacy-policy + widget-claim
wording sign-off; (e) RoPA / subprocessor list (operational — the separate ~$10–20K legal
workstream). The **tenant-#2 / Atlanta cutover does not happen without written counsel
sign-off** that the built capability + operational runbook meet the applicable bar.

### Re-baselined phasing (Path A) — supersedes "Recommended phasing" below

- **Phase 0 — Re-baseline (this section).** Status → Path A active, Owner = Chris, verified
  current state, locked decisions, regulatory coverage. *Done when this section is recorded.*
- **Phase 1 — Stable identifier + authoritative PII-surface inventory (wk 1).** Field-level
  inventory of every DynamoDB table / S3 prefix / CloudWatch log group (key schema, identity
  fields, `ttl`-written? y/n, writer Lambda) — replaces the stale audit table below. New
  `infra/modules/ddb-pii-subject-index-staging`; email-normalization spec; additive
  `pii_subject_id` on the form-submission write (forward-compatible). Path A↔Path B
  identity-contract doc. *Gate: system-architect + Security-Reviewer.*
- **Phase 2 — Delete pipeline backbone (wks 2–3).** **Greenfield** identity-driven delete
  service (staging-account Lambda + **dedicated** IAM role — no shared roles per CLAUDE.md);
  walks the identity graph by `pii_subject_id`, per-tenant, across all surfaces; idempotent;
  non-PII delete-audit record; honors decision #4 carve-outs. *Gate: test-engineer +
  Security-Reviewer.*
- **Phase 3 — Retention TTLs (wk 3–4).** Add the `ttl` attribute to `_store_submission`
  (table TTL infra already enabled — the code write is the gap); normalize/extend TTLs on
  remaining surfaces; document carve-outs; forward-compatible-read fixture tests. *Gate:
  contract/fixture tests green.*
- **Phase 4 — DSAR fulfillment (wks 4–5).** Stand up `privacy@myrecruiter.ai` (SES + runbook);
  by `pii_subject_id`, per-tenant: portable JSON access export, identity-verification
  challenge before any delete/export, wire delete to Phase 2, request intake with
  response-deadline field. Correction/appeal = runbook (manual-first). *Gate: runbook
  exercised incl. a verification-failed request.*
- **Phase 5 — Audit, verification & legal sign-off (wks 5–6).** `phase-completion-audit` +
  adversarial Security-Reviewer; staging soak; **written privacy-counsel sign-off**; then
  per-resource staging→prod cutover. *Gate (all required for tenant #2): zero-residue proof
  + verifiable-request proven + portable export validated + privacy claim true-or-removed
  (Path B) + counsel sign-off.*

### Coordination seam — this file is concurrently edited

The **parallel scheduling session** owns Path B + the now-items and is editing this same
document (it authored the Status block and the "Short-term mitigation" section). Path A
edits are confined to **this authoritative section** and are purely additive — Path A does
not modify the scheduling repo, the Status block, or the Path B sections. The only shared
contract: `pii_subject_id` is additive; scheduling continues to key on `form_submission_id`.

---

## Scope clarification: identity-bearing conversations only

PII collection in MyRecruiter happens in **specific moments**, not in every conversation:

- **Anonymous Q&A** — the vast majority of chat traffic. Visitor lands, asks questions, leaves. No identity captured. Records are anonymous in `picasso-session-events` and analytics aggregates. **Not in scope for deletion-request handling** because there's no identifier to match against. These records are managed via housekeeping TTLs, not the delete pipeline.

- **Identity-bearing conversations** — when a visitor fills out a form (application, newsletter signup, pre-call scheduling form, contact request, etc.). Now there's an email, often a phone, a name in `picasso-form-submissions`, and downstream notification records to that email/phone. **These are the records that deletion requests apply to.**

The delete pipeline is **identity-driven**, not session-driven. It walks every record keyed by or containing a specific person's identifier. Anonymous session records aren't reachable from a deletion request — there's no identifier to match — so they're not in the deletion flow.

This narrows scope meaningfully:
- The pipeline doesn't try to delete "all conversation history." It deletes records bearing a specific identity.
- Anonymous Q&A conversations age out via TTL on a housekeeping cadence (e.g., 90 days), independent of deletion requests.
- The current button label conflates two distinct concerns: "clear my visible chat" (local UI action, no backend involvement needed) and "delete my data" (backend identity-driven deletion). These should be separated.

The two surfaces this project should produce:

1. **Local clear** — the existing button, with an honest label like "Clear this conversation" or "Start over." Wipes the local UI; no backend call. Already mostly there in the frontend handler.
2. **Identity-driven deletion** — a verified deletion request flow (DSAR or in-product), triggered for users with identity in the system. Walks PII-bearing surfaces. This is the substantive engineering work below.

---

## What exists today

The chat widget's Settings UI exposes three relevant surfaces:

**1. "Clear All Messages" button (Settings tab → Reset Conversation).**
The label is **accurately scoped** to local session clearance. Frontend handler ([StateManagementPanel.jsx:91-172](../../Picasso/src/components/chat/StateManagementPanel.jsx#L91-L172)) clears localStorage + React state. Help text reads "This action is logged for audit compliance and cannot be undone." The button works for what it claims to do — clear the visible chat in the current session. **Not a façade.**

What it does NOT do, and never claimed to do, is reach backend records. The commented-out backend call (lines 124-144) was a planned extension that didn't land, and the corresponding backend handler ([Master_Function_Staging/state_clear_handler.py](../../Lambdas/lambda/Master_Function_Staging/state_clear_handler.py)) exists but is not imported or routed in `lambda_function.py`. It's dead code waiting for the broader identity-driven deletion mechanism this project will build.

**2. "Privacy & Compliance" claims (Data tab).**
The widget displays these promises:
- ✅ "All data is encrypted in transit" — true.
- ✅ "No personal information stored permanently" — **factually wrong.** `picasso-form-submissions` stores PII (name, email, phone, all form answers) permanently with no TTL and no delete code. `picasso-notification-sends`, `picasso-notification-events`, `picasso-sms-usage` similarly retain identity-tied records indefinitely.
- ✅ "Audit logging for compliance" — true at the events level, but the audit log itself contains identifiers and survives indefinitely.
- ✅ "Data retention: 30 minutes session storage" — true for the chat session memory; materially misleading as a global statement because form-submission and notification-record retention is indefinite, not 30 minutes.

**The "No personal information stored permanently" claim is the active deceptive surface** under FTC §5. It's a Privacy & Compliance assertion that the platform's data layer contradicts. This is the regulatory exposure to fix first — either the claim becomes true (delete pipeline + TTLs make permanent retention an exception, not the rule) or the claim is removed.

**3. "Download Conversations" data-export button (Data tab).**
Exports conversation metadata and statistics. Help text explicitly says "content not included for privacy." This is honest about its scope but does NOT satisfy a GDPR/CCPA Right to Access (data subject access request, or DSAR) — those require giving the user a copy of all PII the system holds about them, which would include form submissions, notification records, etc. The current export is a usage summary, not a DSAR fulfillment. This project should add a real DSAR export path alongside the deletion pipeline.

## What is NOT being deleted today (even with the button activated)

The most consequential PII tables are **untouched** by any deletion code:

| Table | Contains | Currently Deleted? |
|---|---|---|
| `picasso-form-submissions` | Name, email, phone, all form answers | **No, ever** |
| `picasso-notification-sends` | Outbound email/phone targets | **No, ever** |
| `picasso-notification-events` | Delivery/open/bounce records (with email) | **No, ever** |
| `picasso-sms-usage` (or `picasso_sms_usage`) | Phone numbers + usage timestamps | **No, ever** |
| `picasso-session-events` (analytics) | Session events that may include PII attributes | **No, ever** |
| `picasso-dashboard-aggregates` / `picasso-analytics-daily` | Aggregations possibly tagged with user attributes | **No, ever** |
| CloudWatch logs (Lambda, prompt traces) | Bedrock prompts, request/response bodies | **No mechanism** |
| S3 conversation logs (if generated) | Full transcripts | **No mechanism** |

The `picasso-form-submissions` table — where the form PII actually lives — has **no TTL** and **no delete code**. Form data persists indefinitely.

## Implications for scheduling specifically

Injecting form-submission data into Bedrock prompts (the gap from item #1) doesn't break anything that wasn't already broken. The form PII is already in DynamoDB unboundedly; reading it and putting it in a prompt doesn't make it more persistent. **But** it adds two new persistence surfaces:

- Bedrock prompt traces in CloudWatch logs (no deletion mechanism).
- Reverse-translation `text_en` records (when that's built — they'd carry the same PII).

So scheduling doesn't ADD a problem. It compounds an existing one. The compounding factor matters because the larger the PII footprint, the more visible the deletion gap becomes when it gets exercised (lawsuit, regulatory request, customer demand).

## What this is at the platform level

This is **not a scheduling problem.** It's a Picasso-platform compliance gap that scheduling exposes more than the current feature set does. Specifically:

- **GDPR right-to-be-forgotten:** fails today. Anyone with an EU user is non-compliant.
- **CCPA/CPRA deletion request:** fails today. California users can demand deletion; the system can't deliver.
- **COPPA under-13:** the research doc explicitly mentioned COPPA — fails today.
- **State-level breach notification laws (Texas, Illinois, etc.):** PII held without deletion mechanism is a breach risk amplifier.
- **TCPA consent records:** legally required to keep for 4 years, so retention is fine; but they sit unstructured alongside data that should be deletable.
- **Stated UX promise:** the "permanently delete" label is itself a regulatory exposure.

## What's needed at the platform level

Three things, none of which are scheduling-scoped:

1. **A stable user identifier** that survives session boundaries. Currently sessions are anonymous; deletion has nothing to bind to. Could be email-based (with normalization), or a server-issued user_id that's tied to the first identifying input (form, login, ticket).

2. **A comprehensive delete pipeline** that walks every PII surface:
   - DynamoDB tables (form submissions, notification sends, SMS usage, session events, analytics aggregates).
   - S3 (any conversation/transcript logs).
   - CloudWatch logs (purge by session/user reference where present).
   - Anything else PII flows through.

3. **A retention policy applied via TTL where possible** so most data ages out automatically — only deletion requests need the manual pipeline.

Plus the carve-outs for legally-required retention (TCPA consent records, COPPA artifacts).

This is a real platform initiative — probably a 4-6 week scope on its own with security review.

## What scheduling should do given this reality

Three options:

**A. Block scheduling launch on the platform-level fix.**
The most conservative. Means scheduling waits weeks while the deletion pipeline is built and audited. Probably overkill given Austin's specific use case — they're a single nonprofit with adult volunteers and a low compliance-exposure profile.

**B. Ship scheduling with explicit compliance limitations stated to the pilot.**
Austin agrees in writing that v1 has limited deletion support; document the gap; commit to fixing it before broader rollout. Pragmatic but creates technical debt that's visible to customers.

**C. Ship scheduling AND start the platform-level delete pipeline in parallel as a v1.5 / hard requirement before tenant #2.**
The middle ground. Scheduling design assumes a future stable user identifier and comprehensive delete; doesn't build any new permanent identifier of its own; uses the existing session_id + form_submission identifiers; ships against Austin pilot; the platform team starts the delete pipeline immediately so it's done before Atlanta or any second tenant ships.

I'd lean **C**. It avoids blocking on something this big, takes Austin's actual compliance posture seriously (low risk for a single adult-volunteer nonprofit), and treats the platform-level fix as the urgent platform initiative it actually is — not a scheduling subproblem.

## Defensive design choices for scheduling regardless

A few things scheduling can do today that minimize the compounding effect:

1. **Don't create new permanent PII stores in scheduling.** Use existing tables (`picasso-form-submissions` already has the data; the BookingUser record has `calendar_email` which is already in the calendar's directory). No new place where PII lives.
2. **Inject form data into prompts via reference, not duplication.** When the streaming handler hydrates the prompt, it loads from the existing `picasso-form-submissions` table per request rather than copying the data into a scheduling-specific store. When deletion eventually walks `picasso-form-submissions`, scheduling automatically inherits the deletion.
3. **Sign tokens contain only references (form_submission_id, session_id), not raw PII.** That way the signed-token recovery emails are still useful but don't themselves become PII vehicles.
4. **CloudWatch log scrubbing is the agentic-platform Phase 0 work** anyway — scheduling can specify what NOT to log (full prompts with PII; only structured event references).

These choices don't fix the platform problem but they keep scheduling from making it worse.

## Bottom line

The active issues are: (a) the "No personal information stored permanently" claim on the Privacy & Compliance tab is factually wrong as long as `picasso-form-submissions` retains data indefinitely, and (b) there is no identity-driven backend deletion path to honor a real GDPR/CCPA/FTC deletion request. The "Clear All Messages" button itself is honestly scoped — it does what it says (clears the local session) and is not the façade the earlier framing implied. The platform-level work is to build the backend deletion path, apply retention TTLs, and either make the privacy claim true or rewrite it to match reality. Scheduling shouldn't be blocked on solving this for the Austin pilot, but it should:

- Use only existing PII stores (no new ones).
- Trigger a real platform-level delete pipeline as urgent parallel work, ideally landing before tenant #2.
- Be designed defensively so when the platform delete pipeline lands, scheduling automatically benefits.

---

## Short-term mitigation (do this now, while the pipeline is built)

The remediation pipeline is 4–6 weeks of focused engineering. While that's underway, the most exposed risk surface — the deceptive Privacy & Compliance claim — can be neutralized in an afternoon. **This is risk reduction, not risk elimination.** It does not replace the pipeline; it buys time without leaving the FTC §5 vector open.

### Step 1: Amend the Privacy & Compliance tab claims

Three claims in the in-widget Data tab need to change:

| Current | Status | Replace with |
|---|---|---|
| ✅ "All data is encrypted in transit" | True | Keep as-is |
| ✅ "No personal information stored permanently" | **False** — `picasso-form-submissions` and notification tables retain identity-tied PII indefinitely | **Remove**, or replace with: *"Form submissions are retained until you request deletion. To request a copy or removal of your data, contact privacy@myrecruiter.ai."* |
| ✅ "Audit logging for compliance" | True at the events level | Keep as-is |
| ✅ "Data retention: 30 minutes session storage" | Misleading as a global statement (true only for chat session memory) | Scope it: *"Chat memory: 30 minutes session storage"* |

The standalone Privacy Policy document should be reviewed for parallel claims and amended in the same way. Lawyer review recommended.

### Step 2: Stand up a manual DSAR fulfillment path

Until the pipeline is built, deletion and access requests must be honored manually:

- **Privacy contact email** — `privacy@myrecruiter.ai` (or similar), monitored by someone empowered to act on requests.
- **DSAR runbook** — a documented internal procedure for fulfilling a deletion or access request: identify the user (email match), enumerate the records to be deleted/exported across the PII tables (`picasso-form-submissions`, `picasso-notification-sends`, `picasso-notification-events`, `picasso-sms-usage`), execute the operations, log the result.
- **Audit trail of manual deletions** — when a manual deletion is performed, log it (in a non-PII way: timestamp, requester reference, tables touched, record counts) so there's a verifiable trail.

This is operational work, not engineering. A founder/lawyer afternoon to draft, plus a couple of hours of practice runs.

### Step 3: Gate tenant onboarding

Until the real pipeline ships and is audited, do not onboard tenant #2. The single-pilot surface (Austin) is small enough that manual DSAR fulfillment is tractable. Beyond one tenant, the volume scales linearly and the operational gap becomes painful fast.

### What this mitigation does NOT do

- It does not eliminate underlying GDPR/CCPA/state-law deletion obligations. If a covered user requests deletion, the obligation exists regardless of UI claims.
- It does not satisfy a DSAR in any automated way — manual fulfillment only.
- It does not address the indefinite retention of PII in the database. PII is still being stored permanently; the only thing changing is the UI claim about it.
- It is **not a substitute** for the remediation pipeline. It is a stopgap. The pipeline must still ship.

### What this mitigation DOES buy

- Removes the most exposed FTC §5 deceptive-practices vector — the false claim becomes either accurate (when amended) or absent (when removed).
- Creates an honest fulfillment path users can use today (the privacy contact email).
- Provides a documented audit trail when deletion requests do come in.
- Gives the engineering team breathing room to build the pipeline correctly rather than under acute regulatory pressure.

---

## Out of scope for this project

- HIPAA-specific compliance (MyRecruiter does not handle PHI; volunteer recruitment is not patient data).
- BAA-specific architecture work (existing AWS stack is already BAA-eligible where it needs to be).
- Operational policy work (privacy policy revision, DSAR runbook, breach response runbook, subprocessor list maintenance) — these are lawyer + founder tasks separate from this engineering project. Estimate $10–20K of legal work plus ~1 week of founder time.
- Full GDPR Article 30 records of processing activities (RoPA) — operational, not engineering.

## Recommended phasing for the engineer who picks this up

**Phase 1 — Stable user identifier (week 1).** Decide identifier strategy (email-keyed normalized? server-issued user_id?). Add to existing tables via backfill where possible. Make new writes use it.

**Phase 2 — Delete pipeline backbone (weeks 2–3).** Wire up the existing dead `state_clear_handler.py`. Extend to walk all PII tables. Add S3 + CloudWatch purge. Make the actual button work for real. Add idempotency + audit logging of deletion events.

**Phase 3 — Retention TTLs (week 3–4).** Apply DynamoDB TTLs where retention isn't legally required. Document carve-outs for TCPA (4-year SMS opt-in records) and COPPA artifacts.

**Phase 4 — DSAR fulfillment workflow (week 4–5).** When a user requests their data, can produce it. Could be manual at first; automate later.

**Phase 5 — Audit and verification (week 5–6).** Independent review of the delete pipeline. Test cases: deleted user's data does not appear in any subsequent query. Privacy policy + UX label updated to match reality.

## Open questions for the project

- **Identifier strategy:** email-normalized vs. server-issued opaque user_id. Email is cheaper to retrofit but hashing/PII-handling is harder. Opaque ID requires a registration moment.
- **Multi-tenant deletion:** if a user has interacted with multiple tenants under different sessions, does deletion flow per-tenant or globally? Most likely per-tenant (each tenant operates as its own data controller under GDPR).
- **Backfill strategy:** what to do with existing PII records that have no stable identifier. Best-effort match on email may catch most; remainder ages out under the TTL policy.
- **Retention windows:** specific defaults — 30 days for abandoned sessions, 90 days for completed/canceled bookings, indefinite for analytics aggregates with PII attributes stripped, 4 years for TCPA opt-in records, indefinite for CAN-SPAM unsubscribes. Operator-configurable per tenant within reason.
- **CloudWatch log retention:** AWS default is indefinite. Set explicit retention (e.g., 30 days for staging, 90 days for prod) and add scrubbing for PII-bearing log lines.

## Files / references

- [`Picasso/src/components/chat/StateManagementPanel.jsx`](../../Picasso/src/components/chat/StateManagementPanel.jsx) — the button UI.
- [`Lambdas/lambda/Master_Function_Staging/state_clear_handler.py`](../../Lambdas/lambda/Master_Function_Staging/state_clear_handler.py) — the dead-code backend handler.
- [`Lambdas/lambda/Master_Function_Staging/lambda_function.py`](../../Lambdas/lambda/Master_Function_Staging/lambda_function.py) — where the handler should be imported/routed but isn't.
- [`Lambdas/lambda/Master_Function_Staging/form_handler.py`](../../Lambdas/lambda/Master_Function_Staging/form_handler.py) — where form PII is written (no TTL, no delete code).
- DynamoDB tables — see audit table above for the current PII surface.

## Cross-references

- Scheduling design discussion: [`scheduling/docs/design_discussion.md`](../../scheduling/docs/design_discussion.md). Defensive-design constraints for scheduling are noted there to align with this project.
- Agentic Phase 0 foundations: [`AGENTIC_FOUNDATIONS_PHASE_0.md`](AGENTIC_FOUNDATIONS_PHASE_0.md). CloudWatch log scrubbing for prompt traces is a shared concern; the Phase 0 work formalizes structured logging that this project will benefit from.

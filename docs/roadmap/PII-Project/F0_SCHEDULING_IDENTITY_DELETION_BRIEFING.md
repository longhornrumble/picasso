# F0 — Scheduling Identity-Graph Deletion — Briefing for the PII Session

**Purpose:** hand the scheduling **F0 deletion gap** from the scheduling program to the PII program. F0 is the unwaivable gate on the scheduling v1 **prod flag-flip (F1)** — scheduling cannot launch to a real pilot tenant until a single person's *entire scheduling footprint* (booking + reminder rows + the real Google Calendar event) can be hard-deleted on request and an auditor confirms zero residue.

**Status:** scoped 2026-06-13 by the scheduling session; **NOT started**; intended owner = the PII session.
**Gate source of truth:** [`scheduling/docs/launch_blocker_remediation_2026-05-18.md`](../../../scheduling/docs/launch_blocker_remediation_2026-05-18.md) §N2 (the five F0 conditions; Path-B narrowing).
**Re-verify before acting:** every code/infra claim below is a snapshot as of 2026-06-13 ground-truthed against lambda `origin/main` + live AWS acct 525. Re-confirm against live state before building — the scheduling code moves fast (reminders went from "inert" to "live" in three days).

---

## 1. TL;DR

The conversation-side DSAR pipeline (`picasso_pii_dsar_staging`) is solid and deletes the chat footprint. **It was never extended to the scheduling identity graph.** A deletion request today erases a person's chat data and leaves their **booking**, **scheduling-session binding**, **reminder messages**, and **actual Google Calendar event** fully intact. Closing F0 is a **multi-day build** (~4–6 focused days, Path-B narrow scope), not "run the pipeline and sign a form." It needs three new DSAR walkers, a Google Calendar event-deletion action, one discovery decision, and a seeded before/after attestation.

---

## 2. What F0 is (verbatim from the gate definition)

From `launch_blocker_remediation_2026-05-18.md` §N2 (decided 2026-05-18, owner = Chris):

> **F0 scope = Path B.** Identity-driven hard-delete operational across the **full identity graph** — `Booking` + `picasso-form-submissions` + `picasso-notification-sends`/`-events` + `picasso-sms-usage` + the written Google Calendar event — plus the now-items (corrected FTC §5 widget claim, manual DSAR path, CloudWatch retention). The five conditions below are the F0 definition; "delete the Booking row only" is explicitly **not** F0.

> **F0 test:** identity-driven delete request removes all `Booking`-linked PII for a synthetic user and an auditor confirms zero residue.

**Path B vs Path A:** F0 is the **narrow, pilot-only** path (Austin v1, one tenant). The full DSAR pipeline (Path A) gates **tenant #2** and is a separate larger effort — do NOT scope F0 to Path A.

**The "now-items" that are also part of F0 Path B** (not just the deletion walkers):
1. **Corrected FTC §5 widget claim.** The widget's live "No personal information stored permanently" copy is an active deceptive-practices exposure that scheduling *compounds* (Bedrock CloudWatch prompt traces + `text_en` + stored bookings). Confirm the current widget copy and correct it. *(Verify whether this was already addressed by another session before re-doing it.)*
2. **Manual DSAR path** documented + runnable for the pilot (see existing [`dsar-operator-playbook.md`](dsar-operator-playbook.md)).
3. **CloudWatch retention** on the scheduling Lambdas' log groups (prompt/PII traces) bounded.

**EU/UK exposure check (operator/counsel decision, §N2 item 4):** if the Austin pilot's volunteer population could include EU/UK users, F0 must satisfy **GDPR erasure** on `Booking`, not "in principle." If domestic-US-only, regulatory risk is materially lower (the now-items still apply). **This decision sets the rigor bar — get it answered first.**

---

## 3. Current coverage (ground-truthed 2026-06-13 — re-verify)

**The DSAR Lambda** `Lambdas/lambda/picasso_pii_dsar_staging/lambda_function.py` has **7 walkers** (`grep -nE "def _walk_[a-z_]+\(" lambda_function.py`):
`_walk_form_submissions` · `_walk_session_summaries` · `_walk_notification_sends` · `_walk_notification_events` · `_walk_recent_messages` · `_walk_session_events` · `_walk_archive_bucket` (+ MFS/PSID dispatchers). All DELETE (not export-only) on a deletion request.

**None of them touch the scheduling graph.** `grep -niE "booking|scheduling-session|scheduled-messages|calendar|deleteEvent" lambda_function.py` → the only hit is an unrelated comment (line ~100). Confirmed: zero scheduling-store deletion, zero Google Calendar deletion.

### Coverage matrix against the F0 gate list

| Store | Per-subject deletion (DSAR) today | F0 status |
|---|---|---|
| `picasso-form-submissions` | ✅ `_walk_form_submissions` DELETE | covered |
| `picasso-notification-sends` / `-events` | ✅ `_walk_notification_sends` / `_walk_notification_events` DELETE | covered |
| **`picasso-booking`** (attendee email + name) | ❌ no walker | **GAP — explicit F0 surface** |
| **`picasso-conversation-scheduling-session`** (attendee_email at rest since 2026-06-12) | ❌ no walker | **GAP** |
| **`picasso-scheduled-messages`** (reminder rows: recipient email/phone + body) | ❌ no walker | **GAP** |
| **Google Calendar event** | ❌ no calendar API call anywhere | **GAP — explicit F0 surface** |
| `picasso-sms-usage` (phone-keyed) | ⚠️ tenant-purge reaches it; DSAR (email) cannot | partial — see decision 2 |
| `picasso-sms-consent` | exempt by design (legal retention floor; carve-out) | not in scope |

**Why the tenant-purge pipeline doesn't help:** `picasso_pii_tenant_purge_staging` deletes per-*tenant*, and even it does NOT reach `picasso-booking` / scheduled-messages / scheduling-session (they're Class B / unenumerated). F0 is per-*subject*, so the tenant-purge is the wrong tool regardless.

---

## 4. The build required (Path-B narrow)

1. **`_walk_booking`** — query `picasso-booking-staging`, match `attendee_email == normalized_email`, DeleteItem per row; audit `surface_walked:booking`. Carve out the **coordinator email** (staff PII, not the subject — see decision 3). ~1–2 d.
2. **`_walk_conversation_scheduling_session`** — query the §B10 binding table, match `attendee_email`, DeleteItem; audit `surface_walked:conversation-scheduling-session`. ~1 d.
3. **`_walk_scheduled_messages`** — query `picasso-scheduled-messages`, match `recipient_email`, DeleteItem (these carry attendee contact + reminder body). ~1 d.
4. **Google Calendar event deletion** — the genuinely new piece: capture the calendar event id (`external_event_id` / `html_link`) from the booking row, call Google `events.delete` with the **per-coordinator OAuth token** (Secrets Manager `picasso/scheduling/oauth/{tenantId}/{coordinatorId}` — same pattern the calendar-watch Lambdas use); idempotent on already-deleted (404/410 → success); audit `calendar_event_deleted`. Only external-API + auth surface here. ~2 d.
5. **Discovery wiring** — per decision 1 below.

Pattern to mirror: `_walk_form_submissions` (lambda_function.py:753) is the closest existing template (query → match → DeleteItem → audit → dry-run support). Honor the existing **dry-run** flag and audit-event conventions every walker already follows.

---

## 5. Operator decisions owed (Chris's call — do not pick unilaterally)

1. **How to discover a scheduling-only subject.** Someone who booked via chat but never submitted a form has **no `pii_subject_id`**, so the existing email→`picasso-pii-subject-index`→subject_id discovery chain can't find them (this is the long-standing **F-DSAR4 subject-linkage gap** — read [`f-dsar4-subject-linkage-design.md`](f-dsar4-subject-linkage-design.md), it already analyzes this class). Options:
   - **(A)** stamp `pii_subject_id` onto the booking row at commit (cleanest; touches `Booking_Commit_Handler` commit path).
   - **(B)** walk the booking table directly by `attendee_email` (simplest; complete for Path B; diverges from the subject-id pattern).
   - **(C)** accept the manual operator-known fallback for pilot (lowest cost, lower coverage).
   - *Scheduling session's lean: **B** for the pilot, revisit **A** at tenant #2 / Path A. Reconcile against whatever f-dsar4 already concluded.*
2. **`sms-usage` for email requests.** Those rows are phone-keyed rate-limit counters (low PII value); an email-based DSAR can't reach them without phone-identifier support (DSAR `SUPPORTED_IDENTIFIER_TYPES` = email/psid only). Skip for F0 (note as Path-A item), or add phone support? *Lean: skip for F0.*
3. **Coordinator email in booking rows** is **staff** PII, not the consumer subject — carve it out of the erasure (don't delete the coordinator's identity when erasing an attendee). Confirm.
4. **EU/UK exposure** (§2) — sets the rigor bar.

---

## 6. The F0 deliverable: the attestation (chain-of-custody form)

The gate closes when a sign-off doc — propose `docs/roadmap/PII-Project/f0_pii_gate_<date>.md` — records a seeded before/after run:

- **Seeded subject:** a known test identity (email + phone) with a **real booking on MYR384719** (so a real Google Calendar event exists).
- **Before:** key/row snapshot proving the subject's data exists in EACH store — booking, scheduling-session, scheduled-messages, form-submissions, notification-sends/events — **and** the Google Calendar event exists.
- **The run:** the deletion request executed (not dry-run), with the audit-event log attached.
- **After:** the same snapshot showing **zero** across every store **and** the calendar event gone (auditor-confirmed "zero residue" per the §N2 F0 test).
- **Custody line:** who ran it, when, pipeline commit SHA, and the `pii-data-lifecycle` advisory sign-off.

This before/after-across-every-custodian shape is the proof the launch's hardest legal promise holds.

---

## 7. Gates + how to run it

- **HIGH-risk** (PII hard-delete + external calendar mutation). Per CLAUDE.md routing, this is a `pii-data-lifecycle-advisor` (data-flow) + `privacy-data-governance-advisor` (retention/deletion/disclosure) advisory matter; bring them in at planning, not after code.
- **No auto-merge.** `phase-completion-audit` + explicit operator go-ahead before the deletion walkers + calendar deletion merge (mirrors how WS-E-TCPA / WS-E-OAUTH were gated).
- **Living-Inventory PR rule (CLAUDE.md):** any PR adding a deleter to these surfaces MUST update [`pii-inventory.md`](pii-inventory.md) in the same PR (the booking / scheduling-session / scheduled-messages rows gain a new DELETE-capable consumer). **Coordinate** the inventory edit — it is written by multiple sessions and merge-conflicts; do not edit it simultaneously with another session.
- **Build in staging (acct 525)**; the verification run is against synthetic data on MYR384719. Never run a live deletion against real client data during the build.
- The walkers are file-disjoint from each other → a small parallel build is viable, but the integrator (PII session) is the single writer of the shared inventory + the attestation.

---

## 8. Pointers (read these first)

- **Gate definition:** `scheduling/docs/launch_blocker_remediation_2026-05-18.md` §N2.
- **The DSAR Lambda to extend:** `Lambdas/lambda/picasso_pii_dsar_staging/lambda_function.py` (mirror `_walk_form_submissions` @ ~753).
- **Subject-linkage gap (decision 1):** `f-dsar4-subject-linkage-design.md`.
- **Existing pipeline design / playbook:** `PII_DELETE_PIPELINE_DESIGN.md`, `dsar-operator-playbook.md`, `dsar-verification-posture.md`.
- **Retention/classification:** `data-retention-strategy.md`, `data-classification.md`, `pii-inventory.md` (the scheduling rows: `picasso-booking`, `picasso-conversation-scheduling-session`, `picasso-scheduled-messages`).
- **Calendar OAuth token location** (for the delete call): Secrets Manager `picasso/scheduling/oauth/{tenantId}/{coordinatorId}`; see the calendar-watch Lambdas + `Booking_Commit_Handler` for the read pattern.
- **Master plan / program home:** `MASTER_PROJECT_PLAN.md`, `README.md`.

---

## 9. What is NOT this work

- Path A (the full DSAR/identifier pipeline that gates tenant #2) — separate, larger.
- The conversation-side DSAR surfaces (already covered).
- `sms-consent` deletion (legal carve-out, never deleted).
- Reminder *functionality* (already live — see `scheduling/docs/REMINDER_ACTIVATION_DEFERRED.md` ACTIVATION-STATE section; mentioned only because scheduled-messages rows are now actively written and are a deletion surface).

---

## 10. Remediation Plan (PII session — 2026-06-13)

The PII session's response to §1–§9. Decisions §5 are resolved (operator, 2026-06-13). Scope held to **F0 Path B,
domestic-US baseline**: per-subject hard-delete of the scheduling identity graph **plus the real Google Calendar
event**, auditor-confirmed zero residue. NOT Path A, NOT `sms-consent`, NOT coordinator/staff email.

### 10.1 — Decisions resolved (§5)
1. **Subject discovery = (B)** — the deletion walks `picasso-booking` (and the other two scheduling tables)
   **directly by `attendee_email`/`recipient_email == normalized_email`**, independent of `pii_subject_id`. So a
   scheduling-only subject (no form, no subject-id — the F-DSAR4 class) IS reachable. No writer change for the pilot;
   revisit **(A)** stamp-at-commit at tenant #2 / Path A.
2. **`sms-usage` = SKIP for F0** — phone-keyed rate-limit counters; DSAR `SUPPORTED_IDENTIFIER_TYPES` = email/psid.
   Routed to Path-A (phone-identifier support).
3. **Coordinator email = CARVE OUT** — staff PII, not the consumer subject; `_walk_booking` must never match or
   delete on `coordinator_email`.
4. **Rigor bar = domestic-US-only** — the hard-delete + calendar deletion are still built (the §N2 zero-residue
   test requires it), but GDPR Art-17 is not a hard regulatory gate. The now-items (§10.4) still apply.

### 10.2 — The build (mirror `_walk_form_submissions` @ `lambda_function.py:753`)
Three new walkers in `Lambdas/lambda/picasso_pii_dsar_staging/lambda_function.py` + a calendar-deletion action.
Each walker: query → match normalized email (`.strip().lower()` both sides) → `DeleteItem` per row → emit
`surface_walked:<surface>` audit event → **honor the existing dry-run flag** → add to the surface dispatch set.

| New walker / action | Surface | Match | Notes |
|---|---|---|---|
| `_walk_booking` | `picasso-booking-staging` | `attendee_email` | **capture `external_event_id` (+ `tenantId`/`coordinatorId`) BEFORE delete** (for the calendar call); **carve out `coordinator_email`** |
| `_walk_conversation_scheduling_session` | `picasso-conversation-scheduling-session-staging` | `attendee_email` (at rest since 2026-06-12) | binding table |
| `_walk_scheduled_messages` | `picasso-scheduled-messages` | `recipient_email` | carries reminder body + attendee contact |
| **Calendar event deletion** | Google Calendar | `external_event_id` from booking | the genuinely new piece — see below |

**Google Calendar event deletion** (only external-API + auth surface): from the captured `external_event_id`, read
the per-coordinator OAuth token (Secrets Manager `picasso/scheduling/oauth/{tenantId}/{coordinatorId}` — reuse the
calendar-watch Lambdas' read pattern), call Google `events.delete`; **idempotent** (404/410 → success); emit a
`calendar_event_deleted` audit event; respect dry-run.

**IAM** (`infra/modules/lambda-pii-dsar-staging/main.tf`): add `dynamodb:Query` + `dynamodb:DeleteItem` on the 3
scheduling tables (+ any GSI used for the email match) + `secretsmanager:GetSecretValue` on
`picasso/scheduling/oauth/*`. ASCII Sids. Grant applies before the code deploys.

### 10.3 — Query strategy (build-time verify, per §3 caution)
Booking PK = `tenantId`; a `coordinator_email` GSI exists (stranded-booking) but an `attendee_email` index is
**unconfirmed** → each walker must either use a tenant-scoped Query + email FilterExpression or an `attendee_email`
GSI. Confirm per-table at build (key schema / GSIs), plus the booking calendar-event-id field name
(`external_event_id` / `html_link` / `conference_id`) and the OAuth secret shape.

### 10.4 — Now-items (§2) — reconciled
1. **FTC §5 widget claim** — the false "No personal information stored permanently" was **already removed** (M4 #1).
   The surviving "30 minutes session storage" bullet is **F-DSAR23 / M4.G3**, **deferred by operator 2026-06-07**
   (retention-policy-first; see `f-dsar23-m4g3-deferral-note.md`). → **No new widget work under F0.**
2. **Manual DSAR path** — `dsar-operator-playbook.md` exists; **extend** it with the 3 scheduling surfaces + the
   calendar-deletion step.
3. **CloudWatch retention** — verify the scheduling Lambdas' log groups have bounded retention; set if absent.

### 10.5 — Verification: the F0 attestation (the gate's proof)
Seeded before/after run → sign-off doc `docs/roadmap/PII-Project/f0_pii_gate_<date>.md`. Seed a known test identity
(email + phone) with a **real booking on MYR384719** (real Google Calendar event), in **staging acct 525**, synthetic
only. **Before:** rows exist in EACH store (booking, scheduling-session, scheduled-messages, form-submissions,
notification-sends/-events) **AND** the calendar event exists. **Run:** deletion executed (not dry-run), audit log
attached. **After:** **zero** across every store **AND** the calendar event gone. **Custody line:** who/when/commit
SHA/`pii-data-lifecycle` advisory sign-off.

### 10.6 — Gates / sequencing
HIGH-risk → `pii-data-lifecycle-advisor` + `privacy-data-governance-advisor` review **before code**. **No auto-merge**
→ `phase-completion-audit` + explicit operator go-ahead before the walkers + calendar deletion merge;
`verify-before-commit` per PR. **Living-Inventory rule:** the deleter PR updates `pii-inventory.md` in the same PR
(single writer; coordinate). **Build in staging (525)** on synthetic MYR384719 data only. **HARD STOP at prod** — the
scheduling v1 **F1** prod flag-flip stays operator-gated on the passing F0 attestation.
1) advisory review → 2) walkers + calendar deletion + IAM (verify-before-commit; tests) → 3) inventory + playbook +
classification/retention notes → 4) deploy to staging + run the seeded attestation → 5) phase-completion-audit +
operator go-ahead → F0 closed → F1 unblocked (operator-run).

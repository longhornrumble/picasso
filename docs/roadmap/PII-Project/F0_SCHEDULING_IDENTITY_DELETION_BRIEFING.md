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

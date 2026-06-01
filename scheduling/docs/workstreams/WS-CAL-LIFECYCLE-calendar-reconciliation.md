# WS-CAL-LIFECYCLE — Calendar-as-SoR reconciliation consumer (§14.2)

> Integrator-authored work-order; read-only brief. The §14.2 reconciliation consumer the dispatch interface assumed but never built. **B11's cancel path is inert until this lands.** Wave 4 (I2-A, operator-chosen 2026-06-01).

**Plan task(s):** §14.2 (canonical `scheduling_design.md` §14.2) — the calendar-lifecycle half the dispatch interface's "Named Consumers" (C4/C8/C9 logic) describes.
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-cal-lifecycle` · base `main`.
**Quality gate:** `verify-before-commit` (always) · weave audit = **full** (`/phase-completion-audit`) — mutates Booking + channel state on coordinator-driven calendar events.

## Goal / done-bar (verifiable)
A second SQS consumer Lambda that reacts to the four coordinator-side calendar events the merged `Calendar_Event_Consumer` deliberately skips. Done when, per `listener_dispatch_interface.md` envelopes + §14.2:
- **`booking.calendar_deleted`** → conditional `Booking.status` `booked→canceled` (`canceled_at`, `cancel_reason='coordinator_deleted'`); enqueue a **volunteer reschedule-link notice** via contract (Y) (stub with `TODO(Y)` until WS-SCHED-FOUNDATIONS lands — Google's cancellation email lacks the reschedule link, so this notice is value-add per §5.1).
- **`booking.calendar_reassigned`** → conditional `Booking.resource_id`/`coordinator_email` update to the new organizer; **NO platform notification** (agent-of-CoR §5.1 — Google's attendee-update email already covers it). Idempotent.
- **`booking.calendar_moved`** (v1 SCOPE — flagged): mark the booking `canceled` (`cancel_reason='coordinator_moved'`) + set `rescheduleOfBookingId` pointing at it + emit the reschedule path via (Y, stubbed); **do NOT auto-create the replacement booking** (that is C8-territory + needs a re-pool — deferred to a later wave). Email-only volunteers rely on Google's update email; opt-in SMS is the (Y) value-add.
- **`booking.event_made_private`** → this is **NOT a Booking write**: set `status='event_body_private'` on the **`picasso-calendar-watch-channels-{env}`** row + fire an admin alert (the platform can no longer verify attendance for that booking). Booking stays valid.
- **Idempotency** (dispatch-interface): dedupe `(event_id, last_calendar_mutation_at)` — all writes conditional; re-delivery is a no-op; never DLQ a duplicate. **Partial-batch** `batchItemFailures` like the sibling consumer.

## You OWN (create/edit ONLY these — disjoint ownership)
- `Calendar_Lifecycle_Consumer/**` — new consumer Lambda dir: `index.js` (SQS handler + `event_type` router for the 4 types), `booking-reconcile.js` (deleted/reassigned/moved Booking writes), `channel-degrade.js` (event_made_private → channels-table UpdateItem + admin alert), its own `booking-store.js` + `aws-client-config.js` (mirror the merged `Calendar_Event_Consumer` patterns — sdkConfig timeouts, `attribute_exists` guards, PII-redacted logs), `package.json`/lock, colocated `*.test.js`.

## You CONSUME (frozen — never modify)
- `listener_dispatch_interface.md` envelopes (`calendar_deleted`/`moved`/`reassigned`/`event_made_private` + common envelope). FROZEN_CONTRACTS §A Booking shape + non-key attrs (incl. `rescheduleOfBookingId` — NEW additive attr you introduce; document it in your report-back for §A codification) + the `picasso-calendar-watch-channels` row shape (`status` ∈ active/unwatched_renewal_failed/event_body_private). `shared/booking-status` SoT.
- Contract **(Y) notification-dispatch** — does NOT exist yet (WS-SCHED-FOUNDATIONS). Stub every volunteer-notify with `TODO(Y)` + the payload you'd send; the reconciliation (status writes) is the deliverable now.

## You PRODUCE
- The `rescheduleOfBookingId` Booking attribute + `cancel_reason` values (`coordinator_deleted`/`coordinator_moved`) — report-back for §A codification.

## OUT OF SCOPE / do NOT
- Do NOT auto-create the replacement booking on `moved` (v1 scope — flagged above).
- Do NOT build the (Y) notification dispatch — stub it.
- Do NOT write IaC, do NOT edit `Calendar_Watch_Listener` (the SQS→SNS publish change + the SNS topic/queue/subscription wiring are integrator-owned), do NOT edit `Calendar_Event_Consumer` or any shared doc. The four types reach you via the integrator's fan-out subscription (filter policy on `event_type`).
- Do NOT touch `shared/scheduling/**`. Escalate any contract issue.

## References
- `scheduling_design.md` §14.2 (per-type semantics — note the agent-of-CoR §5.1 narrowing) + §11 (attendance, for event_made_private); `listener_dispatch_interface.md`; `CLAUDE.md` (SOP, drift cap, schema discipline, never-share-IAM).

## Report-back (in your PR)
- PR title `feat(scheduling): WS-CAL-LIFECYCLE calendar reconciliation consumer`, base `main`.
- Doc-snippet: the new `rescheduleOfBookingId`/`cancel_reason` §A entries; the IAM verbs (Booking GetItem/UpdateItem + channels-table UpdateItem + SNS publish for admin alert + SQS consume); the (Y) stub locations. **Do not edit pii-inventory.md yourself.**
- Tell the integrator: branch, PR#, done-bar status, the (Y) stubs, any contract issue.

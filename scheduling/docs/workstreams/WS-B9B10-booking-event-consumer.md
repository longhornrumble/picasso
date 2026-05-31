# WS-B9B10 — Booking-event SQS consumer (OOO reoffer + accept/decline)

> Integrator-authored work-order; treat as a read-only brief. Combines plan tasks **B9 + B10** because both consume the **same** SQS FIFO queue (`picasso-calendar-watch-events-staging.fifo`) — they share one consumer Lambda, so they are one workstream, not two.

**Plan task(s):** `B9` + `B10` — [implementation plan](../scheduling_implementation_plan.md) rows 171–172.
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-b9b10` · base `main`.
**Quality gate:** `verify-before-commit` (always) · weave-time audit = **full** (`/phase-completion-audit`) — this is a new external-surface consumer that mutates Booking state + sends email; HIGH-RISK per [§5 risk rule](../PARALLEL_WORKSTREAMS.md#5-risk-calibrated-audit-rule-lever-4).

## Goal / done-bar (verifiable)
A new SQS-triggered consumer Lambda that reads the typed `booking.*` envelopes and acts on two cases. Done when:
- **B9 (OOO):** a `booking.ooo_overlap_detected` envelope → for **every** `booking_id` in `overlapping_booking_ids` (not just the envelope's `booking_id` — see dispatch-interface ⚠ note): (1) flag the conflict, (2) fire an admin alert to `OPS_ALERTS_TOPIC_ARN`, (3) re-run `pool.select` (C6) against that booking's `RoutingPolicy` and send the volunteer a **reoffer email containing ≥3 fresh slots** (not a generic "something changed" message). Integration test (fixture-seeded Booking rows) proves: simulated OOO envelope with 2 overlapping bookings → 2 admin alerts + 2 reoffer emails, each with ≥3 slots.
- **B10 (accept/decline):** a `booking.attendee_declined` envelope → `Booking.status = canceled` (idempotent UpdateItem). `booking.attendee_accepted` → record acceptance (no volunteer notification — coordinator gets Google's native email). Unit tests for both transitions + integration test with a simulated `declined` payload asserting the status write.
- **Idempotency:** the same `(event_id, last_calendar_mutation_at)` processed twice produces one outcome (dedupe-record check); a duplicate is **logged and discarded, never DLQ'd** (dispatch-interface "Idempotency Expectations").
- **Coverage:** the new consumer module hits the `shared/scheduling` CI gate equivalent (90/100/95/95) for its own package; failure-path tests (malformed envelope, pool returns 0 slots, DDB UpdateItem ConditionalCheckFailed, SES send failure) all exercised.

## You OWN (create/edit ONLY these — disjoint ownership)
- `Calendar_Event_Consumer/**` — the new consumer Lambda dir: `index.js` (SQS-record handler + thin `event_type` router), `ooo-reoffer.js` (B9), `attendee-response.js` (B10), a small `booking-mutations.js` (its own GetItem/UpdateItem-status helper — do **not** import C8's `Booking_Commit_Handler/booking-store.js` across packages), `reoffer-email.js` (the volunteer reoffer message), `dedupe-store.js` (the `(event_id, last_calendar_mutation_at)` processed-events check), `package.json`, `package-lock.json`, and colocated `*.test.js`.

## You CONSUME (frozen — never modify; see [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md) + [listener_dispatch_interface.md](../listener_dispatch_interface.md))
- **The dispatch envelopes** — `listener_dispatch_interface.md` (common envelope + `ooo_overlap_detected` / `attendee_accepted` / `attendee_declined` per-type fields). The `ooo_overlap_detected` envelope's `workingLocation` events are **excluded at the Listener** (integrator change, this wave) — you will only receive real-absence OOO. Still act on the **full `overlapping_booking_ids` array**.
- **`shared/scheduling/pool.js` `select(...)`** (C6, FROZEN §B) — re-run for the B9 reoffer. Copy the call shape from `Booking_Commit_Handler/index.js`; do not re-implement selection.
- **`shared/scheduling/routing.js`** if `pool.select` needs the routing policy (read-only).
- The Booking table item shape C8 writes (FROZEN §A) — your `booking-mutations.js` reads/updates it; never change the shape.

## You PRODUCE (the contract others depend on — honor it exactly)
- Nothing new contract-wise — this is a terminal consumer. The SQS dedupe-record table/shape you introduce is **internal** to this consumer; document it in your PR doc-snippet so the integrator can add the IaC + a pii-inventory line (it will reference attendee_email transiently).

## OUT OF SCOPE / do NOT
- **Reminders (B10):** the scheduling reminder system (T+24h/72h/7d) is sub-phase **E and does not exist yet**. Do NOT build reminder-suppression or the "defensive `responseStatus` poll at reminder-send time." Leave a single clearly-named stub (`// TODO(E): suppress reminders on cancel — reminder system lands in sub-phase E`) and note it in your report-back. Building it now = scope creep against a non-existent surface.
- **IaC:** do NOT write Terraform. The integrator wires the consumer Lambda's IaC module + the `aws_lambda_event_source_mapping` + DLQ + IAM (the queue + DLQ live in `infra/`, integrator-owned). Your `package.json` must declare deps so the integrator's deploy works.
- Do NOT edit `Calendar_Watch_Listener/**` (the Listener / workingLocation exclusion is the integrator's coupled change), `Booking_Commit_Handler/**`, `shared/scheduling/**`, or any shared doc (plan, `main.tf`, `pii-inventory`, kanban, contracts). Propose doc updates as a PR snippet.
- Do NOT redefine a consumed contract — escalate to the integrator.
- The other 4 event types (`calendar_deleted`/`moved`/`reassigned`/`event_made_private`) are **not** in this work-order — your router should `log + skip` them (a later workstream adds those handlers). Do NOT DLQ an unhandled-but-valid type.

## References
- Plan rows B9 (171) + B10 (172); `listener_dispatch_interface.md` (envelopes, idempotency, error contract, ordering); canonical `scheduling_design.md` §14.2; `CLAUDE.md` (SOP, drift cap, **schema discipline — every reader tolerates missing fields**, never-share-IAM, credential-mutation gate).
- The B9 "testing honesty" note (plan row 171): fixture-seeded Booking rows are acceptable for this workstream's tests; real-write-path E2E is C8-gated and re-tested separately.

## Report-back (in your PR)
- PR title `feat(scheduling): B9B10 booking-event consumer ...`, base `main`.
- **Doc-snippet block** for the integrator: plan-row status for B9 + B10; the dedupe-store table shape (for IaC + pii-inventory); the IAM verbs your code needs (Booking GetItem/UpdateItem, SES SendRawEmail, SNS Publish, dedupe-table RW, the per-tenant OAuth secret if `pool.select` reads freeBusy). **Do not edit `pii-inventory.md` yourself.**
- Tell the integrator: branch, PR #, done-bar status, the reminder stub location, any contract issue.

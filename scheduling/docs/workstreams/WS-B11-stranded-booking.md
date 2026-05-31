# WS-B11 — Coordinator-offboarding stranded-booking remediation (backend)

> Integrator-authored work-order; read-only brief. **Backend only** — the "N bookings need attention" admin UI is a deferred follow-up (a separate EUI-style frontend task), per operator decision 2026-05-31.

**Plan task(s):** `B11` — [implementation plan](../scheduling_implementation_plan.md) row 173 (canonical §7.3).
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-b11` · base `main`.
**Quality gate:** `verify-before-commit` (always) · weave-time audit = **full** (`/phase-completion-audit`) — mutates Booking state + deletes calendar events + re-runs routing.

## Goal / done-bar (verifiable)
A callable backend that, on a coordinator-offboarding trigger, finds that coordinator's still-live bookings and remediates them. Done when:
- **Detection:** given `(tenant_id, departed_coordinator_email, offboarding_time)`, query the `Booking` `(tenantId, coordinator_email)` GSI (A8c) and return all rows where `status == 'booked'` AND `last_calendar_mutation_at < offboarding_time` — the **stranded** set. Bounded query, tenant-scoped by construction; no full-table scan.
- **Three remediation operations**, each callable + independently tested:
  - **(a) reassign** — re-run routing (`pool.select` / `routing`) to pick a new eligible coordinator; rewrite the booking's `resource_id` + move the calendar event. If no eligible coordinator exists, (a) is not possible → cascade.
  - **(b) coordinator-side cancel** — delete the calendar event (which the Listener will surface as `booking.calendar_deleted` down-path) + mark the booking; the volunteer gets the reschedule-link notification path.
  - **(c) leave** — no-op (amicable departure; booking stands).
- **Default cascade** (no explicit admin choice): try **(a)**, fall back to **(b)** when (a) finds no eligible coordinator. Verified by a test where the pool is empty → cascade lands on (b).
- **Idempotency:** re-running detection+remediation for the same offboarding event does not double-remediate (a re-assigned/canceled booking is no longer in the stranded set).
- Unit tests for each handling + an integration test of the full offboarding flow (fixture-seeded bookings) for each option + the default cascade.

## You OWN (create/edit ONLY these — disjoint ownership)
- `Stranded_Booking_Remediator/**` — a new Lambda dir (handler + `detect.js` + `remediate.js` (the 3 ops + cascade) + its own `booking-mutations.js` Booking GetItem/Query(GSI)/UpdateItem helper + `package.json`/lock + colocated `*.test.js`).
- **Trigger:** this is invoked **on offboarding** — but do NOT edit `Calendar_Watch_Offboarder/**` to wire it. Expose a clean handler entrypoint (event = `{tenant_id, coordinator_email, offboarding_time, choice?}`); the integrator decides whether the Offboarder invokes it or it runs as its own path, and wires that.

## You CONSUME (frozen — never modify)
- The Booking item shape + the `(tenantId, coordinator_email)` and `(tenantId, start_at)` GSIs (FROZEN §A / A8c).
- `shared/scheduling/pool.js` + `routing.js` (C6/C5, FROZEN §B) for the (a) reassign path — read-only, same call shape as C8.
- Google Calendar event delete — mirror C8's `calendar-events.js` patterns for auth/idempotency; do not import it across packages (copy the minimal client pattern, or the integrator extracts a shared calendar client later).

## You PRODUCE
- The remediation handler's input/output contract (the `{tenant_id, coordinator_email, offboarding_time, choice?}` event + a result summary `{stranded_count, actions:[...]}`) — document it in your report-back so the integrator can wire the trigger + the future admin UI against it.

## OUT OF SCOPE / do NOT
- **No admin UI.** The "N bookings need attention" surface + the operator's choice of (a)/(b)/(c) is a **deferred frontend task**. Build the backend so the UI can call it later; expose the stranded set + the three operations as callable, but render nothing.
- **No IaC.** Integrator wires the Lambda module + IAM (Booking GSI Query + UpdateItem, Calendar event delete via per-tenant OAuth, SNS) + the offboarding trigger.
- Do NOT edit `Calendar_Watch_Offboarder/**`, `Booking_Commit_Handler/**`, `shared/scheduling/**`, or any shared doc. Propose doc updates as a PR snippet.
- Do NOT implement booking modification outside these 3 handlings (AC #13 manual-override is v1.1, deferred).

## References
- Plan row B11 (173); canonical `scheduling_design.md` §7.3 + `design_discussion.md` (stranded-booking detection, lines ~214–221); `CLAUDE.md` (SOP, drift cap, schema discipline, never-share-IAM, credential-mutation gate).
- B9-style testing honesty: fixture-seeded Booking rows are acceptable; the offboarding trigger's real wiring is the integrator's.

## Report-back (in your PR)
- PR title `feat(scheduling): B11 stranded-booking remediation ...`, base `main`.
- **Doc-snippet block:** plan-row B11 status; the handler I/O contract (for trigger wiring + the future UI); the IAM verbs needed (Booking GSI Query + GetItem/UpdateItem, Calendar event delete, per-tenant OAuth secret read, SNS). **Do not edit `pii-inventory.md` yourself.**
- Tell the integrator: branch, PR #, done-bar status, how you expect the offboarding trigger to invoke you, any contract issue.

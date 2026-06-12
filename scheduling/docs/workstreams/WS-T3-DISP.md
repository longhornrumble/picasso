# WS-T3-DISP — synthetic-monitor missed-event DISPOSITION cycle

Plan task: A5 residual / CI-6 Phase-2 (the 5th cycle — closes the plan's "all five cycles green" gate; email-receipt verification + DST soak remain explicitly deferred). Repo/branch/base: lambda repo (`Lambdas/lambda`) · `feature/scheduling-t3-disposition-cycle` · base `main`.
Quality gate: verify-before-commit (always) · weave audit = light-full (synthetic-only surface; touches no customer data paths, but invokes the disposition handler).

## Goal / done-bar (verifiable)
1. NEW `Scheduling_Synthetic_Monitor/disposition-cycle.js` + `index.js` `case 'disposition'` (mirror the existing cycle modules' structure, DI seams, metrics, and alerting): commit a synthetic booking (is_synthetic, compressed — reuse `synthetic-booking.js`) whose event_end is in the past or immediate → invoke `Attendance_Disposition_Handler` with `action:'attendance_check'` → verify `attendance_state='pending_attendance'` + the 3 minted purposes → drive ONE disposition (redeem the `no_show` token against the redemption surface, like `revocation-observer.js` does, OR invoke the handler-side path — pick whichever the shipped interfaces support with less new surface and justify) → poll the Booking for `status='no_show'` + `attendance_state='resolved'` → emit `CycleSuccess/CycleFailure` with `Cycle='disposition'` + SNS alert on failure.
2. Idempotency/race tolerance: a second disposition attempt yields `already_resolved` (assert, don't fail the cycle).
3. Synthetic hygiene: everything written is `is_synthetic` and within the existing `cleanup` cycle's deletion horizon (no new cleanup logic).
4. Prod-guard untouched and still load-bearing (existing tests stay green); the new cycle works under the same STAGING_TEST_MODE/is_synthetic double-gate.
5. Full monitor jest suite green; README + index header updated to mark the disposition cycle SHIPPED (receipt-verify + DST soak remain deferred).

## You OWN (create/edit ONLY these)
- `Scheduling_Synthetic_Monitor/` — new `disposition-cycle.js` + test, `index.js` dispatch case + test additions, `README.md`, header comment.

## You CONSUME (frozen — never modify)
- §E4 (disposition + escalation contract), §B4 token purposes, `Attendance_Disposition_Handler`'s `action` interface, `Scheduling_Redemption_Handler`'s `/attended/*` slugs, the shipped monitor modules (`synthetic-booking.js`, `alerts.js`, `prod-guard.js`, `booking-table.js`) — extend via the existing DI pattern, do not rewrite.

## OUT OF SCOPE / do NOT
- NO IaC (the EventBridge `{"cycle":"disposition"}` daily rule + the ATTEND/redemption grants = integrator glue — document EXACTLY what you need in the PR). NO edits to Attendance_Disposition_Handler, shared/scheduling, or other cycles' modules. NO email/SMS receipt verification (deferred). NO deploy-workflow edits.

## Report-back (in your PR)
Title `feat(scheduling): T3 — synthetic disposition cycle (CI-6 5th cycle)`, base `main`. Include: done-bar status, suite summary, the exact IAM grants + EventBridge rule input the integrator must wire, kanban doc-snippet, any contract concern (STOP and flag).

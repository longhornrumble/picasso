# WS-C9 — Booking state machine (§9.2)

**Plan task:** C9 — [plan](../scheduling_implementation_plan.md) row C9. Also lands the **CI-3c** transition-table graduation (the stub locked the vocabulary; C9 adds the transitions).
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-c9` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **medium** (transition correctness; the illegal-transition matrix).

## Goal / done-bar
- Eight-state machine: `qualifying → proposing → confirming → booked` (+ `pending_attendance`, `coordinator_no_show` entered later by E). Transitions persist on `ConversationSchedulingSession`.
- **"No skips" test:** synthesize a session in `qualifying`, attempt `→ confirming` directly → returns `IllegalStateTransition` AND the session stays `qualifying`. Repeat for **every illegal pair**; commit the full illegal-transition matrix as a regenerable fixture.

## You OWN (create/edit ONLY these) — [proposed; integrator confirms in §4.0]
- `shared/scheduling/stateMachine.js` + `shared/scheduling/__tests__/stateMachine.test.js`
- **Graduate CI-3c:** extend `shared/booking-status.js`'s contract with a `TRANSITIONS` map IF the integrator assigns it to you (else leave booking-status untouched — it is frozen §A). Coordinate: booking-status is shared; flag any edit to the integrator.

## You CONSUME (frozen — never modify; [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md))
- §A `Booking.status` vocabulary (the 5 values) + the ConversationSchedulingSession table. Note: `ConversationSchedulingSession` state (qualifying/…) is the SESSION state — distinct from `Booking.status` (canonical §9.2 vocabulary note). Keep them separate.

## OUT OF SCOPE / do NOT
- Do NOT implement the commit (C8) or reminders (E). The machine is transition logic + persistence on the session row; it does not write Booking rows.

## References
- Canonical §9.2 (the eight states + the no-skips rule + the session-state-vs-Booking.status distinction). Plan C9, CI-3c. `CLAUDE.md`.

## Report-back
- PR `feat(scheduling): WS-C9 state machine + CI-3c transition table` → main. Snippet: plan C9 + CI-3c → 🟡/🟢. Flag any `shared/booking-status.js` edit to the integrator.

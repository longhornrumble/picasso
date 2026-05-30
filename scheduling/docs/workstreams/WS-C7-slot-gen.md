# WS-C7 — Slot generation (§9.3)

**Plan task:** C7 — [plan](../scheduling_implementation_plan.md) row C7.
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-c7` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **LIGHT** (pure logic, full unit coverage, no external surface).

## Goal / done-bar
- Generate 3–5 slot chips: day/date/time format, **user-timezone respect, DST safety** (spring-forward gap + fall-back ambiguity), rejected-slot dedup.
- **DST-transition unit tests** (both directions) + chip-format snapshot tests. Pure, deterministic functions.

## You OWN (create/edit ONLY these) — [proposed; integrator confirms in §4.0]
- `shared/scheduling/slots.js` + `shared/scheduling/__tests__/slots.test.js`

## You CONSUME (frozen — never modify; [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md))
- Busy intervals + appointmentType + tz are PASSED IN (you don't call C4). §A AppointmentType.

## You PRODUCE
- §B3 `generateSlots({busyIntervals, appointmentType, userTimeZone, alreadyRejected}) → [{slotId, start, end, label, resourceId}]` (3–5 chips, `label` display-ready). **Honor exactly** — C6 + WS-EUI consume it.

## OUT OF SCOPE / do NOT
- Do NOT call any API or DB; pure functions only. Do NOT do slot-locking (that's C6's conditional write). No timezone-library lock-in beyond what the repo already uses — confirm the tz approach with the integrator if adding a dep.

## References
- Canonical §9.3. Plan C7. `CLAUDE.md`.

## Report-back
- PR `feat(scheduling): WS-C7 slot generation` → main. Snippet: plan C7 → 🟡/🟢 + DST test result. Confirm the produced shape matches §B3.

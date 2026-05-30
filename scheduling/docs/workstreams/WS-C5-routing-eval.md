# WS-C5 — RoutingPolicy evaluation + round-robin (§10.1/§10.2)

**Plan task:** C5 — [plan](../scheduling_implementation_plan.md) row C5.
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-c5` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **medium** (round-robin partial-failure correctness).

## Goal / done-bar
- Tag-condition pool eligibility filtering; tie-breaker (`round_robin` first, `first_available` fallback); **round-robin state advances ONLY on commit success** (the advance/revert are separate calls, committed by C8, per §10.2).
- Unit tests per tie-breaker; **round-robin behavior under partial failure** (advance then commit fails → revert restores the cursor so the advanced coordinator isn't skipped).

## You OWN (create/edit ONLY these) — [proposed; integrator confirms in §4.0]
- `shared/scheduling/routing.js` + `shared/scheduling/__tests__/routing.test.js`

## You CONSUME (frozen — never modify; [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md))
- §A RoutingPolicy table (round-robin state = `last_assigned_resource_id` + `last_assigned_at`), AppointmentType table. freeBusy results are PASSED IN (you don't call C4 — C6 wires them).

## You PRODUCE
- §B2 `evaluatePool(...)` → `{ordered[], tieBreaker, roundRobinCursor}` + `advanceRoundRobin(...)` (atomic UpdateItem) + `revertRoundRobin(...)` (compensating). **Honor exactly** — C6/C8 integrate against these.

## OUT OF SCOPE / do NOT
- Do NOT call freeBusy or do the commit (that's C6/C8). Do NOT build a Booking-history-derived round-robin (reconciled away 2026-05-02 — state lives on RoutingPolicy). Pure functions + the two DDB state calls only.

## References
- Canonical §10.1/§10.2. Plan C5. `CLAUDE.md`.

## Report-back
- PR `feat(scheduling): WS-C5 routing eval + round-robin` → main. Snippet: plan C5 → 🟡/🟢 + partial-failure revert test. Confirm the produced signatures match §B2.

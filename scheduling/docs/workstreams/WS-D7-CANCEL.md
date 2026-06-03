# WS-D7 — Cancel execution module (§9.4)

**Plan task:** D7. [plan](../scheduling_implementation_plan.md) §6.
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-d7-cancel` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **FULL** (calendar mutation; small surface, but commit path).

## Goal / done-bar (verifiable)
A DI-seam'd module `shared/scheduling/cancel.js` implementing the **§B9** `executeCancel({ booking, deps })` — the cancel that runs **in-chat after the volunteer confirms** (NOT at the redemption endpoint; the token only authenticated entry, §13.4).

- **Single-path through Google `events.delete`** (§9.4 agent-of-Calendar-of-Record §5.1). On success → `outcome:'deleted'`.
- **Critical — do NOT flip `Booking.status` here.** The §14.2 listener (the **already-built** cal-lifecycle consumer) picks up the `calendar_deleted` push, flips `Booking.status=canceled` (+ `cancel_reason`), and dispatches the volunteer notice. A second status writer here would race that one source of truth (§9.4: "one transition, one notification"). This module's job ends at the calendar delete.
- **API-unreachable failure path** (§9.4): set `booking.pending_calendar_sync=true` and return `outcome:'pending_calendar_sync'`; the E9 reconciler retries `events.delete` until it succeeds, then the listener catches the eventual deletion.
- **Done-bar:** unit tests for: delete ✓ → `deleted` and **status NOT mutated by this module** (assert no status write); delete-throws-unreachable → `pending_calendar_sync=true` + `pending_calendar_sync` outcome; the module performs **no token validation / no jti write** (WS-D4 owns those) and persists nothing itself — returns the updated `booking` for the caller to persist.

## You OWN (create/edit ONLY these)
- `shared/scheduling/cancel.js` + `shared/scheduling/__tests__/cancel.test.js`.
- Do **NOT** touch `shared/scheduling/package.json` (scaffolded; run `npm ci` in `shared/scheduling/` before tests/package).

## You CONSUME (frozen — never modify)
- **§B9 (LOCKED):** your `executeCancel` signature + the listener-owns-the-status-flip contract — build exactly to it.
- **§A Booking** shape (read defensively).
- The already-built **cal-lifecycle consumer** behavior (it flips status on `calendar_deleted`) — you rely on it; you do NOT call or modify it.
- All I/O via injected `deps = { calendar, ddb, logger }` — **no module-level clients**.

## You PRODUCE
- The §B9 `executeCancel` module the in-chat cancel-confirm step calls (caller wiring = integrator glue).

## OUT OF SCOPE / do NOT
- Do **NOT** flip `Booking.status` / write `cancel_reason` / dispatch the notice — the cal-lifecycle listener owns all three.
- Do **NOT** build the redemption endpoint, the session binding, the cancel confirmation UI (WS-D4 / in-chat / integrator), or the E9 reconciler (it consumes your `pending_calendar_sync` flag).
- Do **NOT** persist to DynamoDB yourself — return the updated booking.

## References
- Canonical §9.4 (cancel-through-calendar single-path; `pending_calendar_sync`; listener reconciliation). Plan D7. The cal-lifecycle consumer record [[project_scheduling_cal_lifecycle_module_audit_2026-06-02]] (the status-flip half that's already live). `CLAUDE.md` (schema discipline).

## Report-back (in your PR)
- PR `feat(scheduling): WS-D7 cancel execution module (D7)` → **main**.
- Doc-snippet: plan D7 → 🟡 (module-complete; in-chat wiring + E2E = integration); confirm the §B9 signature + the no-status-flip boundary; flag the caller/wiring as an integration seam.
- Branch, PR#, done-bar status, any contract issue (STOP + flag, don't fork).

# WS-D6 — Reschedule execution module (§9.4)

**Plan task:** D6. [plan](../scheduling_implementation_plan.md) §6.
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-d6-reschedule` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **FULL** (calendar mutation + commit path — race/partial-failure correctness).

## Goal / done-bar (verifiable)
A DI-seam'd module `shared/scheduling/reschedule.js` implementing the **§B9** `executeReschedule({ booking, newSlot, deps })` — the calendar move that runs **in-chat after the volunteer confirms the new slot** (NOT at the redemption endpoint; the token only authenticated entry, §13.4).

- **"Atomic" is aspirational — Google has no atomic-move API.** Implement the locked ordering — **`events.insert`(new) FIRST, `events.delete`(old) SECOND** — and the four real outcomes (§D6, plan row):
  - **(i)** insert ✓ + delete ✓ → `outcome:'success'`.
  - **(ii)** insert ✓ + delete ✗ → `outcome:'pending_calendar_sync'`, set `booking.pending_calendar_sync=true` + store `rescheduled_old_event_id` (the E9 reconciler retries the delete; the volunteer sees only the new invite).
  - **(iii)** delete ✓ but insert ✗ → `outcome:'canceled_insert_failed'`, set `booking.status='canceled'` + `deps.alertAdmin(...)` (treat as cancel + manual rebook).
  - **(iv)** both ✗ → `outcome:'failed'`, no state change.
- **Preserve the Zoom join URL via `PATCH`** where the conference provider allows (consume **§B6 `ConferenceProvider`** through `deps.conference`; Meet/Null providers no-op the URL preservation).
- Reason insert-first is locked: better to leave the user with two invites (recoverable by the reconciler) than zero (unrecoverable).
- **Done-bar:** unit tests for each of (i)–(iv); state-flag transitions asserted; outcome-(ii) sets `pending_calendar_sync` + `rescheduled_old_event_id`; outcome-(iii) sets `canceled` + fires `alertAdmin`; Zoom-PATCH-preserves-join-URL test (provider-mocked); the module performs **no token validation** and **no jti write** (WS-D4 owns those) and persists nothing itself — it returns the updated `booking` for the caller to persist.

## You OWN (create/edit ONLY these)
- `shared/scheduling/reschedule.js` + `shared/scheduling/__tests__/reschedule.test.js`.
- Do **NOT** touch `shared/scheduling/package.json` (scaffolded; run `npm ci` in `shared/scheduling/` before tests/package).

## You CONSUME (frozen — never modify)
- **§B9 (LOCKED):** your `executeReschedule` signature + the four-outcome contract — build exactly to it.
- **§B6 `ConferenceProvider`:** `deps.conference` for the Zoom `PATCH` / Meet no-op.
- **§A Booking** shape (read defensively).
- All I/O is via injected `deps = { calendar, conference, ddb, alertAdmin, logger }` — **no module-level AWS/Google clients** (matches the C8 / cal-lifecycle DI pattern).

## You PRODUCE
- The §B9 `executeReschedule` module the in-chat reschedule-confirm step calls (the caller wiring is integrator glue — you provide the function, not the call site).

## OUT OF SCOPE / do NOT
- Do **NOT** build the redemption endpoint, the session binding, or the chat-side confirm UI (WS-D4 / in-chat flow / integrator).
- Do **NOT** build the E9 nightly reconciler (it CONSUMES your outcome-(ii) flag; just set the flag + store the old event id). Reference it; don't implement it.
- Do **NOT** flip `Booking.status` for the cancel-of-old in the success path via a second writer — the success path is a clean move; only outcome-(iii) sets `canceled`.
- Do **NOT** persist to DynamoDB yourself or write the §B10 binding — return the updated booking; the caller persists.

## References
- Canonical §9.4 (reschedule pattern, cancel+rebook, Zoom PATCH). Plan D6 (the four outcomes verbatim). `CLAUDE.md` (schema discipline, never-share-IAM). C8 / cal-lifecycle DI-seam pattern for the deps shape.

## Report-back (in your PR)
- PR `feat(scheduling): WS-D6 reschedule execution module (D6)` → **main**.
- Doc-snippet: plan D6 → 🟡 (module-complete; in-chat wiring + E2E = integration); confirm the §B9 signature + the four outcomes match the locked contract; flag the caller/wiring as an integration seam.
- Branch, PR#, done-bar status, any contract issue (STOP + flag, don't fork).

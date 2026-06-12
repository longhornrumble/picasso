# WS-T3-DAYPICK-BE — Surface-4 day-picker fallback (backend)

Plan task: A8 / Surface-4 (legacy label "§B16c track" — the REAL contract is **§B16e**). Repo/branch/base: lambda repo (`Lambdas/lambda`) · `feature/scheduling-t3-daypick-be` · base `main`.
Quality gate: verify-before-commit (always) · weave audit = **FULL** (touches the §B14-adjacent chat flow).

## Goal / done-bar (verifiable)
1. When `invokeProposal` returns `outcome:'no_availability'`, or the proposing none-self-loop has re-proposed ≥2 times, the flow emits the §B16e `scheduling_day_picker` SSE message and does NOT advance state (test-pinned both triggers + both stay-in-state rules).
2. A `scheduling_day_selected: 'YYYY-MM-DD'` widget signal re-runs propose constrained to that day; 'ok' → slots presented per §B16b ordering; 'no_availability' → picker re-emitted (tests).
3. >3 picker cycles → the shipped `scheduling_notice` async escape (test).
4. `generateSlots` accepts OPTIONAL `dateWindow {startISO,endISO}`; the frozen 4-key call is byte-identical in behavior (regression tests prove no drift).
5. BCH `scheduling_propose` passes through OPTIONAL `date_window` → `generateSlots`; absent → shipped behavior unchanged (test).
6. Full suites green: BSH, shared/scheduling, Booking_Commit_Handler.

## You OWN (create/edit ONLY these)
- `Bedrock_Streaming_Handler_Staging/scheduling/schedulingFlow.js` (+ its test file) — the picker emit/handle branches.
- `Bedrock_Streaming_Handler_Staging/scheduling/` new helper module(s) + tests if you split (e.g. `dayPicker.js`).
- `shared/scheduling/slots.js` + `shared/scheduling/__tests__/slots.test.js` — the optional `dateWindow` param ONLY.
- `Booking_Commit_Handler/scheduling-propose.js` + its test — the optional `date_window` passthrough ONLY.
- The scheduling state-store file ONLY if persisting picker-cycle count requires it (count rides the existing saved state like `candidate_slots` — prefer that).

## You CONSUME (frozen — never modify)
- §B16e (your contract — implement it exactly), §B16a/§B16b/§B16c, §B14 boundary, §B3 slot shape. Read `scheduling/docs/FROZEN_CONTRACTS.md`.
- The shipped `_presentSlots`, `transition()`, `alreadyRejected` accumulation, `scheduling_notice` fallback — extend, do not rewrite.

## OUT OF SCOPE / do NOT
- NO widget code (WS-T3-DAYPICK-FE owns it). NO per-day availability precomputation (v2). NO shared docs/kanban/IaC. NO commit-path (`index.js` of BCH) changes. NO new LLM actions — the day selection is the deterministic signal, never an action-selector output.

## Report-back (in your PR)
Title `feat(scheduling): T3 — Surface-4 day-picker fallback (backend, §B16e)`, base `main`. Include: done-bar status per item, suite summary lines, a doc-snippet (kanban row update) for the integrator, any contract concern (STOP and flag — do not fork §B16e).

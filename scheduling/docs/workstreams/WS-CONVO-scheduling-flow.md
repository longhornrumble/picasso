# WS-CONVO — in-chat reschedule/cancel flow (B3, the keystone)

**Plan task:** B-minimal / Track B3 (keystone). [plan](../D_DEPLOY_AND_C_CHAT_INTEGRATION_PLAN.md).
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-convo` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **FULL** (commit path + the LLM-action boundary — mandatory Security + adversarial review).
**Sequencing:** the **integrator-sequenced KEYSTONE** — launch ONLY after WS-FACADE (§B13), WS-BINDING (§B12), WS-ZOOM (§B15) have merged (this consumes all three). WS-WIDGET can be in flight concurrently.

## Goal / done-bar (verifiable) — the MINIMAL recovery loop
Add a scheduling conversation to `Bedrock_Streaming_Handler_Staging` that, when a session carries a §B10 binding, drives **reschedule + cancel** end-to-end:
1. **Pre-turn binding hook** (mirror `scheduling/formInjection.js` at index.js:470/907): resolve the binding via **§B12 `resolveBinding({tenantId, sessionId, deps})`**; if present, inject `{intent, booking_id, coordinator_id}` + the current `stateMachine` state into the prompt context. Initialize the session state from the intent: `rescheduling_intent → 'rescheduling'`, `cancellation_intent → 'canceling'` (per C9 `stateMachine.js` — sessions may be CREATED in any state).
2. **Reschedule:** `rescheduling → proposing` (present slots via the shipped `shared/scheduling/slots.js` §B3 — minimal: against the booking's coordinator) → `confirming` → on confirm call the shipped **`executeReschedule`** (§B9) with `deps.calendar` = **§B13 `buildCalendarFacade(...)`** + `deps.conference` (§B6) + the §B15 Zoom time-PATCH; persist the returned booking.
3. **Cancel:** `canceling` → confirmation → call the shipped **`executeCancel`** (§B9); the §14.2 listener flips status.
4. **THE BOUNDARY (§B14 — locked):** execute a state-change ONLY on a discrete STRUCTURED action from a **focused post-stream call mirroring the V4.0 Action Selector** (a small Haiku call after the response streams) returning `{action:'select_slot'|'confirm_reschedule'|'confirm_cancel'|'none', slotId?, booking_id}`. Validate every transition through `stateMachine.transition(session, toState)`. **NEVER** execute on free-text the streaming LLM emits ("I've confirmed it" in prose → no-op). The `conversation-scheduling-session` row is ground truth.
- **Done-bar:** unit tests — binding→state init per intent; the action-detector gates execution (free-text "confirmed" → NO execute; structured `confirm_reschedule` → executeReschedule called once); illegal transitions rejected by `stateMachine`; reschedule confirm calls executeReschedule with a §B13 facade + §B15 time-PATCH; cancel confirm calls executeCancel; no-binding session → normal chat untouched (no regression). Integration/E2E (with the fixture) is integrator-run.

## You OWN (create/edit ONLY these)
- `Bedrock_Streaming_Handler_Staging/scheduling/schedulingFlow.js` (the flow + the action-detector) + `scheduling/bindingContext.js` (the pre-turn hook) + their tests under `scheduling/__tests__/`.
- **Minimal, surgical** edits to `Bedrock_Streaming_Handler_Staging/index.js` to wire the pre-turn hook + the post-stream action call (mirror exactly how `injectFormContext` is wired at :470/:907). Flag the index.js call-sites you change in your PR.

## You CONSUME (frozen — never modify)
- **§B12** `resolveBinding` · **§B13** `buildCalendarFacade` · **§B14** (the action boundary) · **§B15** `updateMeeting` · **§B9** `executeReschedule`/`executeCancel` (shipped — import, don't re-implement) · **§B3** `slots.generateSlots` · **§B6** ConferenceProvider · C9 `stateMachine.js` (`transition`, `SESSION_STATES`).
- The existing `formInjection.js` wiring as the pattern (do NOT edit it).

## You PRODUCE
- The BSH scheduling conversation (the integration point). No JS contract others import in B-minimal.

## OUT OF SCOPE / do NOT
- Do NOT build new-booking-from-scratch entry (`qualifying`), C10 output-sanitization, C11 idempotency, C12 chip rendering, C13 Zoom-outage paging — **B-remainder** (stub/TODO if a seam appears). Do NOT re-implement the facade/binding/zoom/execute modules (consume the frozen ones). Do NOT change `formInjection.js` or other BSH features. Do NOT execute on free-text (§B14).

## References
- §B12/B13/B14/B15/B9/B3/B6, canonical §9.2 (state machine) + §9.4 (reschedule/cancel). The V4.0 Action Selector pattern (CLAUDE.md — the focused post-stream Haiku call) is the model for the structured action-detector. `CLAUDE.md` (never-share-IAM, schema discipline, the BSH `BEDROCK_MODEL_ID` env gotcha).

## Report-back
- PR `feat(scheduling): WS-CONVO in-chat reschedule/cancel flow (B3)` → main. Snippet: plan B3 → 🟡 (E2E = integrator); the index.js call-sites changed; confirm §B14 boundary (no free-text execution). Flag any contract issue (STOP, don't fork).

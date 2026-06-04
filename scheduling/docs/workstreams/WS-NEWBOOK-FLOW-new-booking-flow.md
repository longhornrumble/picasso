# WS-NEWBOOK-FLOW — in-chat new-booking flow (qualifying → booked) [KEYSTONE]

> Integrator authors this; you treat it as a read-only brief. You build ONE slice in an isolated worktree.
> **Sequencing:** this is the wave keystone. It CONSUMES the §B16a propose route — start building against the
> frozen §B16 now, but the integrator weaves your PR only AFTER WS-NEWBOOK-PROPOSE merges.

**Plan task(s):** C9 (state-machine drive) + C12 (backend half of the chat flow) / B-remainder new-booking entry — [implementation plan](../scheduling_implementation_plan.md) §5 + [PARALLEL_WORKSTREAMS §4.2](../PARALLEL_WORKSTREAMS.md).
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-newbook-flow` · base `main`.
**Quality gate:** `verify-before-commit` (always) · weave-time audit = **FULL** (the §B14 action boundary + the commit path — the highest-risk surface in the wave) per [§5 risk rule](../PARALLEL_WORKSTREAMS.md#5-risk-calibrated-audit-rule-lever-4).

## Goal / done-bar (verifiable)
- A new module `Bedrock_Streaming_Handler_Staging/scheduling/newBookingFlow.js` exporting **`runNewBookingTurn(...)`** (the post-stream entry, mirroring `schedulingFlow.runSchedulingTurn`) that drives the C9 happy path **`qualifying → proposing → confirming → booked`** under the **§B14 boundary** (state machine authoritative; execute ONLY on a discrete structured action; free text NEVER commits; unparseable → `none`).
- Action vocabulary **`select_slot` / `confirm_book` / `none`** (§B16b). Every transition validated through `stateMachine.transition` — an `IllegalStateTransition` is caught → `{ rejected: true }`, never throws out.
- **`confirm_book` commits ONLY from `confirming`** (any other state → `IllegalStateTransition` → rejected, no commit). Unit test proves a `confirm_book` from `proposing`/`qualifying` does NOT invoke commit.
- **Double-fire guard:** on commit SUCCESS *or* the email fallback, advance to `booked` so a later turn within the session cannot re-fire commit (`booked → booked` is illegal). Unit test proves the second `confirm_book` is rejected.
- **`proposing` delegates to §B16a** (`deps.invokeProposal`) to get slots; emits them as a `scheduling_slots` SSE event (mirror `_presentSlots`). **Advance `qualifying → proposing` ONLY AFTER `invokeProposal` returns `outcome:'ok'`, in the same `saveState` that persists the slots; on `outcome:'no_availability'` STAY in `qualifying`** (offer to widen window / pick another type — do NOT strand a slot-less session in `proposing`). The `none` self-loop ("more times") **ACCUMULATES** the presented slotIds in `saveState` and passes them as `alreadyRejected` on the next `invokeProposal` (mirror how `schedulingFlow` persists `candidate_slots`) so re-propose returns FRESH times.
- **Attendee-not-yet-known:** when `deps.qualifyingContext.attendee.email` is absent (identity not supplied by §B5 form-injection), STAY in `qualifying` — the LLM collects it; `invokeProposal` MAY run (availability needs no identity), but `confirm_book` is only offered once `attendee.email` is present (the §B16c commit REQUIRES it). The integrator re-supplies `deps.qualifyingContext` each turn.
- **`booked` delegates to the §B16c commit seam** (`deps.invokeBookingCommit`). Forward the selected `slot.candidateResourceIds`, `attendee`, `appointment_type`, and **`pool_size` = the propose response's TOP-LEVEL `poolSize`** (NOT `slot.candidateResourceIds.length`) + `tie_breaker`/`round_robin_cursor`. On `SLOT_UNAVAILABLE` → return to `proposing` (re-offer). On `COMMIT_FAILED` / invoke error → emit the "we'll confirm by email" fallback notice + advance to `booked` (no silent no-op). On `BOOKED` → confirmation turn revealing the assigned coordinator (from the commit's returned `resourceId`).
- **No-regression:** with no new-booking intent / no scheduling session, `runNewBookingTurn` returns `{ handled: false }` and normal chat is untouched. With the calendar/invoke seam unwired (`deps` absent), execution is SKIPPED non-fatally (detection + transitions still run) — exactly like `schedulingFlow.js`.
- **Feature-gated:** the flow is dormant unless `feature_flags.scheduling_enabled === true` (reuse `bindingContext.isSchedulingEnabled(config)`).
- Unit coverage ≥ the BSH ratchet; the structured-action detector is fail-closed-tested (malformed model output → `none` → no commit).

## You OWN (create/edit ONLY these — disjoint ownership)
- `Bedrock_Streaming_Handler_Staging/scheduling/newBookingFlow.js` (new).
- `Bedrock_Streaming_Handler_Staging/scheduling/__tests__/newBookingFlow.test.js` (new).

## You CONSUME (frozen — never modify; see [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md))
- **§B16b** (your action vocab + the boundary — honor exactly), **§B16a** (the propose route I/O you invoke via `deps.invokeProposal`), **§B16c** (the commit route I/O you invoke via `deps.invokeBookingCommit`).
- **§B14** — THE BOUNDARY (state machine authoritative / structured-action-only). Copy the pattern from the SHIPPED `Bedrock_Streaming_Handler_Staging/scheduling/schedulingFlow.js` (your sibling — read it end-to-end; your module is its new-booking twin).
- **C9 `shared/scheduling/stateMachine.js`** `transition` / `IllegalStateTransition` / `SESSION_STATES` — the only transition authority; never hand-roll a state check.
- `Bedrock_Streaming_Handler_Staging/scheduling/bindingContext.js` `isSchedulingEnabled` (the feature gate predicate).
- **§B3** slot shape (what you render as chips on the wire) — `{ slotId, start, end, label, ... }`.

## You PRODUCE (the contract others depend on — honor it exactly)
- `runNewBookingTurn({ responseText, conversationHistory, tenantId, sessionId, config, bedrock, write, deps })` → `{ handled, executed?, action?, state?, rejected?, reason? }` — the post-stream entry the integrator wires into the BSH handler (mirrors `runSchedulingTurn`). Keep the **DI seam** clean: `deps.invokeProposal`, `deps.invokeBookingCommit`, `deps.loadState`, `deps.saveState`, `deps.qualifyingContext` (the resolved appt-type/routing/identity the integrator's entry-hook supplies), all injectable; real defaults only for the esbuild-safe pieces (stateMachine, the detector). Absent I/O seam → skip execution non-fatally.

## OUT OF SCOPE / do NOT
- Do NOT edit `Bedrock_Streaming_Handler_Staging/index.js` — the **integrator** owns the entry-hook wiring + the LIVE deps injection (real `LambdaClient` invoke of BCH for propose+commit, the state store, IAM grant, the `scheduling_intent:'new_booking'` bootstrap) per §B16d. Provide the DI seam; do NOT wire it live. (This mirrors the recovery loop: WS-CONVO built the module; the integrator did the Tier-1/Tier-2 deps-wiring.)
- Do NOT write Booking rows, call calendar/Zoom APIs, or import `googleapis` — BSH cannot bundle it; ALL calendar work is delegated to BCH via the invoke seams. (This is the whole reason the wave is split.)
- Do NOT touch `Booking_Commit_Handler/**`, any picasso file, IaC, or any shared doc. Propose doc/kanban updates as a PR snippet.
- Do NOT redefine §B16 / §B14 / the C9 state machine — escalate any gap in the PR; never fork.
- Do NOT add a new session state or skip a transition (no `qualifying → confirming` shortcut — §9.2 forbids it even when context is full).

## References
- Plan §5 (Sub-phase C — C9 state machine, C12 chat flow, §9.2 no-skips, §10.4 coordinator-revealed-at-confirm).
- Canonical `scheduling_design.md` §9.2 (states) / §9.3 (slots) / §10.4 (generic chips, identity at confirm).
- **Read first:** the SHIPPED `schedulingFlow.js` (your reschedule/cancel twin) — same boundary, same DI/fallback patterns, same SSE-emit shape. Your module is the new-booking analog.
- `CLAUDE.md` (SOP, drift cap, schema discipline, never-share-IAM, credential-mutation gate).

## Report-back (in your PR)
- PR title `feat(scheduling): WS-NEWBOOK-FLOW in-chat new-booking flow (B16b)`, base `main`.
- Include a **doc-snippet** block: kanban row + plan-row status. No PII surface (the module handles identity only as injected `deps`, persists nothing) → SAY SO; no `pii-inventory.md` line.
- Tell the integrator: branch, PR #, done-bar status, the exact `deps` seam you expose (so the integrator wires it), any §B16/§B14/C9 escalation.
- **Branch cleanup** after merge: `git worktree remove <dir>` + `git branch -d <branch>`.

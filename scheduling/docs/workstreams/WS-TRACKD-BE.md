# WS-TRACKD-BE — Track D backend fixes (bindingContext + dayPicker off-by-one + postFormOffer)

**Plan task(s):** design-doc Appendix-A Track-D items D3/D4 (backend side); design-doc §6 (chip CSS fix is FE — not here); design-doc §0 QA residual (state-blind narration fix).
**Repo / branch / base:** lambda repo (`Lambdas/lambda`) · `feat/ws-trackd-be` · base `main`.
**Quality gate:** `verify-before-commit` (always) · weave-time audit = **FULL** (touches session-context injection, the in-chat flow, and a new form-submission-triggered propose path).

## Goal / done-bar (verifiable)

### Fix 1 — bindingContext: inject state line for in-flight NEW-booking sessions

1. `scheduling/bindingContext.js` `injectSchedulingContext` already injects a §B10 recovery state line for in-flight RESCHEDULE/CANCEL sessions. Extend it to ALSO inject a state line for in-flight NEW-booking sessions (state = qualifying | proposing | confirming) in the format specified by §B17d:
   `"[scheduling state: proposing | staged slot: Fri Jun 12 9:30 (s1) | email: known/unknown]"`
   — so the non-agent (legacy/flag-off) chat path stops claiming "no scheduling access" for new-booking in-flight sessions.
2. The injection is additive; existing §B10 recovery-state injection is unchanged.
3. Tests in `scheduling/__tests__/bindingContext.test.js` (extend existing file; do not create a new one):
   - qualifying session → state line injected with "none" staged slot.
   - proposing session (candidate_slots present) → state line injected with slot label.
   - confirming session (selected_slot present) → state line injected with slot label + "email: known".
   - confirming session (no email) → "email: unknown".
   - No scheduling session → no state line injected (regression: existing behavior unchanged).
   - Recovery session (§B10) → existing recovery binding unchanged (regression).

### Fix 2 — dayPicker: format civil date not UTC-midnight instant

4. `scheduling/dayPicker.js` `formatDayLabel` currently formats the UTC-midnight ISO timestamp using the user's time zone, rendering one calendar day behind for US time zones (e.g. `2026-06-15T00:00:00Z` renders as "Sun, Jun 14" in America/Chicago). Fix: format the **civil date** extracted from the `YYYY-MM-DD` input string (year/month/day parsed directly as a local date), not the UTC-midnight instant.
5. Tests in `scheduling/__tests__/dayPicker.test.js` (new or extend existing):
   - Label for `2026-06-15` in `America/Chicago` (UTC-5) renders "Mon, Jun 15" (not "Sun, Jun 14").
   - Label for `2026-06-15` in `America/New_York` (UTC-4) renders "Mon, Jun 15".
   - Label for `2026-06-15` in `UTC` renders "Mon, Jun 15" (no regression).
   - **TZ-shift regression case:** a date that spans a midnight rollback in the target TZ still formats the correct civil day.

### Fix 3 — postFormOffer: post-form scheduling offer module

6. New module `scheduling/postFormOffer.js`: given a completed form submission with `attendee_email` for a scheduling-enabled tenant, returns the templated offer copy + runs `deps.invokeProposal` (design doc Appendix D3). This is a module + tests only; the integrator wires the call site in `form_handler.js`.

   Exported function signature:
   ```js
   // postFormOffer({ tenantConfig, sessionId, attendee, deps })
   //   → { offerText: string, slotsResult: object }
   //   offerText: warm templated copy offering to book a call (e.g. "Would you like to book a quick call? Here are some times that work:")
   //   slotsResult: the raw result from deps.invokeProposal (outcome + slots or error)
   // On deps.invokeProposal outcome:'no_availability':
   //   → { offerText: <warm copy acknowledging no times>, slotsResult }
   // On deps.invokeProposal outcome:'failed':
   //   → { offerText: null, slotsResult } — caller suppresses the offer silently
   // Emits scheduling_slots SSE when outcome:'ok' (via deps.emitSse — injected)
   // Pre-fills attendee_email on the session row (saveState) so request_booking_confirmation
   //   does not need to re-ask — the email is already known from the form submission.
   // NEVER calls invokeBookingCommit. NEVER advances the session to 'confirming' unilaterally.
   ```

7. Tests in `scheduling/__tests__/postFormOffer.test.js`:
   - Success: `invokeProposal` returns `outcome:'ok'` with 3 slots → `offerText` non-null + `scheduling_slots` SSE emitted + `attendee_email` persisted on session row.
   - No availability: `outcome:'no_availability'` → `offerText` non-null warm copy + no SSE emitted.
   - Failed: `outcome:'failed'` → `offerText` null (offer suppressed).
   - attendee_email is NOT logged (assert no email in any emitted audit event).

8. Full suites green: `npm ci && npm test` in `Bedrock_Streaming_Handler_Staging/` AND `npm ci && npm test` in `../shared/scheduling/`.

## You OWN (create/edit ONLY these — disjoint ownership)

- `Bedrock_Streaming_Handler_Staging/scheduling/bindingContext.js` (extend in-flight new-booking injection only)
- `Bedrock_Streaming_Handler_Staging/scheduling/__tests__/bindingContext.test.js` (extend)
- `Bedrock_Streaming_Handler_Staging/scheduling/dayPicker.js` (fix formatDayLabel only)
- `Bedrock_Streaming_Handler_Staging/scheduling/__tests__/dayPicker.test.js` (new or extend)
- `Bedrock_Streaming_Handler_Staging/scheduling/postFormOffer.js` (new)
- `Bedrock_Streaming_Handler_Staging/scheduling/__tests__/postFormOffer.test.js` (new)

## You CONSUME (frozen — never modify; see [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md))

- **§B17d** — session-state line format (the exact string shape injected by bindingContext; match it verbatim).
- **§B16a** — `scheduling_propose` BCH route (consume via `deps.invokeProposal` in postFormOffer).
- **§B16b** — shared staging path; `saveState` call in postFormOffer must use the same whitelist as the deterministic pipeline.
- **§B14** — action boundary; postFormOffer NEVER commits.
- **§B10** — recovery binding (existing; your bindingContext change must not disturb it).
- `EMAIL_SHAPE` from `newBookingEntry.js` — import; do not copy.

## OUT OF SCOPE / do NOT

- Do NOT touch `index.js`, `newBookingFlow.js`, `newBookingEntry.js`, `form_handler.js`, or any shared doc.
- Do NOT wire `postFormOffer` into `form_handler.js` — that is integrator glue.
- Do NOT touch any FE code (WS-TRACKD-FE owns the chip CSS).
- Do NOT implement `invokeBookingCommit` or any booking-write path.

## References

- Design doc `scheduling/docs/AGENTIC_SCHEDULING_SLICE_DESIGN.md` §3.2 (state line), §6, Appendix D3/D4.
- `FROZEN_CONTRACTS.md` §B17d, §B16a, §B16b, §B14, §B10.
- `CLAUDE.md` — SOP, schema discipline, never-share-IAM.
- Read all source via `git show origin/main:<path>` — never the stale parked checkout.

## Report-back (in your PR)

- PR title `feat(scheduling): WS-TRACKD-BE — bindingContext state-line + dayPicker fix + postFormOffer`, base `main`.
- Include done-bar status per fix (1–3, items 1–8), suite summary lines.
- Include a **doc-snippet** block: kanban row update for the integrator.
- STOP and flag in the PR if §B17d or the shared staging path looks wrong — never fork; escalate.
- **Branch cleanup (after merge):** `git worktree remove <dir>` + `git branch -d feat/ws-trackd-be`.

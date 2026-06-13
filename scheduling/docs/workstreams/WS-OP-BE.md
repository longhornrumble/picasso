# WS-OP-BE — offer presentation, backend (diverse-3 sampling + context envelope + prompt b17e.v6)

**Plan task(s):** §B18 (FROZEN_CONTRACTS, LOCKED 2026-06-12) — operator-minted offer-presentation increment; kanban §7 "Offer presentation" rows.
**Repo / branch / base:** lambda repo (`Lambdas/lambda`) · `feat/ws-op-be` · base `main`.
**Quality gate:** `verify-before-commit` (always) · weave-time audit = **FULL** (touches the propose path all consumers share + the agent prompt).

## Context (why)

Soak-day finding: `scheduling_propose` returns the earliest-5 slots, and `generateSlots` itself stops
generating once it has 5 — so offers cluster ("three Tuesday-morning chips"). The operator minted a
presentation redesign: 3 chips sampling dayparts first, day-spread when one day can't provide, with a
context line and a refinement microcopy close (FE-rendered). §B18 is the binding contract; read it first.

## Goal / done-bar (verifiable)

### Task 1 — §B18a diverse-3 sampling in `pool.select`

1. `shared/scheduling/pool.js`: `select()` gains an OPTIONAL `sampling: { mode: 'daypart-diverse', count: 3 }` arg.
   - Absent → behavior byte-identical to today (earliest-first slice at `maxSlots`, default 5) — regression-pinned.
   - Diverse mode: call `generateSlots` with `maxSlots = CANDIDATE_CAP = 48` per resource (slots.js is NOT modified —
     pool just passes the wider cap); after the existing byStart merge + `alreadyRejected` filter, sample `count`
     chips per the §B18a pick rules (earliest overall → different daypart preferring pick-1's day → third
     daypart/day-spread; output sorted chronologically; ≤count candidates → return all). Dayparts computed in
     `userTimeZone`: morning < 12:00 · midday 12:00–14:59 · afternoon ≥ 15:00.
   - Per-chip shape UNCHANGED. `status`/`poolBranch`/`orderedPool`/`tieBreaker`/`roundRobinCursor` UNCHANGED.
2. Tests in `shared/scheduling/__tests__/pool.test.js` (extend; match existing style):
   - Day with morning+midday+afternoon availability → 3 chips, 3 distinct dayparts, same day, chronological.
   - Morning-only day 1, afternoon available day 2 → picks span dayparts across days (day-spread fallback).
   - All candidates one daypart (e.g. §B16e-windowed afternoon) → day-spread within that daypart.
   - Single-day `dateWindow` → diversity within that day only.
   - `alreadyRejected` filtered BEFORE sampling (a rejected earliest slot never reappears as pick 1).
   - ≤3 candidates after filtering → all returned, sorted.
   - NO `sampling` arg → output identical to pre-change fixtures (regression).

### Task 2 — §B18b context envelope in `scheduling_propose`

3. `Booking_Commit_Handler/scheduling-propose.js`: pass `sampling: { mode: 'daypart-diverse', count: 3 }`
   to `pool.select` UNCONDITIONALLY (no flag — §B18a), and build the ADDITIVE OUT field from the already-resolved
   AppointmentType row + `userTimeZone`:
   `context: { duration_minutes, conference_type, conference_label, tz_label }`
   - `conference_label` map per §B18b (google_meet→'Google Meet', zoom→'Zoom', phone→'Phone call',
     in_person→'In person', unknown→null). Missing `conference_type` → default per the shipped
     `newBookingEntry.js` convention (`google_meet`).
   - `tz_label`: generic zone name in `userTimeZone` (Intl `longGeneric`, fall back to `shortGeneric`/`short`
     on RangeError; null if all fail). Never an IANA id.
   - All fields null-tolerant; `context` itself always present on `outcome:'ok'` from the NEW code.
4. Tests (extend the existing scheduling-propose test file): context built correctly for a google_meet 30-min
   type in America/Chicago ('Google Meet', 'Central Time'); unknown conference_type → null label; sampling arg
   actually passed to pool.select (spy).

### Task 3 — forward `context` on every `scheduling_slots` emitter (BSH)

5. All three emitters forward `context` when the propose result carries it (ADDITIVE; omit when absent —
   old-shape tolerant per CLAUDE.md schema discipline):
   - `Bedrock_Streaming_Handler_Staging/scheduling/newBookingFlow.js` `_propose` SSE →
     `{ type:'scheduling_slots', slots, context?, session_id }`
   - `Bedrock_Streaming_Handler_Staging/scheduling/agentTools.js` `get_available_times` executor's UI SSE
   - `Bedrock_Streaming_Handler_Staging/scheduling/postFormOffer.js` SSE emission
6. **Old-shape fixture test (REQUIRED by the §B16a amendment):** each emitter handles a propose result
   WITHOUT `context` (no crash, no `context` key on the SSE).

### Task 4 — §B17e rule 12 / prompt `b17e.v6`

7. `Bedrock_Streaming_Handler_Staging/scheduling/agentTurn.js`: add the §B17e rule-12 narration rule (when
   presenting times, no model-authored closing question — the interface renders the refinement microcopy);
   bump `PROMPT_VERSION` to `'b17e.v6'`.
8. If the deterministic offer copy (newBookingFlow / index-copy constants consumed by it) ends with a dead-end
   closing question ("Which works best?" or similar), drop/soften it per §B18c. If none exists, note that in
   the PR body — do not invent a change.
9. Jest additions (`agentEvals.test.js` or the agentTurn test file, matching where prompt-content assertions
   live today): prompt contains the rule-12 text; `PROMPT_VERSION === 'b17e.v6'`.

### Task 5 — live-eval doc rows

10. `scheduling/docs/agentic-live-eval.md` (lambda repo): add **A15** (offer diversity: with a multi-daypart
    calendar, one offer turn yields 3 chips spanning ≥2 dayparts — or ≥2 days when one day can't provide;
    chips chronological) and **A16** (agent presents times WITHOUT a trailing closing question). Follow the
    existing case format (setup / action / pass criteria / result column left blank).

### Suites

11. Full suites green and summary lines pasted in the PR: `npm ci && npm test` in `shared/scheduling/`,
    `Bedrock_Streaming_Handler_Staging/` (npm ci in BOTH dirs — worktrees need both), and the
    Booking_Commit_Handler suite.

## You OWN (create/edit ONLY these — disjoint ownership)

- `shared/scheduling/pool.js` + `shared/scheduling/__tests__/pool.test.js`
- `Booking_Commit_Handler/scheduling-propose.js` + its existing test file
- `Bedrock_Streaming_Handler_Staging/scheduling/newBookingFlow.js`
- `Bedrock_Streaming_Handler_Staging/scheduling/agentTools.js`
- `Bedrock_Streaming_Handler_Staging/scheduling/agentTurn.js`
- `Bedrock_Streaming_Handler_Staging/scheduling/postFormOffer.js`
- `Bedrock_Streaming_Handler_Staging/scheduling/__tests__/` (extend existing files for the modules above)
- `scheduling/docs/agentic-live-eval.md`

## You CONSUME (frozen — never modify)

- §B18 (the whole seam — your spec), §B16a as amended (propose IN/OUT), §B16e (date_window), §B17b–§B17e
  (agent loop/prompt — you ADD rule 12 + version bump only), §B14 (no commit path changes — don't touch).
- `shared/scheduling/slots.js` — explicitly NOT yours; the wider cap is passed from pool.js.

## You PRODUCE (the contract others depend on)

- §B18a sampling behavior + §B18b `context` on the propose OUT and on every `scheduling_slots` SSE —
  WS-OP-FE renders exactly what you emit. Shape EXACTLY per §B18b; `context` optional on the wire.

## OUT OF SCOPE / do NOT

- NO FE changes (picasso repo is WS-OP-FE's). NO "More times" chip or any new chip kind. NO calendar picker.
- NO analytics events (FE-only per §B18d). NO new feature flag. NO slots.js edits. NO commit-path /
  `request_booking_confirmation` changes. NO shared docs edits (FROZEN_CONTRACTS, kanban, pii-inventory —
  integrator-owned). NO IaC.
- A frozen contract that looks wrong → STOP and flag in the PR; never fork it.

## References

- `scheduling/docs/FROZEN_CONTRACTS.md` §B18 (LOCKED), §B16a (amended 2026-06-12), §B17e (rule 12 amendment).
- Repo conventions: CLAUDE.md (schema discipline, verify-before-commit, branch routing).
- Current selection code: `shared/scheduling/pool.js` ~L280–340 (byStart merge + earliest slice);
  `shared/scheduling/slots.js` ~L266–277 (the generation early-stop you are lifting via the cap).

## Report-back (in your PR)

- PR: lambda repo, base `main`, title `feat(scheduling): §B18 offer presentation BE — diverse-3 sampling + context envelope + b17e.v6`.
- Body MUST include: done-bar status per task (1–11), test summary lines, the doc-snippet block below for the
  integrator to apply, any contract issue found.

```doc-snippet (integrator applies; do not edit shared docs yourself)
kanban WS-OP-BE → IN REVIEW (PR #___): tasks 1–11 status; deterministic-copy finding (task 8): ___
```

# WS-OP-FE — offer presentation, frontend (context line + microcopy close + §B18d analytics)

**Plan task(s):** §B18 (FROZEN_CONTRACTS, LOCKED 2026-06-12) — operator-minted offer-presentation increment; kanban §7 "Offer presentation" rows.
**Repo / branch / base:** picasso repo (Working_Folder root) · `feat/ws-op-fe` · base `staging`.
**Quality gate:** `verify-before-commit` (always) · weave-time audit = **FULL** (adds analytics emissions — PII-sensitive surface; the no-PII payload rule is a hard gate).

## Context (why)

The §B18 offer-presentation increment: the backend (WS-OP-BE) now returns 3 daypart-diverse chips plus an
ADDITIVE `context` field; the FE renders the context line and the refinement microcopy, and instruments the
four §B18d analytics events that will decide the parked calendar-picker question. Read §B18 first.

## Goal / done-bar (verifiable)

### Task 1 — context line (§B18b)

1. `Picasso/src/context/StreamingChatProvider.jsx`: the `scheduling_slots` SSE handler also attaches
   `obj.context` (when present) as `metadata.schedulingContext` on the same message the slots attach to
   (absent → key not set; merging new slots into an existing message sets it only if absent — the
   appointment type is fixed per session, so values are identical).
2. `Picasso/src/components/chat/SchedulingSlots.jsx`: when `metadata.schedulingContext` is present, render
   ONE line above the chips: join the non-null parts of
   [`${duration_minutes} min`, `conference_label`, `tz_label`] with `' · '`
   (e.g. **"30 min · Google Meet · Central Time"**). No context → no line (old-shape tolerant; REQUIRED
   fixture test per the §B16a amendment).

### Task 2 — microcopy close (§B18c)

3. `SchedulingSlots.jsx`: under EVERY rendered slot-chip set, render EXACTLY:
   `If none of these work, just tell me what does — like 'Thursday afternoon.'`
   Muted helper-text styling consistent with existing widget copy. NO "More times" chip (operator decision —
   do not add one). Day-strip (`SchedulingDayPicker`) rendering is UNCHANGED except task 4's analytics.

### Task 3 — analytics constants + emissions (§B18d)

4. `Picasso/src/analytics/eventConstants.js`: add the four §B18d event types + include them in
   `ALL_EVENT_TYPES`:
   `SCHEDULING_CHIP_CLICKED`, `SCHEDULING_DAY_STRIP_ENGAGED`, `SCHEDULING_TYPED_REFINEMENT`,
   `SCHEDULING_TIME_TO_BOOKED`.
5. Emissions (via the EXISTING `emitAnalyticsEvent`/`notifyParentEvent` envelope path — no new transport):
   - `SchedulingSlots.jsx` chip click → `SCHEDULING_CHIP_CLICKED { slot_id, position, slot_count }`
     (emit alongside the existing `sendMessage(...)` dispatch; do not alter the routing_metadata signal).
   - `SchedulingDayPicker.jsx` day click → `SCHEDULING_DAY_STRIP_ENGAGED { day, position }` (day = YYYY-MM-DD).
   - Typed refinement: when the user sends FREE TEXT (a send with NO `scheduling_action` /
     `scheduling_day_selected` / confirm metadata) while the LATEST assistant message carries
     `metadata.schedulingSlots` → `SCHEDULING_TYPED_REFINEMENT { slots_visible_count }`. The payload
     builder's signature accepts ONLY `slots_visible_count: number` — structurally unable to capture the
     typed text (§B18d advisory N-1). Implement at the provider's send path (single choke point).
   - `scheduling_booked` SSE (NEW handler in `StreamingChatProvider.jsx`; analytics-only — UI behavior
     unchanged) → `SCHEDULING_TIME_TO_BOOKED { ms, offers_seen }` where `ms` = now − the session's FIRST
     `scheduling_slots` receipt (track first-offer timestamp + offers-seen count in provider state,
     in-memory). No first-offer timestamp (e.g. page reloaded mid-flow) → SKIP the event entirely.
6. **HARD RULE (PII — §B18d as advisory-hardened 2026-06-12; merge-blocking):**
   - All four payload builders take SCALAR arguments — NEVER a slot object (pass `slot.slotId`, never
     `slot`).
   - Jest gate per event: `Object.keys(payload)` equals EXACTLY the contracted keys; counts/`ms` are
     `number`; `slot_id` matches `^slot#` + ISO-8601; `day` matches `^\d{4}-\d{2}-\d{2}$`; PLUS the
     substring forbid (`JSON.stringify(payload)` contains no `'@'`, no message text, no email, no name).
   - This client gate is the ONLY enforcement point in the pipeline (the processor persists payloads
     verbatim) — treat any deviation as a contract violation, not a style issue.

### Task 4 — tests + suites

7. Tests (extend the existing `__tests__` files for each touched component/provider, matching style):
   - context line renders joined parts; null parts dropped; absent context → no line (old-shape fixture).
   - microcopy renders under chips, exact string.
   - each of the four events fires at its trigger with the contracted payload keys; typed-refinement does
     NOT fire when the send carries scheduling routing_metadata, and does NOT fire when the latest
     assistant message has no slots; time-to-booked skipped without a first-offer timestamp.
   - the PII assertion of task 6.
8. Full suite + build green; paste summary lines in the PR (`npm test`, `npm run build:staging`).

## You OWN (create/edit ONLY these — disjoint ownership)

- `Picasso/src/analytics/eventConstants.js`
- `Picasso/src/components/chat/SchedulingSlots.jsx`
- `Picasso/src/components/chat/SchedulingDayPicker.jsx`
- `Picasso/src/context/StreamingChatProvider.jsx`
- `Picasso/src/context/shared/messageHelpers.js` (only if the context-merge needs it)
- The corresponding existing `__tests__` files for the above

## You CONSUME (frozen — never modify)

- §B18b context shape + §B18c exact microcopy string + §B18d event payloads (FROZEN_CONTRACTS).
- The `scheduling_slots` / `scheduling_booked` SSE shapes (§B16a-amended / shipped emitter) — render-only.
- The deterministic click signals (`scheduling_action`, `scheduling_slot_id`, `scheduling_day_selected`) —
  unchanged; analytics ride ALONGSIDE, never replace or reorder them.
- `mergeSchedulingSlots` dedupe-cap-10 semantics — unchanged.

## You PRODUCE (the contract others depend on)

- The four §B18d analytics event emissions (exact types + payload keys) — the picker decision and offer-shape
  tuning read these from the analytics store; payload drift breaks that evidence base.

## OUT OF SCOPE / do NOT

- NO "More times" chip. NO calendar picker / iframe-resize work (PARKED). NO backend/lambda changes.
- NO dashboard visualization. NO new analytics transport/endpoint. NO change to chip-click routing behavior.
- NO shared docs edits (FROZEN_CONTRACTS, kanban, pii-inventory — integrator-owned). NO IaC.
- A frozen contract that looks wrong → STOP and flag in the PR; never fork it.

## References

- `scheduling/docs/FROZEN_CONTRACTS.md` §B18 (LOCKED — esp. B18b/c/d), §B16a amendment.
- Existing emission pattern: `Picasso/src/components/chat/MessageBubble.jsx` (`ACTION_CHIP_CLICKED`) +
  `Picasso/src/iframe-main.jsx` `notifyParentEvent` (envelope + queue/flush — do not modify it).
- CLAUDE.md (schema discipline, verify-before-commit, branch routing — FE code PRs base `staging`).

## Report-back (in your PR)

- PR: picasso repo, base `staging`, title `feat(scheduling): §B18 offer presentation FE — context line + microcopy + analytics events`.
- Body MUST include: done-bar status per task (1–8), test + build summary lines, the doc-snippet block below,
  any contract issue found.

```doc-snippet (integrator applies; do not edit shared docs yourself)
kanban WS-OP-FE → IN REVIEW (PR #___): tasks 1–8 status; note any payload-key deviation (should be none)
```

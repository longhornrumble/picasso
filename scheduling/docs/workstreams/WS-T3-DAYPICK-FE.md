# WS-T3-DAYPICK-FE — Surface-4 day-picker fallback (widget)

Plan task: A8 / Surface-4. Repo/branch/base: picasso repo (Working_Folder root) · `feature/scheduling-t3-daypick-fe` · base `staging` (**cut from origin/staging — the C12 scheduling components live there, NOT on main**).
Quality gate: verify-before-commit (always) · weave audit = light (additive render surface; no auth/PII).

## Goal / done-bar (verifiable)
1. A `scheduling_day_picker` SSE message (§B16e shape) renders a 7-day strip: Intl.DateTimeFormat labels in `user_time_zone` (NO tz lib), swipe-able/scrollable ≤375px, CSS logical properties, chip label ≤28 chars, WCAG 2.1 AA (focus order, aria-labels, contrast via shared tokens).
2. Tapping a day sends the next turn with the deterministic `scheduling_day_selected: 'YYYY-MM-DD'` signal (mirror how C12 sends `scheduling_intent`/`scheduling_slot_id`) — test-pinned exact payload.
3. Unknown/malformed `days` entries are skipped without crashing (schema-discipline test).
4. Existing `SchedulingSlots` chips and snapshot tests unchanged; full widget test suite green.

## You OWN (create/edit ONLY these)
- NEW `Picasso/src/components/chat/SchedulingDayPicker.jsx` + `__tests__/SchedulingDayPicker.test.jsx`.
- The message-type dispatch points ONLY where `scheduling_slots` is already routed (locate via `git grep scheduling_slots origin/staging -- Picasso/src`: the StreamingChatProvider SSE routing + the renderer switch) — add the `scheduling_day_picker` case alongside, touching the minimum lines.
- The request-body signal injection point where `scheduling_intent` is sent — add `scheduling_day_selected` the same way.

## You CONSUME (frozen — never modify)
- §B16e (message + signal shapes — exact). C12's `SchedulingSlots.jsx` as the style/pattern reference (do not edit it).

## OUT OF SCOPE / do NOT
- NO backend/lambda changes (WS-T3-DAYPICK-BE owns the emit). NO new dependencies (no date libs). NO shared docs/IaC. NO redesign of existing chips.

## Report-back (in your PR)
Title `feat(scheduling): T3 — Surface-4 day-picker strip (widget, §B16e)`, base `staging`. Include: done-bar status, test summary lines, kanban doc-snippet, any contract concern (STOP and flag).

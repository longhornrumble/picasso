# WS-TRACKD-FE — Track D frontend: SchedulingDayPicker chip CSS fix

**Plan task(s):** design-doc §6 / QA P1-7 (chip label clipping to circles).
**Repo / branch / base:** picasso repo (`Picasso/`) · `feat/ws-trackd-fe` · base `staging`.
**Quality gate:** `verify-before-commit` (always) · weave-time audit = **LIGHT** (pure CSS + tests; no logic change).

## Goal / done-bar (verifiable)

1. `SchedulingDayPicker` chip labels no longer clip to circles. Chips render their full text labels (e.g. "Mon, Jun 15") identically to how `SchedulingSlots` chips render their labels. The root cause is a CSS rule that constrains chip width or sets `border-radius` to `50%` / `aspect-ratio: 1`; fix it to match the pill/rounded-rectangle shape used by SchedulingSlots chips.
2. No other layout, behavior, or component is changed. The SchedulingDayPicker's 7-day strip layout, swipe behavior, and tap handler are untouched.
3. `SchedulingDayPicker` test file is updated to assert that chip elements have `border-radius` consistent with a pill shape (not a circle) and that label text is not truncated. Tests that were already passing continue to pass (regression).
4. Full suite green: `cd Picasso && npm test` — 333+ tests pass. No new failures.

## Scope note — resume_scheduling / D4 path

The resume_scheduling (D4) affordance is **NOT in scope for this work-order**. Per the design-doc §6 review, the resume path rides the existing `scheduling_confirm` SSE → `SchedulingConfirmCard` path. The backend re-emits a `scheduling_confirm` event at session re-entry; the FE confirm card renders with zero new FE surface. No new component, no new SSE event type, no new dispatch action. This v1 scope is: chip CSS only.

## You OWN (create/edit ONLY these — disjoint ownership)

- `Picasso/src/components/scheduling/SchedulingDayPicker.jsx` (chip CSS / class fix only)
- `Picasso/src/components/scheduling/SchedulingDayPicker.css` (or equivalent style file) if the fix is CSS-only
- `Picasso/src/components/scheduling/__tests__/SchedulingDayPicker.test.jsx` (extend / fix assertions)

## You CONSUME (frozen — never modify; see [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md))

- **§B16e** — `scheduling_day_picker` SSE shape (`days:[{date, label}]`, `user_time_zone`). Your CSS fix does not change the SSE contract or the tap signal; the `scheduling_day_selected` widget signal remains unchanged.
- `SchedulingSlots` chip shape — look at it as the reference style; do not modify it.

## OUT OF SCOPE / do NOT

- Do NOT touch `SchedulingSlots.jsx`, `SchedulingConfirmCard.jsx`, `MessageBubble.jsx`, or any backend file.
- Do NOT implement the resume_scheduling affordance (that rides the existing confirm-card path; no FE work needed).
- Do NOT change the `scheduling_day_selected` signal or the tap handler logic.
- Do NOT touch any shared doc (kanban, contracts, pii-inventory). Post doc-snippets in the PR.

## References

- Design doc `scheduling/docs/AGENTIC_SCHEDULING_SLICE_DESIGN.md` §6 + QA P1-7 note.
- `FROZEN_CONTRACTS.md` §B16e (day-picker SSE shape; for reference only — CSS fix does not change it).
- `CLAUDE.md` — SOP.
- Read all source via `git show origin/staging:<path>` — never the stale parked checkout. Branch base is `staging`.

## Report-back (in your PR)

- PR title `feat(scheduling): WS-TRACKD-FE — SchedulingDayPicker chip CSS fix (P1-7)`, base `staging`.
- Include done-bar status per item (1–4) and the `npm test` summary line (N tests passed).
- Include a **doc-snippet** block: kanban row update for the integrator to apply to PARALLEL_WORKSTREAMS.md.
- STOP and flag in the PR if the contract or the existing SchedulingConfirmCard behavior looks wrong — escalate to the integrator.
- **Branch cleanup (after merge):** `git worktree remove <dir>` + `git branch -d feat/ws-trackd-fe`.

# WS-C12 — new-booking frontend (slot chips + echo-back confirm + CTA start signal)

> Integrator authors this; you treat it as a read-only brief. You build ONE slice in an isolated worktree.

**Plan task(s):** C12 (frontend chat-flow integration) — [implementation plan](../scheduling_implementation_plan.md) §5 (Sub-phase C, C12).
**Repo / branch / base:** `picasso` · `feature/scheduling-ws-c12` · base `staging`.
**Quality gate:** `verify-before-commit` (always) · weave-time audit = **LIGHT** (additive UI; no auth/PII/commit surface — the chips render server-provided generic data, the signal is an opaque intent flag) per [§5 risk rule](../PARALLEL_WORKSTREAMS.md#5-risk-calibrated-audit-rule-lever-4).

## Goal / done-bar (verifiable)
- The widget renders the backend's **`scheduling_slots`** SSE event as **generic slot chips** (each `{ slotId, start, end, label }` → a tappable chip showing `label` ONLY). **Snapshot test asserts a chip contains NO coordinator name** (§10.4 — coordinator identity is revealed only at the confirm step).
- Tapping a chip sends the user's selection back to the backend (the turn the §B14 detector reads as `select_slot`) — reuse the existing CTA/action dispatch path; do not invent a new transport.
- The **confirm step**: the coordinator identity is revealed by the backend's **streaming LLM response** (ordinary chat text — e.g. "Wednesday at 2 PM with Maya — sound good?"), which the widget already renders. Do NOT build a custom renderer or expect a new SSE event for the echo-back. Your only job here is to surface a **confirm affirmative the §B14 detector reads as `confirm_book`** (reuse the CTA/affirmative dispatch). Test: tapping confirm sends the `confirm_book`-eliciting turn.
- The **`start_scheduling` CTA** (already handled in `MessageBubble.jsx` by A2, currently logs + returns) is extended to signal the backend to BEGIN a new-booking session — send **`scheduling_intent: 'new_booking'`** on the dispatched turn (§B16d). Test asserts the signal is sent on `start_scheduling` and is absent on every other CTA.
- A **`scheduling_notice`** SSE event (the "we'll confirm by email" fallback the backend already emits) renders a friendly inline notice.
- All new static user-facing strings go through the existing `t()` indirection (A8b). No coordinator PII is ever rendered before `confirming`.

## You OWN (create/edit ONLY these — disjoint ownership)
- A new slot-chips render component under `src/components/chat/` (e.g. `SchedulingSlots.jsx`) + its colocated test under `src/components/chat/__tests__/`.
- The `scheduling_slots` / `scheduling_notice` SSE-event handling in the chat provider/stream consumer (investigate where SSE events are dispatched — likely a `src/providers/**` chat/streaming provider; add ONLY the new scheduling-event branches, additively). **NOTE:** these event TYPES are ALREADY emitted on the wire by the live recovery-loop (`schedulingFlow.js` — reschedule slot offers) but have **no frontend renderer yet** (deferred to C12). So the chip renderer you build serves BOTH the recovery loop AND new-booking — look for any existing handler stub before building from scratch; build ONE renderer for both.
- `src/components/chat/MessageBubble.jsx` — ONLY the `start_scheduling` handler block (extend the A2 stub to send the `scheduling_intent:'new_booking'` signal) + the echo-back confirm affirmative if it lives here.
- Enumerate the exact files you touched in your PR. If a needed change would land in a SHARED/build/other-feature file (e.g. `widget.js` bootstrap, build config, a non-chat provider), STOP and flag it for the integrator — do not edit it.

## You CONSUME (frozen — never modify; see [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md))
- **§B16d** (the `scheduling_intent:'new_booking'` signal you send) + **§B16b** (the `select_slot` / `confirm_book` user actions you elicit) + **§B3** slot shape (`{ slotId, start, end, label }`) you render.
- The existing widget patterns: the CTA/action-chip dispatch path (mirror it; the recovery loop's `WS-WIDGET` #359 `?session=` forwarding is the precedent for opaque widget→backend plumbing), the SSE consumer, and the `t()` string indirection.

## You PRODUCE (the contract others depend on — honor it exactly)
- The `scheduling_intent:'new_booking'` signal on the `start_scheduling` turn (§B16d) — the backend entry-hook (integrator glue) reads it to create the `qualifying` session.

## OUT OF SCOPE / do NOT
- Do NOT touch any lambda file, IaC, build config, the widget bootstrap (`widget.js`), or any shared doc (plan, kanban, contracts, `pii-inventory.md`). Propose doc/kanban updates as a PR snippet.
- Do NOT render a coordinator name on a slot chip (only at `confirming`) — that is the §10.4 PII boundary.
- Do NOT implement the backend session bootstrap, the propose/commit calls, or any calendar logic — you only render server-provided data + send the opaque intent/selection signals.
- Do NOT redefine §B16 — escalate any gap in the PR.

## References
- Plan §5 (C12 — slot chips generic, coordinator at confirm; `t()` indirection from A8b; E2E happy-path booking flow; snapshot test = no coordinator name in chips).
- Canonical `scheduling_design.md` §10.4.
- Precedent: `WS-WIDGET` #359 (opaque widget→backend param plumbing) + the existing action-chip / CTA dispatch in `MessageBubble.jsx`.
- `CLAUDE.md` (SOP, drift cap — base `staging`; never commit to main; schema discipline; XSS/DOMPurify posture on any rendered server string).

## Report-back (in your PR)
- PR title `feat(scheduling): WS-C12 new-booking slot chips + start signal`, base `staging`.
- Include a **doc-snippet** block: kanban row + plan-row status. No new PII surface (chips are generic; identity rendered only from the server's confirm payload, not stored) → SAY SO; no `pii-inventory.md` line.
- Tell the integrator: branch, PR #, the exact files you owned, done-bar status, any place you had to stop short of a shared file.
- **Branch cleanup** after merge: `git worktree remove <dir>` + `git branch -d <branch>`.

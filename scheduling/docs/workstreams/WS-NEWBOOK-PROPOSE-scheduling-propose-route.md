# WS-NEWBOOK-PROPOSE — `scheduling_propose` BCH route (new-booking availability + slots)

> Integrator authors this; you treat it as a read-only brief. You build ONE slice in an isolated worktree.

**Plan task(s):** C-core `proposing` step (§10.2 pool-at-propose) — [implementation plan](../scheduling_implementation_plan.md) §5 (Sub-phase C, C6/C7 consumed) + the B-remainder note in [PARALLEL_WORKSTREAMS §4.2](../PARALLEL_WORKSTREAMS.md).
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-newbook-propose` · base `main`.
**Quality gate:** `verify-before-commit` (always) · weave-time audit = **FULL** (reads calendars; commit-adjacent; new external-facing route) per [§5 risk rule](../PARALLEL_WORKSTREAMS.md#5-risk-calibrated-audit-rule-lever-4).

## Goal / done-bar (verifiable)
- A NEW `action: 'scheduling_propose'` route in `Booking_Commit_Handler` that, given a tenant + resolved appointment-type + resolved RoutingPolicy + a user timezone, returns **3–5 GENERIC candidate slots** (label only — NO coordinator name, §10.4), each carrying `candidateResourceIds: [...]` + `poolSize`.
- The route is **READ-ONLY**: it writes NO Booking row and does NOT advance round-robin (those are the commit route's job). Unit test asserts no `PutItem`/`UpdateItem` to the Booking or RoutingPolicy tables.
- **Feature-gated, fail-closed**: the gate is applied in the **`index.js` dispatch block you own** — call `gateScheduling(event.tenantId, injected)` there and return a disabled outcome BEFORE invoking your sub-handler, mirroring the existing `scheduling_mutate` block (`index.js` ~L461–471). Do NOT gate inside `scheduling-propose.js` (`scheduling-mutate.js` doesn't either — the gate lives in `index.js`). A disabled tenant does NO calendar I/O.
- **camelCase keys**: the `scheduling_propose` dispatch reads `event.tenantId` (camelCase — matching the `scheduling_mutate` block, NOT the snake_case `event.tenant_id` of the default commit route).
- **`poolSize` is TOP-LEVEL = `pool.select().orderedPool.length`** (the routing pool size), NOT a per-slot field and NOT `candidateResourceIds.length`. Unit test asserts it equals `orderedPool.length`.
- **`no_availability`** outcome when the pool yields zero slots (not an error, not an empty-success ambiguity).
- **PII-clean**: the propose request carries NO attendee identity; the route logs none. Unit test greps the route's log lines for the absence of any email/name field.
- Slot `slotId`s are deterministic + stable enough that the FLOW's `alreadyRejected` ("show me more times") dedup works on a second call.

## You OWN (create/edit ONLY these — disjoint ownership)
- `Booking_Commit_Handler/scheduling-propose.js` (new — the route handler; mirror the structure of the shipped `scheduling-mutate.js`).
- `Booking_Commit_Handler/scheduling-propose.test.js` (new).
- `Booking_Commit_Handler/index.js` — **ONLY** the single dispatch block that routes `event.action === 'scheduling_propose'` to your handler, placed beside the existing `scheduling_mutate` dispatch in `handler()` (additive; do not alter the commit path or the `scheduling_mutate` block).

## You CONSUME (frozen — never modify; see [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md))
- **§B16a** — the route I/O you PRODUCE (below); honor it exactly.
- **C6 `shared/scheduling/pool.js` `select({tenantId, appointmentType, routingPolicy, candidates, userTimeZone, alreadyRejected, windowStart, windowEnd})`** — the SHIPPED orchestrator (freeBusy-per-resource → §B2 `evaluatePool` → §B3 `generateSlots` → merge). Call it; do not re-implement it. Its REAL return is `{ status:'SLOTS_PROPOSED'|'SLOT_UNAVAILABLE', orderedPool, tieBreaker, roundRobinCursor, slots:[{slotId,start,end,label,candidateResourceIds}] }`. **Map it:** `status 'SLOTS_PROPOSED' → outcome 'ok'`; `'SLOT_UNAVAILABLE' → 'no_availability'`; exception → `'failed'`. Pass the chips through unchanged; set TOP-LEVEL `poolSize = orderedPool.length`; carry `tieBreaker`/`roundRobinCursor`.
- **§B1** `availability.getBusyIntervals`, **§B2** `routing.evaluatePool`, **§B3** `slots.generateSlots` — consumed transitively via `pool.select`; do not call them directly unless `pool.select` does not cover a needed step (then escalate).
- **§B7** `shared/scheduling/candidate-resolver.js` `resolveCandidates(appointmentTypeId)` — returns the **candidates list** (`[{resourceId, scheduling_tags, coordinatorEmail}]`, exactly what `pool.select` expects). **VERIFY its shape.** It does NOT return the RoutingPolicy object — read that SEPARATELY (candidate-resolver's policy read or the RoutingPolicy row directly). So from `appointmentTypeId` you resolve THREE things: the AppointmentType row (→ `pool.select`'s `appointmentType`), the RoutingPolicy object (→ `routingPolicy`), the candidates list. If `resolveCandidates` does not fit, build a thin resolver INSIDE your owned module + **flag the §B7 gap in your PR** (do not modify `candidate-resolver.js`).
- The shipped `gateScheduling` / `featureGate` seam in `Booking_Commit_Handler/index.js` (call it; don't change it).

## You PRODUCE (the contract others depend on — honor it exactly)
- **§B16a** `scheduling_propose` route: `IN { action:'scheduling_propose', tenantId, sessionId, appointmentTypeId, userTimeZone, alreadyRejected?, windowStart?, windowEnd? }` → `OUT { outcome:'ok'|'no_availability'|'failed', slots:[{slotId, start, end, label, candidateResourceIds:[...]}], poolSize, tieBreaker?, roundRobinCursor?, error? }`. Note `poolSize` is TOP-LEVEL (not per-slot). WS-NEWBOOK-FLOW consumes this.

## OUT OF SCOPE / do NOT
- Do NOT write a Booking row, call `pool.lockSlot()`, or advance/revert round-robin — the commit route (C8) owns all of that. Propose is read-only.
- Do NOT touch any BSH (`Bedrock_Streaming_Handler_Staging/**`) file, any picasso file, IaC, or any shared doc (plan, `pii-inventory.md`, kanban, `FROZEN_CONTRACTS.md`). Propose doc/kanban updates as a PR snippet.
- Do NOT modify `pool.js` / `availability.js` / `routing.js` / `slots.js` / `candidate-resolver.js` — consume them. If one is wrong/insufficient, STOP and flag it in the PR (contract escalation) — do not fork it.
- Do NOT handle attendee identity, send any email, or reveal a coordinator name in a slot — identity + coordinator reveal happen in the FLOW + at commit.
- Do NOT change the existing default commit route or the `scheduling_mutate` route.

## References
- Plan §5 (Sub-phase C — C6/C7 consumed; §10.1/§10.2 routing+pool; §9.3 slot generation; §10.4 generic-slots rule).
- Canonical `scheduling_design.md` §4.3/§10.1/§10.2/§9.3/§5.7.
- Reference implementation to mirror for structure: `Booking_Commit_Handler/scheduling-mutate.js` (the Tier-2 executor route) — same "a focused BCH sub-route invoked from BSH" shape.
- `CLAUDE.md` (SOP, drift cap, schema discipline / forward-compatible reads, never-share-IAM, credential-mutation gate, ASCII-only IAM strings if you ever touch IaC — you don't here).

## Report-back (in your PR)
- PR title `feat(scheduling): WS-NEWBOOK-PROPOSE scheduling_propose route (B16a)`, base `main`.
- Include a **doc-snippet** block for the integrator: the kanban row status + the plan-row note (no PII surface added — the route is identity-free — so no `pii-inventory.md` line; SAY SO explicitly).
- Tell the integrator: branch, PR #, done-bar status, whether §B7 `resolveCandidates` fit or you built a thin resolver (+ the gap if any), and `pool.select`'s actual return shape you mapped from.
- **Branch cleanup** after merge: `git worktree remove <dir>` + `git branch -d <branch>`.

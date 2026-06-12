# WS-AG-CORE — agentic scheduling: core tool loop (keystone)

**Plan task(s):** design-doc §10 WS-AG-LOOP + WS-AG-TOOLS — the two are merged here into one keystone slice.
**Repo / branch / base:** lambda repo (`Lambdas/lambda`) · `feat/ws-ag-core` · base `main`.
**Quality gate:** `verify-before-commit` (always) · weave-time audit = **FULL** (first agent execution surface on the platform; §B14-adjacent; audit events + kill switches).

## Goal / done-bar (verifiable)

1. `scheduling/agentTurn.js` implements the §B17b bounded loop verbatim: `MAX_TOOL_ITERATIONS = 3`; streams SSE text deltas identical to the non-agent path; executes tool calls server-side via `agentTools.js`; emits the tool's UI SSE event (`scheduling_slots` / `scheduling_confirm`) mid-turn; appends assistant + tool_result blocks and continues; on overflow emits warm-honest templated copy + `scheduling_notice` SSE.
2. `scheduling/agentTools.js` contains exactly two tool executors:
   - `executeGetAvailableTimes`: calls `deps.invokeProposal` (§B16a `scheduling_propose`), emits `scheduling_slots` SSE, persists `candidate_slots` to the session row. Returns the `{ slots:[{slot_id, label, starts_at_iso}], user_time_zone, note }` shape to the model, or `{ error: 'no_availability' | 'lookup_failed', note }`. NEVER re-implements proposal logic — wraps the shipped BCH seam only.
   - `executeRequestBookingConfirmation`: validates `slot_id` against `sessionRow.candidate_slots` (→ `{ error: 'unknown_slot' }` on miss), validates `attendee_email` against the `EMAIL_SHAPE` import from `newBookingEntry.js` (→ `{ error: 'invalid_email' }`), applies the §B17c **anti-hallucination guard** — `attendee_email` is REJECTED unless it appears verbatim in this session's user-side transcript or equals the session row's captured `attendee_email` (→ `{ error: 'invalid_email' }`) — then calls the SAME `saveState` path the deterministic pipeline uses (state→'confirming', selected_slot, attendee_email), and emits `scheduling_confirm` SSE. Returns `{ staged: true, label }` on success. NEVER calls `invokeBookingCommit` — staging only.
3. `Bedrock_Streaming_Handler_Staging/scheduling/TOOL_CATALOG.md` contains the two §B17c tool entries verbatim (description-to-model, input schema, implementation notes, output, errors, side effects) — this is the Phase-0 catalog file.
4. Audit events emitted per §B17g — the field allowlist is **EXHAUSTIVE** (emit nothing not listed): `agent_tool_call` `{tenant_id, session_id, tool (enum), outcome (enum: ok|staged|unknown_slot|invalid_email|no_availability|lookup_failed|overflow), latency_ms, iteration, slot_id?, date?, exclude_slot_ids?, email_present (bool)}` + `agent_turn_summary` `{tenant_id, session_id, iterations, stop_reason_sequence, overflow (bool), prompt_version, model_id, flags_active}` + `suggestion_gate_decision` `{tenant_id, session_id, offered (bool), reason_codes[], suppression_category?}` (category code, never raw text). **FORBIDDEN:** raw attendee_email, ANY email hash, message/narration text, tool_result bodies; error logging = `err.name` only. Tests MUST include: a jest assertion that serialized log lines for an email-bearing turn never contain `'@'`; a jest assertion that the §B17d state line never contains the raw email (exact pinned wording `email: known`/`email: unknown`).
5. Kill switches per §B17h: reads `AGENTIC_SCHEDULING_DISABLED` env first; reads `feature_flags.AGENTIC_SCHEDULING` per tenant; when either blocks, returns without entering the loop. `agentTurn.js` exports a `isAgentTurnEnabled({ env, tenantConfig })` guard that the integrator wires in index.js.
6. Suppression pre-check seam consumed per §B17f: `agentTurn.js` calls the sensitive-context check on EVERY agent turn BEFORE the model call (scan window = full session; sticky session latch; fail-closed — scan error = tripped). The category matcher may be a simple keyword module CORE owns: `scheduling/sensitiveContext.js` + tests, shipping the §B17f non-empty default category list (self-harm/suicide; abuse/neglect/CPS; domestic violence; trafficking; runaway/homeless; medical emergency/overdose; psychiatric crisis; custody/legal proceedings; minor self-identification; grief/death — tenant trim-only, never empty). On trip mid-flow: pause the flow with warm human-contact copy + tenant-configured crisis resources; no unprompted resume; minor self-ID additionally stops email solicitation.
7. `scheduling/__tests__/agentTurn.test.js` — covers: loop terminates on `end_turn` after 0 tool calls; loop executes 1 tool call + continues; overflow at iteration 3 emits scheduling_notice; kill-switch env off suppresses entry; kill-switch flag off suppresses entry; SSE text deltas are forwarded; `get_available_times` result re-enters the loop.
8. `scheduling/__tests__/agentTools.test.js` — covers: `executeGetAvailableTimes` success path + `no_availability` + `lookup_failed`; `executeRequestBookingConfirmation` success path + `unknown_slot` guard (slot_id not in candidate_slots) + `invalid_email` guard + the §B17c verbatim-match email guard (hallucinated address not in transcript → rejected; transcript-present address → accepted); no call to `invokeBookingCommit` in any code path (static assertion or spy).
9. Full suites green: `npm ci && npm test` in `Bedrock_Streaming_Handler_Staging/` **and** `npm ci && npm test` in `../shared/scheduling/` (both required; BSH job is the gating CI check).

## You OWN (create/edit ONLY these — disjoint ownership)

- `Bedrock_Streaming_Handler_Staging/scheduling/agentTurn.js` (new)
- `Bedrock_Streaming_Handler_Staging/scheduling/agentTools.js` (new)
- `Bedrock_Streaming_Handler_Staging/scheduling/sensitiveContext.js` (new — §B17f category matcher + default list)
- `Bedrock_Streaming_Handler_Staging/scheduling/__tests__/agentTurn.test.js` (new)
- `Bedrock_Streaming_Handler_Staging/scheduling/__tests__/agentTools.test.js` (new)
- `Bedrock_Streaming_Handler_Staging/scheduling/__tests__/sensitiveContext.test.js` (new)
- `Bedrock_Streaming_Handler_Staging/scheduling/TOOL_CATALOG.md` (new)

## You CONSUME (frozen — never modify; see [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md))

- **§B17** verbatim — the §B17b loop, §B17c tool schemas (incl. `starts_at_iso`, the authority note, and the attendee_email verbatim-match guard), §B17d state-line format (pinned `email: known/unknown` wording), §B17e narration rules, §B17f suppression pre-check rules (CORE implements the check call; the gate's increment-2 holds stay integrator-wired), §B17g audit event allowlist, §B17h kill-switch semantics.
- **§B16a** — `scheduling_propose` BCH route (consume via `deps.invokeProposal`; do not reimplement).
- **§B16c** — BSH→BCH commit seam. agentTools.js MUST NOT reference this path. The commit is unreachable from agentTurn by design.
- **§B16b / §B16d as amended 2026-06-12** — understand the shared staging path; `executeRequestBookingConfirmation` calls `saveState` (same as the deterministic pipeline), emitting `scheduling_confirm` SSE per §B16b's `select_slot success with identity resolved` shape.
- `EMAIL_SHAPE` — import from `./newBookingEntry.js` (do not copy the regex).
- The existing `deps.invokeProposal` seam — match the call signature already used by `newBookingFlow.js`; do not invent a new one.

## You PRODUCE (consumed by the integrator + WS-AG-EVAL)

- `agentTurn({ event, context, sessionRow, tenantConfig, deps, streamWriter })` — the exported entry-point the integrator wires in index.js routing.
- `isAgentTurnEnabled({ env, tenantConfig })` — the guard the integrator checks before calling agentTurn.
- `TOOL_CATALOG.md` — the §B17c entries; WS-AG-EVAL builds its mocked Bedrock sequences against these shapes.

## OUT OF SCOPE / do NOT

- Do NOT touch `index.js` — the integrator wires the routing branch.
- Do NOT touch `newBookingFlow.js`, `newBookingEntry.js`, or `schedulingFlow.js` — consume them, never modify.
- Do NOT touch any shared doc (plan, kanban, FROZEN_CONTRACTS, pii-inventory). Post doc-snippets in the PR.
- Do NOT implement `invokeBookingCommit` or any path that writes a Booking row. Staging only.
- Do NOT re-implement `scheduling_propose` logic — wrap `deps.invokeProposal` only.
- Do NOT add a new model config — use the tenant's existing `model_id` (Haiku 4.5 default).
- Do NOT implement increment-2 (suggestion gate / AGENTIC_SCHEDULING_SUGGEST) — that is increment 2, out of this slice's scope. Export the guard so the integrator can add the branch later. NOTE: the §B17f **suppression pre-check is NOT increment-2** — it runs on every agent turn (done-bar item 6) and IS in scope; only the suggestion-offer gate holds (#1–#3, #5) are increment-2.

## References

- Design doc `scheduling/docs/AGENTIC_SCHEDULING_SLICE_DESIGN.md` §2/§3.2/§4/§5/§8/§9/§10 (read in full first).
- `FROZEN_CONTRACTS.md` §B17 (all subsections), §B16a, §B16b, §B16c, §B16d, §B14.
- `CLAUDE.md` — SOP, schema discipline, never-share-IAM, credential-mutation gate.
- Read ALL source files via `git show origin/main:<path>` (never the stale parked checkout).

## Report-back (in your PR)

- PR title `feat(scheduling): WS-AG-CORE — agentic tool loop + executors (§B17 keystone)`, base `main`.
- Include done-bar status per item (1–9) and suite summary lines for both BSH + shared/scheduling.
- Include a **doc-snippet** block: the kanban row (`| WS-AG-CORE | feat/ws-ag-core | #<PR> | NOT STARTED→IN PROGRESS | ... |`) for the integrator to apply to PARALLEL_WORKSTREAMS.md.
- STOP and flag in the PR if §B17 looks wrong — never fork the contract; escalate to the integrator.
- **Branch cleanup (after merge):** `git worktree remove <dir>` + `git branch -d feat/ws-ag-core`. Leave no stale branch or worktree.

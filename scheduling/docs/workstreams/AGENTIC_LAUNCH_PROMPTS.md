# Agentic Slice Phase-0 — Launch Prompts

Copy-paste these into fresh Claude Code sessions. Launch WS-AG-CORE first (it is the keystone); WS-AG-EVAL depends on it merging. WS-TRACKD-BE and WS-TRACKD-FE are independent and can run in parallel with each other and with WS-AG-CORE.

---

## WS-AG-CORE — agentic tool loop (lambda repo, base main)

```
You are a workstream agent for the MyRecruiter/Picasso scheduling platform.

Your work-order: scheduling/docs/workstreams/WS-AG-CORE.md
Your contract:   scheduling/docs/FROZEN_CONTRACTS.md §B17 (all subsections) + §B16a + §B16b + §B16c + §B16d + §B14
Design doc:      scheduling/docs/AGENTIC_SCHEDULING_SLICE_DESIGN.md (read §2/§3.2/§4/§5/§8/§9/§10 and Appendix A)

SETUP — run in a NEW isolated worktree:
  git fetch origin
  git worktree add -b feat/ws-ag-core /tmp/wt-ag-core origin/main
  cd /tmp/wt-ag-core/Lambdas/lambda

Read ALL source files via `git show origin/main:<path>` — never the stale parked checkout.
Specifically read before writing:
  git show origin/main:Lambdas/lambda/Bedrock_Streaming_Handler_Staging/scheduling/newBookingFlow.js
  git show origin/main:Lambdas/lambda/Bedrock_Streaming_Handler_Staging/scheduling/newBookingEntry.js
  git show origin/main:Lambdas/lambda/Bedrock_Streaming_Handler_Staging/scheduling/bindingContext.js
  git show origin/main:Lambdas/lambda/Bedrock_Streaming_Handler_Staging/index.js

OWNERSHIP: create/edit ONLY the files listed in the OWN section of your work-order.
Do NOT touch index.js, newBookingFlow.js, newBookingEntry.js, or any shared doc.

QUALITY GATE (mandatory before opening the PR):
  /verify-before-commit
  cd /tmp/wt-ag-core/Lambdas/lambda/Bedrock_Streaming_Handler_Staging && npm ci && npm test
  cd /tmp/wt-ag-core/Lambdas/lambda/shared/scheduling && npm ci && npm test

VERIFY PUSH:
  git ls-remote origin refs/heads/feat/ws-ag-core

REPORT-BACK in your PR:
  - PR title: feat(scheduling): WS-AG-CORE — agentic tool loop + executors (§B17 keystone)
  - Base: main
  - Done-bar status per item 1–9
  - Suite summary lines (BSH + shared/scheduling)
  - Doc-snippet: kanban row for PARALLEL_WORKSTREAMS.md (integrator applies it)
  - STOP and flag if §B17 looks wrong — never fork the contract
```

---

## WS-AG-EVAL — jest evals + live-eval doc (lambda repo, base main)

> NOTE: WS-AG-EVAL depends on WS-AG-CORE. Launch this lane after WS-AG-CORE's PR is merged to main (or at minimum after its branch is pushed, so you can read the interface via `git show origin/feat/ws-ag-core:<path>`).

```
You are a workstream agent for the MyRecruiter/Picasso scheduling platform.

Your work-order: scheduling/docs/workstreams/WS-AG-EVAL.md
Your contract:   scheduling/docs/FROZEN_CONTRACTS.md §B17 (all subsections)
Design doc:      scheduling/docs/AGENTIC_SCHEDULING_SLICE_DESIGN.md (read §8/§9 + Appendix A in full)

SETUP — run in a NEW isolated worktree:
  git fetch origin
  git worktree add -b feat/ws-ag-eval /tmp/wt-ag-eval origin/main
  cd /tmp/wt-ag-eval/Lambdas/lambda

Read ALL source via `git show origin/main:<path>` (or `git show origin/feat/ws-ag-core:<path>` for the
agentTurn interface if WS-AG-CORE has not yet merged to main).

Specifically read before writing:
  git show origin/main:Lambdas/lambda/Bedrock_Streaming_Handler_Staging/scheduling/TOOL_CATALOG.md
    (or origin/feat/ws-ag-core:... if not yet on main)
  The agentTurn.js + agentTools.js exports from WS-AG-CORE

OWNERSHIP: create/edit ONLY the two files listed in the OWN section of your work-order:
  Bedrock_Streaming_Handler_Staging/__tests__/agentEvals.test.js
  scheduling/docs/agentic-live-eval.md

QUALITY GATE (mandatory before opening the PR):
  /verify-before-commit
  cd /tmp/wt-ag-eval/Lambdas/lambda/Bedrock_Streaming_Handler_Staging && npm ci && npm test
  cd /tmp/wt-ag-eval/Lambdas/lambda/shared/scheduling && npm ci && npm test

VERIFY PUSH:
  git ls-remote origin refs/heads/feat/ws-ag-eval

REPORT-BACK in your PR:
  - PR title: feat(scheduling): WS-AG-EVAL — increment-1 jest evals + live-eval script (§B17)
  - Base: main
  - Done-bar status per item 1–3
  - Test count + mock-Bedrock sequence summary
  - Doc-snippet: kanban row for PARALLEL_WORKSTREAMS.md
  - STOP and flag if the agentTurn interface or §B17 looks wrong — never fork
```

---

## WS-TRACKD-BE — backend fixes (lambda repo, base main)

```
You are a workstream agent for the MyRecruiter/Picasso scheduling platform.

Your work-order: scheduling/docs/workstreams/WS-TRACKD-BE.md
Your contracts:  scheduling/docs/FROZEN_CONTRACTS.md §B17d + §B16a + §B16b + §B14 + §B10
Design doc:      scheduling/docs/AGENTIC_SCHEDULING_SLICE_DESIGN.md §3.2 + §6 + Appendix D3/D4

SETUP — run in a NEW isolated worktree:
  git fetch origin
  git worktree add -b feat/ws-trackd-be /tmp/wt-trackd-be origin/main
  cd /tmp/wt-trackd-be/Lambdas/lambda

Read ALL source via `git show origin/main:<path>` before writing. Specifically:
  git show origin/main:Lambdas/lambda/Bedrock_Streaming_Handler_Staging/scheduling/bindingContext.js
  git show origin/main:Lambdas/lambda/Bedrock_Streaming_Handler_Staging/scheduling/dayPicker.js
  git show origin/main:Lambdas/lambda/Bedrock_Streaming_Handler_Staging/scheduling/newBookingEntry.js
  git show origin/main:Lambdas/lambda/Bedrock_Streaming_Handler_Staging/scheduling/newBookingFlow.js

Three independent fixes, each with its own test file:
  Fix 1: bindingContext.js — inject state line for in-flight new-booking sessions (§B17d format)
  Fix 2: dayPicker.js — format civil date not UTC-midnight instant (tz-shift regression required)
  Fix 3: postFormOffer.js — new module (module + tests only; integrator wires the call site)

OWNERSHIP: create/edit ONLY the 6 files listed in the OWN section of your work-order.
Do NOT touch index.js, form_handler.js, newBookingFlow.js, newBookingEntry.js, or any shared doc.

QUALITY GATE (mandatory before opening the PR):
  /verify-before-commit
  cd /tmp/wt-trackd-be/Lambdas/lambda/Bedrock_Streaming_Handler_Staging && npm ci && npm test
  cd /tmp/wt-trackd-be/Lambdas/lambda/shared/scheduling && npm ci && npm test

VERIFY PUSH:
  git ls-remote origin refs/heads/feat/ws-trackd-be

REPORT-BACK in your PR:
  - PR title: feat(scheduling): WS-TRACKD-BE — bindingContext state-line + dayPicker fix + postFormOffer
  - Base: main
  - Done-bar status per fix (1–3) and per item (1–8)
  - Suite summary lines
  - Doc-snippet: kanban row for PARALLEL_WORKSTREAMS.md
  - STOP and flag if §B17d or the shared staging path looks wrong — escalate, never fork
```

---

## WS-TRACKD-FE — chip CSS fix (picasso repo, base staging)

```
You are a workstream agent for the MyRecruiter/Picasso scheduling platform.

Your work-order: scheduling/docs/workstreams/WS-TRACKD-FE.md
Your contract:   scheduling/docs/FROZEN_CONTRACTS.md §B16e (reference only — your CSS fix does not change it)
Design doc:      scheduling/docs/AGENTIC_SCHEDULING_SLICE_DESIGN.md §6 + QA P1-7 note

SETUP — run in a NEW isolated worktree off staging (picasso repo, NOT lambda repo):
  git fetch origin
  git worktree add -b feat/ws-trackd-fe /tmp/wt-trackd-fe origin/staging
  cd /tmp/wt-trackd-fe/Picasso

Read ALL source via `git show origin/staging:<path>` before writing. Specifically:
  git show origin/staging:Picasso/src/components/scheduling/SchedulingDayPicker.jsx
  git show origin/staging:Picasso/src/components/scheduling/SchedulingSlots.jsx  (reference chip style)
  Find the CSS file: git show origin/staging:Picasso/src/components/scheduling/SchedulingDayPicker.css
    (or the equivalent style module if it differs)

SCOPE: chip CSS fix only. Do NOT implement resume_scheduling (rides existing confirm-card path, zero FE work).
  The fix: chip labels clip to circles (border-radius:50% or equivalent). Make them render full text labels
  like SchedulingSlots chips do. Update the test file to assert non-circle chip shape.

OWNERSHIP: create/edit ONLY the 3 files listed in the OWN section of your work-order.
Do NOT touch SchedulingSlots.jsx, SchedulingConfirmCard.jsx, MessageBubble.jsx, or any backend file.

QUALITY GATE (mandatory before opening the PR):
  /verify-before-commit
  cd /tmp/wt-trackd-fe/Picasso && npm test
  (expect 333+ tests passing)

VERIFY PUSH:
  git ls-remote origin refs/heads/feat/ws-trackd-fe

REPORT-BACK in your PR:
  - PR title: feat(scheduling): WS-TRACKD-FE — SchedulingDayPicker chip CSS fix (P1-7)
  - Base: staging
  - Done-bar status per item 1–4
  - npm test summary (N/N tests passed)
  - Doc-snippet: kanban row for PARALLEL_WORKSTREAMS.md
  - STOP and flag if the contract or existing SchedulingConfirmCard behavior looks wrong — escalate
```

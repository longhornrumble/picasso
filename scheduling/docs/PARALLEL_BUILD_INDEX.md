# Parallel Build — Master Index (everything to run the workforce)

The single entry point. Every document, prompt, and resource needed to run the sub-phase C parallel build. All paths are relative to the `Working_Folder` repo root; GitHub links are on `main`.

---

## 0. The 3-step flow

1. **(Optional, background)** Provision Zoom OAuth — only gates C8's Zoom path. → `scheduling/docs/runbooks/ZOOM_OAUTH_PROVISIONING.md`
2. **Stand up the integrator** — in ONE scheduling session (orchestration-only): paste §3-A (designation) then §3-B (the L2 loop).
3. **Launch the workers** — open one session per piece, paste its prompt from `LAUNCH_THE_WORKFORCE.md` (WS-FIX first). The integrator weaves their PRs automatically (L2 loop).

---

## 1. Start-here documents

| Doc | What it's for | Link |
|---|---|---|
| **`scheduling/docs/LAUNCH_THE_WORKFORCE.md`** | **Operator playbook** — plain step-by-step + all 8 ready-to-paste worker prompts + troubleshooting. **Read this first to run it.** | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/LAUNCH_THE_WORKFORCE.md) |
| **`scheduling/docs/PARALLEL_WORKSTREAMS.md`** | The operating model — roles, hard rules, wave plan, audit rule §5, Zoom gate §6, **the kanban §7** (integrator-owned status tracker). | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/PARALLEL_WORKSTREAMS.md) |
| **`scheduling/docs/FROZEN_CONTRACTS.md`** | The seam — §A shipped contracts, **§B LOCKED** interface signatures workers build to. | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/FROZEN_CONTRACTS.md) |
| **This index** (`PARALLEL_BUILD_INDEX.md`) | The map you're reading. | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/PARALLEL_BUILD_INDEX.md) |

---

## 2. The 8 work-orders (one per worker)

Each worker session reads its own file. The ready-to-paste **prompts** for all 8 are in `LAUNCH_THE_WORKFORCE.md`.

| Workstream | What it builds | Repo / base | Work-order |
|---|---|---|---|
| **WS-FIX** *(launch first)* | synthetic test fixture | picasso → staging | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/workstreams/WS-FIX-synthetic-fixture.md) |
| **WS-C2** | Bedrock form-data injection | lambda → main | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/workstreams/WS-C2-form-injection.md) |
| **WS-C4** | freeBusy availability | lambda → main | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/workstreams/WS-C4-freebusy.md) |
| **WS-C5** | routing + round-robin | lambda → main | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/workstreams/WS-C5-routing-eval.md) |
| **WS-C7** | slot generation | lambda → main | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/workstreams/WS-C7-slot-gen.md) |
| **WS-C9** | booking state machine | lambda → main | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/workstreams/WS-C9-state-machine.md) |
| **WS-D1a** | signed-token middleware | lambda → main | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/workstreams/WS-D1a-token-middleware.md) |
| **WS-EUI** | Customer Portal UI | picasso → staging | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/workstreams/WS-EUI-customer-portal.md) |
| *template* | for any new work-order | — | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/workstreams/WORK_ORDER_TEMPLATE.md) |

**Wave 2 (integrator-built, sequential, AFTER the wave):** C6 (after C4+C5+C7) → C8 (after C6 + Zoom) → B9/B10/B11.

---

## 3. Integrator setup (the two reusable prompts)

### 3-A — Designate the integrator (paste into the chosen scheduling session, once)
```
You are now the SOLE scheduling INTEGRATOR — orchestration only, no more feature
development. Read these in order, then confirm your understanding back to me:
1. the integrator handoff (memory): project_scheduling_integrator_handoff_2026-05-30.md  (your role + the weave loop)
2. scheduling/docs/PARALLEL_WORKSTREAMS.md  (the model, hard rules, audit rule §5, kanban §7)
3. scheduling/docs/FROZEN_CONTRACTS.md  (§B is LOCKED — what workers build to)

Your job from now on: weave worker PRs as they land (review → §5-calibrated audit →
apply their doc-snippet → merge → update the kanban → manage drift). You own the
shared docs; you never build a workstream and never edit a worker's files. Cross-session
coordination is git + shared memory + the kanban only — you do not talk to other sessions.
Before editing pii-inventory.md, coordinate with the PII session (shared file).
```

### 3-B — Start the L2 watchdog loop (paste in the same session)
```
/loop 25m Integrator watchdog tick (L2). 1) gh pr list --state open in longhornrumble/picasso AND longhornrumble/lambda — find worker PRs (feature/scheduling-ws-*). 2) For each with green CI + a verify-before-commit marker, not yet merged: review the diff, confirm it honored its FROZEN_CONTRACTS §B contract and touched ONLY its owned files. LOW-RISK (WS-FIX/C5/C7/C9/EUI): if it passes, merge it (merge-commit). HIGH-RISK (C2/C6/C8/D1a — prompt-injection/commit/auth): run /phase-completion-audit, post the gap matrix, and STOP for my go-ahead — do NOT auto-merge. 3) For each merged PR: apply its doc-snippet to the plan + the PARALLEL_WORKSTREAMS kanban; coordinate with the PII session before editing pii-inventory.md. 4) Check staging<->main drift (git fetch; rev-list --count --merges both ways); if >5 either way, open a merge-commit promote/back-sync. 5) Diagnose any red worker-PR CI. 6) Sequencing: C6 only after C4+C5+C7 merged; C8 after C6 + Zoom OAuth; then B9/B10/B11. 7) Post a one-screen digest: merged / waiting-for-my-go-ahead / blocked / drift. NEVER approve a prod Deploy-to-Production run; NEVER mutate credentials/secrets or edit deployed Lambda code; NEVER edit a worker's owned files.
```
- The loop runs **in-session** — keep that window open. Say "stop the loop" to pause. L2 = auto-merge safe PRs, stop for go-ahead on C2/C6/C8/D1a, never prod/credentials.

---

## 4. Spec + reference (what workers build to)

| Doc | What it is | Link |
|---|---|---|
| `scheduling/docs/scheduling_implementation_plan.md` | The task spec (every C/D/E task + done-bar). Integrator-owned. | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/scheduling_implementation_plan.md) |
| `scheduling/docs/scheduling_design.md` | The canonical design (the §§ the contracts cite). | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/scheduling_design.md) |
| `scheduling/docs/listener_dispatch_interface.md` | The B2→C dispatch contract (7 typed events). | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/listener_dispatch_interface.md) |
| `shared/scheduling/README.md` *(lambda repo)* | The scaffolded lib — each pure-logic worker adds one module here. | [↗](https://github.com/longhornrumble/lambda/blob/main/shared/scheduling/README.md) |
| `shared/booking-status.js` *(lambda repo)* | Frozen Booking.status vocabulary (the 5 states). | [↗](https://github.com/longhornrumble/lambda/blob/main/shared/booking-status.js) |

---

## 5. Operator action

| Resource | What | Link |
|---|---|---|
| `scheduling/docs/runbooks/ZOOM_OAUTH_PROVISIONING.md` | Provision Zoom S2S OAuth (the only C8 external gate). | [↗](https://github.com/longhornrumble/picasso/blob/main/scheduling/docs/runbooks/ZOOM_OAUTH_PROVISIONING.md) |

---

## 6. Memory / resume (operator-local, not in git)

`~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/`
- **`MEMORY.md`** — the two-program router (read first when resuming any session).
- **`project_scheduling_integrator_handoff_2026-05-30.md`** — the integrator's role + weave loop + live state.
- **`project_scheduling_subphaseB_audit_handoff_2026-05-30.md`** — what the sub-phase-B audit/B-1-fix session did.

---

## 7. Repos, branches, ground rules

- **Repos:** `longhornrumble/picasso` (frontend + IaC + the scheduling docs) · `longhornrumble/lambda` (Lambda code + `shared/scheduling/`).
- **Branch routing:** lambda code → base `main`; picasso code/IaC → base `staging`; self-contained methodology docs → `main`.
- **Drift cap:** staging↔main ≤5 merge commits either way; **merge-commit strategy** for staging↔main promotes/back-syncs (never squash).
- **Shared files (coordinate / take turns):** `docs/roadmap/PII-Project/pii-inventory.md` (with the PII program) and `MEMORY.md` (all sessions).
- **Governing rules:** `CLAUDE.md` (SOP, verify-before-commit, schema discipline, never-share-IAM, credential-mutation gate, Living-Inventory Rule).

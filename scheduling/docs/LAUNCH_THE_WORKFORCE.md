# How to Launch the Scheduling Workforce — Step by Step

A plain, follow-along guide to running several Claude sessions in parallel to build sub-phase C faster. Companion to [`PARALLEL_WORKSTREAMS.md`](PARALLEL_WORKSTREAMS.md) (the design) — **this doc is the do-it checklist.**

---

## What you're doing (in one picture)

You'll run several Claude sessions at the same time. **Each one builds one small, separate piece** of the scheduling system. Because every piece lives in its own files and its own branch, the sessions never step on each other. One session — the **integrator** — collects everyone's finished work and merges it.

> Think of a kitchen: 8 cooks each make one dish at their own station; the head chef plates them. The cooks = worker sessions. The head chef = the integrator.

**Why this is faster:** instead of building C2 → C4 → C5 → … one after another, you build the independent pieces all at once.

---

## Before you start

Already done (the "pre-launch") — you don't need to redo any of it:
- ✅ Contracts locked, shared library scaffolded, all 8 work-orders written.

What you need:
- The ability to open **new Claude Code sessions** in this project folder (`Working_Folder`).
- ~10 minutes to launch each worker (mostly just pasting a prompt and watching it go).

---

## The two kinds of session

| | Integrator | Worker |
|---|---|---|
| How many | **ONE** (keep your current session) | **ONE per piece** (8 of them) |
| What it does | Reviews + audits + merges each finished PR; keeps the plan/docs updated; manages branches | Builds exactly one piece, tests it, opens a Pull Request (PR), then it's done |
| Builds code? | No | Yes |

**Keep your current session as the integrator.** Don't give it a work-order.

---

## Step 1 — (optional, background) Provision Zoom

Only needed before the **last** piece (C8), which is **not** in this first wave. Do it whenever convenient by following [`runbooks/ZOOM_OAUTH_PROVISIONING.md`](runbooks/ZOOM_OAUTH_PROVISIONING.md). **You can skip this for now** and still launch everything below.

---

## Step 2 — Launch the workers

For **each** piece you want to build:

1. **Open a new Claude Code session** in the `Working_Folder` (same project, fresh window/tab).
2. **Copy that piece's prompt** from the [§ Prompts](#the-8-prompts-copy-paste) below and **paste it as the first message.**
3. **Let it work.** It reads its instructions, builds, tests, and opens a PR. It will tell you the PR number.
4. **When it has opened a PR, you're done with that session** — note the PR number and close the session.

**What order?**
- **Launch `WS-FIX` first** — it makes the shared test data the others use.
- Then launch the rest (`WS-C2`, `WS-C4`, `WS-C5`, `WS-C7`, `WS-C9`, `WS-D1a`, `WS-EUI`) **in any order**.
- Run **as many at once as you can keep an eye on.** All 7 of the rest together is fine — they're independent.

> **⚠️ HARD RULE — each worker session gets its OWN git worktree (or clone). Never run two workers in the same checkout.**
> Multiple sessions sharing one physical checkout race `git HEAD` across branches — this corrupted pushes for WS-C4/C5/C9 (commits landed on the wrong branch; one PR briefly carried another workstream's files) until each recovered by hand. Before a worker's first commit, give it an isolated tree:
> ```bash
> # lambda workstreams (C2/C4/C5/C7/C9/D1a):
> git -C Lambdas/lambda worktree add -b feature/scheduling-<ws> /tmp/ws-<ws> origin/main
> # picasso workstreams (WS-FIX/WS-EUI):
> git worktree add -b feature/scheduling-<ws> /tmp/ws-<ws> origin/staging
> ```
> Then the worker works in `/tmp/ws-<ws>` only.
>
> **⚠️ HARD RULE — branch cleanup after merge (no stale branches/worktrees).** Once a worker's PR is merged: the **worker** removes its worktree (`git worktree remove /tmp/ws-<ws>`) + deletes its local branch (`git branch -d feature/scheduling-<ws>`); the **integrator** merges with `gh pr merge --delete-branch` (kills the remote branch), prunes the worktree at weave-time, and **returns the primary checkout to the base branch** (`git switch main` — never leave the primary checkout parked on a worker branch, or the on-disk view goes stale and merged files appear "missing"). Clean each branch as its PR merges, not in a deferred sweep.

One special case: **`WS-EUI`** will ask you (or the integrator) one question first — *where the Customer-Portal screens should live*. Answer it, then it builds.

---

## Step 3 — Weave (your integrator session does this)

As each worker opens a PR, come back to **this (integrator) session** and say:

> `WS-C4 opened PR #123 — weave it.`

The integrator will: review the code, run the right depth of quality check (heavy for security pieces, light for simple ones), apply the small plan/inventory note from the PR, merge it, and update the tracker. Do this for each PR as it lands — **order doesn't matter** for the worker PRs.

---

## Step 4 — After the wave

Once the workers' PRs are merged, the integrator builds the **two pieces that combine them**, in order: **C6** (uses C4 + C5 + C7) then **C8** (the booking step; needs Zoom from Step 1). After that, **B9 / B10 / B11**. That completes sub-phase C.

You just keep launching workers and saying "weave it" — the integrator handles the ordering.

---

## The 8 prompts (copy-paste)

Each prompt is self-contained. Paste it as the **first message** of a brand-new session in `Working_Folder`.

### 1) WS-FIX — test data fixture *(launch first)*
```
You are ONE workstream in a coordinated parallel build — you own a single, disjoint slice.
Your work-order is scheduling/docs/workstreams/WS-FIX-synthetic-fixture.md.

Read, in order: (1) that work-order, (2) the contracts it cites in
scheduling/docs/FROZEN_CONTRACTS.md — §B is LOCKED, code to it, never redefine it,
(3) the plan task it cites in scheduling/docs/scheduling_implementation_plan.md,
(4) CLAUDE.md (SOP, verify-before-commit, drift rules, schema discipline).

Then build it. HARD RULES: create/edit ONLY the files in the work-order's "You OWN" list —
nothing else, and NEVER a shared doc (the plan, infra/main.tf, pii-inventory, the kanban,
FROZEN_CONTRACTS). Build in the picasso repo on branch feature/scheduling-ws-fix, base staging.
Run verify-before-commit before committing. Open a PR per the work-order and include the
report-back doc-snippet in the PR body. If a frozen contract looks wrong, STOP and flag it
in the PR — do not fork it.

Note: the staging seed-run is a credential mutation (operator-gated). Deliver the seed +
teardown script + runbook; do NOT run it against staging yourself.
```

### 2) WS-C2 — form-data injection
```
You are ONE workstream in a coordinated parallel build — you own a single, disjoint slice.
Your work-order is scheduling/docs/workstreams/WS-C2-form-injection.md.

Read, in order: (1) that work-order, (2) the contracts it cites in
scheduling/docs/FROZEN_CONTRACTS.md — §B is LOCKED, code to it, never redefine it,
(3) the plan task it cites in scheduling/docs/scheduling_implementation_plan.md,
(4) CLAUDE.md (SOP, verify-before-commit, drift rules, schema discipline).

Then build it. HARD RULES: create/edit ONLY the files in the work-order's "You OWN" list —
nothing else, and NEVER a shared doc. Build in the lambda repo on branch feature/scheduling-ws-c2,
base main. Run verify-before-commit before committing. Open a PR per the work-order and include
the report-back doc-snippet in the PR body. If a frozen contract looks wrong, STOP and flag it
in the PR — do not fork it.

Note: this is a prompt-injection surface (heavy audit at weave). You are the only workstream
touching Bedrock_Streaming_Handler — flag the handler call-site you change in your PR.
```

### 3) WS-C4 — calendar availability (freeBusy)
```
You are ONE workstream in a coordinated parallel build — you own a single, disjoint slice.
Your work-order is scheduling/docs/workstreams/WS-C4-freebusy.md.

Read, in order: (1) that work-order, (2) the contracts it cites in
scheduling/docs/FROZEN_CONTRACTS.md — §B is LOCKED, code to it, never redefine it,
(3) the plan task it cites in scheduling/docs/scheduling_implementation_plan.md,
(4) CLAUDE.md (SOP, verify-before-commit, drift rules, schema discipline).

Then build it. HARD RULES: create/edit ONLY the files in the work-order's "You OWN" list
(shared/scheduling/availability.js + its test) — nothing else, and NEVER a shared doc.
Build in the lambda repo on branch feature/scheduling-ws-c4, base main. Run verify-before-commit
before committing. Open a PR per the work-order and include the report-back doc-snippet in the
PR body. If a frozen contract looks wrong, STOP and flag it in the PR — do not fork it.

Note: the cache key MUST be tenant-prefixed (no cross-tenant leak). Include an integration test
against the real Google API, not just mocks.
```

### 4) WS-C5 — routing + round-robin
```
You are ONE workstream in a coordinated parallel build — you own a single, disjoint slice.
Your work-order is scheduling/docs/workstreams/WS-C5-routing-eval.md.

Read, in order: (1) that work-order, (2) the contracts it cites in
scheduling/docs/FROZEN_CONTRACTS.md — §B is LOCKED, code to it, never redefine it,
(3) the plan task it cites in scheduling/docs/scheduling_implementation_plan.md,
(4) CLAUDE.md (SOP, verify-before-commit, drift rules, schema discipline).

Then build it. HARD RULES: create/edit ONLY the files in the work-order's "You OWN" list
(shared/scheduling/routing.js + its test) — nothing else, and NEVER a shared doc.
Build in the lambda repo on branch feature/scheduling-ws-c5, base main. Run verify-before-commit
before committing. Open a PR per the work-order and include the report-back doc-snippet in the
PR body. If a frozen contract looks wrong, STOP and flag it in the PR — do not fork it.

Note: the round-robin advance/revert are SEPARATE calls that the later commit step (C8) runs —
do not perform the booking commit yourself.
```

### 5) WS-C7 — slot generation
```
You are ONE workstream in a coordinated parallel build — you own a single, disjoint slice.
Your work-order is scheduling/docs/workstreams/WS-C7-slot-gen.md.

Read, in order: (1) that work-order, (2) the contracts it cites in
scheduling/docs/FROZEN_CONTRACTS.md — §B is LOCKED, code to it, never redefine it,
(3) the plan task it cites in scheduling/docs/scheduling_implementation_plan.md,
(4) CLAUDE.md (SOP, verify-before-commit, drift rules, schema discipline).

Then build it. HARD RULES: create/edit ONLY the files in the work-order's "You OWN" list
(shared/scheduling/slots.js + its test) — nothing else, and NEVER a shared doc.
Build in the lambda repo on branch feature/scheduling-ws-c7, base main. Run verify-before-commit
before committing. Open a PR per the work-order and include the report-back doc-snippet in the
PR body. If a frozen contract looks wrong, STOP and flag it in the PR — do not fork it.

Note: pure functions only (no API or DB calls). Daylight-saving tests in BOTH directions are
the crux — cover them.
```

### 6) WS-C9 — booking state machine
```
You are ONE workstream in a coordinated parallel build — you own a single, disjoint slice.
Your work-order is scheduling/docs/workstreams/WS-C9-state-machine.md.

Read, in order: (1) that work-order, (2) the contracts it cites in
scheduling/docs/FROZEN_CONTRACTS.md — §B is LOCKED, code to it, never redefine it,
(3) the plan task it cites in scheduling/docs/scheduling_implementation_plan.md,
(4) CLAUDE.md (SOP, verify-before-commit, drift rules, schema discipline).

Then build it. HARD RULES: create/edit ONLY the files in the work-order's "You OWN" list
(shared/scheduling/stateMachine.js + its test) — nothing else, and NEVER a shared doc.
Build in the lambda repo on branch feature/scheduling-ws-c9, base main. Run verify-before-commit
before committing. Open a PR per the work-order and include the report-back doc-snippet in the
PR body. If a frozen contract looks wrong, STOP and flag it in the PR — do not fork it.

Note: keep the conversation session-state and the Booking.status as SEPARATE things (they are
different vocabularies). If you need to edit shared/booking-status.js, flag it — don't just do it.
```

### 7) WS-D1a — signed-token middleware
```
You are ONE workstream in a coordinated parallel build — you own a single, disjoint slice.
Your work-order is scheduling/docs/workstreams/WS-D1a-token-middleware.md.

Read, in order: (1) that work-order, (2) the contracts it cites in
scheduling/docs/FROZEN_CONTRACTS.md — §B is LOCKED, code to it, never redefine it,
(3) the plan task it cites in scheduling/docs/scheduling_implementation_plan.md,
(4) CLAUDE.md (SOP, verify-before-commit, drift rules, schema discipline).

Then build it. HARD RULES: create/edit ONLY the files in the work-order's "You OWN" list
(shared/scheduling/tokens.js + its test) — nothing else, and NEVER a shared doc.
Build in the lambda repo on branch feature/scheduling-ws-d1a, base main. Run verify-before-commit
before committing. Open a PR per the work-order and include the report-back doc-snippet in the
PR body. If a frozen contract looks wrong, STOP and flag it in the PR — do not fork it.

Note: this is an auth surface (heavy audit). The 6 token purposes + their expiry are LOCKED in
§B4 — build exactly to them. One-time-use uses the EXISTING picasso-token-jti-blacklist table —
do NOT create a new table.
```

### 8) WS-EUI — Customer Portal screens
```
You are ONE workstream in a coordinated parallel build — you own a single, disjoint slice.
Your work-order is scheduling/docs/workstreams/WS-EUI-customer-portal.md.

Read, in order: (1) that work-order, (2) the contracts it cites in
scheduling/docs/FROZEN_CONTRACTS.md — §B is LOCKED, code to it, never redefine it,
(3) the plan task it cites in scheduling/docs/scheduling_implementation_plan.md,
(4) CLAUDE.md (SOP, verify-before-commit, drift rules, schema discipline).

Then build it. HARD RULES: create/edit ONLY the files in the work-order's "You OWN" list —
nothing else, and NEVER a shared doc. Build in the picasso repo on branch feature/scheduling-ws-eui,
base staging. Run verify-before-commit before committing. Open a PR per the work-order and include
the report-back doc-snippet in the PR body. If a frozen contract looks wrong, STOP and flag it in
the PR — do not fork it.

FIRST: before building, ask the integrator to confirm WHERE the Customer-Portal screens live
(the Picasso widget, a new portal app, or the config-builder). Wait for that answer, then build.
```

---

## If something goes wrong (simple fixes)

| What you see | What to do |
|---|---|
| A worker wants to touch a file **not** in its "You OWN" list | Tell it: "No — escalate to the integrator." Then paste the issue into your integrator session. |
| A worker says a **contract looks wrong** | Bring it to the integrator; let the integrator decide. Don't let the worker change the contract. |
| Two workers seem to be editing the **same file** | They shouldn't be — tell the integrator; it'll reassign. |
| A PR's **CI is red** | The integrator fixes it at weave time — just say "weave it" and it handles it. |
| You're **not sure what's done** | Ask the integrator: "What's the workstream status?" — it keeps the tracker in `PARALLEL_WORKSTREAMS.md` §7. |
| A scheduling PR and your **separate PII Governance session** both changed `pii-inventory.md` | They share that one file and will conflict. **Heads-up:** before the integrator merges any scheduling PR that edits `pii-inventory.md`, have it check with your PII session (take turns). The PII session owns the M1–M9 rows; the scheduling integrator owns the scheduling-table rows. |

---

## Quick reference — the 8 pieces

| Piece | What it does (plain) | Repo | When |
|---|---|---|---|
| **WS-FIX** | Fake test tenant + data so other tests have something to run against | picasso | **First** |
| **WS-C2** | Feeds the user's form answers into the chatbot prompt safely | lambda | any |
| **WS-C4** | Reads coordinators' calendars to see when they're free | lambda | any |
| **WS-C5** | Picks which coordinator gets the next booking (fairly) | lambda | any |
| **WS-C7** | Turns free time into the 3–5 time-slot buttons the user picks from | lambda | any |
| **WS-C9** | The rules for how a booking moves through its stages | lambda | any |
| **WS-D1a** | Secure one-time links for cancel / reschedule / attendance | lambda | any |
| **WS-EUI** | The customer's on-screen booking views | picasso | any (ask first) |
| *C6 → C8* | *Combine the above into the actual "book it" step* | *lambda* | *integrator, after the wave* |

---

## Wave D-core — sub-phase D (token redemption) prompts

This is a **second, later wave** (sub-phase D), independent of the C prompts above. It turns the secure one-tap links (WS-D1a) into working cancel/reschedule pages served from **`staging.schedule.myrecruiter.ai`**. **Operator decisions (2026-06-02):** staging-only host; lean-core scope = these 4 pieces only (D2 dual-key, D5 failure-page polish, D8 recovery deferred to Wave D-2). Contracts §B9 + §B10 are LOCKED.

**Launch order: WS-D3 FIRST** (it requests an HTTPS certificate that can take hours to validate; everything else's end-to-end test waits on it). Then WS-D4 / WS-D6 / WS-D7 in any order — they're file-disjoint. Same worktree + cleanup hard rules as above (each worker its OWN `/tmp` worktree cut from `origin/<base>`).

> **What stays with the integrator (don't give a worker):** wiring WS-D4's Lambda infra + Function URL and pointing WS-D3's origin at it; reconciling `SCHEDULE_BASE_URL` (today split between `staging.chat...` and the dead `schedule.myrecruiter.ai`) onto `https://staging.schedule.myrecruiter.ai`; and wiring the in-chat confirm step to call WS-D6/WS-D7's modules.

### D-1) WS-D3 — redemption domain *(launch first)*
```
You are ONE workstream in a coordinated parallel build — you own a single, disjoint slice.
Your work-order is scheduling/docs/workstreams/WS-D3-DOMAIN.md.

Read, in order: (1) that work-order, (2) the contracts it cites in
scheduling/docs/FROZEN_CONTRACTS.md — §B is LOCKED, code to it, never redefine it,
(3) the plan task it cites in scheduling/docs/scheduling_implementation_plan.md (§6, D3),
(4) CLAUDE.md (Deployment SOP, verify-before-commit, drift rules, the IAM string-charset gotcha).

Then build it. HARD RULES: create/edit ONLY the files in the work-order's "You OWN" list
(the new infra/modules/scheduling-redemption-domain-staging/ module) — nothing else, and NEVER a
shared doc (the plan, infra/main.tf, pii-inventory, the kanban, FROZEN_CONTRACTS). Build in the
picasso repo on branch feature/scheduling-ws-d3-domain, base staging, in your OWN isolated worktree:
  git worktree add -b feature/scheduling-ws-d3-domain /tmp/ws-d3 origin/staging
Run verify-before-commit before committing. Open a PR per the work-order with the report-back
doc-snippet in the body. If a frozen contract looks wrong, STOP and flag it in the PR — do not fork it.

Note: host is staging.schedule.myrecruiter.ai (staging-only, NOT prod). ACM cert MUST be in us-east-1
(CloudFront). Do NOT terraform apply (operator-run) and do NOT edit infra/main.tf. If the myrecruiter.ai
Route53 zone isn't creatable from the staging account, STOP and flag the hosted-zone placement — don't guess.
```

### D-2) WS-D4 — redemption endpoint handler
```
You are ONE workstream in a coordinated parallel build — you own a single, disjoint slice.
Your work-order is scheduling/docs/workstreams/WS-D4-REDEMPTION.md.

Read, in order: (1) that work-order, (2) the contracts it cites in
scheduling/docs/FROZEN_CONTRACTS.md — §B4/§B10 are LOCKED, code to them, never redefine them,
(3) the plan task it cites in scheduling/docs/scheduling_implementation_plan.md (§6, D4),
(4) CLAUDE.md (never-share-IAM, credential-mutation gate, schema discipline, verify-before-commit).

Then build it. HARD RULES: create/edit ONLY the files in the work-order's "You OWN" list
(the new Scheduling_Redemption_Handler/ Lambda) — nothing else, and NEVER a shared doc. Build in
the lambda repo on branch feature/scheduling-ws-d4-redemption, base main, in your OWN isolated worktree:
  git -C Lambdas/lambda worktree add -b feature/scheduling-ws-d4-redemption /tmp/ws-d4 origin/main
Run verify-before-commit before committing. Open a PR per the work-order with the report-back
doc-snippet in the body. If a frozen contract looks wrong, STOP and flag it in the PR — do not fork it.

Note: this is an AUTH + one-time-use surface (FULL audit at weave). Validate + atomically redeem via the
SHIPPED shared/scheduling/tokens.js verify() — do NOT re-implement token validation or touch the jti table.
The token authenticates ENTRY ONLY: for cancel/reschedule/resume you write the §B10 session binding and
redirect to chat — you do NOT perform the calendar op (that's WS-D6/WS-D7, in-chat). /attended/* action =
TODO(E6) stub (keep the security path real). esbuild must BUNDLE @smithy/node-http-handler, not externalize
it (lambda#202 lesson). Do NOT write the Lambda's Terraform/Function URL/IAM — that's integrator glue;
deliver code + a deploy note listing env vars + IAM verbs.
```

### D-3) WS-D6 — reschedule execution module
```
You are ONE workstream in a coordinated parallel build — you own a single, disjoint slice.
Your work-order is scheduling/docs/workstreams/WS-D6-RESCHEDULE.md.

Read, in order: (1) that work-order, (2) the contracts it cites in
scheduling/docs/FROZEN_CONTRACTS.md — §B9 (your executeReschedule signature) + §B6 are LOCKED,
code to them, never redefine them, (3) the plan task it cites in
scheduling/docs/scheduling_implementation_plan.md (§6, D6), (4) CLAUDE.md (schema discipline, verify-before-commit).

Then build it. HARD RULES: create/edit ONLY the files in the work-order's "You OWN" list
(shared/scheduling/reschedule.js + its test) — nothing else, NEVER a shared doc, and do NOT touch
shared/scheduling/package.json. Build in the lambda repo on branch feature/scheduling-ws-d6-reschedule,
base main, in your OWN isolated worktree:
  git -C Lambdas/lambda worktree add -b feature/scheduling-ws-d6-reschedule /tmp/ws-d6 origin/main
Run `npm ci` in shared/scheduling/ before tests. Run verify-before-commit before committing. Open a PR per
the work-order with the report-back doc-snippet in the body. If a frozen contract looks wrong, STOP and flag it.

Note: calendar mutation (FULL audit at weave). Ordering is LOCKED: events.insert(new) FIRST, events.delete(old)
SECOND; implement all four outcomes (i)-(iv) from the plan D6 row. Everything is via injected deps (no module-level
clients). Return the updated booking — do NOT persist to DynamoDB yourself and do NOT validate tokens (WS-D4 owns that).
```

### D-4) WS-D7 — cancel execution module
```
You are ONE workstream in a coordinated parallel build — you own a single, disjoint slice.
Your work-order is scheduling/docs/workstreams/WS-D7-CANCEL.md.

Read, in order: (1) that work-order, (2) the contracts it cites in
scheduling/docs/FROZEN_CONTRACTS.md — §B9 (your executeCancel signature) is LOCKED, code to it,
never redefine it, (3) the plan task it cites in scheduling/docs/scheduling_implementation_plan.md (§6, D7),
(4) CLAUDE.md (schema discipline, verify-before-commit).

Then build it. HARD RULES: create/edit ONLY the files in the work-order's "You OWN" list
(shared/scheduling/cancel.js + its test) — nothing else, NEVER a shared doc, and do NOT touch
shared/scheduling/package.json. Build in the lambda repo on branch feature/scheduling-ws-d7-cancel,
base main, in your OWN isolated worktree:
  git -C Lambdas/lambda worktree add -b feature/scheduling-ws-d7-cancel /tmp/ws-d7 origin/main
Run `npm ci` in shared/scheduling/ before tests. Run verify-before-commit before committing. Open a PR per
the work-order with the report-back doc-snippet in the body. If a frozen contract looks wrong, STOP and flag it.

Note: CRITICAL boundary — your module does Google events.delete + the pending_calendar_sync failure flag ONLY.
Do NOT flip Booking.status: the already-built cal-lifecycle listener flips status=canceled + sends the notice on
the calendar_deleted push (one source of truth, no double-write race). Injected deps only; return the updated
booking; do NOT validate tokens (WS-D4 owns that).
```

---

## B-minimal — C-chat integration (the recovery loop) prompts

Lights the reschedule/cancel-from-email-link loop. Contracts **§B12–§B15 LOCKED**. **Launch WS-FACADE / WS-BINDING / WS-ZOOM / WS-WIDGET in parallel** (file-disjoint); **WS-CONVO is the keystone — launch ONLY after the first three (FACADE/BINDING/ZOOM) merge.** Same worktree + cleanup hard rules as above. The standard preamble (read the work-order → the §B contracts it cites in `scheduling/docs/FROZEN_CONTRACTS.md` [§ LOCKED] → the plan → `CLAUDE.md`; build ONLY your OWN files; verify-before-commit; PR with the report-back snippet; STOP+flag a wrong contract — don't fork) applies to each.

### BM-1) WS-FACADE — auth-bound calendar facade
```
You are ONE workstream in a coordinated parallel build. Work-order:
scheduling/docs/workstreams/WS-FACADE-calendar-facade.md. Read it + §B13/§B9 in
scheduling/docs/FROZEN_CONTRACTS.md (LOCKED) + CLAUDE.md. Build in the lambda repo, branch
feature/scheduling-ws-facade, base main, in your OWN worktree:
  git -C Lambdas/lambda worktree add -b feature/scheduling-ws-facade /tmp/ws-facade origin/main
OWN only shared/scheduling/calendarFacade.js + its test; `npm ci` in shared/scheduling/ first.
verify-before-commit, then PR. The facade shape MUST match §B9 exactly (D6/D7 already inject it).
Curry per-tenant OAuth (oauth-client.getOAuthClient) into calendar-events; no caller-supplied authClient.
```

### BM-2) WS-BINDING — session-binding resolution
```
You are ONE workstream in a coordinated parallel build. Work-order:
scheduling/docs/workstreams/WS-BINDING-session-binding.md. Read it + §B12/§B10 (LOCKED) + CLAUDE.md.
lambda repo, branch feature/scheduling-ws-binding, base main, OWN worktree:
  git -C Lambdas/lambda worktree add -b feature/scheduling-ws-binding /tmp/ws-binding origin/main
OWN only shared/scheduling/sessionBinding.js + its test; `npm ci` in shared/scheduling/ first.
ENFORCE TTL IN CODE (expired → null). Tenant comes from the request context (PK), never untrusted input.
verify-before-commit, then PR. Do NOT write/mutate bindings (WS-D4 owns the write).
```

### BM-3) WS-ZOOM — updateMeeting
```
You are ONE workstream in a coordinated parallel build. Work-order:
scheduling/docs/workstreams/WS-ZOOM-update-meeting.md. Read it + §B15 (LOCKED) + CLAUDE.md.
lambda repo, branch feature/scheduling-ws-zoom, base main, OWN worktree:
  git -C Lambdas/lambda worktree add -b feature/scheduling-ws-zoom /tmp/ws-zoom origin/main
OWN only Booking_Commit_Handler/zoom-client.js (ADD updateMeeting + export) + its tests. Mirror the
existing createMeeting/getMeeting/deleteMeeting style (per-tenant getAccessToken, zoomFetch, eviction).
verify-before-commit, then PR. Touch NO other C8 file.
```

### BM-4) WS-WIDGET — forward ?session=
```
You are ONE workstream in a coordinated parallel build. Work-order:
scheduling/docs/workstreams/WS-WIDGET-session-forward.md. Read it + §B12 (LOCKED) + CLAUDE.md.
picasso repo, branch feature/scheduling-ws-widget, base staging, OWN worktree:
  git worktree add -b feature/scheduling-ws-widget /tmp/ws-widget origin/staging
FIRST locate where the widget reads URL params + sends tenant_id to the backend (surface NOT pre-mapped) —
if it differs materially from the work-order, STOP and flag it. Then forward the opaque ?session= value to
the backend (tenant stays from config; the widget does NOT read the binding/tenant from the URL). OWN only the
file(s) you confirm + their test. verify-before-commit, then PR listing the files you owned.
```

### BM-5) WS-CONVO — reschedule/cancel flow *(keystone — launch AFTER FACADE+BINDING+ZOOM merge)*
```
You are ONE workstream in a coordinated parallel build — the KEYSTONE. Work-order:
scheduling/docs/workstreams/WS-CONVO-scheduling-flow.md. Read it + §B12/B13/B14/B15/B9/B3/B6 (LOCKED) +
CLAUDE.md. lambda repo, branch feature/scheduling-ws-convo, base main, OWN worktree:
  git -C Lambdas/lambda worktree add -b feature/scheduling-ws-convo /tmp/ws-convo origin/main
OWN only Bedrock_Streaming_Handler_Staging/scheduling/schedulingFlow.js + scheduling/bindingContext.js +
their tests, + MINIMAL surgical wiring in BSH index.js (mirror how injectFormContext is wired at :470/:907 —
flag the call-sites). THE BOUNDARY (§B14): execute reschedule/cancel ONLY on a focused-post-stream structured
action (V4.0-Action-Selector-style — BSH has no native tool-use), validated through stateMachine.transition();
NEVER on free-text. Import the shipped executeReschedule/executeCancel/facade/binding (don't re-implement).
Defer new-booking entry + C10-C13 (B-remainder). verify-before-commit, then PR. FULL audit at weave.
```

---

## B-remainder — new-booking (the OTHER half of the booking story) prompts

The recovery loop (B-minimal) only CHANGES an existing booking. B-remainder lets a visitor book a NEW appointment
in chat (`qualifying → proposing → confirming → booked`). Contracts **§B16 LOCKED 2026-06-03**.

**Architecture:** `availability.js` (C4) + `pool.js` (C6) pull `googleapis`, which BSH cannot bundle — so the
`proposing` (availability+slots) AND the `booked` commit both run in `Booking_Commit_Handler` and are reached
from BSH by Lambda invoke. **BSH owns the conversation; BCH owns everything calendar-bound.**

**Launch order:** **WS-NEWBOOK-PROPOSE + WS-C12 in parallel** (file-disjoint: BCH route vs picasso widget).
**WS-NEWBOOK-FLOW is the keystone** — it consumes the §B16a propose route; start it against the frozen §B16
any time, but the integrator weaves it only AFTER WS-NEWBOOK-PROPOSE merges. Same worktree + cleanup hard rules.

### NB-1) WS-NEWBOOK-PROPOSE — scheduling_propose BCH route *(launch with NB-2)*
```
You are ONE workstream in a coordinated parallel build. Work-order:
scheduling/docs/workstreams/WS-NEWBOOK-PROPOSE-scheduling-propose-route.md. Read it + §B16a/§B16c +
§B1/B2/B3/B7 (LOCKED) in scheduling/docs/FROZEN_CONTRACTS.md + CLAUDE.md.
lambda repo, branch feature/scheduling-ws-newbook-propose, base main, OWN worktree:
  git -C Lambdas/lambda worktree add -b feature/scheduling-ws-newbook-propose /tmp/ws-newbook-propose origin/main
OWN only Booking_Commit_Handler/scheduling-propose.js (new) + its test + the ONE dispatch block in
Booking_Commit_Handler/index.js routing action 'scheduling_propose' (beside the existing 'scheduling_mutate').
Mirror scheduling-mutate.js for structure. Reuse the SHIPPED C6 pool.select() (verify its return shape) +
verify whether §B7 resolveCandidates fits the bookable-coordinator resolution (flag the gap if not — don't fork).
READ-ONLY route: NO Booking write, NO round-robin advance, NO attendee identity, NO coordinator name in slots.
Feature-gate fail-closed (reuse gateScheduling). verify-before-commit, then PR. FULL audit at weave.
```

### NB-2) WS-C12 — new-booking frontend (chips + start signal) *(launch with NB-1)*
```
You are ONE workstream in a coordinated parallel build. Work-order:
scheduling/docs/workstreams/WS-C12-new-booking-frontend.md. Read it + §B16b/§B16d + §B3 (LOCKED) + CLAUDE.md.
picasso repo, branch feature/scheduling-ws-c12, base staging, OWN worktree:
  git worktree add -b feature/scheduling-ws-c12 /tmp/ws-c12 origin/staging
Render the backend's scheduling_slots SSE event as GENERIC slot chips (label only — NO coordinator name;
snapshot-test that). Tap → send the selection (reuse the existing CTA/action dispatch). Echo-back confirm step
renders the coordinator identity the server reveals at confirming. Extend the start_scheduling handler in
src/components/chat/MessageBubble.jsx (A2 stub) to send scheduling_intent:'new_booking'. Add a scheduling_notice
inline render. FIRST locate where SSE events are consumed (provider not pre-mapped) — if a change would land in
a shared/build/widget-bootstrap file, STOP and flag it. OWN only the files you confirm + tests; list them in the
PR. verify-before-commit, then PR. LIGHT audit at weave.
```

### NB-3) WS-NEWBOOK-FLOW — in-chat new-booking flow *(keystone — launch AFTER NB-1 merges)*
```
You are ONE workstream in a coordinated parallel build — the KEYSTONE. Work-order:
scheduling/docs/workstreams/WS-NEWBOOK-FLOW-new-booking-flow.md. Read it + §B16a/B16b/B16c/B16d + §B14 +
C9 stateMachine (LOCKED) + CLAUDE.md. lambda repo, branch feature/scheduling-ws-newbook-flow, base main, OWN worktree:
  git -C Lambdas/lambda worktree add -b feature/scheduling-ws-newbook-flow /tmp/ws-newbook-flow origin/main
OWN only Bedrock_Streaming_Handler_Staging/scheduling/newBookingFlow.js (new) + its test. READ the shipped
schedulingFlow.js end-to-end — your module is its new-booking twin. THE BOUNDARY (§B14): drive
qualifying→proposing→confirming→booked, executing the commit ONLY on a focused-post-stream structured
confirm_book (validated via stateMachine.transition), NEVER on free-text. Delegate proposing→§B16a and
booked→§B16c via injected deps (deps.invokeProposal / deps.invokeBookingCommit) — import NO googleapis. Do NOT
edit index.js — the integrator wires the entry-hook + live deps (§B16d). Double-fire guard: advance to booked
on success/fallback. verify-before-commit, then PR. FULL audit at weave.
```

---

## Wave E prompts (copy-paste) — sub-phase E

> **⚠ CORRECTED 2026-06-05 (post seam dry-run) — read this first.**
> - **AUTHORITATIVE SEAMS:** every worker reads the **`## E — SEAM RESOLUTIONS` section of [FROZEN_CONTRACTS](FROZEN_CONTRACTS.md)** — it supersedes any seam ambiguity in a work-order and lists what is **integrator glue** (NOT a worker slice).
> - **WORKTREE-FIRST (kills the stale-checkout FP):** the primary checkout is parked on another program's branch (pre-§E). Your **FIRST action**: `git fetch origin && git worktree add -b <branch> <fresh-dir> origin/main && cd <fresh-dir>` — then read the work-order + §E **from inside that worktree**. Do NOT read from the session's default directory.
> - **REVISED 3-WAVE ORDER (the old "all-8-parallel" was wrong):** **Wave E-1 (now):** E-TCPA · E-TEXTEN · E-OAUTH(backend-first) · E-COPY (file-disjoint, no unbuilt-glue deps). **Wave E-2 (after E-1 + glue):** E-REMIND → then E-ATTEND. **Wave E-3 (after endpoints+nav glue + dash#9):** E-PORTAL → E-CI6 LAST.
> - HIGH-risk weaves (TCPA / ATTEND / OAUTH / COPY) → phase-completion-audit + operator go, NO auto-merge.

**§E0–E8 LOCKED** ([FROZEN_CONTRACTS](FROZEN_CONTRACTS.md) §E + the SEAM RESOLUTIONS section). Every prompt: worktree off `origin/main` FIRST; read the work-order + §E SEAM RESOLUTIONS + CLAUDE.md from inside it; OWN only the work-order's files; verify-before-commit; PR with the report-back snippet; STOP+flag a wrong contract, never fork.

### E-1) WS-E-TEXTEN — text_en plumbing *(SOLO-FIRST)*
```
ONE workstream. Work-order: scheduling/docs/workstreams/WS-E-TEXTEN-text-en-plumbing.md. Read it + §E5 +
CLAUDE.md. TWO repos: E1a lambda (feature/scheduling-ws-e-texten) + E1b dashboard
(feature/scheduling-ws-e-texten-dash), base main; isolated worktrees. OWN only the additive text_en field at the
3 writers (BSH emit / Master_Function audit / analytics ingestion) + the dashboard text_en??text read-path + tests.
v1: text_en = text (verbatim). CO-DEPLOY GATE: E1b CI before E1a merge. verify-before-commit, PR each. Light audit.
```

### E-2) WS-E-REMIND — reminder rule lifecycle + dispatch
```
ONE workstream. Work-order: scheduling/docs/workstreams/WS-E-REMIND-reminder-rule-lifecycle.md. Read it +
§E1/E2/E6 + §B9 + the §14.2 listener + CLAUDE.md. lambda, branch feature/scheduling-ws-e-remind, base main, OWN
worktree. OWN only Reminder_Scheduler/ (EventBridge rule create/upsert/delete + cadence + reconciler) + the email
branch in Scheduled_Message_Sender + tests. KEY: token-reschedule re-binds (named exit test); calendar_moved=CANCEL
→ delete (not re-bind). CONSUME §E3 selectChannels at dispatch. Deliver the EventBridge Scheduler IAM deploy-note
(integrator wires it). verify-before-commit, PR. Light audit.
```

### E-3) WS-E-TCPA — consent gate + channel-selection *(HIGH-RISK)*
```
ONE workstream. Work-order: scheduling/docs/workstreams/WS-E-TCPA-consent-gate-channel-selection.md. Read it +
§E3 + CLAUDE.md (PII/TCPA). lambda + infra deploy-note, branch feature/scheduling-ws-e-tcpa, base main, OWN
worktree. FIRST patch form_handler.js ttl + the picasso-sms-consent IaC TTL attribute. Then build selectChannels
(email-floor; sms = org-flag && consent[fail-closed] && !quiet-hours[fire-time, Booking.timezone]) + booking-end
opt-in capture (E.164-before-write, ttl=now+4yr+30d, sendType:'contact', STOP test-enforced). Deliver a
pii-inventory snippet (integrator coordinates w/ PII session). verify-before-commit, PR. FLAG HIGH-RISK → FULL audit + operator go.
```

### E-4) WS-E-COPY — re-engagement copy + compliance injection
```
ONE workstream. Work-order: scheduling/docs/workstreams/WS-E-COPY-llm-reengagement.md. Read it + §E3/E4 + CLAUDE.md.
lambda (confirm BSH-vs-standalone home w/ integrator), branch feature/scheduling-ws-e-copy, base main, OWN worktree.
OWN only the re-engagement copy module: LLM-prompted (Bedrock) + PROGRAMMATIC compliance injection (reschedule link +
STOP + unsubscribe always present, even on an empty/adversarial model reply — test it). Diplomatic tone; never
"no availability". verify-before-commit, PR. FULL audit (compliance invariant).
```

### E-5) WS-E-ATTEND — attendance + disposition + escalation *(HIGH-RISK; after E-REMIND E5)*
```
ONE workstream. Work-order: scheduling/docs/workstreams/WS-E-ATTEND-missed-event-disposition.md. Read it + §E1/E3/E4
+ §B4 + the D4 /attended/* endpoints + CLAUDE.md. lambda, branch feature/scheduling-ws-e-attend, base main, OWN
worktree. OWN the attendance-check (sets NON-KEY attendance_state='pending_attendance', NOT Booking.status) + the
3-option disposition (wires D4's stubbed action → valid status completed/no_show/coordinator_no_show) + E10 escalation
(T+24h/72h/7d) + C13 Zoom-T15 paging. CONSUME WS-E-REMIND's EventBridge lib + WS-E-TCPA selectChannels + WS-E-COPY.
verify-before-commit, PR. FLAG HIGH-RISK → FULL audit + operator go.
```

### E-6) WS-E-OAUTH — Calendar Connection consent flow *(HIGH-RISK; SPLIT backend→frontend)*
```
ONE workstream. Work-order: scheduling/docs/workstreams/WS-E-OAUTH-calendar-connection.md. Read it + §E0 + UX-DECISIONS
D2 + CLAUDE.md (never-share-IAM, credential gate). SPLIT: backend PR first (feature/scheduling-ws-e-oauth-backend,
lambda+infra-note) then UI PR (feature/scheduling-ws-e-oauth-ui, dashboard), base main, OWN worktrees. Build the Google
3LO consent flow (redirect→code-exchange→write picasso/scheduling/oauth/{tenant}/{coord} secret→fire B5) REUSING the
shipped oauth-client.js, on the D3 domain; + revocation detection (401 invalid_grant→disconnect+bookable:false;
5xx→stale-connected — distinguish in a test); + the staff Connection UI. Testing-mode (no Google verification). Deliver
per-secret IAM + pii-inventory snippets. verify-before-commit, PR. FLAG HIGH-RISK → FULL audit + operator go.
```

### E-7) WS-E-PORTAL — Customer-Portal surfaces *(operator-gated merge; after dash#9)*
```
ONE workstream. Work-order: scheduling/docs/workstreams/WS-E-PORTAL-customer-portal-surfaces.md. Read it + §E7 + §A +
UI plan Surfaces 2/3/7/8/9 + UX-DECISIONS D3/D4/D8 + CLAUDE.md. picasso-analytics-dashboard, branch
feature/scheduling-ws-e-portal (split per surface), base main, OWN worktree. Wire E12/E15 render-slices into nav +
GET /scheduling/bookings (§E7); E13 team/tag settings; E13b Appointment Types + Teams CRUD (Team=tag; generate
RoutingPolicy under the hood, zero backend change; +modified_at; spike first, 4–6d); E14 templates (incl. SMS); E16
embed (after E-OAUTH). Keep the scheduling vitest suite green. verify-before-commit, PR. Light audit, but
OPERATOR-GATED MERGE (merge = prod deploy) — no auto-merge.
```

### E-8) WS-E-CI6 — synthetic monitor *(LAST — gates E exit)*
```
ONE workstream. Work-order: scheduling/docs/workstreams/WS-E-CI6-synthetic-monitor.md. Read it + §E1/E6 + CI strategy
§5.1 + CLAUDE.md. lambda + infra-note, branch feature/scheduling-ws-e-ci6, base main, OWN worktree. OWN the synthetic
monitor: 5 cycles (cancel/attendance/reminder/disposition/revocation); time-compression via is_synthetic+STAGING_TEST_MODE
double-gate (start_at=now+N_min); HARD prod-guard (refuse init if STAGING_TEST_MODE && ENVIRONMENT=production — test it);
token-revocation cycle = OPERATOR-triggered + monitored (no auto-revoke); nightly >7d synthetic cleanup. verify-before-commit,
PR. Full audit (prod-safety guard).
```

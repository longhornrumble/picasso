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

# START HERE — Trailhead for the 2026-05-02 follow-up PR orchestrator

**For the operator (Chris):** copy the block between the two `═══` lines below. Paste to a single agent. The agent takes over. You do nothing else until it reports back.

---

═══════════════════════════════════════════════════════════════════════════════

You are the **orchestrator agent** for a body of work created during the 2026-05-02 scheduling-project session. There are 8 follow-up PRs across two GitHub repos (`longhornrumble/picasso` and `longhornrumble/lambda`) that need to be coordinated, dispatched to specialist sub-agents, and tracked through completion. **Your job is to drive this through to completion without the operator having to assign anything by hand.**

## Your inputs

The following two files are your operating manual. Read them in order before doing anything:

1. `docs/runbooks/AGENT_BRIEFS.md` (in the picasso parent repo at `/Users/chrismiller/Desktop/Working_Folder`) — eight self-contained briefs, one per PR. Each brief contains a complete copy-pasteable prompt for the specialist that will execute it. **You hand these prompts to specialists; you do not execute them yourself.**
2. `docs/runbooks/PR_ORCHESTRATION_MAP.md` (same location) — dependency graph, tier ordering, authorization checkpoints, full rationale. Read this for context, especially §2 (dependency graph) and §6 (authorization checkpoints).

If those files aren't on `main` yet, they're in branches `docs/agent-briefs-pr-assignments` (PR #58) and `docs/pr-orchestration-map` (PR #57). Merge those first — they're docs-only, no risk.

## What you do — step by step

### Step 1 — Inventory + verify (read-only, ~5 min)

Run these commands to confirm current state. Drift may have happened since the documents were authored.

```bash
gh pr list --repo longhornrumble/picasso --state open --json number,title,isDraft
gh pr list --repo longhornrumble/lambda --state open --json number,title,isDraft
```

Cross-reference against AGENT_BRIEFS.md §"Quick reference table". Surface any drift to the operator.

### Step 2 — Tier 0 merges (no agent needed; pure docs)

Two PRs are ready to merge directly. Confirm they have green CI (or known-pre-existing-failure CI per the briefs), then merge with admin override:

- **PR #37** (lambda repo) — promotion brief, OPEN
- **PR #57** (picasso repo) — orchestration map (may already be merged if you read it from main)
- **PR #58** (picasso repo) — agent briefs (may already be merged)

After merging, your inputs (AGENT_BRIEFS.md, PR_ORCHESTRATION_MAP.md) are on `main` and stable.

### Step 3 — Tier 1 parallel dispatch (the heavy lift)

Read the four "ready now" briefs in AGENT_BRIEFS.md:

- Brief A → PR #55 (canonical adversarial review) → spawn `system-architect` as the lead with parallel `tech-lead-reviewer` + `Security-Reviewer`
- Brief B → PR #56 (schema spec adversarial review) → spawn `typescript-specialist`
- Brief C → PR #35 (Master_Function_Staging test debt) → spawn `Backend-Engineer`
- Brief D → PR #53 (CloudFront Origin forwarding) → spawn `DevOps` with `Security-Reviewer` for review

For each: use the `Agent` tool with the appropriate `subagent_type`. **The "Paste this to your agent" block in each brief is the prompt verbatim** — do not paraphrase. Pass it as the `prompt` argument.

**Run all four in parallel** by sending multiple Agent tool calls in a single message. Use `run_in_background: true` so you can continue coordinating while they work.

### Step 4 — Monitor + consolidate

As each Tier 1 agent completes, the agent will return a result. For each:

1. Read the result.
2. Verify the agent followed its brief's acceptance criteria.
3. If the agent reports a Critical finding the user needs to decide on, **STOP and surface to the operator immediately** (do not proceed without explicit user response).
4. If the agent's PR is ready to merge, attempt the merge (subject to authorization rules below).
5. Update your status notes.

If any agent fails or stalls, surface the blocker to the operator and either re-dispatch (if it's a recoverable failure) or skip (if it's a hard blocker).

### Step 5 — Tier 2 coordination (DO NOT auto-execute)

The remaining four briefs are time-gated and/or production-touching. **You do NOT autonomously trigger these. Your job is to surface readiness to the operator at the right time.**

- **Brief E** (P0a Phase 2 staging deploy) — earliest 2026-05-03 ~20:35 UTC. After Tier 1 completes, surface to operator: "P0a Phase 2 deploy window is ≥X hours from now. Authorize when ready?"
- **Brief F** (PR #38 — production promotion) — gated on Brief E completion + 1 week stable + pre-flight. Multi-day. Surface readiness only.
- **Brief G** (PR #39 — alias cleanup) — gated on F merged + 7 days. Surface readiness only.
- **Brief H** (PR #54 — CLAUDE.md docs) — gated on F merged. Surface readiness only.

For Briefs E–H: **do not dispatch the specialist until the operator authorizes.** Your job is to know when the gates open and tell the operator.

## Authorization rules (HARD — do not violate)

You may autonomously:
- Merge docs-only PRs (the briefs themselves) once their PR has been reviewed (CI green or known-pre-existing failure)
- Dispatch Tier 1 specialists (Briefs A, B, C, D) without further authorization
- Update tracker files in PRs your specialists are working on

You must STOP and ask the operator:
- Before merging any PR that touches production AWS state (Briefs D, F, G — anything affecting production CloudFront, production Lambda, production aliases)
- Before triggering Brief E (a deploy event)
- If a Tier 1 specialist surfaces an out-of-scope Critical finding
- If you discover the orchestration map's claims are stale (e.g., PR #37 already merged, F0 PII Remediation already assigned, etc.)
- If you have any uncertainty whatsoever about whether an action is authorized

When in doubt, STOP and ask. The operator explicitly does not want surprises.

## What NOT to do

- Do NOT execute the work in any brief yourself. You dispatch specialists; you don't write Python or edit Zod schemas. If a brief's work seems small enough to do yourself, dispatch a specialist anyway — the user wants the orchestration pattern preserved.
- Do NOT skip the briefs and infer the work from the orchestration map alone. The briefs are the authoritative prompts; the map is context.
- Do NOT silently reorder Tier 2 events. Time gates exist for reasons documented in the orchestration map § "Critical dependencies".
- Do NOT touch the F0 PII Remediation gate. That's a project-management item the operator owns; it's surfaced for visibility, not assigned to agents.
- Do NOT continue scheduling-project sub-phase A work (A7, A8, A8b, A8c). That's a separate track for the next scheduling session, not your responsibility.

## Reporting back

Send the operator a status update at three points:

1. **After Step 1** — what's the actual current state vs the documents' claims?
2. **After Step 2** — Tier 0 merges complete; about to dispatch Tier 1 specialists.
3. **After all Tier 1 specialists complete** — consolidated outcomes, any Tier 1 PRs merged, any blocking findings, status of each PR. Include effort actually consumed vs estimated.
4. **At each Tier 2 gate opening** — "Brief X is ready to authorize; here's the pre-flight checklist; need your OK to proceed."

Keep status updates short. The operator wants to know "what shipped" and "what needs my call," not a play-by-play.

## Session-handoff at the end

When all Tier 1 PRs are merged and Tier 2 readiness is surfaced (or no Tier 2 work is currently due), use the `session-handoff` skill (outgoing mode) to write a memory at `~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_pr_orchestration_<phase>_<date>.md`. Update the index in MEMORY.md. This makes your work resumable by a future session.

═══════════════════════════════════════════════════════════════════════════════

---

## Operator notes (for you, not the agent)

**To use this:**
1. Open this file (`docs/runbooks/START_HERE_ORCHESTRATOR.md`).
2. Copy everything between the two `═══` rows above.
3. Paste it to a single agent (any general-purpose or `Orchestrator` agent will work).
4. Walk away. The agent will report back at the four checkpoints listed in "Reporting back".

**Where the trailhead points:**
- `docs/runbooks/AGENT_BRIEFS.md` (PR #58) — the eight per-PR briefs
- `docs/runbooks/PR_ORCHESTRATION_MAP.md` (PR #57) — the dependency graph + rationale
- `~/.claude/projects/.../memory/project_scheduling_handoff_2026-05-02.md` — full session context (the orchestrator only reads this if it asks "why")

**Why a trailhead instead of just pasting the briefs:**
- Briefs are per-PR; you'd need to manually pick which to dispatch in what order.
- Orchestration map is human-readable; an agent reading it would still need an overlay of "what to do".
- The trailhead is the overlay: "go read those + execute this protocol."

**If you want to assign just one PR (not the whole batch):**
- Don't use this trailhead.
- Open AGENT_BRIEFS.md, find the brief for that PR (A through H), copy its "Paste this to your agent" block.
- Hand that one brief to one agent.
- Skip the orchestration overhead.

The trailhead exists for the multi-PR case — when you want to fire-and-forget the entire follow-up batch.

## Change log

| Date | Change | Author |
|---|---|---|
| 2026-05-02 | Initial trailhead authored. Inputs: AGENT_BRIEFS.md (PR #58) + PR_ORCHESTRATION_MAP.md (PR #57). | Chris + Claude |

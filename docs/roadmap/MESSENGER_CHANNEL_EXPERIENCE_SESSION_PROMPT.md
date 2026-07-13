# Session Prompt — Messenger Channel Experience

Copy everything below the line into a new Claude Code session to work a subphase of the Messenger Channel Experience program.

---

## Project: Messenger Channel Experience — subphase execution

We're making "Messenger" (**= Facebook Messenger + Instagram DM together**, per Chris's standing vocabulary) a first-class Picasso channel: V5 single-pass brain, native CTA rendering, conversational forms, scheduling, human escalation to the Business Suite inbox, plus channel-health and abuse rails. The Meta pipeline (Meta_Webhook_Handler → async Invoke → Meta_Response_Processor) is as-built and E2E-verified on staging; this program makes its hardcoded behavior tenant-configurable and adds the missing capabilities.

### Read first, in this order

1. `docs/roadmap/MESSENGER_CHANNEL_EXPERIENCE.md` (picasso repo) — the program plan. §3 verified facts, §4 decisions, §5 contracts, §6 your subphase's block (Scope / OWN / CONSUME / PRODUCE / Deliverables / DONE / adversarial focus / agents).
2. `Lambdas/lambda/docs/messenger/CONTRACTS.md` — the nine frozen contracts (exists after M0; if you ARE running M0, you're writing it).
3. `Facebook/messenger-research-2026-07/README.md` — July-2026 Meta platform ground truth (ten findings). Deep-dive reports 01–04 in the same folder when your subphase touches that surface.

### Hard constraints

- **Staging only.** Prod promotion is a separate gated program — never touch account 614.
- **Pull to `origin/main` first.** The operator's local `Lambdas/lambda` checkout has repeatedly been stale; every file:line citation in the plan doc is against `origin/main`. If the working tree is dirty with someone else's work, read via `git show origin/main:<path>` and work in a fresh worktree/branch — never discard local changes.
- **Adversarial review before code.** Re-verify your subphase's premises (the §3 facts it relies on) against current code; if a premise fails, amend the plan doc — don't execute against it.
- **Frozen contracts are frozen.** If your subphase needs a contract change, that's an M0 amendment PR (additive-only for payload v2, webhook-deploys-first), reviewed by tech-lead-reviewer — not an in-place edit.
- **`/verify-before-commit` before every commit** (code changes; pure docs exempt but run the plan's doc cross-checks).
- **PR routing:** lambda repo → `main` (merge auto-deploys touched staging functions); picasso repo code/IaC → `staging`; picasso pure docs → `main`. Merge-commit strategy for staging↔main PRs.
- **Shared-table caution:** `picasso-recent-messages` is shared with live widget chat — any Meta-side row operation filters strictly by the `meta:` sessionId prefix.
- **One subphase per session, one PR** (M0 may be two: lambda contracts doc + config-builder types). Update the plan doc's §12 evidence log + the memory file in the same session.

### How to start

1. State which subphase you're running (default: the first one whose §12 entry is empty — M0 first).
2. Pull the owning repo(s) to `origin/main`; re-verify the subphase's CONSUME inputs exist and are frozen.
3. Run the adversarial pre-pass (tech-lead-reviewer agent for M0 contracts and M3a evidence; self-adversarial minimum elsewhere).
4. Implement to the DONE line — it is falsifiable on purpose; if you can't demonstrate it live on staging, the subphase isn't done.
5. PR, merge when green, verify the staging auto-deploy, write the §12 evidence entry + memory update.

### Test tenant / fixtures

- Staging tenant `MYR384719` (both channels connected and E2E-verified 2026-07-12).
- Standard Access limits senders to app role-holders — the tester roster question is owned by M4-S (G7).

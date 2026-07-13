# Session Prompt — Messenger Product Surface

Copy everything below the line into a new Claude Code session to work a subphase of the Messenger Product Surface program.

---

## Project: Messenger Product Surface — subphase execution

We're building the management/activation product surface on top of the code-complete, flag-gated Meta Messenger pipeline (**"Messenger" = Facebook Messenger + Instagram DM together**, per Chris's standing vocabulary). The lambda-side pipeline works today but there is no UI to turn it on, no way to set the escalation recipient, and no way for a tenant to connect their FB/IG pages — Chris hit this concretely when an IG "speak with staff" test produced no escalation email because the flag was off and nothing could turn it on. This program is three repos: `picasso-config-builder` (CB — the flag + `messenger_behavior` config UI), `Lambdas/lambda` (`Picasso_Config_Manager` plumbing fixes + `Analytics_Dashboard_API` for the portal write path), and `picasso-analytics-dashboard` (the tenant portal — connect card + escalation editing).

### Read first, in this order

1. `docs/roadmap/MESSENGER_PRODUCT_SURFACE.md` (picasso repo) — the program plan. §5 verified facts + landmines, §6 your subphase's block (Scope / OWN / CONSUME / PRODUCE / Deliverables / DONE / adversarial focus / agents), §7 cross-repo gates.
2. `picasso-config-builder/docs/AGENT_RESPONSIBILITY_MATRIX.md` — agent selection for your subphase's assigned agents.
3. `docs/roadmap/MESSENGER_CHANNEL_EXPERIENCE.md` (picasso repo) — the sibling lambda-side pipeline this program manages. Read it for pipeline context (§1 goal, §4 design decisions — especially D1's DDB-authoritative rule, D10's config-driven strings — and §5 the `messenger_behavior` contract C2 already frozen there) even if your subphase never touches lambda code; the CB-side `MessengerBehavior` shape (T2b) must reconcile with it.

### Hard constraints

- **Staging only** for every repo. Prod promotion is out of scope for this entire program.
- **`/verify-before-commit` before every code commit.** Pure-docs changes are exempt but still run the plan's cross-checks (links resolve, citations accurate).
- **Base-branch routing is per-repo, not uniform** — this is the one place this program differs from its lambda-only sibling:
  - `Lambdas/lambda` code → `main` (auto-deploys touched staging functions on merge).
  - `picasso-config-builder` code → that repo's own staging/CI path (PR → auto staging deploy on merge to its `main`).
  - `picasso-analytics-dashboard` code → that repo's own CI (`test:scheduling` gates).
  - Picasso repo pure docs (this plan, this prompt, any roadmap update) → `main`, per the branch-routing table in root `CLAUDE.md`.
- **Backend-first gate: T2a must be live on staging — not merely merged — before T2c's PR merges.** This is the silent-drop gate (plan §7); verify it live, don't infer it from CI green.
- **Always send the whole `messenger_behavior` object.** Every writer (CB via Config Manager, the portal via `Analytics_Dashboard_API`) sends the complete section, never a partial patch — both write paths use replace/deep-merge semantics that assume this discipline. Bake it into your subphase's tests.
- **Tier-1-ships-first is the unblock, not a suggestion.** If you're picking a subphase and T1 hasn't shipped yet, default to T1 — it's the fastest path to Chris being able to activate MYR384719.
- **Delegation blast-radius rule (plan §4):** tenant-safe + support-call-saving → portal; system-breaking → super-admin (CB). Don't move a control across that line without an explicit, recorded graduation decision — and graduation is one-way (super-admin → tenant, never back).
- **Cross-repo contracts are not CI-enforced.** The section contract (P0b/T2a) and the `messenger_behavior` shape (T2b vs. the lambda-side C2) are each validated only within their own repo's tests. If your subphase touches either, manually re-diff against the other repo's copy — don't assume a mismatch would be caught automatically.

### How to start

1. **State which subphase you're running.** Default: **T1**, unless the plan doc's phasing table (§6) shows it already shipped — check for evidence of a merged PR before assuming otherwise.
2. Pull the owning repo(s) to `origin/main` (or each repo's equivalent) first; re-verify your subphase's CONSUME inputs are actually frozen/live, not just described in the plan.
3. Run an adversarial pre-pass against the plan doc's premises for your subphase (tech-lead-reviewer agent where the plan names one; self-adversarial minimum otherwise) — if a premise has drifted, amend the plan doc rather than executing against a stale assumption.
4. Implement to the subphase's DONE line — it's written to be falsifiable on purpose. If you can't demonstrate it live on the relevant staging environment, the subphase isn't done.
5. PR to the correct base per the routing rules above; merge when green; verify the staging auto-deploy where applicable; update the plan doc if your subphase's execution deviated from its written scope.

### Test tenant / fixtures

- Staging tenant `MYR384719` (both channels connected and E2E-verified on the lambda side 2026-07-12) — the target for every live verification step (flag toggle, config round-trip, connect card, escalation edit).

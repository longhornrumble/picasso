# Scheduling Canonical Design — Adversarial Review

**Status:** DRAFT — placeholder for a future scheduling-project session, ideally before sub-phase B starts.

## Why this PR exists

`scheduling/docs/scheduling_design.md` (1556 lines) is the canonical source-of-truth for the scheduling v1 feature. It has been amended twice during the 2026-05-02 session:

1. §11 missed-event cadence rewritten (escalate-and-keep model; T+30min, T+24h cc, T+72h urgent, T+7d weekly digest; explicit no-auto-completion)
2. §2.3 + §17 V4→V5 reframed as parallel post-v1 track (was "simultaneously" Austin's V4→V5 migration)

Plus §8 gained a permissions-matrix forward-reference.

**The canonical has never been independently adversarially reviewed.** Other planning docs (implementation plan, UI plan, CI strategy, schema spec) all went through 2-3 reviewer adversarial passes during 2026-05-02. The canonical did not. Inconsistencies are likely lurking — both internal (between sections within the canonical) and external (vs the now-revised sibling docs).

## What to do when this PR is picked up

### Step 1 — internal consistency audit

Read the canonical end-to-end with a critical eye:

- Do §11 (missed-event cadence) and §9.2 (state machine) agree? The state machine references `pending_attendance` and `coordinator_no_show` — do the cadence transitions in §11 match those state names exactly?
- Do §10.1 (RoutingPolicy) and §10.2 (pool-at-commit) round-robin descriptions agree? Schema spec §10 implies `tie_breaker: 'round_robin'` is the only v1 value but canonical §10.1 lists `'first_available'` too.
- Is §2.3 internally consistent after the 2026-05-02 V4→V5 amendment? Same for §17.
- §13 unified-token format — does it cover the missed-event disposition emails per §11.2? Are all the action-token purposes enumerated there?
- §5.7 calendar event content (PII boundary) — does it agree with §12 reminder content? Is the volunteer's first/last name handling consistent across both?

### Step 2 — cross-doc consistency audit

Spawn 3 specialized reviewers in parallel (system-architect, tech-lead-reviewer, Backend-Engineer or Security-Reviewer for variety):

- system-architect — checks the canonical's architectural claims against the implementation plan + UI plan + CI strategy
- tech-lead-reviewer — scope, feasibility, coherence
- Security-Reviewer (or Backend-Engineer) — second-look pass on §13 unified token format + §5.7 PII boundary + §14 push-notification system

Compare reviewer findings to what the implementation plan already addresses. Surface gaps where the canonical contradicts a sibling doc.

### Step 3 — apply findings

Same protocol used for the implementation plan + CI strategy:
- Apply each finding as a surgical edit
- Add change-log entry
- Re-run a proofing audit if findings volume warrants

### Step 4 — promote

Once stable, this PR's branch becomes the green-light "canonical is reviewed" milestone. Sub-phase B starts on top of a verified canonical.

## Acceptance criteria

- [ ] No internal inconsistencies (every state name, term, schema field used in the canonical is consistent across sections)
- [ ] No contradictions vs `scheduling_implementation_plan.md`, `scheduling_ui_plan.md`, `scheduling_ci_strategy.md`, `scheduling_config_schema.md`
- [ ] All Critical findings from reviewers either applied or explicitly waived with rationale
- [ ] Change log entry added
- [ ] Memory entry written confirming canonical is now reviewed

## Why now (or before sub-phase B)

Sub-phase B's first tasks (Calendar_Watch_Listener, Calendar_Watch_Renewer) implement behaviors the canonical specifies. If the canonical has internal contradictions — e.g., reminder cadence in §12 disagrees with state machine in §9.2 — the engineer hits ambiguity at implementation time. A pre-sub-phase-B review surfaces these now, while it's cheap to fix.

## Links

- Canonical: `scheduling/docs/scheduling_design.md` (local-only, untracked)
- Sibling docs (committed via 2026-05-02 session): `scheduling_ui_plan.md`, `scheduling_ci_strategy.md`, `scheduling_implementation_plan.md`, `scheduling_config_schema.md`
- 2026-05-02 session memory: `~/.claude/projects/.../project_scheduling_planning_2026-05-02.md`

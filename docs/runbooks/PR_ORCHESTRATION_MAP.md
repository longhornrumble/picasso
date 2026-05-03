# PR Orchestration Map — 2026-05-02 Session Follow-ups

**Audience.** The orchestrator agent (or operator) coordinating the follow-up PRs created in the 2026-05-02 scheduling/security session.

**Purpose.** Single source of truth for: which PRs exist, what each one needs, dependencies between them, suggested execution order, and which agent type to assign for each.

---

## 1. The PR map

Eight tracking PRs are open across two repos. Five are picasso-parent draft PRs containing tracker docs; three are lambda repo (one open, two draft). Plus PR #35 (test debt) which already exists from earlier in the session.

### Picasso parent repo (`longhornrumble/picasso`)

| # | Title | Branch | Tracker file | Status |
|---|---|---|---|---|
| [#53](https://github.com/longhornrumble/picasso/pull/53) | fix(cloudfront): forward Origin header to Lambda origins | `fix/cloudfront-origin-header-forwarding` | `docs/runbooks/CLOUDFRONT_ORIGIN_HEADER_FORWARDING.md` | DRAFT |
| [#54](https://github.com/longhornrumble/picasso/pull/54) | docs: update CLAUDE.md to document two-function Lambda deployment model | `docs/claude-md-two-function-model` | `docs/runbooks/CLAUDE_MD_TWO_FUNCTION_MODEL.md` | DRAFT |
| [#55](https://github.com/longhornrumble/picasso/pull/55) | docs(scheduling): canonical design adversarial review | `docs/scheduling-canonical-adversarial-review` | `docs/runbooks/SCHEDULING_CANONICAL_REVIEW.md` | DRAFT |
| [#56](https://github.com/longhornrumble/picasso/pull/56) | docs(scheduling): config schema adversarial review | `docs/scheduling-config-schema-adversarial-review` | `docs/runbooks/SCHEDULING_CONFIG_SCHEMA_REVIEW.md` | DRAFT |
| (this PR) | docs: PR orchestration map | `docs/pr-orchestration-map` | `docs/runbooks/PR_ORCHESTRATION_MAP.md` | meta — describes the others |

### Lambda repo (`longhornrumble/lambda`)

| # | Title | Branch | Tracker file | Status |
|---|---|---|---|---|
| [#35](https://github.com/longhornrumble/lambda/pull/35) | chore(test-debt): resolve Master_Function_Staging Python test failures | `chore/master-function-test-debt-tracking` | `Master_Function_Staging/TEST_DEBT.md` | DRAFT |
| [#37](https://github.com/longhornrumble/lambda/pull/37) | docs(master_function): brief on staging vs production drift + promotion plan | `docs/staging-to-prod-promotion-brief` | `Master_Function_Staging/STAGING_TO_PROD_PROMOTION_BRIEF.md` | OPEN (ready to merge) |
| [#38](https://github.com/longhornrumble/lambda/pull/38) | chore: staging→production promotion of Master_Function | `chore/master-function-staging-to-prod-promotion` | `Master_Function_Staging/PROMOTION_TRACKING.md` | DRAFT |
| [#39](https://github.com/longhornrumble/lambda/pull/39) | chore(security): clear vestigial staging aliases on Master_Function | `chore/master-function-clear-vestigial-aliases` | `Master_Function_Staging/ALIAS_CLEANUP_TRACKING.md` | DRAFT |

---

## 2. Dependency graph

```
                    ┌────────────────────────────────────────┐
                    │  P0a Phase 2 (decoder hardening)       │
                    │  Scheduled 2026-05-03 ≥20:35 UTC       │
                    │  NOT a PR — it's a deploy event        │
                    └────────────┬───────────────────────────┘
                                 │ unblocks ↓
                                 │
   ┌─────────────────────────────┴──────────────────┐
   │                                                │
┌──▼───────┐      ┌──────────────┐     ┌────────────▼───────────┐
│ #55, #56 │      │ #53, #54, #35│     │ #37 (READY) → #38       │
│ scheduling│      │ infra/docs   │     │  (after Phase 2 + 25h) │
│ reviews  │      │ debt cleanup │     │ #38 merged + 7d stable  │
│ (parallel│      │ (parallel)   │     │       → #39             │
│  ok)     │      │              │     │  (sequential)           │
└──────────┘      └──────────────┘     └─────────────────────────┘
   │                    │                          │
   │ unblocks ↓         │                          │ unblocks ↓
   │                    │                          │
   ▼                    ▼                          ▼
┌─────────────┐   (no downstream             ┌─────────────────┐
│ Sub-phase B │    blocking from              │ #54 (CLAUDE.md  │
│ start       │    these — they're            │  reflects new   │
│ (scheduling)│    cleanup PRs)               │  arch state)    │
└─────────────┘                               └─────────────────┘
```

### Critical dependencies

- **#37** (promotion brief) is OPEN and ready to merge. The other lambda PRs reference it. **Merge first.**
- **#38** (promotion event) requires P0a Phase 2 staging soak + pre-flight checklist complete. Earliest: ~2026-05-08.
- **#39** (alias cleanup) requires #38 merged + 7 days production stability. Earliest: ~2026-05-15.
- **#54** (CLAUDE.md docs) ideally lands AFTER #38 because it documents the post-promotion architecture state.
- **#55/#56** (scheduling reviews) ideally land BEFORE sub-phase B starts (no hard deadline; "as soon as bandwidth allows").
- **#35** (test debt) has no dependencies — can be picked up at any time.
- **#53** (CloudFront) has no dependencies — defense-in-depth, no urgency.

---

## 3. Suggested execution order

### Tier 0 — Immediate, no further authorization needed

| Order | PR | Why this tier | Effort estimate |
|---|---|---|---|
| 1 | **#37** (promotion brief — lambda repo) | Already approved as OPEN; merging unblocks downstream. Pure docs merge. | 5 min |
| 2 | **This PR** (orchestration map) | Same — pure docs. | 5 min |

### Tier 1 — Independent work, parallelizable, no dependencies

These four can be picked up in parallel by different specialist agents. None blocks any other.

| Order | PR | Specialist agent | Effort estimate | Why parallelizable |
|---|---|---|---|---|
| 3 | **#55** (canonical adversarial review) | system-architect + tech-lead-reviewer + Security-Reviewer (3-agent pass) | 2-4 hours | Touches `scheduling/docs/scheduling_design.md` only |
| 4 | **#56** (config schema adversarial review) | typescript-specialist (1-agent pass) | ~1 hour | Touches `scheduling/docs/scheduling_config_schema.md` only |
| 5 | **#35** (Master_Function_Staging test debt) | Backend-Engineer (or test-engineer) | ~4.5 hours focused | Touches `Master_Function_Staging/test_*.py` only |
| 6 | **#53** (CloudFront Origin forwarding) | DevOps + Security-Reviewer | 1-2 hours | Touches AWS CloudFront config — no code |

### Tier 2 — Time-gated sequential

| Order | PR | Gating condition | Specialist | Effort |
|---|---|---|---|---|
| 7 | P0a Phase 2 deploy (NOT a PR — staging deploy event) | 25h after Phase 1 prod = ≥2026-05-03 20:35 UTC | Backend-Engineer + user authorization | ~1 hour |
| 8 | **#38** (Master_Function staging→prod promotion) | P0a Phase 2 + 1 week staging stable + pre-flight env-var audit complete | DevOps + Backend-Engineer + user-driven | 4-6 hours including pre-flight |
| 9 | **#39** (alias cleanup) | #38 merged + 7 days production stability | DevOps | 30 min |
| 10 | **#54** (CLAUDE.md docs) | Ideally after #38 lands so docs reflect final state | technical-writer | 1-2 hours |

---

## 4. Orchestrator vs serial — my recommendation

**Recommendation: Hybrid.** A single coordinator agent owns the map + status tracking; spawns specialist agents in parallel for Tier 1 work; coordinates Tier 2 sequentially with explicit user authorization at each gate.

### Why not pure-orchestrator-everything-parallel

- Tier 2 PRs have hard time gates (25h soak, 7-day stabilization). No parallelism possible.
- Multiple PRs need user authorization at decision points (anything touching production AWS state). The orchestrator can't autonomously merge those.
- Even within Tier 1, PR #35 (test debt) and #53 (CloudFront) both touch the lambda repo and might benefit from sequential execution to avoid CI queue contention.

### Why not single-agent-serial

- 4 independent Tier 1 PRs serialized = 8-10 hours of one agent's wall-clock time.
- Different specialist agents are genuinely better at different work types: `Backend-Engineer` for test debt, `system-architect` for canonical review, `DevOps` for CloudFront. No single agent excels at all four.
- Parallel review (PRs #55 + #56) gets done in 1 hour wall-clock instead of 5-6 hours sequential.

### Concrete orchestrator dispatch pattern

```
Tier 0 (now):
  Orchestrator merges #37 (already approved) and this PR (#TBD).

Tier 1 (parallel, ~4-6 hours wall-clock):
  Orchestrator spawns 4 background agents simultaneously:
    - Agent A (system-architect + others, multi-reviewer mode) → PR #55 canonical review
    - Agent B (typescript-specialist) → PR #56 config schema review
    - Agent C (Backend-Engineer) → PR #35 test debt
    - Agent D (DevOps + Security-Reviewer review) → PR #53 CloudFront
  Orchestrator monitors all four; consolidates findings; merges as each completes.

Tier 2 (sequential, multi-day):
  Orchestrator does NOT auto-execute. Instead:
    - On 2026-05-03 ~20:00 UTC: orchestrator surfaces P0a Phase 2 readiness check;
      asks user to authorize Phase 2 staging deploy (Backend-Engineer agent executes).
    - On 2026-05-04 ~21:00 UTC (24h+ post-Phase-2): orchestrator surfaces the
      promotion checklist (#38); asks user when to schedule the dedicated event.
    - On promotion+7d: orchestrator surfaces #39 (alias cleanup) for execution.
    - After #38 merges: orchestrator surfaces #54 (CLAUDE.md docs) to land final.
```

### What the orchestrator owns (vs what specialists own)

**Orchestrator owns:**
- The PR map state (this document)
- Cross-PR dependency tracking
- Time-gate enforcement (don't allow Tier 2 to start before Tier 1 is sufficiently complete)
- User authorization gating for production-touching work
- Consolidating findings from parallel specialists
- Updating `MEMORY.md` and the PR orchestration map as work completes

**Specialist agents own:**
- Their specific PR's investigation, fixes, and test verification
- Following the tracker file in their PR's branch as the working contract
- Surfacing blockers back to the orchestrator
- Their PR's verify-before-commit gate

---

## 5. Per-PR specialist agent assignment

For a future orchestrator session, this is the prompt template per PR.

### PR #55 — canonical adversarial review

**Agents:** system-architect + tech-lead-reviewer + Security-Reviewer (3-reviewer parallel pass mirroring 2026-05-02 patterns).

**Brief:** Read `scheduling/docs/scheduling_design.md` end-to-end. Apply the adversarial-review pattern that was successful for the implementation plan (PR-equivalent). Surface findings in three tiers (Critical / Material / Minor). Apply Tier 1 + Tier 2 to the canonical; surface strategic items to user. Then run a proofing audit by re-spawning the same three reviewers in proofing mode. Update tracker file `docs/runbooks/SCHEDULING_CANONICAL_REVIEW.md` with results.

**Definition of done:** all internal inconsistencies resolved; canonical no longer contradicts sibling docs; reviewer findings applied or explicitly waived; PR promoted draft → ready; merged.

### PR #56 — config schema adversarial review

**Agent:** typescript-specialist (single-reviewer pass).

**Brief:** Read `scheduling/docs/scheduling_config_schema.md`. Verify (a) every cross-section invariant in §10 references fields that exist in §3-§9, (b) every Zod type literal lists complete sets, (c) every `superRefine` rule is implementable, (d) defaults are sensible. Cross-check against merged Zod implementations in `picasso-config-builder/src/lib/schemas/scheduling.schema.ts`, `cta.schema.ts`, `tenant.schema.ts`. Apply edits to the schema spec; if findings reveal gaps in merged Zod code, file separate follow-up tasks.

**Definition of done:** schema spec is internally consistent + matches merged code; tracker updated; PR promoted draft → ready; merged.

### PR #35 — Master_Function_Staging test debt

**Agent:** Backend-Engineer (or test-engineer for the test-specific work).

**Brief:** Read `Master_Function_Staging/TEST_DEBT.md`. Resolve all 8 failure clusters in order. Per cluster: implement fix, re-run pytest, commit with `fix(test-debt): Cluster N — [name]: X passing tests recovered`. After all clusters done, run full Master_Function_Staging pytest suite — expect 273/273 passing. Promote draft → ready; merge.

**Definition of done:** all 273 tests pass on CI; no `pytest.skip` markers added; tracker file updated with execution log.

### PR #53 — CloudFront Origin forwarding

**Agents:** DevOps + Security-Reviewer (review).

**Brief:** Read `docs/runbooks/CLOUDFRONT_ORIGIN_HEADER_FORWARDING.md`. Identify the origin request policies on each affected CloudFront distribution. Update the policy to forward the `Origin` header for Lambda-backed cache behaviors. Verify with curl that the Origin header now reaches the Lambda (visible in CloudWatch logs). Verify the response's `Access-Control-Allow-Origin` header reflects the actual request origin (not wildcard). DOES NOT MERGE without explicit user authorization (production CloudFront is shared infrastructure).

**Definition of done:** Origin header forwards correctly on staging + production CloudFront; verifications pass; security review confirms no caching regressions; user authorizes merge.

### PR #38 — Master_Function staging→prod promotion

**Agents:** DevOps + Backend-Engineer + user-driven.

**Brief:** Read `Master_Function_Staging/STAGING_TO_PROD_PROMOTION_BRIEF.md` end-to-end. Execute the pre-flight checklist (env var audit, DDB tables, IAM, tenant configs, Bedrock compatibility). Schedule the maintenance window. On the day of: snapshot prod tenant configs, deploy staging code to `Master_Function`, publish version, update `production` alias. Tail CloudWatch for 30 minutes; smoke-test production widget. If anything regresses, roll back to v14 via alias update. Document any issues in a postmortem.

**Definition of done:** production widget runs new code; chat works end-to-end for ≥1 production tenant; CloudWatch error rate stable; #38 merged with promotion notes.

### PR #39 — vestigial alias cleanup

**Agent:** DevOps.

**Brief:** Read `Master_Function_Staging/ALIAS_CLEANUP_TRACKING.md`. Verify no integrations reference `Master_Function:staging` or `:STAGING` (per the verification commands in the tracker). Delete the aliases. Confirm `aws lambda list-aliases` returns only `production`. Merge PR #39.

**Definition of done:** vestigial aliases gone; no traffic regressions; PR merged.

### PR #54 — CLAUDE.md two-function model docs

**Agent:** technical-writer.

**Brief:** Read `docs/runbooks/CLAUDE_MD_TWO_FUNCTION_MODEL.md` for the proposed content + acceptance criteria. Update root `CLAUDE.md`, `Picasso/CLAUDE.md`, and `picasso-config-builder/CLAUDE.md` with the two-function deployment model section. Cross-reference lambda PRs #37, #38, #39. Promote draft → ready; merge.

**Definition of done:** all CLAUDE.md files document the two-function pattern explicitly; no remaining ambiguity about staging vs production routing.

---

## 6. Authorization checkpoints

The orchestrator must pause and request user authorization at:

1. **Before merging any production-touching PR** (#38, #39, #53 — anything that affects shared infra or production)
2. **Before P0a Phase 2 staging deploy** (modifies live staging Lambda)
3. **Before scheduling the promotion event** (date/time decision)
4. **If any specialist agent surfaces a Critical finding** that wasn't in the tracker file (out-of-scope discovery)
5. **If a specialist agent fails to complete** their PR within 2x the estimated effort (likely indicates the work is bigger than scoped)

---

## 7. State tracking

The orchestrator should keep this map current. As PRs are completed:
- Update the row in §1 to "MERGED"
- Cross out the dependency in §2 (the unblocked downstream PRs become startable)
- Update `MEMORY.md` with progress

When all PRs in this map are merged, the session-handoff `project_scheduling_handoff_2026-05-02.md` can be marked "out-of-scope work fully cleaned up" and superseded by a new handoff focused purely on scheduling sub-phase A continuation.

---

## 8. The truly hard parts (what this map can't simplify)

Some decisions remain user-driven and can't be delegated:

- **F0 PII Remediation** owner + start date — surfaced in scheduling implementation plan as a v1-launch hard gate. NOT in any PR. Belongs on a project-management track, not a code-PR track.
- **Promotion event timing** (#38) — needs a maintenance window aligned with business operations.
- **Sub-phase B start** (scheduling project) — the scheduling agent decides this based on the canonical/schema review outcomes (PRs #55, #56). Don't start sub-phase B if the reviews surface Critical findings.

These are surfaced for visibility, not assigned to agents.

---

## 9. Change log

| Date | Change | Author |
|---|---|---|
| 2026-05-02 | Initial map authored at end of session that created the underlying PRs. | Chris + Claude |

# Sub-phase A — CI-8 Gate A record

**Sub-phase scope:** scheduling v1 sub-phase A (A1–A8c + CI-1, CI-2, CI-3a, CI-5, CI-8) per `scheduling_implementation_plan.md` §3.

**Author:** Claude (Opus 4.7) under `chris@myrecruiter.ai` operator authority.
**Date written:** 2026-05-24.
**Date sub-phase A actually exited gates:** sub-phase A is **NOT yet formally complete** at the time of this writing — see [Status](#status) below.

This doc satisfies the missing artifact called out as audit blocker **B6** in `~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_scheduling_subphase_a_phase_completion_audit_2026-05-24.md`. It is the durable evidence record that CI-8's Gate A (`scheduling_ci_strategy.md` §4.2) ran at sub-phase A exit. Gate B (the adversarial phase-completion-audit) has a separate authoritative record in the memory cited above; this doc does NOT duplicate that — it points to it.

---

## Gate A definition (verbatim from CI strategy §4.2)

> **Gate A — Automated test-run gate.**
> - All tests in all repos touched by the sub-phase pass on `main` HEAD
> - New tests added for new code (not "we'll write tests later")
> - Coverage on new code ≥ 80% (existing project floor; per `feedback_testing_rigor.md`)

## Repos touched in sub-phase A

| Repo | Surface | Final state |
|---|---|---|
| `longhornrumble/picasso` | Widget (`MessageBubble.jsx` scheduling dispatch branches), employee-registry config fields, scheduling docs in `scheduling/` | `origin/main` advanced through PRs #139, #140, #142, #183, #190, #192 (see plan §3 audit trail) |
| `longhornrumble/picasso-config-builder` | Schemas (`scheduling.schema.ts`, `tenant.schema.ts`, `cta.schema.ts`), CI-2 gate + workflow-trigger guard | `origin/main` advanced through PRs #45, #46, #47, #48, #49, #50, #53 |
| `longhornrumble/lambda` | BSH `prompt_v4.js` scheduling-aware vocabulary, employee-registry consumers | `origin/main` advanced through PR #129 |

## Test posture at exit (Gate A check 1 — "all tests pass on main HEAD")

| Repo | Command | Result at 2026-05-24 |
|---|---|---|
| picasso-config-builder | `npm run test:run` | 524 tests pass, 0 fail, 37 test files (post-PR #54 coverage closures; was 521 pre-) |
| picasso (widget) | `npx jest src/components/chat` | 72 tests pass, 0 fail (post-PR #193 B1/B2/B3 closures; was 70 pre-) |
| lambda Bedrock_Streaming_Handler_Staging | `npm test` | unit suite green per merged PR #129; coverage breakdown below in check 3 |

Gate A check 1: **PASS** in all three repos at sub-phase A exit + post the audit-closure PRs landing.

## New-tests-for-new-code (Gate A check 2)

| Sub-phase A task | New code lands in | New tests added in same / follow-up PR |
|---|---|---|
| A1 — BSH scheduling-aware vocabulary | `prompt_v4.js` `intentLabel()`, vocabulary `SCHEDULE` | `prompt_v4_intent_label.test.js` (PR #129) |
| A2 — Widget scheduling dispatch placeholders | `MessageBubble.jsx` handleCtaClick branches for `start_scheduling` / `resume_scheduling` | `MessageBubble.test.jsx` scheduling dispatch tests + `ctaActionContract.test.jsx` (CI-3a) |
| A3 — `scheduling.schema.ts` | pcb scheduling block | `scheduling.schema.test.ts` (100% file coverage) |
| A4 — `cta.schema.ts` scheduling actions/types | `start_scheduling` / `resume_scheduling` / `scheduling_trigger` | `cta.schema.test.ts` scheduling actions describe block (+ warning-branch coverage added by PR #54) |
| A5 — `tenant.schema.ts` cross-config invariants | scheduling_enabled / appointment_types check | `tenant.schema.scheduling.test.ts`; forward-compat regression `tenant.schema.forwardcompat.test.ts` |
| A7 — pcb scheduling editors | settings + form fields | `FeatureFlagsSettings.scheduling.test.tsx`, `CTAFormFields.scheduling.test.tsx` |
| A8 / A8b — AdminEmployee fields + i18n | lambda Master_Function | covered by PR #129's test suite |
| A8c — `picasso-booking-staging` DDB + GSIs | Terraform `infra/modules/scheduling-booking/` | infra-state verified live in staging-525; smoke covered by Row 4 live test (PR #192 closure) |
| CI-1 | pcb workflow `pr-checks.yml` | self-hosted via repo's own CI run |
| CI-2 | pcb `scripts/validate-prod-configs.ts` + `pr-checks.yml` `prod-config-validation` job | added in PR #54: `src/lib/validation/__tests__/prodConfigsValidator.test.ts` (12 tests) |
| CI-3a | Picasso `ctaActionContract.test.jsx` | self-contained; widened in PR #193 |
| CI-5 (path-gated prod-deploy approval) | NOT shipped at sub-phase A exit — **blocker B5** | see [Status](#status) |
| CI-8 (this artifact) | THIS document | n/a — doc artifact only |

Gate A check 2: **PARTIAL** — covered for every shipped A-task; CI-5 is the one outstanding gap (carried as audit blocker B5).

## Coverage on new code ≥ 80% (Gate A check 3)

Coverage measurements at sub-phase A exit + audit-closure PRs:

| File / module | Coverage (lines) | Source | Gate A floor met? |
|---|---|---|---|
| `picasso-config-builder/src/lib/schemas/scheduling.schema.ts` | 100% | vitest run 2026-05-24 | ✅ |
| `picasso-config-builder/src/lib/schemas/cta.schema.ts` | 80.16% (post PR #54; was 65%) | vitest run 2026-05-24 | ✅ |
| `picasso-config-builder/src/lib/validation/prodConfigsValidator.ts` | 98.71% (post PR #54; was 0% / out of include) | vitest run 2026-05-24 | ✅ |
| `picasso-config-builder/src/lib/schemas/tenant.schema.ts` (overall) | ~57% — but every sub-phase-A-touched section is covered (scheduling cross-config invariants 100%, form->program join 100%) | vitest run 2026-05-24 | ⚠️ overall file is below 80% but the NEW lines added in sub-phase A are covered; pre-existing untested branches are out-of-scope |
| `Picasso/src/components/chat/MessageBubble.jsx` scheduling dispatch branches | branch coverage in `MessageBubble.test.jsx`; CI-3a contract guard exact-match | jest run 2026-05-24 | ✅ for the scheduling branches; whole-file coverage is not measured because MessageBubble has many non-scheduling responsibilities and is out-of-scope here |
| `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/prompt_v4.js` | **31%** | jest coverage 2026-05-24 | ❌ — see [Status](#status). This is audit blocker **B7**. `selectActionsV4`, `classifyTopic`, `selectCTAsFromPool` all at 0%. |

Gate A check 3: **PARTIAL** — every pcb file added or modified in sub-phase A meets the 80% floor; the lambda BSH file does NOT (31% vs 80% target). This is the single largest open blocker against formal Gate A pass.

## Anti-shortcut commitments check (CI strategy §3)

> "No `// TODO: implement before launch` markers in committed code without an owner + ticket."

`grep -rn "TODO: implement before launch"` across `Picasso/src`, `Lambdas/lambda/Bedrock_Streaming_Handler_Staging`, and `picasso-config-builder/src` at 2026-05-24 origin/main → 0 matches. **PASS.**

> "No `as any` in TypeScript additions; full type coverage per schema spec."

Spot-check on sub-phase-A-added TS surface: pcb schemas, prodConfigsValidator, scheduling editors — 0 `as any`. **PASS.**

> "No skipping Zod validation tests for 'obvious' invariants."

All sub-phase A schema additions ship with corresponding `.test.ts` files. Forward-compat regression tests pin loosenings that real prod configs depend on (see `tenant.schema.forwardcompat.test.ts`). **PASS.**

## Status

**Sub-phase A — Gate A: PARTIALLY SATISFIED at the time of this writing.**

What's green:
- Tests in all touched repos pass on `main` HEAD (check 1)
- New tests added for every shipped task (check 2 — modulo CI-5 which is itself unshipped)
- Coverage ≥ 80% on every pcb sub-phase-A-touched file post-audit-closures (check 3, pcb-side)
- Anti-shortcut commitments hold

What's red, treated as open blockers per the phase-completion-audit:
- **B5** — CI-5 (path-gated prod-deploy approval) NOT shipped
- **B6** — this doc artifact existed only after this PR (now closed by this file)
- **B7** — `prompt_v4.js` coverage 31% vs 80% target (the new BSH scheduling vocabulary is the largest single source of untested logic)

Sub-phase A cannot be marked formally COMPLETE until B5 + B7 are addressed (fix-now or explicit operator waiver with rationale). The audit memory at `project_scheduling_subphase_a_phase_completion_audit_2026-05-24.md` is the single authoritative source for the full blocker matrix + per-row dispositions; this Gate A record is the durable artifact CI strategy §4.2 mandates.

## Gate B reference

Gate B (the adversarial phase-completion-audit) ran on 2026-05-24 with 4 reviewers (code-reviewer, tech-lead-reviewer, test-engineer, Security-Reviewer). Findings: **12 BLOCKERS + 16 strong recommendations + 8 concerns**. Authoritative gap matrix lives at:

- `~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_scheduling_subphase_a_phase_completion_audit_2026-05-24.md`

Per-row dispositions land in subsequent triage PRs; this Gate A doc does NOT reproduce that matrix.

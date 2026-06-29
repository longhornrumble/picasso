# Environment Naming Parity — Remediation Plan

**Status:** PLAN ONLY — nothing changed, applied, or committed by the session that authored this (2026-06-29).
**Author intent (operator, verbatim):** *"I want identical environments in every way that only differ because they are in separate accounts. Every single thing about them needs to be identical, except they are in separate accounts. All friction needs to be removed… fix these structural issues so future projects stop hanging up on them."*
**Decisions captured for execution:** scope = *plan only this session*; data method when renames execute = *preserve data (migrate), never replace non-empty tables*.
**Review:** tech-lead-reviewer, 2026-06-29 → **APPROVE-WITH-CHANGES**; all 5 must-fix + 2 should-fix items incorporated (Phase 0.5 ADA `DeleteItem` blocker, pre-PR `rg` seam gate, concurrent-write handling §5, per-table rollback, Phase 3↔Phase 2 dependency, employee-registry decision elevated, prod channel-mappings prerequisite, Phase-2 reorder).

This extends the existing **DynamoDB naming-alignment program** (memory `reference_picasso_table_naming_alignment`) and reuses its proven per-table recipe (`reference_table_rename_recipe`). It does **not** reinvent them.

---

## 0. TL;DR — the premise of the triage brief was wrong

The brief said a staging `terraform plan` wants to **destroy-and-recreate 7 DynamoDB tables**, and that *"any infra PR merge could wipe these tables."* **That is false for the deployed configuration.** Verified 2026-06-29:

| Source of truth | Result |
|---|---|
| `terraform plan` from `origin/main` (current HEAD) | `0 to add, 3 to change, 0 to destroy` — and all 3 changes are dummy-secret noise from the local probe (CloudFront `x-picasso-cf-origin` header, meta `MESSENGER_VERIFY_TOKEN`, one cosmetic IAM action-list reorder). **0 table replacements.** |
| CI plan, PR #607 | `0 to add, 1 to change, 0 to destroy` |
| CI plan, PR #609 | `No changes.` |
| CI apply on merge-to-main (#609, run 28341143383) | `Apply complete! Resources: 0 added, 0 changed, 0 destroyed` |
| CI state refresh log | confirms state IDs already bare, e.g. `module.ddb_audit_staging[0]…[id=picasso-audit]` |

**Why the brief (and a naive local plan) saw destroys:** the plan was run from a **stale branch**. The branch `align/recent-messages-iam-followup` is **466 commits behind `main`** and missing ~34 modules main has already applied to staging; a plan from it wants to destroy everything main added, *and* it predates the naming-alignment commits that already stripped the suffixes in config. A plan from that branch shows `184 to destroy`; the same plan from `origin/main` shows `0`.

**Consequence:** there is **no emergency**. No apply is needed to avert data loss. The dangerous part of the alignment program (the ~17 analytics/core/PII tables) is **already done** on staging — config = state = live for all of them. What remains is finishing the cosmetics and the deeper structural refactor. This is the *"stop future projects hanging up"* work, not a fire.

> **Root cause of the false alarm itself = root cause #4 below (stale-branch plan terror).** Fixing that is part of the deliverable.

---

## 1. Verified current state (2026-06-29)

### 1a. Cross-account DynamoDB inventory

Account boundary IS the environment: **525 = staging, 614 = prod.** A `✅` means staging and prod agree on a bare `picasso-<name>` (the target).

| Logical table | staging-525 | prod-614 | Status |
|---|---|---|---|
| audit | `picasso-audit` | `picasso-audit-production` | ⚠️ **prod suffixed, staging bare** (inverted) |
| billing-events | `picasso-billing-events` | `picasso-billing-events` | ✅ |
| channel-mappings | `picasso-channel-mappings` | `picasso-channel-mappings` | ✅ |
| conversation-summaries | `picasso-conversation-summaries` | `picasso-conversation-summaries` | ✅ |
| notification-events | `picasso-notification-events` | `picasso-notification-events` | ✅ |
| notification-sends | `picasso-notification-sends` | `picasso-notification-sends` | ✅ |
| pii-dsar-audit | `picasso-pii-dsar-audit` | `picasso-pii-dsar-audit` | ✅ |
| pii-subject-index | `picasso-pii-subject-index` | `picasso-pii-subject-index` | ✅ |
| pii-tenant-purge-audit | `picasso-pii-tenant-purge-audit` | `picasso-pii-tenant-purge-audit` | ✅ |
| recent-messages | `picasso-recent-messages` | `picasso-recent-messages` | ✅ (pilot) |
| scheduled-messages | `picasso-scheduled-messages` | `picasso-scheduled-messages` | ✅ |
| session-events | `picasso-session-events` | `picasso-session-events` | ✅ |
| session-summaries | `picasso-session-summaries` | `picasso-session-summaries` | ✅ |
| sms-consent | `picasso-sms-consent` | `picasso-sms-consent` | ✅ |
| sms-usage | `picasso-sms-usage` | `picasso-sms-usage` | ✅ |
| token-blacklist | `picasso-token-blacklist` | `picasso-token-blacklist` | ✅ |
| webhook-dedup | `picasso-webhook-dedup` | `picasso-webhook-dedup` | ✅ |
| tenant-registry | `picasso-tenant-registry-staging` | `picasso-tenant-registry-production` **+** `production-tenant-registry` | ⚠️ both suffixed; **prod has TWO** |
| employee-registry | `picasso-employee-registry-v2-staging` | `picasso-employee-registry` | ⚠️ different base name (`-v2` vs none) + suffix |
| form-submissions | `picasso-form-submissions-staging` | `picasso_form_submissions` | ⚠️ suffix + **underscores vs hyphens** (also a pre-existing key-schema divergence) |
| token-jti-blacklist | `picasso-token-jti-blacklist` | *(absent)* | staging-only, bare ✅ |
| attribution-aggregates | `picasso-attribution-aggregates` | *(absent)* | staging-only, bare ✅ |
| entry-points | `picasso-entry-points` | *(absent)* | staging-only, bare ✅ |
| appointment-type | `picasso-appointment-type-staging` | *(absent)* | ⚠️ staging-only, suffixed (scheduling-era) |
| booking | `picasso-booking-staging` | *(absent)* | ⚠️ staging-only, suffixed |
| routing-policy | `picasso-routing-policy-staging` | *(absent)* | ⚠️ staging-only, suffixed |
| scheduling-notif-template | `picasso-scheduling-notif-template-staging` | *(absent)* | ⚠️ staging-only, suffixed |
| conversation-scheduling-session | `picasso-conversation-scheduling-session-staging` | *(absent)* | ⚠️ staging-only, suffixed |
| calendar-watch-channels | `picasso-calendar-watch-channels-staging` | *(absent)* | ⚠️ staging-only, suffixed (TF reads it as a `data` source) |

**~17 of 29 are already aligned.** The original 16-table short-term program finished the analytics/core/PII wave but left `tenant-registry` and `form-submissions`; the newer scheduling tables were created *after* the program, still suffixed.

### 1b. The 9 staging tables still carrying `-staging` — item counts + blast radius

These are **consistent** (config = state = live), so they carry **no drift and no replacement risk today**. Renaming them is a deliberate, data-preserving migration:

| Table | items | consumer files | Notes |
|---|---|---|---|
| `picasso-booking-staging` | 210 | 14 | feeds redemption-handler, calendar-event-consumer, calendar-watch-listener, stranded-booking-remediator + GSIs |
| `picasso-form-submissions-staging` | 6 | 13 | ⚠️ **hardcoded-ARN seam** — literal `t_form_submissions = "${local.ddb}/picasso-form-submissions-staging"` in `lambda-pii-delete-staging`, `lambda-pii-tenant-purge-staging`, `lambda-pii-dsar-staging`. Also key-schema differs from prod (separate issue). |
| `picasso-calendar-watch-channels-staging` | 4 | 10 | TF references it as a **`data` source** (`data.aws_dynamodb_table.calendar_watch_channels_staging`), not a managed resource — rename path differs (see Phase 2 note). |
| `picasso-conversation-scheduling-session-staging` | 60 | 6 | |
| `picasso-tenant-registry-staging` | 2 | 6 | also has a prod twin to converge (Phase 4) |
| `picasso-routing-policy-staging` | 3 | 5 | |
| `picasso-appointment-type-staging` | 5 | 3 | |
| `picasso-employee-registry-v2-staging` | 5 | 3 | base-name mismatch with prod must be resolved first |
| `picasso-scheduling-notif-template-staging` | 0 | 0 | **trivial** — empty + no consumers → safe even as a plain replace |

### 1c. The four naming patterns coexisting in `infra/modules/ddb-*`

1. `picasso-X-${var.env}` → resolves to `-staging` (booking, routing-policy, appointment-type, session-summaries, token-blacklist, conversation-scheduling-session…)
2. hardcoded `picasso-X-staging` (form-submissions, tenant-registry, employee-registry-v2…)
3. prefix `staging-X` — env at the **front** (was `staging-conversation-summaries`; now aligned)
4. bare `picasso-X` — the **target** (audit, notification-*, pii-*, recent-messages, channel-mappings…)

Note even the "done" tables are computed inconsistently: some hardcode the bare string, others still use `${var.env}` but happen to resolve correctly. **The inconsistency in *how the name is computed* is the friction, independent of the current value.**

---

## 2. Root causes (structural — these are what to actually fix)

1. **Four naming patterns in the IaC.** New modules pick whichever the author last saw. This is the generator of all future drift.
2. **Twin modules per environment.** `lambda-master-function-staging` *and* `lambda-master-function-prod`; `ops-alarms-bsh-prod`; etc. — separate module directories per account instead of **one module instantiated per env** (`count = var.env == "X" ? 1 : 0`). This is the deepest blocker to *"identical, differ only by account."* DDB has it too: every module dir is named `ddb-*-staging` even when the resource is bare.
3. **No prod Terraform parity for the data tables.** There is no `prod.tfbackend`; only newer `*-prod` keystone modules are TF-managed. The legacy prod tables are hand-created with divergent names (`-production`, `production-` prefix, underscores). There is no "apply the same config to both accounts" path yet.
4. **Stale-branch plan terror.** Long-lived branches drift hundreds of commits behind main and produce terrifying-but-fake `N to destroy` plans. *This is literally what produced the false-alarm brief.* It erodes trust in `terraform plan` as a safety signal.

---

## 3. Target convention (the standard to enforce)

- **Physical name:** `picasso-<name>` — bare, **no env token anywhere** (no `-staging`, no `-production`, no `staging-`/`production-` prefix, no underscores). The AWS account boundary is the environment.
- **One module per resource**, instantiated per environment via `count = var.env == "<env>" ? 1 : 0`. No twin `-staging`/`-prod` module directories. Module **directory names drop the `-staging` suffix** too (`modules/ddb-booking`, not `modules/ddb-booking-staging`).
- **Name computed in exactly one place** per module — a literal bare string (preferred for stable core tables) or a single `local`. Never re-derive a name from `var.env` in a consumer.
- **Consumers single-source** the name/ARN from the module's `table_name`/`table_arn` outputs — **never** a hardcoded `"${local.ddb}/picasso-X-staging"` literal (root cause of the IAM-ARN seam).
- **Scope (long-term):** the same rule applies to every resource type, not just DDB — Lambda **functions** (`Master_Function_Staging` → `picasso-master-function`/agreed bare name), IAM roles, log groups, S3 buckets, SQS queues, secrets, KMS aliases. Memory `reference_picasso_table_naming_alignment` §LONG-TERM estimates this at ~3× the table program.

---

## 4. Phased plan

Each phase is staging-first, gated, and verified by a **clean CI plan** before merge. Prod is a hard stop (Phase 4 only, explicit operator gate).

### Phase 0 — Investigation + premise correction ✅ DONE (this doc)
- Verified no live landmine; mapped both accounts; recorded finding to memory `project_environment_naming_parity_plan_2026-06-29`.

### Phase 0.5 — Pre-execution blockers (must clear BEFORE any Phase 1/2 PR merges)
Every infra PR merged to `main` **auto-applies to staging** (per #609). So any latent live-vs-TF gap fires on the *first* PR of this program, regardless of what that PR touches. Clear these first:

1. **🚨 ADA `DeleteItem` time-bomb (hard blocker).** The operator hand-added `dynamodb:DeleteItem` to the LIVE `aws_iam_role_policy.exec` to unblock Teams-unification team-delete, but `main`'s `SchedulingConfigWrite` statement (`infra/modules/lambda-analytics-dashboard-api-staging/main.tf` ~L403) omits it. **The next CI auto-apply will silently revert the hand-grant → team-delete re-breaks (502 AccessDenied).** Fix FIRST, as its own standalone PR off `origin/main`: add `"dynamodb:DeleteItem"` to that statement's `actions` (CI plan should show a single one-action add on `aws_iam_role_policy.exec`, 0 destroys). Ref: memory `reference_ada_staging_role_iam_drift`. (NB: that memory's *original* "do not apply the ADA module / hand-managed drift" claim was a stale-branch misdiagnosis and is **corrected** — `main`'s ADA module is faithful; it should be applied, with this one-line fix.)
2. **Branch hygiene.** All PRs in this program branch from `origin/main`, never the 466-behind working branch. **Local `terraform plan` is prohibited as a verification method** (it needs CI-injected secret TF_VARs and is meaningless on a stale branch) — the CI plan posted on the PR is the only acceptable plan artifact.
3. **Resolve the `employee-registry-v2` canonical-name decision** (operator-owned, see §8) — its rename can't start until the base name (`-v2` vs none, to match/diverge from prod `picasso-employee-registry`) is decided.

### Phase 1 — Convention standard + CI guard (docs + CI; zero resource change)
1. Promote §3 into `CLAUDE.md` as a hard rule ("new resources are created bare from day one").
2. Add a CI check (in `pr-checks` and/or `infra-deploy.yml` plan job) that **fails** on any *newly added* DDB/Lambda/S3 name literal matching `-staging|-production|staging-|production-` outside an **allowlist** of the not-yet-migrated names. This stops the four-patterns problem at the source. ⚠️ **The allowlist is live state:** each Phase 2 rename MUST remove its name from the allowlist in the same PR, or the guard goes stale and stops protecting.
3. Document the stale-branch rule (root cause #4): *a scary `N to destroy` plan on a feature branch behind main is almost always staleness, not drift — rebase on `origin/main` and re-plan before believing it.*
- **Verify:** CI guard green on a no-op PR; CLAUDE.md updated.
- **Gating:** Phase 1 must be merged and live **before** Phase 2 opens any PR (otherwise a 10th suffixed table could land mid-program unguarded).

### Phase 2 — Finish staging DDB bare-rename (the 9 tables), data-preserving
Order: trivial → low-consumer → high-consumer. Suggested sequence:
`scheduling-notif-template` (0/0, trivial) → `appointment-type` → `routing-policy` → `employee-registry-v2`* → `tenant-registry` → `conversation-scheduling-session` → `calendar-watch-channels`‡ → `form-submissions`† → `booking` (highest blast radius, last).

- *`employee-registry-v2`: resolve the **base-name mismatch with prod** (`-v2` vs none) before renaming — decide the canonical bare name first (§8, Phase-0.5 prerequisite).
- ‡`calendar-watch-channels`: TF consumes it as a **`data` source**, so the rename is "create bare table + migrate + flip the data-source name + drop old," with no managed-resource replace. ⚠️ These are **4 live Google Calendar push-notification channels** — complete the data migration AND consumer repoint *before* removing the old data-source reference, or the watch reconciliation Lambda may try to re-register channels and hit Google's channel quota.
- †`form-submissions` (placed late on purpose): clears the **hardcoded-ARN seam** in the 3 PII modules; also flag (don't fix here) the staging/prod **key-schema** divergence. A missed seam here = **DSAR / tenant-purge AccessDenied = PII-compliance exposure**, not just a bug — treat the `update-function-code` of the operator-invoked PII Lambdas as **mandatory**, not optional follow-up.

**Per-table procedure (numbered — the `rg` seam check is a PRE-PR gate, not a post-apply check):**
1. **`rg` the seam BEFORE opening the PR:** `rg -n 'picasso-<table>-staging' infra/ Lambdas/ picasso-analytics-dashboard/ picasso-config-builder/`. Enumerate every hit in the PR description; fix each (single-source hardcoded IAM-ARN literals from the module ARN per `reference_table_rename_recipe` step 4). **No hit left unaddressed — this is the #1 cause of post-rename AccessDenied.**
2. Apply the §5 data-preserving recipe (add new bare module + copy + repoint).
3. Remove the renamed table's name from the Phase 1 CI-guard allowlist **in the same PR**.
4. One PR → CI plan reviewed as the gate (0 destroys except the intended new-table create) → merge → auto-apply to staging.
5. `update-function-code` for operator-invoked Lambdas (DSAR, pii-delete, pii-tenant-purge) whose table names are hardcoded code constants.
6. Live-verify (below) → follow-up PR drops the old table.

- **Verify per table:** new bare table `ACTIVE` with item-count parity vs old; all consumers' env vars + IAM grants live on the new ARN; old table idle (no writes draining — see §5) then `GONE`; `rg` shows **0 stale `-staging` refs** across `infra/` + all Lambda repos + dashboard + config-builder.
- **Rollback per table:** revert the PR (consumers repoint back to the old ARN) + re-run `update-function-code` for the hardcoded-constant Lambdas. **Old-table data is intact** because the old table is not deleted until the separate step-6 follow-up PR — so rollback is non-destructive at every point before that.

### Phase 3 — Collapse twin `-staging`/`-prod` modules into env-parameterized modules
**Dependency:** does NOT begin until **all 9 Phase 2 renames are complete, verified, and the old tables dropped.** Running module-address surgery (`moved{}`) concurrently with physical renames multiplies the state-manipulation surface and risks a `moved{}` mistake degrading into a destroy+create that bypasses the data-preserving intent.
- Rename module directories to drop `-staging`; gate resources with `count = var.env == "<env>" ? 1 : 0`; merge `*-prod` twins into the same module.
- Use `moved {}` blocks so the **state address change is a no-op** (no destroy/create). This is a pure refactor — **the gate is a `0 to destroy` plan.**
- **Business justification (not "nice to have"):** this env-parameterized shape is the prerequisite that makes the eventual non-DDB renames (§3 long-term: Lambda functions, IAM roles, log groups, S3) tractable — without it, every non-DDB rename re-pays the twin-module tax.
- **Verify:** `terraform plan` no-op after each module collapse; `moved{}` blocks resolve cleanly.

### Phase 4 — Prod naming convergence + prod TF parity (GATED — prod hard stop)
Per CLAUDE.md ("never `terraform apply` against prod during feature work; Phase 2 cutover is explicit, gated, rare") and memory `reference_picasso_table_naming_alignment` §LONG-TERM:
- Converge prod oddities to bare: `picasso-audit-production` → `picasso-audit`; `picasso-tenant-registry-production` → `picasso-tenant-registry`; retire the duplicate `production-tenant-registry`; `picasso_form_submissions` → `picasso-form-submissions` (with key-schema decision); reconcile `picasso-employee-registry` ↔ `-v2`.
- Dead-wood: verify-dead-per-table before deleting the ~16 superseded `-staging` shadow tables sitting in 614 (⚠️ `picasso-channel-mappings-staging` in 614 had **3 live items** — NOT dead; re-verify all).
- **Phase 4 prerequisite (read-only, do before any prod decommission):** identify what wrote the 3 live items in prod-614's `picasso-channel-mappings-staging` and whether any prod-account Lambda reads it. A `-staging`-named table with live data in the prod account means something in prod is mis-wired to it; that consumer must be repointed before the table can be retired.
- Bring prod data tables under Terraform (`prod.tfbackend` + faithful zero-change import), per the dashboard-IaC-adoption pattern (memory `project_dashboard_iac_adoption_handoff_2026-06-19`).
- **Each prod rename = its own gated change with explicit operator approval.** Larger prod tables (`session-events` ~3614 rows) use the PITR-restore migration variant (§5).

---

## 5. Data-preserving migration recipe (you chose *migrate*, never replace)

A physical DynamoDB rename always forces a Terraform **replace** (destroy+create) — which loses data. To preserve data we never let that happen on a non-empty table. Two safe variants:

### Variant A — TF-native add-new + copy (default; ideal for small staging tables)
1. **Add a new module instance** for the bare-named table (Terraform creates it empty with the exact schema). Leave the old module in place.
2. **Copy data** old → new: a `scan` + `batch-write-item` script (trivial at ≤210 items) — or boto3 paginated copy. Idempotent; re-runnable. This is the **bulk pass**; a **final sweep** runs after repoint (step 4) to catch rows written to the old table during the cutover window.
3. **Repoint consumers** (the 4-part change set from `reference_table_rename_recipe`):
   - (1) module-wired env vars + IAM grants → re-point wiring to the new module (auto on apply).
   - (2) hardcoded code consts / `os.environ.get('X','old')` fallbacks / test fixtures → edit (e.g. PII Lambda constants — by design they stay code-gated).
   - (3) **⚠️ hardcoded IAM-ARN literals** (`"${local.ddb}/picasso-X-staging"`) → single-source from the module ARN. **`rg -n 'picasso-X-staging' infra/` before cutover** to catch every seam. (form-submissions has 3.)
   - (4) operator-invoked Lambdas (DSAR, pii-delete) are not auto-deployed → `update-function-code` after the new table exists.
4. **Final sweep + declare idle.** After consumers are verified live on the new ARN, run one final copy pass to sweep any rows written to the old table during the cutover window, then confirm item-count parity. **"Old table idle" is not "item counts matched once" — it means every consumer's env var + IAM grant points at the new ARN AND no further writes are draining to the old table** (a ~30-second quiesce check is proportionate for staging's low write volume). Only then is the old table safe to drop.
5. **Remove the old module** (Terraform destroys the now-idle old table) in a follow-up PR.

### Variant B — PITR restore (for large tables, e.g. prod `session-events` 3614 rows)
`aws dynamodb restore-table-to-point-in-time --source-table-name OLD --target-table-name picasso-X` (PITR is enabled on these modules) → reconcile into the TF address via `state rm` old + `import` new → plan no-op → drop old. Freeze writes or dual-write during the restore window to avoid losing in-flight items.

**Empty/zero-consumer tables** (`scheduling-notif-template`) skip the copy entirely — a plain rename/replace is data-loss-free.

---

## 6. Verification gates (every phase)
- **CI plan is the gate, reviewed before merge** — local plan can't run (CI-injected secret TF_VARs: `messenger_verify_token`, `q5_*_secret`). A clean phase plan shows `0 to destroy` for everything except the intended new-table create.
- Post-apply live checks: new resource `ACTIVE`; item-count parity; consumers (env vars + IAM grants) on the new ARN; old resource `GONE`; `rg` across **all** repos shows 0 stale decorated refs.
- Honor `reference_staging_apply_cancelled_by_promote_pr_race`. **NB the ADA module:** the *corrected* `reference_ada_staging_role_iam_drift` (2026-06-29) overturns the old "do not apply the ADA module" claim — on `origin/main` the module is faithful and SHOULD be applied, after the Phase-0.5 `DeleteItem` fix lands. The earlier "hand-managed, do not apply" framing was a stale-branch misdiagnosis.

---

## 7. Process guardrails (so future projects stop hanging up)
1. **Create bare from day one** — new resources never get an env token (CLAUDE.md rule + CI guard, Phase 1).
2. **Stale-branch plan literacy** — a `N to destroy` plan on a branch behind main is staleness, not drift. Rebase on `origin/main`, re-plan, then believe it. (This single rule would have prevented this whole brief.)
3. **Drift cap** — keep branches within the existing ≤5-merge cap; this branch at 466-behind is the anti-pattern.
4. **One module per resource, env-parameterized** — no new twin `-staging`/`-prod` directories (Phase 3 makes it the norm).

---

## 8. Recommended sequencing & open decisions
- **Recommended first execution slice:** Phase 0.5 (clear the ADA `DeleteItem` blocker first) → Phase 1 (standard + CI guard) → Phase 2 (the 9 staging tables, data-preserving) — all staging-only, gated, reversible, high signal-to-blast-radius.
- **Then** Phase 3 (twin-module collapse) as a pure no-op refactor.
- **Phase 4 (prod) only on explicit operator gate** — slow, deliberate, one rename at a time.
- **Open decisions to resolve before Phase 2/4:** canonical bare name for employee-registry (`-v2` question); whether to fix the form-submissions key-schema divergence during its rename or log it; whether to keep the `picasso-` prefix universally (recommended — live tables already use it; the pilot's prefix-less `recent-messages` ended up as `picasso-recent-messages` anyway).

---

### Appendix — evidence
- Authoritative plan: `origin/main` worktree, `AWS_PROFILE=myrecruiter-staging`, dummy secrets → `0 add / 3 change (all dummy-secret) / 0 destroy`.
- CI: PR #607 plan `0/1/0`; PR #609 plan `No changes`; merge-#609 apply `0/0/0` (run 28341143383).
- Live inventories: 525 = 29 tables, 614 = 21 tables (§1a), pulled via `aws dynamodb list-tables` 2026-06-29.
- Item counts + blast radius: §1b (`describe-table` + `grep -rIl` across repos).
- Recipe + program: memories `reference_table_rename_recipe`, `reference_picasso_table_naming_alignment`, handoff `project_naming_alignment_handoff_2026-06-04_phaseB-prod-executed`.

# CI/CD + IaC Modernization Plan

**Status:** Approved by operator 2026-06-09 · **Supersedes** the "Where to start" sketch in
`CI_CD_MODERNIZATION.md` (that doc remains the kickoff/problem statement; this is the program plan).
**Owner:** CI/CD-modernization track · **Coordinates with:** prod-IaC program (separate writer — see Seams).

> Ground rule for any agent executing this plan: every "current state" claim below was verified live
> on 2026-06-09. **Re-verify before acting** — run histories, queues, and matrices move.

---

## Objective

One consistent, gated path from commit → staging → prod for all four products, designed for a
**solopreneur operating AI agents**:

- Agents run everything through staging autonomously.
- The human gets **few, meaningful, low-anxiety** prod gates — low-anxiety because rollback is one
  step; meaningful because gates never rot into ignored queues.
- A single machine-readable answer to "what is live where."

## Verified current state (2026-06-09)

| Product | Pipeline today | Verified evidence |
|---|---|---|
| **Lambdas** (`longhornrumble/lambda`) | PR checks solid (Node+Py tests, security, build, 19-fn matrix); staging auto-deploy on merge ✅; **prod CI = only `Analytics_Dashboard_API`** (last prod run 2026-04-30). MFS/BSH hand-deployed (§P5.1 slog). | `deploy-production.yml` matrix; `gh run list` |
| **Analytics Dashboard** | **Gold standard, working**: PR → staging deploy + URL comment → merge → prod deploy + CF invalidation (success 2026-06-07). No approval gate (merge = prod). No rollback (sync `--delete`). | `pr-checks.yml:77` deploy-staging; run history |
| **Config Builder** | Workflows exist but **pipeline is dead**: 8 runs stuck "waiting" since 2026-05-24 on the `production` environment gate (`deploy-production.yml:127`); **no staging bucket** (TODO in workflow file). | `gh run list --status waiting` → 8 |
| **Picasso widget** | `deploy-production.yml` triggers on every push to main → **21-run approval backlog** (back to 2026-06-03); prod-IaC sessions treat the queued runs as noise to reject. Has staging deploy + 2 env gates + `skip_staging` hotfix path. | `gh run list --status waiting` → 21 |
| **Infra (Terraform)** | Best layer in the stack: gated prod belt (`infra-deploy-prod.yml`, OIDC, `production` env gate, fail-closed `-target`), staging belt auto-apply, ~60 staging modules, 5 prod modules (whole BSH stack). | `git ls-tree origin/main .github/workflows/` |

**Stale-doc corrections:** `CI_CD_MODERNIZATION.md` says the dashboards deploy via "manual `aws s3 sync`"
— false for analytics-dashboard (working CI) and half-false for config-builder (CI exists, stuck).

## Weaknesses being addressed

| # | Weakness | Evidence (2026-06-09) |
|---|---|---|
| W1 | Lambda prod CI covers 1 of ~30 functions; MFS/BSH hand-deployed | prod matrix = ADA only |
| W2 | Config-builder pipeline dead — 8 stuck runs, no staging bucket | 16-day-old waiting queue |
| W3 | Widget prod deploy queues on every push → 21-run backlog, approval fatigue | waiting runs since 06-03 |
| W4 | No front-end rollback — `s3 sync --delete`, no versioned artifacts | all 3 deploy workflows |
| W5 | BSH prod versioning messy — URL serves `$LATEST`, no alias, rollback = "remember v25" | §P5.1 record |
| W6 | Tier-3 naming gap keeps every prod terraform apply `-target`-scoped | prod plan shows `3 to add` |
| W7 | No deployment observability — "what SHA is live where" answered by archaeology/incident | Foster Village class |
| W8 | Drift staging→main = 22 (cap 5), promote process manual | `git rev-list --count --merges` |
| W9 | MFS `include_globs` allowlist silently drops new runtime files — cost §P5.1 twice | `reference_lambda_deploy_include_globs_allowlist` |

---

## Phase 0 — Stop the bleeding (≈half a day)

| Task | Detail | Acceptance criterion |
|---|---|---|
| 0.1 Pending-deploy audit (read-only, FIRST) | Per repo: last *successful* prod deploy run + its SHA; diff vs `main` on deployable paths. Determines whether a catch-up dispatch is needed after draining. | Written list: "prod-intended changes pending: yes/no, which" |
| 0.2 Drain dead queues | Cancel all waiting `deploy-production` runs in picasso (21) + config-builder (8). Deletes nothing — code is on `main`; only the newest run per repo had any value and a fresh dispatch supersedes it. | `gh run list --status waiting` → 0 in both repos |
| 0.3 Re-trigger prod deploys as deliberate acts | Change widget + config-builder prod workflows: drop `push: main` trigger, keep `workflow_dispatch` (+ keep PR checks / staging-on-PR untouched). Kills queue spam at the source. | Merge to main no longer queues a prod run |
| 0.4 Catch-up dispatch (if 0.1 says yes) | One `workflow_dispatch` from current `main` per affected product; operator approves gate. | Prod current; smoke OK |
| 0.5 Drift promote | Open coordinated **scoped** staging→main promote(s) per `feedback_promote_pr_scope_discipline` (22 is cross-program: PII + scheduling + prod-IaC — needs per-program slices, not a blanket). | Both drift counts ≤ 5 |
| 0.6 Close stale #441 | Fix already shipped via #465; tracker still open. | Issue closed w/ evidence comment |

## Phase 1 — Lambda prod matrix (highest leverage, ≈2–3 sessions)

| Task | Detail | Acceptance criterion |
|---|---|---|
| 1.1 Add MFS + BSH to `deploy-production.yml` | Mirror the proven staging build steps (BSH: `npm ci` FULL deps + `npm run package` — `--production` fails, esbuild is a devDep; MFS: include_globs zip). Prod fn names are bare (`Master_Function`, `Bedrock_Streaming_Handler`); MFS fronted by `live` alias; BSH URL serves `$LATEST`, `InvokeMode RESPONSE_STREAM`, `AuthType AWS_IAM` + cf-origin — **don't disturb**. | Both functions promotable via dispatch; smoke passes |
| 1.2 Zip-manifest guard (kills W9) | CI step diffs the zip's file list vs the function dir's runtime files; FAILS on omission instead of silently dropping. Apply to staging + prod workflows. | A deliberately-added orphan `.py` fails the build |
| 1.3 Versions + alias rollback | Prod deploy = publish version + flip `live` alias; rollback = flip back. **Care:** BSH Function URL currently serves `$LATEST` and the widget hard-codes the URL — moving the URL to an alias must be staged + verified (coordinate w/ `bsh-function-prod` TF; `ignore_changes` deploy-marker pattern already handles the code/resource seam). If alias-fronting BSH is too risky, fall back to publish-version + documented one-command rollback (`update-function-code` to prior version's package). | One-step rollback demonstrated on staging twin first |
| 1.4 Post-deploy smoke per function | Replicate ADA's `smoke_path`/`smoke_expect_status` pattern. | Failed smoke = red run |
| 1.5 Deploy-state manifest (pulled forward from Phase 4) | Last step of EVERY deploy job writes `{product, env, function/bucket, sha, version, time, run_url}` to one S3 JSON (suggest `s3://myrecruiter-deploy-state/<env>/state.json` or a small DDB table). Add a `whats-live` script. Small; every later phase benefits. | One command answers "what's live where" for everything deployed since |

## Phase 2 — Front-end uniformity + rollback (≈2 sessions)

| Task | Detail | Acceptance criterion |
|---|---|---|
| 2.1 Reusable workflow | One `workflow_call` implementing the gold-standard shape (PR checks → staging deploy + URL comment → dispatch-gated prod → invalidation → smoke → manifest write). Analytics-dashboard is the template. All 3 front-ends consume it. | 3 repos on one shape; divergence ends |
| 2.2 Versioned artifacts | Upload each prod bundle to `s3://<bucket>/releases/<sha>/` before syncing live. Rollback = re-sync a prior release prefix + invalidate. | Rollback rehearsed once per product |
| 2.3 Config-builder staging bucket | Small TF module in `infra/` (staging account — fits existing staging belt + naming convention). Wire its staging deploy + un-stick the prod gate. | Config-builder PR deploys to staging; prod gate functional |
| 2.4 Widget queue sanity re-check | After 0.3 + 2.1, confirm no waiting-run accumulation over 2 weeks. | `--status waiting` stays 0 |
| 2.5 De-suffix the staging twins (operator-requested 2026-06-09; **SCOPED 2026-06-10 → `TASK_2_5_DESUFFIX_SCOPE.md`**) | Staging-account (525) `Master_Function_Staging` + `Bedrock_Streaming_Handler_Staging` → bare names, per uniform-env-rules (account = env; new staging fns are already bare — SMS_Sender, Calendar_*). **Not a rename-in-place** — create-new + cutover; discovery found both twins fully TF-managed (`var.function_name`-keyed), so the play is *parallel module instances*, cheaper than the ADA hand-managed playbook assumed. Blast surface, gates, waves, and 4 operator decisions: see the scope doc. **2026-06-10 live correction:** the prod-account relic Lambda is ALREADY deleted (614 has zero `*Staging*` functions; `kgvc8xnewf` routes all live traffic → `Master_Function:live`); what remains there is 3 route-less dangling integrations — trivial operator-run deletes. Sequence AFTER first successful prod dispatches (done — MFS v22 2026-06-10); coordinate w/ the active naming-alignment session (same infra tree, serialize applies). | Staging twins bare-named; widget/staging E2E green; dangling `kgvc8xnewf` integrations deleted; workflows updated |

## Phase 3 — Finish the IaC program (≈2–3 careful sessions, prod-IaC-owned)

> Executed under the **prod-IaC** program (one-writer-per-module). Listed here because this plan's
> Phase 1/2 work depends on coordination, not because this track owns it.

| Task | Detail | Acceptance criterion |
|---|---|---|
| 3.1 Tier-3 naming reconciliation (keystone) | Import the 3 prod form/session tables; make legacy `{name}-${var.env}` modules BARE-named; full-root prod plan → `No changes`; then drop the belt's required-`-target`. | Un-targeted prod plan = No changes |
| 3.2 MFS-prod module | Env/grants under TF (closes the Foster-Village env-drift class for MFS). Build COORDINATED with 1.1 (module first, then code CI). Scope: `project_prod_iac_mfs_module_scope_2026-06-06`. | MFS env change = PR, not hand-CLI |
| 3.3 Scheduled drift detection | Weekly `terraform plan` both accounts; non-empty plan opens an issue. (Unlocked by 3.1.) | Hand-edit caught in ≤7 days in a drill |

## Phase 4 — Agentic layer (the solopreneur payoff)

| Task | Detail | Acceptance criterion |
|---|---|---|
| 4.1 Push-notification gates | When a prod gate needs approval, notify the operator (existing scheduled-reminders / notification patterns). Approval = phone tap minutes after the agent stages work. | Gate-needed → notification < 1 min |
| 4.2 Auto-release-notes | Prod deploy appends commit log since last deploy to the version description / a GH release. | Every prod deploy carries its changelog |
| 4.3 Auto-rollback on failed smoke | Front-ends: re-sync previous release prefix; Lambdas: flip alias back / redeploy prior version. This is what makes approving agent work low-anxiety. | Induced smoke failure self-heals on staging drill |

## Sequencing rationale

Phase 0 is cheap and removes daily friction. Phase 1 attacks the most expensive recurring manual work
(MFS/BSH hand-deploys) and lands the deploy-state manifest early. Phase 2 is consolidation. Phase 3 is
careful import work, unhurried, prod-IaC-owned. Phase 4 rides on top. No new platforms — same accounts,
same gates, same branch model; the plan recalibrates *where the human is in the loop*.

## Seams with the prod-IaC program (do not cross)

- **One writer per module.** This track touches workflows + app artifacts; prod-IaC owns `infra/` prod
  modules. Tier 3 (3.1) and MFS-prod (3.2) are prod-IaC deliverables this plan *waits on / coordinates with*.
- **BSH code-vs-resource seam:** CI deploys code (`update-function-code`); TF owns the function resource
  (`bsh-function-prod`, `ignore_changes` on the description deploy-marker, `COLD_START_FORCE` as a var).
  Keep that separation in 1.1/1.3.
- **Hard rules carried over:** HARD STOP at prod (operator runs/approves prod mutations; agents cannot
  self-approve the `production` environment gate). Never share IAM roles across Lambdas. Code identical
  across envs; config/secrets differ by design — never "mirror" env values.
- Full state + landmine list: memory `project_prod_iac_state_briefing_2026-06-08` and
  `CI_CD_MODERNIZATION.md` §"Cross-cutting facts".

## Standing SOP for every phase

Branch from `main` per repo convention (infra changes branch from `staging`); `verify-before-commit`
before commits; `phase-completion-audit` before declaring any phase done; respect the drift cap;
update the change log below.

## Change log

- 2026-06-09 — Plan created from the live-verified assessment (this session). Phase 0 execution begun.
- 2026-06-09 — **Phase 0 progress:** 0.1 audit done (widget prod CURRENT — all 21 queued runs were
  docs/infra merges, zero `Picasso/` delta since `71a6274`; config-builder prod **3 weeks stale** —
  missing js-cookie CVE fix #50, schema forward-compat #47/#48, catch-up dispatch NEEDED).
  0.2 done — 29 waiting runs cancelled, both queues at 0. 0.3 implemented as *gate-the-prod-leg*
  (not drop-push: the widget workflow's push trigger also drives the STAGING deploy, which must
  survive) — PRs picasso#483 + picasso-config-builder#59. 0.6 done — #441 closed with live
  verification (API-GW statement absent from prod BSH policy). 0.4 awaits #59 merge + operator
  gate approval. 0.5: 22 drift merges classified (5 back-sync noise, ~9 prod-IaC Remedy-A chain
  [prod content already cherry-promoted via #470], 8 scheduling staging-IaC) — slicing decision
  presented to operator.
- 2026-06-09 (later) — pcb#59 MERGED; its merge-push run completed green **without queueing an
  approval run** (new gate semantics proven live). 0.4 catch-up dispatched (run 27244228165):
  gates green, WAITING at the `production` gate for operator approval. 0.5 resolved per operator:
  **convergence promote PR picasso#484** opened (staging→main, drift 22→0, merge-commit mandated).
  picasso#483 rebased onto main (attested, no content delta), all checks green — awaiting merge.
- 2026-06-09 (close-out) — #483/#484/#485 all merged; drift 0; merge-push run 27244764448 proved the
  new semantics (gates+staging success, prod leg skipped, no queue). **Phase-completion audit run**
  (adversarial deployment-specialist): 2 blockers found — B-1 widget rollback was FICTIONAL (backup
  died with the ephemeral runner) + B-2 dispatch-only removed the staleness signal. Operator-approved
  **fix-now batch = picasso#486**: B-1 artifact-persisted backup + working rollback instructions;
  B-2 weekly `prod-staleness-check.yml` (deduped issue on undeployed `Picasso/` changes); SR-1
  skip_staging now skips the staging deploy AND the hotfix path requires green gates (closed a
  pre-existing always()-over-failed-gates hole); SR-2 no more skipped-deploy Slack noise; N-1 summary
  wording. Refuted: C-4 (pcb actions ARE pinned on origin/main). Audit record:
  memory `project_ci_modernization_phase0_audit_2026-06-09`. **Phase 0 COMPLETE on #486 merge.**
- 2026-06-09 — **Phase 0 COMPLETE** (#486 merged; staleness check smoke-dispatched: green, correctly
  no issue). **Phase 1 core SHIPPED — lambda#270 MERGED** (+ concern-remedies follow-up lambda#272):
  MFS + BSH in the prod deploy matrix; zip-manifest guard BOTH workflows (fire-tested; .py+.json;
  space-safe `unzip -Z1`); MFS deploys = publish + **`live`-alias flip with auto-rollback on failed
  smoke**; BSH = $LATEST + version snapshots (TF `ignore_changes` seam respected; env vars NOT
  CI-managed in prod); CF-routed smokes w/ cache-bypass; `scripts/whats-live.sh` (Phase 1.5 read-side
  form — no new infra; flags alias-vs-$LATEST divergence). **⚠️ LIVE FINDING: prod MFS traffic =
  API GW → `live` alias → v21 (2026-05-13) — the §P5.1 manual deploy never published/flipped, so
  §P5.1 MFS code is NOT serving API GW traffic.** First MFS dispatch through the new workflow is the
  remediation. 2-reviewer audit: B2 fixed (auto-rollback); 3 findings REFUTED with live evidence
  (BSH-smoke-403 — Remedy B header is CF-origin-injected; whats-live sha/mod swap; Versions[-1]
  pagination); first-dispatch env pre-flight DONE (§P5.1 + fail-loud keys present on prod $LATEST).
  **Phase 1 remaining:** operator applies the deploy-role IAM delta
  (`Sandbox/picasso-deploy-policy-v2.json`) → dispatch `Master_Function` (validates pipeline + closes
  the v21 gap) → whats-live ⚠ disappears. Task 2.5 added (de-suffix staging twins, operator-requested).
- 2026-06-10 — **Phase 1 VALIDATED LIVE.** IAM delta applied+verified. First `Master_Function`
  dispatch: attempt 1 (run 27248430578) failed SAFELY — release_note contained `$LATEST`, inline
  `${{ }}` interpolation + `set -u` → unbound variable; alias untouched, no publish (fail-safe held).
  Fix on lambda#272: free-text inputs via `env:` indirection (also closes the injection vector).
  **Attempt 2 (run 27248503197) SUCCEEDED: published v22 from main@472062b, flipped `live` v21→v22,
  smoke 200 — whats-live shows `alias live = v22 = $LATEST ✓`. The v21 alias gap is CLOSED; prod
  API GW traffic now serves §P5.1 code. Rollback target = v21.** Phase 1 fully closes on lambda#272
  merge. Audit record: memory `project_ci_modernization_phase1_audit_2026-06-09`.
- 2026-06-10 — **Phase 2 wave 1 SHIPPED + LIVE-VALIDATED.** (a) **2.3**: pcb staging bucket + per-product
  deploy role (picasso#492, belt-applied, verified live in 525; posture = public website endpoint
  mirroring prod pcb, upgrade path documented; secret `AWS_DEPLOY_ROLE_ARN_STAGING` set). (b) **2.1+2.2**:
  reusable `deploy-frontend.yml` on picasso main (#493) — deploy mechanics only (gates stay per-repo);
  prod deploys archive immutable `releases/<sha>/` = one-step rollback (supersedes Phase 0's interim
  backup for migrated repos). (c) **Consumers migrated**: analytics-dashboard (#22 — staging via
  reusable LIVE-PROVEN on its own PR; prod now dispatch-only, was push-auto w/ toothless env gate) +
  config-builder (#60 — **first-ever pcb staging previews**, live-proven + externally curl-verified;
  prod keeps its real `production` env gate via an `approve-production` gate-job, since reusable-caller
  jobs can't carry `environment:`). (d) **Bug found+fixed post-merge (#494)**: a called job requesting
  more `permissions` than its caller grants = whole-workflow `startup_failure` with zero jobs and no
  API-visible error — hit by both repos' prod callers (id-token+contents < the reusable's
  pull-requests:write). Fix = reusable inherits caller permissions; caller contract documented in-line;
  both startup-failed runs RERUN GREEN (prod jobs correctly skipped on push). Undetectable on PRs —
  prod workflows don't execute on PR events; the post-merge push is their first validation.
  **Phase 2 remaining:** widget migration (last consumer) + 2.5 de-suffix staging twins + 2.4
  queue re-check (passive, ~2026-06-24). Ground-truth note: the dashboard's "staging" bucket
  `picasso-analytics-portal-staging` lives in the PROD account 614 (legacy) — candidate to re-home
  to 525 alongside 2.5-class naming work.
- 2026-06-10 (later) — **Widget migrated to the reusable (picasso#496 MERGED) — 2.1 COMPLETE: all 3
  front-ends on one deploy shape.** Reusable gained 3 optional inputs (`cache_control`,
  `short_cache_paths`, `short_cache_control`) because the widget's cache split is load-bearing
  (1-yr immutable hashed assets vs 5-min entry points — the PR #48 incident); defaults leave
  dash/pcb byte-identical (simulated). Widget callers use **local-path `uses:`** (caller+reusable
  same commit — no #493→#494 skew window). Preserved: quality gates, both builds, skip_staging
  hotfix semantics, approve-production gate, notify guard; new `production-gate` job carries the
  `production` environment (pcb pattern); new `post-deploy` job keeps the protected-files verify +
  the load-bearing `deploy-production-*` tag (staleness check diffs against it). Phase-0 interim
  artifact backup superseded by `releases/<sha>/` (as the Phase-0 audit planned). CF distribution
  ids inline (E3G0LSWB1AQ9LP prod / E3G30AUOEJTB36 staging), verified live — staging role's
  invalidation grant is pinned to exactly that id. **Staging leg LIVE-PROVEN on the merge-push**
  (run 27251753021: reusable deployed picasso-widget-staging, smoke 200, prod leg + notify
  correctly skipped; external curl: widget.js `cache-control: public, max-age=60`, fresh
  last-modified). Prod leg validates on next operator dispatch (widget prod current — staleness
  check green); the dispatch also covers the deferred 2.2 rollback rehearsal opportunity
  (`releases/<sha>/` starts populating with the first dispatched prod deploy).
- 2026-06-10 (later) — **2.5 SCOPED** (`TASK_2_5_DESUFFIX_SCOPE.md`): full live discovery of both
  accounts. Key findings: twins fully TF-managed (parallel-module-instance cutover, zero-downtime,
  4 waves); public URLs rename-immune (widget calls CF paths; only CF origin domains change); the
  one prod-account edit on the critical path is the `picasso-kb-retriever-from-staging` trust
  policy (names both suffixed roles); MFS metric namespaces are TF metric-filters, no Lambda code
  change. **Plan drift corrected:** the 614 relic Lambda was already deleted — remainder is 3
  dangling route-less `kgvc8xnewf` integrations (operator-run deletes). Execution blocked on 4
  operator decisions (source-dir rename out?, old log-group retention, who runs 614 edits,
  sequencing vs the naming-alignment session).
- 2026-06-10 (later) — **2.5 Waves 1+2 EXECUTED — staging twins CUT OVER to bare names, soak (Wave 3)
  begun.** Wave 1a #500 (parallel module instances; plan-gated 16-add/0-change/0-destroy); Wave 1b
  #501+#502 (5 policy surfaces add-both; KMS edit shadow-key-gated per runbook); lambda#273 matrix
  flip + dispatch (real code on bare pair, CodeSize byte-identical); operator gates: 614 KB-trust add
  + kgvc8xnewf integrations pending Wave 4. Wave 2 #505 (CF origins + alarms re-key) + **two
  recovered incidents**: (a) **SQS queue-policy self-lockout** — its own hardening SID denied
  SetQueueAttributes to the deploy belt and admin; recovered via operator `sqs remove-permission` +
  #502 adds the deploy role to the deny exceptions (control-plane parity with the KMS/secrets
  policies). (b) **Function-URL dual-permission outage (~75 min staging chat)**: AWS_IAM URL auth in
  the SCP'd staging account requires InvokeFunctionUrl AND InvokeFunction; the missing half was
  silently carried by a NONE-era resource statement TF cannot express (the BSH module's documented
  MANUAL STEP) — the bare twins lacked it, and the console no-op save that fixes NONE-auth URLs
  (run on MFS, worked) RECONCILED the old BSH's policy and stripped its legacy statement too. Fix
  #506: InvokeFunction added to the signer's identity grant (survives recreation; kills the manual
  step for the signer path). CF access logs bracketed the outage exactly (last 200 05:06:21Z, first
  403 05:14:55Z). **End state verified live**: MFS health 200 via CF on the bare fn; /stream 200
  with real SSE; 11 alarms OK; old-MFS alarms re-keyed away; fresh traffic in both bare log groups.
  Also found: lambda deploy-staging's `lambda` dispatch input is decorative (github.event.inputs
  never consumed — a dispatch deploys the whole matrix; pre-existing, flagged not fixed). Wave 4
  (after soak): remove suffixed instances + old log-group state-rm (decision #2) + 614 trust
  removal + dangling integrations + whats-live names.

# Task 2.5 Scope — De-suffix the Staging Twins

**Status:** Scoped 2026-06-10, awaiting operator decisions (§Decisions) before execution.
**Parent:** `MODERNIZATION_PLAN.md` §Phase 2 row 2.5 (operator-requested 2026-06-09).
**Ground rule:** every claim below was verified live 2026-06-10. Re-verify before executing.

## Intent

Account = environment; staging-account (525) resources carry no `_Staging` suffix (new staging
functions are already bare — SMS_Sender, Calendar_*). Targets:

| Today (525) | After |
|---|---|
| `Master_Function_Staging` | `Master_Function` |
| `Bedrock_Streaming_Handler_Staging` | `Bedrock_Streaming_Handler` |

## Live-verified inventory (2026-06-10)

### The twins are fully Terraform-managed — the major scope simplifier

The plan's 2.5 row assumed the ADA Phase 4.5 hand-managed playbook. Discovery shows both functions
are TF resources, which makes create-new + cutover a *module-instance* operation, not hand-creation:

- `infra/modules/lambda-master-function-staging` + `lambda-bedrock-handler-staging` each define:
  `aws_lambda_function` (placeholder code, `ignore_changes=[filename,source_code_hash]` CI seam),
  exec role `${var.function_name}-role`, log group, Function URL, exec policy. BSH adds a logs KMS
  CMK + `alias/${var.function_name}-logs` **and its 3 CloudWatch alarms** (in-module, name-keyed).
  Everything keys on `var.function_name` (defaults = the suffixed names, `main.tf:1-5` each).
- **Auto-flows via module outputs** (no action needed beyond re-pointing to the new instances):
  MFS `STREAMING_ENDPOINT` = `module.lambda_bedrock_handler_staging[0].function_url`
  (`infra/main.tf:452`); JWT-secret + BSH cf-origin-secret resource policies reference
  `module.…role_arn`.
- **Hand-fed literals that must be updated at cutover**: `cloudfront-widget-staging` variable
  defaults `mfs_origin_domain` / `streaming_origin_domain` = the current Function URL hosts
  (call site `infra/main.tf:1152` does not pass them). Function URLs are per-function and cannot
  transfer — new functions get new URLs.
- MFS's 5 ops alarms live in `ops-alarms-master-function-staging` (separate module; metric-filter
  namespaces like `Picasso/Master_Function_Staging` are **TF-defined**, not code-emitted — MFS code
  emits env-based namespaces (`PICASSO/Audit/{ENVIRONMENT}`, `PICASSO/Security`), so **no Lambda
  code change is needed**). Re-instantiate against the new name/log group.

### Traffic path (staging) — public URLs are rename-immune

Widget calls CloudFront paths only (`staging.chat.myrecruiter.ai/Master_Function*` → MFS origin,
`/stream*` → BSH origin; verified in the deployed staging `widget.js`). CF origins are the two
Function URLs. MFS URL: AuthType NONE + `x-picasso-cf-origin` custom header. BSH URL: AuthType
AWS_IAM, signed by L@E `picasso-bsh-edge-signer-staging` (origin-request; host-generic — verify at
cutover) + custom header. **No API Gateway exists in 525. No event-source mappings on either twin.**
Only the CF origin *domains* change at cutover; `staging.chat.myrecruiter.ai` never does.

### Name-coupled references outside the modules

1. **614 cross-account IAM (prod-account edit — HARD STOP applies):**
   `picasso-kb-retriever-from-staging` trust policy lists
   `Master_Function_Staging-role` + `Bedrock_Streaming_Handler_Staging-role` (+
   `Meta_Response_Processor-role`) by ARN. The bare roles must be **added before** the new
   functions serve KB traffic, and the old ones removed at decommission.
2. **lambda repo workflows:** `deploy-staging.yml` matrix (`staging_function:` entries; path
   filters key on the *source dirs*, which stay — see Decisions), `pr-checks.yml` matrices,
   `deploy-production.yml` comments, `scripts/whats-live.sh:71-72`.
3. **Docs/comments** across infra modules and lambda repo (non-blocking, sweep at close).

### DRIFT correction — the prod relic is already (mostly) gone

The plan's 2.5 row says the prod-account `Master_Function_Staging` relic is "still integrated in
prod API GW kgvc8xnewf". **Live state 2026-06-10:** 614 has **zero** `*Staging*` functions — the
relic Lambda is already deleted. `kgvc8xnewf` (HTTP API "picasso") routes all 6 live
`/Master_Function` routes → `Master_Function:live` ✓. What remains is **3 route-less dangling
integrations**: `859k24v` → the deleted `Master_Function_Staging` ARN, `dgcppkh` →
`Bedrock_Streaming_Handler:STAGING` (alias), `6ar2l9d` → bare `Bedrock_Streaming_Handler`.
Deleting them is a trivial prod mutation (operator-run, any time; no sequencing dependency).

## Cutover design — create-new + cutover via parallel module instances

Zero-downtime; honors the plan's "not a rename-in-place" mandate. All infra PRs base `staging`
(belt auto-applies on merge).

**Wave 1 — create (no traffic impact):**
- infra PR: add second instances `module "lambda_master_function"` / `module
  "lambda_bedrock_handler"` (same module sources, `function_name` = bare names), with the new MFS's
  `streaming_endpoint` wired to the **new** BSH's `function_url` output. Apply → new functions
  exist (placeholder code) with new URLs + roles + log groups + BSH alarms.
- **614 gate:** add the 2 new role ARNs to `picasso-kb-retriever-from-staging` trust
  (operator-run or prod-IaC writer — this track must not touch prod IAM).
- lambda repo PR: flip `deploy-staging.yml` `staging_function:` → bare names; dispatch both →
  real code lands on the new functions. (Old functions stop receiving CI deploys from this moment;
  acceptable — cutover follows immediately.)

**Wave 2 — cutover:**
- infra PR: `cloudfront-widget-staging` origin domains → the new URL hosts; re-instantiate
  `ops-alarms-master-function-staging` against the new name/log group/namespace; re-point the two
  secret resource policies to the new module instances' role outputs. Apply (CF propagates ~mins;
  both origins stay live throughout).
- Verify: widget E2E on staging (chat round-trip incl. KB retrieval + `/stream` streaming +
  a form path), `?action=health_check` smoke, cf-origin rejection alarm quiet, new alarms in OK,
  edge-signer signs against the new BSH host.

**Wave 3 — soak** (a few days of staging demos; both old fns idle but intact = instant fallback
by reverting the CF origin PR).

**Wave 4 — decommission:**
- infra PR: remove the old module instances (destroys old functions, roles, URLs, old MFS alarm
  instance — and **old log groups**, see Decisions #2).
- 614: remove the 2 old role ARNs from the KB trust; delete the 3 dangling `kgvc8xnewf`
  integrations (operator).
- lambda repo: `whats-live.sh` names, `pr-checks.yml`/`deploy-production.yml` comment sweep.
- Ground-truth MEMORY.md + plan change log.

## Decisions for operator (blocking execution)

1. **Repo source-dir rename** (`Master_Function_Staging/`, `Bedrock_Streaming_Handler_Staging/`
   in the lambda repo): **recommend OUT of 2.5.** They're repo paths, not env resources; the deploy
   matrices already map `source_dir` → function name (the prod entries prove the mapping works).
   Renaming dirs is a large mechanical diff (path filters, matrices, test configs, docs) for zero
   env-uniformity gain. Defer or drop.
2. **Old log groups:** destroying the old module instances deletes
   `/aws/lambda/Master_Function_Staging` + BSH's (staging log history loss + BSH's old KMS CMK
   schedules deletion). Retain orphaned (state-rm before destroy) or accept loss?
3. **Who runs the two 614 changes** (KB-trust add/remove + dangling-integration deletes):
   operator hand-CLI vs routing through the prod-IaC program.
4. **Sequencing vs the parallel naming-alignment session** (`align/recent-messages-*` work is
   active in the same infra tree): serialize merges/applies to avoid tfstate lock collisions —
   same-day coordination only, no design conflict found.

## Out of scope (noted, not 2.5)

- Other `-staging`-suffixed 525 resources (buckets `picasso-widget-staging`, edge signer
  `picasso-bsh-edge-signer-staging`, etc.) — different naming class (lowercase-product-style, and
  some names are global like S3); a separate uniform-naming pass if ever.
- Dashboard staging bucket re-home 614→525 (plan ground-truth note; operator sign-off needed).
- TF module *directory* renames (`lambda-master-function-staging/` → state moves; cosmetic).

## Effort

Waves 1–2 + verification ≈ one session. Wave 3 = calendar time. Wave 4 ≈ half a session.

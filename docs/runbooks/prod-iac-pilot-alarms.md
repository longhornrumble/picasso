# Prod IaC Pilot — adopt the BSH ops alarms (Phase 2 Step 3)

**Goal:** prove the prod IaC pipeline end-to-end on **zero-risk** resources by bringing the three
already-live BSH ops alarms (#10/#11) under Terraform, then running a change through the
approval-gated belt.

**Prereqs:** Step 1 bootstrap done (`prod-iac-bootstrap.md`), and the Step 2 files merged/available:
`infra/backend/production.tfbackend`, `infra/envs/production.tfvars`, `infra/modules/ops-alarms-bsh-prod/`,
the `ops_alarms_bsh_prod` block in `infra/main.tf`, and `.github/workflows/infra-deploy-prod.yml`.

Why import (not create): the metric filter + 2 alarms already exist in prod (hand-made 2026-06-05).
The HCL matches them field-for-field, so `terraform import` adopts them into state with **no change to
the live resources** — the safest possible "bring existing under IaC" move.

---

## Phase A — adopt the live resources (operator, LOCAL, state-only)

State-only: import only writes Terraform state; it never modifies or recreates the alarms. Run with
`chris-admin` (admin — same out-of-band profile as the bootstrap). The placeholder TF_VARs satisfy the
length validations on the three staging-only secrets (unused in prod).

```bash
cd /Users/chrismiller/Desktop/Working_Folder/infra
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
export TF_VAR_q5_mfs_cf_origin_secret=$(printf '0%.0s' $(seq 64))
export TF_VAR_q5_streaming_cf_origin_secret=$(printf '0%.0s' $(seq 64))
export TF_VAR_messenger_verify_token=unused-in-prod

AWS_PROFILE=chris-admin terraform init -reconfigure -backend-config=backend/production.tfbackend

AWS_PROFILE=chris-admin terraform import -var-file=envs/production.tfvars \
  'module.ops_alarms_bsh_prod[0].aws_cloudwatch_log_metric_filter.analytics_write_failure' \
  '/aws/lambda/Bedrock_Streaming_Handler:picasso-analytics-write-failure'

AWS_PROFILE=chris-admin terraform import -var-file=envs/production.tfvars \
  'module.ops_alarms_bsh_prod[0].aws_cloudwatch_metric_alarm.analytics_write_failure' \
  'OUTAGE! Picasso analytics-summary writes failing'

AWS_PROFILE=chris-admin terraform import -var-file=envs/production.tfvars \
  'module.ops_alarms_bsh_prod[0].aws_cloudwatch_metric_alarm.waf_oversized_body' \
  'WARN! Picasso WAF oversized-body hits (SizeRestrictions_BODY)'
```

**Verify no drift (target-scoped to the pilot module):**
```bash
AWS_PROFILE=chris-admin terraform plan -var-file=envs/production.tfvars -target=module.ops_alarms_bsh_prod
```
Expect: **2 alarms to update — adding the provider `default_tags`** (`Environment = production`,
`ManagedBy = terraform`, `Project = myrecruiter`) — and the **metric filter unchanged** (no tag support).
The hand-made alarms were created untagged, so this tag-add is the only diff. It is safe + desirable
(standardizes them); applying it through the gated belt IS the pilot. If the plan shows anything BEYOND
those tag additions (e.g. a threshold/name/dimension change or a destroy/recreate), the HCL drifted from
live — reconcile before proceeding; do NOT apply.

> The state now lives in `s3://myrecruiter-tfstate-production`. CI reads the same state, so the pilot module
> is now managed. (A full, un-targeted plan will still show the un-gated `picasso_form_tables` wanting
> to create 2 tables — that is expected and deferred; the prod apply is `-target`-scoped until the
> naming reconciliation lands.)

---

## Phase B — prove the approval-gated belt

1. **PR the Step-2 files.** CI (`infra-deploy-prod.yml`) runs `terraform plan` against prod on the PR and
   posts it as a comment. For the pilot module it should read **no changes** (imported in Phase A).
2. **Merge.**
3. **Dispatch the apply** (this is the gated belt in action):
   - Actions → "Terraform Infrastructure (production)" → Run workflow.
   - Set **target** = `module.ops_alarms_bsh_prod`.
   - The run pauses on the **`production` environment** → you get the approval prompt → **approve**.
   - It applies (no-op, since imported) — proving the OIDC role + approval gate + apply path all work
     against prod, end-to-end, with zero resource change.

**Optional — prove the CREATE/CHANGE path too:** after Phase B, open a small PR that tweaks one alarm
(e.g. `#11` threshold 20 → 25), review the prod plan on the PR, dispatch + approve, and watch the gated
belt change a real prod resource. That demonstrates the full loop, not just adoption.

---

## After the pilot — climbing the tiers (future sessions)
- **Tier 1:** BSH env vars + IAM grants (the registry grants this incident fixed) — adopt via import, gated to prod.
- **Tier 2:** BSH Lambda function — cutover (clean-shape TF-managed function alongside, switch, decommission).
- **Tier 3 + naming reconciliation:** DynamoDB tables via `terraform import`, reconciling the module
  `{name}-{env}` convention with prod's bare names (`picasso-sms-consent`, etc.). Only after this can the
  prod workflow safely drop `-target` and run full-root applies.

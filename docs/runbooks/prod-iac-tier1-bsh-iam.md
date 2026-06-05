# Prod IaC Tier 1 — adopt the BSH execution-role inline-policy grants

**Goal:** bring the **7 hand-made inline policies** on the live prod BSH execution role
`Bedrock-Streaming-Handler-Role` under Terraform via `terraform import` (state-only), then run the
adoption through the approval-gated belt. This version-controls the **highest-churn surface** on the
role — the grants were hand-mutated via `aws iam put-role-policy` 3× during the 2026-06-04/05 Foster
Village incident — so future grant changes go through PR → plan → gated apply instead of hand-CLI.

**Scope (surgical, IAM-only):** this adopts only the 7 `aws_iam_role_policy` resources. It does **not**
manage the role resource itself (trust policy + managed-policy attachments stay hand-managed — they
don't churn), and it does **not** touch the function or its env vars (that's Tier 2).

**Prereqs:** Tier-0 pilot done (`prod-iac-pilot-alarms.md` — bootstrap + pipeline live), and the Tier-1
files merged/available: `infra/modules/bsh-iam-grants-prod/` + the `bsh_iam_grants_prod` block in
`infra/main.tf`.

**Why import (not create):** the 7 policies already exist live (hand-made; role created 2025-08-28). The
HCL reproduces each policy document field-for-field, so `terraform import` adopts them into state with
**no change to the live grants** — the safest "bring existing under IaC" move.

---

## Phase A — adopt the live policies (operator, LOCAL, state-only)

State-only: import only writes Terraform state; it never modifies the live policies. Run with
`chris-admin` (admin — same out-of-band profile as the bootstrap/pilot). The placeholder TF_VARs satisfy
the length validations on the three staging-only secrets (unused in prod).

```bash
cd /Users/chrismiller/Desktop/Working_Folder/infra
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
export TF_VAR_q5_mfs_cf_origin_secret=$(printf '0%.0s' $(seq 64))
export TF_VAR_q5_streaming_cf_origin_secret=$(printf '0%.0s' $(seq 64))
export TF_VAR_messenger_verify_token=unused-in-prod

AWS_PROFILE=chris-admin terraform init -reconfigure -backend-config=backend/production.tfbackend

# aws_iam_role_policy import ID = "<role_name>:<policy_name>"
for pair in \
  "clerk_secret_read:ClerkSecretRead" \
  "dynamodb_form_submissions:DynamoDBFormSubmissions" \
  "dynamodb_session_summaries:DynamoDBSessionSummaries" \
  "employee_registry_v2_read:EmployeeRegistryV2Read" \
  "ses_send_email:SES-SendEmail" \
  "sqs_analytics_send:SQS-AnalyticsSend" \
  "tenant_registry_read:TenantRegistryRead" \
; do
  res="${pair%%:*}"; pol="${pair##*:}"
  AWS_PROFILE=chris-admin terraform import -var-file=envs/production.tfvars \
    "module.bsh_iam_grants_prod[0].aws_iam_role_policy.${res}" \
    "Bedrock-Streaming-Handler-Role:${pol}"
done
```

**Verify no drift (target-scoped to this module):**
```bash
AWS_PROFILE=chris-admin terraform plan -var-file=envs/production.tfvars -target=module.bsh_iam_grants_prod
```
Expect: **`No changes. Your infrastructure matches the configuration.`** for this module. Unlike the
alarms pilot, inline role policies have **no tags**, so `default_tags` adds nothing — the post-import plan
should be **truly zero-change**. If the plan shows ANY update/replace on these 7 policies, the HCL drifted
from live (an action/resource/Sid mismatch) — reconcile the module against
`aws iam get-role-policy --role-name Bedrock-Streaming-Handler-Role --policy-name <name>` before
proceeding; do **NOT** apply.

> A full, un-targeted plan will still show the un-gated `picasso_form_tables` wanting to create 2 tables —
> expected + deferred; the prod apply stays `-target`-scoped until the Tier-3 naming reconciliation lands.

---

## Phase B — prove the approval-gated belt (no-op apply)

1. **PR is already open** (base=staging → promoted to main per branch routing). CI
   (`infra-deploy-prod.yml`) runs `terraform plan` against prod on the PR and posts it as a comment — for
   this module it should read **no changes** (imported in Phase A).
2. **Merge.**
3. **Dispatch the apply:**
   - Actions → "Terraform Infrastructure (production)" → Run workflow.
   - Set **target** = `module.bsh_iam_grants_prod`.
   - The run pauses on the **`production` environment** → approve.
   - It applies (no-op, since imported) — confirming the OIDC role + approval gate + apply path work for
     this module with zero resource change.

**Optional — prove the CHANGE path:** after Phase B, open a small PR that tweaks one grant through
Terraform (e.g. add an action to a non-prod-critical policy), review the prod plan on the PR, dispatch +
approve. From here, **every BSH grant change is a PR**, not a hand `put-role-policy`.

---

## After Tier 1 — climbing the tiers
- **Tier 2:** BSH Lambda function + env vars — adopt the function (its `environment` block carries
  `SESSION_SUMMARIES_TABLE` etc.; the role can then be referenced from `aws_lambda_function.role`).
- **Tier 3 + naming reconciliation:** DynamoDB tables via `terraform import`, reconciling the module
  `{name}-{env}` convention with prod's bare names. Only after this can the prod workflow drop `-target`.

> The mirrored names in this module include not-yet-aligned forms (`picasso_form_submissions` underscore,
> `picasso-tenant-registry-production`, `picasso-sms-usage`). Terraform mirrors live as-is for a zero-change
> import; renaming them is the naming-alignment program's job, after which this module's ARNs update in lockstep.

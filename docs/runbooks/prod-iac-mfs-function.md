# Prod IaC — adopt the Master_Function (MFS) Lambda + env vars + inline IAM

Brings the live, hand-managed prod `Master_Function` (the MFS chat Lambda) under
Terraform via **state-only `terraform import`**, so prod MFS config (env vars,
IAM) flows through PR + the `production` approval gate instead of hand-CLI.

Mirrors the bsh prod tiers (`prod-iac-tier1-bsh-iam.md`, `prod-iac-tier2-bsh-function.md`):
a function/log-group module + an IAM-grants module, both prod-gated. The role
itself + its 4 managed-policy attachments stay hand-managed (adopted by name).

**Modules**
- `infra/modules/lambda-master-function-prod` — `aws_lambda_function.this` +
  `aws_cloudwatch_log_group.lambda` (`/aws/lambda/Master_Function_v2`, ret 7).
  Placeholder code source + `lifecycle.ignore_changes=[filename,
  source_code_hash, description]` — code keeps deploying out-of-band via
  CI/CLI; TF never touches it.
- `infra/modules/mfs-iam-grants-prod` — the **14 inline policies** adopted as
  `aws_iam_role_policy` on the existing role **by name**
  (`Master_Function-role-zyux77wq`).

Both self-gate via `var.env` (resources `count = 0` outside production), so the
import addresses carry a trailing `[0]`.

**Status: ADOPTED + RECONCILED 2026-06-16.** 16/16 resources imported; scoped
plan = `No changes`; the one tag-adds finalizer applied (see below).

---

## ⚠️ The one non-no-op: 2 tag-adds on first apply

Bringing the resources under TF with provider `default_tags` adds
`ManagedBy = terraform` (and reconciles `Environment` from default-tag to
resource-tag — same value) on the function + log group. This is a **tags-only**
change — zero operational impact. Verified faithful otherwise: 20/20 env vars,
14/14 policy docs, layer `requests-layer:2`, `_v2` log group, `snap_start`
PublishedVersions all matched live on import (`0 to destroy`).

---

## ⚠️ Gotcha: 3 required secret vars not in production.tfvars

The root requires 3 secret vars normally injected by CI via `TF_VAR_*`:
`q5_mfs_cf_origin_secret` + `q5_streaming_cf_origin_secret` (validation: **length
== 64**) and `messenger_verify_token` (length > 0). MFS does **not** use any of
them, and `terraform import` reads live resource state (never the var values), so
**64-char placeholders are safe** for the import + scoped plan. Real values are
only needed for a full (non-targeted) apply, which the belt supplies from secrets.

```bash
DUMMY64=$(python3 -c "print('IMPORT_PLACEHOLDER_NOT_A_REAL_SECRET_'+'0'*27)")
export TF_VAR_q5_mfs_cf_origin_secret="$DUMMY64"
export TF_VAR_q5_streaming_cf_origin_secret="$DUMMY64"
export TF_VAR_messenger_verify_token="placeholder-import-only"
```

---

## Phase A — adopt the live resources (operator, LOCAL, state-only)

```bash
cd infra
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
export AWS_PROFILE=chris-admin
terraform init -reconfigure -backend-config=backend/production.tfbackend
# ...set the 3 TF_VAR placeholders above...

ROLE=Master_Function-role-zyux77wq
terraform import -var-file=envs/production.tfvars 'module.lambda_master_function_prod.aws_lambda_function.this[0]' Master_Function
terraform import -var-file=envs/production.tfvars 'module.lambda_master_function_prod.aws_cloudwatch_log_group.lambda[0]' /aws/lambda/Master_Function_v2
# 14 inline policies — import ID = <role>:<PolicyName>
terraform import -var-file=envs/production.tfvars 'module.mfs_iam_grants_prod.aws_iam_role_policy.bedrock_permission[0]' "${ROLE}:bedrockPermission"
terraform import -var-file=envs/production.tfvars 'module.mfs_iam_grants_prod.aws_iam_role_policy.billing_events_write[0]' "${ROLE}:BillingEventsWrite"
terraform import -var-file=envs/production.tfvars 'module.mfs_iam_grants_prod.aws_iam_role_policy.dynamodb_blacklist_access[0]' "${ROLE}:DynamoDBBlacklistAccess"
terraform import -var-file=envs/production.tfvars 'module.mfs_iam_grants_prod.aws_iam_role_policy.dynamodb_form_submissions[0]' "${ROLE}:DynamoDBFormSubmissions"
terraform import -var-file=envs/production.tfvars 'module.mfs_iam_grants_prod.aws_iam_role_policy.dynamodb_pii_subject_index[0]' "${ROLE}:DynamoDBPiiSubjectIndex"
terraform import -var-file=envs/production.tfvars 'module.mfs_iam_grants_prod.aws_iam_role_policy.dynamodb_production_access[0]' "${ROLE}:DynamoDBProductionAccess"
terraform import -var-file=envs/production.tfvars 'module.mfs_iam_grants_prod.aws_iam_role_policy.employee_registry_v2_read[0]' "${ROLE}:EmployeeRegistryV2Read"
terraform import -var-file=envs/production.tfvars 'module.mfs_iam_grants_prod.aws_iam_role_policy.picasso_analytics_sqs[0]' "${ROLE}:PicassoAnalyticsSQS"
terraform import -var-file=envs/production.tfvars 'module.mfs_iam_grants_prod.aws_iam_role_policy.picasso_write[0]' "${ROLE}:picassoWrite"
terraform import -var-file=envs/production.tfvars 'module.mfs_iam_grants_prod.aws_iam_role_policy.s3_access[0]' "${ROLE}:s3_Access"
terraform import -var-file=envs/production.tfvars 'module.mfs_iam_grants_prod.aws_iam_role_policy.secrets_manager_access[0]' "${ROLE}:SecretsManagerAccess"
terraform import -var-file=envs/production.tfvars 'module.mfs_iam_grants_prod.aws_iam_role_policy.ses_send_email[0]' "${ROLE}:SES-SendEmail"
terraform import -var-file=envs/production.tfvars 'module.mfs_iam_grants_prod.aws_iam_role_policy.sms_consent_table_access[0]' "${ROLE}:SMSConsentTableAccess"
terraform import -var-file=envs/production.tfvars 'module.mfs_iam_grants_prod.aws_iam_role_policy.streaming_secrets_access[0]' "${ROLE}:StreamingSecretsAccess"
```

Verify (read-only) — expect only the benign tag-adds, never an env/policy/attr diff or a destroy:

```bash
terraform plan -var-file=envs/production.tfvars -target=module.lambda_master_function_prod -target=module.mfs_iam_grants_prod
```

Finalize (tags-only apply — adds `ManagedBy`, then the plan reads `No changes`):

```bash
terraform apply -var-file=envs/production.tfvars -target=module.lambda_master_function_prod -target=module.mfs_iam_grants_prod
```

### Recovery — if an import fails or the verify plan shows unexpected drift

- A failed import leaves no state entry for that address — just re-run it.
- A wrong import (bad ID) is removable: `terraform state rm '<address>'`, then re-import.
- If the verify plan shows a **non-tag** change (env var / policy / attr) or a
  **destroy**, STOP — the module diverged from live. Do not apply. Re-capture the
  live value (`aws lambda get-function-configuration` / `aws iam get-role-policy`)
  and fix the module before re-verifying. Ground truth: `Sandbox/mfs-prod-modeling/`.

---

## Coordination + the -target gate

The import writes to **prod state**; the module code lives on the adopting PR
(picasso#581) until it promotes. The prod belt's `-target` fail-closed gate
(Tier-3 prerequisite) blocks any un-targeted prod apply meanwhile, so the
state↔config gap can't trigger a destroy. Merge #581 (staging → promote to the
prod-applied branch) to close the gap.

## Notes
- `EmployeeRegistryV2Read` grants read on a `-staging` employee-registry table in
  prod (live misconfig, mirrored faithfully). Naming-alignment is a separate pass.
- Role + 4 managed attachments (`AmazonS3ReadOnlyAccess`, `AmazonBedrockFullAccess`,
  `AWSLambdaBasicExecutionRole-…`, `PICASSO-DynamoDB-Access-Policy`) stay hand-managed.

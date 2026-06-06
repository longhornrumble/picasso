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

> ⚠️ **WHERE to run (B-1):** the `bsh-iam-grants-prod` module exists **only on the feature branch**, NOT
> on whatever branch your main working folder is checked out to. Run from the **worktree** where the branch
> is checked out clean: **`/tmp/prod-iac-tier1/infra`**. `/tmp` is ephemeral (lost on reboot) — if the
> worktree is gone, recreate it: `git worktree add /tmp/prod-iac-tier1 feature/prod-iac-tier1-bsh-iam`
> (or, after the feature PR merges to staging, `git checkout staging && git pull` in a clean checkout, since
> the module lands on staging at merge). Do **not** `terraform init` against a checkout that lacks the module.

```bash
cd /tmp/prod-iac-tier1/infra            # the worktree with the branch (see warning above)
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
export TF_VAR_q5_mfs_cf_origin_secret=$(printf '0%.0s' $(seq 64))
export TF_VAR_q5_streaming_cf_origin_secret=$(printf '0%.0s' $(seq 64))
export TF_VAR_messenger_verify_token=unused-in-prod

# Pre-flight (B-2): fresh creds + confirm all 7 policy names exist live before importing.
aws sts get-caller-identity --profile chris-admin    # 614056832592? else: aws sso login / refresh
aws iam list-role-policies --role-name Bedrock-Streaming-Handler-Role \
  --profile chris-admin --query 'PolicyNames'         # expect the 7 names below

AWS_PROFILE=chris-admin terraform init -reconfigure -backend-config=backend/production.tfbackend

# Abort on the FIRST failed import (B-2) — a partial import leaves half-written state.
set -e
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
    "Bedrock-Streaming-Handler-Role:${pol}" \
    || { echo "IMPORT FAILED on ${res}/${pol} — STOP, see Recovery below"; break; }
done
set +e
```

**Verify no drift (target-scoped to this module):**
```bash
AWS_PROFILE=chris-admin terraform plan -var-file=envs/production.tfvars -target=module.bsh_iam_grants_prod
```
Expect: **`No changes. Your infrastructure matches the configuration.`** for this module. Unlike the
alarms pilot (which showed 2 tag-add changes — CloudWatch alarms support tags), inline role policies have
**no tags**, so `default_tags` adds nothing — the post-import plan should be **truly zero-change**. If the
plan shows ANY update/replace on these 7 policies, the HCL drifted from live (an action/resource/Sid
mismatch) — reconcile against `aws iam get-role-policy --role-name Bedrock-Streaming-Handler-Role
--policy-name <name>` before proceeding; do **NOT** apply. (`EmployeeRegistryV2Read` is the most likely to
drift — it was repointed via a live `put-role-policy` during the incident; double-check it first.)

> A full, un-targeted plan will still show the un-gated `picasso_form_tables` wanting to create 2 tables
> (`picasso-sms-consent-production`, `picasso-sms-usage-production`) — **expected noise**, deferred; the prod
> apply stays `-target`-scoped until the Tier-3 naming reconciliation lands.

### Recovery (B-3) — if an import fails or the verify plan shows drift

State-only import never touches live AWS, so the live policies are unharmed. To un-adopt a resource from
state (e.g. after a partial import, or to fix HCL that drifted) — this removes it from **state only**, not
from AWS:
```bash
AWS_PROFILE=chris-admin terraform state list | grep bsh_iam_grants_prod      # what got imported
AWS_PROFILE=chris-admin terraform state rm 'module.bsh_iam_grants_prod[0].aws_iam_role_policy.<name>'
```
Then fix the HCL and re-import (import is idempotent for already-imported resources). Never `apply` while
the verify plan shows a non-zero diff on these 7 policies.

---

## Phase B — prove the approval-gated belt (no-op apply)

**Sequencing (D-SR1) — the prod CI plan fires only on a `base=main` PR.** `infra-deploy-prod.yml` triggers
on PRs targeting **main**, not the feature PR (base=staging). So:

1. **Merge the feature PR → staging.** (The staging plan/apply CI is a no-op for this module — it's
   `count = 0` in staging.)
2. **Open the promote PR `base=main, head=staging`** (scoped — see the drift note at the end). The prod CI
   runs `terraform plan` against prod **on this promote PR** and posts it as a comment.
   - ⚠️ **D-SR2 — expected plan noise:** the CI plan is **full-root** (not `-target`), so it will show
     `picasso_form_tables` wanting to **create 2 tables** (`picasso-sms-consent-production`,
     `picasso-sms-usage-production`). That is **orthogonal to this PR** and expected until the `-target`
     guard is removed (Tier 3). For **`module.bsh_iam_grants_prod` it should read no changes** (imported in
     Phase A). Verify the *bsh-iam* lines say no-change; ignore the form-table creates (the apply is
     `-target`-scoped so they can't be created anyway).
3. **Merge the promote PR → main** (merge-commit strategy per the drift rule).
4. **Dispatch the apply** (now applies from `main` — the workflow pins `ref: main`):
   - Actions → "Terraform Infrastructure (production)" → Run workflow.
   - Set **target** = `module.bsh_iam_grants_prod` (the field is now `required`).
   - The run pauses on the **`production` environment** → approve.
   - It applies (no-op, since imported) — confirming the OIDC role + approval gate + apply path work for
     this module with zero resource change.

5. **Post-apply verification (D-SR3) — confirm the door is still on its hinges:**
   ```bash
   aws iam list-role-policies --role-name Bedrock-Streaming-Handler-Role --profile chris-admin   # still 7
   aws iam get-role-policy --role-name Bedrock-Streaming-Handler-Role \
     --policy-name TenantRegistryRead --profile chris-admin                                      # unchanged
   ```
   BSH live smoke: send a prod Foster Village chat (e.g. "How can I donate") and confirm a normal streamed
   response (the grants back tenant-registry + session-summaries writes).

**Optional — prove the CHANGE path:** after Phase B, open a small PR that tweaks one grant through
Terraform, review the prod plan on the PR, dispatch + approve. From here, **every BSH grant change is a PR**,
not a hand `put-role-policy`.

---

## After Tier 1 — climbing the tiers
- **Tier 2:** BSH Lambda function + env vars — adopt the function (its `environment` block carries
  `SESSION_SUMMARIES_TABLE` etc.). **Seams the audit flagged for Tier 2:**
  - The function will reference the role by `data "aws_iam_role"` lookup or a `role_name` var — there is **no
    Terraform dependency** between this module's policies and the function (both reference the role by name).
    Add a root-level `depends_on` or a module output so the function waits on the policies.
  - Bring the **managed-policy attachments** in scope and remediate `AmazonBedrockFullAccess` /
    `AmazonS3ReadOnlyAccess` to scoped inline grants (see the module header's NOT-modeled block).
  - Add the missing **`picasso-sms-consent`** grant; scope **SES** off `Resource:"*"`.
- **Tier 3 + naming reconciliation:** DynamoDB tables via `terraform import`, reconciling the module
  `{name}-{env}` convention with prod's bare names. Only after this can the prod workflow drop `-target`.
  Also: decide whether to keep the **7-discrete** prod IAM shape or reconcile to the staging module's
  **consolidated** `exec-policy` (the latter is a plan-visible destroy/recreate of the 7 named policies on a
  live role — higher-risk than import; plan it deliberately). Un-bundle `DynamoDBFormSubmissions`.

> The mirrored names in this module include not-yet-aligned forms (`picasso_form_submissions` underscore,
> `picasso-tenant-registry-production`, `picasso-sms-usage`). Terraform mirrors live as-is for a zero-change
> import; renaming them is the naming-alignment program's job, after which this module's ARNs update in lockstep.

---

## Drift note (2026-06-05)
At authoring, `origin/staging`↔`origin/main` divergence is at the **5-merge-commit cap** (staging→main = 5).
Merging this feature PR to staging pushes it to 6 (over cap), so the **promote PR in Phase B step 2 doubles
as the drift reset** — scope it to the prod-IaC chain per `feedback_promote_pr_scope_discipline` (coordinate
with the parallel PII/scheduling programs; do not bundle multi-program work).

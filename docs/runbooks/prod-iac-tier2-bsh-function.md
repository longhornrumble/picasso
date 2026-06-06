# Prod IaC Tier 2 — adopt the BSH Lambda function + env vars

**Goal:** bring the live prod BSH Lambda **function** `Bedrock_Streaming_Handler` and its **14 env vars**
under Terraform via `terraform import` (state-only), then run the adoption through the approval-gated belt.
This **closes the env-var-drift incident class**: the 2026-05-23 Foster Village outage was an unset
`BEDROCK_MODEL_ID`, and the cascade fixes hand-mutated `SESSION_SUMMARIES_TABLE` + registry env vars live.
Under Terraform, every env change becomes a reviewed PR → plan → gated apply, not a hand
`update-function-configuration`.

**Scope (operator decision 2026-06-06, surgical):** the **function + its Function URL** ONLY. Deferred,
still hand-managed (flagged in the module header):
- Log group `/aws/lambda/Bedrock_Streaming_Handler` (retention 7, **no KMS** — a faithful import must not
  add the CMK the staging module uses).
- `aws_lambda_permission` `allow-api-gateway-invoke-prod` (API GW `kgvc8xnewf` → this function).

**NOT managed** (by design): the execution **role** `Bedrock-Streaming-Handler-Role` — Tier 1's
`bsh-iam-grants-prod` owns its 8 inline policies by-name; this module only **references** the role by ARN.

**Why import (not cutover):** the widget hard-codes the Function URL
`https://xqc4wnxwia2nytjkbw6xasjd6q0jckgb.lambda-url.us-east-1.on.aws/` and is **browser-cached for ~1 year**.
A cutover would mint a *new* URL and break every cached widget. There's also a second invoke path (the
deferred API GW permission). So we adopt the **existing** function in place — the same belt Tier 1 proved.

**Prereqs:** Tier 1 complete (`prod-iac-tier1-bsh-iam.md`), and the Tier-2 files merged/available:
`infra/modules/bsh-function-prod/` + the `bsh_function_prod` block in `infra/main.tf`.

---

## ⚠️ The one non-no-op: 2 tag-adds on first apply

Unlike Tier-1's inline policies (no tags → truly zero-change), the **function supports tags**. It carries
only `Environment=production` live, but the root provider `default_tags` also sets `ManagedBy=terraform`
+ `Project=myrecruiter`. So the **first gated apply ADDS those 2 tags** to the live function — a benign
tag-adoption identical to the ops-alarms pilot, **NOT** a functional change. The `aws_lambda_function_url`
does not support tags (no change there). Everything else — runtime, handler, memory, timeout, all 14 env
vars, CORS, `ephemeral_storage`, `logging_config` — matches live and is genuinely no-change.

**Exact plan shape to expect on the tags** (so the diff doesn't surprise you): because the module declares
no resource-level `tags` block (env lives in `default_tags` per convention), the plan shows the
resource-level `tags` attribute **dropping** the explicit `Environment=production` key — but `tags_all`
(the merged, effective set) keeps `Environment=production` (from `default_tags`) and **adds** `ManagedBy`
+ `Project`. **Net live tags after apply: Environment + ManagedBy + Project.** No tag is actually removed
from the running function.

---

## Phase A — adopt the live function + URL (operator, LOCAL, state-only)

State-only: import only writes Terraform state; it never modifies the live function. Run with `chris-admin`
(same out-of-band admin profile as Tier 1).

> ⚠️ **WHERE to run:** the `bsh-function-prod` module exists **only on the feature branch**. Run from the
> worktree where it's checked out clean: **`/tmp/prod-iac-tier2/infra`**. `/tmp` is ephemeral — if the
> worktree is gone, recreate it: `git worktree add /tmp/prod-iac-tier2 feature/prod-iac-tier2-bsh-function`.
> Do **not** `terraform init` against a checkout that lacks the module.

```bash
cd /tmp/prod-iac-tier2/infra
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
export TF_VAR_q5_mfs_cf_origin_secret=$(printf '0%.0s' $(seq 64))
export TF_VAR_q5_streaming_cf_origin_secret=$(printf '0%.0s' $(seq 64))
export TF_VAR_messenger_verify_token=unused-in-prod

# Pre-flight: fresh creds + confirm the function exists live before importing.
aws sts get-caller-identity --profile chris-admin    # 614056832592? else refresh
aws lambda get-function-configuration --function-name Bedrock_Streaming_Handler \
  --profile chris-admin --query '{Runtime:Runtime,Timeout:Timeout,EnvCount:length(Environment.Variables)}'
  # expect nodejs20.x / 900 / 14

AWS_PROFILE=chris-admin terraform init -reconfigure -backend-config=backend/production.tfbackend

# Abort on the first failed import (a partial import leaves half-written state).
set -e
# aws_lambda_function import ID = function name; aws_lambda_function_url import ID = function name.
AWS_PROFILE=chris-admin terraform import -var-file=envs/production.tfvars \
  'module.bsh_function_prod[0].aws_lambda_function.this'     'Bedrock_Streaming_Handler'
AWS_PROFILE=chris-admin terraform import -var-file=envs/production.tfvars \
  'module.bsh_function_prod[0].aws_lambda_function_url.this' 'Bedrock_Streaming_Handler'
set +e
```

**Verify the plan (target-scoped to this module):**
```bash
AWS_PROFILE=chris-admin terraform plan -var-file=envs/production.tfvars -target=module.bsh_function_prod
```
Expect: **`0 to add, 1 to change, 0 to destroy`** — the function updated in-place with ONLY: (a) the tags
delta (resource-level `tags` drops `Environment`; `tags_all` adds `ManagedBy=terraform` + `Project=myrecruiter`;
net effective tags = Environment + ManagedBy + Project — see "The one non-no-op" above), and (b) `publish = false`
(the provider making that default explicit on import — a no-op, no version is published). `description` is in
`ignore_changes` (it's a deploy-time changelog marker, e.g. "v17: …"), so the import does NOT wipe it. The
`aws_lambda_function_url` should read no-change.

> **Verified live 2026-06-06:** after import, the actual `plan -target=module.bsh_function_prod` was exactly
> this — `0 add / 1 change / 0 destroy`, the change being `tags_all` (+2) and `publish=false`. The Phase A
> verify caught one drift first pass (`description` would have been nulled) → fixed by adding it to
> `ignore_changes`; the re-verify was clean. **If the plan wants to change anything else on the function** (runtime, handler, memory,
timeout, env var values, CORS, role, `ephemeral_storage`, `logging_config`, or — watch for this —
`log_format` flipping to JSON) — the HCL drifted from live; reconcile against
`aws lambda get-function-configuration` / `get-function-url-config` before proceeding. Do **NOT** apply.

> `source_code_hash` / `filename` are `ignore_changes`d → the live deployed code is never touched. A
> full, un-targeted plan still shows the un-gated `picasso_form_tables` wanting to create 2 tables —
> **expected noise**, the apply stays `-target`-scoped.

### Recovery — if an import fails or the verify plan shows unexpected drift
State-only import never touches live AWS. To un-adopt from **state only** (not from AWS):
```bash
AWS_PROFILE=chris-admin terraform state list | grep bsh_function_prod
AWS_PROFILE=chris-admin terraform state rm 'module.bsh_function_prod[0].aws_lambda_function.this'
AWS_PROFILE=chris-admin terraform state rm 'module.bsh_function_prod[0].aws_lambda_function_url.this'
```
Then fix the HCL and re-import. Never `apply` while the verify plan shows changes beyond the 2 tag-adds.

> **⚠️ State/branch window (time-boxed, high-severity — read before importing):** Phase A writes the
> imported resources into the **shared remote prod state** from the feature branch, but the module code only
> lands on `main` at merge. In the interim the state has resources that `main`'s config doesn't define yet —
> so a prod apply from `main` (even a `-target=module.bsh_function_prod` one) would plan to **DESTROY** the
> live function. Mitigation is sequencing discipline, so do it tightly:
> 1. Import **only after** this PR is approved + mergeable (not before).
> 2. The **same operator** imports, merges, and dispatches the first `-target` apply — **in one session**.
> 3. **No other prod workflow dispatches** between import and merge.
>
> If the window is interrupted and `main` advances, do **not** apply; if state ends up orphaned, recover via
> `terraform state rm` (Recovery above) and re-import after merge. The destroy is of the *state entry* (the
> live AWS function survives), but recovery is a manual rm + re-import — avoid it by keeping the window short.

---

## Phase B — run the adoption through the gated belt

Drift is clean (0/1) at authoring and this module is `count=0` in staging (inert there). Route the PR
**base=main directly** (same as the Tier-2 sms-consent grant #420) — the prod CI plan fires on `base=main`
PRs.

1. **Open the PR `base=main, head=feature/prod-iac-tier2-bsh-function`.** The prod CI runs `terraform plan`
   against prod and posts it.
   - ⚠️ **Read the `Terraform plan (production)` JOB log, not `comments[-1]`** (base=main PRs run a staging
     plan too; the last comment is often the staging one).
   - If you import in Phase A **before** CI plans: the prod plan shows the function with **only the 2
     tag-adds** + the expected `picasso_form_tables` create-noise. If you have **not** imported yet: the plan
     shows the function + URL as **`2 to add`** — informational only; do **not** apply from that, import first.
2. **Merge the PR → main** (merge-commit strategy per the drift rule).
3. **Dispatch the apply** (applies from `main`; the workflow pins `ref: main`):
   - Actions → "Terraform Infrastructure (production)" → Run workflow.
   - **target** = `module.bsh_function_prod`.
   - The run pauses on the **`production` environment** → **operator approves** (the agent cannot
     self-approve — classifier-enforced).
   - It applies: **1 changed (2 tags added to the function)**, function URL unchanged.
4. **Decline the app-deploy:** merging to main also triggers `deploy-production.yml` (app deploy, gated). No
   app code changed → **reject** it at the gate.
5. **Post-apply verification — confirm nothing functional moved:**
   ```bash
   # env vars unchanged (still 14, same values)
   aws lambda get-function-configuration --function-name Bedrock_Streaming_Handler --profile chris-admin \
     --query '{Runtime:Runtime,Timeout:Timeout,Env:Environment.Variables}'
   # Function URL unchanged (same URL the widget caches)
   aws lambda get-function-url-config --function-name Bedrock_Streaming_Handler --profile chris-admin \
     --query 'FunctionUrl'   # → https://xqc4wnxwia2nytjkbw6xasjd6q0jckgb.lambda-url.us-east-1.on.aws/
   # 2 tags now present
   aws lambda list-tags --resource arn:aws:lambda:us-east-1:614056832592:function:Bedrock_Streaming_Handler \
     --profile chris-admin   # Environment + ManagedBy + Project
   ```
   BSH live smoke: send a prod Foster Village chat ("How can I donate") → confirm a normal streamed response.

**Prove the CHANGE path (optional, recommended):** after Phase B, the next time a BSH env var must change
(e.g. a model bump), do it as a Terraform PR — bump the value, review the prod plan, dispatch + approve.
From here, **every BSH env-var change is a PR**, not a hand `update-function-configuration`. That is the
incident-class closure.

> **COLD_START_FORCE — the one env var you used to bump by hand on deploys.** Now that it's governed, bump
> it the Terraform way: either edit the `cold_start_force` default in `modules/bsh-function-prod/main.tf` in
> a one-line PR, or pass `-var cold_start_force=<new-ts>` to the gated apply. **Do NOT
> `aws lambda update-function-configuration` it anymore** — a hand bump becomes drift that the next gated
> apply (even from an unrelated PR) silently REVERTS to the modeled value, un-doing your cache-bust.

---

## After Tier 2 — remaining tiers
- **Tier 2 follow-ons (defer-ok):** adopt the deferred log group + the API-GW invoke permission; bring the
  managed-policy attachments in scope and remediate `AmazonBedrockFullAccess` / `AmazonS3ReadOnlyAccess` to
  scoped grants; scope SES off `Resource:"*"`.
- **⚠️ Standing constraint carried from Tier 1 (do not trip):** the role's `ClerkSecretRead` grant
  hardcodes the Clerk secret ARN with a version suffix → **Secrets Manager rotation on that secret MUST stay
  OFF** until the ARN is widened to a `…secret_key-*` wildcard, else every Clerk auth check AccessDenies and
  BSH chat outages. See `infra/modules/bsh-iam-grants-prod/main.tf` header.
- **CI safety follow-on (defer-ok):** the prod apply workflow has no automated "is the module in state?"
  pre-flight, so applying `-target=module.bsh_function_prod` **before** Phase A import would CREATE the
  function from the placeholder zip (a prod chat outage). Today the control is the approval gate + the Phase A
  "do not apply from a `2 to add` plan" instruction. A generic state-presence guard in the workflow would
  harden this.
- **Tier 3 + naming reconciliation:** DynamoDB tables via `terraform import`, reconciling the module
  `{name}-{env}` convention with prod's bare names (incl. the `picasso-tenant-registry-production` /
  `picasso_form_submissions` mismatches mirrored as-is here). Only after this can the prod workflow drop
  `-target`.

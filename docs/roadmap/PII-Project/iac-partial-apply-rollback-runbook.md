# IaC Partial-Apply Rollback Runbook

**Established 2026-05-26** per closeout phase-completion-audit row #20 (tech-lead).

When a staging `terraform apply` fails partway through, some resources have been mutated and others have not. The Terraform state will reflect the partial state. This runbook covers: how to determine what applied, when rollback is safe, and how to execute it surgically without losing other applied work.

## When this runbook applies

The CI workflow `Terraform Infrastructure (staging)` ran `terraform apply` and reported `failure` — but the diff shows that SOME resources were created/modified before the failure.

Symptoms in the CI log:
- `Plan: N to add, M to change, K to destroy` followed by
- A handful of `Creating...` / `Modifying...` lines showing **completion** (e.g., `Modifications complete after 1s`)
- Then an `Error: ...` line for a different resource

Example precedent: **2026-05-26 picasso#228 merge** — `aws_iam_role_policy.dsar` Modified successfully (4 new IAM Sids), then 3 CloudWatch alarms failed `PutMetricAlarm`. The IAM grants were LIVE in AWS but the alarms were not. The session diagnosed via `aws iam get-role-policy` and proceeded with a follow-up unblock PR.

## Step 1 — Determine what actually applied

Live AWS state is the truth, NOT the CI log (CI may swallow intermediate output).

For each resource in the failed plan, query live AWS:

```bash
# IAM grants
AWS_PROFILE=myrecruiter-staging aws iam get-role-policy \
  --role-name <role-name> --policy-name <policy-name> \
  --query 'PolicyDocument.Statement[].Sid' --output json

# Lambda config
AWS_PROFILE=myrecruiter-staging aws lambda get-function-configuration \
  --function-name <fn-name> --query 'Environment.Variables' --output json

# CloudWatch alarm
AWS_PROFILE=myrecruiter-staging aws cloudwatch describe-alarms \
  --alarm-names <alarm-name> --query 'MetricAlarms[].StateValue'

# DynamoDB table
AWS_PROFILE=myrecruiter-staging aws dynamodb describe-table \
  --table-name <table-name> --query 'Table.TableStatus'
```

Build a table:

| Resource | Plan action | Live state | Diff vs pre-apply |
|---|---|---|---|
| `module.X.aws_iam_role_policy.Y` | modify | applied | NEW Sid present |
| `module.A.aws_cloudwatch_metric_alarm.B` | create | not created | matches pre-apply |

## Step 2 — Decide if rollback is safe

Rollback is **safe** when:
- The applied changes are additive (new IAM grants, new env vars, new alarms)
- No downstream code calls the newly-applied resource yet
- The rollback path is well-tested (e.g., revert the PR, re-apply)

Rollback is **unsafe** when:
- The applied changes are destructive (deletes, scope reductions, IAM removals that other code depends on)
- The applied state is already in use by live traffic
- The reverse migration is undocumented

**Recent precedent (don't rollback unsafely):** 2026-05-26 picasso#228 partial-apply: the 4 IAM grants were ADDITIVE and the DSAR Lambda's walker code (already deployed in source, not yet running in production) was the ONLY consumer. Safe path was to KEEP the IAM grants (additive) and ship a forward-fix PR for the failed alarms.

## Step 3 — Three rollback options

### Option A: Forward-fix (additive partial-apply)

Most common. The applied changes are good; the failed resources are the only problem.

1. Open a follow-up PR that addresses the failed resources (fix the bug OR remove the resource).
2. Merge to staging.
3. CI re-runs `terraform apply` against the now-clean configuration.
4. Verify all resources are applied per Step 1.

**Used 2026-05-26 (picasso#236 + picasso#237 + picasso#240).** Worked.

### Option B: Selective Terraform-state surgery

Use when the applied resources are GENUINELY problematic and you need to "untrack" them from Terraform's state without destroying them in AWS.

```bash
# Remove a resource from Terraform state (does NOT delete from AWS)
AWS_PROFILE=myrecruiter-staging terraform state rm 'module.X.aws_iam_role_policy.Y'

# Verify removal
AWS_PROFILE=myrecruiter-staging terraform state list | grep -v '<removed-resource>'

# Update code to remove the resource definition (otherwise next apply re-adds it)
# Commit the IaC change separately so the state surgery is documented in git.
```

**Caveats:**
- `terraform state rm` is irreversible without backup. Take a state backup first: `terraform state pull > /tmp/tfstate-backup-$(date +%s).json`.
- AWS-side resources are untouched; they're now "orphan" relative to Terraform.
- Future apply on the same resource ARN will FAIL with "resource already exists" until either (a) IaC adds an `import` block OR (b) the AWS-side resource is deleted out-of-band.

**Not yet used in this project.** Document in this runbook if/when first used.

### Option C: Destructive rollback

Use when the applied changes are unambiguously wrong AND can be safely destroyed.

```bash
# Run apply with target flag to destroy a specific resource
AWS_PROFILE=myrecruiter-staging terraform apply \
  -destroy -target='module.X.aws_iam_role_policy.Y'

# OR revert the PR + apply
# (PR revert path is preferred because it leaves a git audit trail)
```

**Caveats:**
- Destroys are irreversible (unless the resource has versioning/PITR).
- IAM grant removals can cascade — verify no live code is calling the resource first.

**Not yet used in this project.**

## Step 4 — Document the rollback

After any rollback (A/B/C), add a row to `MASTER_PROJECT_PLAN.md` revision history capturing:
- Which resources applied + which failed
- Which rollback option was chosen + why
- Forward-fix PR numbers (Option A) or terraform state commands (Option B)
- Any AWS-side residual (orphan resources, partial state)

## Step 5 — Prevent recurrence

After each rollback, ask:
- Was this caught by `terraform plan` in the PR? If not, why? Add a `terraform validate` extension or pre-commit hook.
- Was this an AWS API limit (e.g., SEARCH-in-alarms 2026-05-26)? Document in IaC comment block.
- Was this an IaC convention violation (e.g., em-dash in IAM description 2026-05-19)? Add to CLAUDE.md "IaC IAM string-charset gotcha" or equivalent.

## Reference precedents

- **2026-05-19 (Apply-1)**: em-dash in IAM role description caused partial apply. Forward-fix path. [`PR #145`].
- **2026-05-26 (picasso#228 merge)**: 3 CW alarm bugs caused partial apply. 4 IAM grants APPLIED + 3 alarms FAILED. Forward-fix via picasso#236 + picasso#237. Documented in master plan v0.32.

## Forward triggers

- Add this runbook to the operator playbook's §"Operational procedures" reference list.
- Quarterly D2/D3/D4 currency review (2026-08-22 next) should re-confirm the procedures + add any new precedents.

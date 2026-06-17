# Setup — Infra Drift Detection (B3)

Activates `.github/workflows/infra-drift-detection.yml`: a weekly read-only
`terraform plan` against prod (614) that opens a deduped GitHub issue on any
non-empty plan. The workflow ships **inert** (its job is gated on the repo
variable `PROD_PLAN_ROLE_ARN`); these two operator steps turn it on.

**Why a new role.** A scheduled run's OIDC token sub is
`repo:longhornrumble/picasso:ref:refs/heads/main`. The prod `GitHubActionsDeployRole`
trust allows only `…:environment:production` and `…:pull_request` subs, so the cron
cannot use it — and it *shouldn't* (the deploy role can apply; a drift cron must be
read-only). So: a dedicated `GitHubActionsPlanRole` with AWS-managed `ReadOnlyAccess`,
trusted for the cron sub. Combined with `terraform plan -lock=false`, the cron can
never apply, never write state, and never block an operator apply.

---

## Step 1 — create the read-only plan role in prod 614 (operator, `--profile chris-admin`)

```bash
cat > /tmp/plan-role-trust.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "arn:aws:iam::614056832592:oidc-provider/token.actions.githubusercontent.com" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
        "StringLike": { "token.actions.githubusercontent.com:sub": "repo:longhornrumble/picasso:ref:refs/heads/main" }
      }
    }
  ]
}
JSON

aws iam create-role --role-name GitHubActionsPlanRole \
  --assume-role-policy-document file:///tmp/plan-role-trust.json \
  --description "Read-only OIDC role for scheduled terraform-plan drift detection (B3). No apply." \
  --profile chris-admin

aws iam attach-role-policy --role-name GitHubActionsPlanRole \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess \
  --profile chris-admin
```

Notes:
- `ReadOnlyAccess` covers everything `terraform plan` needs: Describe/Get/List on the
  managed resources + `s3:GetObject` on the state backend. It grants **no** write, so the
  role is apply-incapable by construction.
- The role `description` is ASCII-only (IAM rejects em-dash / smart-quotes — see CLAUDE.md).
- Optional tightening: add a `job_workflow_ref` condition to restrict the sub to *this*
  workflow file. Not required — the role is read-only, so a broader `ref:main` sub is low-risk.

## Step 2 — wire the repo variable

```bash
gh variable set PROD_PLAN_ROLE_ARN --repo longhornrumble/picasso \
  --body "arn:aws:iam::614056832592:role/GitHubActionsPlanRole"
```

The job's `if: vars.PROD_PLAN_ROLE_ARN != ''` now evaluates true → the workflow activates.

---

## Step 3 — drill (verifies the DoD: "hand-edit caught in ≤7 days")

> Note (updated 2026-06-17): the prod baseline is now **clean** — Remedy A Phase 2 landed
> and a full-root prod plan reads `No changes`. So there is no longer a standing diff to
> serve as a free drill fixture (the earlier draft used the BSH Function-URL flip). The
> drill is now an explicit two-part check.

**Part A — no-false-alarm (zero risk):** dispatch against the clean baseline; expect NO issue.

```bash
gh workflow run infra-drift-detection.yml --repo longhornrumble/picasso
# wait ~2-3 min:
gh run list --workflow infra-drift-detection.yml --limit 1            # expect success
gh issue list --state open --search 'in:title "Prod infra drift detected"'   # expect EMPTY
```

**Part B — issue-opening path (deliberate, reversible hand-edit):** make a benign,
reversible out-of-band change so the next plan is non-empty, dispatch, confirm the issue,
then revert.

```bash
# example: bump a TF-managed prod log-group retention by hand (reversible)
aws logs put-retention-policy --log-group-name /aws/lambda/Master_Function_v2 \
  --retention-in-days 14 --profile chris-admin            # IaC says 7 -> creates drift
gh workflow run infra-drift-detection.yml --repo longhornrumble/picasso
# wait ~2-3 min, expect ONE open drift issue whose body shows the retention diff:
gh issue list --state open --search 'in:title "Prod infra drift detected"'
# REVERT the hand-edit, then close the drill issue:
aws logs put-retention-policy --log-group-name /aws/lambda/Master_Function_v2 \
  --retention-in-days 7 --profile chris-admin
```

Part A + Part B together prove the DoD: clean = silent, drift = caught in ≤7 days.

---

## Operating notes
- Cadence: Mondays 13:00 UTC (best-effort, like the synthetic monitor). Manual `workflow_dispatch` any time.
- Dedup: one open issue at a time (matched on title); it re-opens next week only while drift persists.
- Noise: `ignore_changes` attrs (MFS/BSH `filename`/`source_code_hash`/`description`) are
  suppressed by Terraform and won't show; the `default_tags` finalizer is already applied. If
  a benign diff ever recurs, add a targeted baseline-ignore then (don't pre-build it).
- Staging (525) drift is a deliberate follow-on — it needs the staging belt's real-secret
  wiring (the inert prod placeholders would false-alarm staging's cloudfront-widget origin).
  Add a second `drift-staging` job + a `STAGING_PLAN_ROLE_ARN` var when wanted.

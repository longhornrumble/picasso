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

**No hand-edit needed** — there is already a real pending prod drift to serve as the test
fixture: the BSH Function-URL `authorization_type` (live `NONE` vs IaC `AWS_IAM`, pending
Remedy A Phase 2). So:

```bash
gh workflow run infra-drift-detection.yml --repo longhornrumble/picasso
# wait ~2-3 min, then:
gh run list --workflow infra-drift-detection.yml --limit 1
gh issue list --state open --search 'in:title "Prod infra drift detected"'
```

**Expect:** the run completes, and a drift issue opens whose body shows the
`aws_lambda_function_url … authorization_type "NONE" -> "AWS_IAM"` change. That proves the
detector works end-to-end with zero risk.

- After Remedy A **Phase 2** lands (`Sandbox/prod_bsh_remedy_a_phase2_cutover_2026-06-17.md`),
  that diff disappears and the weekly run should read **No drift** — proving it's not a
  false-alarm machine. Close the drill issue once you've eyeballed it.
- If you'd rather drill a clean baseline first, do Phase 2 before Step 3; then the drill
  needs a deliberate benign hand-edit (e.g. bump a log-group `retention_in_days`, dispatch,
  confirm the issue, revert).

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

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

## Step 1 — apply the Terraform-managed plan role to prod 614 (gated belt)

The role is **Terraform-managed** (`infra/modules/ci-drift-plan-role-prod`, prod-only,
`ReadOnlyAccess` only) — NOT hand-created. Once the module is on `main`, apply it via the
gated prod belt:

1. Operator dispatches **Terraform Infrastructure (production)** (`infra-deploy-prod.yml`)
   with `target = module.ci_drift_plan_role_prod` (or a full-root apply — the plan adds only
   this role + its `ReadOnlyAccess` attachment: **`Plan: 2 to add, 0 to change, 0 to destroy`**,
   verified 2026-06-17).
2. Approve the `production` environment gate. The apply creates `GitHubActionsPlanRole`.

Why TF-managed (not hand-CLI): the role then has no hand-managed prod drift, and it's covered
by the very drift detector it enables. `ReadOnlyAccess` grants everything `terraform plan`
needs (Describe/Get/List + `s3:GetObject` on state) and **no** write, so it's apply-incapable.
The trust permits only the cron sub `repo:longhornrumble/picasso:ref:refs/heads/main`.

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

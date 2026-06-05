# Infrastructure (Terraform)

Single Terraform root module describing MyRecruiter's AWS infrastructure. Same modules deploy to `staging` and `dev` AWS accounts — `prod` deferred to Phase 2 of P0.

## 🚨 CRITICAL: Always work from the `staging` branch for staging infra

The `staging` long-lived branch is intentionally many commits ahead of `main`. Per `feedback_staging_promotion_path`, staging→main is a deliberate milestone PR, not a continuous merge.

**Operational guardrails:**

1. **Work from `staging` branch for any change touching `infra/` against the staging account.** Feature branches MUST branch from `origin/staging`, not `main`.
2. **Never run `terraform apply -var-file=envs/staging.tfvars` from `main`.** Main's `infra/main.tf` is severely behind staging's — `terraform plan` from main shows 44+ destroys against the staging account (would wipe BSH, MFS, Analytics Lambdas, secrets, S3 buckets). The "destroys" are not orphans — they're staging-branch-managed resources main has not yet absorbed.
3. **If you accidentally land on `main` and see a many-destroy plan:** STOP. Do not apply. Do not use `-target` to "work around" it. Switch to a branch off `origin/staging`. The `-target` escape hatch is for true Terraform-blessed exceptions, not for masking branch-state confusion.
4. **CI auto-applies on push to `staging`** (`.github/workflows/infra-deploy.yml`). PRs to staging show plan as a comment. Verify the plan is the expected delta BEFORE merging.

This was learned the hard way during BSH staging-twin Phase A (2026-05-14): the "44 orphan resources" framing was a misdiagnosis caused by working from `main`. Documented in `feedback_pre_flight_check_staging_branch.md` + `feedback_misdiagnosis_halt_escalate.md`.

## Layout

- `main.tf` — provider config, backend declaration
- `variables.tf` — root module inputs
- `modules/` — reusable building blocks (one per resource type)
- `envs/<env>.tfvars` — per-environment variable values
- `backend/<env>.tfbackend` — per-environment state backend config

## Deploy commands

Always run from `infra/` directory. Set `AWS_PROFILE` env var explicitly — it's the auth path Terraform's S3 backend resolves SSO credentials through. Do NOT add `profile = "..."` to the backend or provider config; it conflicts with the SSO session lookup.

```bash
# Staging (PowerUserAccess via SSO)
aws sso login --profile myrecruiter-staging
export AWS_PROFILE=myrecruiter-staging
terraform init -reconfigure -backend-config=backend/staging.tfbackend
terraform plan  -var-file=envs/staging.tfvars
terraform apply -var-file=envs/staging.tfvars

# Dev (AdministratorAccess via SSO)
aws sso login --profile myrecruiter-dev
export AWS_PROFILE=myrecruiter-dev
terraform init -reconfigure -backend-config=backend/dev.tfbackend
terraform plan  -var-file=envs/dev.tfvars
terraform apply -var-file=envs/dev.tfvars
```

`-reconfigure` is required when switching backends; otherwise Terraform errors trying to reuse the previous env's state. Always unset stale `AWS_ACCESS_KEY_ID`/`AWS_SESSION_TOKEN` env vars before running terraform — they'll override the profile and break SSO.

## Where state lives

| Env | State bucket | Lock table |
|---|---|---|
| staging | `myrecruiter-tfstate-staging` (525409062831) | `myrecruiter-tfstate-lock-staging` |
| dev | `myrecruiter-tfstate-dev` (372666940362) | `myrecruiter-tfstate-lock-dev` |
| production | `myrecruiter-tfstate-production` (614056832592) | S3-native lockfile (`use_lockfile=true`) |

State buckets have versioning + public access blocked. **staging** state is
encrypted with a customer-managed KMS CMK (`alias/myrecruiter-tfstate-staging`,
key `e9bd10a4-ed54-4aca-ae29-2d3f38393e36`) via the backend's `kms_key_id`; dev
remains SSE-S3 (AES256).

### State CMK bootstrap (deliberate out-of-band exception)

The staging tfstate CMK is **created out-of-band via `aws kms`, not Terraform**.
A TF-managed key that encrypts TF's own state is a chicken-and-egg: a
`terraform destroy` or state corruption could orphan the key that unlocks the
state. Its key policy grants account root (`kms:*`, break-glass / never-orphan;
also covers AdministratorAccess SSO via IAM delegation) and an explicit
least-privilege grant to the CI deploy role `GitHubActionsDeployRole`
(`Decrypt`/`Encrypt`/`GenerateDataKey*`/`DescribeKey`/`ReEncrypt*`). Annual
rotation is enabled. If the key policy or alias is ever changed, the staging
`infra-deploy` pipeline must still be able to decrypt or every infra run breaks
— validate on a real CI run, not by reading the policy.

## Adding a new resource

1. Create or extend a module under `modules/<name>/`
2. Reference it from `main.tf`
3. `terraform plan -var-file=envs/dev.tfvars` to preview
4. `terraform apply -var-file=envs/dev.tfvars` once happy
5. Promote to staging by re-running with `-var-file=envs/staging.tfvars`

## Production promotion (Phase 2 — IN PROGRESS)

Phase 2 is underway. `envs/production.tfvars` + `backend/production.tfbackend` exist; the prod
state backend + OIDC deploy role were bootstrapped out-of-band (see
`docs/runbooks/prod-iac-bootstrap.md`). The first resources adopted are the BSH ops alarms (the
pilot — `docs/runbooks/prod-iac-pilot-alarms.md`); applies are approval-gated via the `production`
GitHub Environment in `.github/workflows/infra-deploy-prod.yml`.

**Naming convention (do not violate — hard-won by the naming-alignment program):**
- `var.env` values mirror the **live** Environment values: `staging`, `production` — never a
  translated form like `prod`. The value flows to `default_tags { Environment }` and Lambda env vars.
- Resource **names are BARE** (no env suffix): account = environment, so the same bare name
  (`picasso-session-summaries`, `picasso-sms-consent`, …) exists in each account. Do NOT add new
  resources that embed `${var.env}` in a name. (Legacy modules still carry `-${var.env}` suffixes;
  those are being retired by the naming-alignment program. Until they're bare, production applies are
  `-target`-scoped so they don't create orphan `-production`-suffixed tables.)
- State buckets are the one forced exception (S3 names are global): `myrecruiter-tfstate-<envvalue>`.

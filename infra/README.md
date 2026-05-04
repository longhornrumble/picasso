# Infrastructure (Terraform)

Single Terraform root module describing MyRecruiter's AWS infrastructure. Same modules deploy to `staging` and `dev` AWS accounts — `prod` deferred to Phase 2 of P0.

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
| prod | TBD — created in Phase 2 of P0 | TBD |

State buckets have versioning + AES256 encryption + public access blocked.

## Adding a new resource

1. Create or extend a module under `modules/<name>/`
2. Reference it from `main.tf`
3. `terraform plan -var-file=envs/dev.tfvars` to preview
4. `terraform apply -var-file=envs/dev.tfvars` once happy
5. Promote to staging by re-running with `-var-file=envs/staging.tfvars`

## Production promotion (later)

Phase 2 of P0 will add `envs/prod.tfvars` + `backend/prod.tfbackend` plus state bucket creation in the prod account. Until then, **do not** create those files. Prod resources continue to be managed via existing manual processes during Phase 1.

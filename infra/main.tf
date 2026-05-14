terraform {
  required_version = ">= 1.5.0"

  # Backend is configured per-env via -backend-config=backend/<env>.tfbackend
  # at `terraform init` time — keeps a single root module deploying to N envs.
  backend "s3" {}

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  # AWS credentials sourced from AWS_PROFILE env var. Set it before running terraform:
  #   AWS_PROFILE=myrecruiter-staging terraform plan -var-file=envs/staging.tfvars
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.env
      ManagedBy   = "terraform"
      Project     = "myrecruiter"
    }
  }
}

module "session_summaries" {
  source = "./modules/ddb-session-summaries"
  env    = var.env
}

# BSH form_handler twin tables — Phase A of the staging-twin sequencing
# (`project_staging_twin_resource_provisioning_backlog.md`). Provisions the 2
# tables BSH form_handler.js references that didn't yet exist in either env:
# `picasso-sms-consent-{env}` and `picasso-sms-usage-{env}`. The other 2
# tables (`picasso-form-submissions-staging`, `picasso-notification-sends-staging`)
# are already managed by `ddb_form_submissions_staging` (lines 91-94) +
# `ddb_notification_sends_staging` (lines 101-104) below — Phase A intentionally
# does NOT redeclare them.
#
# DEVIATION FROM PATTERN (Phase A.1 audit row #5): this module has no
# `count = var.env == "staging" ? 1 : 0` guard, unlike every other staging-specific
# module below. Intentional — BSH form_handler.js needs these tables in every
# environment that runs the Lambda (dev for iteration, staging for live traffic
# pre-Phase-D, prod after promotion). Tables are PAY_PER_REQUEST so cost-zero
# when idle. If someone runs a prod apply, `picasso-sms-consent-prod` +
# `picasso-sms-usage-prod` would be created — that is the correct behavior for
# prod promotion, NOT an accident.
module "picasso_form_tables" {
  source = "./modules/picasso-form-tables"
  env    = var.env
}

# Staging-only: cross-account replication target for prod tenant configs.
# Bucket lives in the staging account; replication IS configured on the prod
# source bucket (hand-applied with chris-admin until P0 Phase 2 brings prod
# under Terraform). See infra/README.md and the v7 Issue #5 plan.
module "tenant_config_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/s3-tenant-config-staging"
}

# Issue #5 batch 2a: dependent state for staging-account Lambdas. Each table
# mirrors the schema of its prod-account legacy twin (audited 2026-05-04).
# JWT secret value is injected post-apply via aws CLI — never enters state.
module "ddb_tenant_registry_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-tenant-registry-staging"
}

module "ddb_recent_messages_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-recent-messages-staging"
}

module "ddb_audit_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-audit-staging"
}

module "ddb_conversation_summaries_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-conversation-summaries-staging"
}

# Phase 4.1 (analytics-dashboard staging twin): session-events table — first
# of six new tables backing the staging Analytics_Dashboard_API. Mirrors the
# prod-account `picasso-session-events` schema: writer is Analytics_Event_
# Processor (PK SESSION#{id} / SK STEP#{nnn}); reader is Analytics_Dashboard_
# API which queries via the `tenant-date-index` GSI. TTL attribute set by
# the writer; PITR enabled per the rest of the staging account convention.
module "ddb_session_events_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-session-events-staging"
}

# Phase 4.1 batch 2: remaining 5 DDB tables backing the staging-account
# Analytics_Dashboard_API. Each mirrors the schema of its prod-account
# legacy twin (sources cited per module). All are referenced by the new
# Lambda module shipped in a follow-up PR.

module "ddb_form_submissions_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-form-submissions-staging"
}

module "ddb_notification_events_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-notification-events-staging"
}

module "ddb_notification_sends_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-notification-sends-staging"
}

module "ddb_billing_events_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-billing-events-staging"
}

module "ddb_employee_registry_v2_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-employee-registry-v2-staging"
}

module "ddb_token_blacklist_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-token-blacklist"
  env    = var.env
}

module "secrets_jwt_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/secrets-jwt-staging"
}

# Phase 4.1: Clerk dev-project secret slot. Value is populated post-apply
# via aws secretsmanager put-secret-value (out of Terraform state, same
# pattern as JWT). Value injected 2026-05-10 from the now-decommissioned
# legacy Lambda's env var; rotate via Clerk console + put-secret-value
# when the dev project's key is rotated.
module "secrets_clerk_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/secrets-clerk-staging"
}

# Issue #5 batch 2b: staging-account Bedrock streaming handler.
# Placeholder code; real handler ships via PR A (analytics_writer
# integration) using `aws lambda update-function-code`.
module "lambda_bedrock_handler_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-bedrock-handler-staging"

  tenant_config_bucket_arn     = module.tenant_config_staging[0].bucket_arn
  config_bucket_name           = module.tenant_config_staging[0].bucket_name
  session_summaries_table_arn  = module.session_summaries.table_arn
  session_summaries_table_name = module.session_summaries.table_name
  tenant_registry_table_arn    = module.ddb_tenant_registry_staging[0].table_arn
  tenant_registry_table_name   = module.ddb_tenant_registry_staging[0].table_name

  # Phase 1 v3 enforcement-on (PR #5 + #6): CF-origin-header validator
  # secret ARN. Wildcard `-*` matches any AWS-generated 6-char suffix so
  # secret rotation (which creates a new ARN suffix) doesn't break IAM.
  cf_origin_secret_arn  = "arn:aws:secretsmanager:us-east-1:525409062831:secret:picasso/bsh/cf-origin-secret-*"
  cf_origin_secret_name = "picasso/bsh/cf-origin-secret"

  # Phase A staging-twin form tables. The 2 existing tables (form_submissions,
  # notification_sends) come from the Phase 4 modules; the 2 new tables
  # (sms_consent, sms_usage) come from the picasso_form_tables module above.
  form_submissions_table_arn    = module.ddb_form_submissions_staging[0].table_arn
  form_submissions_table_name   = module.ddb_form_submissions_staging[0].table_name
  notification_sends_table_arn  = module.ddb_notification_sends_staging[0].table_arn
  notification_sends_table_name = module.ddb_notification_sends_staging[0].table_name
  sms_consent_table_arn         = module.picasso_form_tables.sms_consent_table_arn
  sms_consent_table_name        = module.picasso_form_tables.sms_consent_table_name
  sms_usage_table_arn           = module.picasso_form_tables.sms_usage_table_arn
  sms_usage_table_name          = module.picasso_form_tables.sms_usage_table_name

  # MYR test tenant KB — the only KB allowed for Issue #5 batch 2b.
  # Add more tenants here as they're enrolled in staging coverage.
  kb_arns = [
    "arn:aws:bedrock:us-east-1:614056832592:knowledge-base/0BQBWFYDMT",
  ]

  # Cross-account KB access: AWS RAM doesn't support Bedrock KBs, so
  # the staging Lambda assumes a prod-side role that has Retrieve.
  # The role + its inline policy were hand-applied in prod (chris-admin)
  # since prod is hand-managed until P0 Phase 2.
  kb_retriever_role_arns = [
    "arn:aws:iam::614056832592:role/picasso-kb-retriever-from-staging",
  ]
}

# Issue #5 batch 2b: staging-account Master_Function. Placeholder code;
# real handler ships via PR A2.
module "lambda_master_function_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-master-function-staging"

  tenant_config_bucket_arn          = module.tenant_config_staging[0].bucket_arn
  config_bucket_name                = module.tenant_config_staging[0].bucket_name
  jwt_secret_arn                    = module.secrets_jwt_staging[0].secret_arn
  jwt_secret_name                   = module.secrets_jwt_staging[0].secret_name
  session_summaries_table_arn       = module.session_summaries.table_arn
  session_summaries_table_name      = module.session_summaries.table_name
  tenant_registry_table_arn         = module.ddb_tenant_registry_staging[0].table_arn
  tenant_registry_table_name        = module.ddb_tenant_registry_staging[0].table_name
  audit_table_arn                   = module.ddb_audit_staging[0].table_arn
  audit_table_name                  = module.ddb_audit_staging[0].table_name
  recent_messages_table_arn         = module.ddb_recent_messages_staging[0].table_arn
  recent_messages_table_name        = module.ddb_recent_messages_staging[0].table_name
  conversation_summaries_table_arn  = module.ddb_conversation_summaries_staging[0].table_arn
  conversation_summaries_table_name = module.ddb_conversation_summaries_staging[0].table_name
  token_blacklist_table_arn         = module.ddb_token_blacklist_staging[0].table_arn
  token_blacklist_table_name        = module.ddb_token_blacklist_staging[0].table_name
  form_submissions_table_arn        = module.ddb_form_submissions_staging[0].table_arn
  form_submissions_table_name       = module.ddb_form_submissions_staging[0].table_name
  notification_sends_table_arn      = module.ddb_notification_sends_staging[0].table_arn
  notification_sends_table_name     = module.ddb_notification_sends_staging[0].table_name
  streaming_endpoint                = module.lambda_bedrock_handler_staging[0].function_url

  # CloudFront origin secret ARN. Activates the conditional CfOriginSecretRead
  # grant in the module (no-op when empty). The Lambda's REQUIRE_CF_ORIGIN_HEADER
  # flag stays off until CF is also configured to inject the matching header —
  # see the activation runbook in project_mfs_phase4_complete_handoff_2026-05-12.
  cf_origin_secret_arn = "arn:aws:secretsmanager:us-east-1:525409062831:secret:picasso/mfs/cf-origin-secret-ZU7vTU"

  # Mirrors the BSH module block above (lines 88-98). Same KB + same prod-side
  # retriever role — Master_Function needs identical cross-account access for
  # its HTTP-fallback chat path.
  kb_arns = [
    "arn:aws:bedrock:us-east-1:614056832592:knowledge-base/0BQBWFYDMT",
  ]
  kb_retriever_role_arns = [
    "arn:aws:iam::614056832592:role/picasso-kb-retriever-from-staging",
  ]

  # Phase 2 MFS cleanup R5 set staging MFS log retention to 14d. Codify so
  # `terraform apply` doesn't revert to the module default of 30.
  log_retention_days = 14
}

# Phase 4.1: staging-account Analytics_Dashboard_API. Bundles IAM exec
# role + CloudWatch log group + Lambda placeholder + Function URL
# (AuthType NONE, BUFFERED). Real code ships via Phase 4.2 lambda repo
# CI matrix entry. CLERK_SECRET_KEY is in Secrets Manager only — never
# in env vars or tfstate (Plan Security F2).
module "lambda_analytics_dashboard_api_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-analytics-dashboard-api-staging"

  tenant_config_bucket_arn = module.tenant_config_staging[0].bucket_arn
  config_bucket_name       = module.tenant_config_staging[0].bucket_name

  jwt_secret_arn    = module.secrets_jwt_staging[0].secret_arn
  jwt_secret_name   = module.secrets_jwt_staging[0].secret_name
  clerk_secret_arn  = module.secrets_clerk_staging[0].secret_arn
  clerk_secret_name = module.secrets_clerk_staging[0].secret_name

  tenant_registry_table_arn      = module.ddb_tenant_registry_staging[0].table_arn
  tenant_registry_table_name     = module.ddb_tenant_registry_staging[0].table_name
  session_summaries_table_arn    = module.session_summaries.table_arn
  session_summaries_table_name   = module.session_summaries.table_name
  session_events_table_arn       = module.ddb_session_events_staging[0].table_arn
  session_events_table_name      = module.ddb_session_events_staging[0].table_name
  form_submissions_table_arn     = module.ddb_form_submissions_staging[0].table_arn
  form_submissions_table_name    = module.ddb_form_submissions_staging[0].table_name
  notification_events_table_arn  = module.ddb_notification_events_staging[0].table_arn
  notification_events_table_name = module.ddb_notification_events_staging[0].table_name
  notification_sends_table_arn   = module.ddb_notification_sends_staging[0].table_arn
  notification_sends_table_name  = module.ddb_notification_sends_staging[0].table_name
  billing_events_table_arn       = module.ddb_billing_events_staging[0].table_arn
  billing_events_table_name      = module.ddb_billing_events_staging[0].table_name
  employee_registry_table_arn    = module.ddb_employee_registry_v2_staging[0].table_arn
  employee_registry_table_name   = module.ddb_employee_registry_v2_staging[0].table_name
  audit_table_arn                = module.ddb_audit_staging[0].table_arn
  audit_table_name               = module.ddb_audit_staging[0].table_name

  # Tier-3 archive bucket is currently hand-created (Phase 2 of MFS cleanup).
  # ARN inlined here rather than via module output until the bucket itself is
  # Terraformed. Follow-up tracked in project memory.
  archive_bucket_arn = "arn:aws:s3:::picasso-archive-${var.env}"
}

# Clerk secret resource policy — restricts read to the ADA exec role
# only. Lives at root level (mirrors JWT pattern) to avoid the same
# circular-dep issue: secret policy needs the role ARN; the Lambda
# module needs the secret ARN.
resource "aws_secretsmanager_secret_policy" "clerk_secret_key_staging" {
  count      = var.env == "staging" ? 1 : 0
  secret_arn = module.secrets_clerk_staging[0].secret_arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowAnalyticsDashboardAPIRoleOnly"
        Effect    = "Allow"
        Principal = { AWS = module.lambda_analytics_dashboard_api_staging[0].role_arn }
        Action    = "secretsmanager:GetSecretValue"
        Resource  = "*"
      },
      {
        # See note in jwt_signing_key_staging policy above — NotPrincipal
        # with role ARN doesn't reliably exclude assumed-role sessions.
        # aws:PrincipalArn normalizes the session ARN back to the role ARN.
        Sid       = "DenyAllOtherStagingPrincipals"
        Effect    = "Deny"
        Principal = "*"
        Action    = "secretsmanager:GetSecretValue"
        Resource  = "*"
        Condition = {
          StringNotEquals = {
            "aws:PrincipalArn" = module.lambda_analytics_dashboard_api_staging[0].role_arn
          }
        }
      },
    ]
  })
}

# Issue #5 PR A2-infra: ops alarms + SNS topic for Master_Function_Staging.
# - p99 duration > 5s (catches HTTP-fallback chat path latency regression
#   from analytics writer's 2s boto3 timeout, per v7 plan PR A2 §item 4).
# - kb_creds_init_failed signal (PR A finding B3 — alerts on cross-account
#   credential init failure that would silently degrade KB Retrieve).
# - analytics_write_failure signal (catches IAM/schema regressions in the
#   analytics writer DDB path).
# SNS subscriptions are intentionally OUT of Terraform — wire them via
# Console (email/PagerDuty/Slack) since they involve confirmation flows.
module "ops_alarms_master_function_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ops-alarms-master-function-staging"

  function_name  = module.lambda_master_function_staging[0].function_name
  log_group_name = module.lambda_master_function_staging[0].log_group_name
}

# JWT secret resource policy — restricts read to the Lambda exec roles
# that legitimately validate Picasso-issued JWTs. Defense-in-depth: the
# Lambda IAM policies already grant the read; this resource-side Deny
# blocks PowerUserAccess principals in the staging account from reading
# the signing key out-of-band. Lives at root level (not in the secrets
# module) to avoid a circular dep with the Lambda modules.
#
# Both Master_Function_Staging (chat HTTP fallback) and
# Analytics_Dashboard_API (dashboard self-signed admin tokens) need
# read access. The original #81 policy only allowed MFS, which surfaced
# as AccessDeniedException on ADA's self-signed JWT validation path.
resource "aws_secretsmanager_secret_policy" "jwt_signing_key_staging" {
  count      = var.env == "staging" ? 1 : 0
  secret_arn = module.secrets_jwt_staging[0].secret_arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowJWTValidatingLambdaRoles"
        Effect = "Allow"
        Principal = { AWS = [
          module.lambda_master_function_staging[0].role_arn,
          module.lambda_analytics_dashboard_api_staging[0].role_arn,
        ] }
        Action   = "secretsmanager:GetSecretValue"
        Resource = "*"
      },
      {
        # NotPrincipal with a role ARN doesn't reliably exclude assumed-role
        # sessions of that role — AWS evaluates literally and the session ARN
        # (arn:aws:sts::ACCT:assumed-role/NAME/SESSION) doesn't string-match
        # the role ARN. Use aws:PrincipalArn instead — that condition key
        # normalizes assumed-role sessions back to the role ARN.
        Sid       = "DenyAllOtherStagingPrincipals"
        Effect    = "Deny"
        Principal = "*"
        Action    = "secretsmanager:GetSecretValue"
        Resource  = "*"
        Condition = {
          StringNotEquals = {
            "aws:PrincipalArn" = [
              module.lambda_master_function_staging[0].role_arn,
              module.lambda_analytics_dashboard_api_staging[0].role_arn,
            ]
          }
        }
      },
    ]
  })
}

# ------------------------------------------------------------------
# picasso-session-archiver — Event Source Mapping (Phase 2 audit row G)
# ------------------------------------------------------------------
# Imports the live ESM into Terraform state so future StartingPosition or
# config changes flow via the IaC SOP rather than direct CLI. The Lambda
# itself + its IAM + the DLQ are still hand-created — bringing them under
# Terraform is follow-up scope. UUID below is the post-B9 fix recreate.
import {
  to = aws_lambda_event_source_mapping.picasso_session_archiver[0]
  id = "9132fb62-9eb0-43cc-bb91-e15e75429752"
}

resource "aws_lambda_event_source_mapping" "picasso_session_archiver" {
  count = var.env == "staging" ? 1 : 0

  function_name                      = "picasso-session-archiver"
  event_source_arn                   = module.session_summaries.stream_arn
  starting_position                  = "TRIM_HORIZON"
  batch_size                         = 100
  maximum_retry_attempts             = 3
  maximum_batching_window_in_seconds = 5
  function_response_types            = ["ReportBatchItemFailures"]

  destination_config {
    on_failure {
      destination_arn = "arn:aws:sqs:us-east-1:525409062831:picasso-session-archiver-dlq"
    }
  }
}

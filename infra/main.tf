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

module "secrets_jwt_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/secrets-jwt-staging"
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

  # MYR test tenant KB — the only KB allowed for Issue #5 batch 2b.
  # Add more tenants here as they're enrolled in staging coverage.
  kb_arns = [
    "arn:aws:bedrock:us-east-1:614056832592:knowledge-base/0BQBWFYDMT",
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
  streaming_endpoint                = module.lambda_bedrock_handler_staging[0].function_url
}

# JWT secret resource policy — restricts read to the Master_Function exec
# role only. Defense-in-depth: the Lambda IAM policy already restricts
# access, but PowerUserAccess principals in the staging account would
# otherwise be able to read the signing key. Lives at root level (not in
# the secrets module) to avoid a circular dep with the Lambda module.
resource "aws_secretsmanager_secret_policy" "jwt_signing_key_staging" {
  count      = var.env == "staging" ? 1 : 0
  secret_arn = module.secrets_jwt_staging[0].secret_arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowMasterFunctionRoleOnly"
        Effect    = "Allow"
        Principal = { AWS = module.lambda_master_function_staging[0].role_arn }
        Action    = "secretsmanager:GetSecretValue"
        Resource  = "*"
      },
      {
        Sid          = "DenyAllOtherStagingPrincipals"
        Effect       = "Deny"
        NotPrincipal = { AWS = module.lambda_master_function_staging[0].role_arn }
        Action       = "secretsmanager:GetSecretValue"
        Resource     = "*"
      },
    ]
  })
}

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

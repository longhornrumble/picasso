# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 Tier 1 (production-only): BSH execution-role inline-policy grants.
#
# Adopts the SEVEN hand-made inline policies on the live, hand-managed prod role
# `Bedrock-Streaming-Handler-Role` into Terraform via `terraform import`
# (state-only — no resource change). These grants are the highest-churn surface
# on the role (3 were hand-mutated via `aws iam put-role-policy` in the
# 2026-06-04/05 Foster Village incident alone); version-controlling them routes
# future grant changes through PR → plan → gated apply instead of hand-CLI.
#
# SCOPE — surgical, IAM-only:
#   • This module manages ONLY the 7 `aws_iam_role_policy` resources, referencing
#     the role BY NAME (var.role_name). It does NOT manage the role resource
#     itself — the role's trust policy + any managed-policy attachments stay
#     hand-managed (they don't churn). The function + its env vars are Tier 2.
#   • Names mirror LIVE EXACTLY (role name, policy names, table ARNs). A faithful
#     import requires byte-equivalent policy documents → zero-change plan. Some
#     mirrored names are not yet naming-aligned (`picasso_form_submissions`
#     underscore, `picasso-tenant-registry-production`, `picasso-sms-usage`);
#     Terraform mirrors live as-is per the "mirror the environment value names
#     already present, don't translate" principle. Reconciling those names is the
#     separate naming-alignment program, not this adoption.
#
# Gated to production; imported, so the post-import plan is no-op beyond
# default_tags. Production applies stay -target-scoped (see main.tf header +
# docs/runbooks/prod-iac-tier1-bsh-iam.md).
# ─────────────────────────────────────────────────────────────────────────────

variable "role_name" {
  description = "Name of the hand-managed prod BSH execution role whose inline policies this module adopts. The role itself is NOT managed here — only its inline policies."
  type        = string
  default     = "Bedrock-Streaming-Handler-Role"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  ddb_prefix = "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table"
}

# Action is a single string in the live policy; mirror it for exact fidelity.
resource "aws_iam_role_policy" "clerk_secret_read" {
  name = "ClerkSecretRead"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "secretsmanager:GetSecretValue"
      Resource = "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:prod/clerk/picasso/secret_key-IVjCkY"
    }]
  })
}

resource "aws_iam_role_policy" "dynamodb_form_submissions" {
  name = "DynamoDBFormSubmissions"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
      ]
      Resource = [
        "${local.ddb_prefix}/picasso_form_submissions",
        "${local.ddb_prefix}/picasso_form_submissions/index/*",
        "${local.ddb_prefix}/picasso-sms-usage",
        "${local.ddb_prefix}/picasso-notification-sends",
      ]
    }]
  })
}

resource "aws_iam_role_policy" "dynamodb_session_summaries" {
  name = "DynamoDBSessionSummaries"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "SessionSummariesWrite"
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
      ]
      Resource = "${local.ddb_prefix}/picasso-session-summaries"
    }]
  })
}

resource "aws_iam_role_policy" "employee_registry_v2_read" {
  name = "EmployeeRegistryV2Read"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem",
        "dynamodb:Query",
      ]
      Resource = [
        "${local.ddb_prefix}/picasso-employee-registry",
        "${local.ddb_prefix}/picasso-employee-registry/index/*",
      ]
    }]
  })
}

resource "aws_iam_role_policy" "ses_send_email" {
  name = "SES-SendEmail"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ses:SendEmail",
        "ses:SendRawEmail",
      ]
      Resource = "*"
    }]
  })
}

# Action is a single string in the live policy; mirror it for exact fidelity.
resource "aws_iam_role_policy" "sqs_analytics_send" {
  name = "SQS-AnalyticsSend"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "sqs:SendMessage"
      Resource = "arn:aws:sqs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:picasso-analytics-events"
    }]
  })
}

resource "aws_iam_role_policy" "tenant_registry_read" {
  name = "TenantRegistryRead"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem",
        "dynamodb:Query",
      ]
      Resource = [
        "${local.ddb_prefix}/picasso-tenant-registry-production",
        "${local.ddb_prefix}/picasso-tenant-registry-production/index/*",
      ]
    }]
  })
}

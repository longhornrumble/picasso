# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 Tier 1 (production-only): MFS execution-role inline-policy grants.
#
# Adopts the 14 hand-made inline policies on the live, hand-managed prod role
# `Master_Function-role-zyux77wq` (path /service-role/) into Terraform via
# `terraform import` (state-only — no resource change). Mirrors the
# bsh-iam-grants-prod belt exactly.
#
# SCOPE — surgical, IAM-only:
#   - This module manages ONLY the 14 `aws_iam_role_policy` resources,
#     referencing the role BY NAME (var.role_name). It does NOT manage the
#     role resource itself — the role trust policy + 4 managed-policy
#     attachments stay hand-managed.
#   - Policy names mirror LIVE EXACTLY (case/hyphens/underscores preserved).
#     Documents are byte-identical to inline-policies.json (captured live).
#
# NOT MANAGED HERE (by design):
#   4 managed-policy attachments on this role:
#     AmazonS3ReadOnlyAccess           (arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess)
#     AmazonBedrockFullAccess          (arn:aws:iam::aws:policy/AmazonBedrockFullAccess)
#     AWSLambdaBasicExecutionRole-0c1b8cb6-a39a-44db-9d57-9ceeb28c7c8a
#     PICASSO-DynamoDB-Access-Policy   (arn:...:policy/PICASSO-DynamoDB-Access-Policy)
#   The role resource itself + trust policy (lambda.amazonaws.com AssumeRole).
#
# import IDs (operator-run; one per resource; see runbook):
#   aws_iam_role_policy.bedrock_permission        -> Master_Function-role-zyux77wq:bedrockPermission
#   aws_iam_role_policy.billing_events_write      -> Master_Function-role-zyux77wq:BillingEventsWrite
#   aws_iam_role_policy.dynamodb_blacklist_access -> Master_Function-role-zyux77wq:DynamoDBBlacklistAccess
#   aws_iam_role_policy.dynamodb_form_submissions -> Master_Function-role-zyux77wq:DynamoDBFormSubmissions
#   aws_iam_role_policy.dynamodb_pii_subject_index-> Master_Function-role-zyux77wq:DynamoDBPiiSubjectIndex
#   aws_iam_role_policy.dynamodb_production_access-> Master_Function-role-zyux77wq:DynamoDBProductionAccess
#   aws_iam_role_policy.employee_registry_v2_read -> Master_Function-role-zyux77wq:EmployeeRegistryV2Read
#   aws_iam_role_policy.picasso_analytics_sqs     -> Master_Function-role-zyux77wq:PicassoAnalyticsSQS
#   aws_iam_role_policy.picasso_write             -> Master_Function-role-zyux77wq:picassoWrite
#   aws_iam_role_policy.s3_access                 -> Master_Function-role-zyux77wq:s3_Access
#   aws_iam_role_policy.secrets_manager_access    -> Master_Function-role-zyux77wq:SecretsManagerAccess
#   aws_iam_role_policy.ses_send_email            -> Master_Function-role-zyux77wq:SES-SendEmail
#   aws_iam_role_policy.sms_consent_table_access  -> Master_Function-role-zyux77wq:SMSConsentTableAccess
#   aws_iam_role_policy.streaming_secrets_access  -> Master_Function-role-zyux77wq:StreamingSecretsAccess
# ─────────────────────────────────────────────────────────────────────────────

locals {
  count = var.env == "production" ? 1 : 0
}

# 1 of 14 — bedrockPermission
# Two statements: KB Retrieve/RetrieveAndGenerate + model InvokeModel.
# Resource list on InvokeModel mirrors live EXACTLY (5 ARNs including
# cross-region us-east-2 foundation-model and inference-profile wildcard).
resource "aws_iam_role_policy" "bedrock_permission" {
  count = local.count
  name  = "bedrockPermission"
  role  = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowBedrockKnowledgeBaseAccess"
        Effect = "Allow"
        Action = [
          "bedrock:Retrieve",
          "bedrock:RetrieveAndGenerate",
        ]
        Resource = [
          "arn:aws:bedrock:us-east-1:614056832592:knowledge-base/*",
        ]
      },
      {
        Sid    = "AllowBedrockModelInvoke"
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ]
        Resource = [
          "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0",
          "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-*",
          "arn:aws:bedrock:us-east-1::foundation-model/us.anthropic.claude-3-5-haiku-20241022-v1:0",
          "arn:aws:bedrock:us-east-1:614056832592:inference-profile/*",
          "arn:aws:bedrock:us-east-2::foundation-model/us.anthropic.claude-3-5-haiku-20241022-v1:0",
        ]
      },
    ]
  })
}

# 2 of 14 — BillingEventsWrite
# Single Statement object (not a list) in live policy; mirrored as a
# single-element list per jsonencode convention (functionally identical).
resource "aws_iam_role_policy" "billing_events_write" {
  count = local.count
  name  = "BillingEventsWrite"
  role  = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
      ]
      Resource = "arn:aws:dynamodb:us-east-1:614056832592:table/picasso-billing-events"
    }]
  })
}

# 3 of 14 — DynamoDBBlacklistAccess
# Note: resource scoped to picasso-token-blacklist-PRODUCTION (not the bare
# BLACKLIST_TABLE_NAME env var "picasso-token-blacklist"). Mirror live as-is.
resource "aws_iam_role_policy" "dynamodb_blacklist_access" {
  count = local.count
  name  = "DynamoDBBlacklistAccess"
  role  = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
      ]
      Resource = [
        "arn:aws:dynamodb:us-east-1:614056832592:table/picasso-token-blacklist-production",
        "arn:aws:dynamodb:us-east-1:614056832592:table/picasso-token-blacklist-production/index/*",
      ]
    }]
  })
}

# 4 of 14 — DynamoDBFormSubmissions
# Two table ARNs: picasso_form_submissions (underscore) + picasso-notification-sends.
resource "aws_iam_role_policy" "dynamodb_form_submissions" {
  count = local.count
  name  = "DynamoDBFormSubmissions"
  role  = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:UpdateItem",
      ]
      Resource = [
        "arn:aws:dynamodb:us-east-1:614056832592:table/picasso_form_submissions",
        "arn:aws:dynamodb:us-east-1:614056832592:table/picasso-notification-sends",
      ]
    }]
  })
}

# 5 of 14 — DynamoDBPiiSubjectIndex
# Single Statement with Sid. Resource is the base table only (no index/*).
resource "aws_iam_role_policy" "dynamodb_pii_subject_index" {
  count = local.count
  name  = "DynamoDBPiiSubjectIndex"
  role  = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "PiiSubjectIndexWrite"
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
      ]
      Resource = "arn:aws:dynamodb:us-east-1:614056832592:table/picasso-pii-subject-index"
    }]
  })
}

# 6 of 14 — DynamoDBProductionAccess
# Wildcard prefix patterns for production-* and picasso-*-production tables
# plus their index/* paths. Mirrors live exactly (both prefixes, both index paths).
resource "aws_iam_role_policy" "dynamodb_production_access" {
  count = local.count
  name  = "DynamoDBProductionAccess"
  role  = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:UpdateItem",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem",
      ]
      Resource = [
        "arn:aws:dynamodb:us-east-1:614056832592:table/production-*",
        "arn:aws:dynamodb:us-east-1:614056832592:table/production-*/index/*",
        "arn:aws:dynamodb:us-east-1:614056832592:table/picasso-*-production",
        "arn:aws:dynamodb:us-east-1:614056832592:table/picasso-*-production/index/*",
      ]
    }]
  })
}

# 7 of 14 — EmployeeRegistryV2Read
# Note: resource points to picasso-employee-registry-v2-STAGING (not prod).
# This is the live value — mirror as-is; naming alignment is a separate program.
resource "aws_iam_role_policy" "employee_registry_v2_read" {
  count = local.count
  name  = "EmployeeRegistryV2Read"
  role  = var.role_name
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
        "arn:aws:dynamodb:us-east-1:614056832592:table/picasso-employee-registry-v2-staging",
        "arn:aws:dynamodb:us-east-1:614056832592:table/picasso-employee-registry-v2-staging/index/*",
      ]
    }]
  })
}

# 8 of 14 — PicassoAnalyticsSQS
# Single string Resource (not a list) in live policy. jsonencode produces
# a string scalar here — matches the live document shape.
resource "aws_iam_role_policy" "picasso_analytics_sqs" {
  count = local.count
  name  = "PicassoAnalyticsSQS"
  role  = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "sqs:SendMessage",
        "sqs:SendMessageBatch",
      ]
      Resource = "arn:aws:sqs:us-east-1:614056832592:picasso-analytics-events"
    }]
  })
}

# 9 of 14 — picassoWrite (lowercase 'p' — preserve exactly)
# Action and Resource are both single strings in the live policy.
resource "aws_iam_role_policy" "picasso_write" {
  count = local.count
  name  = "picassoWrite"
  role  = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lex:RecognizeText"
      Resource = "arn:aws:lex:us-east-1:614056832592:bot-alias/JIPLY0F6CI/TSTALIASID"
    }]
  })
}

# 10 of 14 — s3_Access (underscore in name — preserve exactly)
# Sid present. Two resources: bucket + bucket/*.
resource "aws_iam_role_policy" "s3_access" {
  count = local.count
  name  = "s3_Access"
  role  = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AllowS3ConfigAccess"
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:ListBucket",
      ]
      Resource = [
        "arn:aws:s3:::myrecruiter-picasso",
        "arn:aws:s3:::myrecruiter-picasso/*",
      ]
    }]
  })
}

# 11 of 14 — SecretsManagerAccess
# Two wildcard ARN patterns (test-picasso/jwt + picasso/*/jwt). The trailing
# asterisk on each ARN matches the random suffix Secrets Manager appends.
resource "aws_iam_role_policy" "secrets_manager_access" {
  count = local.count
  name  = "SecretsManagerAccess"
  role  = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret",
      ]
      Resource = [
        "arn:aws:secretsmanager:us-east-1:614056832592:secret:test-picasso/jwt/signing-key*",
        "arn:aws:secretsmanager:us-east-1:614056832592:secret:picasso/*/jwt/signing-key*",
      ]
    }]
  })
}

# 12 of 14 — SES-SendEmail (hyphen in name — preserve exactly)
# Resource is "*" (pre-existing broad scope; mirror live as-is).
resource "aws_iam_role_policy" "ses_send_email" {
  count = local.count
  name  = "SES-SendEmail"
  role  = var.role_name
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

# 13 of 14 — SMSConsentTableAccess
# Single string Resource in live policy. PutItem + GetItem only (base table).
resource "aws_iam_role_policy" "sms_consent_table_access" {
  count = local.count
  name  = "SMSConsentTableAccess"
  role  = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
      ]
      Resource = "arn:aws:dynamodb:us-east-1:614056832592:table/picasso-sms-consent"
    }]
  })
}

# 14 of 14 — StreamingSecretsAccess
# Single Action string + single Resource string with wildcard suffix.
# Note: narrower than SecretsManagerAccess (no DescribeSecret; only the
# bare picasso/jwt/signing-key path without the test-picasso variant).
resource "aws_iam_role_policy" "streaming_secrets_access" {
  count = local.count
  name  = "StreamingSecretsAccess"
  role  = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
      ]
      Resource = "arn:aws:secretsmanager:us-east-1:614056832592:secret:picasso/jwt/signing-key*"
    }]
  })
}

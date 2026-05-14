# Phase B (BSH staging-twin): SMS_Sender + SMS_Webhook_Handler twin.
#
# Mirrors prod's SMS_Sender + SMS_Webhook_Handler Lambdas at staging-account
# 525409062831, with all data refs pointed at `*-staging`-suffixed twins
# (provisioned in Phase A). Telnyx isolation is via a SEPARATE Telnyx account
# (operator-provisioned; Telnyx Managed Accounts is explicitly NOT the right
# tool for prod/staging separation per their own docs Feb 2026).
#
# Both Lambdas are nodejs22.x to match prod's runtime (verified via
# aws lambda get-function-configuration on prod SMS_Sender + SMS_Webhook_Handler).
#
# Real code deploys via lambda-repo CI matrix (Phase B T3 PR); this module ships
# placeholder zips for first apply, then ignores code-side changes via
# lifecycle { ignore_changes = [filename, source_code_hash] }.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "notification_sends_table_arn" {
  description = "ARN of picasso-notification-sends-staging. SMS_Sender writes per-send rows."
  type        = string
}

variable "notification_sends_table_name" {
  type = string
}

variable "notification_events_table_arn" {
  description = "ARN of picasso-notification-events-staging. SMS_Webhook_Handler writes delivery events from Telnyx webhooks."
  type        = string
}

variable "notification_events_table_name" {
  type = string
}

variable "sms_consent_table_arn" {
  description = "ARN of picasso-sms-consent-staging. SMS_Sender reads consent records; SMS_Webhook_Handler queries phone-lookup GSI + updates consent on STOP/HELP keywords."
  type        = string
}

variable "sms_consent_table_name" {
  type = string
}

variable "sms_usage_table_arn" {
  description = "ARN of picasso-sms-usage-staging. SMS_Sender increments monthly per-tenant counter."
  type        = string
}

variable "sms_usage_table_name" {
  type = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30
}

# ------------------------------------------------------------------
# Common data sources
# ------------------------------------------------------------------

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

locals {
  prod_account_id = "614056832592"
}

# ------------------------------------------------------------------
# Telnyx secret (staging-account-local)
# ------------------------------------------------------------------
#
# Created with placeholder JSON values; operator updates with real API key +
# public key after standalone Telnyx account procurement (Phase B P-0).
# Lifecycle `ignore_changes = [secret_string]` prevents subsequent Terraform
# applies from reverting the operator's update.

resource "aws_secretsmanager_secret" "telnyx_staging" {
  name        = "picasso/telnyx-staging"
  description = "Telnyx API credentials for staging-account-local SMS twin. Separate Telnyx account from prod per Phase B isolation strategy."
}

resource "aws_secretsmanager_secret_version" "telnyx_staging_placeholder" {
  secret_id = aws_secretsmanager_secret.telnyx_staging.id
  secret_string = jsonencode({
    api_key              = "placeholder"
    public_key           = "placeholder"
    messaging_profile_id = "placeholder"
  })
  lifecycle {
    ignore_changes = [secret_string]
  }
}

# Defense-in-depth secret resource policy: only the two SMS Lambda roles can
# READ the secret value; everyone else explicitly denied for GetSecretValue.
# Describe/PutSecretValue/UpdateSecret remain governed by IAM identity policy
# so admins (SSO + Terraform deploy role) can populate the secret post-Telnyx-
# procurement via `aws secretsmanager put-secret-value`. Mirrors the BSH
# CF-origin secret pattern (Phase C.2 row 21).
resource "aws_secretsmanager_secret_policy" "telnyx_staging" {
  secret_arn = aws_secretsmanager_secret.telnyx_staging.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowSmsLambdaRolesOnly"
        Effect    = "Allow"
        Principal = { AWS = [aws_iam_role.sms_sender.arn, aws_iam_role.sms_webhook_handler.arn] }
        Action    = "secretsmanager:GetSecretValue"
        Resource  = "*"
      },
      {
        Sid       = "DenyAllOtherStagingPrincipalsRead"
        Effect    = "Deny"
        Principal = "*"
        Action    = "secretsmanager:GetSecretValue"
        Resource  = "*"
        Condition = {
          StringNotEquals = {
            "aws:PrincipalArn" = [aws_iam_role.sms_sender.arn, aws_iam_role.sms_webhook_handler.arn]
          }
        }
      }
    ]
  })
}

# =============================================================================
# SMS_Sender
# =============================================================================

# ------------------------------------------------------------------
# KMS for log group (Phase C.2 pattern)
# ------------------------------------------------------------------

data "aws_iam_policy_document" "sms_sender_logs_kms" {
  statement {
    sid     = "EnableRootAccount"
    actions = ["kms:*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
    resources = ["*"]
  }
  statement {
    sid = "AllowCloudWatchLogs"
    actions = [
      "kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*",
      "kms:GenerateDataKey*", "kms:DescribeKey",
    ]
    principals {
      type        = "Service"
      identifiers = ["logs.${data.aws_region.current.name}.amazonaws.com"]
    }
    resources = ["*"]
    condition {
      test     = "ArnEquals"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values = [
        "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/SMS_Sender",
      ]
    }
  }
}

resource "aws_kms_key" "sms_sender_logs" {
  description             = "CMK for SMS_Sender CloudWatch Logs (Phase B)"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  policy                  = data.aws_iam_policy_document.sms_sender_logs_kms.json
}

resource "aws_kms_alias" "sms_sender_logs" {
  name          = "alias/sms-sender-logs-staging"
  target_key_id = aws_kms_key.sms_sender_logs.key_id
}

# ------------------------------------------------------------------
# IAM
# ------------------------------------------------------------------

resource "aws_iam_role" "sms_sender" {
  name               = "SMS_Sender-role"
  assume_role_policy = data.aws_iam_policy_document.trust.json
  description        = "Execution role for staging-account SMS_Sender. Phase B twin."
}

data "aws_iam_policy_document" "sms_sender_exec" {
  statement {
    sid     = "Logs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/SMS_Sender:*",
    ]
  }

  statement {
    sid       = "TelnyxSecretRead"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["${aws_secretsmanager_secret.telnyx_staging.arn}*"]
  }

  statement {
    sid       = "NotificationSendsWrite"
    actions   = ["dynamodb:PutItem"]
    resources = [var.notification_sends_table_arn]
  }

  statement {
    sid       = "SmsConsentRead"
    actions   = ["dynamodb:GetItem"]
    resources = [var.sms_consent_table_arn]
  }

  statement {
    sid       = "SmsUsageUpdate"
    actions   = ["dynamodb:UpdateItem"]
    resources = [var.sms_usage_table_arn]
  }

  # Defense-in-depth: never touch any DynamoDB or Secrets Manager resource
  # in the prod account, even if an Allow rule is later widened by accident.
  # Account boundary is the primary control; this is belt-and-braces.
  statement {
    sid       = "DenyAllProdDynamoDB"
    effect    = "Deny"
    actions   = ["dynamodb:*"]
    resources = ["arn:aws:dynamodb:*:${local.prod_account_id}:*"]
  }

  statement {
    sid       = "DenyAllProdSecrets"
    effect    = "Deny"
    actions   = ["secretsmanager:*"]
    resources = ["arn:aws:secretsmanager:*:${local.prod_account_id}:*"]
  }
}

resource "aws_iam_role_policy" "sms_sender_exec" {
  name   = "exec-policy"
  role   = aws_iam_role.sms_sender.id
  policy = data.aws_iam_policy_document.sms_sender_exec.json
}

# ------------------------------------------------------------------
# Log group
# ------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "sms_sender" {
  name              = "/aws/lambda/SMS_Sender"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.sms_sender_logs.arn
}

# ------------------------------------------------------------------
# Lambda
# ------------------------------------------------------------------

data "archive_file" "sms_sender_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder-sender"
  output_path = "${path.module}/placeholder-sender.zip"
}

resource "aws_lambda_function" "sms_sender" {
  function_name = "SMS_Sender"
  role          = aws_iam_role.sms_sender.arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  memory_size   = 128
  timeout       = 30
  architectures = ["x86_64"]

  filename         = data.archive_file.sms_sender_placeholder.output_path
  source_code_hash = data.archive_file.sms_sender_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT              = "staging"
      TELNYX_SECRET_NAME       = aws_secretsmanager_secret.telnyx_staging.name
      NOTIFICATION_SENDS_TABLE = var.notification_sends_table_name
      SMS_CONSENT_TABLE        = var.sms_consent_table_name
      SMS_USAGE_TABLE          = var.sms_usage_table_name
      # WEBHOOK_BASE_URL populated post-deploy with the SMS_Webhook_Handler
      # Function URL (computed below). Set via lambda-repo CI matrix env_vars
      # to avoid a Terraform-side cycle.
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash, environment]
  }

  depends_on = [aws_cloudwatch_log_group.sms_sender, aws_iam_role_policy.sms_sender_exec]
}

# =============================================================================
# SMS_Webhook_Handler
# =============================================================================

# ------------------------------------------------------------------
# KMS for log group
# ------------------------------------------------------------------

data "aws_iam_policy_document" "sms_webhook_logs_kms" {
  statement {
    sid     = "EnableRootAccount"
    actions = ["kms:*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
    resources = ["*"]
  }
  statement {
    sid = "AllowCloudWatchLogs"
    actions = [
      "kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*",
      "kms:GenerateDataKey*", "kms:DescribeKey",
    ]
    principals {
      type        = "Service"
      identifiers = ["logs.${data.aws_region.current.name}.amazonaws.com"]
    }
    resources = ["*"]
    condition {
      test     = "ArnEquals"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values = [
        "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/SMS_Webhook_Handler",
      ]
    }
  }
}

resource "aws_kms_key" "sms_webhook_logs" {
  description             = "CMK for SMS_Webhook_Handler CloudWatch Logs (Phase B)"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  policy                  = data.aws_iam_policy_document.sms_webhook_logs_kms.json
}

resource "aws_kms_alias" "sms_webhook_logs" {
  name          = "alias/sms-webhook-handler-logs-staging"
  target_key_id = aws_kms_key.sms_webhook_logs.key_id
}

# ------------------------------------------------------------------
# IAM
# ------------------------------------------------------------------

resource "aws_iam_role" "sms_webhook_handler" {
  name               = "SMS_Webhook_Handler-role"
  assume_role_policy = data.aws_iam_policy_document.trust.json
  description        = "Execution role for staging-account SMS_Webhook_Handler. Phase B twin."
}

data "aws_iam_policy_document" "sms_webhook_exec" {
  statement {
    sid     = "Logs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/SMS_Webhook_Handler:*",
    ]
  }

  # TELNYX_PUBLIC_KEY is read from the secret (not env var) for staging,
  # tightening the prod pattern where it was a plaintext env var.
  statement {
    sid       = "TelnyxSecretRead"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["${aws_secretsmanager_secret.telnyx_staging.arn}*"]
  }

  statement {
    sid       = "NotificationEventsWrite"
    actions   = ["dynamodb:PutItem"]
    resources = [var.notification_events_table_arn]
  }

  statement {
    sid     = "SmsConsentReadWrite"
    actions = ["dynamodb:Query", "dynamodb:UpdateItem"]
    resources = [
      var.sms_consent_table_arn,
      "${var.sms_consent_table_arn}/index/phone-lookup",
    ]
  }

  statement {
    sid       = "DenyAllProdDynamoDB"
    effect    = "Deny"
    actions   = ["dynamodb:*"]
    resources = ["arn:aws:dynamodb:*:${local.prod_account_id}:*"]
  }

  statement {
    sid       = "DenyAllProdSecrets"
    effect    = "Deny"
    actions   = ["secretsmanager:*"]
    resources = ["arn:aws:secretsmanager:*:${local.prod_account_id}:*"]
  }
}

resource "aws_iam_role_policy" "sms_webhook_exec" {
  name   = "exec-policy"
  role   = aws_iam_role.sms_webhook_handler.id
  policy = data.aws_iam_policy_document.sms_webhook_exec.json
}

# ------------------------------------------------------------------
# Log group
# ------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "sms_webhook" {
  name              = "/aws/lambda/SMS_Webhook_Handler"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.sms_webhook_logs.arn
}

# ------------------------------------------------------------------
# Lambda + public Function URL (HMAC-gated in code via Ed25519 verification)
# ------------------------------------------------------------------

data "archive_file" "sms_webhook_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder-webhook"
  output_path = "${path.module}/placeholder-webhook.zip"
}

resource "aws_lambda_function" "sms_webhook_handler" {
  function_name = "SMS_Webhook_Handler"
  role          = aws_iam_role.sms_webhook_handler.arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  memory_size   = 128
  timeout       = 10
  architectures = ["x86_64"]

  filename         = data.archive_file.sms_webhook_placeholder.output_path
  source_code_hash = data.archive_file.sms_webhook_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT               = "staging"
      TELNYX_SECRET_NAME        = aws_secretsmanager_secret.telnyx_staging.name
      NOTIFICATION_EVENTS_TABLE = var.notification_events_table_name
      SMS_CONSENT_TABLE         = var.sms_consent_table_name
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash, environment]
  }

  depends_on = [aws_cloudwatch_log_group.sms_webhook, aws_iam_role_policy.sms_webhook_exec]
}

# Public Function URL — Telnyx POSTs delivery webhooks here. Auth is NONE
# at the URL layer; the handler verifies the Ed25519 signature on every
# request using TELNYX_PUBLIC_KEY from the secret. Requests with invalid
# signatures are rejected before any side effect.
resource "aws_lambda_function_url" "sms_webhook" {
  function_name      = aws_lambda_function.sms_webhook_handler.function_name
  authorization_type = "NONE"

  cors {
    allow_origins = ["*"]
    allow_methods = ["POST"]
    allow_headers = ["content-type", "telnyx-signature-ed25519", "telnyx-timestamp"]
    max_age       = 0
  }
}

# =============================================================================
# Outputs
# =============================================================================

output "sms_sender_function_arn" {
  value = aws_lambda_function.sms_sender.arn
}

output "sms_sender_function_name" {
  value = aws_lambda_function.sms_sender.function_name
}

output "sms_sender_role_arn" {
  value = aws_iam_role.sms_sender.arn
}

output "sms_webhook_handler_function_arn" {
  value = aws_lambda_function.sms_webhook_handler.arn
}

output "sms_webhook_handler_function_name" {
  value = aws_lambda_function.sms_webhook_handler.function_name
}

output "sms_webhook_handler_role_arn" {
  value = aws_iam_role.sms_webhook_handler.arn
}

output "sms_webhook_handler_function_url" {
  value = aws_lambda_function_url.sms_webhook.function_url
}

output "telnyx_secret_arn" {
  value = aws_secretsmanager_secret.telnyx_staging.arn
}

output "telnyx_secret_name" {
  value = aws_secretsmanager_secret.telnyx_staging.name
}

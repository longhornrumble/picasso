# Config-builder staging twin -- Picasso_Config_Manager Lambda + Function URL.
#
# The config-builder UI was twinned to staging frontend-first (S3 bucket
# picasso-config-builder-staging, build pushed 2026-06-11) but had NO backend in
# the staging account -- the build's default VITE_API_URL even pointed at the
# PROD Function URL, which cannot serve the staging config bucket across the
# account boundary. This module completes the twin: same code as prod's
# hand-managed Picasso_Config_Manager, pointed at myrecruiter-picasso-staging.
#
# Auth model mirrors prod: Function URL AuthType NONE + in-Lambda Clerk RS256
# JWT verification (auth.mjs, 'picasso-config' template). The SAME Clerk
# instance as prod is used deliberately -- operator identity is shared across
# environments; only the DATA (tenant configs) is account-isolated.
#
# Dedicated execution role per CLAUDE.md "Never share IAM roles" rule.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "config_bucket_name" {
  description = "Name of the staging tenant-config bucket (myrecruiter-picasso-staging). The Lambda does List/Get/Put/Delete under tenants/* (configs, drafts, backups, proposals) and mappings/*."
  type        = string
}

variable "clerk_jwks_url" {
  description = "Clerk JWKS endpoint for in-Lambda JWT verification. Same instance as prod (shared operator identity; data stays account-isolated)."
  type        = string
  default     = "https://clerk.config.myrecruiter.ai/.well-known/jwks.json"
}

variable "ops_alerts_topic_arn" {
  description = "ARN of picasso-ops-alerts-staging SNS topic. Errors alarm target."
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention. Phase C.2 default."
  type        = number
  default     = 90
}

# ------------------------------------------------------------------
# Data sources
# ------------------------------------------------------------------

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}

locals {
  config_bucket_arn = "arn:${data.aws_partition.current.partition}:s3:::${var.config_bucket_name}"
}

# ==============================================================================
# CloudWatch log group (KMS-encrypted per Phase C.2 pattern)
# ==============================================================================

resource "aws_kms_key" "config_manager_logs" {
  description             = "KMS key for Picasso_Config_Manager CloudWatch logs. Phase C.2 pattern; dedicated per-Lambda KMS key."
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnableRootAccount"
        Effect    = "Allow"
        Principal = { AWS = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "AllowCloudWatchLogsEncryption"
        Effect    = "Allow"
        Principal = { Service = "logs.${data.aws_region.current.name}.amazonaws.com" }
        Action = [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*",
        ]
        Resource = "*"
        Condition = {
          ArnEquals = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Picasso_Config_Manager"
          }
        }
      },
    ]
  })

  tags = {
    Name = "picasso-config-manager-logs-staging"
  }
}

resource "aws_kms_alias" "config_manager_logs" {
  name          = "alias/picasso-config-manager-logs-staging"
  target_key_id = aws_kms_key.config_manager_logs.key_id
}

resource "aws_cloudwatch_log_group" "config_manager" {
  name              = "/aws/lambda/Picasso_Config_Manager"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.config_manager_logs.arn
}

# ==============================================================================
# IAM execution role (dedicated)
# ==============================================================================

resource "aws_iam_role" "config_manager" {
  name                 = "Picasso_Config_Manager-exec-staging"
  permissions_boundary = var.permissions_boundary_arn

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

data "aws_iam_policy_document" "config_manager_exec" {
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.config_manager.arn}:*"]
  }

  # List tenants (CommonPrefixes scan under tenants/) + backups/drafts listings.
  statement {
    sid       = "S3ListConfigBucket"
    actions   = ["s3:ListBucket"]
    resources = [local.config_bucket_arn]
  }

  # Config CRUD: tenant configs, drafts, backups, proposals (tenants/*) and the
  # tenant-hash mapping objects (mappings/*). Object-scoped -- not the whole bucket.
  statement {
    sid     = "S3ConfigObjectsCrud"
    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = [
      "${local.config_bucket_arn}/tenants/*",
      "${local.config_bucket_arn}/mappings/*",
    ]
  }
}

resource "aws_iam_role_policy" "config_manager_exec" {
  name   = "config-manager-exec"
  role   = aws_iam_role.config_manager.id
  policy = data.aws_iam_policy_document.config_manager_exec.json
}

# ==============================================================================
# Lambda function (placeholder code; real handler deployed from the lambda repo)
# ==============================================================================

data "archive_file" "config_manager_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "config_manager" {
  function_name = "Picasso_Config_Manager"
  role          = aws_iam_role.config_manager.arn
  # Mirrors prod (nodejs22.x / 512MB / 30s -- ground-truthed 2026-06-11).
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  memory_size   = 512
  timeout       = 30
  architectures = ["x86_64"]

  filename         = data.archive_file.config_manager_placeholder.output_path
  source_code_hash = data.archive_file.config_manager_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT    = "staging"
      S3_BUCKET      = var.config_bucket_name
      CLERK_JWKS_URL = var.clerk_jwks_url
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code is deployed out-of-band (aws lambda update-function-code).
    # Env vars are Terraform-managed (NOT ignored).
    #
    # KNOWN HAZARD (same as the sender module): an apply triggered by a change
    # to a depended-on resource can re-deploy the placeholder zip OVER the real
    # code despite this ignore_changes. AFTER ANY apply that touches this
    # module, re-verify CodeSha256 and redeploy if it reverted.
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.config_manager, aws_iam_role_policy.config_manager_exec]
}

# Function URL -- AuthType NONE mirrors prod deliberately: authentication is
# enforced IN the Lambda (Clerk RS256 JWT, auth.mjs) on every route; the URL
# being public exposes only the 401 path. CORS * mirrors prod (the UI is served
# from an S3 website endpoint with no stable origin).
resource "aws_lambda_function_url" "config_manager" {
  function_name      = aws_lambda_function.config_manager.function_name
  authorization_type = "NONE"

  cors {
    allow_origins = ["*"]
    allow_methods = ["*"]
    allow_headers = ["authorization", "content-type"]
  }
}

# Required when AuthType is NONE: the public-invoke permission scoped to the URL.
resource "aws_lambda_permission" "config_manager_url_public" {
  statement_id           = "AllowPublicFunctionUrlInvoke"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.config_manager.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

# ==============================================================================
# CloudWatch alarm
# ==============================================================================

resource "aws_cloudwatch_metric_alarm" "config_manager_errors" {
  alarm_name          = "Picasso_Config_Manager-errors"
  alarm_description   = "Picasso_Config_Manager (staging config-api) Lambda errors >= 1 in any 5-minute period. The config-builder staging UI depends on this function. Investigate via /aws/lambda/Picasso_Config_Manager."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.config_manager.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# ==============================================================================
# Outputs
# ==============================================================================

output "function_name" {
  value = aws_lambda_function.config_manager.function_name
}

output "function_url" {
  description = "The staging config-api endpoint. The config-builder staging UI must be rebuilt with VITE_API_URL set to this."
  value       = aws_lambda_function_url.config_manager.function_url
}

output "role_arn" {
  value = aws_iam_role.config_manager.arn
}

variable "permissions_boundary_arn" {
  description = "ARN of the picasso-workload-boundary permission boundary (module.iam_workload_boundary). Caps this role's effective permissions to the intersection with the boundary. Null = no boundary (keeps the module usable standalone)."
  type        = string
  default     = null
  validation {
    condition     = var.permissions_boundary_arn == null || can(regex("^arn:aws:iam::[0-9]{12}:policy/", var.permissions_boundary_arn))
    error_message = "permissions_boundary_arn must be null or a valid IAM policy ARN."
  }
}

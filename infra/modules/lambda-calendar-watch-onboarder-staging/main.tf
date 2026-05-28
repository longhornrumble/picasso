# Scheduling sub-phase B Task B5 — Calendar_Watch_Onboarder Lambda.
#
# Registers an initial Google Calendar push-notification watch channel for a
# (tenant_id, coordinator_id, calendar_id) tuple. v1 pilot scale uses direct
# invocation (aws lambda invoke); the AdminEmployee DDB-stream trigger named
# in the B5 plan-row lands later when sub-phase E13 UI / F2 onboarding
# populates `scheduling_tags`.
#
# Per-invocation flow (handler details in
# Lambdas/lambda/Calendar_Watch_Onboarder/index.js):
#   1. Fetch OAuth client for (tenant_id, coordinator_id) from Secrets Manager
#   2. events.list paginated until nextSyncToken — seed last_sync_token
#   3. Generate channel_id + 256-bit channel_token
#   4. CreateSecret picasso/scheduling/channel-token/{channel_id}
#   5. events.watch — register the push channel with the Listener URL
#   6. PutItem on picasso-calendar-watch-channels-staging with the SHA-256
#      hash of the token (channel_token encryption Option 2)
#
# Dedicated execution role per CLAUDE.md "Never share IAM roles" rule
# (lambda#44 lesson).
#
# B1 audit row 13 carry-forward: secretsmanager:GetSecretValue is scoped to
# picasso/scheduling/oauth/* at v1 pilot scale. Before tenant #2 enters
# staging, the grant MUST be parameterized to picasso/scheduling/oauth/${tenantId}/*
# (either per-Lambda parameterized or tag-based ABAC via aws:PrincipalTag/tenantId).
# Same wildcard pattern as Listener; carry-forward at plan level.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "calendar_watch_channels_table_arn" {
  description = "ARN of picasso-calendar-watch-channels-staging. Onboarder PutItems a new row per channel registration; conditional on attribute_not_exists(channel_id)."
  type        = string
}

variable "calendar_watch_channels_table_name" {
  type = string
}

variable "listener_function_url" {
  description = "Public Function URL of the Calendar_Watch_Listener Lambda. Passed to Google events.watch as the push-notification target."
  type        = string
}

variable "ops_alerts_topic_arn" {
  description = "ARN of picasso-ops-alerts-staging SNS topic — receives Lambda errors alarm."
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

# ==============================================================================
# CloudWatch log group (KMS-encrypted per Phase C.2 pattern)
# ==============================================================================

resource "aws_kms_key" "onboarder_logs" {
  description             = "KMS key for Calendar_Watch_Onboarder CloudWatch logs. Phase C.2 pattern; dedicated per-Lambda KMS key."
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
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Calendar_Watch_Onboarder"
          }
        }
      },
    ]
  })

  tags = {
    Name     = "picasso-calendar-watch-onboarder-logs-staging"
    Subphase = "B5"
  }
}

resource "aws_kms_alias" "onboarder_logs" {
  name          = "alias/picasso-calendar-watch-onboarder-logs-staging"
  target_key_id = aws_kms_key.onboarder_logs.key_id
}

resource "aws_cloudwatch_log_group" "onboarder" {
  name              = "/aws/lambda/Calendar_Watch_Onboarder"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.onboarder_logs.arn
}

# ==============================================================================
# IAM execution role (dedicated per CLAUDE.md "Never share IAM roles" rule)
# ==============================================================================

resource "aws_iam_role" "onboarder" {
  name = "Calendar_Watch_Onboarder-exec-staging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Subphase = "B5"
  }
}

data "aws_iam_policy_document" "onboarder_exec" {
  # CloudWatch logs (group + streams)
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.onboarder.arn}:*"]
  }

  # DDB write on calendar-watch-channels — PutItem with attribute_not_exists
  # guard. No Query / GetItem here; the Onboarder only creates rows.
  statement {
    sid       = "DDBPutCalendarWatchChannels"
    actions   = ["dynamodb:PutItem"]
    resources = [var.calendar_watch_channels_table_arn]
  }

  # Secrets Manager read on scheduling OAuth secrets.
  # B1 audit row 13 carry-forward: wildcard ARN form is acceptable at v1 pilot
  # scale (one tenant). Before tenant #2 enters staging, this MUST be
  # parameterized to picasso/scheduling/oauth/${tenantId}/* via either
  # per-Lambda Terraform parameterization OR tag-based ABAC.
  statement {
    sid       = "SecretsReadSchedulingOAuth"
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = ["arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/*"]
  }

  # Secrets Manager write on channel-token secrets — one secret per channel
  # at picasso/scheduling/channel-token/{channel_id}. CreateSecret only; the
  # Listener reads via SHA-256-hash compare in DDB and never fetches the
  # raw token. B6 offboarding (future) gets the DeleteSecret grant.
  statement {
    sid       = "SecretsCreateChannelTokens"
    actions   = ["secretsmanager:CreateSecret", "secretsmanager:TagResource"]
    resources = ["arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/channel-token/*"]
  }
}

resource "aws_iam_role_policy" "onboarder_exec" {
  name   = "onboarder-exec"
  role   = aws_iam_role.onboarder.id
  policy = data.aws_iam_policy_document.onboarder_exec.json
}

# ==============================================================================
# Lambda function (placeholder code; real handler lands via lambda-repo CI)
# ==============================================================================

data "archive_file" "onboarder_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "onboarder" {
  function_name = "Calendar_Watch_Onboarder"
  role          = aws_iam_role.onboarder.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  memory_size   = 256
  # 30s allows events.list pagination + events.watch + DDB PutItem; a
  # runaway calendar with >50 pages is bounded inside the handler.
  timeout       = 30
  architectures = ["x86_64"]

  filename         = data.archive_file.onboarder_placeholder.output_path
  source_code_hash = data.archive_file.onboarder_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT                   = "staging"
      CALENDAR_WATCH_CHANNELS_TABLE = var.calendar_watch_channels_table_name
      LISTENER_URL                  = var.listener_function_url
      OAUTH_SECRET_PATH_PREFIX      = "picasso/scheduling/oauth"
      CHANNEL_TOKEN_SECRET_PREFIX   = "picasso/scheduling/channel-token"
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code lands via lambda-repo CI matrix (aws lambda update-function-code).
    # Env vars are Terraform-managed (NOT ignored — Phase D audit row #1).
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.onboarder, aws_iam_role_policy.onboarder_exec]
}

# ==============================================================================
# CloudWatch alarm (errors only — Onboarder has no public surface and is
# invoked manually for v1 pilot, so a single Errors alarm is sufficient.
# DLQ + malformed-payload alarms from the Listener pattern do not apply.)
# ==============================================================================

resource "aws_cloudwatch_metric_alarm" "onboarder_errors" {
  alarm_name          = "Calendar_Watch_Onboarder-errors"
  alarm_description   = "Calendar_Watch_Onboarder Lambda errors >= 1 in any 5-minute period. Investigate via CloudWatch logs: /aws/lambda/Calendar_Watch_Onboarder."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.onboarder.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# ==============================================================================
# Outputs
# ==============================================================================

output "onboarder_function_name" {
  value = aws_lambda_function.onboarder.function_name
}

output "onboarder_function_arn" {
  value = aws_lambda_function.onboarder.arn
}

output "onboarder_role_arn" {
  value = aws_iam_role.onboarder.arn
}

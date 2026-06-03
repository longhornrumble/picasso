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

variable "scheduling_oauth_tenant_ids" {
  description = "Tenant IDs whose OAuth secrets the Onboarder may read. The exec role's secretsmanager:GetSecretValue is scoped to picasso/scheduling/oauth/{tenant}/* for each — NOT a wildcard (closes B1 audit row 13). Adding tenant #2 = append here in a reviewed PR, not a silent wildcard grant."
  type        = list(string)
  default     = ["MYR384719"]
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

variable "tenant_config_bucket_arn" {
  description = "ARN of the staging tenant config S3 bucket. The scheduling feature gate reads tenants/{id}/config.json to check feature_flags.scheduling_enabled (fail-closed when unreadable)."
  type        = string
}

variable "config_bucket_name" {
  description = "Name of the staging tenant config S3 bucket (CONFIG_BUCKET env for the feature gate)."
  type        = string
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

  # Secrets Manager read on scheduling OAuth secrets — scoped PER TENANT, not
  # wildcard (closes B1 audit row 13 / phase-completion-audit G2). One ARN per
  # entry in var.scheduling_oauth_tenant_ids. A compromised invocation can only
  # reach the OAuth secrets of explicitly-listed tenants, not the whole
  # picasso/scheduling/oauth/* namespace. Adding tenant #2 is a reviewed PR that
  # appends to the var — there is no longer a silent "we'll tighten it later"
  # wildcard.
  statement {
    sid     = "SecretsReadSchedulingOAuth"
    actions = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [
      for t in var.scheduling_oauth_tenant_ids :
      "arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/${t}/*"
    ]
  }

  # NOTE: the Onboarder does NOT write channel-token secrets. The raw token is
  # handed to Google in events.watch and never stored at rest; only its SHA-256
  # hash lives in the DDB row (the Listener authenticates inbound pushes by
  # hashing X-Goog-Channel-Token and constant-time-comparing). Removing the
  # raw-token secret store (phase-completion-audit G6) eliminated the
  # CreateSecret grant and the picasso/scheduling/channel-token/* namespace.

  # Scheduling feature gate: read the tenant config to check feature_flags.scheduling_enabled
  # before onboarding a coordinator. Scoped to tenants/*/config.json - nothing else.
  statement {
    sid       = "ConfigBucketReadSchedulingGate"
    actions   = ["s3:GetObject"]
    resources = ["${var.tenant_config_bucket_arn}/tenants/*/config.json"]
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
  # 60s: events.list pages up to maxPages=50 (each a Google round-trip ~200-500ms)
  # before events.watch + DDB PutItem. 30s was too tight for a long-lived
  # coordinator calendar (phase-completion-audit G9/S1).
  timeout = 60
  # Cap concurrency: a future stream trigger or a scripted loop must NOT be able
  # to register unbounded Google channels (each is a live push subscription).
  # phase-completion-audit G18.
  reserved_concurrent_executions = 2
  architectures                  = ["x86_64"]

  filename         = data.archive_file.onboarder_placeholder.output_path
  source_code_hash = data.archive_file.onboarder_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT                   = "staging"
      CALENDAR_WATCH_CHANNELS_TABLE = var.calendar_watch_channels_table_name
      LISTENER_URL                  = var.listener_function_url
      OAUTH_SECRET_PATH_PREFIX      = "picasso/scheduling/oauth"
      CONFIG_BUCKET                 = var.config_bucket_name
      S3_CONFIG_BUCKET              = var.config_bucket_name
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code lands via lambda-repo CI matrix (aws lambda update-function-code).
    # Env vars are Terraform-managed (NOT ignored — Phase D audit row #1).
    #
    # KNOWN HAZARD (phase-completion-audit G8): despite this ignore_changes, a
    # `terraform apply` triggered by a change to a DEPENDED-ON resource (e.g.
    # the IAM policy below, or appending a tenant to scheduling_oauth_tenant_ids)
    # can re-deploy the placeholder zip OVER the real CI-deployed code — the
    # same regression empirically hit lambda-pii-dsar-staging on 2026-05-26.
    # AFTER ANY apply that touches this module, re-verify the live CodeSha256 is
    # NOT the placeholder and re-run the CI deploy if it is:
    #   aws lambda get-function-configuration --function-name Calendar_Watch_Onboarder \
    #     --query CodeSha256
    #   gh workflow run "Deploy Lambda — Staging" -f lambda=Calendar_Watch_Onboarder
    # Placeholder CodeSha256 = base64sha256 of placeholder/index.js (503 stub).
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

# Scheduling sub-phase B Task B3 (+ B4 schedule, B7 Renewer alarms) -
# Calendar_Watch_Renewer Lambda.
#
# Google Calendar watch channels expire (~7 days max). This Lambda runs on an
# EventBridge Scheduler cron (every ~6h, Task B4) and re-watches any channel
# approaching expiry so coordinator-side calendar changes keep flowing in.
#
# Per-run flow (handler details in Lambdas/lambda/Calendar_Watch_Renewer/index.js):
#   1. Query tenant-expiration-index GSI for rows with expiration <= now + buffer
#   2. For each: events.watch a FRESH channel (new UUID id + 256-bit token),
#      write the new row (SHA-256 hash only - channel_token encryption Option 2),
#      events.stop the old channel + delete the old row (best-effort)
#   3. On failure: flip the old row to unwatched_renewal_failed + emit the
#      CalendarWatchRenewalFailed metric; leave the old row for the next run
#      to retry (self-healing)
#   4. Emit a CalendarWatchRenewerRunCompleted heartbeat (dead-man's-switch)
#
# Dedicated execution role per CLAUDE.md "Never share IAM roles" rule
# (lambda#44 lesson). Per-tenant OAuth scope (phase-completion-audit G2); no
# channel-token store (G6); no OAuth process cache (G5, in handler).

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "calendar_watch_channels_table_arn" {
  description = "ARN of picasso-calendar-watch-channels-staging. Renewer Queries the tenant-expiration-index GSI and Put/Update/Deletes rows during renewal."
  type        = string
}

variable "calendar_watch_channels_table_name" {
  type = string
}

variable "listener_function_url" {
  description = "Public Function URL of the Calendar_Watch_Listener Lambda. Passed to Google events.watch as the push-notification target for the renewed channel."
  type        = string
}

variable "scheduling_oauth_tenant_ids" {
  description = "Tenant IDs whose OAuth secrets the Renewer may read AND whose channels it queries for renewal. The exec role's secretsmanager:GetSecretValue is scoped to picasso/scheduling/oauth/{tenant}/* for each - NOT a wildcard (closes B1 audit row 13 / G2). Also passed to the handler as SCHEDULING_TENANT_IDS. Adding tenant #2 = append here in a reviewed PR."
  type        = list(string)
  default     = ["MYR384719"]
}

variable "ops_alerts_topic_arn" {
  description = "ARN of picasso-ops-alerts-staging SNS topic - receives the three B7 Renewer alarms."
  type        = string
}

variable "renewal_schedule_expression" {
  description = "EventBridge Scheduler expression for the renewal cron. Default every 6 hours per canonical 14.1 (channels expire ~7d; 6h cadence gives ample slack)."
  type        = string
  default     = "rate(6 hours)"
}

variable "metric_namespace" {
  description = "CloudWatch namespace for the Renewer custom metrics (CalendarWatchRenewalFailed, CalendarWatchRenewerRunCompleted). Must match METRIC_NAMESPACE in the handler env."
  type        = string
  default     = "Picasso/Scheduling"
}

variable "renewal_buffer_ms" {
  description = "Renewal lookahead window in milliseconds (handler RENEWAL_BUFFER_MS). The cron renews any channel whose expiration is within this window of now. MUST be smaller than the Google channel lifetime (~7d) or every channel matches on every run = churn. Default 2 days: renews only in a channel's last ~2 days; the 6h cron gives ~8 attempts of margin."
  type        = number
  default     = 172800000
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

resource "aws_kms_key" "renewer_logs" {
  description             = "KMS key for Calendar_Watch_Renewer CloudWatch logs. Phase C.2 pattern; dedicated per-Lambda KMS key."
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
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Calendar_Watch_Renewer"
          }
        }
      },
    ]
  })

  tags = {
    Name     = "picasso-calendar-watch-renewer-logs-staging"
    Subphase = "B3"
  }
}

resource "aws_kms_alias" "renewer_logs" {
  name          = "alias/picasso-calendar-watch-renewer-logs-staging"
  target_key_id = aws_kms_key.renewer_logs.key_id
}

resource "aws_cloudwatch_log_group" "renewer" {
  name              = "/aws/lambda/Calendar_Watch_Renewer"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.renewer_logs.arn
}

# ==============================================================================
# IAM execution role (dedicated per CLAUDE.md "Never share IAM roles" rule)
# ==============================================================================

resource "aws_iam_role" "renewer" {
  name = "Calendar_Watch_Renewer-exec-staging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Subphase = "B3"
  }
}

data "aws_iam_policy_document" "renewer_exec" {
  # CloudWatch logs (group + streams)
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.renewer.arn}:*"]
  }

  # DDB Query on the tenant-expiration-index GSI to find expiring channels.
  # GSI queries require the index ARN; the base-table ARN is included so the
  # query path is unambiguous.
  statement {
    sid     = "DDBQueryExpiringChannels"
    actions = ["dynamodb:Query"]
    resources = [
      var.calendar_watch_channels_table_arn,
      "${var.calendar_watch_channels_table_arn}/index/tenant-expiration-index",
    ]
  }

  # DDB writes during renewal: PutItem (new channel row, conditional on
  # attribute_not_exists), UpdateItem (flip the old row to
  # unwatched_renewal_failed), DeleteItem (remove the old row after the
  # replacement is live).
  statement {
    sid       = "DDBWriteCalendarWatchChannels"
    actions   = ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem"]
    resources = [var.calendar_watch_channels_table_arn]
  }

  # Secrets Manager read on scheduling OAuth secrets - scoped PER TENANT, not
  # wildcard (closes B1 audit row 13 / G2). One ARN per entry in
  # var.scheduling_oauth_tenant_ids. Same posture as the Onboarder (picasso#271).
  statement {
    sid     = "SecretsReadSchedulingOAuth"
    actions = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [
      for t in var.scheduling_oauth_tenant_ids :
      "arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/${t}/*"
    ]
  }

  # CloudWatch custom metrics. PutMetricData has no resource-level scoping, so
  # restrict by namespace condition to the Renewer's own metric namespace.
  statement {
    sid       = "CloudWatchPutSchedulingMetrics"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = [var.metric_namespace]
    }
  }
}

resource "aws_iam_role_policy" "renewer_exec" {
  name   = "renewer-exec"
  role   = aws_iam_role.renewer.id
  policy = data.aws_iam_policy_document.renewer_exec.json
}

# ==============================================================================
# Lambda function (placeholder code; real handler lands via lambda-repo CI)
# ==============================================================================

data "archive_file" "renewer_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "renewer" {
  function_name = "Calendar_Watch_Renewer"
  role          = aws_iam_role.renewer.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  memory_size   = 256
  # 120s: each expiring channel costs events.watch + events.stop + 2-3 DDB
  # writes (a few Google round-trips). Ample for v1 pilot pool size; the
  # canonical "100 channels < 60s" perf target is deferred until pool escalates.
  timeout = 120
  # Concurrency 1: the cron must never run concurrently with itself - a
  # double-fire would let two runs renew the same expiring channel and create
  # duplicate Google channels (G7-adjacent). Single-flight by construction.
  reserved_concurrent_executions = 1
  architectures                  = ["x86_64"]

  filename         = data.archive_file.renewer_placeholder.output_path
  source_code_hash = data.archive_file.renewer_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT                   = "staging"
      CALENDAR_WATCH_CHANNELS_TABLE = var.calendar_watch_channels_table_name
      LISTENER_URL                  = var.listener_function_url
      OAUTH_SECRET_PATH_PREFIX      = "picasso/scheduling/oauth"
      SCHEDULING_TENANT_IDS         = jsonencode(var.scheduling_oauth_tenant_ids)
      METRIC_NAMESPACE              = var.metric_namespace
      # 2-day lookahead (must be < the ~7d Google channel lifetime, else the 6h
      # cron renews every channel every run). The handler also defaults to 7d if
      # this is unset, but staging sets it explicitly here.
      RENEWAL_BUFFER_MS = tostring(var.renewal_buffer_ms)
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code lands via lambda-repo CI matrix (aws lambda update-function-code).
    # Env vars are Terraform-managed (NOT ignored - Phase D audit row #1).
    #
    # KNOWN HAZARD (phase-completion-audit G8): despite this ignore_changes, a
    # `terraform apply` triggered by a change to a DEPENDED-ON resource (e.g.
    # the IAM policy below, or appending a tenant to scheduling_oauth_tenant_ids)
    # can re-deploy the placeholder zip OVER the real CI-deployed code - the same
    # regression empirically hit lambda-pii-dsar-staging on 2026-05-26. AFTER ANY
    # apply that touches this module, re-verify the live CodeSha256 is NOT the
    # placeholder and re-run the CI deploy if it is:
    #   aws lambda get-function-configuration --function-name Calendar_Watch_Renewer \
    #     --query CodeSha256
    #   gh workflow run "Deploy Lambda - Staging" -f lambda=Calendar_Watch_Renewer
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.renewer, aws_iam_role_policy.renewer_exec]
}

# ==============================================================================
# EventBridge Scheduler (Task B4) - cron that invokes the Renewer
#
# EventBridge SCHEDULER (not the default event bus) per the B4 decision: no
# rule-count ceiling, per-invocation targets. Dedicated invoke role.
# ==============================================================================

resource "aws_iam_role" "renewer_scheduler" {
  name = "Calendar_Watch_Renewer-scheduler-staging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = {
          "aws:SourceAccount" = data.aws_caller_identity.current.account_id
        }
      }
    }]
  })

  tags = {
    Subphase = "B4"
  }
}

data "aws_iam_policy_document" "renewer_scheduler_invoke" {
  statement {
    sid       = "InvokeRenewer"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.renewer.arn]
  }
}

resource "aws_iam_role_policy" "renewer_scheduler_invoke" {
  name   = "renewer-scheduler-invoke"
  role   = aws_iam_role.renewer_scheduler.id
  policy = data.aws_iam_policy_document.renewer_scheduler_invoke.json
}

resource "aws_scheduler_schedule" "renewer" {
  name        = "picasso-calendar-watch-renewer-staging"
  description = "Invokes Calendar_Watch_Renewer to re-watch Google Calendar channels approaching expiry (Task B4)."
  group_name  = "default"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = var.renewal_schedule_expression
  schedule_expression_timezone = "UTC"

  target {
    arn      = aws_lambda_function.renewer.arn
    role_arn = aws_iam_role.renewer_scheduler.arn
    # Empty payload: the handler reads SCHEDULING_TENANT_IDS + RENEWAL_BUFFER_MS
    # from env on a cron invocation.
    input = jsonencode({})

    retry_policy {
      maximum_retry_attempts = 2
    }
  }
}

# ==============================================================================
# CloudWatch alarms (Task B7 - the three Renewer alarms, all to ops topic)
# ==============================================================================

# B7.1 - Lambda errors on the Renewer.
resource "aws_cloudwatch_metric_alarm" "renewer_errors" {
  alarm_name          = "Calendar_Watch_Renewer-errors"
  alarm_description   = "Calendar_Watch_Renewer Lambda errors >= 1 in any 5-minute period (handler threw - bad env, query failure, or unexpected crash). Investigate via /aws/lambda/Calendar_Watch_Renewer."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.renewer.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# B7.2 - Renewal-failure count. The handler emits CalendarWatchRenewalFailed
# (Provider=google) whenever a channel could not be renewed and its row was
# flipped to unwatched_renewal_failed.
resource "aws_cloudwatch_metric_alarm" "renewer_renewal_failed" {
  alarm_name          = "Calendar_Watch_Renewer-renewal-failed"
  alarm_description   = "A Google Calendar watch channel failed to renew (row flipped to unwatched_renewal_failed). The channel will lapse unless a later run recovers it. Investigate via /aws/lambda/Calendar_Watch_Renewer (event=channel_renewal_failed)."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  treat_missing_data  = "notBreaching"

  metric_name = "CalendarWatchRenewalFailed"
  namespace   = var.metric_namespace
  period      = 300
  statistic   = "Sum"

  dimensions = {
    Provider = "google"
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# B7.3 - Cron dead-man's-switch. The handler emits a
# CalendarWatchRenewerRunCompleted heartbeat (no dimensions) at the end of
# every run. If no heartbeat lands within 7h (cron is every 6h, so 7h gives one
# missed cycle of slack), the schedule or the Lambda has stopped firing.
# treat_missing_data=breaching makes "no data point" trip the alarm.
resource "aws_cloudwatch_metric_alarm" "renewer_dead_mans_switch" {
  alarm_name          = "Calendar_Watch_Renewer-missed-run"
  alarm_description   = "Calendar_Watch_Renewer has not logged a successful run in >7h (cron is every 6h). The EventBridge Scheduler or the Lambda has stopped firing; watch channels will silently lapse. Investigate the schedule picasso-calendar-watch-renewer-staging and /aws/lambda/Calendar_Watch_Renewer."
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "breaching"

  metric_name = "CalendarWatchRenewerRunCompleted"
  namespace   = var.metric_namespace
  period      = 25200 # 7 hours
  statistic   = "Sum"

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# ==============================================================================
# Outputs
# ==============================================================================

output "renewer_function_name" {
  value = aws_lambda_function.renewer.function_name
}

output "renewer_function_arn" {
  value = aws_lambda_function.renewer.arn
}

output "renewer_role_arn" {
  value = aws_iam_role.renewer.arn
}

output "renewer_schedule_arn" {
  value = aws_scheduler_schedule.renewer.arn
}

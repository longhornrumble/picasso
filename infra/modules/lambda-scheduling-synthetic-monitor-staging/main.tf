# WS-E-CI6 -- Scheduling_Synthetic_Monitor Lambda + EventBridge rules (ACTIVATION).
#
# The monitor code (lambda repo, Scheduling_Synthetic_Monitor/) has been on main since
# lambda#245 (Phase-1) + #283 (S5 reminder cycle) but was never provisioned -- this module
# is the operator-gated activation. Spec: Scheduling_Synthetic_Monitor/INFRA_NOTES.md
# (the worker's integrator brief) -- the IAM table, timeouts, and EventBridge cadence
# below follow it exactly.
#
# Cycles: cancel (hourly), reminder (daily -- proves EventBridge -> Scheduled_Message_Sender
# -> pending->sent), cleanup (nightly), revocation_observe (operator-invoked, no rule).
#
# Burn-in tenant: MYR384719 (scheduling_enabled, test-coordinator OAuth grant live).
#
# SECURITY (INFRA_NOTES "REQUIRED, not optional"): every DynamoDB and lambda:InvokeFunction
# grant carries aws:ResourceAccount = <staging account>. This is the only non-code backstop
# for the test-mode-OFF case -- without it, a misprovisioned role could reach prod tables.
# Do NOT remove these conditions.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "booking_commit_function_arn" {
  description = "ARN of the staging Booking_Commit_Handler (propose/commit/cancel target)."
  type        = string
}

variable "booking_commit_function_name" {
  type = string
}

variable "booking_table_arn" {
  description = "ARN of picasso-booking-staging. GetItem/UpdateItem/DeleteItem/Query on the BASE table only (no GSI -- the monitor queries by PK)."
  type        = string
}

variable "booking_table_name" {
  type = string
}

variable "scheduled_messages_table_arn" {
  description = "ARN of picasso-scheduled-messages. The reminder cycle Queries the base table AND the by-appointment GSI (read-only)."
  type        = string
}

variable "scheduled_messages_table_name" {
  type = string
}

variable "ops_alerts_topic_arn" {
  description = "ARN of picasso-ops-alerts-staging. The monitor publishes cycle-failure alerts itself (alerts.js)."
  type        = string
}

variable "synthetic_tenant_id" {
  description = "The staging burn-in tenant (scheduling_enabled + live coordinator OAuth grant)."
  type        = string
  default     = "MYR384719"
}

variable "log_retention_days" {
  type    = number
  default = 90
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

resource "aws_kms_key" "monitor_logs" {
  description             = "KMS key for Scheduling_Synthetic_Monitor CloudWatch logs. Phase C.2 pattern; dedicated per-Lambda KMS key."
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
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Scheduling_Synthetic_Monitor"
          }
        }
      },
    ]
  })

  tags = {
    Name = "picasso-scheduling-synthetic-monitor-logs-staging"
  }
}

resource "aws_kms_alias" "monitor_logs" {
  name          = "alias/picasso-scheduling-synthetic-monitor-logs-staging"
  target_key_id = aws_kms_key.monitor_logs.key_id
}

resource "aws_cloudwatch_log_group" "monitor" {
  name              = "/aws/lambda/Scheduling_Synthetic_Monitor"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.monitor_logs.arn
}

# ==============================================================================
# IAM execution role (dedicated; built from the INFRA_NOTES table ONLY --
# deliberately NO Secrets Manager / Google / SES / scheduler grants)
# ==============================================================================

resource "aws_iam_role" "monitor" {
  name = "Scheduling_Synthetic_Monitor-exec-staging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

data "aws_iam_policy_document" "monitor_exec" {
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.monitor.arn}:*"]
  }

  # propose / commit / cancel against BCH. ResourceAccount condition REQUIRED (test-mode-OFF
  # backstop -- see module header).
  statement {
    sid       = "InvokeBookingCommitHandler"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.booking_commit_function_arn]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  # Booking table: read-back, stamp is_synthetic, nightly cleanup. Base table only.
  statement {
    sid       = "DDBBookingSyntheticLifecycle"
    actions   = ["dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"]
    resources = [var.booking_table_arn]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  # Reminder cycle: observe the pending->sent flip. READ-ONLY (Query), base + by-appointment GSI.
  statement {
    sid     = "DDBScheduledMessagesReadOnly"
    actions = ["dynamodb:Query"]
    resources = [
      var.scheduled_messages_table_arn,
      "${var.scheduled_messages_table_arn}/index/by-appointment",
    ]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  # Cycle success/failure metrics, namespace-scoped.
  statement {
    sid       = "PutCycleMetrics"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["Picasso/SchedulingSynthetic"]
    }
  }

  statement {
    sid       = "PublishOpsAlerts"
    actions   = ["sns:Publish"]
    resources = [var.ops_alerts_topic_arn]
  }
}

resource "aws_iam_role_policy" "monitor_exec" {
  name   = "scheduling-synthetic-monitor-exec"
  role   = aws_iam_role.monitor.id
  policy = data.aws_iam_policy_document.monitor_exec.json
}

# ==============================================================================
# Lambda function (placeholder code; real handler deployed via lambda-repo CI)
# ==============================================================================

data "archive_file" "monitor_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "monitor" {
  function_name = "Scheduling_Synthetic_Monitor"
  role          = aws_iam_role.monitor.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  memory_size   = 256
  # INFRA_NOTES: the reminder cycle polls ~7min (42 x 10s) for the compressed reminder to
  # fire -- timeout MUST be >= ~480s. EventBridge invokes asynchronously.
  timeout       = 500
  architectures = ["x86_64"]

  filename         = data.archive_file.monitor_placeholder.output_path
  source_code_hash = data.archive_file.monitor_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT = "staging"
      # Phase-2 time-compression flag (prod-guard input). The compression that gates the
      # reminder cycle runs inside BCH (its env, set in the BCH module) -- this one feeds
      # the monitor's own prod-guard. Double-gated by is_synthetic on the commit payload.
      STAGING_TEST_MODE   = "true"
      SYNTHETIC_TENANT_ID = var.synthetic_tenant_id
      # BCH takes the appointment type FROM the event (no registry) -- a stable label id.
      SYNTHETIC_APPOINTMENT_TYPE_ID = "synthetic-monitor-check"
      # Explicit per INFRA_NOTES (the bare-name alignment program may break the fallback).
      BOOKING_TABLE                = var.booking_table_name
      SCHEDULED_MESSAGES_TABLE     = var.scheduled_messages_table_name
      BOOKING_COMMIT_FUNCTION_NAME = var.booking_commit_function_name
      REDEMPTION_BASE_URL          = "https://staging.schedule.myrecruiter.ai"
      OPS_ALERTS_TOPIC_ARN         = var.ops_alerts_topic_arn
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code lands via lambda-repo CI. Env vars are Terraform-managed (NOT ignored).
    # KNOWN HAZARD (same as sibling modules): an apply triggered by a depended-on resource
    # can re-deploy the placeholder OVER real code despite ignore_changes. After ANY apply
    # touching this module, re-verify CodeSha256 and redeploy if reverted.
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.monitor, aws_iam_role_policy.monitor_exec]
}

# ==============================================================================
# EventBridge rules (cadence per INFRA_NOTES)
# ==============================================================================

locals {
  cycles = {
    cancel   = { schedule = "rate(1 hour)", input = { cycle = "cancel" } }
    reminder = { schedule = "cron(0 8 * * ? *)", input = { cycle = "reminder" } }
    cleanup  = { schedule = "cron(0 7 * * ? *)", input = { cycle = "cleanup" } }
  }
}

resource "aws_cloudwatch_event_rule" "cycle" {
  for_each            = local.cycles
  name                = "synthetic-monitor-${each.key}-staging"
  description         = "Scheduling_Synthetic_Monitor ${each.key} cycle (WS-E-CI6)."
  schedule_expression = each.value.schedule
}

resource "aws_cloudwatch_event_target" "cycle" {
  for_each = local.cycles
  rule     = aws_cloudwatch_event_rule.cycle[each.key].name
  arn      = aws_lambda_function.monitor.arn
  input    = jsonencode(each.value.input)
}

resource "aws_lambda_permission" "cycle" {
  for_each      = local.cycles
  statement_id  = "AllowEventBridge-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.monitor.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.cycle[each.key].arn
}

# ==============================================================================
# Errors alarm (the monitor also self-alerts via SNS; this catches crashes)
# ==============================================================================

resource "aws_cloudwatch_metric_alarm" "monitor_errors" {
  alarm_name          = "Scheduling_Synthetic_Monitor-errors"
  alarm_description   = "Scheduling_Synthetic_Monitor Lambda errors >= 1 in 15 minutes. A crashed cycle means the synthetic coverage is silently OFF. Investigate /aws/lambda/Scheduling_Synthetic_Monitor."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  period      = 900
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.monitor.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# ==============================================================================
# Outputs
# ==============================================================================

output "function_name" {
  value = aws_lambda_function.monitor.function_name
}

output "role_arn" {
  value = aws_iam_role.monitor.arn
}

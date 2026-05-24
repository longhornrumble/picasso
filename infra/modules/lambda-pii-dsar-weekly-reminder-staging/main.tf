# DSAR Weekly Reminder — M9.G6 (master plan v0.12). Closes D5 F-DSAR22.
#
# Belt-and-suspenders secondary control for the primary SLA monitor
# (lambda-pii-dsar-sla-monitor-staging). Independent of the primary:
# dedicated Lambda, dedicated IAM role, separate EventBridge schedule.
# Publishes a static reminder + two copy-pasteable CLI snippets to the
# existing ops-alerts SNS topic every Monday at 14:00 UTC.
#
# Pattern mirrors lambda-pii-dsar-sla-monitor-staging:
#   - Dedicated IAM role (per CLAUDE.md "Never share IAM roles")
#   - CloudWatch log group
#   - aws_lambda_function with placeholder zip + lifecycle ignore_changes
#     (real code via `aws lambda update-function-code` from
#      Lambdas/lambda/picasso_pii_dsar_weekly_reminder_staging/)
#   - EventBridge scheduled rule (weekly) → invoke Lambda
#   - Reuses ops-alerts SNS topic from ops-alarms-master-function-staging
#     (input var)
#
# SCOPE (least-privilege; deliberately narrower than the primary monitor):
#   - SNS Publish on the input topic ARN (single topic; no wildcards)
#   - CloudWatch Logs create/write on THIS Lambda's log group only
#   - NO DynamoDB access at all (the operator runs the audit table CLI
#     themselves — that's what keeps this control independent of the
#     primary monitor's DDB surface)
#   - NO CloudWatch metrics read access (same independence rationale)
#   - NO Decrypt on PII CMK (no PII handled)
#
# DELIBERATE ABSENCES:
#   - NO permission to invoke any other Lambda
#   - NO permission on any DDB table
#   - NO PII in the message body (D1 redaction posture; verified by
#     `test_message_no_consumer_pii` in the Lambda's unit tests)

variable "ops_sns_topic_arn" {
  description = "ARN of the existing ops-alerts SNS topic (output from ops-alarms-master-function-staging). Reminder publishes to this topic; operator email subscription wired via Console."
  type        = string
}

variable "log_retention_days" {
  description = "Log retention. Matches the SLA monitor default (14d) for operational consistency."
  type        = number
  default     = 14
}

variable "schedule_expression" {
  description = "EventBridge schedule for the weekly reminder. Default: Mondays at 14:00 UTC (~9am ET) — lands in operator inbox at start-of-week. Cron is in UTC."
  type        = string
  default     = "cron(0 14 ? * MON *)"
}

variable "sla_monitor_function_name" {
  description = "Function name of the primary SLA monitor. Interpolated into the reminder body's CloudWatch CLI snippet."
  type        = string
  default     = "picasso-pii-dsar-sla-monitor-staging"
}

variable "audit_table_name" {
  description = "Audit table name. Interpolated into the reminder body's DDB CLI snippet."
  type        = string
  default     = "picasso-pii-dsar-audit-staging"
}

variable "sla_days_intake_plus" {
  description = "Days past intake at which a DSAR is at risk. Mirrors the primary monitor's threshold."
  type        = number
  default     = 25
}

variable "playbook_url" {
  description = "Operator playbook URL — referenced in the reminder body."
  type        = string
  default     = "https://github.com/longhornrumble/picasso/blob/staging/docs/roadmap/PII-Project/dsar-operator-playbook.md"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  acct          = data.aws_caller_identity.current.account_id
  region        = data.aws_region.current.name
  function_name = "picasso-pii-dsar-weekly-reminder-staging"
  role_name     = "picasso-pii-dsar-weekly-reminder-staging-role"
}

# ─────────────────────────────────────────────────────────────────────────────
# IAM role: dedicated execution role per CLAUDE.md.
# Trust: Lambda service.
# Policy: SNS Publish on ops topic + CloudWatch Logs.
# ─────────────────────────────────────────────────────────────────────────────
data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "reminder" {
  name               = local.role_name
  assume_role_policy = data.aws_iam_policy_document.trust.json
}

data "aws_iam_policy_document" "reminder" {
  # Standard Lambda execution: CW log create/write on this Lambda's group only
  statement {
    sid = "LambdaLogging"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:${local.region}:${local.acct}:log-group:/aws/lambda/${local.function_name}:*"]
  }

  # SNS Publish on the single ops topic only. No wildcards.
  statement {
    sid       = "OpsAlertsPublish"
    actions   = ["sns:Publish"]
    resources = [var.ops_sns_topic_arn]
  }
}

resource "aws_iam_role_policy" "reminder" {
  name   = "${local.function_name}-policy"
  role   = aws_iam_role.reminder.id
  policy = data.aws_iam_policy_document.reminder.json
}

# ─────────────────────────────────────────────────────────────────────────────
# Lambda function: placeholder zip + lifecycle ignore_changes.
# Real code at Lambdas/lambda/picasso_pii_dsar_weekly_reminder_staging/
# deploys via `aws lambda update-function-code` (CLAUDE.md SOP).
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "reminder" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
}

data "archive_file" "placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "reminder" {
  function_name = local.function_name
  role          = aws_iam_role.reminder.arn
  runtime       = "python3.11"
  handler       = "lambda_function.lambda_handler"
  memory_size   = 128 # minimal; the work is just one SNS publish
  timeout       = 30
  architectures = ["x86_64"]

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment {
    variables = {
      SNS_TOPIC_ARN             = var.ops_sns_topic_arn
      PLAYBOOK_URL              = var.playbook_url
      SLA_MONITOR_FUNCTION_NAME = var.sla_monitor_function_name
      AUDIT_TABLE               = var.audit_table_name
      SLA_DAYS_INTAKE_PLUS      = tostring(var.sla_days_intake_plus)
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code deploys via `aws lambda update-function-code` from
    # Lambdas/lambda/picasso_pii_dsar_weekly_reminder_staging/.
    # Terraform must not revert the deployed bundle on re-apply.
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.reminder, aws_iam_role_policy.reminder]
}

# ─────────────────────────────────────────────────────────────────────────────
# EventBridge scheduled rule: weekly Monday 14:00 UTC.
# Pattern: cron(min hour day-of-month month day-of-week year) — all UTC.
# Default Monday 14:00 UTC = 09:00 ET (10:00 EDT) — start-of-week operator
# window so the reminder lands first thing.
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_event_rule" "weekly_reminder" {
  name                = "${local.function_name}-weekly"
  description         = "Weekly belt-and-suspenders reminder for DSAR SLA monitor. Invokes ${local.function_name} which publishes operator-facing health-check instructions to the ops-alerts SNS topic. Independent of the primary daily SLA monitor."
  schedule_expression = var.schedule_expression
}

resource "aws_cloudwatch_event_target" "weekly_reminder" {
  rule      = aws_cloudwatch_event_rule.weekly_reminder.name
  target_id = "InvokeWeeklyReminder"
  arn       = aws_lambda_function.reminder.arn
}

resource "aws_lambda_permission" "eventbridge_invoke" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.reminder.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.weekly_reminder.arn
}

# ─────────────────────────────────────────────────────────────────────────────
# M9.G7 / F-DSAR26 — Lambda Errors CloudWatch alarm.
#
# Mirrors the SLA monitor module's alarm (M9.G7). The weekly reminder is
# itself a secondary control; if IT silently fails, the operator loses the
# belt-and-suspenders independence guarantee. Alarms publish to the same
# ops-alerts SNS topic; operator triages via the Lambda's own README +
# CloudWatch logs.
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "reminder_errors" {
  alarm_name        = "${local.function_name}-errors"
  alarm_description = "M9.G7 / F-DSAR26: weekly reminder Lambda Errors metric > 0. If the secondary control silently fails, the M9.G6 independence guarantee is broken. Publishes to ops-alerts."

  namespace   = "AWS/Lambda"
  metric_name = "Errors"
  statistic   = "Sum"
  period      = 300
  dimensions = {
    FunctionName = aws_lambda_function.reminder.function_name
  }

  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  # Lambda runs weekly; most 5-min windows have no data. treat-missing as
  # not-breaching avoids constant alarms during idle periods.
  treat_missing_data = "notBreaching"

  alarm_actions = [var.ops_sns_topic_arn]
  # Sprint E5 / audit nice-to-have N18: ok_actions removed — see SLA monitor
  # module for the doubled-notification rationale.

  tags = {
    Project = "pii-governance"
    Owner   = "chris@myrecruiter.ai"
    Source  = "M9.G7 / F-DSAR26"
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Sprint E3 / audit defer-ok D1 — Lambda Invocations CloudWatch alarm.
#
# Mirrors the SLA monitor module's Invocations alarm. The weekly reminder runs
# weekly (cron Mondays 14:00 UTC). 9 consecutive 24h missing-data windows
# (1 week schedule + 2 day grace) breaches and pages ops. Catches the
# EventBridge-disable case that the Errors alarm cannot detect.
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "reminder_invocations" {
  alarm_name        = "${local.function_name}-invocations"
  alarm_description = "Sprint E3 / audit D1: weekly reminder Lambda Invocations < 1 over 9 consecutive 24h windows (1wk schedule + 2d grace). Catches EventBridge-disable case which the Errors alarm cannot detect."

  namespace   = "AWS/Lambda"
  metric_name = "Invocations"
  statistic   = "Sum"
  period      = 86400 # 1 day (max CW alarm period)
  dimensions = {
    FunctionName = aws_lambda_function.reminder.function_name
  }

  threshold           = 1
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 9 # 7d schedule + 2d grace
  treat_missing_data  = "breaching"

  alarm_actions = [var.ops_sns_topic_arn]

  tags = {
    Project = "pii-governance"
    Owner   = "chris@myrecruiter.ai"
    Source  = "Sprint E3 / audit D1"
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Outputs
# ─────────────────────────────────────────────────────────────────────────────
output "function_name" {
  value = aws_lambda_function.reminder.function_name
}

output "function_arn" {
  value = aws_lambda_function.reminder.arn
}

output "role_arn" {
  value = aws_iam_role.reminder.arn
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.reminder.name
}

output "event_rule_arn" {
  value = aws_cloudwatch_event_rule.weekly_reminder.arn
}

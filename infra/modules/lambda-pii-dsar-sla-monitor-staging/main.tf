# DSAR SLA Monitor — M3 done-bar #1 (master plan v0.3 §M3). Closes D5 G-D.
#
# Pattern mirrors lambda-pii-dsar-staging:
#   - Dedicated IAM role (per CLAUDE.md "Never share IAM roles across Lambdas")
#   - CloudWatch log group
#   - aws_lambda_function with placeholder zip + lifecycle ignore_changes
#     (real code via `aws lambda update-function-code` from
#      Lambdas/lambda/picasso_pii_dsar_sla_monitor_staging/)
#   - EventBridge scheduled rule (daily) → invoke Lambda
#   - Reuses ops-alarms SNS topic from ops-alarms-master-function-staging (input var)
#
# SCOPE (least-privilege; mirrors lambda-pii-dsar-staging convention):
#   - DDB Query on picasso-pii-dsar-audit-staging (StatusIndex GSI + main table)
#   - SNS Publish on the input topic ARN (single topic; no wildcards)
#   - NO PutItem on audit table (preserves C2 4-action Deny posture even at IAM level)
#   - NO Decrypt on PII CMK (audit table uses default DDB SSE pending M7 F-DSAR-C2-SSE-DEFER)
#
# DELIBERATE ABSENCES:
#   - NO permission to invoke the DSAR Lambda (this monitor only reads + publishes)
#   - NO permission on any non-audit DDB table (scope guard)
#   - NO write to dsar-log.md (that's an operator-controlled file)

variable "dsar_audit_table_arn" {
  description = "ARN of picasso-pii-dsar-audit-staging. Monitor Queries main table (PK=dsar_id) + StatusIndex GSI (PK=status, SK=event_timestamp)."
  type        = string
}

variable "ops_sns_topic_arn" {
  description = "ARN of the existing ops-alerts SNS topic (output from ops-alarms-master-function-staging). Monitor publishes SLA-at-risk alerts to this topic; operator email subscription wired manually via Console."
  type        = string
}

variable "log_retention_days" {
  description = "Log retention. Matches DSAR Lambda default (14d) for operational consistency."
  type        = number
  default     = 14
}

variable "schedule_expression" {
  description = "EventBridge schedule for the SLA monitor. Default: daily at 14:00 UTC (~9am ET). Cron is in UTC."
  type        = string
  default     = "cron(0 14 * * ? *)"
}

variable "sla_days_intake_plus" {
  description = "DSAR alarm threshold in days from intake. Default 25 = 5 days before the conservative 30-day combined CCPA/GDPR SLA target. Adjust per counsel-Q1 (G-I) response if it refines the SLA posture."
  type        = number
  default     = 25
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  acct           = data.aws_caller_identity.current.account_id
  region         = data.aws_region.current.name
  function_name  = "picasso-pii-dsar-sla-monitor-staging"
  role_name      = "picasso-pii-dsar-sla-monitor-staging-role"
  audit_table_id = element(split("/", var.dsar_audit_table_arn), 1) # "picasso-pii-dsar-audit-staging"
}

# ─────────────────────────────────────────────────────────────────────────────
# IAM role: dedicated execution role per CLAUDE.md.
# Trust: Lambda service.
# Policy: scoped read on audit table + SNS Publish on ops topic.
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

resource "aws_iam_role" "monitor" {
  name               = local.role_name
  assume_role_policy = data.aws_iam_policy_document.trust.json
}

data "aws_iam_policy_document" "monitor" {
  # Standard Lambda execution: CW log create/write on this Lambda's group only
  statement {
    sid = "LambdaLogging"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:${local.region}:${local.acct}:log-group:/aws/lambda/${local.function_name}:*"]
  }

  # Read on audit table: main table (PK=dsar_id Query) + StatusIndex GSI Query
  # Explicit table ARN + the StatusIndex GSI sub-ARN; no wildcards on the index name.
  statement {
    sid = "AuditTableReadOnly"
    actions = [
      "dynamodb:Query",
      "dynamodb:DescribeTable",
    ]
    resources = [
      var.dsar_audit_table_arn,
      "${var.dsar_audit_table_arn}/index/StatusIndex",
    ]
  }

  # SNS Publish on the single ops topic only. No wildcards.
  statement {
    sid       = "OpsAlertsPublish"
    actions   = ["sns:Publish"]
    resources = [var.ops_sns_topic_arn]
  }
}

resource "aws_iam_role_policy" "monitor" {
  name   = "${local.function_name}-policy"
  role   = aws_iam_role.monitor.id
  policy = data.aws_iam_policy_document.monitor.json
}

# ─────────────────────────────────────────────────────────────────────────────
# Lambda function: placeholder zip + lifecycle ignore_changes.
# Real code at Lambdas/lambda/picasso_pii_dsar_sla_monitor_staging/ deploys
# via `aws lambda update-function-code` (CLAUDE.md SOP).
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "monitor" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
}

data "archive_file" "placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "monitor" {
  function_name = local.function_name
  role          = aws_iam_role.monitor.arn
  runtime       = "python3.11"
  handler       = "lambda_function.lambda_handler"
  memory_size   = 128 # minimal; scan is small
  timeout       = 60
  architectures = ["x86_64"]

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment {
    variables = {
      AUDIT_TABLE          = local.audit_table_id
      SLA_DAYS_INTAKE_PLUS = tostring(var.sla_days_intake_plus)
      SNS_TOPIC_ARN        = var.ops_sns_topic_arn
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code deploys via `aws lambda update-function-code` from
    # Lambdas/lambda/picasso_pii_dsar_sla_monitor_staging/.
    # Terraform must not revert the deployed bundle on re-apply.
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.monitor, aws_iam_role_policy.monitor]
}

# ─────────────────────────────────────────────────────────────────────────────
# EventBridge scheduled rule: daily invocation.
# Pattern: cron(min hour day-of-month month day-of-week year) — all UTC.
# Default 14:00 UTC = 09:00 ET (10am EDT in summer) — operator window.
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_event_rule" "daily_sla_check" {
  name                = "${local.function_name}-daily"
  description         = "Daily DSAR SLA scan. Invokes ${local.function_name} which Queries audit table for open DSARs past intake+${var.sla_days_intake_plus}d and publishes SNS alert on findings."
  schedule_expression = var.schedule_expression
}

resource "aws_cloudwatch_event_target" "daily_sla_check" {
  rule      = aws_cloudwatch_event_rule.daily_sla_check.name
  target_id = "InvokeSlaMonitor"
  arn       = aws_lambda_function.monitor.arn
}

resource "aws_lambda_permission" "eventbridge_invoke" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.monitor.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_sla_check.arn
}

# ─────────────────────────────────────────────────────────────────────────────
# Outputs
# ─────────────────────────────────────────────────────────────────────────────
output "function_name" {
  value = aws_lambda_function.monitor.function_name
}

output "function_arn" {
  value = aws_lambda_function.monitor.arn
}

output "role_arn" {
  value = aws_iam_role.monitor.arn
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.monitor.name
}

output "event_rule_arn" {
  value = aws_cloudwatch_event_rule.daily_sla_check.arn
}

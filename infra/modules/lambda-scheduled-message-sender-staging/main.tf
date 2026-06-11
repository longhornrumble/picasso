# Track 1 S6 — Scheduled_Message_Sender Lambda (the EventBridge Scheduler target).
#
# Receives a single reminder row from the per-booking EventBridge schedule,
# reads the attendee's SMS consent from picasso-sms-consent, marks the
# scheduled-messages row as dispatched (UpdateItem), then dispatches via the
# email floor (send_email Lambda) and optionally the SMS supplement (SMS_Sender
# twin, when selectChannels permits — WS-E-TCPA gate).
#
# This is the SCHEDULE TARGET. Its ARN is passed as the target on every
# scheduler:CreateSchedule call by BCH + the reconciler. The EventBridge
# Scheduler exec role (in lambda-reminder-scheduler-staging) holds
# lambda:InvokeFunction on this function's ARN only.
#
# Dedicated execution role per CLAUDE.md "Never share IAM roles" rule.
# No JWT secret, no OAuth — this function only needs the send_email + SMS_Sender
# invoke grants + the two DDB reads.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "scheduled_messages_table_arn" {
  description = "ARN of picasso-scheduled-messages. Sender does GetItem (load row) + UpdateItem (mark dispatched)."
  type        = string
}

variable "scheduled_messages_table_name" {
  type = string
}

variable "sms_consent_table_arn" {
  description = "ARN of picasso-sms-consent (no -staging suffix). Sender does GetItem of the attendee consent record (pre-filter; fail-safe -> SMS suppressed if absent). Must be the SAME table SMS_Sender re-checks."
  type        = string
}

variable "sched_notif_template_table_arn" {
  description = "ARN of picasso-scheduling-notif-template (E14). Sender does GetItem of the per-tenant reminder_24h/reminder_1h override at FIRE time (S4b). Read-only; fail-safe -> default copy on miss/error."
  type        = string
}

variable "sched_notif_template_table_name" {
  type = string
}

variable "sms_consent_table_name" {
  type = string
}

variable "send_email_function_name" {
  description = "Name of the reusable send_email Lambda. Sender invokes it (async) for the email-floor reminder. Scoped to exactly this function ARN."
  type        = string
  default     = "send_email"
}

variable "sms_sender_function_arn" {
  description = "ARN of the staging SMS_Sender twin. Sender async-invokes it for the SMS supplement (TCPA-gated). Scoped to exactly this ARN -- no wildcard."
  type        = string
}

variable "sms_sender_function_name" {
  type = string
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

# ==============================================================================
# CloudWatch log group (KMS-encrypted per Phase C.2 pattern)
# ==============================================================================

resource "aws_kms_key" "sender_logs" {
  description             = "KMS key for Scheduled_Message_Sender CloudWatch logs. Phase C.2 pattern; dedicated per-Lambda KMS key."
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
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Scheduled_Message_Sender"
          }
        }
      },
    ]
  })

  tags = {
    Name     = "picasso-scheduled-message-sender-logs-staging"
    Subphase = "S6"
  }
}

resource "aws_kms_alias" "sender_logs" {
  name          = "alias/picasso-scheduled-message-sender-logs-staging"
  target_key_id = aws_kms_key.sender_logs.key_id
}

resource "aws_cloudwatch_log_group" "sender" {
  name              = "/aws/lambda/Scheduled_Message_Sender"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.sender_logs.arn
}

# ==============================================================================
# IAM execution role (dedicated per CLAUDE.md "Never share IAM roles" rule)
# ==============================================================================

resource "aws_iam_role" "sender" {
  name = "Scheduled_Message_Sender-exec-staging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Subphase = "S6"
  }
}

data "aws_iam_policy_document" "sender_exec" {
  # CloudWatch logs (group + streams)
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.sender.arn}:*"]
  }

  # Scheduled-messages table: GetItem (load the reminder row) + UpdateItem
  # (mark as dispatched after the send_email/SMS_Sender invokes succeed).
  # Base table only -- no GSI/Query needed by the sender path.
  statement {
    sid       = "DDBScheduledMessagesReadWrite"
    actions   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
    resources = [var.scheduled_messages_table_arn]
  }

  # SMS consent pre-filter: GetItem of the attendee's transactional-SMS consent
  # record before the selectChannels gate decides whether to invoke SMS_Sender.
  # Read-only, base table only. Fail-safe: a miss/error suppresses SMS (email floor stands).
  # The SMS_Sender twin re-checks the SAME record server-side.
  statement {
    sid       = "DDBReadSmsConsent"
    actions   = ["dynamodb:GetItem"]
    resources = [var.sms_consent_table_arn]
  }

  # E14 S4b: per-tenant template override read at fire time. GetItem only, base
  # table only (key {tenantId, moment}). Mirrors the ADA/BCH/lifecycle G2 read
  # posture. Fail-safe in code: a miss/denial sends the default copy.
  statement {
    sid       = "DDBReadSchedNotifTemplate"
    actions   = ["dynamodb:GetItem"]
    resources = [var.sched_notif_template_table_arn]
  }

  # Email floor: async-invoke the reusable send_email Lambda. Scoped to exactly
  # that function ARN -- no wildcard. Mirrors the BCH/consumer grant posture.
  statement {
    sid       = "InvokeSendEmail"
    actions   = ["lambda:InvokeFunction"]
    resources = ["arn:${data.aws_partition.current.partition}:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:${var.send_email_function_name}"]
  }

  # SMS supplement: async-invoke the SMS_Sender twin (TCPA-gated via selectChannels).
  # Scoped to exactly that function ARN -- no wildcard. Mirrors the BCH G7b grant.
  statement {
    sid       = "InvokeSmsSender"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.sms_sender_function_arn]
  }
}

resource "aws_iam_role_policy" "sender_exec" {
  name   = "scheduled-message-sender-exec"
  role   = aws_iam_role.sender.id
  policy = data.aws_iam_policy_document.sender_exec.json
}

# ==============================================================================
# Lambda function (placeholder code; real handler lands via lambda-repo CI)
#
# The real bundle is dist/index.mjs (ESM). The placeholder is also .mjs so the
# Lambda runtime accepts the handler index.handler. handler = "index.handler"
# is correct for both the placeholder and the real ESM bundle.
# ==============================================================================

data "archive_file" "sender_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "sender" {
  function_name = "Scheduled_Message_Sender"
  role          = aws_iam_role.sender.arn
  runtime       = "nodejs20.x"
  # index.handler works for both the ESM placeholder and the real dist/index.mjs.
  handler     = "index.handler"
  memory_size = 256
  # Each invocation is a single reminder row: one DDB GetItem + one send_email
  # async invoke (fast, <5s). 30s provides headroom for SMS_Sender cold starts.
  timeout       = 30
  architectures = ["x86_64"]

  filename         = data.archive_file.sender_placeholder.output_path
  source_code_hash = data.archive_file.sender_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT              = "staging"
      SCHEDULED_MESSAGES_TABLE = var.scheduled_messages_table_name
      SMS_CONSENT_TABLE        = var.sms_consent_table_name
      SMS_SENDER_FUNCTION      = var.sms_sender_function_name
      SEND_EMAIL_FUNCTION      = var.send_email_function_name
      # E14 S4b: per-tenant reminder template overrides, read at fire time.
      # The code treats an unset/empty value as override-system-off (fail-safe).
      SCHED_NOTIF_TEMPLATE_TABLE = var.sched_notif_template_table_name
      # STAGING_TEST_MODE is consumed by the sender's assertNotProdSynthetic guard
      # (mirrors Reminder_Scheduler). Set "true" so staging synthetic cycles can
      # exercise the sender without hitting Telnyx/SES unintentionally (operator Q4).
      STAGING_TEST_MODE = "true"
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code lands via lambda-repo CI matrix (aws lambda update-function-code).
    # Env vars are Terraform-managed (NOT ignored).
    #
    # KNOWN HAZARD (sibling-module phase-audit G8): despite this ignore_changes, a
    # `terraform apply` triggered by a change to a DEPENDED-ON resource (the IAM
    # policy or a new env var) can re-deploy the placeholder zip OVER the real
    # CI-deployed code. AFTER ANY apply that touches this module, re-verify:
    #   aws lambda get-function-configuration --function-name Scheduled_Message_Sender \
    #     --query CodeSha256
    #   gh workflow run "Deploy Lambda - Staging" -f lambda=Scheduled_Message_Sender
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.sender, aws_iam_role_policy.sender_exec]
}

# ==============================================================================
# CloudWatch alarm
# ==============================================================================

resource "aws_cloudwatch_metric_alarm" "sender_errors" {
  alarm_name          = "Scheduled_Message_Sender-errors"
  alarm_description   = "Scheduled_Message_Sender Lambda errors >= 1 in any 5-minute period. A failed sender invocation means a volunteer did not receive their reminder. Investigate via /aws/lambda/Scheduled_Message_Sender."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.sender.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# ==============================================================================
# Outputs
# ==============================================================================

output "sender_function_name" {
  value = aws_lambda_function.sender.function_name
}

output "sender_function_arn" {
  value = aws_lambda_function.sender.arn
}

output "sender_role_arn" {
  value = aws_iam_role.sender.arn
}

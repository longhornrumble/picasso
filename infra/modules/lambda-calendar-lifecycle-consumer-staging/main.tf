# Scheduling sub-phase B/§14.2 — Calendar_Lifecycle_Consumer Lambda.
#
# SQS consumer of the calendar-lifecycle events the Calendar_Watch_Listener
# dispatches, fanned out through the SNS topic (sns-calendar-watch-fanout-staging)
# so this queue only receives the §14.2 lifecycle types this consumer owns
# (event_deleted, event_moved, channel-degrade signals). It reconciles the Booking
# row against the calendar truth and, via gap-C Y, sends the volunteer notice:
#   - event_deleted → reconcileDeleted: Booking.status → canceled + (Y) cancel_notice
#     with a §13.4 signed reschedule link. **This is the path B11's cancel depends on.**
#   - event_moved   → reconcileMoved: (Y) move_optin_sms (SMS stub, inert today).
#   - channel-degrade → mark the watch-channel row + ops-alert (channel-degrade.js).
# Handler + tests live in Lambdas/lambda/Calendar_Lifecycle_Consumer (lambda#196 +
# the gap-C Y wire in lambda#201, MERGED). This module is the integrator-owned IaC.
#
# Dedicated execution role per CLAUDE.md "Never share IAM roles" (lambda#44). NO wildcards.
#
# IAM scoped to ACTUAL merged-code usage (ground-truthed against
# origin/main:Calendar_Lifecycle_Consumer/{booking-store,booking-reconcile,channel-degrade}.js):
#   - DynamoDB Booking table: GetItem (getNoticeContext) + UpdateItem (reconcile status).
#   - DynamoDB channels table: UpdateItem (channel-degrade.js marks the watch-channel row).
#   - Lambda: InvokeFunction on send_email ONLY (Y cancel_notice; async).
#   - Secrets: GetSecretValue on the JWT signing key ONLY (§13.4 reschedule-link sign()).
#   - SNS: Publish to ops-alerts (channel-degrade best-effort alert).
#   - SQS: consume from the fan-out lifecycle-consumer queue (SSE-SQS; no KMS grant).
# NOTE vs the sibling Calendar_Event_Consumer (B9 reoffer): this consumer does NOT
# re-resolve the candidate pool — no appointment-type / routing-policy / employee-registry
# reads. The cancel/move notice uses only the booking row's own context.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "booking_table_arn" {
  description = "ARN of picasso-booking-staging. GetItem (getNoticeContext) + conditional UpdateItem (reconcileDeleted/Moved status transition)."
  type        = string
}

variable "booking_table_name" {
  type = string
}

variable "channels_table_arn" {
  description = "ARN of picasso-calendar-watch-channels-staging. channel-degrade.js does UpdateItem on the watch-channel row (degrade marking). UpdateItem only."
  type        = string
}

variable "channels_table_name" {
  type = string
}

variable "scheduling_notif_template_table_arn" {
  description = "ARN of picasso-scheduling-notif-template-staging. notify.js GetItem (tenantId, moment) for the §E14 tenant template override at dispatch (cancel/reschedule notices). Fail-safe: a miss/error uses the local default."
  type        = string
}

variable "scheduling_notif_template_table_name" {
  type = string
}

variable "send_email_function_name" {
  description = "Name of the reusable send_email Lambda the (Y) cancel_notice invokes (async). The exec role is granted lambda:InvokeFunction on exactly this function ARN."
  type        = string
  default     = "send_email"
}

variable "source_queue_arn" {
  description = "ARN of picasso-calendar-lifecycle-consumer-staging.fifo (from the fan-out module). The event-source-mapping polls it; the exec role consumes it."
  type        = string
}

variable "ops_alerts_topic_arn" {
  description = "ARN of picasso-ops-alerts-staging SNS topic. channel-degrade.js publishes degrade alerts here (OPS_ALERTS_TOPIC_ARN env), and the Errors alarm targets it."
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

resource "aws_kms_key" "consumer_logs" {
  description             = "KMS key for Calendar_Lifecycle_Consumer CloudWatch logs. Phase C.2 pattern; dedicated per-Lambda KMS key."
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
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Calendar_Lifecycle_Consumer"
          }
        }
      },
    ]
  })

  tags = {
    Name     = "picasso-calendar-lifecycle-consumer-logs-staging"
    Subphase = "B-cal-lifecycle"
  }
}

resource "aws_kms_alias" "consumer_logs" {
  name          = "alias/picasso-calendar-lifecycle-consumer-logs-staging"
  target_key_id = aws_kms_key.consumer_logs.key_id
}

resource "aws_cloudwatch_log_group" "consumer" {
  name              = "/aws/lambda/Calendar_Lifecycle_Consumer"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.consumer_logs.arn
}

# ==============================================================================
# IAM execution role (dedicated per CLAUDE.md "Never share IAM roles" rule)
# ==============================================================================

resource "aws_iam_role" "consumer" {
  name = "Calendar_Lifecycle_Consumer-exec-staging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Subphase = "B-cal-lifecycle"
  }
}

data "aws_iam_policy_document" "consumer_exec" {
  # CloudWatch logs (group + streams)
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.consumer.arn}:*"]
  }

  # Booking table: GetItem (getNoticeContext) + conditional UpdateItem (reconcile status).
  statement {
    sid       = "DDBBookingReadWrite"
    actions   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
    resources = [var.booking_table_arn]
  }

  # §E14: notify.js point-reads the tenant's notification-template override at dispatch.
  statement {
    sid       = "DDBReadSchedulingNotifTemplate"
    actions   = ["dynamodb:GetItem"]
    resources = [var.scheduling_notif_template_table_arn]
  }

  # Watch-channels table: channel-degrade.js UpdateItem on the channel row. UpdateItem only.
  statement {
    sid       = "DDBChannelsDegrade"
    actions   = ["dynamodb:UpdateItem"]
    resources = [var.channels_table_arn]
  }

  # gap C (Y wire): invoke the reusable send_email Lambda (async) for the cancel_notice.
  # Scoped to EXACTLY the send_email function ARN (no wildcard).
  statement {
    sid       = "InvokeSendEmail"
    actions   = ["lambda:InvokeFunction"]
    resources = ["arn:${data.aws_partition.current.partition}:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:${var.send_email_function_name}"]
  }

  # gap C (token wire): read the shared JWT signing key to mint the §13.4 reschedule link
  # in the cancel_notice (iss claim isolates scheduling tokens from chat-session JWTs).
  # Scoped to the signing-key secret only. NOTE: the secret's resource-policy Deny also
  # gates this — this role MUST be in the jwt_signing_key_staging allowlist in main.tf.
  statement {
    sid       = "SecretsReadJwtSigningKey"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/staging/jwt/signing-key-*"]
  }

  # SNS: channel-degrade best-effort ops alert.
  statement {
    sid       = "SNSPublishOpsAlerts"
    actions   = ["sns:Publish"]
    resources = [var.ops_alerts_topic_arn]
  }

  # SQS consume from the fan-out lifecycle-consumer queue. SSE-SQS (AWS-managed key),
  # so no kms:Decrypt grant is required here.
  statement {
    sid = "SQSConsumeLifecycleQueue"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
    ]
    resources = [var.source_queue_arn]
  }

  # X-Ray write — required for tracing_config mode=Active to emit segments.
  statement {
    sid       = "XRayWrite"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "consumer_exec" {
  name   = "calendar-lifecycle-consumer-exec"
  role   = aws_iam_role.consumer.id
  policy = data.aws_iam_policy_document.consumer_exec.json
}

# ==============================================================================
# Lambda function (placeholder code; real handler lands via lambda-repo CI)
# ==============================================================================

data "archive_file" "consumer_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "consumer" {
  function_name                  = "Calendar_Lifecycle_Consumer"
  role                           = aws_iam_role.consumer.arn
  runtime                        = "nodejs20.x"
  handler                        = "index.handler"
  memory_size                    = 256
  timeout                        = 30
  reserved_concurrent_executions = 5
  architectures                  = ["x86_64"]

  filename         = data.archive_file.consumer_placeholder.output_path
  source_code_hash = data.archive_file.consumer_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT                   = "staging"
      BOOKING_TABLE                 = var.booking_table_name
      CALENDAR_WATCH_CHANNELS_TABLE = var.channels_table_name
      OPS_ALERTS_TOPIC_ARN          = var.ops_alerts_topic_arn
      SCHED_NOTIF_TEMPLATE_TABLE    = var.scheduling_notif_template_table_name
      SEND_EMAIL_FUNCTION           = var.send_email_function_name
      JWT_SECRET_KEY_NAME           = "picasso/staging/jwt/signing-key"
      SCHEDULE_BASE_URL             = "https://staging.schedule.myrecruiter.ai"
    }
  }

  # Active X-Ray tracing — PassThrough yields no traces under SQS-event invoke
  # (SQS does not propagate a trace header).
  tracing_config {
    mode = "Active"
  }

  lifecycle {
    # Real code lands via lambda-repo CI (aws lambda update-function-code).
    # Env vars are Terraform-managed (NOT ignored).
    #
    # KNOWN HAZARD (sibling-module phase-audit G8): an apply triggered by a change
    # to a depended-on resource (the IAM policy below) can re-deploy the placeholder
    # zip OVER the real CI code despite this ignore_changes. AFTER ANY apply touching
    # this module, re-verify the live CodeSha256 is NOT the placeholder; re-deploy if so.
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.consumer, aws_iam_role_policy.consumer_exec]
}

# Event-source-mapping: the fan-out lifecycle-consumer FIFO queue drives this Lambda.
# function_response_types = ReportBatchItemFailures is REQUIRED — the merged handler
# returns { batchItemFailures } for partial-batch redrive; without this the return is
# ignored and a failed record never redrives to the DLQ.
resource "aws_lambda_event_source_mapping" "consumer" {
  event_source_arn        = var.source_queue_arn
  function_name           = aws_lambda_function.consumer.arn
  batch_size              = 10
  function_response_types = ["ReportBatchItemFailures"]
  enabled                 = true
}

# ==============================================================================
# CloudWatch alarms
# ==============================================================================

resource "aws_cloudwatch_metric_alarm" "consumer_errors" {
  alarm_name          = "Calendar_Lifecycle_Consumer-errors"
  alarm_description   = "Calendar_Lifecycle_Consumer Lambda errors >= 1 in any 5-minute period. Investigate via CloudWatch logs: /aws/lambda/Calendar_Lifecycle_Consumer. (Per-record failures redrive to the lifecycle-consumer DLQ — see its own depth alarm.)"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.consumer.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# ==============================================================================
# Outputs
# ==============================================================================

output "consumer_function_name" {
  value = aws_lambda_function.consumer.function_name
}

output "consumer_function_arn" {
  value = aws_lambda_function.consumer.arn
}

output "consumer_role_arn" {
  value = aws_iam_role.consumer.arn
}

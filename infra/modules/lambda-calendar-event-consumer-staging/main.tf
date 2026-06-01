# Scheduling sub-phase B Tasks B9 + B10 — Calendar_Event_Consumer Lambda.
#
# SQS consumer of the typed booking.* events the Calendar_Watch_Listener dispatches,
# fanned out through the SNS topic (sns-calendar-watch-fanout-staging) so this queue
# only receives the two types this consumer owns:
#   - booking.ooo_overlap_detected (B9) — flag the conflict on every overlapping
#     Booking row + admin alert (ground-truthed: conditional UpdateItem on Booking).
#   - booking.attendee_declined   (B10) — transition Booking.status booked → canceled
#     (conditional UpdateItem on Booking).
# Handler + tests live in Lambdas/lambda/Calendar_Event_Consumer (lambda#195, MERGED).
# This module is the integrator-owned IaC for it.
#
# Dedicated execution role per CLAUDE.md "Never share IAM roles" rule (lambda#44).
# NO wildcards.
#
# IAM scoped to ACTUAL merged-code usage (ground-truthed against
# origin/main:Calendar_Event_Consumer/index.js + booking-updates.js):
#   - DynamoDB: UpdateItem on the Booking table ONLY. The consumer does flagOooConflict
#     + cancelOnDecline, both conditional UpdateItems (attribute_exists(booking_id)).
#     NO GetItem (never reads first), NO Query (no GSI), NO Put/Delete.
#   - SNS: Publish to ops-alerts (alertAdmin best-effort OOO-conflict notification).
#   - SQS: consume from the fan-out event-consumer queue (Receive/Delete/GetQueueAttributes).
#     The queue is SSE-SQS (AWS-managed key) — no customer-KMS grant needed for SQS.
# If live behavior surfaces a path needing more, that is a one-line reviewed grant.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "booking_table_arn" {
  description = "ARN of picasso-booking-staging. Calendar_Event_Consumer does conditional UpdateItem (flagOooConflict / cancelOnDecline). UpdateItem only — no read, no GSI."
  type        = string
}

variable "booking_table_name" {
  type = string
}

variable "source_queue_arn" {
  description = "ARN of picasso-calendar-event-consumer-staging.fifo (from the fan-out module). The event-source-mapping polls it; the exec role consumes it."
  type        = string
}

variable "ops_alerts_topic_arn" {
  description = "ARN of picasso-ops-alerts-staging SNS topic. The consumer publishes OOO-conflict admin alerts here (OPS_ALERTS_TOPIC_ARN env), and the Errors alarm targets it."
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
  description             = "KMS key for Calendar_Event_Consumer CloudWatch logs. Phase C.2 pattern; dedicated per-Lambda KMS key."
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
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Calendar_Event_Consumer"
          }
        }
      },
    ]
  })

  tags = {
    Name     = "picasso-calendar-event-consumer-logs-staging"
    Subphase = "B9B10"
  }
}

resource "aws_kms_alias" "consumer_logs" {
  name          = "alias/picasso-calendar-event-consumer-logs-staging"
  target_key_id = aws_kms_key.consumer_logs.key_id
}

resource "aws_cloudwatch_log_group" "consumer" {
  name              = "/aws/lambda/Calendar_Event_Consumer"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.consumer_logs.arn
}

# ==============================================================================
# IAM execution role (dedicated per CLAUDE.md "Never share IAM roles" rule)
# ==============================================================================

resource "aws_iam_role" "consumer" {
  name = "Calendar_Event_Consumer-exec-staging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Subphase = "B9B10"
  }
}

data "aws_iam_policy_document" "consumer_exec" {
  # CloudWatch logs (group + streams)
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.consumer.arn}:*"]
  }

  # Booking table: conditional UpdateItem only (flagOooConflict + cancelOnDecline).
  statement {
    sid       = "DDBBookingUpdate"
    actions   = ["dynamodb:UpdateItem"]
    resources = [var.booking_table_arn]
  }

  # SNS: best-effort admin alert on a newly-flagged OOO conflict.
  statement {
    sid       = "SNSPublishOpsAlerts"
    actions   = ["sns:Publish"]
    resources = [var.ops_alerts_topic_arn]
  }

  # SQS consume from the fan-out event-consumer queue. The queue is SSE-SQS
  # (AWS-managed key), so no kms:Decrypt grant is required here.
  statement {
    sid = "SQSConsumeEventQueue"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
    ]
    resources = [var.source_queue_arn]
  }
}

resource "aws_iam_role_policy" "consumer_exec" {
  name   = "calendar-event-consumer-exec"
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
  function_name = "Calendar_Event_Consumer"
  role          = aws_iam_role.consumer.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  memory_size   = 256
  timeout       = 30
  # Bound the blast radius + DDB/SNS call rate at v1 pilot scale.
  reserved_concurrent_executions = 5
  architectures                  = ["x86_64"]

  filename         = data.archive_file.consumer_placeholder.output_path
  source_code_hash = data.archive_file.consumer_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT          = "staging"
      BOOKING_TABLE        = var.booking_table_name
      OPS_ALERTS_TOPIC_ARN = var.ops_alerts_topic_arn
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code lands via lambda-repo CI matrix (aws lambda update-function-code).
    # Env vars are Terraform-managed (NOT ignored).
    #
    # KNOWN HAZARD (sibling-module phase-audit G8 / lambda-pii-dsar 2026-05-26):
    # an apply triggered by a change to a depended-on resource (the IAM policy
    # below) can re-deploy the placeholder zip OVER the real CI code despite this
    # ignore_changes. AFTER ANY apply touching this module, re-verify the live
    # CodeSha256 is NOT the placeholder; re-run the CI deploy if it is.
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.consumer, aws_iam_role_policy.consumer_exec]
}

# Event-source-mapping: the fan-out event-consumer FIFO queue drives this Lambda.
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
  alarm_name          = "Calendar_Event_Consumer-errors"
  alarm_description   = "Calendar_Event_Consumer Lambda errors >= 1 in any 5-minute period. Investigate via CloudWatch logs: /aws/lambda/Calendar_Event_Consumer. (Per-record failures redrive to the event-consumer DLQ — see its own depth alarm.)"
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

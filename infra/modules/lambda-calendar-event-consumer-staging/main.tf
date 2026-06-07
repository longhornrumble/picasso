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

# gap C (B9 reoffer = X + Y). The reoffer path reads the booking's attendee/appt context
# (booking GetItem), re-resolves the pool (X: routing_policy + appointment_type GetItem +
# employee-registry Query), mints a §13.4 reschedule token (jwt signing key), and sends the
# notice via the send_email Lambda (Y).
variable "appointment_type_table_arn" {
  description = "ARN of picasso-appointment-type-staging. (X) resolveCandidates GetItem (resolve the booking's appointment type → routing policy)."
  type        = string
}
variable "appointment_type_table_name" {
  type = string
}
variable "routing_policy_table_arn" {
  description = "ARN of picasso-routing-policy-staging. (X) resolveCandidates GetItem (tag_conditions)."
  type        = string
}
variable "routing_policy_table_name" {
  type = string
}
variable "employee_registry_table_arn" {
  description = "ARN of picasso-employee-registry-v2-staging. (X) resolveCandidates Queries it (PK tenantId) for the scheduling-tagged roster. Query on the table ARN only."
  type        = string
}
variable "employee_registry_table_name" {
  type = string
}
variable "scheduling_notif_template_table_arn" {
  description = "ARN of picasso-scheduling-notif-template-staging. notify.js GetItem (tenantId, moment) for the §E14 tenant template override at dispatch (reoffer/cancel notices). Fail-safe: a miss/error uses the local default."
  type        = string
}

variable "scheduling_notif_template_table_name" {
  type = string
}

variable "send_email_function_name" {
  description = "Name of the reusable send_email Lambda the (Y) reoffer notice invokes (async). The exec role is granted lambda:InvokeFunction on exactly this function ARN."
  type        = string
  default     = "send_email"
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

  # Booking table: conditional UpdateItem (flagOooConflict + cancelOnDecline) + GetItem
  # (gap C reoffer: getReofferContext reads the attendee/appt fields the OOO envelope lacks).
  statement {
    sid       = "DDBBookingReadWrite"
    actions   = ["dynamodb:UpdateItem", "dynamodb:GetItem"]
    resources = [var.booking_table_arn]
  }

  # gap C (X wire): resolveCandidates GetItem on appointment_type + routing_policy, and
  # Query on the employee registry (PK tenantId, no GSI) — the reoffer pool re-check.
  statement {
    sid     = "DDBReadRoutingContext"
    actions = ["dynamodb:GetItem"]
    resources = [
      var.appointment_type_table_arn,
      var.routing_policy_table_arn,
    ]
  }
  statement {
    sid       = "DDBQueryEmployeeRegistry"
    actions   = ["dynamodb:Query"]
    resources = [var.employee_registry_table_arn]
  }
  # §E14: notify.js point-reads the tenant's notification-template override at dispatch.
  statement {
    sid       = "DDBReadSchedulingNotifTemplate"
    actions   = ["dynamodb:GetItem"]
    resources = [var.scheduling_notif_template_table_arn]
  }

  # gap C (Y wire): invoke the reusable send_email Lambda (async) for the reoffer notice.
  # Scoped to EXACTLY the send_email function ARN (no wildcard).
  statement {
    sid       = "InvokeSendEmail"
    actions   = ["lambda:InvokeFunction"]
    resources = ["arn:${data.aws_partition.current.partition}:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:${var.send_email_function_name}"]
  }

  # gap C (token wire): read the shared JWT signing key to mint the §13.4 reschedule link
  # (same secret + per-purpose token the C8 confirmation email uses; the iss claim isolates
  # scheduling tokens from chat-session JWTs). Scoped to the signing-key secret only.
  statement {
    sid       = "SecretsReadJwtSigningKey"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/staging/jwt/signing-key-*"]
  }

  # §B7 (G3): the reoffer re-pool path (index.js resolveCandidates) reads each candidate's
  # per-coordinator OAuth secret `status` to exclude revoked calendars. GetSecretValue on the
  # per-coordinator prefix only, FENCED off the reserved `_*` secrets (both ARN + short-name
  # forms, per the G3 Sec-B1 fix) so this consumer can never read the platform-app creds or the
  # state-signing key. (Booking_Commit_Handler + Stranded_Booking_Remediator already grant this.)
  statement {
    sid       = "SecretsReadCoordinatorOAuthStatus"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/*"]
    condition {
      test     = "StringNotLike"
      variable = "secretsmanager:SecretId"
      values = [
        "arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/_*",
        "picasso/scheduling/oauth/_*",
      ]
    }
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

  # SR-3: X-Ray write — required for tracing_config mode=Active to emit segments.
  statement {
    sid       = "XRayWrite"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"]
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
      # gap C reoffer (X + Y + §13.4 token)
      APPOINTMENT_TYPE_TABLE     = var.appointment_type_table_name
      ROUTING_POLICY_TABLE       = var.routing_policy_table_name
      EMPLOYEE_REGISTRY_TABLE    = var.employee_registry_table_name
      SCHED_NOTIF_TEMPLATE_TABLE = var.scheduling_notif_template_table_name
      SEND_EMAIL_FUNCTION        = var.send_email_function_name
      JWT_SECRET_KEY_NAME        = "picasso/staging/jwt/signing-key"
      SCHEDULE_BASE_URL          = "https://staging.schedule.myrecruiter.ai"
    }
  }

  # SR-3: Active X-Ray tracing — PassThrough yields no traces under SQS-event
  # invoke (SQS does not propagate a trace header).
  tracing_config {
    mode = "Active"
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

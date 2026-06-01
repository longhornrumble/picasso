# Scheduling sub-phase B Task B11 — Stranded_Booking_Remediator Lambda.
#
# Coordinator-offboarding stranded-booking remediation (canonical §7.3). When a
# coordinator leaves, the calendar admin usually reassigns/cancels their meetings
# calendar-side and the §14.2 listener follows; the bookings the admin did NOT
# address are "stranded". This Lambda detects the stranded set (Booking rows still
# `booked` for the departed coordinator whose last calendar mutation predates the
# offboarding moment) and applies reassign / cancel / leave (or the default cascade).
#
# INVOKED DIRECTLY, NOT a queue consumer — input {tenant_id, coordinator_email,
# offboarding_time[, choice]}. The offboarding-trigger wiring (invoke from the
# Calendar_Watch_Offboarder path) is an INTEGRATOR-OWNED coupled change (a Lambda
# code change + an Offboarder-role lambda:InvokeFunction grant + an Offboarder env
# var) — see the PR escalation block. This module provides the function + its ARN.
#
# Handler + tests live in Lambdas/lambda/Stranded_Booking_Remediator (lambda#194,
# MERGED). This module is the integrator-owned IaC for it.
#
# Dedicated execution role per CLAUDE.md "Never share IAM roles" rule (lambda#44).
# NO wildcards.
#
# IAM scoped to ACTUAL merged-code usage (ground-truthed against
# origin/main:Stranded_Booking_Remediator/{booking-store,routing-context,oauth-client}.js):
#   - Booking table: Query the tenantId-coordinator_email-index GSI (findStranded) +
#     conditional UpdateItem (reassignBookingResource / cancel). NO GetItem on Booking.
#   - AppointmentType + RoutingPolicy tables: GetItem only (routing-context reads the
#     reassignment pool/policy). No Query, no write.
#   - Secrets Manager: GetSecretValue on picasso/scheduling/oauth/{tenant}/{coordinator}
#     (per-tenant scope, NOT wildcard) — the Google OAuth client for events.move/delete.
#   - Google Calendar API (events.move / events.delete) is HTTPS via @googleapis/calendar
#     — no AWS IAM. No SNS publish (the handler returns a structured results/failed
#     summary to its caller; the Errors alarm covers observability).
# An offboarded coordinator's suspended-account OAuth → GetSecretValue may succeed but
# the Google refresh fails → that booking lands in the handler's `failed[]` (expected;
# the admin handles it manually). No IAM change needed for that path.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "booking_table_arn" {
  description = "ARN of picasso-booking-staging. Remediator conditional UpdateItem (reassign/cancel). UpdateItem on the table; Query on the coordinator GSI below."
  type        = string
}

variable "booking_table_name" {
  type = string
}

variable "booking_coordinator_email_index_arn" {
  description = "ARN of the tenantId-coordinator_email-index GSI on picasso-booking-staging. findStrandedBookings Queries it for all bookings owned by the departed coordinator (canonical §16). Query is granted on the index ARN only."
  type        = string
}

variable "appointment_type_table_arn" {
  description = "ARN of picasso-appointment-type-staging. routing-context GetItem only (resolve the reassignment appointment type)."
  type        = string
}

variable "appointment_type_table_name" {
  type = string
}

variable "routing_policy_table_arn" {
  description = "ARN of picasso-routing-policy-staging. routing-context GetItem only (resolve the reassignment routing policy / candidate pool)."
  type        = string
}

variable "routing_policy_table_name" {
  type = string
}

variable "scheduling_oauth_tenant_ids" {
  description = "Tenant IDs whose scheduling OAuth secrets the remediator may read. secretsmanager:GetSecretValue is scoped to picasso/scheduling/oauth/{tenant}/* for each — NOT a wildcard (matches the Listener/C8 per-tenant posture, sub-phase B audit SR-1). Adding tenant #2 = append here in a reviewed PR."
  type        = list(string)
  default     = ["MYR384719"]
}

variable "ops_alerts_topic_arn" {
  description = "ARN of picasso-ops-alerts-staging SNS topic — target of the Errors alarm. (The remediator itself does NOT publish to SNS — least-priv: no sns:Publish grant.)"
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

resource "aws_kms_key" "remediator_logs" {
  description             = "KMS key for Stranded_Booking_Remediator CloudWatch logs. Phase C.2 pattern; dedicated per-Lambda KMS key."
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
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Stranded_Booking_Remediator"
          }
        }
      },
    ]
  })

  tags = {
    Name     = "picasso-stranded-booking-remediator-logs-staging"
    Subphase = "B11"
  }
}

resource "aws_kms_alias" "remediator_logs" {
  name          = "alias/picasso-stranded-booking-remediator-logs-staging"
  target_key_id = aws_kms_key.remediator_logs.key_id
}

resource "aws_cloudwatch_log_group" "remediator" {
  name              = "/aws/lambda/Stranded_Booking_Remediator"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.remediator_logs.arn
}

# ==============================================================================
# IAM execution role (dedicated per CLAUDE.md "Never share IAM roles" rule)
# ==============================================================================

resource "aws_iam_role" "remediator" {
  name = "Stranded_Booking_Remediator-exec-staging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Subphase = "B11"
  }
}

data "aws_iam_policy_document" "remediator_exec" {
  # CloudWatch logs (group + streams)
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.remediator.arn}:*"]
  }

  # Booking table: conditional UpdateItem (reassign/cancel).
  statement {
    sid       = "DDBBookingUpdate"
    actions   = ["dynamodb:UpdateItem"]
    resources = [var.booking_table_arn]
  }

  # Booking coordinator GSI: Query the departed coordinator's bookings. Query is
  # granted on the index ARN (a GSI Query authorizes against the index resource).
  statement {
    sid       = "DDBBookingQueryCoordinatorIndex"
    actions   = ["dynamodb:Query"]
    resources = [var.booking_coordinator_email_index_arn]
  }

  # AppointmentType + RoutingPolicy: GetItem only (routing-context reassignment lookup).
  statement {
    sid     = "DDBReadRoutingContext"
    actions = ["dynamodb:GetItem"]
    resources = [
      var.appointment_type_table_arn,
      var.routing_policy_table_arn,
    ]
  }

  # Secrets Manager: per-tenant scheduling OAuth secret (Google client for
  # events.move/delete). Per-tenant, NOT wildcard. The trailing /* matches the
  # per-coordinator sub-path (picasso/scheduling/oauth/{tenant}/{coordinator}).
  statement {
    sid     = "SecretsReadSchedulingOAuth"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      for t in var.scheduling_oauth_tenant_ids :
      "arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/${t}/*"
    ]
  }

  # SR-3: X-Ray write — required for tracing_config mode=Active to emit segments.
  statement {
    sid       = "XRayWrite"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "remediator_exec" {
  name   = "stranded-booking-remediator-exec"
  role   = aws_iam_role.remediator.id
  policy = data.aws_iam_policy_document.remediator_exec.json
}

# ==============================================================================
# Lambda function (placeholder code; real handler lands via lambda-repo CI)
# ==============================================================================

data "archive_file" "remediator_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "remediator" {
  function_name = "Stranded_Booking_Remediator"
  role          = aws_iam_role.remediator.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  # 256MB / 300s: a departed coordinator may own many stranded bookings, each
  # remediated with a Google Calendar events.move/delete (sequential HTTPS) + a DDB
  # write. 300s covers a large stranded set at v1 pilot scale; the function is invoked
  # rarely (only on offboarding).
  memory_size = 256
  timeout     = 300
  # Offboarding is rare and one-coordinator-at-a-time; cap concurrency low.
  reserved_concurrent_executions = 2
  architectures                  = ["x86_64"]

  filename         = data.archive_file.remediator_placeholder.output_path
  source_code_hash = data.archive_file.remediator_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT              = "staging"
      BOOKING_TABLE            = var.booking_table_name
      APPOINTMENT_TYPE_TABLE   = var.appointment_type_table_name
      ROUTING_POLICY_TABLE     = var.routing_policy_table_name
      OAUTH_SECRET_PATH_PREFIX = "picasso/scheduling/oauth"
    }
  }

  # SR-3: Active X-Ray tracing — PassThrough yields no traces under direct
  # invoke (no upstream trace header to propagate).
  tracing_config {
    mode = "Active"
  }

  lifecycle {
    # Real code lands via lambda-repo CI matrix (aws lambda update-function-code).
    # Env vars are Terraform-managed (NOT ignored).
    #
    # KNOWN HAZARD (sibling-module phase-audit G8 / lambda-pii-dsar 2026-05-26):
    # an apply triggered by a change to a depended-on resource (the IAM policy, or
    # appending a tenant to scheduling_oauth_tenant_ids) can re-deploy the placeholder
    # zip OVER the real CI code despite this ignore_changes. AFTER ANY apply touching
    # this module, re-verify the live CodeSha256 is NOT the placeholder; re-deploy if so.
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.remediator, aws_iam_role_policy.remediator_exec]
}

# ==============================================================================
# CloudWatch alarms
# ==============================================================================

resource "aws_cloudwatch_metric_alarm" "remediator_errors" {
  alarm_name          = "Stranded_Booking_Remediator-errors"
  alarm_description   = "Stranded_Booking_Remediator Lambda errors >= 1 in any 5-minute period. Investigate via CloudWatch logs: /aws/lambda/Stranded_Booking_Remediator. (Per-booking remediation failures are returned in the handler's failed[] summary, not as Lambda errors — a Lambda Error means the whole invocation threw.)"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.remediator.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# ==============================================================================
# Outputs
# ==============================================================================

output "remediator_function_name" {
  description = "Function name — the integrator sets this as the Calendar_Watch_Offboarder's REMEDIATOR_FUNCTION_NAME env var and grants the Offboarder role lambda:InvokeFunction on the ARN below (coupled change)."
  value       = aws_lambda_function.remediator.function_name
}

output "remediator_function_arn" {
  value = aws_lambda_function.remediator.arn
}

output "remediator_role_arn" {
  value = aws_iam_role.remediator.arn
}

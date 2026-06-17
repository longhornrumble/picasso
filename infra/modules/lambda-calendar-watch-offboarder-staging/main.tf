# Scheduling sub-phase B Task B6 — Calendar_Watch_Offboarder Lambda.
#
# Tears down a Google Calendar push-notification watch channel when a
# coordinator is no longer bookable (AdminEmployee scheduling_tags cleared, or
# the Workspace account suspended — canonical §4.5 row 4). v1 pilot scale uses
# direct invocation (aws lambda invoke); the AdminEmployee DDB-stream trigger
# named in the B6 plan-row lands later when sub-phase E13 UI / F2 onboarding
# populates `scheduling_tags` (same deferral as the B5 Onboarder). Until then
# this Lambda is also the programmatic channels.stop teardown bridge the B3/B5
# smoke runbooks refer to.
#
# Per-invocation flow (handler details in
# Lambdas/lambda/Calendar_Watch_Offboarder/index.js):
#   1. Resolve target row(s) — GetItem by channel_id, OR Query the
#      tenant-expiration-index by tenant_id then filter by coordinator_id.
#   2. channels.stop the Google watch (404/410 = already gone = benign).
#   3. DeleteItem the DDB row, guarded by tenant ownership.
# The Offboarder never registers a watch, so — unlike the Onboarder/Renewer —
# it needs NO Listener Function URL.
#
# Dedicated execution role per CLAUDE.md "Never share IAM roles" rule
# (lambda#44 lesson).
#
# B1 audit row 13 carry-forward: secretsmanager:GetSecretValue is scoped PER
# TENANT (picasso/scheduling/oauth/${tenant}/*), NOT a wildcard — same posture
# as the Onboarder (picasso#271) and Renewer.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "calendar_watch_channels_table_arn" {
  description = "ARN of picasso-calendar-watch-channels-staging. Offboarder GetItem/Query/DeleteItem against it (Query on the tenant-expiration-index GSI to resolve a coordinator's channels)."
  type        = string
}

variable "calendar_watch_channels_table_name" {
  type = string
}

variable "scheduling_oauth_tenant_ids" {
  description = "Tenant IDs whose OAuth secrets the Offboarder may read. The exec role's secretsmanager:GetSecretValue is scoped to picasso/scheduling/oauth/{tenant}/* for each — NOT a wildcard (closes B1 audit row 13). Adding tenant #2 = append here in a reviewed PR, not a silent wildcard grant."
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

# B11 offboarding trigger (gap B) — the Offboarder async-invokes the
# Stranded_Booking_Remediator on the coordinator-offboarding path. Wired from the
# remediator module's outputs in main.tf (offboarder -> remediator, one-way; no cycle).
variable "remediator_function_name" {
  description = "Function name of Stranded_Booking_Remediator (B11). Set as the Offboarder's REMEDIATOR_FUNCTION_NAME env so it can async-invoke (InvocationType=Event) the stranded-booking remediation on coordinator offboarding."
  type        = string
}

variable "remediator_function_arn" {
  description = "ARN of Stranded_Booking_Remediator (B11) — the Offboarder exec role is granted lambda:InvokeFunction on exactly this ARN (no wildcard)."
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

resource "aws_kms_key" "offboarder_logs" {
  description             = "KMS key for Calendar_Watch_Offboarder CloudWatch logs. Phase C.2 pattern; dedicated per-Lambda KMS key."
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
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Calendar_Watch_Offboarder"
          }
        }
      },
    ]
  })

  tags = {
    Name     = "picasso-calendar-watch-offboarder-logs-staging"
    Subphase = "B6"
  }
}

resource "aws_kms_alias" "offboarder_logs" {
  name          = "alias/picasso-calendar-watch-offboarder-logs-staging"
  target_key_id = aws_kms_key.offboarder_logs.key_id
}

resource "aws_cloudwatch_log_group" "offboarder" {
  name              = "/aws/lambda/Calendar_Watch_Offboarder"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.offboarder_logs.arn
}

# ==============================================================================
# IAM execution role (dedicated per CLAUDE.md "Never share IAM roles" rule)
# ==============================================================================

resource "aws_iam_role" "offboarder" {
  name                 = "Calendar_Watch_Offboarder-exec-staging"
  permissions_boundary = var.permissions_boundary_arn

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Subphase = "B6"
  }
}

data "aws_iam_policy_document" "offboarder_exec" {
  # CloudWatch logs (group + streams)
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.offboarder.arn}:*"]
  }

  # DDB Query on the tenant-expiration-index GSI to resolve a coordinator's
  # channels (the { tenant_id, coordinator_id } selector). GSI queries require
  # the index ARN; the base-table ARN is included so the query path is
  # unambiguous. Same grant shape as the Renewer.
  statement {
    sid     = "DDBQueryCalendarWatchChannels"
    actions = ["dynamodb:Query"]
    resources = [
      var.calendar_watch_channels_table_arn,
      "${var.calendar_watch_channels_table_arn}/index/tenant-expiration-index",
    ]
  }

  # DDB GetItem (resolve the { tenant_id, channel_id } selector) + DeleteItem
  # (remove the row after the watch is stopped; conditional on tenant ownership).
  # No PutItem / UpdateItem — the Offboarder only reads + deletes.
  statement {
    sid       = "DDBReadDeleteCalendarWatchChannels"
    actions   = ["dynamodb:GetItem", "dynamodb:DeleteItem"]
    resources = [var.calendar_watch_channels_table_arn]
  }

  # Secrets Manager read on scheduling OAuth secrets — scoped PER TENANT, not
  # wildcard (closes B1 audit row 13 / G2). One ARN per entry in
  # var.scheduling_oauth_tenant_ids. Same posture as the Onboarder (picasso#271)
  # and Renewer. The Offboarder needs the OAuth client to call channels.stop.
  statement {
    sid     = "SecretsReadSchedulingOAuth"
    actions = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [
      for t in var.scheduling_oauth_tenant_ids :
      "arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/${t}/*"
    ]
  }

  # NOTE: the Offboarder never reads or writes the channel token (G6). Teardown
  # needs only channel_id + resourceId (both in the DDB row) — no Secrets Manager
  # channel-token namespace, and no CloudWatch custom metrics (unlike the
  # Renewer, the Offboarder emits none).

  # B11 offboarding trigger (gap B): async-invoke the Stranded_Booking_Remediator
  # on the coordinator-offboarding path. Scoped to EXACTLY the remediator ARN (no
  # wildcard). The invoke is InvocationType=Event (fire-and-forget) — the Offboarder
  # does not block on B11's remediation and its return summary is independent.
  statement {
    sid       = "InvokeStrandedBookingRemediator"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.remediator_function_arn]
  }
}

resource "aws_iam_role_policy" "offboarder_exec" {
  name   = "offboarder-exec"
  role   = aws_iam_role.offboarder.id
  policy = data.aws_iam_policy_document.offboarder_exec.json
}

# ==============================================================================
# Lambda function (placeholder code; real handler lands via lambda-repo CI)
# ==============================================================================

data "archive_file" "offboarder_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "offboarder" {
  function_name = "Calendar_Watch_Offboarder"
  role          = aws_iam_role.offboarder.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  memory_size   = 256
  # 60s: a coordinator may hold a small handful of channels; each teardown is an
  # OAuth fetch + Google channels.stop + DDB DeleteItem. 60s matches the
  # Onboarder and leaves ample margin at pilot scale.
  timeout = 60
  # Cap concurrency: a future stream trigger or a scripted loop must NOT be able
  # to fan out unbounded Google channels.stop + DeleteItem calls. Mirrors the
  # Onboarder (phase-completion-audit G18).
  reserved_concurrent_executions = 2
  architectures                  = ["x86_64"]

  filename         = data.archive_file.offboarder_placeholder.output_path
  source_code_hash = data.archive_file.offboarder_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT                   = "staging"
      CALENDAR_WATCH_CHANNELS_TABLE = var.calendar_watch_channels_table_name
      OAUTH_SECRET_PATH_PREFIX      = "picasso/scheduling/oauth"
      # B11 offboarding trigger (gap B): the Offboarder async-invokes this function
      # on the coordinator-offboarding path. Unset ⇒ the invoke is skipped (warn).
      REMEDIATOR_FUNCTION_NAME = var.remediator_function_name
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
    #   aws lambda get-function-configuration --function-name Calendar_Watch_Offboarder \
    #     --query CodeSha256
    #   gh workflow run "Deploy Lambda — Staging" -f lambda=Calendar_Watch_Offboarder
    # Placeholder CodeSha256 = base64sha256 of placeholder/index.js (503 stub).
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.offboarder, aws_iam_role_policy.offboarder_exec]
}

# ==============================================================================
# CloudWatch alarm (errors only — Offboarder has no public surface and is
# invoked manually for v1 pilot, so a single Errors alarm is sufficient.
# DLQ + malformed-payload alarms from the Listener pattern do not apply.)
# ==============================================================================

resource "aws_cloudwatch_metric_alarm" "offboarder_errors" {
  alarm_name          = "Calendar_Watch_Offboarder-errors"
  alarm_description   = "Calendar_Watch_Offboarder Lambda errors >= 1 in any 5-minute period. Investigate via CloudWatch logs: /aws/lambda/Calendar_Watch_Offboarder."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.offboarder.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# ==============================================================================
# Outputs
# ==============================================================================

output "offboarder_function_name" {
  value = aws_lambda_function.offboarder.function_name
}

output "offboarder_function_arn" {
  value = aws_lambda_function.offboarder.arn
}

output "offboarder_role_arn" {
  value = aws_iam_role.offboarder.arn
}

variable "permissions_boundary_arn" {
  description = "ARN of the picasso-workload-boundary permission boundary (module.iam_workload_boundary). Caps this role's effective permissions to the intersection with the boundary. Null = no boundary (keeps the module usable standalone)."
  type        = string
  default     = null
  validation {
    condition     = var.permissions_boundary_arn == null || can(regex("^arn:aws:iam::[0-9]{12}:policy/", var.permissions_boundary_arn))
    error_message = "permissions_boundary_arn must be null or a valid IAM policy ARN."
  }
}

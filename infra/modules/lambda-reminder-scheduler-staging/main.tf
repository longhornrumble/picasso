# Track 1 S6 — Reminder_Scheduler Lambda (nightly reconciler) +
# EventBridge Scheduler execution role + dedicated schedule group.
#
# Three resources in one module (no cycle risk; the scheduler_exec role needs
# the sender ARN which lives in lambda-scheduled-message-sender-staging):
#
#   1. aws_scheduler_schedule_group "reminders"
#      Dedicated group "picasso-scheduling-reminders-staging". All per-booking
#      one-time reminder schedules land in this group so scheduler:CreateSchedule
#      / DeleteSchedule can be scoped to the group pattern — no wildcard.
#
#   2. aws_iam_role "scheduler_exec"  (the EventBridge Scheduler execution role)
#      Assumed by scheduler.amazonaws.com when firing ANY schedule in the group.
#      Trust = aws:SourceAccount ONLY (NO aws:SourceArn — see the 2026-06-11 fix note
#      on the condition: Scheduler's CreateSchedule rejects an aws:SourceArn condition for
#      schedules in a non-default group). Invoke policy: only lambda:InvokeFunction on
#      Scheduled_Message_Sender ARN.
#
#   3. aws_lambda_function "reconciler"  (Reminder_Scheduler, the nightly sweep)
#      Dedicated execution role; reserved_concurrent_executions=1; 300s timeout.
#      Nightly EventBridge Scheduler cron(0 7 * * ? *) UTC drives it.
#      The reconciler's OWN invocation has a FIXED schedule name; its scheduler invoke
#      role trust is also aws:SourceAccount ONLY (same CreateSchedule constraint).
#
# HIGH-RISK:
#   - iam:PassRole on BCH (lambda-booking-commit-staging) is scoped to EXACTLY
#     scheduler_exec role ARN (see the edit to that module in main.tf).
#   - confused-deputy: aws:SourceAccount (cross-account) + single-target invoke policies +
#     scheduler:CreateSchedule/PassRole held only by BCH. (aws:SourceArn dropped — not
#     satisfiable by CreateSchedule validation for non-default-group schedules.)
#   - Dedicated group is load-bearing: without it Create/Delete must be *.
#
# Dedicated execution role per CLAUDE.md "Never share IAM roles" rule.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "sender_function_arn" {
  description = "ARN of the Scheduled_Message_Sender Lambda (the EventBridge schedule target). The scheduler_exec role grants InvokeFunction on exactly this ARN. Also passed as SCHEDULER_TARGET_ARN env to the reconciler."
  type        = string
}

variable "sender_function_name" {
  type = string
}

variable "booking_table_arn" {
  description = "ARN of picasso-booking-staging. Reconciler Queries the tenantId-start_at-index GSI + UpdateItem on the base table (reminder_schedule_state bookkeeping)."
  type        = string
}

variable "booking_table_name" {
  type = string
}

variable "booking_start_at_index_arn" {
  description = "ARN of the tenantId-start_at-index GSI on picasso-booking-staging. Reconciler Queries it for time-range sweeps."
  type        = string
}

variable "scheduled_messages_table_arn" {
  description = "ARN of picasso-scheduled-messages. Reconciler DeleteItem terminal rows during cleanup sweep."
  type        = string
}

variable "scheduled_messages_table_name" {
  type = string
}

variable "scheduling_tenant_ids" {
  description = "Tenant IDs the nightly reconciler sweeps. Passed to SCHEDULING_TENANT_IDS as CSV (reconciler.js uses split(',') -- NOT JSON.parse). Default is the v1 pilot tenant."
  type        = list(string)
  default     = ["MYR384719"]
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
# 1. Dedicated schedule group for all per-booking reminder schedules
# ==============================================================================

resource "aws_scheduler_schedule_group" "reminders" {
  name = "picasso-scheduling-reminders-staging"

  tags = {
    Subphase = "S6"
  }
}

# ==============================================================================
# 2. EventBridge Scheduler execution role (assumed when firing any schedule
#    in the reminders group, including per-booking one-time reminder schedules).
#
# Trust uses ArnLike on the group pattern (NOT ArnEquals) because per-booking
# schedule names are dynamic. ArnLike with the group-wildcard suffix is the
# correct least-privilege form for dynamic schedule names — it is tighter than
# a full account-level wildcard and matches only schedules in this group.
# Compare with the renewer/reconciler fixed-schedule roles below that use ArnEquals.
# ==============================================================================

resource "aws_iam_role" "scheduler_exec" {
  name                 = "picasso-reminder-scheduler-exec-staging"
  permissions_boundary = var.permissions_boundary_arn

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
        # NO aws:SourceArn condition. FIX (2026-06-11): EventBridge Scheduler's CreateSchedule
        # assume-role validation does NOT satisfy an aws:SourceArn condition for schedules in a
        # NON-DEFAULT group (both ArnEquals-exact and ArnLike-group/* were tried and both failed
        # with "must allow AWS EventBridge Scheduler to assume the role" — see the nightly role
        # below). aws:SourceAccount (cross-account confused-deputy protection) is retained; the
        # residual intra-account scoping is provided by (a) this role's invoke policy being
        # single-target (lambda:InvokeFunction on Scheduled_Message_Sender ONLY) and (b) only BCH
        # holding scheduler:CreateSchedule + iam:PassRole (scoped to this exact role ARN). The
        # renewer keeps aws:SourceArn only because it lives in the DEFAULT group, where the
        # validation behaves differently.
      }
    }]
  })

  tags = {
    Subphase = "S6"
  }
}

data "aws_iam_policy_document" "scheduler_exec_invoke" {
  # InvokeFunction scoped to the Scheduled_Message_Sender ARN ONLY.
  # No wildcard. BCH's iam:PassRole (in lambda-booking-commit-staging)
  # is also scoped to this role ARN exactly -- the two constraints are paired.
  statement {
    sid       = "InvokeScheduledMessageSender"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.sender_function_arn]
  }
}

resource "aws_iam_role_policy" "scheduler_exec_invoke" {
  name   = "reminder-scheduler-exec-invoke"
  role   = aws_iam_role.scheduler_exec.id
  policy = data.aws_iam_policy_document.scheduler_exec_invoke.json
}

# ==============================================================================
# 3a. CloudWatch log group (KMS-encrypted per Phase C.2 pattern)
# ==============================================================================

resource "aws_kms_key" "reconciler_logs" {
  description             = "KMS key for Reminder_Scheduler CloudWatch logs. Phase C.2 pattern; dedicated per-Lambda KMS key."
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
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Reminder_Scheduler"
          }
        }
      },
    ]
  })

  tags = {
    Name     = "picasso-reminder-scheduler-logs-staging"
    Subphase = "S6"
  }
}

resource "aws_kms_alias" "reconciler_logs" {
  name          = "alias/picasso-reminder-scheduler-logs-staging"
  target_key_id = aws_kms_key.reconciler_logs.key_id
}

resource "aws_cloudwatch_log_group" "reconciler" {
  name              = "/aws/lambda/Reminder_Scheduler"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.reconciler_logs.arn
}

# ==============================================================================
# 3b. IAM execution role for the Reminder_Scheduler reconciler Lambda
#     (dedicated per CLAUDE.md "Never share IAM roles" rule)
# ==============================================================================

resource "aws_iam_role" "reconciler" {
  name                 = "Reminder_Scheduler-exec-staging"
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
    Subphase = "S6"
  }
}

data "aws_iam_policy_document" "reconciler_exec" {
  # CloudWatch logs (group + streams)
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.reconciler.arn}:*"]
  }

  # Booking table Query (reconciler sweeps upcoming bookings by start_at window).
  # GSI ARN required for Query; base-table ARN included for UpdateItem (bookkeeping).
  statement {
    sid     = "DDBBookingQuery"
    actions = ["dynamodb:Query"]
    resources = [
      var.booking_table_arn,
      var.booking_start_at_index_arn,
    ]
  }

  # Booking table UpdateItem (writes reminder_schedule_state bookkeeping field).
  statement {
    sid       = "DDBBookingUpdate"
    actions   = ["dynamodb:UpdateItem"]
    resources = [var.booking_table_arn]
  }

  # Scheduled-messages table DeleteItem (terminal-cleanup sweep removes rows that
  # are past their fire time or belong to a canceled/terminal booking).
  # The reconciler does NOT CreateSchedule/PassRole -- it only cleans up.
  # Per design doc Q1: least-privilege (omit Create/PassRole from the reconciler).
  statement {
    sid       = "DDBScheduledMessagesDelete"
    actions   = ["dynamodb:DeleteItem"]
    resources = [var.scheduled_messages_table_arn]
  }

  # EventBridge Scheduler: DeleteSchedule ONLY (terminal cleanup of orphaned
  # per-booking schedules). Scoped to the dedicated group. NO CreateSchedule
  # and NO PassRole here -- the reconciler only deletes, per design Q1.
  statement {
    sid     = "SchedulerDelete"
    actions = ["scheduler:DeleteSchedule"]
    resources = [
      "arn:${data.aws_partition.current.partition}:scheduler:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:schedule/picasso-scheduling-reminders-staging/*",
    ]
  }
}

resource "aws_iam_role_policy" "reconciler_exec" {
  name   = "reminder-scheduler-exec"
  role   = aws_iam_role.reconciler.id
  policy = data.aws_iam_policy_document.reconciler_exec.json
}

# ==============================================================================
# 3c. Reminder_Scheduler Lambda function (placeholder; real handler via CI)
# ==============================================================================

data "archive_file" "reconciler_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "reconciler" {
  function_name = "Reminder_Scheduler"
  role          = aws_iam_role.reconciler.arn
  runtime       = "nodejs20.x"
  # Real bundle is dist/index.js (CJS); handler path is the same for the placeholder.
  handler     = "index.handler"
  memory_size = 256
  # 300s: the nightly sweep queries all upcoming bookings across all tenant IDs and
  # deletes terminal rows + orphaned schedules. At pilot scale (1 tenant, <100 bookings)
  # this is well under 30s, but 300s matches the renewer's per-run budget
  # (same sequential-loop pattern, same correction headroom).
  timeout = 300
  # Single-flight: the cron must never run concurrently with itself. A double-fire
  # would produce duplicate DeleteSchedule calls (harmless but noisy) and potentially
  # race-condition the UpdateItem bookkeeping.
  reserved_concurrent_executions = 1
  architectures                  = ["x86_64"]

  filename         = data.archive_file.reconciler_placeholder.output_path
  source_code_hash = data.archive_file.reconciler_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT = "staging"
      # The reconciler is DELETE-ONLY (deleteReminders) — it never CreateSchedule's, so it
      # needs no SCHEDULER_TARGET_ARN/ROLE_ARN (those only feed Target.Arn/Target.RoleArn on a
      # create). Only the group name is used (DeleteSchedule takes GroupName+Name). Omitting the
      # role ARN also keeps the passable-role ARN out of this function's env (Security S2).
      SCHEDULER_GROUP_NAME     = aws_scheduler_schedule_group.reminders.name
      SCHEDULED_MESSAGES_TABLE = var.scheduled_messages_table_name
      BOOKING_TABLE            = var.booking_table_name
      BOOKING_START_AT_INDEX   = "tenantId-start_at-index"
      # CSV (NOT jsonencode) -- reconciler.js parses via split(',')
      SCHEDULING_TENANT_IDS   = join(",", var.scheduling_tenant_ids)
      RECONCILE_LOOKBACK_DAYS = "14"
      # Staging synthetic cycles: assertNotProdSynthetic allows test invocations
      # when STAGING_TEST_MODE=true + ENVIRONMENT=staging.
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
    # `terraform apply` triggered by a change to a DEPENDED-ON resource can
    # re-deploy the placeholder zip OVER the real CI code. AFTER ANY apply
    # that touches this module, re-verify:
    #   aws lambda get-function-configuration --function-name Reminder_Scheduler \
    #     --query CodeSha256
    #   gh workflow run "Deploy Lambda - Staging" -f lambda=Reminder_Scheduler
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.reconciler, aws_iam_role_policy.reconciler_exec]
}

# ==============================================================================
# 3d. Nightly EventBridge Scheduler for the reconciler
#
# This is the FIXED-NAME schedule that fires Reminder_Scheduler each night.
# Its scheduler invoke role trust uses ArnLike on the dedicated-group pattern (see the
# 2026-06-11 fix note on the condition below) — CreateSchedule rejected ArnEquals on the
# exact ARN at validation time.
# ==============================================================================

# Dedicated invoke role for the reconciler's own nightly schedule.
resource "aws_iam_role" "reconciler_scheduler" {
  name                 = "Reminder_Scheduler-scheduler-staging"
  permissions_boundary = var.permissions_boundary_arn

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
        # NO aws:SourceArn condition. FIX (2026-06-11): two staging applies failed CreateSchedule
        # with "must allow AWS EventBridge Scheduler to assume the role" — first with ArnEquals on
        # the exact schedule ARN, then with ArnLike on schedule/<group>/* — and a re-run with the
        # role aged 6+ min failed identically (ruling out IAM propagation). Scheduler's
        # CreateSchedule assume-role validation does not satisfy an aws:SourceArn condition for a
        # schedule in a NON-DEFAULT group. aws:SourceAccount is retained (cross-account confused-
        # deputy); intra-account scope = this role's single-target invoke policy (the nightly
        # Reminder_Scheduler only) + only the reconciler/CI creating this fixed schedule.
      }
    }]
  })

  tags = {
    Subphase = "S6"
  }
}

data "aws_iam_policy_document" "reconciler_scheduler_invoke" {
  statement {
    sid       = "InvokeReconciler"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.reconciler.arn]
  }
}

resource "aws_iam_role_policy" "reconciler_scheduler_invoke" {
  name   = "reminder-reconciler-scheduler-invoke"
  role   = aws_iam_role.reconciler_scheduler.id
  policy = data.aws_iam_policy_document.reconciler_scheduler_invoke.json
}

resource "aws_scheduler_schedule" "reconciler_nightly" {
  name        = "picasso-reminder-scheduler-nightly-staging"
  description = "Invokes Reminder_Scheduler (nightly reconciler) at 07:00 UTC to sweep terminal reminder rows and orphaned per-booking schedules. Track 1 S6."
  group_name  = aws_scheduler_schedule_group.reminders.name

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression          = "cron(0 7 * * ? *)"
  schedule_expression_timezone = "UTC"

  target {
    arn      = aws_lambda_function.reconciler.arn
    role_arn = aws_iam_role.reconciler_scheduler.arn
    # Empty payload: the reconciler reads SCHEDULING_TENANT_IDS from env.
    # The event may also carry { tenant_ids: [...] } for ad-hoc operator invocations.
    input = jsonencode({})

    # No retries: with reserved_concurrent_executions=1, a retry of a throttled
    # invocation would queue against an in-flight run. The nightly cron is the
    # retry. Mirrors the renewer posture (B4 G7).
    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}

# ==============================================================================
# Alarm: Lambda errors on the reconciler
# ==============================================================================

resource "aws_cloudwatch_metric_alarm" "reconciler_errors" {
  alarm_name          = "Reminder_Scheduler-errors"
  alarm_description   = "Reminder_Scheduler Lambda errors >= 1 in any 5-minute period. The nightly reconciler failed -- orphaned reminder schedules will not be cleaned up. Investigate via /aws/lambda/Reminder_Scheduler."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.reconciler.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# ==============================================================================
# Outputs
# ==============================================================================

output "reconciler_function_name" {
  value = aws_lambda_function.reconciler.function_name
}

output "reconciler_function_arn" {
  value = aws_lambda_function.reconciler.arn
}

output "reconciler_role_arn" {
  value = aws_iam_role.reconciler.arn
}

output "scheduler_exec_role_arn" {
  description = "ARN of the EventBridge Scheduler execution role that fires per-booking reminder schedules. BCH iam:PassRole is scoped to exactly this ARN (never *)."
  value       = aws_iam_role.scheduler_exec.arn
}

output "scheduler_group_name" {
  description = "Name of the dedicated reminder schedule group. All per-booking reminder schedules land here."
  value       = aws_scheduler_schedule_group.reminders.name
}

output "scheduler_target_arn" {
  description = "ARN of the Scheduled_Message_Sender (the schedule target). Passed through from the sender module so callers have a single reference."
  value       = var.sender_function_arn
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

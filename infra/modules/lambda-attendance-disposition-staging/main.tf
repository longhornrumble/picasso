# Attendance_Disposition_Handler -- WS-E-ATTEND ACTIVATION (Track-3 glue).
#
# The handler code (E5 attendance_check / E10 escalate + weekly_digest / C13
# zoom_outage_check) merged in lambda#243 but was never provisioned -- this module
# is the activation, mirroring how picasso#526 activated the synthetic monitor.
# Spec: the integrator brief in Attendance_Disposition_Handler/index.js header
# (env list + IAM table) -- followed exactly. Dedicated execution role (never shared).
#
# Invokers (role-based; no resource policy needed): the synthetic monitor's
# disposition cycle (lambda#292) today; the REMIND-side EventBridge Scheduler
# attendance rules later (the E5-TRIGGER SEAM flagged in the handler header --
# pointing those schedules here + the scheduler-role invoke grant is a tracked
# follow-up, deliberately NOT in this module).
#
# SECURITY: every DynamoDB and lambda:InvokeFunction grant carries
# aws:ResourceAccount = <staging account> (INFRA_NOTES discipline; the monitor
# module precedent). Do NOT remove these conditions.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "booking_table_arn" {
  description = "ARN of picasso-booking-staging. GetItem/UpdateItem on items + Query on the start_at GSI (weekly digest enumeration)."
  type        = string
}

variable "booking_table_name" {
  type = string
}

variable "tenant_config_bucket_arn" {
  description = "ARN of the staging tenant-config bucket (admin-email lookup; s3:GetObject on tenants/*)."
  type        = string
}

variable "tenant_config_bucket_name" {
  type = string
}

variable "redemption_base_url" {
  description = "Base URL the three disposition action links are minted against (the staging schedule domain)."
  type        = string
  default     = "https://staging.schedule.myrecruiter.ai"
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

locals {
  # send_email + SMS_Sender are live bare-named staging functions (deployed via the
  # lambda-repo CI). Constructed ARNs -- no module outputs exist for them.
  send_email_arn = "arn:${data.aws_partition.current.partition}:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:send_email"
  sms_sender_arn = "arn:${data.aws_partition.current.partition}:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:SMS_Sender"
}

# ==============================================================================
# CloudWatch log group (KMS-encrypted per Phase C.2 pattern)
# ==============================================================================

resource "aws_kms_key" "attend_logs" {
  description             = "KMS key for Attendance_Disposition_Handler CloudWatch logs. Phase C.2 pattern; dedicated per-Lambda KMS key."
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
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Attendance_Disposition_Handler"
          }
        }
      },
    ]
  })

  tags = {
    Name = "picasso-attendance-disposition-logs-staging"
  }
}

resource "aws_kms_alias" "attend_logs" {
  name          = "alias/picasso-attendance-disposition-logs-staging"
  target_key_id = aws_kms_key.attend_logs.key_id
}

resource "aws_cloudwatch_log_group" "attend" {
  name              = "/aws/lambda/Attendance_Disposition_Handler"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.attend_logs.arn
}

# ==============================================================================
# IAM execution role (dedicated; from the handler-header IAM table ONLY)
# ==============================================================================

resource "aws_iam_role" "attend" {
  name = "Attendance_Disposition_Handler-exec-staging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

data "aws_iam_policy_document" "attend_exec" {
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.attend.arn}:*"]
  }

  # E5/E6/E10: load the booking, set attendance_state, transition status; the
  # weekly digest Querys the start_at GSI (bounded window).
  statement {
    sid     = "DDBBookingAttendance"
    actions = ["dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:Query"]
    resources = [
      var.booking_table_arn,
      "${var.booking_table_arn}/index/tenantId-start_at-index",
    ]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  # Prompt + escalation dispatch ride the shipped senders.
  statement {
    sid       = "InvokeSenders"
    actions   = ["lambda:InvokeFunction"]
    resources = [local.send_email_arn, local.sms_sender_arn]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  # tokens.sign mints the 3 disposition action links (shared HS256 key -- same
  # secret the redemption handler verifies with; redemption-module precedent).
  statement {
    sid     = "JwtSigningKeyRead"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      "arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/staging/jwt/signing-key-*",
    ]
  }

  # Admin-email lookup for escalation cc/inbox routing (tenant config read).
  statement {
    sid     = "ConfigBucketReadAdminLookup"
    actions = ["s3:GetObject"]
    resources = [
      "${var.tenant_config_bucket_arn}/tenants/*/config.json",
      "${var.tenant_config_bucket_arn}/tenants/*/*-config.json",
    ]
  }
}

resource "aws_iam_role_policy" "attend_exec" {
  name   = "attendance-disposition-exec"
  role   = aws_iam_role.attend.id
  policy = data.aws_iam_policy_document.attend_exec.json
}

# ==============================================================================
# Lambda function (placeholder code; real handler lands via lambda-repo CI)
# ==============================================================================

data "archive_file" "attend_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "attend" {
  function_name = "Attendance_Disposition_Handler"
  role          = aws_iam_role.attend.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  # 256MB / 60s: a few DDB item-ops + up to a handful of sender invokes per fire
  # (escalate cc-fans). Not a public endpoint (role-invoked only) -- no reserved
  # concurrency cap needed.
  memory_size   = 256
  timeout       = 60
  architectures = ["x86_64"]

  filename         = data.archive_file.attend_placeholder.output_path
  source_code_hash = data.archive_file.attend_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT            = "staging"
      BOOKING_TABLE          = var.booking_table_name
      BOOKING_START_AT_INDEX = "tenantId-start_at-index"
      REDEMPTION_BASE_URL    = var.redemption_base_url
      SEND_EMAIL_FUNCTION    = "send_email"
      SMS_SENDER_FUNCTION    = "SMS_Sender"
      JWT_SECRET_KEY_NAME    = "picasso/staging/jwt/signing-key"
      CONFIG_BUCKET          = var.tenant_config_bucket_name
      AWS_REQUEST_TIMEOUT_MS = "5000"
      # AWS_CONNECTION_TIMEOUT_MS / AWS_MAX_ATTEMPTS use code defaults (3000 / 2).
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.attend, aws_iam_role_policy.attend_exec]
}

# ------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------

output "function_arn" {
  description = "ARN of Attendance_Disposition_Handler (the monitor's disposition-cycle invoke target; later the REMIND attendance-schedule target)."
  value       = aws_lambda_function.attend.arn
}

output "function_name" {
  value = aws_lambda_function.attend.function_name
}

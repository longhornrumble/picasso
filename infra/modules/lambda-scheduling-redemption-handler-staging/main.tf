# Scheduling sub-phase D Task D4 — Scheduling_Redemption_Handler Lambda (the
# one-tap action-token redemption endpoint). The CloudFront custom origin behind
# the WS-D3 staging.schedule.myrecruiter.ai distribution. It:
#   1. maps the six §13.8 URL slugs to token purposes
#   2. validates + atomically one-time-redeems the action token via
#      shared/scheduling/tokens.js redeem() (§13.7 conditional jti PutItem)
#   3. either writes the §B10 session-context binding row + 302-redirects the
#      volunteer into chat (cancel/reschedule/recovery — the token authenticates
#      ENTRY only; the calendar op runs in-chat after confirm, WS-D6/D7), or
#      renders a thin attendance acknowledgement (interviewer dispositions TODO(E6)).
# Handler + tests live in Lambdas/lambda/Scheduling_Redemption_Handler (PR #205,
# merged to lambda main). This module is the integrator-owned IaC for it.
#
# Dedicated execution role per CLAUDE.md "Never share IAM roles" rule
# (lambda#44 lesson). NO wildcards on secrets or DynamoDB.
#
# IAM scoped to ACTUAL merged-code usage (ground-truthed against
# origin/main:Scheduling_Redemption_Handler/index.js + the shared/scheduling/
# tokens.js it bundles). Exactly THREE DynamoDB item-ops + ONE secret:
#   - Booking table: GetItem ONLY (index.js:260 — recovery-context read; no
#     write, no GSI/Query).
#   - ConversationSchedulingSession table: PutItem ONLY (index.js:308 — the §B10
#     binding row write; no read here, the chat side reads it via resolveBinding).
#   - jti-blacklist table: PutItem ONLY, conditional attribute_not_exists(jti)
#     (tokens.js:378 — the §13.7 one-time-redeem burn; no GetItem).
#   - Secrets Manager: the shared HS256 JWT signing key (tokens.js verify/redeem
#     mirror Master_Function get_jwt_signing_key). Single secret, NOT per-tenant.
# D4 does NO calendar / Zoom / SES / SNS work (those run in-chat, WS-D6/D7), so
# this role grants none of those — narrower than the sibling commit handler.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "booking_table_arn" {
  description = "ARN of picasso-booking-staging. Scheduling_Redemption_Handler GetItem only (recovery-context read at index.js:260)."
  type        = string
}

variable "booking_table_name" {
  type = string
}

variable "conversation_scheduling_session_table_arn" {
  description = "ARN of picasso-conversation-scheduling-session-staging. PutItem only — the §B10 session-context binding row write (index.js:308)."
  type        = string
}

variable "conversation_scheduling_session_table_name" {
  type = string
}

variable "jti_blacklist_table_arn" {
  description = "ARN of picasso-token-jti-blacklist-staging. PutItem only, conditional attribute_not_exists(jti) — the §13.7 one-time-redeem burn via tokens.js:378."
  type        = string
}

variable "jti_blacklist_table_name" {
  type = string
}

variable "ops_alerts_topic_arn" {
  description = "ARN of the ops-alerts SNS topic (shared, ops-alarms-master-function-staging). The Errors alarm below targets it. The handler itself does NOT publish to SNS, so no sns:Publish grant."
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

resource "aws_kms_key" "redemption_logs" {
  description             = "KMS key for Scheduling_Redemption_Handler CloudWatch logs. Phase C.2 pattern; dedicated per-Lambda KMS key."
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
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Scheduling_Redemption_Handler"
          }
        }
      },
    ]
  })

  tags = {
    Name     = "picasso-scheduling-redemption-logs-staging"
    Subphase = "D4"
  }
}

resource "aws_kms_alias" "redemption_logs" {
  name          = "alias/picasso-scheduling-redemption-logs-staging"
  target_key_id = aws_kms_key.redemption_logs.key_id
}

resource "aws_cloudwatch_log_group" "redemption" {
  name              = "/aws/lambda/Scheduling_Redemption_Handler"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.redemption_logs.arn
}

# ==============================================================================
# IAM execution role (dedicated per CLAUDE.md "Never share IAM roles" rule)
# ==============================================================================

resource "aws_iam_role" "redemption" {
  name = "Scheduling_Redemption_Handler-exec-staging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Subphase = "D4"
  }
}

data "aws_iam_policy_document" "redemption_exec" {
  # CloudWatch logs (group + streams)
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.redemption.arn}:*"]
  }

  # Booking table: GetItem only — the recovery-context read (index.js:260). No
  # write, no GSI/Query (the redemption handler reads a single booking by key).
  statement {
    sid       = "DDBBookingGetItem"
    actions   = ["dynamodb:GetItem"]
    resources = [var.booking_table_arn]
  }

  # ConversationSchedulingSession table: PutItem only — the §B10 binding row
  # write (index.js:308). The chat side reads this row (resolveBinding); the
  # redemption handler never reads it.
  statement {
    sid       = "DDBConvSchedulingSessionPut"
    actions   = ["dynamodb:PutItem"]
    resources = [var.conversation_scheduling_session_table_arn]
  }

  # jti-blacklist table: PutItem only, conditional attribute_not_exists(jti) —
  # the §13.7 one-time-redeem burn (tokens.js:378). A conditional PutItem is the
  # entire jti footprint; no GetItem.
  statement {
    sid       = "DDBJtiBlacklistConditionalPut"
    actions   = ["dynamodb:PutItem"]
    resources = [var.jti_blacklist_table_arn]
  }

  # Shared HS256 JWT signing key for tokens.js verify()/redeem() (the signed
  # cancel/reschedule action links). Same secret chat-session JWTs use; the iss
  # claim distinguishes them. Single secret, NOT per-tenant. The -* matches the
  # AWS-generated ARN suffix. GetSecretValue ONLY — tokens.js never calls
  # DescribeSecret (A1 audit S-1: drop the metadata-read grant; least-priv).
  statement {
    sid     = "SecretsReadJwtSigningKey"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      "arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/staging/jwt/signing-key-*"
    ]
  }
}

resource "aws_iam_role_policy" "redemption_exec" {
  name   = "scheduling-redemption-exec"
  role   = aws_iam_role.redemption.id
  policy = data.aws_iam_policy_document.redemption_exec.json
}

# ==============================================================================
# Lambda function (placeholder code; real handler lands via lambda-repo CI)
# ==============================================================================

data "archive_file" "redemption_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "redemption" {
  function_name = "Scheduling_Redemption_Handler"
  role          = aws_iam_role.redemption.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  # 256MB / 15s: a fast validate-token -> conditional-burn -> write-binding ->
  # 302 path (two DDB item-ops + one Secrets read + a redirect). No remote
  # calendar/email calls (those run in-chat), so it needs neither the commit
  # handler's 512MB nor its 90s SLA headroom.
  memory_size = 256
  timeout     = 15
  # Cap concurrency: this is a PUBLIC (CloudFront-fronted, AuthType NONE)
  # endpoint, so reserved concurrency bounds the blast radius / Lambda spend of a
  # token-scan flood. Legitimate redemptions are low-volume (one per email-link
  # tap); 5 is ample. WAF in front is the P22 follow-up. (FLAG for A1 audit: this
  # also caps availability under flood — acceptable at staging/pilot scale.)
  reserved_concurrent_executions = 5
  architectures                  = ["x86_64"]

  filename         = data.archive_file.redemption_placeholder.output_path
  source_code_hash = data.archive_file.redemption_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT                           = "staging"
      BOOKING_TABLE                         = var.booking_table_name
      CONVERSATION_SCHEDULING_SESSION_TABLE = var.conversation_scheduling_session_table_name
      JTI_BLACKLIST_TABLE                   = var.jti_blacklist_table_name
      CHAT_REDIRECT_BASE_URL                = "https://staging.chat.myrecruiter.ai"
      SESSION_BINDING_TTL_SECONDS           = "1800"
      JWT_SECRET_KEY_NAME                   = "picasso/staging/jwt/signing-key"
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code lands via lambda-repo CI matrix (aws lambda update-function-code,
    # deploy-staging.yml). Env vars are Terraform-managed (NOT ignored).
    #
    # KNOWN HAZARD (sibling-module phase-audit G8): despite this ignore_changes,
    # a `terraform apply` triggered by a change to a DEPENDED-ON resource (the
    # IAM policy below, or this module's env vars) can re-deploy the placeholder
    # zip OVER the real CI-deployed code — the regression that hit
    # lambda-pii-dsar-staging on 2026-05-26 and is re-flagged on the sibling
    # commit handler. AFTER ANY apply that touches this module, re-verify the
    # live CodeSha256 is NOT the placeholder and re-run the CI deploy if it is:
    #   aws lambda get-function-configuration --function-name Scheduling_Redemption_Handler \
    #     --query CodeSha256
    #   gh workflow run "Deploy Lambda — Staging" -f lambda=Scheduling_Redemption_Handler
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.redemption, aws_iam_role_policy.redemption_exec]
}

# ==============================================================================
# Function URL — the CloudFront custom origin (WS-D3). AuthType NONE: this is a
# public redemption endpoint fronted by the staging.schedule CloudFront dist; the
# signed one-time action token IN the URL is the authentication (validated +
# burned by tokens.js). No IAM auth, no CORS (server-side 302 redirect, not a
# browser fetch).
# ==============================================================================

resource "aws_lambda_function_url" "redemption" {
  function_name      = aws_lambda_function.redemption.function_name
  authorization_type = "NONE"
}

# Resource-based permission #1 of 2 for the public Function URL. This creates
# the `FunctionURLAllowPublicAccess` statement (action lambda:InvokeFunctionUrl,
# condition lambda:FunctionUrlAuthType=NONE). (A1 audit B-2.)
resource "aws_lambda_permission" "redemption_url" {
  statement_id           = "FunctionURLAllowPublicAccess"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.redemption.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

# ──────────────────────────────────────────────────────────────────────
# # MANUAL STEP REQUIRED — Function URL 2nd resource-policy statement
# ──────────────────────────────────────────────────────────────────────
# EMPIRICAL (2026-06-03, A1 live-verify): in THIS account, statement #1 above
# is NECESSARY BUT NOT SUFFICIENT — the Function URL returns HTTP 403 until a
# SECOND statement exists that the Terraform provider CANNOT express:
#
#   Sid:       FunctionURLAllowInvokeAction
#   Action:    lambda:InvokeFunction              (NOT InvokeFunctionUrl)
#   Principal: *
#   Condition: Bool { lambda:InvokedViaFunctionUrl = "true" }
#
# (Same shape the working Bedrock_Streaming_Handler_Staging carries; likely an
# Org SCP/RCP requires it.) aws_lambda_permission has no parameter for the
# `lambda:InvokedViaFunctionUrl` condition, and `aws lambda add-permission`
# cannot set it either without producing an UNCONDITIONED public-invoke (a
# security hole). Only the AWS Console adds the correctly-conditioned statement.
#
# After Terraform first creates this Lambda + Function URL, add it ONCE:
#   AWS Console → Lambda → Scheduling_Redemption_Handler → Configuration tab
#     → Function URL → Edit → (no changes) → Save
#   Verify: aws lambda get-policy --function-name Scheduling_Redemption_Handler
#     | jq '.Statement[].Sid'  → TWO sids, incl. FunctionURLAllowInvokeAction
#   Smoke:  curl <function-url>  → NOT 403 (placeholder 503 until A3 deploys code)
#
# DONE for staging 2026-06-03 (operator). The statement persists across future
# `terraform apply` runs (aws_lambda_function_url does not manage individual
# policy statements). It MUST be re-added if the Lambda is destroyed/recreated.
# ──────────────────────────────────────────────────────────────────────

# ==============================================================================
# CloudWatch alarms
# ==============================================================================

# Errors >= 1 in any 5-minute period.
resource "aws_cloudwatch_metric_alarm" "redemption_errors" {
  alarm_name          = "Scheduling_Redemption_Handler-errors"
  alarm_description   = "Scheduling_Redemption_Handler Lambda errors >= 1 in any 5-minute period. The redemption edge — investigate via CloudWatch logs: /aws/lambda/Scheduling_Redemption_Handler."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.redemption.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# Throttles >= 1 in any 1-minute period. SEPARATE from Errors (a throttle is NOT
# a Lambda error and never trips the Errors alarm). On a PUBLIC endpoint with
# reserved_concurrent_executions = 5, a token-scan flood throttles legitimate
# email-link redemptions SILENTLY without this alarm. (A1 audit S-2.)
resource "aws_cloudwatch_metric_alarm" "redemption_throttles" {
  alarm_name          = "Scheduling_Redemption_Handler-throttles"
  alarm_description   = "Scheduling_Redemption_Handler Lambda throttles >= 1 in any 1-minute period. The reserved-concurrency cap (5) is being hit — legitimate redemptions may be getting 429s. Investigate for a flood (token-scan) vs a genuine traffic spike."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Throttles"
  namespace   = "AWS/Lambda"
  period      = 60
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.redemption.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# ==============================================================================
# Outputs
# ==============================================================================

output "redemption_function_name" {
  value = aws_lambda_function.redemption.function_name
}

output "redemption_function_arn" {
  value = aws_lambda_function.redemption.arn
}

output "redemption_role_arn" {
  value = aws_iam_role.redemption.arn
}

output "function_url" {
  description = "Full Function URL (https://<id>.lambda-url.<region>.on.aws/)."
  value       = aws_lambda_function_url.redemption.function_url
}

output "function_url_domain" {
  description = "Bare host of the Function URL (no scheme, no trailing slash) — the value to wire into the WS-D3 module's redemption_function_url_domain (the CloudFront custom origin) at A2."
  value       = replace(replace(aws_lambda_function_url.redemption.function_url, "https://", ""), "/", "")
}

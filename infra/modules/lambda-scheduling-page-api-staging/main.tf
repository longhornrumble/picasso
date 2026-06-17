# Scheduling PAGE M1 — Scheduling_Page_Api Lambda (the deterministic Calendly-style
# scheduling-page gateway). The SAME-ORIGIN /schedule-api endpoint behind the widget
# CloudFront dist (cloudfront-widget-staging). It is NOT routed through the chat agent:
#   1. hash -> tenantId  (Query TenantHashIndex GSI on the tenant registry — the
#      public page is identified by the tenantHash, NEVER the raw tenant_id)
#   2. resolveBinding({tenantId, sessionId})  (shared/scheduling/sessionBinding.js §B12 —
#      the §B10 session-context binding row IS the auth; intent-gated, 30-min TTL; NO token)
#   3. load the booking (GetItem on the Booking table, booking_id from the binding)
#   4. invoke the SHIPPED Booking_Commit_Handler scheduling_propose / scheduling_mutate
#      seam (the same deterministic seam the agent path uses) — NO new executor.
# Handler + tests live in Lambdas/lambda/Scheduling_Page_Api (PR #330, merged to lambda
# main). This module is the integrator-owned IaC for it.
#
# Dedicated execution role per CLAUDE.md "Never share IAM roles" rule (lambda#44 lesson).
# NO wildcards on DynamoDB; NO secrets, NO S3, NO calendar/Zoom/SES/SNS (all of that is
# inside Booking_Commit_Handler, which the gateway only invokes).
#
# IAM scoped to ACTUAL merged-code usage (ground-truthed against
# origin/main:Scheduling_Page_Api/index.js + the shared/scheduling/sessionBinding.js it
# bundles). Exactly THREE DynamoDB read-ops + ONE lambda invoke:
#   - Tenant registry: Query on the TenantHashIndex GSI ONLY (index.js:130 — hash->tenantId;
#     no base-table GetItem, no write).
#   - Booking table: GetItem ONLY (index.js:158 — load the booking by id; no write).
#   - SchedulingSession table: GetItem ONLY (sessionBinding.js:85 resolveBinding — the §B10
#     binding read; the MERGED gateway does NOT delete/burn the binding, so no DeleteItem).
#   - Booking_Commit_Handler: lambda:InvokeFunction ONLY (index.js:182 — the propose/mutate seam).

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "booking_table_arn" {
  description = "ARN of picasso-booking-staging. Scheduling_Page_Api GetItem only (load booking at index.js:158)."
  type        = string
}

variable "booking_table_name" {
  type = string
}

variable "scheduling_session_table_arn" {
  description = "ARN of picasso-conversation-scheduling-session-staging. GetItem only — resolveBinding reads the §B10 binding row (sessionBinding.js:85). NOTE: the gateway env var is SCHEDULING_SESSION_TABLE."
  type        = string
}

variable "scheduling_session_table_name" {
  type = string
}

variable "tenant_registry_table_arn" {
  description = "ARN of picasso-tenant-registry-staging. Query on the TenantHashIndex GSI only — public tenantHash -> tenant_id (index.js:130). No base-table GetItem, no write."
  type        = string
}

variable "tenant_registry_table_name" {
  type = string
}

variable "bch_function_arn" {
  description = "ARN of Booking_Commit_Handler. lambda:InvokeFunction only — the scheduling_propose / scheduling_mutate seam (index.js:182)."
  type        = string
}

variable "bch_function_name" {
  description = "Name of Booking_Commit_Handler — the SCHEDULING_EXECUTOR_FUNCTION_NAME env value the gateway invokes."
  type        = string
}

variable "ops_alerts_topic_arn" {
  description = "ARN of the ops-alerts SNS topic (shared, ops-alarms-master-function-staging). The Errors + Throttles alarms below target it. The gateway itself does NOT publish to SNS, so no sns:Publish grant."
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

resource "aws_kms_key" "page_api_logs" {
  description             = "KMS key for Scheduling_Page_Api CloudWatch logs. Phase C.2 pattern; dedicated per-Lambda KMS key."
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
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Scheduling_Page_Api"
          }
        }
      },
    ]
  })

  tags = {
    Name     = "picasso-scheduling-page-api-logs-staging"
    Subphase = "PAGE-M1"
  }
}

resource "aws_kms_alias" "page_api_logs" {
  name          = "alias/picasso-scheduling-page-api-logs-staging"
  target_key_id = aws_kms_key.page_api_logs.key_id
}

resource "aws_cloudwatch_log_group" "page_api" {
  name              = "/aws/lambda/Scheduling_Page_Api"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.page_api_logs.arn
}

# ==============================================================================
# IAM execution role (dedicated per CLAUDE.md "Never share IAM roles" rule)
# ==============================================================================

resource "aws_iam_role" "page_api" {
  name                 = "Scheduling_Page_Api-exec-staging"
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
    Subphase = "PAGE-M1"
  }
}

data "aws_iam_policy_document" "page_api_exec" {
  # CloudWatch logs (group + streams)
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.page_api.arn}:*"]
  }

  # Tenant registry GSI: Query only — public tenantHash -> tenant_id (index.js:130,
  # IndexName 'TenantHashIndex'). The action is granted on the INDEX ARN; no
  # base-table GetItem, no write. (The public page is keyed by the hash, never the
  # raw tenant_id.)
  statement {
    sid       = "DDBTenantRegistryQueryHashIndex"
    actions   = ["dynamodb:Query"]
    resources = ["${var.tenant_registry_table_arn}/index/TenantHashIndex"]
  }

  # Booking table: GetItem only — load the booking by id (index.js:158). No write,
  # no GSI/Query.
  statement {
    sid       = "DDBBookingGetItem"
    actions   = ["dynamodb:GetItem"]
    resources = [var.booking_table_arn]
  }

  # SchedulingSession table: GetItem only — resolveBinding reads the §B10 binding
  # row (sessionBinding.js:85). The MERGED gateway never deletes/burns the binding
  # (intent-gate + 30-min TTL are the replay controls), so no DeleteItem.
  statement {
    sid       = "DDBSchedulingSessionGetItem"
    actions   = ["dynamodb:GetItem"]
    resources = [var.scheduling_session_table_arn]
  }

  # Booking_Commit_Handler: InvokeFunction only — the scheduling_propose /
  # scheduling_mutate seam (index.js:182). The gateway adds NO calendar/email/SNS
  # of its own; all of that runs inside BCH under BCH's own role.
  statement {
    sid       = "InvokeBookingCommitHandler"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.bch_function_arn]
  }
}

resource "aws_iam_role_policy" "page_api_exec" {
  name   = "scheduling-page-api-exec"
  role   = aws_iam_role.page_api.id
  policy = data.aws_iam_policy_document.page_api_exec.json
}

# ==============================================================================
# Lambda function (placeholder code; real handler lands via lambda-repo CI)
# ==============================================================================

data "archive_file" "page_api_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "page_api" {
  function_name = "Scheduling_Page_Api"
  role          = aws_iam_role.page_api.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  # 256MB / 30s: the gateway is light orchestration (2 DDB reads + 1 Lambda invoke);
  # the heavy calendar/freeBusy work runs inside Booking_Commit_Handler. BUT the
  # gateway INVOKES BCH synchronously and waits up to BCH_INVOKE_TIMEOUT_MS (25s
  # default, index.js) — so the Lambda timeout must exceed 25s. 30s gives headroom
  # for the 2 DDB reads + invoke + BCH worst-case without an early Lambda-level cut.
  memory_size = 256
  timeout     = 30
  # Cap concurrency: this is a PUBLIC (CloudFront-fronted, AuthType NONE) endpoint,
  # so reserved concurrency bounds the blast radius / Lambda spend of a flood. The
  # §B10 binding (intent-gated, 30-min TTL) is the real auth — propose/mutate return
  # 401 before any BCH/Google call without a valid binding — and the widget dist's
  # WAF (RateLimitPerIP 300/IP/5min + the /schedule-api* path-scoped 30/IP rule) is
  # the rate control. 5 is ample for legitimate one-page-per-link traffic.
  reserved_concurrent_executions = 5
  architectures                  = ["x86_64"]

  filename         = data.archive_file.page_api_placeholder.output_path
  source_code_hash = data.archive_file.page_api_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT           = "staging"
      BOOKING_TABLE         = var.booking_table_name
      TENANT_REGISTRY_TABLE = var.tenant_registry_table_name
      # sessionBinding.js reads SCHEDULING_SESSION_TABLE (NOT the redemption
      # handler's CONVERSATION_SCHEDULING_SESSION_TABLE) — value is the same table.
      SCHEDULING_SESSION_TABLE          = var.scheduling_session_table_name
      SCHEDULING_EXECUTOR_FUNCTION_NAME = var.bch_function_name
      PAGE_ALLOWED_ORIGIN               = "https://staging.chat.myrecruiter.ai"
      DEFAULT_TIMEZONE                  = "America/Chicago"
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code lands via lambda-repo CI matrix (aws lambda update-function-code,
    # deploy-staging.yml). Env vars are Terraform-managed (NOT ignored).
    #
    # KNOWN HAZARD (sibling redemption module phase-audit G8): despite this
    # ignore_changes, a `terraform apply` triggered by a change to a DEPENDED-ON
    # resource (the IAM policy above, or this module's env vars) can re-deploy the
    # placeholder zip OVER the real CI-deployed code. AFTER ANY apply that touches
    # this module, re-verify the live CodeSha256 is NOT the placeholder; re-run the
    # CI deploy if it is:
    #   aws lambda get-function-configuration --function-name Scheduling_Page_Api --query CodeSha256
    #   gh workflow run "Deploy Lambda — Staging" -f lambda=Scheduling_Page_Api
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.page_api, aws_iam_role_policy.page_api_exec]
}

# ==============================================================================
# Function URL — the CloudFront custom origin (cloudfront-widget-staging
# /schedule-api* behavior). AuthType NONE: this is a public same-origin endpoint
# fronted by the widget CloudFront dist; the §B10 session binding (resolved from
# the {hash, session} in the request body) is the authentication, NOT IAM. No CORS
# config here — the browser talks to CloudFront same-origin (staging.chat), and
# CloudFront -> Function URL is server-to-server.
#
# ADVERSARIAL FINDING B-2 (accepted-with-mitigations, matches the sibling redemption
# handler's posture): the raw Function URL host is publicly reachable and bypasses the
# CloudFront-scope WAF (the /schedule-api* path rate rule + the global 300/IP rule only
# apply to requests routed THROUGH CloudFront). Mitigations that make this acceptable
# at staging/pilot scale: (1) the §B10 binding-auth — propose/mutate return 401 BEFORE
# any BCH/Google call without a valid, intent-gated, 30-min-TTL binding (minted only by
# redeeming a one-time email-link token); (2) reserved_concurrent_executions=5 caps the
# flood blast-radius; (3) the raw host is a random AWS-assigned string never emitted to
# the browser (the page calls the relative /schedule-api). Tighter options if prod
# requires them (OPERATOR DECISION, tracked): attach a REGIONAL wafv2 ACL directly to
# the Function URL (aws_wafv2_web_acl_association — no code change), or add an
# x-picasso-cf-origin shared-secret header check like MFS/BSH (a gateway CODE change).
# Deferred to match the redemption handler (same exposure, same accepted mitigations).
# ==============================================================================

resource "aws_lambda_function_url" "page_api" {
  function_name      = aws_lambda_function.page_api.function_name
  authorization_type = "NONE"
}

# Resource-based permission #1 of 2 for the public Function URL. Creates the
# `FunctionURLAllowPublicAccess` statement (action lambda:InvokeFunctionUrl,
# condition lambda:FunctionUrlAuthType=NONE).
resource "aws_lambda_permission" "page_api_url" {
  statement_id           = "FunctionURLAllowPublicAccess"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.page_api.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

# ──────────────────────────────────────────────────────────────────────
# # MANUAL STEP REQUIRED — Function URL 2nd resource-policy statement
# ──────────────────────────────────────────────────────────────────────
# EMPIRICAL (2026-06-03, redemption-handler A1 live-verify; SAME account): in THIS
# account, statement #1 above is NECESSARY BUT NOT SUFFICIENT — the Function URL
# returns HTTP 403 until a SECOND statement exists that the Terraform provider
# CANNOT express:
#
#   Sid:       FunctionURLAllowInvokeAction
#   Action:    lambda:InvokeFunction              (NOT InvokeFunctionUrl)
#   Principal: *
#   Condition: Bool { lambda:InvokedViaFunctionUrl = "true" }
#
# (Same shape Bedrock_Streaming_Handler_Staging + Scheduling_Redemption_Handler
# carry; likely an Org SCP/RCP requires it.) aws_lambda_permission has no parameter
# for the `lambda:InvokedViaFunctionUrl` condition, and `aws lambda add-permission`
# cannot set it either without producing an UNCONDITIONED public-invoke (a security
# hole). Only the AWS Console adds the correctly-conditioned statement.
#
# >>> UNTIL THIS STEP IS DONE, /schedule-api will return 403 (not 401) even after
#     the CloudFront behavior + gateway deploy. 401 (invalid binding) is the
#     success signal that the gateway is actually executing. <<<
#
# After Terraform first creates this Lambda + Function URL, add it ONCE:
#   AWS Console → Lambda → Scheduling_Page_Api → Configuration tab
#     → Function URL → Edit → (no changes) → Save
#   Verify: aws lambda get-policy --function-name Scheduling_Page_Api \
#     | jq '.Statement[].Sid'  → TWO sids, incl. FunctionURLAllowInvokeAction
#   Smoke:  curl <function-url>  → NOT 403 (placeholder 503/JSON until the real deploy)
#
# The statement persists across future `terraform apply` runs (aws_lambda_function_url
# does not manage individual policy statements). It MUST be re-added if the Lambda is
# destroyed/recreated.
# ──────────────────────────────────────────────────────────────────────

# ==============================================================================
# CloudWatch alarms
# ==============================================================================

# Errors >= 1 in any 5-minute period.
resource "aws_cloudwatch_metric_alarm" "page_api_errors" {
  alarm_name          = "Scheduling_Page_Api-errors"
  alarm_description   = "Scheduling_Page_Api Lambda errors >= 1 in any 5-minute period. The deterministic scheduling-page gateway — investigate via CloudWatch logs: /aws/lambda/Scheduling_Page_Api."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.page_api.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# Throttles >= 1 in any 1-minute period. SEPARATE from Errors (a throttle is NOT a
# Lambda error and never trips the Errors alarm). On a PUBLIC endpoint with
# reserved_concurrent_executions = 5, a flood throttles legitimate page traffic
# SILENTLY without this alarm.
resource "aws_cloudwatch_metric_alarm" "page_api_throttles" {
  alarm_name          = "Scheduling_Page_Api-throttles"
  alarm_description   = "Scheduling_Page_Api Lambda throttles >= 1 in any 1-minute period. The reserved-concurrency cap (5) is being hit — legitimate page requests may be getting 429s. Investigate for a flood vs a genuine traffic spike."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Throttles"
  namespace   = "AWS/Lambda"
  period      = 60
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.page_api.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# ==============================================================================
# Outputs
# ==============================================================================

output "page_api_function_name" {
  value = aws_lambda_function.page_api.function_name
}

output "page_api_function_arn" {
  value = aws_lambda_function.page_api.arn
}

output "page_api_role_arn" {
  value = aws_iam_role.page_api.arn
}

output "function_url" {
  description = "Full Function URL (https://<id>.lambda-url.<region>.on.aws/)."
  value       = aws_lambda_function_url.page_api.function_url
}

output "function_url_domain" {
  description = "Bare host of the Function URL (no scheme, no trailing slash) — the value wired into cloudfront-widget-staging's scheduling_page_api_origin_domain (the /schedule-api* custom origin)."
  value       = replace(replace(aws_lambda_function_url.page_api.function_url, "https://", ""), "/", "")
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

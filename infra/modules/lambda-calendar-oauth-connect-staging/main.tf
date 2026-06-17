# Scheduling sub-phase E Task E11 — Calendar_OAuth_Connect Lambda (the per-staff
# Google Calendar 3LO consent flow). The 2nd CloudFront custom origin behind the
# WS-D3 staging.schedule.myrecruiter.ai distribution. Three public GET routes:
#   /connect?init=<token>   verify signed init-token -> build the Google consent
#                           URL (host-allowlisted to accounts.google.com) -> 302.
#   /oauth/callback         code -> refresh_token -> write the per-coordinator
#                           OAuth secret -> fire the B5 watch onboarder (best-
#                           effort) -> success page.
#   /connection/status      probeRefresh: invalid_grant -> markDisconnected;
#                           transient/5xx/invalid_client -> stale (NOT disconnect).
# Handler + tests live in Lambdas/lambda/Calendar_OAuth_Connect (lambda#248,
# merged to lambda main). This module is the integrator-owned IaC for it
# (FROZEN_CONTRACTS §E11; DEPLOY_NOTES.md is the provisioning spec).
#
# Dedicated execution role per CLAUDE.md "Never share IAM roles" rule
# (lambda#44 lesson). NO wildcards beyond the per-coordinator secret prefix,
# which is itself fenced by a StringNotLike that excludes the reserved `_*`
# platform secrets (defense-in-depth with secrets.js's code-level guard).
#
# IAM scoped to ACTUAL merged-code usage (ground-truthed against
# origin/main:Calendar_OAuth_Connect/{index,oauth,secrets,state,revocation}.js +
# the shared/scheduling/featureGate.js it bundles):
#   - Secrets Manager READ on the two reserved platform secrets (state.js reads
#     the state-signing key; secrets.js reads the platform app secret).
#   - Secrets Manager Get/Describe/Put/CreateSecret on the per-coordinator
#     prefix EXCEPT the reserved `_*` secrets (secrets.js is the first
#     programmatic WRITER of picasso/scheduling/oauth/{tenant}/{coordinator}).
#   - lambda:InvokeFunction on the B5 watch onboarder (index.js best-effort fire
#     after a successful connect).
#   - s3:GetObject on the tenant-config bucket /tenants/* (featureGate.js Flag-A
#     gate read at index.js:209; fail-closes to DISABLED on any miss/error).
# No SES/SNS, no Zoom. DynamoDB = ONLY the jti-blacklist conditional PutItem
# (Track 2 init-token single-use burn) — nothing else.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "tenant_config_bucket_arn" {
  description = "ARN of the staging tenant-config bucket. featureGate.js GetObject on /tenants/* only (Flag-A gate at index.js:209)."
  type        = string
}

variable "config_bucket_name" {
  description = "Name of the staging tenant-config bucket -> CONFIG_BUCKET env (featureGate.js)."
  type        = string
}

variable "onboarder_function_arn" {
  description = "ARN of Calendar_Watch_Onboarder. index.js best-effort lambda:InvokeFunction after a successful connect."
  type        = string
}

variable "onboarder_function_name" {
  description = "Name of Calendar_Watch_Onboarder -> ONBOARDER_FUNCTION_NAME env."
  type        = string
}

variable "offboarder_function_arn" {
  description = "ARN of Calendar_Watch_Offboarder. The §E11b /connection/disconnect route best-effort async-invokes it (lambda#294)."
  type        = string
}

variable "offboarder_function_name" {
  description = "Name of Calendar_Watch_Offboarder -> OFFBOARDER_FUNCTION_NAME env."
  type        = string
}

variable "ops_alerts_topic_arn" {
  description = "ARN of the ops-alerts SNS topic. The Errors/Throttles alarms target it. The handler itself does NOT publish to SNS, so no sns:Publish grant."
  type        = string
}

variable "dashboard_return_url" {
  description = "Where the browser lands after a successful connect -> DASHBOARD_RETURN_URL env. The staging dashboard scheduling page (https)."
  type        = string
  default     = "https://staging.app.myrecruiter.ai"
}

variable "jti_blacklist_table_arn" {
  description = "ARN of picasso-token-jti-blacklist. Track 2 init-token single-use: /connect burns the init jti via conditional PutItem (attribute_not_exists) -- same footprint as the redemption handler. PutItem ONLY."
  type        = string
}

variable "jti_blacklist_table_name" {
  type = string
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

resource "aws_kms_key" "oauth_logs" {
  description             = "KMS key for Calendar_OAuth_Connect CloudWatch logs. Phase C.2 pattern; dedicated per-Lambda KMS key."
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
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Calendar_OAuth_Connect"
          }
        }
      },
    ]
  })

  tags = {
    Name     = "picasso-scheduling-oauth-logs-staging"
    Subphase = "E11"
  }
}

resource "aws_kms_alias" "oauth_logs" {
  name          = "alias/picasso-scheduling-oauth-logs-staging"
  target_key_id = aws_kms_key.oauth_logs.key_id
}

resource "aws_cloudwatch_log_group" "oauth" {
  name              = "/aws/lambda/Calendar_OAuth_Connect"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.oauth_logs.arn
}

# ==============================================================================
# IAM execution role (dedicated per CLAUDE.md "Never share IAM roles" rule)
# ==============================================================================

resource "aws_iam_role" "oauth" {
  name                 = "Calendar_OAuth_Connect-exec-staging"
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
    Subphase = "E11"
  }
}

data "aws_iam_policy_document" "oauth_exec" {
  # CloudWatch logs (streams; the group is created above)
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.oauth.arn}:*"]
  }

  # READ the two reserved platform secrets: the HMAC state-signing key (state.js)
  # and the Google platform app creds (secrets.js). GetSecretValue only.
  statement {
    sid     = "ReadPlatformAndStateSecrets"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      "arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/_platform/google-app-*",
      "arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/_state-signing-key-*",
    ]
  }

  # MANAGE the per-coordinator OAuth secrets (secrets.js: the first programmatic
  # writer of picasso/scheduling/oauth/{tenant}/{coordinator}). The StringNotLike
  # condition fences off the reserved `_*` platform secrets at the IAM layer, so
  # the per-coordinator writer cannot write _platform/_state-signing-key even
  # though the resource glob would otherwise include them. Two independent gates
  # (this + the code-level reserved-`_`-prefix guard in secrets.buildSecretPath).
  #
  # G3 audit Sec-B1: the callers pass the SHORT name (e.g.
  # "picasso/scheduling/oauth/_state-signing-key"), not the full ARN, to
  # GetSecretValue. Whether IAM normalizes secretsmanager:SecretId to the ARN
  # before evaluating the condition is version/path-dependent, so a single
  # ARN-format pattern could leave a short-name bypass. Enumerate BOTH the ARN
  # and the short-name forms so the `_*` fence holds regardless.
  statement {
    sid = "ManagePerCoordinatorOAuthSecrets"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
      "secretsmanager:PutSecretValue",
      "secretsmanager:CreateSecret",
    ]
    resources = [
      "arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/*",
    ]
    condition {
      test     = "StringNotLike"
      variable = "secretsmanager:SecretId"
      values = [
        "arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/_*",
        "picasso/scheduling/oauth/_*",
      ]
    }
  }

  # Fire the B5 watch onboarder best-effort after a successful connect (index.js
  # InvokeCommand). lambda:InvokeFunction on the single onboarder ARN only.
  # Track 2 init-token single-use: the /connect jti burn. Conditional PutItem is the
  # entire footprint (no GetItem) -- mirrors the redemption handler's grant.
  statement {
    sid       = "DDBJtiBlacklistConditionalPut"
    actions   = ["dynamodb:PutItem"]
    resources = [var.jti_blacklist_table_arn]
  }

  statement {
    sid       = "FireB5WatchOnboarder"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.onboarder_function_arn]
  }

  # §E11b disconnect: stop + delete the coordinator's watch channels (best-effort,
  # async Event invoke -- mirrors the Onboarder pattern above).
  statement {
    sid       = "FireB5WatchOffboarder"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.offboarder_function_arn]
  }

  # featureGate.js Flag-A gate read (index.js:209): GetObject on the tenant-config
  # bucket /tenants/* only. Fail-closes to DISABLED on any miss/error.
  statement {
    sid       = "ReadTenantConfigForFlagAGate"
    actions   = ["s3:GetObject"]
    resources = ["${var.tenant_config_bucket_arn}/tenants/*"]
  }
}

resource "aws_iam_role_policy" "oauth_exec" {
  name   = "scheduling-oauth-connect-exec"
  role   = aws_iam_role.oauth.id
  policy = data.aws_iam_policy_document.oauth_exec.json
}

# ==============================================================================
# Lambda function (placeholder code; real handler lands via lambda-repo CI)
# ==============================================================================

data "archive_file" "oauth_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "oauth" {
  function_name = "Calendar_OAuth_Connect"
  role          = aws_iam_role.oauth.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  # 256MB / 30s: a connect/callback/status path that makes outbound HTTPS to
  # Google (consent-URL build is local, but the callback exchanges code->token
  # and status runs a refresh probe) plus one Secrets read/write + a best-effort
  # onboarder invoke. The 30s timeout (vs the redemption handler's 15s) gives
  # headroom for the Google round-trips; it stays <= the D3 CloudFront origin
  # read timeout (30s).
  memory_size = 256
  timeout     = 30
  # Cap concurrency: this is a PUBLIC (CloudFront-fronted, AuthType NONE)
  # endpoint, so reserved concurrency bounds the blast radius / Lambda spend of a
  # flood. Legitimate connects are low-volume (one per staff member) + a short
  # status-poll burst; 5 is ample for the single-coordinator staging pilot. (Same
  # rationale as the sibling redemption handler.)
  reserved_concurrent_executions = 5
  architectures                  = ["x86_64"]

  filename         = data.archive_file.oauth_placeholder.output_path
  source_code_hash = data.archive_file.oauth_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT                     = "staging"
      OAUTH_PLATFORM_SECRET_NAME      = "picasso/scheduling/oauth/_platform/google-app"
      OAUTH_STATE_SIGNING_SECRET_NAME = "picasso/scheduling/oauth/_state-signing-key"
      OAUTH_SECRET_PATH_PREFIX        = "picasso/scheduling/oauth"
      OAUTH_REDIRECT_URI              = "https://staging.schedule.myrecruiter.ai/oauth/callback"
      DASHBOARD_RETURN_URL            = var.dashboard_return_url
      ONBOARDER_FUNCTION_NAME         = var.onboarder_function_name
      OFFBOARDER_FUNCTION_NAME        = var.offboarder_function_name
      CONFIG_BUCKET                   = var.config_bucket_name
      JTI_BLACKLIST_TABLE             = var.jti_blacklist_table_name
      STATE_TTL_SECONDS               = "600"
      OAUTH_HTTP_TIMEOUT_MS           = "5000"
      AWS_REQUEST_TIMEOUT_MS          = "5000"
      AWS_CONNECTION_TIMEOUT_MS       = "3000"
      AWS_MAX_ATTEMPTS                = "2"
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
    # zip OVER the real CI-deployed code. AFTER ANY apply that touches this
    # module, re-verify the live CodeSha256 is NOT the placeholder and re-run the
    # CI deploy if it is:
    #   aws lambda get-function-configuration --function-name Calendar_OAuth_Connect \
    #     --query CodeSha256
    #   gh workflow run "Deploy Lambda — Staging" -f lambda=Calendar_OAuth_Connect
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.oauth, aws_iam_role_policy.oauth_exec]
}

# ==============================================================================
# Function URL — the 2nd CloudFront custom origin (WS-D3). AuthType NONE: this is
# a public consent endpoint fronted by the staging.schedule CloudFront dist; the
# signed init/state token IN the URL is the authentication (verified by state.js;
# identity is never client-supplied, so slot-poisoning is impossible). No IAM
# auth. No cors block here: /connect + /oauth/callback are server-side 302s, and
# any cross-origin status polling is governed at the CloudFront response-headers
# layer (a PR-2 / Portal seam), not the Function URL.
# ==============================================================================

resource "aws_lambda_function_url" "oauth" {
  function_name      = aws_lambda_function.oauth.function_name
  authorization_type = "NONE"
}

# Resource-based permission #1 of 2 for the public Function URL. This creates the
# `FunctionURLAllowPublicAccess` statement (action lambda:InvokeFunctionUrl,
# condition lambda:FunctionUrlAuthType=NONE).
resource "aws_lambda_permission" "oauth_url" {
  statement_id           = "FunctionURLAllowPublicAccess"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.oauth.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

# ──────────────────────────────────────────────────────────────────────
# # MANUAL STEP REQUIRED — Function URL 2nd resource-policy statement
# ──────────────────────────────────────────────────────────────────────
# EMPIRICAL (2026-06-03, sibling redemption-handler A1 live-verify): in THIS
# account, statement #1 above is NECESSARY BUT NOT SUFFICIENT — the Function URL
# returns HTTP 403 until a SECOND statement exists that the Terraform provider
# CANNOT express:
#
#   Sid:       FunctionURLAllowInvokeAction
#   Action:    lambda:InvokeFunction              (NOT InvokeFunctionUrl)
#   Principal: *
#   Condition: Bool { lambda:InvokedViaFunctionUrl = "true" }
#
# aws_lambda_permission has no parameter for the `lambda:InvokedViaFunctionUrl`
# condition, and `aws lambda add-permission` cannot set it either without
# producing an UNCONDITIONED public-invoke (a security hole). Only the AWS
# Console adds the correctly-conditioned statement.
#
# After Terraform first creates this Lambda + Function URL, add it ONCE:
#   AWS Console → Lambda → Calendar_OAuth_Connect → Configuration tab
#     → Function URL → Edit → (no changes) → Save
#   Verify: aws lambda get-policy --function-name Calendar_OAuth_Connect \
#     | jq '.Statement[].Sid'  → TWO sids, incl. FunctionURLAllowInvokeAction
#   Smoke:  curl <function-url>  → NOT 403 (placeholder 503 until code deploys)
#
# The statement persists across future `terraform apply` runs. It MUST be
# re-added if the Lambda is destroyed/recreated.
# ──────────────────────────────────────────────────────────────────────

# ==============================================================================
# CloudWatch alarms
# ==============================================================================

# Errors >= 1 in any 5-minute period.
resource "aws_cloudwatch_metric_alarm" "oauth_errors" {
  alarm_name          = "Calendar_OAuth_Connect-errors"
  alarm_description   = "Calendar_OAuth_Connect Lambda errors >= 1 in any 5-minute period. The per-staff Google consent edge — investigate via CloudWatch logs: /aws/lambda/Calendar_OAuth_Connect."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.oauth.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# Throttles >= 1 in any 1-minute period. SEPARATE from Errors (a throttle is NOT
# a Lambda error and never trips the Errors alarm). On a PUBLIC endpoint with
# reserved_concurrent_executions = 5, a flood throttles legitimate connects
# SILENTLY without this alarm.
resource "aws_cloudwatch_metric_alarm" "oauth_throttles" {
  alarm_name          = "Calendar_OAuth_Connect-throttles"
  alarm_description   = "Calendar_OAuth_Connect Lambda throttles >= 1 in any 1-minute period. The reserved-concurrency cap (5) is being hit — legitimate connects/status-polls may be getting 429s. Investigate for a flood vs a genuine traffic spike."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Throttles"
  namespace   = "AWS/Lambda"
  period      = 60
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.oauth.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# ==============================================================================
# Outputs
# ==============================================================================

output "oauth_function_name" {
  value = aws_lambda_function.oauth.function_name
}

output "oauth_function_arn" {
  value = aws_lambda_function.oauth.arn
}

output "oauth_role_arn" {
  value = aws_iam_role.oauth.arn
}

output "function_url" {
  description = "Full Function URL (https://<id>.lambda-url.<region>.on.aws/)."
  value       = aws_lambda_function_url.oauth.function_url
}

output "function_url_domain" {
  description = "Bare host of the Function URL (no scheme, no trailing slash) — the value to wire into the WS-D3 module as the OAuth CloudFront custom origin (PR-2)."
  value       = replace(replace(aws_lambda_function_url.oauth.function_url, "https://", ""), "/", "")
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

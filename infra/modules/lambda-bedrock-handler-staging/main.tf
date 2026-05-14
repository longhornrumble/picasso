variable "function_name" {
  description = "Lambda function name."
  type        = string
  default     = "Bedrock_Streaming_Handler_Staging"
}

variable "tenant_config_bucket_arn" {
  description = "ARN of the staging tenant config S3 bucket."
  type        = string
}

variable "session_summaries_table_arn" {
  description = "ARN of picasso-session-summaries-staging."
  type        = string
}

variable "tenant_registry_table_arn" {
  description = "ARN of picasso-tenant-registry-staging."
  type        = string
}

variable "kb_arns" {
  description = "List of Bedrock Knowledge Base ARNs the Lambda is allowed to Retrieve from. For Issue #5 batch 2b, MYR's KB only."
  type        = list(string)
}

variable "bedrock_model_id" {
  description = "Default Bedrock model ID. BSH index.js fail-loads at module init if this env var is missing — see Phase 4 EC-P4-2 (single point of update for model bumps)."
  type        = string
  default     = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
}

variable "kb_retriever_role_arns" {
  description = "List of cross-account IAM role ARNs the Lambda is allowed to AssumeRole into for KB Retrieve. Bedrock KBs aren't RAM-shareable, so cross-account access requires the staging Lambda to assume a prod-side role that has Retrieve permission. PR A code wraps the Bedrock call with assume-role + cached creds."
  type        = list(string)
  default     = []
}

variable "config_bucket_name" {
  description = "Name of the staging tenant config S3 bucket (for env var)."
  type        = string
}

variable "session_summaries_table_name" {
  description = "Name of session-summaries table (for env var)."
  type        = string
}

variable "tenant_registry_table_name" {
  description = "Name of tenant registry table (for env var)."
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30
}

variable "cf_origin_secret_arn" {
  description = "ARN of the CloudFront origin secret in Secrets Manager (used by Phase 1 v3 CF-origin-header validator in BSH). Optional; when empty, the conditional CfOriginSecretRead IAM Sid is omitted AND REQUIRE_CF_ORIGIN_HEADER env var is set to 'false' automatically. Mirrors the MFS module pattern. Wildcard suffix (`-*`) is accepted to tolerate Secrets Manager rotation; the wildcard widens scope to any future-named secret with this prefix, accepted as residual risk for staging-account use."
  type        = string
  default     = ""
  validation {
    condition     = var.cf_origin_secret_arn == "" || can(regex("^arn:aws:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:", var.cf_origin_secret_arn))
    error_message = "cf_origin_secret_arn must be empty or a valid Secrets Manager ARN."
  }
}

variable "cf_origin_secret_name" {
  description = "Name of the CloudFront origin secret (used by validator to look up the secret via SecretsManager GetSecretValue at runtime). Must correspond to cf_origin_secret_arn — if you change one, change both. When empty, no env var is set."
  type        = string
  default     = ""
}

variable "form_submissions_table_arn" {
  description = "ARN of picasso-form-submissions-staging (BSH form_handler.js writes submissions here)."
  type        = string
  default     = ""
}

variable "form_submissions_table_name" {
  description = "Name of the form submissions table (env var FORM_SUBMISSIONS_TABLE)."
  type        = string
  default     = ""
}

variable "notification_sends_table_arn" {
  description = "ARN of picasso-notification-sends-staging (BSH form_handler.js writes notification delivery log)."
  type        = string
  default     = ""
}

variable "notification_sends_table_name" {
  description = "Name of the notification-sends table (env var NOTIFICATION_SENDS_TABLE)."
  type        = string
  default     = ""
}

variable "sms_consent_table_arn" {
  description = "ARN of picasso-sms-consent-staging (BSH form_handler.js writes SMS opt-in records)."
  type        = string
  default     = ""
}

variable "sms_consent_table_name" {
  description = "Name of the SMS consent table (env var SMS_CONSENT_TABLE)."
  type        = string
  default     = ""
}

variable "sms_usage_table_arn" {
  description = "ARN of picasso-sms-usage-staging (BSH form_handler.js increments monthly SMS counter)."
  type        = string
  default     = ""
}

variable "sms_usage_table_name" {
  description = "Name of the SMS usage table (env var SMS_USAGE_TABLE)."
  type        = string
  default     = ""
}

# ------------------------------------------------------------------
# IAM role + minimum-scope inline policy
# ------------------------------------------------------------------

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "exec" {
  name               = "${var.function_name}-role"
  assume_role_policy = data.aws_iam_policy_document.trust.json
  description        = "Execution role for staging-account Bedrock streaming handler."
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_iam_policy_document" "exec" {
  statement {
    sid     = "Logs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.function_name}:*",
    ]
  }

  statement {
    sid       = "TenantConfigRead"
    actions   = ["s3:GetObject"]
    resources = ["${var.tenant_config_bucket_arn}/*"]
  }

  statement {
    sid     = "DynamoDBSessionSummaries"
    actions = ["dynamodb:UpdateItem", "dynamodb:GetItem", "dynamodb:Query"]
    resources = [
      var.session_summaries_table_arn,
      "${var.session_summaries_table_arn}/index/*",
    ]
  }

  statement {
    sid     = "DynamoDBTenantRegistryRead"
    actions = ["dynamodb:GetItem", "dynamodb:Query"]
    resources = [
      var.tenant_registry_table_arn,
      "${var.tenant_registry_table_arn}/index/*",
    ]
  }

  # Narrowed from `anthropic.claude-*` to specifically the Haiku family
  # used by the Bedrock streaming handler. v7 plan §"Decisions locked"
  # specifies Claude 4.5 Haiku as default. InvokeModel (synchronous)
  # removed — only Master_Function uses the synchronous variant for
  # post-stream CTA selection.
  # Cross-region inference profile (Issue #5 INT1): MYR's tenant config uses
  # claude-haiku-4-5 which AWS only hosts in us-east-2 — requests flow through
  # the us-east-1 inference profile and AWS routes to the target region. The
  # IAM principal needs allow on the foundation-model ARN in every target
  # region. Region-wildcard on foundation-model ARNs is the standard pattern
  # AWS recommends for inference profiles
  # (https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html).
  # Inference-profile ARN itself stays scoped to the source region.
  statement {
    sid     = "BedrockInvokeClaudeHaiku"
    actions = ["bedrock:InvokeModelWithResponseStream"]
    resources = [
      "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-*",
      "arn:aws:bedrock:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:inference-profile/*",
    ]
  }

  statement {
    sid       = "BedrockKBRetrieve"
    actions   = ["bedrock-agent-runtime:Retrieve"]
    resources = var.kb_arns
  }

  # Cross-account KB access: AWS RAM doesn't support bedrock:KnowledgeBase
  # (only bedrock:CustomModel). The staging Lambda must assume a role in
  # the prod account that holds the Retrieve permission. Conditional —
  # only added when caller passes role ARNs (e.g., for staging env).
  dynamic "statement" {
    for_each = length(var.kb_retriever_role_arns) > 0 ? [1] : []
    content {
      sid       = "AssumeKBRetrieverRole"
      actions   = ["sts:AssumeRole"]
      resources = var.kb_retriever_role_arns
    }
  }

  # CF origin secret — granted only when cf_origin_secret_arn is non-empty.
  # Phase 1 v3 hand-applied this Sid via aws CLI (PR #5); module captures it
  # so future terraform applies don't strip it. The Lambda's
  # REQUIRE_CF_ORIGIN_HEADER flag is set to "true" below when this ARN
  # is non-empty, per the Phase 1 v3 enforcement-on state.
  dynamic "statement" {
    for_each = var.cf_origin_secret_arn != "" ? [1] : []
    content {
      sid       = "CfOriginSecretRead"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [var.cf_origin_secret_arn]
    }
  }

  # Form-handler table access — granted only when caller passes ALL 4 ARNs.
  # Conjunction guard prevents a partial-input call from rendering empty-string
  # Resources (AWS rejects as MalformedPolicyDocument). Phase A.1 audit row #4
  # hardened this from a single-variable guard to all-4.
  dynamic "statement" {
    for_each = (
      var.form_submissions_table_arn != "" &&
      var.notification_sends_table_arn != "" &&
      var.sms_consent_table_arn != "" &&
      var.sms_usage_table_arn != ""
    ) ? [1] : []
    content {
      sid = "StagingFormTablesAccess"
      actions = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
      ]
      # 6 ARNs total: 4 base tables + GSI paths for the 2 tables that have GSIs
      # (form_submissions: FormType/Status; sms_consent: phone-lookup).
      # notification_sends + sms_usage have no GSIs; /index/* intentionally omitted.
      resources = [
        var.form_submissions_table_arn,
        "${var.form_submissions_table_arn}/index/*",
        var.notification_sends_table_arn,
        var.sms_consent_table_arn,
        "${var.sms_consent_table_arn}/index/*",
        var.sms_usage_table_arn,
      ]
    }
  }
}

resource "aws_iam_role_policy" "exec" {
  name   = "exec-policy"
  role   = aws_iam_role.exec.id
  policy = data.aws_iam_policy_document.exec.json
}

# ------------------------------------------------------------------
# Log group (explicit, with retention)
# ------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
}

# ------------------------------------------------------------------
# Placeholder code zip
# Real code deploys via aws lambda update-function-code in PR A.
# Terraform's lifecycle ignore_changes on source_code_hash prevents
# subsequent applies from reverting the deployed code.
# ------------------------------------------------------------------

data "archive_file" "placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "this" {
  function_name = var.function_name
  role          = aws_iam_role.exec.arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  memory_size   = 2048
  timeout       = 300
  architectures = ["x86_64"]

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT                 = "staging"
      CONFIG_BUCKET               = var.config_bucket_name
      S3_CONFIG_BUCKET            = var.config_bucket_name
      SESSION_SUMMARIES_TABLE     = var.session_summaries_table_name
      TENANT_REGISTRY_TABLE       = var.tenant_registry_table_name
      USE_REGISTRY_FOR_RESOLUTION = "true"
      # index.js fail-loads at module init if missing; capture in IaC so
      # routine terraform applies don't strip the var (drift discovered
      # 2026-05-12 during MFS blacklist IAM split PR plan review).
      BEDROCK_MODEL_ID = var.bedrock_model_id
      # PR A code reads this and calls sts:AssumeRole before any KB
      # Retrieve call. Empty in environments where Lambda + KB share
      # an account (no assume-role needed).
      KB_RETRIEVER_ROLE_ARN = length(var.kb_retriever_role_arns) > 0 ? var.kb_retriever_role_arns[0] : ""

      # Phase 1 v3 enforcement-on: CF-origin-header validator state. Both
      # vars are conditional on cf_origin_secret_arn being non-empty so the
      # module's documented contract (line 61: "when empty, REQUIRE_CF_ORIGIN_HEADER
      # must remain false") is enforced by the module itself. Phase A.1
      # audit rows #3 + #6 + #7 hardened this from hardcoded literals.
      CF_ORIGIN_SECRET_NAME    = var.cf_origin_secret_name
      REQUIRE_CF_ORIGIN_HEADER = var.cf_origin_secret_arn != "" ? "true" : "false"

      # Phase A: form-handler twin tables wired. Lazy/conditional reads in
      # form_handler.js fall back to wrong defaults if these are unset.
      FORM_SUBMISSIONS_TABLE   = var.form_submissions_table_name
      NOTIFICATION_SENDS_TABLE = var.notification_sends_table_name
      SMS_CONSENT_TABLE        = var.sms_consent_table_name
      SMS_USAGE_TABLE          = var.sms_usage_table_name
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # PR A deploys real code via aws lambda update-function-code; don't
    # let subsequent terraform applies revert that.
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.lambda, aws_iam_role_policy.exec]
}

# ------------------------------------------------------------------
# Function URL — AuthType NONE, RESPONSE_STREAM, wide CORS (matches
# the existing prod-account Lambda, multi-tenant widget).
# ------------------------------------------------------------------

resource "aws_lambda_function_url" "this" {
  function_name      = aws_lambda_function.this.function_name
  authorization_type = "NONE"
  invoke_mode        = "RESPONSE_STREAM"

  # CORS matches the live Lambda's narrowed values (pre-Terraform hand
  # config). Widget origins + REST methods + browser-standard headers.
  # Do NOT broaden to wildcards without reviewing
  # `feedback_uniform_env_rules`; the narrow set is the operational
  # baseline shipped before Terraform-management of this Lambda existed.
  cors {
    allow_origins = [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:8000",
      "https://chat.myrecruiter.ai",
      "https://staging.chat.myrecruiter.ai",
      "https://picassocode.s3.amazonaws.com",
      "https://picassostaging.s3.amazonaws.com",
    ]
    allow_methods = ["GET", "POST"]
    # `x-picasso-cf-origin` is CloudFront-injected to the Lambda (not browser-set),
    # so CORS preflight doesn't strictly need it for prod traffic. Added per Phase
    # A.1 audit row #6 to support browser-direct Function URL testing pre-Phase-D
    # cutover.
    allow_headers     = ["accept", "authorization", "content-type", "x-picasso-cf-origin", "x-requested-with"]
    allow_credentials = true
  }
}

# ──────────────────────────────────────────────────────────────────────
# # MANUAL STEP REQUIRED — Function URL post-creation
# ──────────────────────────────────────────────────────────────────────
# After Terraform creates this Lambda + Function URL for the first time,
# the URL will return HTTP 403 until the resource policy gets a SECOND
# statement that AWS provider 5.x cannot create. Add it via Console once:
#
#   1. AWS Console → Lambda → ${this function} → Configuration tab
#   2. Function URL → Edit
#   3. (Make no changes) → Save
#   4. Verify: aws lambda get-policy --function-name <name> | jq
#      '.Statement[].Sid' should now show TWO sids:
#        - "FunctionURLAllowPublicAccess"      (Terraform-created)
#        - "FunctionURLAllowInvokeAction"      (Console-added; required)
#   5. Smoke-test: curl <function-url> should return 200, not 403
#
# Why Terraform can't do this:
#   • aws_lambda_permission's function_url_auth_type only works with action =
#     lambda:InvokeFunctionUrl. AWS rejects combos with lambda:InvokeFunction.
#   • The provider has no parameter for the lambda:InvokedViaFunctionUrl
#     condition.
#   • Removing the condition entirely would let any cross-account principal
#     invoke this Lambda directly (over-broad).
#
# Statement persists across future `terraform apply` runs because
# aws_lambda_function_url doesn't manage individual policy statements.
# However, if the Lambda is destroyed and recreated, the manual step
# must be re-run.
#
# Tracking: empirically test whether the second statement is actually required
# (untested in isolation). If the manual step is unnecessary in practice, drop
# the comment block entirely. No upstream issue filed — this is a
# Lambda Function URL + cross-account-invoke quirk specific to AWS account
# topology, not a Terraform-provider bug.
# ──────────────────────────────────────────────────────────────────────

# ------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------

output "function_name" {
  value = aws_lambda_function.this.function_name
}

output "function_arn" {
  value = aws_lambda_function.this.arn
}

output "role_arn" {
  value = aws_iam_role.exec.arn
}

output "function_url" {
  value = aws_lambda_function_url.this.function_url
}

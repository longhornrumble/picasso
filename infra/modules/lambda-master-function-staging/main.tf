variable "function_name" {
  description = "Lambda function name."
  type        = string
  default     = "Master_Function_Staging"
}

variable "tenant_config_bucket_arn" {
  description = "ARN of the staging tenant config S3 bucket."
  type        = string
}

variable "config_bucket_name" {
  description = "Name of the staging tenant config S3 bucket (for env var)."
  type        = string
}

variable "jwt_secret_arn" {
  description = "ARN of the JWT signing key in Secrets Manager."
  type        = string
}

variable "jwt_secret_name" {
  description = "Name of the JWT secret (for env var)."
  type        = string
}

variable "cf_origin_secret_arn" {
  description = "ARN of the CloudFront origin secret in Secrets Manager (used by lambda#101 CF origin header validator). Optional; when empty, no IAM grant is added and the feature flag REQUIRE_CF_ORIGIN_HEADER must remain false."
  type        = string
  default     = ""
}

variable "session_summaries_table_arn" {
  type = string
}

variable "session_summaries_table_name" {
  type = string
}

variable "tenant_registry_table_arn" {
  type = string
}

variable "tenant_registry_table_name" {
  type = string
}

variable "audit_table_arn" {
  type = string
}

variable "audit_table_name" {
  type = string
}

variable "recent_messages_table_arn" {
  type = string
}

variable "recent_messages_table_name" {
  type = string
}

variable "conversation_summaries_table_arn" {
  type = string
}

variable "conversation_summaries_table_name" {
  type = string
}

variable "token_blacklist_table_arn" {
  description = "ARN of the staging-account token blacklist table."
  type        = string
}

variable "token_blacklist_table_name" {
  description = "Name of the token blacklist table (for env var)."
  type        = string
}

variable "form_submissions_table_arn" {
  description = "ARN of the staging-account form submissions table."
  type        = string
}

variable "form_submissions_table_name" {
  description = "Name of the form submissions table (for env var FORM_SUBMISSIONS_TABLE)."
  type        = string
}

variable "notification_sends_table_arn" {
  description = "ARN of the staging-account notification-sends table (logs of email/SMS delivery results)."
  type        = string
}

variable "notification_sends_table_name" {
  description = "Name of the notification-sends table (for env var NOTIFICATION_SENDS_TABLE)."
  type        = string
}

variable "streaming_endpoint" {
  description = "Function URL of the staging Bedrock streaming handler."
  type        = string
}

variable "bedrock_model_id" {
  description = "Bedrock model ID used by intent_router for direct InvokeModel calls (e.g. V4 Action Selector)."
  type        = string
  default     = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
}

variable "kb_arns" {
  description = "List of Bedrock Knowledge Base ARNs the Lambda is allowed to Retrieve from. For Issue #5, MYR's KB only."
  type        = list(string)
}

variable "kb_retriever_role_arns" {
  description = "List of cross-account IAM role ARNs the Lambda is allowed to AssumeRole into for KB Retrieve. Bedrock KBs aren't RAM-shareable, so cross-account access requires the staging Lambda to assume a prod-side role that has Retrieve permission. Python bedrock_handler.py wraps the Bedrock call with assume-role + cached creds."
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30
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
  description        = "Execution role for staging-account Master_Function."
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

  # GetObject reads tenant configs by known path. ListBucket scoped to
  # the tenants/ and mappings/ prefixes only — prevents enumerating all
  # tenant keys. Code never lists the bucket root.
  statement {
    sid       = "TenantConfigGet"
    actions   = ["s3:GetObject"]
    resources = ["${var.tenant_config_bucket_arn}/*"]
  }

  statement {
    sid       = "TenantConfigList"
    actions   = ["s3:ListBucket"]
    resources = [var.tenant_config_bucket_arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["tenants/*", "mappings/*"]
    }
  }

  statement {
    sid       = "JwtSecretRead"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.jwt_secret_arn]
  }

  # CF origin secret — granted only when cf_origin_secret_arn is non-empty.
  # The lambda#101 validator fails closed when the secret can't be read, so
  # missing this grant is safe (flag must stay off). Audit blocker #2 from
  # phase-completion-audit 2026-05-12: this grant must exist in IaC before
  # the activation runbook flips REQUIRE_CF_ORIGIN_HEADER=true, otherwise
  # all prod traffic 403s.
  dynamic "statement" {
    for_each = var.cf_origin_secret_arn != "" ? [1] : []
    content {
      sid       = "CfOriginSecretRead"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [var.cf_origin_secret_arn]
    }
  }

  # Audit table is append-only — writers may Put/Update; nobody should
  # Delete or BatchWrite into it. Read access for dashboard queries.
  statement {
    sid = "DynamoDBAuditAppendOnly"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
    ]
    resources = [
      var.audit_table_arn,
      "${var.audit_table_arn}/index/*",
    ]
  }

  # Session and conversation tables — full CRUD needed for chat lifecycle
  # (create on session start, update during, delete on cleanup).
  statement {
    sid = "DynamoDBSessionTables"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem",
    ]
    resources = [
      var.session_summaries_table_arn,
      "${var.session_summaries_table_arn}/index/*",
      var.tenant_registry_table_arn,
      "${var.tenant_registry_table_arn}/index/*",
      var.recent_messages_table_arn,
      var.conversation_summaries_table_arn,
      "${var.conversation_summaries_table_arn}/index/*",
    ]
  }

  # Token blacklist — split into read + write statements per audit blocker
  # 2026-05-12 (Phase 4 cumulative). BatchWriteItem grant was the largest
  # concern: any caller that obtained write access could mass-blacklist
  # tokens in a single API call (effective DoS). Splitting also lets a
  # future tightening pin Read to "any reader" and Write to specific
  # admin paths without re-granting both.
  #
  # Active paths today: is_token_blacklisted (GetItem) and
  # add_token_to_blacklist (PutItem). Scan/Query were unused-by-active-code
  # and so were dropped; the dormant revoke_tenant_tokens and
  # cleanup_expired_blacklist_entries functions need a separate Scan grant
  # added at the time they're wired into an admin API (don't pre-grant).
  statement {
    sid = "DynamoDBTokenBlacklistRead"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:DescribeTable",
    ]
    resources = [
      var.token_blacklist_table_arn,
    ]
  }

  statement {
    sid = "DynamoDBTokenBlacklistWrite"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]
    resources = [
      var.token_blacklist_table_arn,
    ]
  }

  # Form submissions + notification-sends — writes happen during the
  # forms HTTP fallback path (handle_chat → FormHandler when form_mode=True,
  # or direct ?action=form_submission). form_handler.py is env-var-driven
  # for these table names (see FORM_SUBMISSIONS_TABLE + NOTIFICATION_SENDS_TABLE
  # env vars below).
  statement {
    sid = "DynamoDBFormSubmissions"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
      "dynamodb:DescribeTable",
    ]
    resources = [
      var.form_submissions_table_arn,
      "${var.form_submissions_table_arn}/index/*",
      var.notification_sends_table_arn,
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

  # Master_Function uses synchronous InvokeModel for V4 Action Selector
  # (post-stream CTA selection — see v7 plan §"Decisions locked").
  # Narrowed from `claude-*` to Haiku only.
  #
  # Cross-region inference profile (Issue #5 INT1): MYR's tenant config uses
  # claude-haiku-4-5 which AWS only hosts in us-east-2 — the request flows
  # through the us-east-1 inference profile and AWS picks the target region
  # transparently. The IAM principal needs explicit allow on the foundation-
  # model ARN in EVERY target region. Region-wildcard on foundation-model
  # ARNs is the standard pattern AWS recommends for inference profiles
  # (https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html).
  # Inference-profile ARN itself stays scoped to the source region.
  statement {
    sid = "BedrockInvokeClaudeHaiku"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]
    resources = [
      "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-*",
      "arn:aws:bedrock:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:inference-profile/*",
    ]
  }
}

resource "aws_iam_role_policy" "exec" {
  name   = "exec-policy"
  role   = aws_iam_role.exec.id
  policy = data.aws_iam_policy_document.exec.json
}

# ------------------------------------------------------------------
# Log group
# ------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
}

# ------------------------------------------------------------------
# Placeholder code zip (Python). Real code via PR A2.
# ------------------------------------------------------------------

data "archive_file" "placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "this" {
  function_name = var.function_name
  role          = aws_iam_role.exec.arn
  runtime       = "python3.13"
  handler       = "lambda_function.lambda_handler"
  memory_size   = 512
  timeout       = 300
  architectures = ["x86_64"]

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT                 = "staging"
      S3_BUCKET                   = var.config_bucket_name
      CONFIG_BUCKET               = var.config_bucket_name
      JWT_SECRET_KEY_NAME         = var.jwt_secret_name
      USE_REGISTRY_FOR_RESOLUTION = "true"
      SESSION_SUMMARIES_TABLE     = var.session_summaries_table_name
      SUMMARIES_TABLE_NAME        = var.conversation_summaries_table_name
      MESSAGES_TABLE_NAME         = var.recent_messages_table_name
      TENANT_REGISTRY_TABLE       = var.tenant_registry_table_name
      AUDIT_TABLE_NAME            = var.audit_table_name
      BLACKLIST_TABLE_NAME        = var.token_blacklist_table_name
      FORM_SUBMISSIONS_TABLE      = var.form_submissions_table_name
      NOTIFICATION_SENDS_TABLE    = var.notification_sends_table_name
      BEDROCK_MODEL_ID            = var.bedrock_model_id
      STREAMING_ENDPOINT          = var.streaming_endpoint
      JWT_EXPIRY_MINUTES          = "30"
      MONITORING_ENABLED          = "true"
      # CF origin secret NAME. Lambda code's default (lambda_function.py:94)
      # is the same string; pinning here removes the silent-default coupling
      # so any future rename is caught at terraform plan time, not at runtime.
      CF_ORIGIN_SECRET_NAME = "picasso/mfs/cf-origin-secret"
      # Activates the lambda#101 validator. Set live via aws-cli during the
      # 2026-05-13 activation runbook; codified here so that path is no
      # longer IaC drift. Rollback = remove this line + plan/apply.
      REQUIRE_CF_ORIGIN_HEADER = "true"
      # Python bedrock_handler.py reads this and calls sts:AssumeRole before
      # any KB Retrieve call. Empty in environments where Lambda + KB share
      # an account (no assume-role needed).
      KB_RETRIEVER_ROLE_ARN = length(var.kb_retriever_role_arns) > 0 ? var.kb_retriever_role_arns[0] : ""
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.lambda, aws_iam_role_policy.exec]
}

# ------------------------------------------------------------------
# Function URL — AuthType NONE, RESPONSE_STREAM (matches existing).
# ------------------------------------------------------------------

resource "aws_lambda_function_url" "this" {
  function_name      = aws_lambda_function.this.function_name
  authorization_type = "NONE"
  invoke_mode        = "RESPONSE_STREAM"
}

# ──────────────────────────────────────────────────────────────────────
# # MANUAL STEP REQUIRED — see full note in lambda-bedrock-handler-staging
# After creation, AWS Console → Lambda → ${this function} → Configuration
# → Function URL → Edit → Save (no changes). Adds the missing
# FunctionURLAllowInvokeAction policy statement that AWS provider 5.x
# can't create. Verify both SIDs present on the Lambda's resource policy.
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

output "log_group_name" {
  value = aws_cloudwatch_log_group.lambda.name
}

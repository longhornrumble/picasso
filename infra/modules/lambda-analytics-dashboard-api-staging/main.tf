variable "function_name" {
  description = "Lambda function name. Per uniform-env-rules in this account, NO _Staging suffix — the account boundary is the env separation."
  type        = string
  default     = "Analytics_Dashboard_API"
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

variable "clerk_secret_arn" {
  description = "ARN of the Clerk dev-project secret key in Secrets Manager. Code path reads via CLERK_SECRET_KEY_SECRET_ID env var (Plan Security F2 — secret never enters env vars or tfstate)."
  type        = string
}

variable "clerk_secret_name" {
  description = "Name of the Clerk secret (for CLERK_SECRET_KEY_SECRET_ID env var)."
  type        = string
}

variable "tenant_registry_table_arn" {
  type = string
}

variable "tenant_registry_table_name" {
  type = string
}

variable "session_summaries_table_arn" {
  type = string
}

variable "session_summaries_table_name" {
  type = string
}

variable "session_events_table_arn" {
  type = string
}

variable "session_events_table_name" {
  type = string
}

variable "form_submissions_table_arn" {
  type = string
}

variable "form_submissions_table_name" {
  type = string
}

variable "notification_events_table_arn" {
  type = string
}

variable "notification_events_table_name" {
  type = string
}

variable "notification_sends_table_arn" {
  type = string
}

variable "notification_sends_table_name" {
  type = string
}

variable "billing_events_table_arn" {
  type = string
}

variable "billing_events_table_name" {
  type = string
}

variable "employee_registry_table_arn" {
  type = string
}

variable "employee_registry_table_name" {
  type = string
}

variable "audit_table_arn" {
  type = string
}

variable "audit_table_name" {
  type = string
}

variable "clerk_jwks_url" {
  description = "Clerk JWKS endpoint. Defaults to the Clerk dev project shared with legacy staging."
  type        = string
  default     = "https://divine-impala-48.clerk.accounts.dev/.well-known/jwks.json"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30
}

# ------------------------------------------------------------------
# IAM role + minimum-scope inline policy (with explicit Denies on prod)
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
  description        = "Execution role for staging-account Analytics_Dashboard_API."
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
    sid     = "SecretsRead"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      var.jwt_secret_arn,
      var.clerk_secret_arn,
    ]
  }

  # Read+Write on the three tables ADA actually mutates at runtime:
  # form-submissions (lead status / notes), tenant-registry (admin tenant
  # ops), employee-registry-v2 (admin invites / role updates).
  statement {
    sid = "DynamoDBReadWriteRuntimeMutating"
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
      var.form_submissions_table_arn,
      "${var.form_submissions_table_arn}/index/*",
      var.tenant_registry_table_arn,
      "${var.tenant_registry_table_arn}/index/*",
      var.employee_registry_table_arn,
      "${var.employee_registry_table_arn}/index/*",
    ]
  }

  # Read-only on the analytics fact tables — ADA queries these for
  # dashboard rendering but never writes.
  statement {
    sid = "DynamoDBReadOnly"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:BatchGetItem",
    ]
    resources = [
      var.session_summaries_table_arn,
      "${var.session_summaries_table_arn}/index/*",
      var.session_events_table_arn,
      "${var.session_events_table_arn}/index/*",
      var.notification_events_table_arn,
      "${var.notification_events_table_arn}/index/*",
      var.notification_sends_table_arn,
      "${var.notification_sends_table_arn}/index/*",
      var.billing_events_table_arn,
      "${var.billing_events_table_arn}/index/*",
      var.audit_table_arn,
      "${var.audit_table_arn}/index/*",
    ]
  }

  # Defense-in-depth: never write to the prod tenant-config bucket even
  # if an allow rule above is later widened by accident (Plan Security F4).
  statement {
    sid       = "DenyProdConfigBucketWrites"
    effect    = "Deny"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::myrecruiter-picasso/*"]
  }

  # Defense-in-depth: never touch any DynamoDB table in the prod account
  # even if an allow rule resolves a cross-account ARN by mistake. Account
  # boundary is the primary control; this is belt-and-braces.
  statement {
    sid       = "DenyAllProdDynamoDB"
    effect    = "Deny"
    actions   = ["dynamodb:*"]
    resources = ["arn:aws:dynamodb:*:614056832592:*"]
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
# Placeholder code zip (Python). Real code via Phase 4.2 lambda repo PR
# (deploy-staging.yml CI matrix entry).
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
  timeout       = 60
  architectures = ["x86_64"]

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT                = "staging"
      S3_CONFIG_BUCKET           = var.config_bucket_name
      JWT_SECRET_KEY_NAME        = var.jwt_secret_name
      CLERK_SECRET_KEY_SECRET_ID = var.clerk_secret_name
      CLERK_JWKS_URL             = var.clerk_jwks_url
      TENANT_REGISTRY_TABLE      = var.tenant_registry_table_name
      SESSION_SUMMARIES_TABLE    = var.session_summaries_table_name
      SESSION_EVENTS_TABLE       = var.session_events_table_name
      FORM_SUBMISSIONS_TABLE     = var.form_submissions_table_name
      NOTIFICATION_EVENTS_TABLE  = var.notification_events_table_name
      NOTIFICATION_SENDS_TABLE   = var.notification_sends_table_name
      BILLING_EVENTS_TABLE       = var.billing_events_table_name
      EMPLOYEE_REGISTRY_TABLE    = var.employee_registry_table_name
      AUDIT_TABLE_NAME           = var.audit_table_name
      USE_DYNAMO_CACHE           = "false"
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
# Function URL — AuthType NONE (CloudFront fronts; JWT auth in handler).
# Buffered invoke (request/response API, not streaming).
# ------------------------------------------------------------------

resource "aws_lambda_function_url" "this" {
  function_name      = aws_lambda_function.this.function_name
  authorization_type = "NONE"
  invoke_mode        = "BUFFERED"

  cors {
    allow_credentials = false
    # OPTIONS (7 chars) excluded: Lambda Function URL CORS API enforces a
    # 6-char-max-per-member constraint on allow_methods, and CORS preflight
    # (OPTIONS) is handled implicitly by the Function URL — no need to list
    # it here. Surfaced via apply failure on PR #81's first run.
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE"]
    allow_origins = [
      "https://d2t5sxdcthprgd.cloudfront.net",
      "http://localhost:5173",
    ]
    allow_headers = ["authorization", "content-type"]
    max_age       = 86400
  }
}

# Resource-policy statement that lets the URL boundary actually invoke the
# function. Two statements are required for a public Function URL:
#
#   1. FunctionURLAllowPublicAccess — Action: lambda:InvokeFunctionUrl
#      Auto-created by AWS when the Function URL is created with
#      AuthType=NONE. Don't declare it here (would cause 409 conflict).
#
#   2. FunctionURLAllowInvokeAction — Action: lambda:InvokeFunction
#      Condition: lambda:InvokedViaFunctionUrl=true.
#      AWS does NOT auto-create this. Without it, the URL boundary lets
#      the request through, then AWS rejects at invoke time with HTTP 403
#      AccessDeniedException because the principal can't InvokeFunction.
#      The legacy Issue #5 modules' "MANUAL STEP REQUIRED" comment is
#      about this statement — Edit+Save in the console adds it.
#
# Provider 5.x produces statement (2) when action="lambda:InvokeFunction"
# and function_url_auth_type is set: function_url_auth_type triggers the
# InvokedViaFunctionUrl=true condition.
resource "aws_lambda_permission" "function_url_invoke_action" {
  statement_id           = "FunctionURLAllowInvokeAction"
  action                 = "lambda:InvokeFunction"
  function_name          = aws_lambda_function.this.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

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

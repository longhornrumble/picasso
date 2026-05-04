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

variable "streaming_endpoint" {
  description = "Function URL of the staging Bedrock streaming handler."
  type        = string
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

  statement {
    sid       = "TenantConfigRead"
    actions   = ["s3:GetObject", "s3:ListBucket"]
    resources = [var.tenant_config_bucket_arn, "${var.tenant_config_bucket_arn}/*"]
  }

  statement {
    sid       = "JwtSecretRead"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.jwt_secret_arn]
  }

  statement {
    sid = "DynamoDBChatTables"
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
      var.audit_table_arn,
      "${var.audit_table_arn}/index/*",
      var.recent_messages_table_arn,
      var.conversation_summaries_table_arn,
      "${var.conversation_summaries_table_arn}/index/*",
    ]
  }

  statement {
    sid = "BedrockInvokeClaude"
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]
    resources = [
      "arn:aws:bedrock:${data.aws_region.current.name}::foundation-model/anthropic.claude-*",
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
      STREAMING_ENDPOINT          = var.streaming_endpoint
      JWT_EXPIRY_MINUTES          = "30"
      MONITORING_ENABLED          = "true"
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

# See lambda-bedrock-handler-staging for the full note. Same gap: Console
# Save on the Function URL must run once after Lambda creation to add the
# FunctionURLAllowInvokeAction resource policy statement.

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

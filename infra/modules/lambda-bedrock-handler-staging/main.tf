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

  statement {
    sid       = "BedrockKBRetrieve"
    actions   = ["bedrock-agent-runtime:Retrieve"]
    resources = var.kb_arns
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

  cors {
    allow_origins     = ["*"]
    allow_methods     = ["*"]
    allow_headers     = ["*"]
    allow_credentials = true
  }
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

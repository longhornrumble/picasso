# Attribution_Unsubscribe -- Wave-2 attribution Lambda (WS-I).
#
# Single-purpose public Function URL endpoint: validates an HMAC-signed
# one-click unsubscribe token (t= query param) and writes a permanent
# suppression row (pk=TENANT#{tenant_id}, sk=SUPPRESS#recap#{email_lower})
# to picasso-attribution-aggregates.
#
# AUTHORIZATION MODEL -- PUBLIC Function URL (AuthType = NONE):
# This endpoint is intentionally unauthenticated at the Lambda URL layer.
# The recipient clicks a tokenized link from their email client -- they have
# no AWS identity and cannot acquire one. Authentication is provided by
# HMAC-SHA256 token validation inside the handler: the token embeds
# {tenant_id}|{email_lower}|recap and is signed with the unsub-signing-key
# secret; forging a valid token requires knowledge of that key.
# This is the standard one-click-unsubscribe pattern (RFC 8058 / CAN-SPAM).
# Consent advisory reviewed this design (WS-I consent gate, 2026-06).
# Single-purpose write-one-row endpoint with no cross-tenant read access.
#
# Real code deploys via lambda-repo CI matrix; this module ships a placeholder
# zip for first apply, then ignores code-side changes via
# lifecycle { ignore_changes = [filename, source_code_hash] }.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "attribution_aggregates_table_arn" {
  description = "ARN of picasso-attribution-aggregates. Unsubscribe writes SUPPRESS#recap rows."
  type        = string
}

variable "attribution_aggregates_table_name" {
  description = "Name of picasso-attribution-aggregates (for ATTRIBUTION_AGGREGATES_TABLE env var)."
  type        = string
}

variable "unsub_secret_arn" {
  description = "ARN of picasso/staging/attribution/unsub-signing-key in Secrets Manager."
  type        = string
}

variable "unsub_secret_name" {
  description = "Name of the unsub signing key secret (for UNSUB_SECRET_NAME env var)."
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30
}

# ------------------------------------------------------------------
# Common data sources
# ------------------------------------------------------------------

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ------------------------------------------------------------------
# IAM -- dedicated execution role (never shared -- hard repo rule)
# ------------------------------------------------------------------

resource "aws_iam_role" "exec" {
  name               = "Attribution_Unsubscribe-role"
  assume_role_policy = data.aws_iam_policy_document.trust.json
  description        = "Execution role for Attribution_Unsubscribe. Wave-2 attribution unsub endpoint."
}

data "aws_iam_policy_document" "exec" {
  statement {
    sid     = "Logs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Attribution_Unsubscribe:*",
    ]
  }

  # picasso-attribution-aggregates: write SUPPRESS#recap rows only.
  # No read access (write-only by design -- minimise blast radius).
  statement {
    sid       = "AttributionAggregatesSuppressWrite"
    actions   = ["dynamodb:PutItem"]
    resources = [var.attribution_aggregates_table_arn]
  }

  # Unsub signing key read for HMAC token validation.
  statement {
    sid       = "UnsubSecretRead"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["${var.unsub_secret_arn}*"]
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
  name              = "/aws/lambda/Attribution_Unsubscribe"
  retention_in_days = var.log_retention_days
}

# ------------------------------------------------------------------
# Placeholder code zip (Python). Real code via lambda-repo CI.
# ------------------------------------------------------------------

data "archive_file" "placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "this" {
  function_name = "Attribution_Unsubscribe"
  role          = aws_iam_role.exec.arn
  runtime       = "python3.13"
  handler       = "lambda_function.lambda_handler"
  memory_size   = 128
  timeout       = 10
  architectures = ["x86_64"]

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT                  = "staging"
      ATTRIBUTION_AGGREGATES_TABLE = var.attribution_aggregates_table_name
      UNSUB_SECRET_NAME            = var.unsub_secret_name
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
# Public Function URL (AuthType = NONE).
#
# SECURITY JUSTIFICATION: This is a tokenized email unsubscribe endpoint.
# The recipient clicks a link from their email client -- they have no AWS
# identity. Authentication is entirely inside the handler via HMAC-SHA256
# token validation (the signing key lives in Secrets Manager and is never
# in state or logs). This is the standard one-click-unsubscribe architecture
# (RFC 8058 / CAN-SPAM) reviewed by the communications-consent-advisor (WS-I).
# Single-purpose: write exactly one SUPPRESS row per valid token. No reads,
# no cross-tenant access, no PII exposure on GET.
# ------------------------------------------------------------------

resource "aws_lambda_function_url" "this" {
  function_name      = aws_lambda_function.this.function_name
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "public_url" {
  statement_id           = "AllowPublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.this.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

# ------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------

output "function_url" {
  value       = aws_lambda_function_url.this.function_url
  description = "Public Function URL for the one-click unsubscribe endpoint."
}

output "function_name" {
  value = aws_lambda_function.this.function_name
}

output "function_arn" {
  value = aws_lambda_function.this.arn
}

output "role_arn" {
  value = aws_iam_role.exec.arn
}

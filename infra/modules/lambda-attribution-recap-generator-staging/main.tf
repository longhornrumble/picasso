# Attribution_Recap_Generator -- Wave-2 attribution Lambda (WS-H).
#
# Runs monthly via EventBridge (1st of month, 14:00 UTC), reads the prior-month
# attribution-aggregates rows written by Attribution_Aggregator, and emails a
# recap report to tenant contacts via the reusable send_email Lambda.
#
# RECAP_SEND_ENABLED = "false" (safety gate) -- operator flips to "true" only
# after the communications-consent-advisor review is complete and tenant opt-in
# flow is live.  Conditional PutItem on METRIC#recap_sent#{YYYY-MM} is the
# idempotency guard (one email per tenant per month regardless of retries).
#
# Real code deploys via lambda-repo CI matrix; this module ships a placeholder
# zip for first apply, then ignores code-side changes via
# lifecycle { ignore_changes = [filename, source_code_hash] }.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "attribution_aggregates_table_arn" {
  description = "ARN of picasso-attribution-aggregates. Recap reads rollup rows and writes idempotency markers."
  type        = string
}

variable "attribution_aggregates_table_name" {
  description = "Name of picasso-attribution-aggregates (for ATTRIBUTION_AGGREGATES_TABLE env var)."
  type        = string
}

variable "tenant_config_bucket_arn" {
  description = "ARN of the staging tenant config S3 bucket. Recap reads tenant configs for contact addresses."
  type        = string
}

variable "tenant_config_bucket_name" {
  description = "Name of the staging tenant config S3 bucket (for TENANT_CONFIG_BUCKET env var)."
  type        = string
}

variable "send_email_function_arn" {
  description = "ARN of the reusable send_email staging Lambda. Recap invokes it to dispatch recap emails."
  type        = string
}

variable "send_email_function_name" {
  description = "Name of the reusable send_email Lambda (for SEND_EMAIL_FUNCTION_NAME env var)."
  type        = string
}

variable "dashboard_base_url" {
  description = "Base URL of the analytics dashboard included in recap emails."
  type        = string
  default     = "https://d3r39xkfb0snuq.cloudfront.net"
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
  name               = "Attribution_Recap_Generator-role"
  assume_role_policy = data.aws_iam_policy_document.trust.json
  description        = "Execution role for Attribution_Recap_Generator. Wave-2 attribution."
}

data "aws_iam_policy_document" "exec" {
  statement {
    sid     = "Logs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Attribution_Recap_Generator:*",
    ]
  }

  # picasso-attribution-aggregates: Query prior-month rollup rows + conditional PutItem for
  # the METRIC#recap_sent#{YYYY-MM} idempotency marker (one email per tenant per month).
  statement {
    sid     = "AttributionAggregatesReadWrite"
    actions = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem"]
    resources = [
      var.attribution_aggregates_table_arn,
    ]
  }

  # Tenant config S3: enumerate tenants via mappings/ prefix + read individual configs
  # for contact addresses and recap opt-in settings.
  statement {
    sid       = "TenantConfigList"
    actions   = ["s3:ListBucket"]
    resources = [var.tenant_config_bucket_arn]
  }

  statement {
    sid       = "TenantConfigGet"
    actions   = ["s3:GetObject"]
    resources = ["${var.tenant_config_bucket_arn}/*"]
  }

  # send_email invoke for recap email dispatch. Scoped to EXACTLY the send_email function ARN.
  statement {
    sid       = "InvokeSendEmail"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.send_email_function_arn]
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
  name              = "/aws/lambda/Attribution_Recap_Generator"
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
  function_name = "Attribution_Recap_Generator"
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
      ENVIRONMENT                  = "staging"
      ATTRIBUTION_AGGREGATES_TABLE = var.attribution_aggregates_table_name
      TENANT_CONFIG_BUCKET         = var.tenant_config_bucket_name
      SEND_EMAIL_FUNCTION_NAME     = var.send_email_function_name
      DASHBOARD_BASE_URL           = var.dashboard_base_url
      RECAP_SEND_ENABLED           = "false"
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
# Monthly EventBridge schedule -- 1st of month at 14:00 UTC
# ------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "monthly" {
  name                = "attribution-recap-generator-monthly"
  description         = "Trigger Attribution_Recap_Generator monthly on the 1st at 14:00 UTC."
  schedule_expression = "cron(0 14 1 * ? *)"
}

resource "aws_cloudwatch_event_target" "monthly" {
  rule      = aws_cloudwatch_event_rule.monthly.name
  target_id = "AttributionRecapGenerator"
  arn       = aws_lambda_function.this.arn
}

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "AllowEventBridgeMonthly"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.monthly.arn
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

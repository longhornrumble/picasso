# Attribution_Aggregator -- Wave-1 attribution Lambda (WS-C).
#
# Runs hourly via EventBridge, idempotently recomputes current-month attribution
# aggregates from picasso-session-events (GSI tenant-date-index), enriches via
# picasso-entry-points, polls Dub.co analytics (C4 contract), and writes monthly
# rollup rows into picasso-attribution-aggregates (C5 contract, TTL 420 days).
#
# Tenant timezone is read from the staging config bucket (schema-tolerant read).
# DEFAULT_TZ = "America/Chicago" when the config `timezone` field is absent.
#
# Real code deploys via lambda-repo CI matrix; this module ships a placeholder
# zip for first apply, then ignores code-side changes via
# lifecycle { ignore_changes = [filename, source_code_hash] }.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "session_events_table_arn" {
  description = "ARN of picasso-session-events. Aggregator Queries via GSI tenant-date-index."
  type        = string
}

variable "session_events_table_name" {
  description = "Name of picasso-session-events (for SESSION_EVENTS_TABLE env var)."
  type        = string
}

variable "entry_points_table_arn" {
  description = "ARN of picasso-entry-points. Aggregator reads registry records for enrichment."
  type        = string
}

variable "entry_points_table_name" {
  description = "Name of picasso-entry-points (for ENTRY_POINTS_TABLE env var)."
  type        = string
}

variable "attribution_aggregates_table_arn" {
  description = "ARN of picasso-attribution-aggregates. Aggregator writes monthly rollup rows."
  type        = string
}

variable "attribution_aggregates_table_name" {
  description = "Name of picasso-attribution-aggregates (for ATTRIBUTION_AGGREGATES_TABLE env var)."
  type        = string
}

variable "dub_secret_arn" {
  description = "ARN of picasso/staging/dub/api-key in Secrets Manager."
  type        = string
}

variable "dub_secret_name" {
  description = "Name of the Dub secret (for DUB_SECRET_NAME env var)."
  type        = string
}

variable "tenant_config_bucket_arn" {
  description = "ARN of the staging tenant config S3 bucket. Aggregator reads tenant configs for timezone."
  type        = string
}

variable "tenant_config_bucket_name" {
  description = "Name of the staging tenant config S3 bucket (for TENANT_CONFIG_BUCKET env var)."
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

variable "dub_workspace_id" {
  description = "Dub workspace id (ws_...) appended as ?workspaceId= - required for personal-type Dub API keys, harmless with workspace keys. Empty disables."
  type        = string
  default     = ""
}

resource "aws_iam_role" "exec" {
  name                 = "Attribution_Aggregator-role"
  permissions_boundary = var.permissions_boundary_arn
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  description          = "Execution role for Attribution_Aggregator. Wave-1 attribution."
}

data "aws_iam_policy_document" "exec" {
  statement {
    sid     = "Logs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Attribution_Aggregator:*",
    ]
  }

  # picasso-session-events: Query via GSI tenant-date-index + base table GetItem.
  # The /index/* form covers all GSIs (tenant-date-index is the only one in v1).
  statement {
    sid     = "SessionEventsRead"
    actions = ["dynamodb:Query", "dynamodb:GetItem"]
    resources = [
      var.session_events_table_arn,
      "${var.session_events_table_arn}/index/*",
    ]
  }

  # picasso-entry-points: read-only for registry enrichment join.
  statement {
    sid     = "EntryPointsRead"
    actions = ["dynamodb:Query", "dynamodb:GetItem"]
    resources = [
      var.entry_points_table_arn,
    ]
  }

  # picasso-attribution-aggregates: write monthly rollup rows (idempotent recompute).
  statement {
    sid     = "AttributionAggregatesWrite"
    actions = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query"]
    resources = [
      var.attribution_aggregates_table_arn,
    ]
  }

  statement {
    sid       = "DubSecretRead"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["${var.dub_secret_arn}*"]
  }

  # Tenant config read for timezone resolution (schema-tolerant; config.get('timezone', DEFAULT_TZ)).
  statement {
    sid       = "TenantConfigGet"
    actions   = ["s3:GetObject"]
    resources = ["${var.tenant_config_bucket_arn}/*"]
  }

  # Tenant enumeration lists mappings/ (one JSON per tenant hash) - GetObject
  # alone denied ListObjectsV2 and the hourly run saw zero tenants (2026-06-12).
  statement {
    sid       = "TenantMappingsList"
    actions   = ["s3:ListBucket"]
    resources = [var.tenant_config_bucket_arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["mappings/*"]
    }
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
  name              = "/aws/lambda/Attribution_Aggregator"
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
  function_name = "Attribution_Aggregator"
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
      SESSION_EVENTS_TABLE         = var.session_events_table_name
      ENTRY_POINTS_TABLE           = var.entry_points_table_name
      ATTRIBUTION_AGGREGATES_TABLE = var.attribution_aggregates_table_name
      DUB_SECRET_NAME              = var.dub_secret_name
      DUB_WORKSPACE_ID             = var.dub_workspace_id
      TENANT_CONFIG_BUCKET         = var.tenant_config_bucket_name
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
# Hourly EventBridge schedule
# ------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "hourly" {
  name                = "attribution-aggregator-hourly"
  description         = "Trigger Attribution_Aggregator every hour."
  schedule_expression = "rate(1 hour)"
}

resource "aws_cloudwatch_event_target" "hourly" {
  rule      = aws_cloudwatch_event_rule.hourly.name
  target_id = "AttributionAggregator"
  arn       = aws_lambda_function.this.arn
}

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "AllowEventBridgeHourly"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.hourly.arn
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

variable "permissions_boundary_arn" {
  description = "ARN of the picasso-workload-boundary permission boundary (module.iam_workload_boundary). Caps this role's effective permissions to the intersection with the boundary. Null = no boundary (keeps the module usable standalone)."
  type        = string
  default     = null
  validation {
    condition     = var.permissions_boundary_arn == null || can(regex("^arn:aws:iam::[0-9]{12}:policy/", var.permissions_boundary_arn))
    error_message = "permissions_boundary_arn must be null or a valid IAM policy ARN."
  }
}

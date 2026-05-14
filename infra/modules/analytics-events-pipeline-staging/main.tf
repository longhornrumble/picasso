# Phase C (BSH staging-twin): analytics events pipeline.
#
# Path 2 of the analytics architecture — browser POSTs page-view / click /
# chip-interaction events to BSH `?action=analytics`, which batches them to
# SQS, where Analytics_Event_Processor consumes, decodes tenant_hash via the
# tenant-config mappings bucket, writes raw NDJSON to S3, and (when
# DYNAMODB_WRITE_ENABLED=true) per-event rows to picasso-session-events-staging.
#
# Path 1 (server-side direct DDB write to session-summaries via analytics_writer.py/js)
# is unchanged by this module and remains fully operational in the twin.
#
# Dead-but-deployed in prod: Analytics_Aggregator + Athena + picasso-dashboard-aggregates.
# Tracked for separate cleanup in project_cleanup_prod_analytics_legacy.md; NOT twinned.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "session_events_table_arn" {
  description = "ARN of picasso-session-events-staging DDB table. Processor writes per-event rows here when DYNAMODB_WRITE_ENABLED=true."
  type        = string
}

variable "session_events_table_name" {
  description = "Name of picasso-session-events-staging (for SESSION_EVENTS_TABLE env var)."
  type        = string
}

variable "session_summaries_table_name" {
  description = "Name of picasso-session-summaries-staging. Read by the processor module-load even though it never writes (legacy code path in lambda_function.py); pass through for env-var parity with prod."
  type        = string
}

variable "tenant_config_bucket_arn" {
  description = "ARN of myrecruiter-picasso-staging (tenant configs + mappings/ prefix). Processor reads mappings/{tenant_hash}.json to decode hashes."
  type        = string
}

variable "tenant_config_bucket_name" {
  description = "Name of myrecruiter-picasso-staging (for MAPPINGS_BUCKET env var)."
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the processor Lambda."
  type        = number
  default     = 30
}

# ------------------------------------------------------------------
# SQS: main queue + DLQ
# ------------------------------------------------------------------
#
# Queue config mirrors prod (`picasso-analytics-events` in 614056832592):
# visibility_timeout 300s (5× the Lambda timeout of 60s), retention 1d, redrive
# at 3 receives. DLQ retention is the standard 14d so failed messages are
# inspectable long after the source queue ages them out.

resource "aws_sqs_queue" "dlq" {
  name                       = "picasso-analytics-events-staging-dlq"
  message_retention_seconds  = 1209600 # 14d
  sqs_managed_sse_enabled    = true
  visibility_timeout_seconds = 30

  tags = {
    Name = "picasso-analytics-events-staging-dlq"
  }
}

resource "aws_sqs_queue" "events" {
  name                       = "picasso-analytics-events-staging"
  message_retention_seconds  = 86400 # 1d
  visibility_timeout_seconds = 300
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "picasso-analytics-events-staging"
  }
}

# ------------------------------------------------------------------
# S3: raw event archive
# ------------------------------------------------------------------
#
# Event_Processor calls s3.put_object unconditionally per [lambda_function.py:335];
# bucket must exist. Nothing queries the contents (Athena is dormant + not twinned),
# so 30-day lifecycle expiration on the analytics/ prefix bounds storage costs.

resource "aws_s3_bucket" "analytics" {
  bucket = "picasso-analytics-staging"

  tags = {
    Name = "picasso-analytics-staging"
  }
}

resource "aws_s3_bucket_public_access_block" "analytics" {
  bucket = aws_s3_bucket.analytics.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "analytics" {
  bucket = aws_s3_bucket.analytics.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "analytics" {
  bucket = aws_s3_bucket.analytics.id

  rule {
    id     = "expire-raw-events-30d"
    status = "Enabled"

    filter {
      prefix = "analytics/"
    }

    expiration {
      days = 30
    }
  }
}

# ------------------------------------------------------------------
# IAM: minimum-privilege exec role with explicit Denies on prod
# ------------------------------------------------------------------
#
# Prod's Picasso_Analytics_Event_Processor_Role has 15 inline policies, most
# of which are legacy carry-over (BillingEventsRead, ClerkSecretRead,
# EmployeeRegistryV2Access, NotificationSettingsWrite, etc. — none referenced
# by Analytics_Event_Processor's actual code). The staging twin role grants
# ONLY what the handler exercises: SQS read+delete, S3 archive write, S3
# mappings read, DDB session-events write, Logs. Defense-in-depth Denies
# match the [lambda-analytics-dashboard-api-staging/main.tf:257-273] pattern.

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
  name               = "Analytics_Event_Processor-role"
  assume_role_policy = data.aws_iam_policy_document.trust.json
  description        = "Execution role for staging-account Analytics_Event_Processor."
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_iam_policy_document" "exec" {
  statement {
    sid     = "Logs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Analytics_Event_Processor:*",
    ]
  }

  statement {
    sid = "SqsReceive"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
    ]
    resources = [aws_sqs_queue.events.arn]
  }

  statement {
    sid       = "S3AnalyticsWrite"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.analytics.arn}/analytics/*"]
  }

  # Tenant_hash → tenant_id decode reads from the tenant-config bucket's
  # mappings/ prefix. Processor caches in memory across warm invocations.
  statement {
    sid       = "S3MappingsRead"
    actions   = ["s3:GetObject"]
    resources = ["${var.tenant_config_bucket_arn}/mappings/*"]
  }

  statement {
    sid       = "S3MappingsList"
    actions   = ["s3:ListBucket"]
    resources = [var.tenant_config_bucket_arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["mappings/*"]
    }
  }

  statement {
    sid       = "DynamoDBSessionEventsWrite"
    actions   = ["dynamodb:PutItem"]
    resources = [var.session_events_table_arn]
  }

  # Defense-in-depth: never write to the prod tenant-config bucket even if
  # an allow rule above is later widened by accident.
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
  name              = "/aws/lambda/Analytics_Event_Processor"
  retention_in_days = var.log_retention_days
}

# ------------------------------------------------------------------
# Lambda: placeholder code zip. Real code via lambda-repo CI matrix.
# Sizing mirrors prod (256 MB / 60s / x86_64 / 512 MB ephemeral storage).
# ------------------------------------------------------------------

data "archive_file" "placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "processor" {
  function_name = "Analytics_Event_Processor"
  role          = aws_iam_role.exec.arn
  runtime       = "python3.13"
  handler       = "lambda_function.lambda_handler"
  memory_size   = 256
  timeout       = 60
  architectures = ["x86_64"]

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  ephemeral_storage {
    size = 512
  }

  environment {
    variables = {
      ENVIRONMENT             = "staging"
      ANALYTICS_BUCKET        = aws_s3_bucket.analytics.bucket
      MAPPINGS_BUCKET         = var.tenant_config_bucket_name
      SESSION_EVENTS_TABLE    = var.session_events_table_name
      SESSION_SUMMARIES_TABLE = var.session_summaries_table_name
      DYNAMODB_WRITE_ENABLED  = "true"
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code deploys via lambda-repo CI matrix using
    # `aws lambda update-function-code`; don't let subsequent terraform
    # applies revert that.
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.lambda, aws_iam_role_policy.exec]
}

# ------------------------------------------------------------------
# Event source mapping: SQS → Lambda
# ------------------------------------------------------------------
#
# function_response_types = ReportBatchItemFailures is required because the
# processor returns per-message failures (lambda_function.py:184-188) so SQS
# only retries the failed message IDs, not the entire batch.

resource "aws_lambda_event_source_mapping" "sqs" {
  event_source_arn                   = aws_sqs_queue.events.arn
  function_name                      = aws_lambda_function.processor.arn
  batch_size                         = 10
  maximum_batching_window_in_seconds = 5
  function_response_types            = ["ReportBatchItemFailures"]
  enabled                            = true
}

# ------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------

output "queue_url" {
  value = aws_sqs_queue.events.url
}

output "queue_arn" {
  value = aws_sqs_queue.events.arn
}

output "dlq_url" {
  value = aws_sqs_queue.dlq.url
}

output "dlq_arn" {
  value = aws_sqs_queue.dlq.arn
}

output "bucket_name" {
  value = aws_s3_bucket.analytics.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.analytics.arn
}

output "function_arn" {
  value = aws_lambda_function.processor.arn
}

output "function_name" {
  value = aws_lambda_function.processor.function_name
}

output "role_arn" {
  value = aws_iam_role.exec.arn
}

output "role_name" {
  value = aws_iam_role.exec.name
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.lambda.name
}

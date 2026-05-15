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

variable "bsh_role_arn" {
  description = "ARN of the BSH Lambda execution role. Required for the SQS queue resource policy (audit F1 closure). Wired from module.lambda_bedrock_handler_staging[0].role_arn."
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
# visibility_timeout 300s (matches prod queue; AWS recommends ≥6× the Lambda
# timeout of 60s for safety, which would be 360s — kept at 300s for parity
# with prod). Retention 1d, redrive at 3 receives. DLQ retention is 14d so
# failed messages are inspectable long after the source queue ages them out.

resource "aws_sqs_queue" "dlq" {
  name                       = "picasso-analytics-events-staging-dlq"
  message_retention_seconds  = 1209600 # 14d
  sqs_managed_sse_enabled    = true
  visibility_timeout_seconds = 30

  tags = {
    Name = "picasso-analytics-events-staging-dlq"
  }
}

# Phase C.2 audit closure (code-reviewer Gap 2): byQueue redrive permission.
# Default is allowAll; without this, any account queue could nominate this
# DLQ as its dead-letter target, polluting the failed-message inspection
# surface. Lock to only our main events queue.
# Separate resource (not inline on aws_sqs_queue.dlq) to break the circular
# dep: events.redrive_policy → dlq.arn AND dlq.redrive_allow_policy → events.arn.
resource "aws_sqs_queue_redrive_allow_policy" "dlq" {
  queue_url = aws_sqs_queue.dlq.url

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.events.arn]
  })
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

# Phase C audit F1 closure: SQS resource policy. Without this, any
# staging-account IAM principal with `sqs:SendMessage` in their identity
# policy could enqueue arbitrary payloads, bypassing BSH's CF-origin guard.
# Mirrors the JWT/Clerk secret-policy pattern in infra/main.tf — allow ONLY
# the legitimate principal and deny everyone else via aws:PrincipalArn.
# `aws:SourceArn` would be the cleaner condition for service-linked
# invocations, but Lambda direct SDK calls don't populate it; PrincipalArn
# Deny is the correct lever for "lock to one IAM role."
resource "aws_sqs_queue_policy" "events" {
  queue_url = aws_sqs_queue.events.url

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # SQS resource policies only accept `sqs:SendMessage` as the
        # ActionName; `sqs:SendMessageBatch` is rejected by SetQueueAttributes
        # with InvalidParameterValue even though it's a valid IAM action in
        # identity policies. AWS evaluates `sqs:SendMessage` for BOTH the
        # SendMessage and SendMessageBatch API operations, so this Allow
        # covers both call patterns from BSH index.js (lines 135, 143, 174).
        # Per AWS SQS API Reference, "Actions defined by Amazon SQS":
        # https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonsqs.html
        Sid       = "AllowBSHSend"
        Effect    = "Allow"
        Principal = { AWS = var.bsh_role_arn }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.events.arn
      },
      {
        Sid       = "AllowProcessorReceive"
        Effect    = "Allow"
        Principal = { AWS = aws_iam_role.exec.arn }
        Action    = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"]
        Resource  = aws_sqs_queue.events.arn
      },
      {
        # Same pattern as infra/main.tf:307-321 — NotPrincipal doesn't
        # reliably exclude assumed-role sessions; aws:PrincipalArn
        # normalizes back to the role ARN. Permits legitimate principals
        # above; denies all others. SendMessageBatch omitted per the
        # action-name constraint above; sqs:SendMessage denial covers
        # both single and batch SDK calls.
        # Phase C.2 audit closure (rows 17+18): SetQueueAttributes blocks
        # redrive-target tampering / SSE disable; DeleteQueue blocks pipeline
        # destruction. PurgeQueue blocks bulk in-flight clear.
        Sid       = "DenyAllOtherStagingPrincipals"
        Effect    = "Deny"
        Principal = "*"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:PurgeQueue",
          "sqs:SetQueueAttributes",
          "sqs:DeleteQueue",
        ]
        Resource = aws_sqs_queue.events.arn
        Condition = {
          StringNotEquals = {
            "aws:PrincipalArn" = [var.bsh_role_arn, aws_iam_role.exec.arn]
          }
        }
      }
    ]
  })
}

# Phase C audit F7 closure: DLQ resource policy. Without it, any staging
# principal could drain failed messages (which may contain browser-side
# PII in URL fragments). Only the processor role (for inspection) and the
# main queue redrive can reach the DLQ.
resource "aws_sqs_queue_policy" "dlq" {
  queue_url = aws_sqs_queue.dlq.url

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowProcessorInspect"
        Effect    = "Allow"
        Principal = { AWS = aws_iam_role.exec.arn }
        Action    = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource  = aws_sqs_queue.dlq.arn
      },
      {
        # Phase C.2 audit closure (Item 2b + 3b): SendMessage in the Deny
        # set prevents insider injection of fake "failed" messages; SQS
        # service-internal redrive from the main queue doesn't traverse
        # IAM (it's authorized by RedrivePolicy), so this Deny is safe.
        # SetQueueAttributes/DeleteQueue prevent DLQ tampering.
        Sid       = "DenyAllOtherStagingPrincipals"
        Effect    = "Deny"
        Principal = "*"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:PurgeQueue",
          "sqs:SetQueueAttributes",
          "sqs:DeleteQueue",
        ]
        Resource = aws_sqs_queue.dlq.arn
        Condition = {
          StringNotEquals = {
            "aws:PrincipalArn" = aws_iam_role.exec.arn
          }
        }
      }
    ]
  })
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

# Phase C.2 audit closure (row 23 / F5): bucket policy restricting Put/Delete
# to the processor role only. Without this, any staging-account principal
# with `s3:PutObject` on `picasso-analytics-staging/analytics/*` could inject
# fabricated event records, which Analytics_Dashboard_API would then read as
# legitimate. Defense-in-depth on top of the IAM-default-deny posture.
resource "aws_s3_bucket_policy" "analytics" {
  bucket = aws_s3_bucket.analytics.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowProcessorWrite"
        Effect    = "Allow"
        Principal = { AWS = aws_iam_role.exec.arn }
        Action    = ["s3:PutObject"]
        Resource  = "${aws_s3_bucket.analytics.arn}/analytics/*"
      },
      {
        Sid       = "DenyAllOtherWrites"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["s3:PutObject", "s3:DeleteObject"]
        Resource  = "${aws_s3_bucket.analytics.arn}/*"
        Condition = {
          StringNotEquals = {
            "aws:PrincipalArn" = aws_iam_role.exec.arn
          }
        }
      }
    ]
  })
}

# ------------------------------------------------------------------
# KMS: customer-managed key for CloudWatch Logs encryption-at-rest
# ------------------------------------------------------------------
#
# Phase C.2 audit closure (row 27 / F10). Processor logs include session IDs,
# tenant IDs, event types, and (post-Phase-D) URL fragments from page-view
# events that may contain PII. SSE-S3 default uses AWS-managed keys with no
# per-customer rotation or key-policy control. Customer-managed KMS scopes
# the encryption context to this specific log group ARN — even a principal
# with logs:GetLogEvents needs kms:Decrypt on this key, which only the
# CloudWatch Logs service can use under the ArnEquals condition below.

data "aws_iam_policy_document" "logs_kms" {
  statement {
    sid     = "EnableRootAccount"
    actions = ["kms:*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
    resources = ["*"]
  }
  statement {
    sid = "AllowCloudWatchLogs"
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey",
    ]
    principals {
      type        = "Service"
      identifiers = ["logs.${data.aws_region.current.name}.amazonaws.com"]
    }
    resources = ["*"]
    # Scope to ONLY this log group's encryption context. Without this
    # condition, the key could be used by any log group in the account that
    # the CloudWatch Logs service principal can reach.
    condition {
      test     = "ArnEquals"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values = [
        "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Analytics_Event_Processor",
      ]
    }
  }
}

resource "aws_kms_key" "logs" {
  description             = "CMK for Analytics_Event_Processor CloudWatch Logs (Phase C.2)"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  policy                  = data.aws_iam_policy_document.logs_kms.json
}

resource "aws_kms_alias" "logs" {
  name          = "alias/analytics-event-processor-logs-staging"
  target_key_id = aws_kms_key.logs.key_id
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
      # Required by Lambda ESM under ReportBatchItemFailures to extend
      # visibility timeout while processing partial-batch retries.
      # Per AWS Lambda-with-SQS docs (audit code-reviewer Gap 1).
      "sqs:ChangeMessageVisibility",
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
  # S3MappingsList intentionally OMITTED — the handler never calls
  # s3.list_objects_v2 (verified lambda_function.py:69-104), only
  # s3.get_object on specific {tenant_hash}.json keys. Removed in Phase C.2
  # audit-of-audit closure (row 33).
  statement {
    sid       = "S3MappingsRead"
    actions   = ["s3:GetObject"]
    resources = ["${var.tenant_config_bucket_arn}/mappings/*"]
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

  # Phase C.2 audit-of-audit closure (row 24 / F6): extend the prod-S3 Deny
  # to cover the prod analytics bucket too. The processor has no Allow on
  # picasso-analytics (the prod-account bucket), so cross-account default
  # would block this anyway; this is belt-and-braces defense-in-depth.
  statement {
    sid       = "DenyProdAnalyticsBucketWrites"
    effect    = "Deny"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::picasso-analytics/*"]
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

  # Phase C.2 audit-of-audit closure (row 24 / F6): extend the prod Deny to
  # SQS. The processor has no Allow on cross-account SQS, but the prior
  # audit recommended completing the defense-in-depth pattern across all
  # prod-account resources mentioned in the data flows.
  statement {
    sid       = "DenyAllProdSqs"
    effect    = "Deny"
    actions   = ["sqs:*"]
    resources = ["arn:aws:sqs:*:614056832592:*"]
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
  # Phase C.2 audit-of-audit closure (row 27 / F10). KMS-encrypted at rest.
  # The KMS key's policy scopes use to this exact log-group ARN, so a
  # logs:GetLogEvents grant alone is insufficient — kms:Decrypt is required.
  kms_key_id = aws_kms_key.logs.arn
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

  # ephemeral_storage block intentionally omitted — handler has no
  # disk I/O. Lambda default of 512MB applies. Phase C.2 cleanup (row 35).

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

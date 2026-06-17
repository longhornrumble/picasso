# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 Tier 2 (production-only): the prod Master_Function Lambda + log group.
#
# Adopts the live, hand-managed `Master_Function` Lambda (account 614056832592)
# into Terraform via `terraform import` (state-only, zero live change). Mirrors
# the bsh-function-prod belt: placeholder code source + lifecycle.ignore_changes
# so future applies never revert the deployed code.
#
# SCOPE:
#   - aws_lambda_function.this         — import ID: Master_Function
#   - aws_cloudwatch_log_group.lambda  — import ID: /aws/lambda/Master_Function_v2
#
# NOT MANAGED HERE (by design):
#   - The execution role `Master_Function-role-zyux77wq` (path /service-role/) —
#     managed by module mfs-iam-grants-prod which owns the 14 inline policies by
#     name. The role resource + trust policy + 4 managed-policy attachments stay
#     hand-managed. This module references the role ONLY by its full ARN.
#   - 4 managed-policy attachments (NOT managed; reference only):
#       AmazonS3ReadOnlyAccess (arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess)
#       AmazonBedrockFullAccess (arn:aws:iam::aws:policy/AmazonBedrockFullAccess)
#       AWSLambdaBasicExecutionRole-0c1b8cb6-... (service-role scoped logs)
#       PICASSO-DynamoDB-Access-Policy (arn:...:policy/PICASSO-DynamoDB-Access-Policy)
#   - No Function URL (Master_Function has none — invoked via API Gateway only).
#   - No reserved concurrency (null live).
#   - No code_signing_config (null live).
#   - No VPC config, no dead_letter_config (null live).
#
# import IDs (operator-run; see runbook):
#   aws_lambda_function.this        -> Master_Function
#   aws_cloudwatch_log_group.lambda -> /aws/lambda/Master_Function_v2
# ─────────────────────────────────────────────────────────────────────────────

# Gating: all resources in this module are production-only.
locals {
  count = var.env == "production" ? 1 : 0

  # The live hand-made execution role ARN. This module does NOT manage the role;
  # it only references it. The role is at path /service-role/ (per role-meta.json).
  role_arn = "arn:aws:iam::614056832592:role/service-role/Master_Function-role-zyux77wq"
}

# Placeholder code zip — satisfies the required filename arg at plan/apply time.
# Real code deploys via `aws lambda update-function-code` (out-of-band CI).
# lifecycle.ignore_changes below prevents any subsequent apply from reverting the
# live deployed code to this placeholder.
data "archive_file" "placeholder" {
  count       = local.count
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "this" {
  count = local.count

  function_name = "Master_Function"
  role          = local.role_arn
  runtime       = "python3.13"
  handler       = "lambda_function.lambda_handler"
  memory_size   = 2048
  timeout       = 90
  architectures = ["x86_64"]
  package_type  = "Zip"

  filename         = data.archive_file.placeholder[0].output_path
  source_code_hash = data.archive_file.placeholder[0].output_base64sha256

  ephemeral_storage {
    size = 512
  }

  # Layer ARN from mfs-prod-config.json Layers[0].Arn. Version-pinned (:2) to
  # match the live state exactly. If this is ignored_in_lifecycle, a future
  # apply would remove the layer from the live function. It is NOT ignored here;
  # layer upgrades should flow through a PR like any other config change.
  layers = ["arn:aws:lambda:us-east-1:614056832592:layer:requests-layer:2"]

  # Non-default: ApplyOn=PublishedVersions is live (function-edge.json).
  # Omitting this block would leave the provider using the default
  # (ApplyOn=None), which would show as a diff in the post-import plan
  # and trigger a modify of the live function. MUST be declared.
  snap_start {
    apply_on = "PublishedVersions"
  }

  # logging_config: log_group is the non-default "/aws/lambda/Master_Function_v2"
  # (not "/aws/lambda/Master_Function"). Omitting or misstating this would cause
  # the provider to reset it, which would break existing log routing + alarms.
  logging_config {
    log_format = "Text"
    log_group  = "/aws/lambda/Master_Function_v2"
  }

  # All 20 env vars — values copied verbatim from mfs-prod-config.json.
  # Do NOT reorder semantically or normalise values; byte equality with the
  # live state is required for a zero-change post-import plan.
  environment {
    variables = {
      AUDIT_TABLE_NAME            = "picasso-audit-production"
      BEDROCK_MODEL_ID            = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
      BLACKLIST_TABLE_NAME        = "picasso-token-blacklist"
      CONFIG_BUCKET               = "myrecruiter-picasso"
      DYNAMODB_POOL_SIZE          = "5"
      ENVIRONMENT                 = "production"
      FORM_SUBMISSIONS_TABLE      = "picasso_form_submissions"
      JWT_EXPIRY_MINUTES          = "30"
      JWT_SECRET_KEY_NAME         = "picasso/production/jwt/signing-key"
      MESSAGES_TABLE_NAME         = "picasso-recent-messages"
      MONITORING_ENABLED          = "true"
      NOTIFICATION_SENDS_TABLE    = "picasso-notification-sends"
      PII_SUBJECT_INDEX_TABLE     = "picasso-pii-subject-index"
      S3_BUCKET                   = "myrecruiter-picasso"
      SESSION_POOL_SIZE           = "10"
      SESSION_SUMMARIES_TABLE     = "picasso-session-summaries"
      STREAMING_ENDPOINT          = "https://xqc4wnxwia2nytjkbw6xasjd6q0jckgb.lambda-url.us-east-1.on.aws/"
      SUMMARIES_TABLE_NAME        = "picasso-conversation-summaries"
      TENANT_REGISTRY_TABLE       = "picasso-tenant-registry-production"
      USE_REGISTRY_FOR_RESOLUTION = "true"
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  # TAGS NOTE: The live function carries 4 resource-level tags (Project,
  # Owner, CostCenter, Environment — from function-edge.json). These are
  # declared here to achieve a faithful import. However, if the root provider
  # block uses `default_tags`, those tags will be MERGED with these resource-
  # level tags at plan time. Review the post-import plan output carefully:
  #   - If default_tags already supplies any of these 4 keys with the same
  #     value, Terraform may show a conflict or a no-op — verify.
  #   - If default_tags supplies Environment=production (same value), the
  #     provider de-duplicates it; if the values differ, the plan will show
  #     a diff. Resolve by removing the conflicting key from this block and
  #     relying on default_tags, then re-import.
  #   - The BSH function (bsh-function-prod) intentionally omits a tags block
  #     and relies solely on default_tags. MFS has 4 live resource-level tags
  #     that are NOT on BSH, so a tags block is required here for faithful import.
  tags = {
    Project     = "core-processing"
    Owner       = "ai-team"
    CostCenter  = "commercial"
    Environment = "production"
  }

  lifecycle {
    # Real code deploys via `aws lambda update-function-code` (out-of-band CI);
    # do not let any subsequent terraform apply revert to the placeholder zip.
    # `description` carries a deploy-time changelog string bumped per release
    # (live: "Reset circuit breaker - Wed Aug 27 16:35:06 CDT 2025"); treating
    # it as code-deploy metadata, ignored alongside source, mirrors bsh-function-prod.
    # (last_modified is read-only/computed — it can't appear in ignore_changes;
    # terraform warns it has no effect, so it's deliberately omitted.)
    ignore_changes = [filename, source_code_hash, description]
  }

  depends_on = [aws_cloudwatch_log_group.lambda]
}

# Log group for the function.
# CRITICAL: name is "/aws/lambda/Master_Function_v2" (NOT "...Master_Function").
# Live: retention 7 days, STANDARD class, NO KMS key. A faithful import must NOT
# add a CMK — the staging module adds one; prod has none.
resource "aws_cloudwatch_log_group" "lambda" {
  count = local.count

  name              = "/aws/lambda/Master_Function_v2"
  retention_in_days = 7
  log_group_class   = "STANDARD"

  # prevent_destroy mirrors the bsh-function-prod pattern: if any existing
  # metric filters or alarms reference this log group by name, a destroy/replace
  # plan would silently kill them. Block it.
  lifecycle {
    prevent_destroy = true
  }
}

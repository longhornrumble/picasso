# Meta Messenger project — staging-account twin of the 3-Lambda Meta cluster
# (prod-account 614056832592 originals last deployed 2026-04-16).
#
#   Meta_Webhook_Handler     node22  256MB 10s   public Function URL (Meta → us)
#   Meta_Response_Processor  node22  512MB 120s  async-invoked; async DLQ
#   Meta_OAuth_Handler       py3.13  256MB 30s   public Function URL (OAuth)
#
# Each Lambda gets a DEDICATED execution role (never shared — lambda#44 lesson),
# a KMS-encrypted log group (Phase C.2 pattern), and a placeholder zip on first
# apply with `ignore_changes = [filename, source_code_hash]` so real code lands
# via the lambda-repo CI matrix. Env vars are Terraform-managed (NOT ignored —
# Phase D audit row #1).
#
# FAITHFUL-TWIN DIVERGENCE (Meta_Response_Processor): the 614 original ran in
# the SAME account as the Bedrock KB, so it carried none of the cross-account
# KB wiring. In the staging account the KB is cross-account (614), so this twin
# must mirror Bedrock_Streaming_Handler_Staging's pattern: KB_RETRIEVER_ROLE_ARN
# + sts:AssumeRole into the prod-side retriever role, CONFIG_BUCKET pointed at
# the staging tenant-config bucket, and TENANT_REGISTRY_TABLE for bedrock-core's
# registry resolution. The paired Lambda code change adds @aws-sdk/credential-
# providers to Meta_Response_Processor (bedrock-core needs it to assume the role;
# without it KB Retrieve silently falls back to default creds and fails).

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "channel_mappings_table_arn" {
  description = "ARN of picasso-channel-mappings. OAuth writes Page tokens; Webhook reads tenant routing; Response Processor reads token + updates lastUserMessageAt."
  type        = string
}

variable "channel_mappings_table_name" {
  type = string
}

variable "channel_mappings_tenant_index_arn" {
  description = "ARN of the TenantIndex GSI — Meta_OAuth_Handler queries it to list a tenant's connected channels."
  type        = string
}

variable "webhook_dedup_table_arn" {
  description = "ARN of picasso-webhook-dedup. Meta_Webhook_Handler Get/Put's inbound message `mid` for idempotency."
  type        = string
}

variable "webhook_dedup_table_name" {
  type = string
}

variable "conversation_state_table_arn" {
  description = "ARN of picasso-conversation-state (contract C4). Response Processor owns every row shape: serialization lock (M1c), escalation pause (M6a), form sessions (M7a), scheduling sessions (M8a), throttle counters (M-Hb)."
  type        = string
}

variable "conversation_state_table_name" {
  type = string
}

variable "recent_messages_table_arn" {
  description = "ARN of the EXISTING picasso-recent-messages table (module.ddb_recent_messages_staging). Shared with core chat — schema-identical (sessionId/messageTimestamp). Response Processor Query's prior context + Put's the new Q&A pair."
  type        = string
}

variable "recent_messages_table_name" {
  type = string
}

variable "tenant_registry_table_arn" {
  description = "ARN of picasso-tenant-registry-staging. bedrock-core resolves tenantHash→config via the registry when USE_REGISTRY_FOR_RESOLUTION=true."
  type        = string
}

variable "tenant_registry_table_name" {
  type = string
}

variable "channel_tokens_kms_key_arn" {
  description = "ARN of the alias/picasso-channel-tokens CMK. OAuth Encrypt/GenerateDataKey; Response Processor Decrypt."
  type        = string
}

variable "channel_tokens_kms_key_alias" {
  description = "Alias string (alias/picasso-channel-tokens) — set as KMS_KEY_ID env on the Lambdas that use it."
  type        = string
}

variable "meta_app_secret_arn" {
  description = "ARN of picasso/meta/app-secret. Webhook HMAC verify + OAuth token exchange."
  type        = string
}

variable "ig_app_secret_arn" {
  description = "ARN of picasso/meta/ig-app-secret. Webhook Instagram-object HMAC verify."
  type        = string
}

variable "analytics_queue_arn" {
  description = "ARN of picasso-analytics-events-staging (525). Response Processor SendMessage's analytics events. Faithful-twin rewrite of the 614 ANALYTICS_QUEUE_URL."
  type        = string
}

variable "analytics_queue_url" {
  type = string
}

variable "tenant_config_bucket_arn" {
  description = "ARN of myrecruiter-picasso-staging. bedrock-core loadConfig reads s3://<bucket>/<tenant>.json."
  type        = string
}

variable "config_bucket_name" {
  description = "Name of myrecruiter-picasso-staging — set as CONFIG_BUCKET (bedrock-core defaults to the PROD bucket if unset)."
  type        = string
}


variable "kb_retriever_role_arns" {
  description = "Cross-account IAM role ARNs the Response Processor may sts:AssumeRole into for KB Retrieve (Bedrock KBs aren't RAM-shareable)."
  type        = list(string)
}

variable "meta_app_id" {
  description = "Meta (Facebook) App ID — the app registered for this environment's Meta integration. Set as META_APP_ID on Meta_OAuth_Handler."
  type        = string
}

variable "meta_login_config_id" {
  description = "Facebook Login for Business configuration ID. Use-case (business type) Meta apps must send config_id instead of scope in the OAuth dialog. Empty = legacy scope dialog. Set as META_LOGIN_CONFIG_ID on Meta_OAuth_Handler."
  type        = string
  default     = ""
}

variable "messenger_verify_token" {
  description = "Webhook GET-verification shared secret (Meta App Dashboard → Webhooks). Reuse the 614 value so Meta re-verification passes at cutover. Sensitive; supplied via TF_VAR_ from a GitHub staging-environment secret."
  type        = string
  sensitive   = true
}

variable "meta_oauth_callback_url" {
  description = "Public OAuth callback URL registered in the Meta App Dashboard, e.g. https://<oauth-fn-url>/meta/oauth/callback. Empty on the FIRST apply (the OAuth Function URL doesn't exist yet — a Lambda cannot reference its own Function URL without a Terraform cycle). Two-apply: apply → read oauth_function_url output → set this in root main.tf → re-apply → register in Meta App Dashboard."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30
}

# ------------------------------------------------------------------
# Common
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

locals {
  prod_account_id = "614056832592"
}

# Reusable KMS-for-logs policy builder is not a thing in HCL; each log-group
# CMK below repeats the EnableRootAccount + AllowCloudWatchLogs (scoped to the
# specific log-group ARN) pair — same shape as lambda-sms-twin-staging.

# =============================================================================
# Meta_Webhook_Handler
# =============================================================================

data "aws_iam_policy_document" "webhook_logs_kms" {
  statement {
    sid       = "EnableRootAccount"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
  statement {
    sid       = "AllowCloudWatchLogs"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${data.aws_region.current.name}.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Meta_Webhook_Handler"]
    }
  }
}

resource "aws_kms_key" "webhook_logs" {
  description             = "CMK for Meta_Webhook_Handler CloudWatch Logs"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  policy                  = data.aws_iam_policy_document.webhook_logs_kms.json
}

resource "aws_kms_alias" "webhook_logs" {
  name          = "alias/meta-webhook-handler-logs-staging"
  target_key_id = aws_kms_key.webhook_logs.key_id
}

resource "aws_iam_role" "webhook" {
  name                 = "Meta_Webhook_Handler-role"
  permissions_boundary = var.permissions_boundary_arn
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  description          = "Execution role for staging-account Meta_Webhook_Handler."
}

data "aws_iam_policy_document" "webhook_exec" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Meta_Webhook_Handler:*"]
  }
  statement {
    sid       = "ChannelMappingsRead"
    actions   = ["dynamodb:GetItem", "dynamodb:Query"]
    resources = [var.channel_mappings_table_arn, var.channel_mappings_tenant_index_arn]
  }
  statement {
    sid       = "DedupReadWrite"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem"]
    resources = [var.webhook_dedup_table_arn]
  }
  statement {
    sid       = "MetaSecretsRead"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["${var.meta_app_secret_arn}*", "${var.ig_app_secret_arn}*"]
  }
  statement {
    sid       = "InvokeResponseProcessor"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.response_processor.arn]
  }
  # Defense-in-depth: this Lambda never legitimately touches any prod-account
  # resource. Account boundary is the primary control; these are belt-and-braces.
  statement {
    sid       = "DenyAllProdDynamoDB"
    effect    = "Deny"
    actions   = ["dynamodb:*"]
    resources = ["arn:aws:dynamodb:*:${local.prod_account_id}:*"]
  }
  statement {
    sid       = "DenyAllProdSecrets"
    effect    = "Deny"
    actions   = ["secretsmanager:*"]
    resources = ["arn:aws:secretsmanager:*:${local.prod_account_id}:*"]
  }
  statement {
    sid       = "DenyAllProdLambda"
    effect    = "Deny"
    actions   = ["lambda:*"]
    resources = ["arn:aws:lambda:*:${local.prod_account_id}:*"]
  }
}

resource "aws_iam_role_policy" "webhook_exec" {
  name   = "exec-policy"
  role   = aws_iam_role.webhook.id
  policy = data.aws_iam_policy_document.webhook_exec.json
}

resource "aws_cloudwatch_log_group" "webhook" {
  name              = "/aws/lambda/Meta_Webhook_Handler"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.webhook_logs.arn
}

data "archive_file" "webhook_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder-webhook"
  output_path = "${path.module}/placeholder-webhook.zip"
}

resource "aws_lambda_function" "webhook" {
  function_name = "Meta_Webhook_Handler"
  role          = aws_iam_role.webhook.arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  memory_size   = 256
  timeout       = 10
  architectures = ["x86_64"]

  filename         = data.archive_file.webhook_placeholder.output_path
  source_code_hash = data.archive_file.webhook_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT                 = "staging"
      CHANNEL_MAPPINGS_TABLE      = var.channel_mappings_table_name
      DEDUP_TABLE                 = var.webhook_dedup_table_name
      MESSENGER_VERIFY_TOKEN      = var.messenger_verify_token
      META_APP_SECRET_ARN         = var.meta_app_secret_arn
      IG_APP_SECRET_ARN           = var.ig_app_secret_arn
      RESPONSE_PROCESSOR_FUNCTION = aws_lambda_function.response_processor.function_name
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.webhook, aws_iam_role_policy.webhook_exec]
}

# Public Function URL — Meta POSTs webhook events here. Auth NONE at the URL
# layer; the handler validates the X-Hub-Signature-256 HMAC on every POST and
# the verify token on the GET challenge. No cors{} block — server-to-server
# (Meta backends, not browsers); AWS rejects empty AllowOrigins (Phase D #12).
resource "aws_lambda_function_url" "webhook" {
  function_name      = aws_lambda_function.webhook.function_name
  authorization_type = "NONE"
}

# ──────────────────────────────────────────────────────────────────────
# # MANUAL STEP REQUIRED — see full note in lambda-bedrock-handler-staging
# After creation, AWS Console → Lambda → Meta_Webhook_Handler →
# Configuration → Function URL → Edit → Save (no changes). Adds the
# missing FunctionURLAllowInvokeAction policy statement that AWS provider
# 5.x can't create — WITHOUT IT THE URL RETURNS HTTP 403 and the handler
# is never invoked (zero log streams). Verify both SIDs present:
# aws lambda get-policy --function-name Meta_Webhook_Handler. Re-run if
# the Lambda is ever destroyed/recreated.
# ──────────────────────────────────────────────────────────────────────

# =============================================================================
# Meta_Response_Processor
# =============================================================================

# Async-invoke dead-letter queue. Lambda's async invoke path delivers failed
# events here using THIS function's execution role (hence sqs:SendMessage in
# the exec policy). Alarmed by ops-alarms-meta-staging on depth > 0.
resource "aws_sqs_queue" "response_dlq" {
  name                      = "meta-response-processor-dlq-staging"
  message_retention_seconds = 1209600 # 14 days
  tags = {
    Name = "meta-response-processor-dlq-staging"
  }
}

data "aws_iam_policy_document" "response_logs_kms" {
  statement {
    sid       = "EnableRootAccount"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
  statement {
    sid       = "AllowCloudWatchLogs"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${data.aws_region.current.name}.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Meta_Response_Processor"]
    }
  }
}

resource "aws_kms_key" "response_logs" {
  description             = "CMK for Meta_Response_Processor CloudWatch Logs"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  policy                  = data.aws_iam_policy_document.response_logs_kms.json
}

resource "aws_kms_alias" "response_logs" {
  name          = "alias/meta-response-processor-logs-staging"
  target_key_id = aws_kms_key.response_logs.key_id
}

resource "aws_iam_role" "response_processor" {
  name                 = "Meta_Response_Processor-role"
  permissions_boundary = var.permissions_boundary_arn
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  description          = "Execution role for staging-account Meta_Response_Processor (RAG via shared bedrock-core, cross-account KB)."
}

data "aws_iam_policy_document" "response_exec" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Meta_Response_Processor:*"]
  }
  statement {
    sid       = "ChannelMappingsReadWrite"
    actions   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
    resources = [var.channel_mappings_table_arn]
  }
  statement {
    sid       = "RecentMessagesReadWrite"
    actions   = ["dynamodb:Query", "dynamodb:PutItem", "dynamodb:GetItem"]
    resources = [var.recent_messages_table_arn]
  }
  # M1b is_deleted hygiene: delete history rows for a Meta-deleted message.
  # Own sid so the grant reads as what it is - the Meta-terms deletion path,
  # scoped to the shared recent-messages table (code filters meta: sessions).
  statement {
    sid       = "RecentMessagesDeleteForMetaIsDeleted"
    actions   = ["dynamodb:DeleteItem"]
    resources = [var.recent_messages_table_arn]
  }
  # Conversation-state table (contract C4): lock/coalesce serialization rows
  # now; pause (M6a), form sessions (M7a), scheduling sessions (M8a),
  # counters (M-Hb) later. Same-role only - never shared (lambda#44 rule).
  statement {
    sid       = "ConversationStateReadWrite"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"]
    resources = [var.conversation_state_table_arn]
  }
  # M6a escalation: staff notification email (mirrors the BSH/MFS SES rail;
  # identity-wide like those roles - the from address is env-pinned).
  statement {
    sid       = "SesSendEscalationEmail"
    actions   = ["ses:SendEmail"]
    resources = ["*"]
  }
  # bedrock-core registry resolution (USE_REGISTRY_FOR_RESOLUTION=true) —
  # mirrors bedrock-handler's DynamoDBTenantRegistryRead.
  statement {
    sid       = "TenantRegistryRead"
    actions   = ["dynamodb:GetItem", "dynamodb:Query"]
    resources = [var.tenant_registry_table_arn, "${var.tenant_registry_table_arn}/index/*"]
  }
  statement {
    sid       = "ChannelTokenDecrypt"
    actions   = ["kms:Decrypt"]
    resources = [var.channel_tokens_kms_key_arn]
  }
  statement {
    sid       = "TenantConfigRead"
    actions   = ["s3:GetObject"]
    resources = ["${var.tenant_config_bucket_arn}/*"]
  }
  # bedrock-core's loadConfig LISTS the bucket to resolve the tenant's config
  # key before GetObject. Without this the Meta channel silently degrades:
  # loadConfig -> null -> no KB ID -> ungrounded replies (found live 2026-07-12;
  # BSH never exercises this list path, so the twin parity check missed it).
  statement {
    sid       = "TenantConfigList"
    actions   = ["s3:ListBucket"]
    resources = [var.tenant_config_bucket_arn]
  }
  # Non-streaming InvokeModel (Response Processor uses InvokeModelCommand).
  statement {
    sid     = "BedrockInvokeClaudeHaiku"
    actions = ["bedrock:InvokeModel"]
    resources = [
      "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-*",
      "arn:aws:bedrock:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:inference-profile/*",
    ]
  }
  # Cross-account KB: bedrock-core assumes this prod-side role (KBs aren't
  # RAM-shareable). Intentionally NOT covered by a prod Deny — this is the
  # sanctioned cross-account seam (same as Bedrock_Streaming_Handler_Staging).
  dynamic "statement" {
    for_each = length(var.kb_retriever_role_arns) > 0 ? [1] : []
    content {
      sid       = "AssumeKBRetrieverRole"
      actions   = ["sts:AssumeRole"]
      resources = var.kb_retriever_role_arns
    }
  }
  statement {
    sid       = "SqsAnalyticsAndDlqSend"
    actions   = ["sqs:SendMessage"]
    resources = [var.analytics_queue_arn, aws_sqs_queue.response_dlq.arn]
  }
  # Defense-in-depth on the resource classes this Lambda only ever touches in
  # 525. DDB/Secrets are never prod; bedrock + sts are deliberately omitted
  # (cross-account KB needs them).
  statement {
    sid       = "DenyAllProdDynamoDB"
    effect    = "Deny"
    actions   = ["dynamodb:*"]
    resources = ["arn:aws:dynamodb:*:${local.prod_account_id}:*"]
  }
  statement {
    sid       = "DenyAllProdSecrets"
    effect    = "Deny"
    actions   = ["secretsmanager:*"]
    resources = ["arn:aws:secretsmanager:*:${local.prod_account_id}:*"]
  }
}

resource "aws_iam_role_policy" "response_exec" {
  name   = "exec-policy"
  role   = aws_iam_role.response_processor.id
  policy = data.aws_iam_policy_document.response_exec.json
}

resource "aws_cloudwatch_log_group" "response_processor" {
  name              = "/aws/lambda/Meta_Response_Processor"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.response_logs.arn
}

data "archive_file" "response_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder-response"
  output_path = "${path.module}/placeholder-response.zip"
}

resource "aws_lambda_function" "response_processor" {
  function_name = "Meta_Response_Processor"
  role          = aws_iam_role.response_processor.arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  memory_size   = 512
  timeout       = 120
  architectures = ["x86_64"]

  filename         = data.archive_file.response_placeholder.output_path
  source_code_hash = data.archive_file.response_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT              = "staging"
      CHANNEL_MAPPINGS_TABLE   = var.channel_mappings_table_name
      RECENT_MESSAGES_TABLE    = var.recent_messages_table_name
      CONVERSATION_STATE_TABLE = var.conversation_state_table_name
      # M6a escalation rail
      SES_FROM_EMAIL      = "notify@staging.myrecruiter.ai"
      FB_INBOX_APP_ID     = "263902037430900"
      IG_INBOX_APP_ID     = "1217981644879628"
      KMS_KEY_ID          = var.channel_tokens_kms_key_alias
      ANALYTICS_QUEUE_URL = var.analytics_queue_url
      # Cross-account KB wiring (absent on the 614 same-account original).
      KB_RETRIEVER_ROLE_ARN       = length(var.kb_retriever_role_arns) > 0 ? var.kb_retriever_role_arns[0] : ""
      CONFIG_BUCKET               = var.config_bucket_name
      TENANT_REGISTRY_TABLE       = var.tenant_registry_table_name
      USE_REGISTRY_FOR_RESOLUTION = "true"
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.response_dlq.arn
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.response_processor, aws_iam_role_policy.response_exec]
}

# =============================================================================
# Meta_OAuth_Handler
# =============================================================================

data "aws_iam_policy_document" "oauth_logs_kms" {
  statement {
    sid       = "EnableRootAccount"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
  statement {
    sid       = "AllowCloudWatchLogs"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${data.aws_region.current.name}.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Meta_OAuth_Handler"]
    }
  }
}

resource "aws_kms_key" "oauth_logs" {
  description             = "CMK for Meta_OAuth_Handler CloudWatch Logs"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  policy                  = data.aws_iam_policy_document.oauth_logs_kms.json
}

resource "aws_kms_alias" "oauth_logs" {
  name          = "alias/meta-oauth-handler-logs-staging"
  target_key_id = aws_kms_key.oauth_logs.key_id
}

resource "aws_iam_role" "oauth" {
  name                 = "Meta_OAuth_Handler-role"
  permissions_boundary = var.permissions_boundary_arn
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  description          = "Execution role for staging-account Meta_OAuth_Handler (Page OAuth connect/disconnect/toggle/list)."
}

data "aws_iam_policy_document" "oauth_exec" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Meta_OAuth_Handler:*"]
  }
  statement {
    sid       = "ChannelMappingsCrud"
    actions   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"]
    resources = [var.channel_mappings_table_arn, var.channel_mappings_tenant_index_arn]
  }
  # M5 welcome-surface push on connect: read the tenant config (keyed by
  # tenant_id directly - no mapping/registry resolution needed here).
  statement {
    sid       = "TenantConfigReadForWelcomePush"
    actions   = ["s3:GetObject"]
    resources = ["${var.tenant_config_bucket_arn}/tenants/*"]
  }
  statement {
    sid       = "ChannelTokenEncryptDecrypt"
    actions   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"]
    resources = [var.channel_tokens_kms_key_arn]
  }
  # Connect-time lookup of the PLATFORM tenantHash — bedrock-core resolves
  # configs by the registry hash, so the mapping row must carry it (a locally
  # computed hash matched nothing → ungrounded replies; found live 2026-07-12).
  statement {
    sid       = "TenantRegistryRead"
    actions   = ["dynamodb:GetItem"]
    resources = [var.tenant_registry_table_arn]
  }
  statement {
    sid       = "MetaAppSecretRead"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["${var.meta_app_secret_arn}*"]
  }
  statement {
    sid       = "DenyAllProdDynamoDB"
    effect    = "Deny"
    actions   = ["dynamodb:*"]
    resources = ["arn:aws:dynamodb:*:${local.prod_account_id}:*"]
  }
  statement {
    sid       = "DenyAllProdSecrets"
    effect    = "Deny"
    actions   = ["secretsmanager:*"]
    resources = ["arn:aws:secretsmanager:*:${local.prod_account_id}:*"]
  }
}

resource "aws_iam_role_policy" "oauth_exec" {
  name   = "exec-policy"
  role   = aws_iam_role.oauth.id
  policy = data.aws_iam_policy_document.oauth_exec.json
}

resource "aws_cloudwatch_log_group" "oauth" {
  name              = "/aws/lambda/Meta_OAuth_Handler"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.oauth_logs.arn
}

data "archive_file" "oauth_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder-oauth"
  output_path = "${path.module}/placeholder-oauth.zip"
}

resource "aws_lambda_function" "oauth" {
  function_name = "Meta_OAuth_Handler"
  role          = aws_iam_role.oauth.arn
  runtime       = "python3.13"
  handler       = "lambda_function.lambda_handler"
  memory_size   = 256
  timeout       = 30
  architectures = ["x86_64"]

  filename         = data.archive_file.oauth_placeholder.output_path
  source_code_hash = data.archive_file.oauth_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT            = "staging"
      META_APP_ID            = var.meta_app_id
      META_APP_SECRET_ARN    = var.meta_app_secret_arn
      KMS_KEY_ID             = var.channel_tokens_kms_key_alias
      OAUTH_CALLBACK_URL     = var.meta_oauth_callback_url
      CHANNEL_MAPPINGS_TABLE = var.channel_mappings_table_name
      META_LOGIN_CONFIG_ID   = var.meta_login_config_id
      TENANT_REGISTRY_TABLE  = var.tenant_registry_table_name
      # M5: welcome-surface push reads messenger_behavior.welcome at connect.
      CONFIG_BUCKET = var.config_bucket_name
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.oauth, aws_iam_role_policy.oauth_exec]
}

# Public Function URL — Meta redirects the OAuth callback here, and the Config
# Builder Channels UI calls the Clerk-JWT-gated management routes. Auth NONE at
# the URL layer (the callback is gated by the signed-state JWT; mgmt routes by
# Clerk JWT validated in-handler). No cors{} block.
resource "aws_lambda_function_url" "oauth" {
  function_name      = aws_lambda_function.oauth.function_name
  authorization_type = "NONE"
}

# ──────────────────────────────────────────────────────────────────────
# # MANUAL STEP REQUIRED — see full note in lambda-bedrock-handler-staging
# After creation, AWS Console → Lambda → Meta_OAuth_Handler →
# Configuration → Function URL → Edit → Save (no changes). Adds the
# missing FunctionURLAllowInvokeAction policy statement that AWS provider
# 5.x can't create — WITHOUT IT THE URL RETURNS HTTP 403 and the handler
# is never invoked (zero log streams). Verify both SIDs present:
# aws lambda get-policy --function-name Meta_OAuth_Handler. Re-run if
# the Lambda is ever destroyed/recreated.
# ──────────────────────────────────────────────────────────────────────

# =============================================================================
# Outputs
# =============================================================================

output "webhook_function_name" {
  value = aws_lambda_function.webhook.function_name
}

output "webhook_function_arn" {
  value = aws_lambda_function.webhook.arn
}

output "webhook_function_url" {
  value = aws_lambda_function_url.webhook.function_url
}

output "webhook_role_arn" {
  value = aws_iam_role.webhook.arn
}

output "response_processor_function_name" {
  value = aws_lambda_function.response_processor.function_name
}

output "response_processor_function_arn" {
  value = aws_lambda_function.response_processor.arn
}

output "response_processor_role_arn" {
  value = aws_iam_role.response_processor.arn
}

output "oauth_function_name" {
  value = aws_lambda_function.oauth.function_name
}

output "oauth_function_arn" {
  value = aws_lambda_function.oauth.arn
}

# Capture this after the FIRST apply, set meta_oauth_callback_url in root
# main.tf to "<this>/meta/oauth/callback", re-apply, then register in the
# Meta App Dashboard (cutover C1/C2).
output "oauth_function_url" {
  value = aws_lambda_function_url.oauth.function_url
}

output "oauth_role_arn" {
  value = aws_iam_role.oauth.arn
}

output "response_dlq_arn" {
  value = aws_sqs_queue.response_dlq.arn
}

output "response_dlq_name" {
  value = aws_sqs_queue.response_dlq.name
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

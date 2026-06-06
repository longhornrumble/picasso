# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 Tier 2 (production-only): the prod BSH Lambda FUNCTION + its env vars.
#
# Adopts the live, hand-managed `Bedrock_Streaming_Handler` function (account
# 614) into Terraform via `terraform import` (state-only, zero live change) —
# the same belt Tier 1 proved on the role's inline policies. This closes the
# env-var-DRIFT incident class: the 2026-05-23 Foster Village outage was an
# unset/drifted BEDROCK_MODEL_ID env var, and the cascade fixes hand-mutated
# SESSION_SUMMARIES_TABLE + registry env vars live. Under Terraform, every env
# change becomes a reviewed PR + gated apply, not a hand `update-function-configuration`.
#
# SCOPE (operator decision 2026-06-06): function + Function URL ONLY. Two
# adjacent surfaces are DEFERRED and stay hand-managed (flagged VISIBLE here,
# Tier-1 deferred-posture pattern):
#   • Log group `/aws/lambda/Bedrock_Streaming_Handler` (retention 7, no KMS).
#     Defer-ok: peripheral to env-var governance; importing it adds zero-change
#     matching risk for no incident-class benefit. (Staging's module ADDS a KMS
#     CMK here — prod has none; a faithful import must NOT add one.)
#   • `aws_lambda_permission` "allow-api-gateway-invoke-prod" (API GW kgvc8xnewf
#     → this function). Defer-ok: a second, stable invoke path unrelated to the
#     env-var class; adopt in a later increment if that API GW is itself adopted.
#
# NOT MANAGED HERE (by design):
#   • The execution ROLE `Bedrock-Streaming-Handler-Role` — Tier 1's
#     bsh-iam-grants-prod owns its 8 inline policies by-name; the role resource
#     itself stays hand-made. This module only REFERENCES it by ARN.
#   • Reserved concurrency (none set live), VPC/DLQ/layers/FS (all absent live).
#
# import IDs (operator-run, see docs/runbooks/prod-iac-tier2-bsh-function.md):
#   aws_lambda_function.this      → Bedrock_Streaming_Handler
#   aws_lambda_function_url.this   → Bedrock_Streaming_Handler
# ─────────────────────────────────────────────────────────────────────────────

variable "function_name" {
  description = "Live prod BSH function name (the load-bearing import target)."
  type        = string
  default     = "Bedrock_Streaming_Handler"
}

variable "role_name" {
  description = "Name of the hand-made execution role (Tier 1 owns its inline policies; this module references the role by ARN, does NOT manage it)."
  type        = string
  default     = "Bedrock-Streaming-Handler-Role"
}

# COLD_START_FORCE is a manual cache-bust timestamp. Modeled as a variable
# (operator decision 2026-06-06) so ALL 14 env vars are governed — nothing
# silently drifts. (The staging BSH module omits this var entirely; it exists
# only on the prod function as a deploy-time cache-bust knob.)
#
# ⚠️ WORKFLOW CHANGE once this is under Terraform: to cache-bust, bump this
# default in a PR (or pass `-var cold_start_force=<ts>` to the gated apply) —
# do NOT `aws lambda update-function-configuration` it by hand anymore. A hand
# CLI bump becomes drift that the next gated apply (even from an unrelated PR)
# would silently REVERT. The runbook's "prove the change path" section covers this.
variable "cold_start_force" {
  description = "Value of the COLD_START_FORCE env var (deploy-time cache-bust timestamp). Live value as of 2026-06-06 import. Bump via PR/-var, never hand-CLI (would be reverted on next apply)."
  type        = string
  default     = "1777660112"
}

data "aws_caller_identity" "current" {}

locals {
  role_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.role_name}"
}

# Placeholder code zip — satisfies the required filename arg. Real code deploys
# via `aws lambda update-function-code`; lifecycle.ignore_changes below prevents
# any future apply from reverting the live deployed code to this placeholder.
data "archive_file" "placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "this" {
  function_name = var.function_name
  role          = local.role_arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  memory_size   = 2048
  timeout       = 900
  architectures = ["x86_64"]
  package_type  = "Zip"

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  # Optional+Computed attrs declared at their EXACT live values — removes
  # import ambiguity so the post-import plan is verifiably no-change on these
  # (esp. logging_config: an omitted block risks the provider resetting
  # log_format Text->JSON, which would break the form-handler metric filters).
  ephemeral_storage {
    size = 512
  }

  logging_config {
    log_format = "Text"
    log_group  = "/aws/lambda/${var.function_name}"
  }

  # All 14 live env vars, modeled verbatim. NOTE TENANT_REGISTRY_TABLE carries
  # the `-production` suffix live while siblings are bare — that's the current
  # live value, mirrored AS-IS (the naming-alignment program has not stripped it
  # yet; faithful import does not "fix" it here).
  environment {
    variables = {
      ANALYTICS_QUEUE_URL      = "https://sqs.us-east-1.amazonaws.com/${data.aws_caller_identity.current.account_id}/picasso-analytics-events"
      BEDROCK_MODEL_ID         = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
      BEDROCK_REGION           = "us-east-1"
      COLD_START_FORCE         = var.cold_start_force
      CONFIG_BUCKET            = "myrecruiter-picasso"
      EMPLOYEE_REGISTRY_TABLE  = "picasso-employee-registry"
      FORM_SUBMISSIONS_TABLE   = "picasso_form_submissions"
      NOTIFICATION_SENDS_TABLE = "picasso-notification-sends"
      SESSION_SUMMARIES_TABLE  = "picasso-session-summaries"
      SMS_CONSENT_TABLE        = "picasso-sms-consent"
      SMS_SENDER_FUNCTION      = "SMS_Sender"
      SMS_USAGE_TABLE          = "picasso-sms-usage"
      # TODO(naming-alignment): the only env table name still carrying a `-${env}`
      # suffix; update when the table is renamed to the bare convention (Tier 3).
      TENANT_REGISTRY_TABLE       = "picasso-tenant-registry-production"
      USE_REGISTRY_FOR_RESOLUTION = "true"
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  # Tags come from the root provider `default_tags` (Environment / ManagedBy /
  # Project). The live function carries only Environment=production, so the
  # first gated apply ADDS ManagedBy=terraform + Project=myrecruiter — a benign
  # 2-tag adoption (identical to the ops-alarms pilot), NOT a functional change.
  # No resource-level `tags` block: env is carried via default_tags per the
  # naming-alignment convention (see infra/variables.tf).

  lifecycle {
    # Real code deploys via `aws lambda update-function-code`; do not let any
    # subsequent terraform apply revert it to the placeholder zip.
    ignore_changes = [filename, source_code_hash]
  }
}

# Function URL — the widget's endpoint (1-yr browser-cached → must NOT change;
# this is why Tier 2 imports in-place rather than cutting over). Live values:
# AuthType NONE, RESPONSE_STREAM (true streaming), wildcard CORS.
resource "aws_lambda_function_url" "this" {
  function_name      = aws_lambda_function.this.function_name
  authorization_type = "NONE"
  invoke_mode        = "RESPONSE_STREAM"

  # Wildcard CORS = the live prod value (mirrored AS-IS). Do NOT narrow without a
  # deliberate separate change — the widget + embedding origins rely on it.
  cors {
    allow_credentials = false
    allow_headers     = ["*"]
    allow_methods     = ["*"]
    allow_origins     = ["*"]
    max_age           = 300
  }
}

output "function_arn" {
  value = aws_lambda_function.this.arn
}

output "function_url" {
  value = aws_lambda_function_url.this.function_url
}

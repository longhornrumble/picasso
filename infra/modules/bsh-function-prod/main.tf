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
# SCOPE: the function + Function URL were adopted in the first Tier-2 increment
# (#427). This FOLLOW-ON increment (2026-06-06) additionally adopts the two
# adjacent surfaces that were deferred there — same import-in-place belt:
#   • Log group `/aws/lambda/Bedrock_Streaming_Handler` (retention 7, NO KMS —
#     staging's module adds a CMK; prod has none, so a faithful import must NOT
#     add one). Its ONE metric filter is owned by ops-alarms-bsh-prod, NOT here.
#
# (The `allow-api-gateway-invoke-prod` lambda_permission was adopted here in the
# follow-on increment, then REMOVED 2026-06-06 as a vestigial grant — #441,
# Remedy A #435 hardening. See the removal note near the outputs.)
#
# NOT MANAGED HERE (by design):
#   • The execution ROLE `Bedrock-Streaming-Handler-Role` — Tier 1's
#     bsh-iam-grants-prod owns its 8 inline policies by-name; the role resource
#     itself stays hand-made. This module only REFERENCES it by ARN.
#   • Reserved concurrency (none set live), VPC/DLQ/layers/FS (all absent live).
#   • The Function URL's FunctionURLAllowPublicAccess resource-policy statement
#     is auto-managed by aws_lambda_function_url.this. Under Remedy A (#435) the
#     URL is AuthType=AWS_IAM, so that statement is condition-gated to
#     FunctionUrlAuthType=NONE and is INERT (it only re-activates on a rollback to
#     NONE). No `aws_lambda_permission` resources are modeled here (the sole one,
#     the API-GW grant, was removed as vestigial — #441).
#
# import IDs (operator-run, see docs/runbooks/prod-iac-tier2-bsh-function.md):
#   aws_lambda_function.this           → Bedrock_Streaming_Handler
#   aws_lambda_function_url.this        → Bedrock_Streaming_Handler
#   aws_cloudwatch_log_group.this       → /aws/lambda/Bedrock_Streaming_Handler
#   (aws_lambda_permission.api_gateway was imported then removed — #441, see below)
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


# ── Remedy B (#435 streaming-bypass closure) ────────────────────────────────
# The deployed BSH bundle already contains + calls validateCfOriginHeader; it is
# a NO-OP until REQUIRE_CF_ORIGIN_HEADER="true". Setting CF_ORIGIN_SECRET_NAME +
# the SM-read grant (in bsh-iam-grants-prod) alone changes NOTHING at runtime —
# the validator only enforces when the flag flips. Mirrors live staging wiring
# (lambda-bedrock-handler-staging:574-577 env + 325-332 grant).
variable "cf_origin_secret_name" {
  description = "Name of the CF-origin validator secret. BSH reads it at runtime (GetSecretValue) to validate the CloudFront-injected x-picasso-cf-origin header. Mirrors staging."
  type        = string
  default     = "picasso/bsh/cf-origin-secret"
}

# LOAD-BEARING: 'false' = validator no-op; 'true' = ENFORCING (#435 bypass closed).
# Flipped to 'true' 2026-06-06 ONLY AFTER all 3 prerequisites were verified live:
# (1) secret picasso/bsh/cf-origin-secret created (ARN suffix -kQs1vT, plain 64-char),
# (2) CfOriginSecretRead grant applied (role 9 policies), (3) prod CF E3G0LSWB1AQ9LP
# streaming origin injects x-picasso-cf-origin (Deployed). The validator FAILS CLOSED;
# to roll back, set this to 'false' via a 1-line PR + gated apply (or emergency
# break-glass per the runbook). See docs/runbooks/prod-iac-tier2sec-remedy-b.md.
variable "require_cf_origin_header" {
  description = "Enforcement flag for the CF-origin-header validator ('true'/'false'). 'true' = enforcing (#435 closed). Roll back to 'false' via PR+apply if the CF header/secret diverge (fail-closed validator)."
  type        = string
  default     = "true"
}

# ── Remedy A (#435 streaming-bypass closure, the IAM-layer hardening) ────────
# CURRENT STATE (2026-06-06): ENFORCED. The call site passes "AWS_IAM"; the prod
# Lambda@Edge signer (lambda-edge-bsh-signer-prod) + its /stream* association are
# live + CloudFront-propagated + Phase-1.5-proven (CF-signed /stream 200, direct
# 403). #435 is closed on prod.
#
# This var is the staged-cutover + ROLLBACK knob. The default stays NONE (the
# rollback target / pre-cutover state): to roll back, set the call site back to
# "NONE" (or delete the line) via a 1-line PR + gated apply — instant on the
# Function URL; the Remedy B header still guards the URL during rollback. Do NOT
# re-flip to AWS_IAM from NONE unless the signer + /stream* assoc are live +
# propagated (a premature flip 403s ALL chat — the OAC Phase-2 #452 did exactly
# that on staging → reverted). The signer SigV4-signs every /stream request incl.
# the POST body, so a CF-served request is accepted while a direct/unsigned one is
# rejected. Mirrors the proven staging var (lambda-bedrock-handler-staging
# streaming_function_url_auth_type). See docs/runbooks/remedy-a-prod-cutover.md.
variable "streaming_function_url_auth_type" {
  description = "Function URL authorization_type. 'AWS_IAM' = Remedy A ENFORCED (#435 closed; the live state). 'NONE' = public/rollback target. Default NONE is the rollback knob; the call site passes AWS_IAM. Only (re-)flip to AWS_IAM when the prod edge signer + /stream* assoc are live + propagated."
  type        = string
  default     = "NONE"

  validation {
    condition     = contains(["NONE", "AWS_IAM"], var.streaming_function_url_auth_type)
    error_message = "streaming_function_url_auth_type must be NONE or AWS_IAM."
  }
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

  # 17 env vars: 14 originally imported + 2 added by Remedy B (#435,
  # CF_ORIGIN_SECRET_NAME + REQUIRE_CF_ORIGIN_HEADER) + 1 added by §P5.1
  # (PII_SUBJECT_INDEX_TABLE, paired with the DynamoDBPiiSubjectIndex grant;
  # INERT until the pii_subject.js code deploy). NOTE TENANT_REGISTRY_TABLE carries
  # the `-production` suffix live while siblings are bare — that's the current
  # live value, mirrored AS-IS (the naming-alignment program has not stripped it
  # yet; faithful import does not "fix" it here).
  environment {
    variables = {
      ANALYTICS_QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/${data.aws_caller_identity.current.account_id}/picasso-analytics-events"
      BEDROCK_MODEL_ID    = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
      BEDROCK_REGION      = "us-east-1"
      COLD_START_FORCE    = var.cold_start_force
      CONFIG_BUCKET       = "myrecruiter-picasso"
      # Remedy B (#435 bypass closure) — INERT until require_cf_origin_header
      # flips to "true" (the validator gates on the flag; CF_ORIGIN_SECRET_NAME
      # is unread while it's "false"). Mirrors the live staging pair.
      CF_ORIGIN_SECRET_NAME    = var.cf_origin_secret_name
      REQUIRE_CF_ORIGIN_HEADER = var.require_cf_origin_header
      EMPLOYEE_REGISTRY_TABLE  = "picasso-employee-registry"
      FORM_SUBMISSIONS_TABLE   = "picasso_form_submissions"
      NOTIFICATION_SENDS_TABLE = "picasso-notification-sends"
      # §P5.1: BSH pii_subject.js mints + conditional-PutItems pii_subject_id into
      # this table (email->subject index) so email-path DSAR resolves. Paired with
      # the DynamoDBPiiSubjectIndex grant in bsh-iam-grants-prod. Bare name = same
      # in staging + prod (account=environment). INERT until the §P5.1 code deploy.
      PII_SUBJECT_INDEX_TABLE = "picasso-pii-subject-index"
      SESSION_SUMMARIES_TABLE = "picasso-session-summaries"
      SMS_CONSENT_TABLE       = "picasso-sms-consent"
      SMS_SENDER_FUNCTION     = "SMS_Sender"
      SMS_USAGE_TABLE         = "picasso-sms-usage"
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
    #
    # `description` is a deploy-time changelog marker the deploy process bumps
    # per release (live: "v17: Fix Tier 2 CTA routing …"). It's code-deploy
    # metadata, not a config knob, so it's ignored alongside the code — otherwise
    # the import would WIPE the live description and every future deploy would
    # re-create drift (caught by the Phase A verify-plan, 2026-06-06).
    ignore_changes = [filename, source_code_hash, description]
  }
}

# Function URL — the widget's endpoint (1-yr browser-cached → must NOT change;
# this is why Tier 2 imports in-place rather than cutting over). Live values:
# AuthType NONE, RESPONSE_STREAM (true streaming), wildcard CORS.
resource "aws_lambda_function_url" "this" {
  function_name      = aws_lambda_function.this.function_name
  authorization_type = var.streaming_function_url_auth_type # Remedy A: NONE (inert) -> AWS_IAM (Phase 2 flip)
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

# Log group for the function. Live: retention 7 days, STANDARD class, NO KMS.
# A faithful prod import must NOT add a CMK (staging's module does; prod has
# none — adding one would try to associate a key = drift). No resource-level
# `tags` block: live tags are EMPTY, so the first gated apply adds the 3
# default_tags (Environment + ManagedBy + Project) — a benign tag-adoption like
# the function, NOT a functional change. The log group's ONE metric filter (the
# Foster Village ops-alarm filter) is owned by module ops-alarms-bsh-prod and is
# referenced there by log-group NAME, so it is NOT (and must not be) declared
# here — importing the group does not touch the filter.
resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = 7
  log_group_class   = "STANDARD"

  # This group owns the ONLY prod ops-alarm metric filter (analytics-write-failure
  # in ops-alarms-bsh-prod, wired by NAME with NO Terraform dependency edge). If
  # this resource were ever destroyed/replaced, that filter — and the Foster
  # Village alarm behind it — would die SILENTLY. prevent_destroy blocks any
  # destroy/replace plan (plan-invisible: no effect on the import or the tag-add
  # apply; `terraform state rm` recovery is unaffected). Flagged by the 2026-06-06
  # phase-completion audit (missing cross-module edge = silent blast radius).
  lifecycle {
    prevent_destroy = true
  }
}

# REMOVED 2026-06-06 (#441, Remedy A #435 hardening): the
# `allow-api-gateway-invoke-prod` statement (apigateway.amazonaws.com →
# lambda:InvokeFunction, source kgvc8xnewf/*/*) was VESTIGIAL. The prod HTTP API
# `kgvc8xnewf` ("picasso") has only `/Master_Function` routes → Master_Function:live;
# its two BSH-targeting integrations are ORPHANED (no route points to them), so no
# request reaches BSH via API Gateway (verified live). Removing this grant deletes
# the only remaining IAM-authorized invoke path to BSH beside the Function URL —
# any future accidental route-to-BSH now FAILS CLOSED. Removing the HCL resource
# makes the gated apply DESTROY the live resource-policy statement (1 to destroy).
# (BSH is reached only via its Function URL, now AuthType=AWS_IAM — see Remedy A.)

output "function_arn" {
  value = aws_lambda_function.this.arn
}

output "function_url" {
  value = aws_lambda_function_url.this.function_url
}

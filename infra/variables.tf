variable "env" {
  # Value MUST mirror the live Environment tags / ENVIRONMENT env vars (staging, production) —
  # never a translated form like "prod". Account = environment, so NEW resources use BARE names
  # (no env suffix); env is carried only by this value via default_tags + Lambda env vars.
  # (Legacy modules still embed `-${var.env}` in names — that suffix pattern is being retired by
  # the naming-alignment program; do not add new resources that suffix names with var.env.)
  description = "Deployment environment, matching live values: dev, staging, production."
  type        = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.env)
    error_message = "env must be one of: dev, staging, production — the same values live tags/env-vars use. Never 'prod' (translation drift). Resource names stay bare; env lives in tags/vars only."
  }
}

variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

# Q5 Phase 1 Apply 2 [B3 / locked decision #5]. The two DISTINCT
# `x-picasso-cf-origin` header values the staging widget CloudFront
# distribution injects into the Master_Function and Bedrock-streaming
# origins. They are NEVER rotated and NEVER committed: supplied to CI via
# TF_VAR_ from two `staging`-environment GitHub secrets. NO default — a
# missing value MUST fail plan/apply loudly rather than ship an edge whose
# origin-auth header is empty (BSH enforces the header; an empty value
# 403s every /stream). Source of the values: the P0.2 rollback dump.
# NOTE: "no default" is NOT a sufficient fail-loud guard here. GitHub Actions
# resolves `${{ secrets.X }}` to an EMPTY STRING when the secret is absent, so
# CI passes TF_VAR_q5_*="" — terraform sees the variable as *provided* (empty),
# not missing, and would happily apply a CloudFront distribution whose
# x-picasso-cf-origin header is "" (BSH enforces the header → 403s every
# /stream). The explicit length validation below is the real gate: P0.2
# confirmed both live values are exactly 64 chars, so == 64 fails loudly on
# both an absent secret AND a mis-pasted/truncated one.
variable "q5_mfs_cf_origin_secret" {
  description = "x-picasso-cf-origin value for the staging Master_Function CloudFront origin. Non-committed; CI supplies via TF_VAR_q5_mfs_cf_origin_secret from the staging-env GitHub secret Q5_MFS_CF_ORIGIN_SECRET."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.q5_mfs_cf_origin_secret) == 64
    error_message = "q5_mfs_cf_origin_secret must be the 64-char x-picasso-cf-origin value from the P0.2 rollback dump (origin picasso-master-function-staging-twin). Empty/wrong-length means the GitHub staging-environment secret Q5_MFS_CF_ORIGIN_SECRET is missing or mis-pasted."
  }
}

variable "q5_streaming_cf_origin_secret" {
  description = "x-picasso-cf-origin value for the staging Bedrock-streaming CloudFront origin. Distinct from the MFS value. Non-committed; CI supplies via TF_VAR_q5_streaming_cf_origin_secret from the staging-env GitHub secret Q5_STREAMING_CF_ORIGIN_SECRET."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.q5_streaming_cf_origin_secret) == 64
    error_message = "q5_streaming_cf_origin_secret must be the 64-char x-picasso-cf-origin value from the P0.2 rollback dump (origin picasso-streaming-lambda). Empty/wrong-length means the GitHub staging-environment secret Q5_STREAMING_CF_ORIGIN_SECRET is missing or mis-pasted."
  }
}

# Meta Messenger project — webhook GET-verification shared secret. Reuse the
# prod-account (614) value so Meta's webhook re-verification passes at cutover
# (Phase C2). Sensitive; CI supplies via TF_VAR_messenger_verify_token from a
# `staging`-environment GitHub secret MESSENGER_VERIFY_TOKEN.
#
# NON-EMPTY validation is the real fail-loud gate (same lesson as the Q5
# q5_*_cf_origin_secret vars above): GitHub Actions resolves a missing
# `${{ secrets.X }}` to an EMPTY STRING, so "no default" is NOT sufficient —
# terraform sees the var as *provided* ("") and would happily plan/apply a
# Meta_Webhook_Handler with MESSENGER_VERIFY_TOKEN="" (green CI, silently
# broken webhook verification at cutover C2). We deliberately DON'T assert an
# exact length (a wrong-but-present value only breaks the one-time GET
# challenge, caught immediately at C2 — no brittle == N gate needed), but the
# value MUST be non-empty.
variable "messenger_verify_token" {
  description = "Meta webhook verify token (Meta App Dashboard → Webhooks). Reuse the existing 614 value. Supplied via TF_VAR_messenger_verify_token from the staging-env GitHub secret MESSENGER_VERIFY_TOKEN."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.messenger_verify_token) > 0
    error_message = "messenger_verify_token is empty — the staging-environment GitHub secret MESSENGER_VERIFY_TOKEN is missing or unset. Create it (reuse the existing 614 Meta_Webhook_Handler value) before plan/apply."
  }
}

variable "github_promote_token" {
  description = "Fine-grained GitHub PAT for the config-manager Promote-to-Production button (dispatches the promote-tenant-config workflow). CI supplies it via TF_VAR_github_promote_token from the GitHub secret CONFIG_PROMOTE_TOKEN. Optional (no validation): empty leaves the promote endpoint returning 503 rather than blocking the apply."
  type        = string
  sensitive   = true
  default     = ""
}

# Meta Messenger project — public OAuth callback URL registered in the Meta App
# Dashboard. Empty on the FIRST staging apply (the Meta_OAuth_Handler Function
# URL doesn't exist yet, and a Lambda cannot reference its own Function URL
# without a Terraform dependency cycle). Two-apply: apply → read the
# lambda_meta_staging `oauth_function_url` output → set this to
# "<that-url>/meta/oauth/callback" → re-apply → register in the Meta App
# Dashboard (cutover C1/C2). Not sensitive (it's a public redirect URI).
variable "meta_oauth_callback_url" {
  description = "Meta OAuth callback URL, e.g. https://<oauth-fn-url>/meta/oauth/callback. Empty on first apply; set after capturing the OAuth Function URL output (two-apply)."
  type        = string
  default     = ""
}

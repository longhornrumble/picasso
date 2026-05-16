variable "env" {
  description = "Deployment environment (dev, staging, prod). Drives resource name suffixes and tags."
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.env)
    error_message = "env must be one of: dev, staging, prod."
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

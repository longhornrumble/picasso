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
variable "q5_mfs_cf_origin_secret" {
  description = "x-picasso-cf-origin value for the staging Master_Function CloudFront origin. Non-committed; CI supplies via TF_VAR_q5_mfs_cf_origin_secret."
  type        = string
  sensitive   = true
}

variable "q5_streaming_cf_origin_secret" {
  description = "x-picasso-cf-origin value for the staging Bedrock-streaming CloudFront origin. Distinct from the MFS value. Non-committed; CI supplies via TF_VAR_q5_streaming_cf_origin_secret."
  type        = string
  sensitive   = true
}

# Staging widget CloudFront distribution — staging-account twin of the
# prod-account distribution E1CGYA1AJ9OYL0. Part of Q5 (staging edge migration
# prod acct 614056832592 → staging 525409062831), Phase 1 Apply 2.
# Plan: ~/.claude/plans/glistening-strolling-oasis.md.
#
# FAITHFUL TWIN: every origin, behavior, cache/origin-request policy ID, method
# set, timeout, compression flag and protocol policy is reproduced VERBATIM
# from the live prod-account distribution config captured in P0.2 (2026-05-16),
# with three intentional changes:
#   1. ACM cert + WAF + OAC point at the new staging-account resources.
#   2. The S3 origins point at the staging widget + tenant-config buckets.
#   3. The dangling `picasso-staging-lambda-api` API-GW origin is DROPPED —
#      P0.2 confirmed NO behavior references it (locked decision #6).
# CloudFront access logging is ADDED [arch-SR4] (the live twin has logging
# disabled) via CloudWatch Logs standard logging v2 — deliberately not the
# legacy S3 `logging_config` block, which would need an ACL-enabled bucket
# that conflicts with the account-wide S3 hardening.
#
# The two `x-picasso-cf-origin` custom-header values are DISTINCT per origin
# (MFS-twin ≠ streaming, P0.2-confirmed) and are passed as non-committed
# sensitive vars with NO default [B3 / locked decision #5] — a missing value
# fails the apply loudly rather than shipping an edge whose origin-auth header
# is empty (BSH enforces the header; an empty value would 403 every /stream).
# The values are NEVER rotated and never enter source/state-readable config.
#
# Circular-dep break [B2]: the S3 origins reference the widget + tenant-config
# buckets by FIXED regional domain strings (bucket names are locked literals),
# so there is no Terraform module reference cloudfront→s3 — the s3 bucket
# policies depend one-directionally on this distribution's ARN.
#
# Provider: root default (us-east-1) — no alias.

variable "acm_certificate_arn" {
  description = "ARN of the ISSUED staging.chat.myrecruiter.ai ACM cert (acm-chat-staging output). Must be us-east-1."
  type        = string
}

variable "web_acl_arn" {
  description = "ARN of the CLOUDFRONT-scope staging WAF (waf-streaming-staging output)."
  type        = string
}

variable "oac_id" {
  description = "Origin Access Control ID for both S3 origins (cloudfront-oac-staging output)."
  type        = string
}

variable "mfs_cf_origin_secret" {
  description = "x-picasso-cf-origin header value for the Master_Function origin. Non-committed; supplied via TF_VAR_ from a GitHub staging-environment secret in CI (operator-gated, see PR body). No default — a missing value MUST fail the apply."
  type        = string
  sensitive   = true
}

variable "streaming_cf_origin_secret" {
  description = "x-picasso-cf-origin header value for the Bedrock streaming origin. Distinct from the MFS value. Non-committed; supplied via TF_VAR_ from a GitHub staging-environment secret in CI. No default — a missing value MUST fail the apply."
  type        = string
  sensitive   = true
}

variable "widget_bucket_regional_domain" {
  description = "Regional domain of the staging widget S3 origin. Fixed literal (bucket name is the locked decision #3 literal) to avoid a cloudfront→s3 module cycle."
  type        = string
  default     = "picasso-widget-staging.s3.us-east-1.amazonaws.com"
}

variable "tenant_config_bucket_regional_domain" {
  description = "Regional domain of the replicated tenant-config S3 origin (serves /tenants/* and /collateral/*). Fixed literal — see s3-tenant-config-staging/main.tf:14."
  type        = string
  default     = "myrecruiter-picasso-staging.s3.us-east-1.amazonaws.com"
}

variable "mfs_origin_domain" {
  description = "Function URL host of the staging-account Master_Function_Staging Lambda (P0.2-confirmed live value)."
  type        = string
  default     = "cstamilgyys366udcnh7b5dfem0rhbcr.lambda-url.us-east-1.on.aws"
}

variable "streaming_origin_domain" {
  description = "Function URL host of the staging-account Bedrock_Streaming_Handler_Staging Lambda (P0.2-confirmed live value; P22 doc's value is stale)."
  type        = string
  default     = "chm3ioesaxyrgsaeo3v763dmw40qaswu.lambda-url.us-east-1.on.aws"
}

locals {
  widget_origin_id    = "picasso-widget-staging-s3"
  tenant_origin_id    = "myrecruiter-picasso-staging-s3"
  mfs_origin_id       = "picasso-master-function-staging"
  streaming_origin_id = "picasso-streaming-lambda"

  # AWS-managed policies — global, referenced by ID (P0.2-captured):
  cache_optimized_id   = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  cache_disabled_id    = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  orp_all_viewer_id    = "a33e0165-8a55-4236-af65-cac31e112c36" # Managed-AllViewer
  orp_all_viewer_xh_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader

  all_methods    = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
  read_methods   = ["GET", "HEAD", "OPTIONS"]
  cached_methods = ["GET", "HEAD"]
}

resource "aws_cloudfront_distribution" "widget" {
  enabled             = true
  comment             = "Staging - Picasso Widget"
  aliases             = ["staging.chat.myrecruiter.ai"]
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  http_version        = "http2"
  is_ipv6_enabled     = true
  web_acl_id          = var.web_acl_arn

  # --- Origins ---------------------------------------------------------

  origin {
    origin_id                = local.widget_origin_id
    domain_name              = var.widget_bucket_regional_domain
    origin_access_control_id = var.oac_id
  }

  origin {
    origin_id                = local.tenant_origin_id
    domain_name              = var.tenant_config_bucket_regional_domain
    origin_access_control_id = var.oac_id
  }

  origin {
    origin_id   = local.mfs_origin_id
    domain_name = var.mfs_origin_domain

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }

    custom_header {
      name  = "x-picasso-cf-origin"
      value = var.mfs_cf_origin_secret
    }
  }

  origin {
    origin_id   = local.streaming_origin_id
    domain_name = var.streaming_origin_domain

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }

    custom_header {
      name  = "x-picasso-cf-origin"
      value = var.streaming_cf_origin_secret
    }
  }

  # --- Behaviors (order reproduced from live config) -------------------

  default_cache_behavior {
    target_origin_id       = local.widget_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = local.read_methods
    cached_methods         = local.cached_methods
    cache_policy_id        = local.cache_optimized_id
    compress               = true
  }

  ordered_cache_behavior {
    path_pattern             = "/Master_Function*"
    target_origin_id         = local.mfs_origin_id
    viewer_protocol_policy   = "allow-all"
    allowed_methods          = local.all_methods
    cached_methods           = local.cached_methods
    cache_policy_id          = local.cache_disabled_id
    origin_request_policy_id = local.orp_all_viewer_id
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern             = "/tenants/*"
    target_origin_id         = local.tenant_origin_id
    viewer_protocol_policy   = "allow-all"
    allowed_methods          = local.read_methods
    cached_methods           = local.cached_methods
    cache_policy_id          = local.cache_optimized_id
    origin_request_policy_id = local.orp_all_viewer_id
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern             = "/collateral/*"
    target_origin_id         = local.tenant_origin_id
    viewer_protocol_policy   = "allow-all"
    allowed_methods          = local.read_methods
    cached_methods           = local.cached_methods
    cache_policy_id          = local.cache_optimized_id
    origin_request_policy_id = local.orp_all_viewer_id
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern             = "/stream*"
    target_origin_id         = local.streaming_origin_id
    viewer_protocol_policy   = "https-only"
    allowed_methods          = local.all_methods
    cached_methods           = local.cached_methods
    cache_policy_id          = local.cache_disabled_id
    origin_request_policy_id = local.orp_all_viewer_xh_id
    compress                 = false
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}

# --- CloudFront access logging [arch-SR4] — standard logging v2 → CWL ----

resource "aws_cloudwatch_log_group" "cf_access" {
  name              = "/aws/cloudfront/picasso-widget-staging"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_delivery_source" "cf_access" {
  name         = "picasso-widget-staging-access"
  log_type     = "ACCESS"
  resource_arn = aws_cloudfront_distribution.widget.arn
}

resource "aws_cloudwatch_log_delivery_destination" "cf_access" {
  name = "picasso-widget-staging-cwl"

  delivery_destination_configuration {
    destination_resource_arn = aws_cloudwatch_log_group.cf_access.arn
  }
}

resource "aws_cloudwatch_log_delivery" "cf_access" {
  delivery_source_name     = aws_cloudwatch_log_delivery_source.cf_access.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.cf_access.arn
}

output "distribution_arn" {
  description = "ARN of the staging widget distribution. Consumed by s3-widget-staging and s3-tenant-config-staging to scope their OAC GetObject grants (aws:SourceArn)."
  value       = aws_cloudfront_distribution.widget.arn
}

output "distribution_id" {
  value = aws_cloudfront_distribution.widget.id
}

output "distribution_domain_name" {
  description = "The d###.cloudfront.net domain — used for raw-CF validation before the GoDaddy DNS cutover (EC-Q5.4)."
  value       = aws_cloudfront_distribution.widget.domain_name
}

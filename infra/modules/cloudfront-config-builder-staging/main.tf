# staging.config.myrecruiter.ai -- HTTPS edge for the config-builder staging UI.
#
# Staging twin of prod's config.myrecruiter.ai (CloudFront d1rdxqle0qjs34 in the
# prod account). Origin is the EXISTING public S3 website endpoint
# (picasso-config-builder-staging) as a CUSTOM origin -- deliberately NOT an
# OAC/REST origin: the bucket is already website-hosted with
# ErrorDocument=index.html (the SPA fallback), and this module adds a domain +
# TLS in front without touching the bucket. Hardening to OAC + private bucket
# is a separate decision (would have to replicate the SPA fallback as CF
# custom_error_responses).
#
# DNS for myrecruiter.ai is hosted at GoDaddy, NOT Route53 (verified P0.1,
# 2026-05-15 -- see acm-chat-staging). Terraform cannot create the validation
# or alias records. TWO-APPLY sequencing, same as acm-chat-staging [B1]:
#
#   Apply 1 (create_distribution = false, the default):
#     creates ONLY the ACM cert (PENDING_VALIDATION) and surfaces the
#     validation CNAME via the `validation_record` output. Attaching a
#     non-ISSUED cert to a distribution fails, so the dist is gated off.
#   Operator: add the validation CNAME at GoDaddy; wait for Status=ISSUED
#     (aws acm describe-certificate --certificate-arn <arn>).
#   Apply 2 (create_distribution = true via a one-line PR):
#     creates the distribution. Operator then adds the alias CNAME at GoDaddy:
#     staging.config.myrecruiter.ai -> <cloudfront_domain output>.
#
# Clerk note: the production Clerk instance (clerk.config.myrecruiter.ai)
# must list https://staging.config.myrecruiter.ai as an allowed origin for
# sign-in to work from the new domain -- Clerk dashboard, operator step.

variable "create_distribution" {
  description = "Gate for Apply 2. Leave false until the ACM cert shows ISSUED (after the GoDaddy validation CNAME is added) -- CloudFront rejects a PENDING_VALIDATION cert."
  type        = bool
  default     = false
}

variable "ui_bucket_website_endpoint" {
  description = "The S3 *website* endpoint of the config-builder staging UI bucket (http-only custom origin)."
  type        = string
  default     = "picasso-config-builder-staging.s3-website-us-east-1.amazonaws.com"
}

locals {
  domain    = "staging.config.myrecruiter.ai"
  origin_id = "config-builder-staging-s3-website"
}

# ------------------------------------------------------------------
# ACM cert (us-east-1 -- the root default provider; CloudFront requirement)
# ------------------------------------------------------------------

resource "aws_acm_certificate" "config_staging" {
  domain_name       = local.domain
  validation_method = "DNS"

  tags = {
    Name = "staging-config-myrecruiter-ai"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ------------------------------------------------------------------
# Distribution (Apply 2)
# ------------------------------------------------------------------

resource "aws_cloudfront_distribution" "config_builder" {
  count = var.create_distribution ? 1 : 0

  enabled             = true
  comment             = "config-builder staging UI (staging.config.myrecruiter.ai)"
  aliases             = [local.domain]
  default_root_object = ""
  price_class         = "PriceClass_100"

  origin {
    origin_id   = local.origin_id
    domain_name = var.ui_bucket_website_endpoint

    # S3 website endpoints speak HTTP only -- TLS terminates at CloudFront.
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = local.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # AWS managed CachingOptimized policy (static SPA assets; the S3 website
    # ErrorDocument=index.html provides the SPA route fallback at the origin).
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.config_staging.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# ------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------

output "certificate_arn" {
  description = "ACM cert ARN (PENDING_VALIDATION until the GoDaddy CNAME is added)."
  value       = aws_acm_certificate.config_staging.arn
}

output "validation_record" {
  description = "DNS validation CNAME the operator must add at GoDaddy. After it validates (Status=ISSUED), flip create_distribution=true (Apply 2)."
  value = {
    name  = one(aws_acm_certificate.config_staging.domain_validation_options).resource_record_name
    type  = one(aws_acm_certificate.config_staging.domain_validation_options).resource_record_type
    value = one(aws_acm_certificate.config_staging.domain_validation_options).resource_record_value
  }
}

output "cloudfront_domain" {
  description = "The distribution domain. Operator adds the GoDaddy CNAME staging.config.myrecruiter.ai -> this value after Apply 2."
  value       = var.create_distribution ? aws_cloudfront_distribution.config_builder[0].domain_name : "(distribution not created yet -- Apply 2)"
}

output "distribution_id" {
  description = "The CloudFront distribution ID, for scoping the config-builder deploy role's cloudfront:CreateInvalidation. Empty until Apply 2."
  value       = var.create_distribution ? aws_cloudfront_distribution.config_builder[0].id : ""
}

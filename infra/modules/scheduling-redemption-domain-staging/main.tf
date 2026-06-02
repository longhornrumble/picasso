# Scheduling redemption edge — staging host `staging.schedule.myrecruiter.ai`
# (canonical §13.8; plan task D3; FROZEN_CONTRACTS host decision — operator
# chose the staging subdomain 2026-06-02, NOT prod `schedule.myrecruiter.ai`).
#
# Provisions the public HTTPS edge that fronts the WS-D4 token-redemption
# Lambda (the six endpoints /cancel, /reschedule, /resume, /attended/{met,
# noshow,noconnect} — all served by a single Lambda Function URL). The email
# links minted by C8 / E are dead until this edge resolves + serves.
#
# ── DNS lives at GoDaddy, NOT Route53 ────────────────────────────────────
# `myrecruiter.ai` is hosted at GoDaddy (NS ns45/ns46.domaincontrol.com —
# verified 2026-06-02; same fact already documented for the sibling
# `staging.chat.myrecruiter.ai` edge in modules/acm-chat-staging/main.tf).
# There is NO Route53 hosted zone in the staging account (525) that Terraform
# can write to for this name. Therefore this module — exactly like
# acm-chat-staging — deliberately:
#   1. omits `aws_acm_certificate_validation` (it would block apply forever
#      waiting on a CNAME that never appears), and
#   2. creates NO `aws_route53_record` for the A/alias (none can be created).
# Both DNS records are surfaced as outputs for the operator to add by hand in
# the GoDaddy console. This is the hosted-zone escalation called out in the
# WS-D3 brief — it resolves to "operator adds two GoDaddy records", not
# "Terraform owns the zone".
#
# ── Two-apply sequencing (cert must be ISSUED before the alias attaches) ──
# CloudFront refuses to attach a custom ACM cert that is not yet ISSUED, and
# the cert cannot reach ISSUED until the operator adds the GoDaddy validation
# CNAME. So, like cloudfront-widget-staging, the alias + cert attachment is
# gated behind `enable_custom_domain` (default false):
#   Apply 1 (enable_custom_domain = false): cert created PENDING_VALIDATION +
#     distribution created with the default *.cloudfront.net cert and no
#     alias. Validate the raw d###.cloudfront.net domain.
#   Operator: add the GoDaddy validation CNAME (validation_record output);
#     wait for `aws acm describe-certificate ... --region us-east-1` = ISSUED.
#   Apply 2 (enable_custom_domain = true): attaches the
#     staging.schedule.myrecruiter.ai alias + the ISSUED cert.
#   Operator: add the GoDaddy CNAME staging.schedule.myrecruiter.ai →
#     <distribution_domain_name> (dns_alias_record output).
# There is no prod-CNAME-uniqueness conflict here (the host is greenfield), so
# the flag exists purely for the cert-ISSUED ordering, not a cutover dance.
#
# WAF is OUT OF SCOPE — tracked in docs/roadmap/P22_CLOUDFRONT_WAF_PLAN.md.
# No `web_acl_id` is attached here.
#
# Provider: ACM certs attached to CloudFront MUST be us-east-1. The root
# default provider is us-east-1 (var.aws_region default) — no alias needed.

# ── ACM certificate (PENDING_VALIDATION until the GoDaddy CNAME is added) ──
resource "aws_acm_certificate" "redemption" {
  domain_name       = var.redemption_host
  validation_method = "DNS"

  tags = {
    Name = "staging-schedule-myrecruiter-ai"
  }

  lifecycle {
    create_before_destroy = true
  }
}

locals {
  origin_id = "scheduling-redemption-lambda-staging"

  # AWS-MANAGED CloudFront policies — global, identical ID in every account
  # (same literals used by cloudfront-widget-staging, verified there 2026-05-16):
  cache_disabled_id    = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  orp_all_viewer_xh_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader

  # Lambda Function URLs reject a forwarded Host header (they expect their own
  # *.lambda-url host) — so the origin-request policy MUST be
  # AllViewerExceptHostHeader, never AllViewer. Redemption is fully dynamic
  # (one-time token reads/writes) → CachingDisabled.
  all_methods  = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
  read_methods = ["GET", "HEAD"]
}

resource "aws_cloudfront_distribution" "redemption" {
  enabled         = true
  comment         = "Staging - Scheduling token redemption (${var.redemption_host})"
  aliases         = var.enable_custom_domain ? [var.redemption_host] : []
  price_class     = "PriceClass_100"
  http_version    = "http2"
  is_ipv6_enabled = true

  # Single custom origin: the WS-D4 redemption Lambda Function URL. Passed in
  # as a host string (no scheme, no path) — placeholder until D4 exists so
  # `terraform validate`/`plan` pass; the integrator wires the real value.
  origin {
    origin_id   = local.origin_id
    domain_name = var.redemption_function_url_domain

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 30
      origin_keepalive_timeout = 5
    }
  }

  # All six redemption paths hit the same Lambda Function URL → one default
  # behavior, no per-path ordered behaviors. HTTPS forced; nothing cached.
  default_cache_behavior {
    target_origin_id         = local.origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = local.all_methods
    cached_methods           = local.read_methods
    cache_policy_id          = local.cache_disabled_id
    origin_request_policy_id = local.orp_all_viewer_xh_id
    compress                 = true
  }

  # No-alias phase (Apply 1): default *.cloudfront.net cert — a custom ACM cert
  # REQUIRES at least one alias, so it can only attach once enable_custom_domain
  # flips true (Apply 2, after the cert is ISSUED). Modern TLS restored with it.
  viewer_certificate {
    cloudfront_default_certificate = var.enable_custom_domain ? null : true
    acm_certificate_arn            = var.enable_custom_domain ? aws_acm_certificate.redemption.arn : null
    ssl_support_method             = var.enable_custom_domain ? "sni-only" : null
    minimum_protocol_version       = var.enable_custom_domain ? "TLSv1.2_2021" : null
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    Name = "scheduling-redemption-staging"
  }
}

# ── CloudFront access logging [arch-SR4] — standard logging v2 → CloudWatch ─
# A public token-redemption surface; access logs feed the D1 anomaly-detection
# audit (canonical §13: log client IP + form_submission_id on redemption).
# Mirrors cloudfront-widget-staging's CWL v2 delivery (NOT legacy S3 logging,
# which needs an ACL-enabled bucket that conflicts with S3 account hardening).
resource "aws_cloudwatch_log_group" "cf_access" {
  name              = "/aws/cloudfront/scheduling-redemption-staging"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_delivery_source" "cf_access" {
  name         = "scheduling-redemption-staging-access"
  log_type     = "ACCESS_LOGS"
  resource_arn = aws_cloudfront_distribution.redemption.arn
}

resource "aws_cloudwatch_log_delivery_destination" "cf_access" {
  name = "scheduling-redemption-staging-cwl"

  delivery_destination_configuration {
    destination_resource_arn = aws_cloudwatch_log_group.cf_access.arn
  }
}

resource "aws_cloudwatch_log_delivery" "cf_access" {
  delivery_source_name     = aws_cloudwatch_log_delivery_source.cf_access.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.cf_access.arn
}

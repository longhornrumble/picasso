# Staging analytics-dashboard CloudFront distribution — staging-account (525)
# twin of the prod-account dashboard distribution EJ0Y6ZUIUBSAT. Part of the
# analytics-dashboard staging re-home (prod acct 614 -> staging 525), mirroring
# the completed Q5 widget edge migration (modules/cloudfront-widget-staging).
#
# FAITHFUL TWIN of the prod dashboard CF (config captured live 2026-06-25),
# with these intentional changes:
#   1. S3 origin is OAC-locked to the private staging bucket (REST/regional
#      endpoint), NOT prod's public-read bucket. Hardening — see
#      s3-analytics-dashboard-staging. The OAC is created here (one distribution,
#      one S3 origin — no shared-OAC rationale, so inlined rather than a module).
#   2. The /api origin points at the STAGING-account Analytics_Dashboard_API
#      Function URL (o6fbvhyl…), not prod's (uniywvlg…). Correct env isolation.
#   3. The staging.app.myrecruiter.ai alias + ACM cert are DEFERRED behind
#      `enable_custom_domain` (default false) — CloudFront forbids duplicating
#      the live prod-account staging dist (E2R9VHBON5PHMK) CNAME at create time.
#      Attached at cutover, AFTER the legacy dist releases the alias and the
#      GoDaddy CNAME is repointed (DNS is deliberately the LAST step).
#   4. The default-behavior cache uses the AWS-managed CachingOptimized policy
#      (modern equivalent of prod's legacy `forwarded_values{QueryString=false}`
#      — same cache-key semantics: no QS/cookies/headers). Deploys invalidate
#      `/*`, so TTLs never block a fresh release. Matches the widget twin's
#      legacy->managed modernization.
#
# SPA routing parity: prod uses the `picasso-dashboard-spa-rewrite` CF function
# (non-dotted path -> /index.html) on the default behavior with a REST S3 origin
# (CustomErrorResponses = 0 — the deliberate masking-bug fix). This twin
# reproduces both faithfully: the spa-rewrite function + zero custom error
# responses. Re-adding 403/404 -> index.html would re-break /api error masking.
#
# Circular-dep break: the S3 origin references the bucket by FIXED regional
# domain string (bucket name is the locked literal), so there is no Terraform
# module reference cloudfront->s3 — the bucket policy depends one-directionally
# on this distribution's ARN.
#
# Provider: root default (us-east-1) — no alias.

variable "acm_certificate_arn" {
  description = "ARN of the ISSUED staging.app.myrecruiter.ai ACM cert (acm-app-staging output). Must be us-east-1. Only attached when enable_custom_domain = true (cutover)."
  type        = string
}

# Cutover gate. CloudFront enforces global CNAME uniqueness — the live
# prod-account dist E2R9VHBON5PHMK holds `staging.app.myrecruiter.ai`, so the
# twin is created WITHOUT the alias (default *.cloudfront.net cert; validate via
# the raw d###.cloudfront.net domain). At cutover the operator removes the alias
# from E2R9VHBON5PHMK (releasing it), repoints the GoDaddy CNAME to this twin's
# domain, then this flag flips true to attach the alias + ACM cert.
variable "enable_custom_domain" {
  description = "Cutover only. false = no alias + default *.cloudfront.net cert (validatable via raw CF domain). true = attach staging.app.myrecruiter.ai alias + the ACM cert (requires E2R9VHBON5PHMK to have released the alias AND the GoDaddy CNAME repointed first)."
  type        = bool
  default     = false
}

variable "bucket_regional_domain" {
  description = "Regional domain of the staging dashboard S3 origin. Fixed literal (bucket name is the locked literal) to avoid a cloudfront->s3 module cycle."
  type        = string
  default     = "picasso-analytics-dashboard-staging.s3.us-east-1.amazonaws.com"
}

variable "analytics_api_origin_domain" {
  description = "Function URL host (no scheme) of the staging-account Analytics_Dashboard_API Lambda — the /api/* origin. Default is the live 525 Function URL host."
  type        = string
  default     = "o6fbvhyleccjnvcndmgtr5eoem0lojwi.lambda-url.us-east-1.on.aws"
}

locals {
  s3_origin_id  = "S3-picasso-analytics-dashboard-staging"
  api_origin_id = "AnalyticsDashboardAPIStagingLambda"

  # AWS-MANAGED policies — global, same ID in every account:
  cache_optimized_id   = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  cache_disabled_id    = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  orp_all_viewer_xh_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader

  api_methods    = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
  read_methods   = ["GET", "HEAD"]
  cached_methods = ["GET", "HEAD"]
}

# OAC for the single S3 origin (account-isolated; never reuses a 614 OAC).
resource "aws_cloudfront_origin_access_control" "dashboard" {
  name                              = "picasso-analytics-dashboard-staging-oac"
  description                       = "OAC for the staging analytics-dashboard edge (twin of prod EJ0Y6ZUIUBSAT)"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# SPA fallback: any path whose last segment has no dot -> /index.html. Faithful
# copy of prod fn `picasso-dashboard-spa-rewrite` (captured 2026-06-25).
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "picasso-dashboard-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "SPA fallback for non-/api routes (staging twin)"
  publish = true
  code    = <<-EOT
    function handler(event) {
        var request = event.request;
        var lastSegment = request.uri.substring(request.uri.lastIndexOf('/') + 1);
        if (lastSegment.indexOf('.') === -1) {
            request.uri = '/index.html';
        }
        return request;
    }
  EOT
}

# Strip the /api prefix before forwarding to the Lambda origin. Faithful copy of
# prod fn `picasso-analytics-prod-api-rewrite` (captured 2026-06-25).
resource "aws_cloudfront_function" "api_rewrite" {
  name    = "picasso-analytics-api-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Strip /api prefix before forwarding to Lambda origin (staging twin)"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      // Strip /api prefix so CloudFront forwards e.g. /api/forms/summary as /forms/summary to Lambda.
      if (request.uri === '/api' || request.uri === '/api/') {
        request.uri = '/';
      } else if (request.uri.startsWith('/api/')) {
        request.uri = request.uri.substring(4);
      }
      return request;
    }
  EOT
}

resource "aws_cloudfront_distribution" "dashboard" {
  enabled             = true
  comment             = "Staging - MyRecruiter App - React Dashboard"
  aliases             = var.enable_custom_domain ? ["staging.app.myrecruiter.ai"] : []
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  http_version        = "http2"
  is_ipv6_enabled     = true

  # --- Origins ---------------------------------------------------------

  origin {
    origin_id                = local.s3_origin_id
    domain_name              = var.bucket_regional_domain
    origin_access_control_id = aws_cloudfront_origin_access_control.dashboard.id
  }

  origin {
    origin_id   = local.api_origin_id
    domain_name = var.analytics_api_origin_domain

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # --- Behaviors -------------------------------------------------------

  # Default: the SPA. redirect-to-https + CachingOptimized + spa-rewrite fn.
  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = local.read_methods
    cached_methods         = local.cached_methods
    cache_policy_id        = local.cache_optimized_id
    compress               = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # /api/*: the Analytics_Dashboard_API Lambda. CachingDisabled +
  # AllViewerExceptHostHeader (host rewritten to the Function URL host) +
  # all methods + api-rewrite fn. No compression (matches prod).
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = local.api_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = local.api_methods
    cached_methods           = local.cached_methods
    cache_policy_id          = local.cache_disabled_id
    origin_request_policy_id = local.orp_all_viewer_xh_id
    compress                 = false

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.api_rewrite.arn
    }
  }

  # No-alias phase: default *.cloudfront.net cert (a custom ACM cert REQUIRES at
  # least one alias, so it can only attach once enable_custom_domain flips at
  # cutover). Faithful sni-only / TLSv1.2_2021 restored with it.
  viewer_certificate {
    cloudfront_default_certificate = var.enable_custom_domain ? null : true
    acm_certificate_arn            = var.enable_custom_domain ? var.acm_certificate_arn : null
    ssl_support_method             = var.enable_custom_domain ? "sni-only" : null
    minimum_protocol_version       = var.enable_custom_domain ? "TLSv1.2_2021" : null
  }

  # Prod has CustomErrorResponses = 0 (the deliberate /api masking-bug fix) —
  # reproduced by OMITTING any custom_error_response block. SPA routing is the
  # spa-rewrite function's job, not a 403/404 -> index.html rewrite.

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}

output "distribution_arn" {
  description = "ARN of the staging dashboard distribution. Consumed by s3-analytics-dashboard-staging to scope its OAC GetObject grant (aws:SourceArn)."
  value       = aws_cloudfront_distribution.dashboard.arn
}

output "distribution_id" {
  value = aws_cloudfront_distribution.dashboard.id
}

output "distribution_domain_name" {
  description = "The d###.cloudfront.net domain — used for raw-CF end-to-end validation BEFORE the GoDaddy DNS cutover."
  value       = aws_cloudfront_distribution.dashboard.domain_name
}

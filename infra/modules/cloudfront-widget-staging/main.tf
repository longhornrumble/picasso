# Staging widget CloudFront distribution — staging-account twin of the
# prod-account distribution E1CGYA1AJ9OYL0. Part of Q5 (staging edge migration
# prod acct 614056832592 → staging 525409062831), Phase 1 Apply 2.
# Plan: ~/.claude/plans/glistening-strolling-oasis.md.
#
# FAITHFUL TWIN: every origin, behavior, cache/origin-request policy ID, method
# set, timeout, compression flag and protocol policy is reproduced VERBATIM
# from the live prod-account distribution config captured in P0.2 (2026-05-16),
# with four intentional changes:
#   1. WAF + OAC point at the new staging-account resources.
#   2. The S3 origins point at the staging widget + tenant-config buckets.
#   3. The dangling `picasso-staging-lambda-api` API-GW origin is DROPPED —
#      P0.2 confirmed NO behavior references it (locked decision #6).
#   4. The `staging.chat.myrecruiter.ai` alias + ACM cert are DEFERRED
#      behind `enable_custom_domain` (default false) — CloudFront forbids
#      duplicating the live prod dist's CNAME at create time. Attached at
#      Phase 3 cutover (wildcard-cert method — see APPLIED handoff). See var.
#   5. Phase-1 audit Row 8: /Master_Function*, /tenants/*, /collateral/*
#      use `redirect-to-https` (prod live config is `allow-all`). Deliberate
#      hardening — no legitimate HTTP path exists; closes cleartext exposure
#      of tenant config + a header-trust downgrade. Prod edge keeps the
#      weakness (separate concern, not regressed by this twin).
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
  description = "ARN of the ISSUED staging.chat.myrecruiter.ai ACM cert (acm-chat-staging output). Must be us-east-1. Only attached when enable_custom_domain = true (Phase 3 cutover)."
  type        = string
}

# Cutover gate. CloudFront enforces global CNAME uniqueness — the live
# prod-account dist E1CGYA1AJ9OYL0 holds `staging.chat.myrecruiter.ai`, so
# the twin is created WITHOUT the alias (default *.cloudfront.net cert;
# validate via the raw d###.cloudfront.net domain). At Phase 3 the operator
# deletes E1CGYA1AJ9OYL0 (releasing the alias), this flag flips true to
# attach the alias + ACM cert, then the GoDaddy CNAME is repointed.
variable "enable_custom_domain" {
  description = "Phase 3 cutover only. false = no alias + default *.cloudfront.net cert (validatable via raw CF domain). true = attach staging.chat.myrecruiter.ai alias + the ACM cert (requires E1CGYA1AJ9OYL0 to have released the alias first)."
  type        = bool
  default     = false
}

variable "web_acl_arn" {
  description = "ARN of the CLOUDFRONT-scope staging WAF (waf-streaming-staging output)."
  type        = string
}

variable "oac_id" {
  description = "Origin Access Control ID for both S3 origins (cloudfront-oac-staging output)."
  type        = string
}

variable "streaming_edge_signer_qualified_arn" {
  description = "Versioned ARN of the Remedy A origin-request Lambda@Edge signer (lambda-edge-bsh-signer-staging). Associated on /stream to SigV4-sign requests to the BSH Function URL."
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
  description = "Function URL host of the staging-account Master_Function Lambda (task 2.5 Wave 2 cutover value; the pre-2.5 suffixed instance was cstamilgyys366udcnh7b5dfem0rhbcr)."
  type        = string
  default     = "bani65wtlj4xudnkas4eae2rdm0ytoqv.lambda-url.us-east-1.on.aws"
}

variable "streaming_origin_domain" {
  description = "Function URL host of the staging-account Bedrock_Streaming_Handler Lambda (task 2.5 Wave 2 cutover value; the pre-2.5 suffixed instance was chm3ioesaxyrgsaeo3v763dmw40qaswu)."
  type        = string
  default     = "av5b2veoxmmrmx3hmggjell4bu0igeru.lambda-url.us-east-1.on.aws"
}

variable "scheduling_page_api_origin_domain" {
  description = "Function URL host (no scheme) of the staging-account Scheduling_Page_Api Lambda — the /schedule-api* deterministic reschedule/cancel gateway. Wired from module.lambda_scheduling_page_api_staging[0].function_url_domain."
  type        = string
}

locals {
  widget_origin_id       = "picasso-widget-staging-s3"
  tenant_origin_id       = "myrecruiter-picasso-staging-s3"
  mfs_origin_id          = "picasso-master-function-staging"
  streaming_origin_id    = "picasso-streaming-lambda"
  schedule_api_origin_id = "picasso-scheduling-page-api"

  # AWS-MANAGED policies — global, same ID in every account, verified
  # 2026-05-16 via `aws cloudfront get-{cache,origin-request}-policy`:
  cache_optimized_id   = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  cache_disabled_id    = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  orp_all_viewer_xh_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader
  # NOTE: the prod dist's other ORP `a33e0165-…` is NOT managed — it is the
  # CUSTOM prod-account policy `Picasso-Origin-Request`, so it cannot be
  # referenced cross-account. Faithfully twinned as the resource below
  # (verified 2026-05-16 — feedback_verify_cloud_provider_behavior_empirically).

  all_methods    = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
  read_methods   = ["GET", "HEAD", "OPTIONS"]
  cached_methods = ["GET", "HEAD"]
}

# Faithful twin of the prod-account CUSTOM origin request policy
# `Picasso-Origin-Request` (id a33e0165-… in 614056832592) — config captured
# verbatim 2026-05-16 via `aws cloudfront get-origin-request-policy`. Used by
# the /Master_Function*, /tenants/* and /collateral/* behaviors. Custom (not
# AWS-managed) → must exist in THIS account; cannot be referenced cross-account.
resource "aws_cloudfront_origin_request_policy" "picasso_origin_request" {
  name    = "Picasso-Origin-Request-staging"
  comment = "Forward headers for CORS and API keys"

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = ["Origin", "Accept", "x-api-key", "content-type", "Accept-Language"]
    }
  }

  cookies_config {
    cookie_behavior = "none"
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

# ── CSP [SR-3] — Content-Security-Policy-Report-Only on the widget documents ──
# RESCHEDULE_WIDGET_REMEDIATION_2026-07-08 §SR-3. iframe.html and
# schedule/index.html (both served from the S3 widget origin via the DEFAULT
# behavior) ship with no CSP at any layer — zero defense-in-depth against an
# injected-script class bug (e.g. SR-5). This adds a CSP as a REPORT-ONLY header
# FIRST so it cannot break the embed-anywhere widget or the reschedule page;
# violations surface in the browser console during staging soak. Flip to the
# enforcing `Content-Security-Policy` header in a follow-up once the soak is clean.
#
# Emitted via custom_headers_config, NOT security_headers_config.content_security_policy:
# the managed block only sets the ENFORCING header, so Report-Only must be a
# custom header. (frame-ancestors also only works from an HTTP header, never a
# <meta> tag — which is why the absent meta-CSP couldn't have carried it anyway.)
#
# Policy rationale:
#   - frame-ancestors *  — the widget iframe.html embeds on ARBITRARY client
#     domains, so we must NOT restrict who may frame it. (The reschedule page is a
#     top-level navigation, where frame-ancestors is moot.)
#   - style-src 'unsafe-inline'  — React inline styles + dynamic CSS-variable
#     theming set inline on elements.
#   - img-src data: https:  — tenant logos + data-URI assets.
#   - connect-src 'self' https:  — same-origin API calls via CloudFront; https:
#     kept broad in the report-only baseline, to be tightened from soak reports
#     before enforcing.
# No report-uri/report-to: there is no collector endpoint yet, so soak = manual
# browser-console review on staging.chat + the reschedule page. A collector +
# enforcement is the tracked follow-up.
resource "aws_cloudfront_response_headers_policy" "widget_csp" {
  name = "picasso-widget-csp-report-only-staging"

  custom_headers_config {
    items {
      header   = "Content-Security-Policy-Report-Only"
      override = true
      value = join(" ", [
        "default-src 'self';",
        "script-src 'self';",
        "style-src 'self' 'unsafe-inline';",
        "img-src 'self' data: https:;",
        "font-src 'self';",
        "connect-src 'self' https:;",
        "frame-ancestors *;",
        "base-uri 'self';",
        "object-src 'none';",
        "form-action 'self';",
      ])
    }
  }
}

resource "aws_cloudfront_distribution" "widget" {
  enabled             = true
  comment             = "Staging - Picasso Widget"
  aliases             = var.enable_custom_domain ? ["staging.chat.myrecruiter.ai"] : []
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

    # Remedy A (#435): signing is done by the origin-request Lambda@Edge on the
    # /stream behavior (no OAC — OAC can't sign POST bodies).

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }

    # Remedy B (defense-in-depth, retained until strip-B): BSH also checks this
    # header at the app layer. Kept while Remedy A soaks; removed at strip-B.
    custom_header {
      name  = "x-picasso-cf-origin"
      value = var.streaming_cf_origin_secret
    }
  }

  # Scheduling PAGE M1: the Scheduling_Page_Api Function URL — the deterministic
  # /schedule-api reschedule/cancel gateway. No x-picasso-cf-origin shared-secret
  # header: unlike the MFS/streaming origins (otherwise-open endpoints), the gateway
  # is auth'd by the §B10 session binding (no valid binding -> 401 before any BCH
  # call), so the raw Function URL is safe-by-design; the gateway code does not read
  # a CF-origin header. Reserved concurrency (5) + the WAF rate rules are the flood
  # controls.
  origin {
    origin_id   = local.schedule_api_origin_id
    domain_name = var.scheduling_page_api_origin_domain

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      # 60s read timeout: the gateway invokes Booking_Commit_Handler synchronously
      # and waits up to BCH_INVOKE_TIMEOUT_MS (25s) + the gateway's own 30s Lambda
      # timeout; 60 covers the worst case without a premature 504.
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }
  }

  # --- Behaviors (order reproduced from live config) -------------------

  default_cache_behavior {
    target_origin_id       = local.widget_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = local.read_methods
    cached_methods         = local.cached_methods
    cache_policy_id        = local.cache_optimized_id
    # SR-3: CSP (Report-Only) on the widget documents (iframe.html,
    # schedule/index.html, index.html) served from the S3 widget origin.
    response_headers_policy_id = aws_cloudfront_response_headers_policy.widget_csp.id
    compress                   = true
  }

  ordered_cache_behavior {
    path_pattern             = "/Master_Function*"
    target_origin_id         = local.mfs_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = local.all_methods
    cached_methods           = local.cached_methods
    cache_policy_id          = local.cache_disabled_id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.picasso_origin_request.id
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern             = "/tenants/*"
    target_origin_id         = local.tenant_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = local.read_methods
    cached_methods           = local.cached_methods
    cache_policy_id          = local.cache_optimized_id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.picasso_origin_request.id
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern             = "/collateral/*"
    target_origin_id         = local.tenant_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = local.read_methods
    cached_methods           = local.cached_methods
    cache_policy_id          = local.cache_optimized_id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.picasso_origin_request.id
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

    # Remedy A (#435): the edge signer SigV4-signs each request to the BSH
    # Function URL (include_body=true so the POST body is in the signature).
    # Inert until the Function URL's authorization_type flips NONE->AWS_IAM.
    lambda_function_association {
      event_type   = "origin-request"
      lambda_arn   = var.streaming_edge_signer_qualified_arn
      include_body = true
    }
  }

  # Scheduling PAGE M1: the deterministic /schedule-api reschedule/cancel gateway.
  # Same-origin with the page (staging.chat/schedule/*), so no CORS. AllViewerExceptHostHeader
  # so CloudFront rewrites Host to the Function URL host (Lambda Function URLs reject a
  # mismatched Host). Cache disabled; all methods (POST/OPTIONS). NO edge signer — the
  # gateway Function URL stays AuthType NONE (the §B10 binding is the auth), unlike /stream
  # whose URL flips to AWS_IAM. The page itself (/schedule/index.html) is served by the
  # S3 widget origin via the default behavior; only /schedule-api* hits this gateway.
  ordered_cache_behavior {
    path_pattern             = "/schedule-api*"
    target_origin_id         = local.schedule_api_origin_id
    viewer_protocol_policy   = "https-only"
    allowed_methods          = local.all_methods
    cached_methods           = local.cached_methods
    cache_policy_id          = local.cache_disabled_id
    origin_request_policy_id = local.orp_all_viewer_xh_id
    compress                 = false
  }

  # No-alias phase: default *.cloudfront.net cert (a custom ACM cert REQUIRES
  # at least one alias, so it can only attach once enable_custom_domain flips
  # at Phase 3 cutover). Faithful sni-only / TLSv1.2_2021 restored with it.
  viewer_certificate {
    cloudfront_default_certificate = var.enable_custom_domain ? null : true
    acm_certificate_arn            = var.enable_custom_domain ? var.acm_certificate_arn : null
    ssl_support_method             = var.enable_custom_domain ? "sni-only" : null
    minimum_protocol_version       = var.enable_custom_domain ? "TLSv1.2_2021" : null
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
  log_type     = "ACCESS_LOGS" # CloudFront delivery-source valid set: [ACCESS_LOGS, CONNECTION_LOGS]
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

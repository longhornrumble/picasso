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
# WAF [M17, RESCHEDULE_WIDGET_REMEDIATION_2026-07-08]: a CLOUDFRONT-scope
# WAFv2 web ACL (rate-limit + AWS managed baseline) is now attached via the
# distribution's `web_acl_id` below — see `aws_wafv2_web_acl.redemption`. This
# closes the M17 finding (the concurrency-5 handler was cheaply DoS-able through
# the six redemption slugs); the P22 plan had deferred it. The concurrency cap
# stays as the Lambda-spend bound.
#
# Provider: ACM certs attached to CloudFront MUST be us-east-1, and WAFv2
# CLOUDFRONT scope MUST also be us-east-1. The root default provider is
# us-east-1 (var.aws_region default) — no alias needed.

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
  origin_id       = "scheduling-redemption-lambda-staging"
  oauth_origin_id = "scheduling-oauth-lambda-staging" # G3: the E11 consent-flow Function URL

  # AWS-MANAGED CloudFront policies — global, identical ID in every account
  # (same literals used by cloudfront-widget-staging, verified there 2026-05-16):
  cache_disabled_id    = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  orp_all_viewer_xh_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader

  # Lambda Function URLs reject a forwarded Host header (they expect their own
  # *.lambda-url host) — so the origin-request policy MUST be
  # AllViewerExceptHostHeader, never AllViewer. Redemption is fully dynamic
  # (one-time token reads/writes) → CachingDisabled.
  # The redemption handler serves GET one-tap links only (+ OPTIONS preflight).
  # Do NOT forward PUT/POST/PATCH/DELETE to the Lambda origin — unnecessary
  # attack surface on a public endpoint (A2 audit S-3).
  viewer_methods = ["GET", "HEAD", "OPTIONS"]
  read_methods   = ["GET", "HEAD"]
}

# G3/E13: CORS for the dashboard's cross-origin GET /connection/status fetch
# (portal origin -> this dist -> the OAuth Function URL). Per the OAuth module's
# design note, status CORS lives at this CloudFront response-headers layer, NOT
# on the Function URL (which stays CORS-closed — the raw URL is not a supported
# browser surface). /connect and /oauth/callback are top-level navigations, so
# they carry no CORS and keep no policy. (Found in the 2026-06-11 Track-2 E2E:
# without this the browser cannot read the status response and the UI silently
# treats every coordinator as disconnected.)
resource "aws_cloudfront_response_headers_policy" "oauth_status_cors" {
  name = "scheduling-oauth-status-cors-staging"

  cors_config {
    access_control_allow_credentials = false

    access_control_allow_headers {
      items = ["*"]
    }

    access_control_allow_methods {
      items = ["GET"]
    }

    access_control_allow_origins {
      items = [
        "https://staging.app.myrecruiter.ai",
        "https://d2t5sxdcthprgd.cloudfront.net",
        "http://localhost:5173",
      ]
    }

    access_control_max_age_sec = 86400
    origin_override            = true
  }
}

# ── WAF [M17] — CLOUDFRONT-scope web ACL on the public redemption edge ─────
# RESCHEDULE_WIDGET_REMEDIATION_2026-07-08 §M17. The six redemption slugs
# (/cancel, /reschedule, /resume, /attended/*) are the sole entry that redeems
# every reschedule/cancel link, and the handler is capped at
# reserved_concurrent_executions = 5 — so a cheap ~6-concurrent garbage-token
# flood could throttle the pool and 429 a real customer's email link. This ACL
# adds the rate + reputation controls the P22 plan deferred (prevention; the
# existing Errors/Throttles alarms were detection-only).
#
# Rule shape mirrors waf-streaming-staging, MINUS: (a) the BlockNonStagingChatHost
# rule (that ACL's host is staging.chat; this edge serves staging.schedule — a
# host-block here would 403 every redemption), and (b) the /schedule-api path
# rule (a different distribution). Observability is via visibility_config
# (CloudWatch metrics + sampled requests) — NOT a full WAF log sink, deliberately:
# WAF request logs would capture the one-time token in the request URI, duplicating
# the token-in-URL PII surface the CF access-log group already KMS-guards above.
# CLOUDFRONT scope MUST be us-east-1 (root default provider).
resource "aws_wafv2_web_acl" "redemption" {
  name = "picasso-scheduling-redemption-waf-staging"
  # WAFv2 description regex forbids parentheses — plain ASCII, no parens.
  description = "M17 rate + reputation controls on the public scheduling-redemption edge"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Per-IP flood control — the direct M17 fix. 300/IP/5min matches the widget
  # WAF's global RateLimitPerIP; redemption is one-tap-per-email-link, so this
  # never trips a real user (incl. a shared NAT) while blunting a single-source
  # token-scan flood. Can tighten later if legitimate volume proves far lower.
  rule {
    name     = "RateLimitPerIP"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit                 = 300
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "PicassoRedemptionRateLimitPerIP"
    }
  }

  # AWS baseline managed groups — cheap defense-in-depth against scanner/bot
  # traffic (the "slow-drip scan" half of the M17 threat).
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "PicassoRedemptionCommonRuleSet"
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "PicassoRedemptionBadInputsRuleSet"
    }
  }

  rule {
    name     = "AWSManagedRulesAmazonIpReputationList"
    priority = 4

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesAmazonIpReputationList"
      }
    }

    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "PicassoRedemptionIPReputationList"
    }
  }

  visibility_config {
    sampled_requests_enabled   = true
    cloudwatch_metrics_enabled = true
    metric_name                = "PicassoRedemptionWAF"
  }
}

resource "aws_cloudfront_distribution" "redemption" {
  enabled         = true
  comment         = "Staging - Scheduling token redemption (${var.redemption_host})"
  aliases         = var.enable_custom_domain ? [var.redemption_host] : []
  price_class     = "PriceClass_100"
  http_version    = "http2"
  is_ipv6_enabled = true
  web_acl_id      = aws_wafv2_web_acl.redemption.arn # M17 — see aws_wafv2_web_acl.redemption below

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

  # SECOND custom origin: the E11 Calendar_OAuth_Connect Function URL (G3). The 3 OAuth
  # paths route here via ordered behaviors; everything else (the redemption paths) stays
  # on the default origin above. Same Function-URL constraints (AllViewerExceptHostHeader,
  # https-only).
  origin {
    origin_id   = local.oauth_origin_id
    domain_name = var.oauth_function_url_domain

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 30
      origin_keepalive_timeout = 5
    }
  }

  # All six redemption paths hit the same Lambda Function URL → the default behavior.
  # HTTPS forced; nothing cached.
  default_cache_behavior {
    target_origin_id         = local.origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = local.viewer_methods
    cached_methods           = local.read_methods
    cache_policy_id          = local.cache_disabled_id
    origin_request_policy_id = local.orp_all_viewer_xh_id
    compress                 = true
  }

  # G3: route the 3 E11 OAuth paths to the OAuth Function URL origin. Exact path patterns
  # (the routes carry no subpaths; query strings are not part of the match). The callback
  # path MUST equal the Google console redirect_uri + the Lambda's OAUTH_REDIRECT_URI.
  # Same CachingDisabled + AllViewerExceptHostHeader as the redemption default.
  # §E11b (T3, lambda#294): the disconnect route is a POST (the only non-GET OAuth
  # path), so it gets its OWN behavior -- CloudFront's allowed_methods sets are
  # GET/HEAD, GET/HEAD/OPTIONS, or all-7; POST forces the 7-method set. The Lambda
  # method-enforces POST-only on this path, so the extra verbs die at the origin.
  # Server-called by ADA (body-carried init token; no browser CORS involved) --
  # no response-headers policy.
  ordered_cache_behavior {
    path_pattern             = "/connection/disconnect"
    target_origin_id         = local.oauth_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = local.read_methods
    cache_policy_id          = local.cache_disabled_id
    origin_request_policy_id = local.orp_all_viewer_xh_id
    compress                 = true
  }

  dynamic "ordered_cache_behavior" {
    for_each = toset(["/connect", "/oauth/callback", "/connection/status"])
    content {
      path_pattern             = ordered_cache_behavior.value
      target_origin_id         = local.oauth_origin_id
      viewer_protocol_policy   = "redirect-to-https"
      allowed_methods          = local.viewer_methods
      cached_methods           = local.read_methods
      cache_policy_id          = local.cache_disabled_id
      origin_request_policy_id = local.orp_all_viewer_xh_id
      # Status is the only browser-fetched path (cross-origin from the portal) —
      # it alone gets the CORS response-headers policy (see oauth_status_cors).
      response_headers_policy_id = ordered_cache_behavior.value == "/connection/status" ? aws_cloudfront_response_headers_policy.oauth_status_cors.id : null
      compress                   = true
    }
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
#
# PII: these access logs hold client IP + the action-token suffix in the request
# URL (canonical §13). KMS-encrypted at rest (A2 audit N-4) — dedicated per-group
# CMK mirroring the Phase-C.2 per-Lambda-log-group pattern. Classified in
# docs/roadmap/PII-Project/pii-inventory.md section D (Living-Inventory Rule).
data "aws_caller_identity" "cf_logs" {}
data "aws_region" "cf_logs" {}
data "aws_partition" "cf_logs" {}

resource "aws_kms_key" "cf_access_logs" {
  description             = "KMS key for the scheduling-redemption CloudFront access-log group (client IP + token-in-URL). Phase C.2 per-log-group CMK pattern."
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnableRootAccount"
        Effect    = "Allow"
        Principal = { AWS = "arn:${data.aws_partition.cf_logs.partition}:iam::${data.aws_caller_identity.cf_logs.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "AllowCloudWatchLogsEncryption"
        Effect    = "Allow"
        Principal = { Service = "logs.${data.aws_region.cf_logs.name}.amazonaws.com" }
        Action = [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*",
        ]
        Resource = "*"
        Condition = {
          ArnEquals = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.cf_logs.partition}:logs:${data.aws_region.cf_logs.name}:${data.aws_caller_identity.cf_logs.account_id}:log-group:/aws/cloudfront/scheduling-redemption-staging"
          }
        }
      },
    ]
  })

  tags = {
    Name = "picasso-scheduling-redemption-cflogs-staging"
  }
}

resource "aws_kms_alias" "cf_access_logs" {
  name          = "alias/picasso-scheduling-redemption-cflogs-staging"
  target_key_id = aws_kms_key.cf_access_logs.key_id
}

resource "aws_cloudwatch_log_group" "cf_access" {
  name              = "/aws/cloudfront/scheduling-redemption-staging"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.cf_access_logs.arn
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

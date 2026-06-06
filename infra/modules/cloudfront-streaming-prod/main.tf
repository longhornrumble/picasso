# =============================================================================
# Phase 2 Tier 4 (production-only): the prod chat CloudFront distribution.
#
# Adopts the live, hand-managed production distribution E3G0LSWB1AQ9LP
# (alias chat.myrecruiter.ai, account 614056832592) into Terraform via
# `terraform import` (state-only, ZERO live behavior change) — the same belt
# Tiers 1-2 proved on the BSH role + function. Every attribute below is a
# verbatim copy of the live config captured 2026-06-06 via
# `aws cloudfront get-distribution-config --id E3G0LSWB1AQ9LP`
# (Sandbox/tier4-cf-recon/dist-config-1780775235.json, ETag EKLOTZYGLUMT1).
#
# WHY NOW: the next security remedy (Remedy A for #435) flips the BSH Function
# URL AuthType NONE->AWS_IAM and has CloudFront sign requests via a `lambda`-type
# Origin Access Control. That CF-side change (attach an OAC to the streaming
# origin) can only be done cleanly once the distribution is in Terraform — which
# is this tier. The streaming origin below deliberately leaves the OAC seam open.
#
# SCOPE — surgical, ONE resource:
#   • This module manages ONLY `aws_cloudfront_distribution.streaming`.
#   • The WAF, ACM cert, the 2 S3 OACs, and the 2 CUSTOM policies
#     (Picasso-Origin-Request a33e0165, Picasso-CORS-Headers ea01802e) are
#     pre-existing account-native objects, referenced BY ID/ARN — NOT imported
#     (they are shared with other distributions; importing would widen blast
#     radius). Unlike the staging twin (cloudfront-widget-staging), which had to
#     RECREATE the custom policies cross-account, this module is in the SAME
#     account 614, so a literal-ID reference is faithful + minimal.
#
# THE REMEDY-B HEADER (the one delicate part):
#   The streaming origin carries a live `x-picasso-cf-origin` secret header that
#   BSH validates — stripping it 403s ALL chat. The 64-char value must NOT enter
#   git or state. Strategy (operator-chosen 2026-06-06): the `custom_header` is
#   OMITTED from this config and the whole `origin` set is `ignore_changes`d
#   (Terraform set-semantics cannot target a single origin's header, so the
#   ignore is at origin granularity). Net effect: the live hand-injected header
#   is left UNTOUCHED by every apply; no secret is committed or state-stored.
#   TRADE-OFF: TF will not reconcile ANY origin drift while this ignore stands.
#   That is acceptable for the short T4->Remedy-A window and is NARROWED in
#   Remedy A (which removes the ignore to attach the OAC, then strip-B deletes
#   the now-redundant header live). See docs/runbooks/prod-iac-tier4-cloudfront.md.
#
# import ID (operator-run): E3G0LSWB1AQ9LP
#   terraform import \
#     'module.cloudfront_streaming_prod[0].aws_cloudfront_distribution.streaming' \
#     E3G0LSWB1AQ9LP
# =============================================================================

locals {
  streaming_origin_id   = "picasso-streaming-lambda"
  code_origin_id        = "picassocode-static"
  multitenant_origin_id = "myrecruiter-picasso.multitenant"
  api_origin_id         = "picasso-lambda-api"

  # AWS-MANAGED policies — same ID in every account.
  cache_disabled_id    = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  cache_optimized_id   = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  orp_all_viewer_xh_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader

  # CUSTOM account-native policies in 614 — referenced by literal ID (same
  # account, so no twinning). Hand-managed dependencies (candidates for a
  # future tier).
  picasso_orp_id = "a33e0165-8a55-4236-af65-cac31e112c36" # Picasso-Origin-Request
  picasso_rhp_id = "ea01802e-bd38-4a32-bb1c-0c04d94e00d9" # Picasso-CORS-Headers

  # Method sets (live values per behavior).
  all_methods      = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
  read_methods     = ["GET", "HEAD", "OPTIONS"]
  head_get_methods = ["GET", "HEAD"]
  cached_methods   = ["GET", "HEAD"]
}

resource "aws_cloudfront_distribution" "streaming" {
  enabled             = true
  aliases             = ["chat.myrecruiter.ai"]
  comment             = "Production"
  default_root_object = "index.html"
  price_class         = "PriceClass_All"
  http_version        = "http2"
  is_ipv6_enabled     = true
  web_acl_id          = "arn:aws:wafv2:us-east-1:614056832592:global/webacl/picasso-streaming-waf/813ea956-be57-4bd1-8ccd-f0b155a79b50"

  tags = {
    Name = "PicassoTenants"
  }

  # --- Origins ---------------------------------------------------------------

  # The Remedy-A seam: BSH Function URL origin. NO origin_access_control_id today
  # (live = ""); Remedy A attaches a `lambda` OAC here. The live `x-picasso-cf-origin`
  # custom_header is intentionally NOT modeled — see module header + the
  # lifecycle.ignore_changes on `origin` below (keeps the secret out of git/state
  # and leaves the live header untouched).
  origin {
    origin_id   = local.streaming_origin_id
    domain_name = "xqc4wnxwia2nytjkbw6xasjd6q0jckgb.lambda-url.us-east-1.on.aws"

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }
  }

  origin {
    origin_id                = local.code_origin_id
    domain_name              = "picassocode.s3.us-east-1.amazonaws.com"
    origin_access_control_id = "EZL21IXK9T4W7"
  }

  origin {
    origin_id                = local.multitenant_origin_id
    domain_name              = "myrecruiter-picasso.s3.us-east-1.amazonaws.com"
    origin_access_control_id = "E2LVW6GLLO7FWX"
  }

  origin {
    origin_id   = local.api_origin_id
    domain_name = "kgvc8xnewf.execute-api.us-east-1.amazonaws.com"
    origin_path = "/primary"

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 30
      origin_keepalive_timeout = 5
    }
  }

  # --- Behaviors (order reproduced VERBATIM from the live config) ------------

  default_cache_behavior {
    target_origin_id           = local.multitenant_origin_id
    viewer_protocol_policy     = "allow-all"
    allowed_methods            = local.all_methods
    cached_methods             = local.cached_methods
    cache_policy_id            = local.cache_disabled_id
    response_headers_policy_id = local.picasso_rhp_id
    compress                   = true
  }

  ordered_cache_behavior {
    path_pattern           = "/chunks/*"
    target_origin_id       = local.code_origin_id
    viewer_protocol_policy = "allow-all"
    allowed_methods        = local.head_get_methods
    cached_methods         = local.cached_methods
    cache_policy_id        = local.cache_disabled_id
    compress               = true
  }

  ordered_cache_behavior {
    path_pattern               = "/Master_Function*"
    target_origin_id           = local.api_origin_id
    viewer_protocol_policy     = "allow-all"
    allowed_methods            = local.all_methods
    cached_methods             = local.cached_methods
    cache_policy_id            = local.cache_disabled_id
    origin_request_policy_id   = local.picasso_orp_id
    response_headers_policy_id = local.picasso_rhp_id
    compress                   = true
  }

  ordered_cache_behavior {
    path_pattern               = "/tenants/*/*-config.json"
    target_origin_id           = local.multitenant_origin_id
    viewer_protocol_policy     = "allow-all"
    allowed_methods            = local.read_methods
    cached_methods             = local.cached_methods
    cache_policy_id            = local.cache_optimized_id
    origin_request_policy_id   = local.picasso_orp_id
    response_headers_policy_id = local.picasso_rhp_id
    compress                   = true
  }

  ordered_cache_behavior {
    path_pattern               = "/tenants/*"
    target_origin_id           = local.multitenant_origin_id
    viewer_protocol_policy     = "allow-all"
    allowed_methods            = local.read_methods
    cached_methods             = local.cached_methods
    cache_policy_id            = local.cache_optimized_id
    origin_request_policy_id   = local.picasso_orp_id
    response_headers_policy_id = local.picasso_rhp_id
    compress                   = true
  }

  ordered_cache_behavior {
    path_pattern               = "/collateral/*"
    target_origin_id           = local.code_origin_id
    viewer_protocol_policy     = "allow-all"
    allowed_methods            = local.read_methods
    cached_methods             = local.cached_methods
    cache_policy_id            = local.cache_optimized_id
    origin_request_policy_id   = local.picasso_orp_id
    response_headers_policy_id = local.picasso_rhp_id
    compress                   = true
  }

  ordered_cache_behavior {
    path_pattern               = "/embed/*"
    target_origin_id           = local.multitenant_origin_id
    viewer_protocol_policy     = "allow-all"
    allowed_methods            = local.all_methods
    cached_methods             = local.cached_methods
    cache_policy_id            = local.cache_optimized_id
    origin_request_policy_id   = local.picasso_orp_id
    response_headers_policy_id = local.picasso_rhp_id
    compress                   = true
  }

  ordered_cache_behavior {
    path_pattern               = "/assets/*"
    target_origin_id           = local.code_origin_id
    viewer_protocol_policy     = "allow-all"
    allowed_methods            = local.all_methods
    cached_methods             = local.cached_methods
    cache_policy_id            = local.cache_optimized_id
    origin_request_policy_id   = local.picasso_orp_id
    response_headers_policy_id = local.picasso_rhp_id
    compress                   = true
  }

  # /stream* — the SSE path to BSH. compress=false (streaming), https-only, the
  # managed AllViewerExceptHostHeader ORP, NO response-headers-policy. This is
  # the behavior Remedy A's IAM-signed origin serves.
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

  ordered_cache_behavior {
    path_pattern               = "*"
    target_origin_id           = local.code_origin_id
    viewer_protocol_policy     = "allow-all"
    allowed_methods            = local.read_methods
    cached_methods             = local.cached_methods
    cache_policy_id            = local.cache_optimized_id
    origin_request_policy_id   = local.picasso_orp_id
    response_headers_policy_id = local.picasso_rhp_id
    compress                   = true
  }

  viewer_certificate {
    acm_certificate_arn      = "arn:aws:acm:us-east-1:614056832592:certificate/ca2e7524-e936-417a-a62f-e4ae00252373"
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # NO logging_config — live distribution has access logging DISABLED. (The
  # staging twin ADDS CWL logging as a deliberate staging-only hardening; a
  # faithful prod import must NOT, or it is a behavior change.)

  lifecycle {
    # Any replace-class diff (e.g. an origin_id typo) FAILS at plan instead of
    # destroying the live chat edge.
    prevent_destroy = true

    # Leave the live x-picasso-cf-origin secret header untouched + uncommitted.
    # See the module header: Terraform set-semantics can't target a single
    # origin's custom_header, so the ignore is at `origin` granularity. Remedy A
    # NARROWS/REMOVES this to attach the lambda OAC, then strip-B deletes the
    # header. While this stands, TF does not reconcile origin drift.
    ignore_changes = [origin]
  }
}

output "distribution_arn" {
  description = "ARN of the prod chat distribution. Remedy A consumes this as the aws:SourceArn condition on the BSH Function URL's lambda:InvokeFunctionUrl grant to cloudfront.amazonaws.com."
  value       = aws_cloudfront_distribution.streaming.arn
}

output "distribution_id" {
  value = aws_cloudfront_distribution.streaming.id
}

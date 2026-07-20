# Demo Zone microsite CloudFront distribution — staging-account (525). Serves the
# static BrightPath microsite from the private picasso-demo-site bucket, gated by
# a Basic Auth CloudFront Function (edge, viewer-request) so the unpolished demo
# site is never publicly reachable.
#
# Shape mirrors cloudfront-analytics-dashboard-staging, minus the /api origin and
# SPA-rewrite (a static marketing site, not an SPA). Single OAC-locked S3 origin.
#
# Custom domain (demo.myrecruiter.ai) + ACM cert are DEFERRED behind
# `enable_custom_domain` (default false) so the distribution can be created and
# previewed on its raw d###.cloudfront.net domain BEFORE the ACM cert reaches
# ISSUED and BEFORE the GoDaddy CNAME is added (DNS is deliberately the last
# step). Flip true once the cert (acm-demo-staging) is ISSUED.
#
# Caching: CachingDisabled. The microsite content is uploaded manually during
# build-out and there is no deploy-with-invalidation pipeline yet, so disabling
# the cache avoids stale-content confusion. Switch to CachingOptimized + an
# invalidation step once a deploy pipeline exists. (The Basic Auth function runs
# on viewer-request regardless of caching.)
#
# Circular-dep break: the S3 origin references the bucket by FIXED regional
# domain string (bucket name is the locked literal), so there is no cloudfront->
# s3 module reference — the bucket policy depends one-directionally on this ARN.
#
# Provider: root default (us-east-1) — no alias.

variable "acm_certificate_arn" {
  description = "ARN of the ISSUED demo.myrecruiter.ai ACM cert (acm-demo-staging output). Must be us-east-1. Only attached when enable_custom_domain = true."
  type        = string
  default     = ""
}

variable "enable_custom_domain" {
  description = "false = no alias + default *.cloudfront.net cert (preview via raw CF domain). true = attach demo.myrecruiter.ai alias + the ACM cert (requires the cert ISSUED first, then add the GoDaddy CNAME to the CF domain)."
  type        = bool
  default     = false
}

variable "bucket_regional_domain" {
  description = "Regional domain of the demo-site S3 origin. Fixed literal (bucket name is the locked literal) to avoid a cloudfront->s3 module cycle."
  type        = string
  default     = "picasso-demo-site.s3.us-east-1.amazonaws.com"
}

variable "basic_auth_b64" {
  description = "base64(user:pass) for the Basic Auth gate, baked into the function code AT CREATE. NOT committed — passed via -var on the manual local apply that first creates the function. After creation the function's `code` is ignore_changes'd (see the resource below), so this var is only consumed once; rotate the credential by tainting/replacing the function. Empty default is safe: on a fresh create with no -var it denies ALL requests (401)."
  type        = string
  default     = ""
  sensitive   = true
}

locals {
  s3_origin_id      = "S3-picasso-demo-site"
  cache_disabled_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  read_methods      = ["GET", "HEAD"]
  cached_methods    = ["GET", "HEAD"]
}

resource "aws_cloudfront_origin_access_control" "demo" {
  name                              = "picasso-demo-site-oac"
  description                       = "OAC for the demo microsite edge (picasso-demo-site)"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Basic Auth gate. Compares the Authorization header verbatim to the configured
# base64(user:pass). Empty cred => never matches => 401 for everything (closed).
#
# ignore_changes = [code]: the shared infra-deploy.yml runs `terraform apply` on
# every push to `staging` and does NOT pass TF_VAR_demo_basic_auth_b64 (it isn't
# one of the plumbed secrets). Without this, that CI apply would recompute the
# code with the empty default and ZERO OUT the credential baked at create time —
# breaking the gate for everyone (401 even with the real password). Ignoring
# `code` after create keeps the applied credential stable across CI applies. The
# tradeoff: legitimate function-logic edits also won't auto-apply — rotate the
# credential (or change the handler) by tainting/replacing this function with the
# -var set, then re-applying locally.
resource "aws_cloudfront_function" "basic_auth" {
  name    = "picasso-demo-site-basic-auth"
  runtime = "cloudfront-js-2.0"
  comment = "Basic Auth gate for the demo microsite"
  publish = true
  code    = <<-EOT
    function handler(event) {
        var request = event.request;
        var headers = request.headers;
        var expected = "Basic ${var.basic_auth_b64}";
        if (!headers.authorization || headers.authorization.value !== expected) {
            return {
                statusCode: 401,
                statusDescription: "Unauthorized",
                headers: {
                    "www-authenticate": { value: "Basic realm=\"demo.myrecruiter.ai\"" }
                }
            };
        }
        return request;
    }
  EOT

  lifecycle {
    ignore_changes = [code]
  }
}

resource "aws_cloudfront_distribution" "demo" {
  enabled             = true
  comment             = "Staging - MyRecruiter - Demo Zone microsite"
  aliases             = var.enable_custom_domain ? ["demo.myrecruiter.ai"] : []
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  http_version        = "http2"
  is_ipv6_enabled     = true

  origin {
    origin_id                = local.s3_origin_id
    domain_name              = var.bucket_regional_domain
    origin_access_control_id = aws_cloudfront_origin_access_control.demo.id
  }

  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = local.read_methods
    cached_methods         = local.cached_methods
    cache_policy_id        = local.cache_disabled_id
    compress               = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.basic_auth.arn
    }
  }

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

output "distribution_arn" {
  description = "ARN of the demo-site distribution. Consumed by s3-demo-site-staging to scope its OAC GetObject grant (aws:SourceArn)."
  value       = aws_cloudfront_distribution.demo.arn
}

output "distribution_id" {
  value = aws_cloudfront_distribution.demo.id
}

output "distribution_domain_name" {
  description = "The d###.cloudfront.net domain — preview URL (behind Basic Auth) before the GoDaddy demo.myrecruiter.ai CNAME is added, and the CNAME target after."
  value       = aws_cloudfront_distribution.demo.domain_name
}

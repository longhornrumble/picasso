# Staging analytics-dashboard S3 host bucket — staging-account (525) home for
# the React dashboard SPA. Part of the analytics-dashboard staging re-home
# (prod acct 614 -> staging 525), mirroring the completed Q5 widget twin
# (modules/s3-widget-staging).
#
# DELIBERATE HARDENING over the legacy 614 staging bucket
# (`picasso-analytics-portal-staging`, public-read + website endpoint): this
# twin drops public-read entirely — the SPA is served ONLY through CloudFront
# via Origin Access Control (REST/regional endpoint, not the S3 website
# endpoint). Public access block is fully on; a TLS-only Deny rejects any
# non-HTTPS request. SPA fallback routing is handled by the CloudFront function
# `picasso-dashboard-spa-rewrite` (not an S3 website ErrorDocument), so no
# website configuration is needed — this also closes the parity gap where the
# legacy staging edge leaned on the website endpoint while prod uses a CF
# function + REST origin.
#
# Circular-dep break: the OAC GetObject statement needs the CloudFront
# distribution ARN, but cloudfront-analytics-dashboard-staging needs this
# bucket's regional domain as an origin. Resolved exactly as the widget twin:
# the CloudFront module references this bucket by its FIXED regional domain
# string (bucket name is the locked literal `picasso-analytics-dashboard-
# staging`), so there is no Terraform module reference cloudfront->s3; this
# module takes the distribution ARN as an OPTIONAL var and emits the OAC
# statement only when it is non-empty (one-directional dep: s3 <- cloudfront).
#
# Provider: root default (us-east-1) — no alias.

variable "cloudfront_distribution_arn" {
  description = "ARN of the staging analytics-dashboard CloudFront distribution. When non-empty, an OAC-scoped s3:GetObject grant is added to the bucket policy (aws:SourceArn = this ARN). Default empty so the bucket can be created before the distribution within a single apply (the policy resource depends on this value, so Terraform orders distribution->policy automatically)."
  type        = string
  default     = ""
}

resource "aws_s3_bucket" "dashboard" {
  bucket = "picasso-analytics-dashboard-staging"

  tags = {
    Name = "picasso-analytics-dashboard-staging"
  }
}

resource "aws_s3_bucket_versioning" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "dashboard" {
  # Defense-in-depth: reject any request not over TLS.
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.dashboard.arn,
      "${aws_s3_bucket.dashboard.arn}/*",
    ]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  # OAC-only read. Emitted only once the distribution ARN is known — the
  # CloudFront service principal may GetObject solely when the request
  # originates from THIS distribution (aws:SourceArn). No public-read.
  dynamic "statement" {
    for_each = var.cloudfront_distribution_arn != "" ? [1] : []
    content {
      sid    = "AllowCloudFrontOACGetObject"
      effect = "Allow"
      principals {
        type        = "Service"
        identifiers = ["cloudfront.amazonaws.com"]
      }
      actions   = ["s3:GetObject"]
      resources = ["${aws_s3_bucket.dashboard.arn}/*"]
      condition {
        test     = "StringEquals"
        variable = "aws:SourceArn"
        values   = [var.cloudfront_distribution_arn]
      }
    }
  }
}

resource "aws_s3_bucket_policy" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id
  policy = data.aws_iam_policy_document.dashboard.json

  depends_on = [aws_s3_bucket_public_access_block.dashboard]
}

output "bucket_name" {
  value = aws_s3_bucket.dashboard.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.dashboard.arn
}

output "bucket_regional_domain_name" {
  description = "Regional domain for use as a CloudFront S3 origin (matches the fixed literal cloudfront-analytics-dashboard-staging references)."
  value       = aws_s3_bucket.dashboard.bucket_regional_domain_name
}

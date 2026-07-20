# Demo Zone microsite S3 host bucket — staging-account (525). Serves the static
# BrightPath microsite (home/programs/giving + embedded widget). Staging-account
# home because the embedded widget's tenant (BRI071351) + data live only in 525.
#
# Hardening mirrors s3-analytics-dashboard-staging: NO public-read. Served ONLY
# through CloudFront via Origin Access Control (REST/regional endpoint, not the
# S3 website endpoint). Public access block fully on; a TLS-only Deny rejects any
# non-HTTPS request. Versioning on (recovery path of last resort).
#
# Bare name `picasso-demo-site` per the naming convention (account = env; no env
# token in the name).
#
# Circular-dep break: the OAC GetObject statement needs the CloudFront
# distribution ARN, but cloudfront-demo-site-staging needs this bucket's regional
# domain as an origin. Resolved as the dashboard twin: the CloudFront module
# references this bucket by its FIXED regional domain string (bucket name is a
# locked literal), so there is no cloudfront->s3 module reference; this module
# takes the distribution ARN as an OPTIONAL var and emits the OAC statement only
# when non-empty (one-directional dep: s3 <- cloudfront).
#
# Provider: root default (us-east-1) — no alias.

variable "cloudfront_distribution_arn" {
  description = "ARN of the demo-site CloudFront distribution. When non-empty, an OAC-scoped s3:GetObject grant is added (aws:SourceArn = this ARN). Default empty so the bucket can be created before the distribution within a single apply."
  type        = string
  default     = ""
}

resource "aws_s3_bucket" "demo" {
  bucket = "picasso-demo-site"

  tags = {
    Name = "picasso-demo-site"
  }
}

resource "aws_s3_bucket_versioning" "demo" {
  bucket = aws_s3_bucket.demo.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "demo" {
  bucket = aws_s3_bucket.demo.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "demo" {
  bucket = aws_s3_bucket.demo.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "demo" {
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
      aws_s3_bucket.demo.arn,
      "${aws_s3_bucket.demo.arn}/*",
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
      resources = ["${aws_s3_bucket.demo.arn}/*"]
      condition {
        test     = "StringEquals"
        variable = "aws:SourceArn"
        values   = [var.cloudfront_distribution_arn]
      }
    }
  }
}

resource "aws_s3_bucket_policy" "demo" {
  bucket = aws_s3_bucket.demo.id
  policy = data.aws_iam_policy_document.demo.json

  depends_on = [aws_s3_bucket_public_access_block.demo]
}

output "bucket_name" {
  value = aws_s3_bucket.demo.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.demo.arn
}

output "bucket_regional_domain_name" {
  description = "Regional domain for use as a CloudFront S3 origin (matches the fixed literal cloudfront-demo-site-staging references)."
  value       = aws_s3_bucket.demo.bucket_regional_domain_name
}

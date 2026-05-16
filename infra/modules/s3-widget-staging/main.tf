# Staging widget S3 bucket — staging-account twin of the prod-account
# `picassostaging` bucket (origin behind CloudFront E1CGYA1AJ9OYL0).
# Part of Q5 (staging edge migration prod acct 614056832592 → staging
# 525409062831), Phase 1 Apply 2. Plan: ~/.claude/plans/glistening-strolling-oasis.md.
#
# DELIBERATE HARDENING over the live twin [sec-SR5]: the prod `picassostaging`
# bucket policy carries a legacy `PublicReadGetObject` Allow *and* an OAC-locked
# statement. This twin drops public-read entirely — the widget is served ONLY
# through CloudFront via Origin Access Control. Public access block is fully on;
# a TLS-only Deny rejects any non-HTTPS request.
#
# Circular-dep break [B2-style]: the OAC GetObject statement needs the
# CloudFront distribution ARN, but `cloudfront-widget-staging` needs this
# bucket's regional domain as an origin. Resolved exactly as the tenant-config
# module: `cloudfront-widget-staging` references this bucket by its FIXED
# regional domain string (bucket name is the locked literal `picasso-widget-
# staging`), so there is no Terraform module reference cloudfront→s3; this
# module takes the distribution ARN as an OPTIONAL var and emits the OAC
# statement only when it is non-empty (one-directional dep: s3 ← cloudfront).
#
# Provider: root default (us-east-1) — no alias.

variable "cloudfront_distribution_arn" {
  description = "ARN of the staging widget CloudFront distribution. When non-empty, an OAC-scoped s3:GetObject grant is added to the bucket policy (aws:SourceArn = this ARN). Default empty so the bucket can be created before the distribution within a single apply (the policy resource depends on this value, so Terraform orders distribution→policy automatically)."
  type        = string
  default     = ""
}

resource "aws_s3_bucket" "widget" {
  bucket = "picasso-widget-staging"

  tags = {
    Name = "picasso-widget-staging"
  }
}

resource "aws_s3_bucket_versioning" "widget" {
  bucket = aws_s3_bucket.widget.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "widget" {
  bucket = aws_s3_bucket.widget.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "widget" {
  bucket = aws_s3_bucket.widget.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "widget" {
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
      aws_s3_bucket.widget.arn,
      "${aws_s3_bucket.widget.arn}/*",
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
      resources = ["${aws_s3_bucket.widget.arn}/*"]
      condition {
        test     = "StringEquals"
        variable = "aws:SourceArn"
        values   = [var.cloudfront_distribution_arn]
      }
    }
  }
}

resource "aws_s3_bucket_policy" "widget" {
  bucket = aws_s3_bucket.widget.id
  policy = data.aws_iam_policy_document.widget.json

  depends_on = [aws_s3_bucket_public_access_block.widget]
}

output "bucket_name" {
  value = aws_s3_bucket.widget.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.widget.arn
}

output "bucket_regional_domain_name" {
  description = "Regional domain for use as a CloudFront S3 origin (matches the fixed literal cloudfront-widget-staging references)."
  value       = aws_s3_bucket.widget.bucket_regional_domain_name
}

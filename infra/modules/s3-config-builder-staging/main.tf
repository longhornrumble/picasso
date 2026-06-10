# Staging config-builder S3 bucket — staging-account (525) twin of the
# prod-account `picasso-config-builder-prod` bucket. CI-modernization Phase 2.3
# (ci_modernization/docs/MODERNIZATION_PLAN.md): gives picasso-config-builder
# PRs a real staging deploy target (the prod workflow's TODO(staging-env)).
#
# POSTURE (deliberate, reviewed 2026-06-10): public-read static website
# endpoint, NO CloudFront. This mirrors the prod config-builder bucket's own
# serving posture — the bundle is the same compiled, already-public JS app
# with in-app auth; no secret material lands here. (Contrast sec-SR5 on
# s3-widget-staging, which is OAC-locked: that bucket serves client-embedded
# prod-path traffic. This one serves an internal ops tool's staging copy.)
# Upgrade path if posture changes: front with CloudFront + OAC like the
# widget twin and drop the public statement.
#
# Provider: root default (us-east-1) — no alias.

resource "aws_s3_bucket" "config_builder" {
  bucket = "picasso-config-builder-staging"

  tags = {
    Name = "picasso-config-builder-staging"
  }
}

resource "aws_s3_bucket_versioning" "config_builder" {
  bucket = aws_s3_bucket.config_builder.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "config_builder" {
  bucket = aws_s3_bucket.config_builder.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_website_configuration" "config_builder" {
  bucket = aws_s3_bucket.config_builder.id

  index_document {
    suffix = "index.html"
  }

  # SPA routing: unknown paths fall back to the app shell.
  error_document {
    key = "index.html"
  }
}

# Website endpoints require a public-read object policy; the account-default
# public access block must be relaxed for THIS bucket only.
resource "aws_s3_bucket_public_access_block" "config_builder" {
  bucket = aws_s3_bucket.config_builder.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

data "aws_iam_policy_document" "public_read" {
  statement {
    sid       = "PublicReadGetObject"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.config_builder.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }
  }
}

resource "aws_s3_bucket_policy" "config_builder" {
  bucket = aws_s3_bucket.config_builder.id
  policy = data.aws_iam_policy_document.public_read.json

  depends_on = [aws_s3_bucket_public_access_block.config_builder]
}

output "bucket_name" {
  value = aws_s3_bucket.config_builder.bucket
}

output "website_endpoint" {
  value = aws_s3_bucket_website_configuration.config_builder.website_endpoint
}

output "bucket_arn" {
  value = aws_s3_bucket.config_builder.arn
}

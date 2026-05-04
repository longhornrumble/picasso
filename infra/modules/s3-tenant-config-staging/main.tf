variable "staging_account_id" {
  description = "Staging AWS account ID. Used in the deny-Put policy so only the prod-side replication role can write."
  type        = string
  default     = "525409062831"
}

variable "replication_source_account_id" {
  description = "Prod AWS account hosting the source bucket and the S3 replication IAM role. Replication writes from this account bypass the deny-Put policy."
  type        = string
  default     = "614056832592"
}

resource "aws_s3_bucket" "tenant_config" {
  bucket = "myrecruiter-picasso-staging"

  tags = {
    Name = "myrecruiter-picasso-staging"
  }
}

resource "aws_s3_bucket_versioning" "tenant_config" {
  bucket = aws_s3_bucket.tenant_config.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tenant_config" {
  bucket = aws_s3_bucket.tenant_config.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tenant_config" {
  bucket = aws_s3_bucket.tenant_config.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Cross-account replication needs the destination bucket to explicitly grant
# the source-account replication role. Role ARN is deterministic — bucket
# policies don't validate principal existence, so this can land before the
# prod role is created.
# Defense-in-depth: deny s3:Put* from any principal in the staging account
# (only the prod replication role writes here).
data "aws_iam_policy_document" "tenant_config" {
  statement {
    sid    = "AllowProdReplicationRole"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${var.replication_source_account_id}:role/s3-replication-myrecruiter-picasso-to-staging"]
    }
    actions = [
      "s3:ReplicateObject",
      "s3:ReplicateDelete",
      "s3:ReplicateTags",
      "s3:GetBucketVersioning",
      "s3:PutBucketVersioning",
    ]
    resources = [
      aws_s3_bucket.tenant_config.arn,
      "${aws_s3_bucket.tenant_config.arn}/*",
    ]
  }

  statement {
    sid    = "DenyPutsFromStagingAccount"
    effect = "Deny"
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    actions = [
      "s3:PutObject",
      "s3:PutObjectAcl",
      "s3:PutObjectTagging",
      "s3:PutObjectVersionAcl",
      "s3:PutObjectVersionTagging",
    ]
    resources = ["${aws_s3_bucket.tenant_config.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalAccount"
      values   = [var.staging_account_id]
    }
  }
}

resource "aws_s3_bucket_policy" "tenant_config" {
  bucket = aws_s3_bucket.tenant_config.id
  policy = data.aws_iam_policy_document.tenant_config.json

  depends_on = [aws_s3_bucket_public_access_block.tenant_config]
}

output "bucket_name" {
  value = aws_s3_bucket.tenant_config.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.tenant_config.arn
}

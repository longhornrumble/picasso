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

# Q5 Phase 1 Apply 2 [B2]: additive, optional. When the staging widget
# CloudFront distribution exists, its OAC needs s3:GetObject on this bucket to
# serve /tenants/* and /collateral/* (severing the prod-account cross-account
# read). Default empty so this audited module is a no-op change until Q5 wires
# the ARN from main.tf (one-directional dep: this policy ← cloudfront-widget).
variable "cloudfront_distribution_arn" {
  description = "ARN of the staging widget CloudFront distribution. When non-empty, adds an OAC-scoped s3:GetObject grant (aws:SourceArn = this ARN). Empty = no statement emitted (pre-Q5 behavior preserved exactly)."
  type        = string
  default     = ""
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
  # Cross-account replication role from prod (614056832592) writes
  # replicated objects here. Scoped to object-level Replicate* actions
  # only — bucket-level versioning/config control is NOT needed for
  # replication to function and would let the prod role alter staging
  # bucket configuration.
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
    ]
    resources = ["${aws_s3_bucket.tenant_config.arn}/*"]
  }

  # Defense-in-depth: any principal in the staging account is denied
  # write/delete/tagging on the replicated tenant configs. Only the
  # prod-account replication role above writes here.
  statement {
    sid    = "DenyMutationsFromStagingAccount"
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
      "s3:DeleteObject",
      "s3:DeleteObjectVersion",
    ]
    resources = ["${aws_s3_bucket.tenant_config.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalAccount"
      values   = [var.staging_account_id]
    }
  }

  # Q5 [B2]: OAC-only read for the staging widget CloudFront distribution.
  # GetObject (read) — does NOT conflict with the Put/Delete Deny above
  # (different actions), and the CloudFront service principal is not in the
  # staging account so the aws:PrincipalAccount-scoped Deny never matches it.
  # Scoped to THIS distribution via aws:SourceArn. Emitted only when wired.
  dynamic "statement" {
    for_each = var.cloudfront_distribution_arn != "" ? [1] : []
    content {
      sid    = "AllowStagingWidgetCloudFrontOACGetObject"
      effect = "Allow"
      principals {
        type        = "Service"
        identifiers = ["cloudfront.amazonaws.com"]
      }
      actions   = ["s3:GetObject"]
      resources = ["${aws_s3_bucket.tenant_config.arn}/*"]
      condition {
        test     = "StringEquals"
        variable = "aws:SourceArn"
        values   = [var.cloudfront_distribution_arn]
      }
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

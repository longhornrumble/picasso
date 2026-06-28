# Minimal CI config-builder-deploy role — staging account (525409062831).
# CI-modernization Phase 2.3. Mirrors iam-widget-deploy-staging's pattern
# (locked decision #9 lineage): one product, one deploy role, one bucket.
#
# Consumed by picasso-config-builder's pr-checks deploy-staging job (and any
# post-merge staging refresh from main), via repo secret
# AWS_DEPLOY_ROLE_ARN_STAGING. PR-triggered jobs carry OIDC sub
# `repo:longhornrumble/picasso-config-builder:pull_request`; push-to-main
# jobs carry `...:ref:refs/heads/main`. Both are admitted; nothing else.
#
# DELIBERATELY SEPARATE from the infra OIDC role GitHubActionsDeployRole
# (never conflate deploy-code roles with provision-infra roles) and from
# picasso-widget-deploy-staging (one role per product).
#
# CloudFront: staging.config.myrecruiter.ai is fronted by distribution
# E27102WWDBF606 (origin = the staging bucket's S3-website endpoint). This role
# may create invalidations on THAT one distribution so the config-builder
# deploy-staging job auto-refreshes the CDN after each deploy (it passes
# cloudfront_distribution_id). Scoped to the single distribution, not cloudfront:*.
#
# Provider: root default (us-east-1) — no alias.

variable "bucket_arn" {
  description = "ARN of the picasso-config-builder-staging bucket this role deploys to."
  type        = string
}

variable "cloudfront_distribution_id" {
  description = "CloudFront distribution fronting staging.config.myrecruiter.ai; this role may create invalidations on it."
  type        = string
}

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "assume" {
  statement {
    sid     = "GitHubOIDCConfigBuilder"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:longhornrumble/picasso-config-builder:pull_request",
        "repo:longhornrumble/picasso-config-builder:ref:refs/heads/main",
      ]
    }
  }
}

resource "aws_iam_role" "config_builder_deploy" {
  name               = "picasso-config-builder-deploy-staging"
  description        = "CI config-builder deploy: sync to picasso-config-builder-staging. CI-modernization Phase 2.3."
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

data "aws_iam_policy_document" "permissions" {
  statement {
    sid       = "ConfigBuilderBucketObjects"
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
    resources = ["${var.bucket_arn}/*"]
  }

  statement {
    sid       = "ConfigBuilderBucketList"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [var.bucket_arn]
  }

  # Refresh the CDN after a deploy. Scoped to the one distribution fronting
  # staging.config.myrecruiter.ai - CreateInvalidation only (no config changes).
  statement {
    sid       = "ConfigBuilderCloudFrontInvalidation"
    effect    = "Allow"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = ["arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${var.cloudfront_distribution_id}"]
  }
}

resource "aws_iam_role_policy" "config_builder_deploy" {
  name   = "ConfigBuilderStagingDeploy"
  role   = aws_iam_role.config_builder_deploy.id
  policy = data.aws_iam_policy_document.permissions.json
}

output "role_arn" {
  value = aws_iam_role.config_builder_deploy.arn
}

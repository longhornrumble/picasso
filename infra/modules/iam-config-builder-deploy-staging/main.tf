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
# No CloudFront permission: the staging bucket serves via its S3 website
# endpoint (see s3-config-builder-staging posture note).
#
# Provider: root default (us-east-1) — no alias.

variable "bucket_arn" {
  description = "ARN of the picasso-config-builder-staging bucket this role deploys to."
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
}

resource "aws_iam_role_policy" "config_builder_deploy" {
  name   = "ConfigBuilderStagingDeploy"
  role   = aws_iam_role.config_builder_deploy.id
  policy = data.aws_iam_policy_document.permissions.json
}

output "role_arn" {
  value = aws_iam_role.config_builder_deploy.arn
}

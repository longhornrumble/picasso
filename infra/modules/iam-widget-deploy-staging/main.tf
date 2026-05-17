# Minimal CI widget-deploy role — staging account (525409062831).
# Q5 Phase 2 [locked decision #9]. Plan: ~/.claude/plans/glistening-strolling-oasis.md.
#
# The `build-and-deploy-staging` job in .github/workflows/deploy-production.yml
# syncs the built widget bundle to S3 + invalidates the staging CloudFront
# distribution. Today it assumes the prod-account legacy role
# (secrets.AWS_DEPLOY_ROLE_ARN). Q5 Phase 2 repoints it to THIS role so the
# deploy lands in the staging-account bucket picasso-widget-staging behind
# CloudFront E3G30AUOEJTB36 (the Phase-1 edge twin).
#
# DELIBERATELY SEPARATE from the infra OIDC role GitHubActionsDeployRole
# [locked decision #9 — never conflate]: that role provisions WAF/ACM/CF/S3
# (broad) and trusts `environment:staging`. This role is widget-deploy ONLY:
# Put/Get/Delete/List on the one bucket + CreateInvalidation on the one dist.
#
# OIDC TRUST [P0.6]: `build-and-deploy-staging` has NO `environment:` stanza
# and runs on push→main, so its GitHub OIDC subject is
# `repo:longhornrumble/picasso:ref:refs/heads/main` — NOT environment:staging.
# The trust admits exactly that sub. (Adding `environment: staging` to the job
# was the rejected alternative — larger blast radius on a prod-affecting
# workflow.) The OIDC provider itself is out-of-band (not TF-managed here,
# pre-existing per P0.4) — referenced by its conventional ARN.
#
# Provider: root default (us-east-1) — no alias.

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "assume" {
  statement {
    sid     = "GitHubOIDCMainBranch"
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
      values   = ["repo:longhornrumble/picasso:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "widget_deploy" {
  name               = "picasso-widget-deploy-staging"
  description        = "CI widget-deploy: sync to picasso-widget-staging + invalidate E3G30AUOEJTB36. Q5 Phase 2."
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

data "aws_iam_policy_document" "permissions" {
  statement {
    sid       = "WidgetBucketObjects"
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::picasso-widget-staging/*"]
  }

  statement {
    sid       = "WidgetBucketList"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::picasso-widget-staging"]
  }

  statement {
    sid       = "InvalidateStagingDistribution"
    effect    = "Allow"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = ["arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/E3G30AUOEJTB36"]
  }
}

resource "aws_iam_role_policy" "widget_deploy" {
  name   = "widget-deploy"
  role   = aws_iam_role.widget_deploy.id
  policy = data.aws_iam_policy_document.permissions.json
}

output "role_arn" {
  description = "ARN to set as the GitHub secret AWS_DEPLOY_ROLE_ARN_STAGING (Q5 Phase 2.2)."
  value       = aws_iam_role.widget_deploy.arn
}

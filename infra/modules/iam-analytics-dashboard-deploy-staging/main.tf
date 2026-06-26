# Minimal CI analytics-dashboard-deploy role — staging account (525409062831).
# Part of the analytics-dashboard staging re-home, Phase 2b. Mirrors the Q5
# iam-widget-deploy-staging precedent.
#
# The `deploy-staging` job in the picasso-analytics-dashboard repo's
# .github/workflows/pr-checks.yml syncs the built SPA to S3 + invalidates the
# staging CloudFront distribution. Today it assumes the repo-level
# secrets.AWS_DEPLOY_ROLE_ARN (a prod-account 614 role, because the legacy
# staging bucket lived in 614). Phase 2b repoints it to THIS role via a new
# repo secret AWS_DEPLOY_ROLE_ARN_STAGING, so the deploy lands in the
# staging-account bucket picasso-analytics-dashboard-staging behind CloudFront
# E72QGOSH2XUD3 (the re-home twin).
#
# DELIBERATELY SEPARATE from the infra OIDC role GitHubActionsDeployRole (which
# provisions broad infra and trusts repo:longhornrumble/picasso). This role is
# dashboard-deploy ONLY: Put/Get/Delete/List on the one bucket +
# CreateInvalidation on the one dist, and trusts the SEPARATE repo
# longhornrumble/picasso-analytics-dashboard.
#
# OIDC TRUST: the dashboard deploy-staging job runs on `pull_request` and the
# reusable deploy-frontend.yml deploy job has NO `environment:` binding, so its
# GitHub OIDC subject is `repo:longhornrumble/picasso-analytics-dashboard:pull_request`
# (verified 2026-06-25). The trust admits exactly that sub. The OIDC provider
# is pre-existing (not TF-managed here) — referenced by its conventional ARN.
#
# Provider: root default (us-east-1) — no alias.

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "assume" {
  statement {
    sid     = "GitHubOIDCDashboardPullRequest"
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
      values   = ["repo:longhornrumble/picasso-analytics-dashboard:pull_request"]
    }
  }
}

resource "aws_iam_role" "dashboard_deploy" {
  name               = "picasso-analytics-dashboard-deploy-staging"
  description        = "CI dashboard-deploy: sync to picasso-analytics-dashboard-staging + invalidate E72QGOSH2XUD3. Analytics-dashboard staging re-home Phase 2b."
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

data "aws_iam_policy_document" "permissions" {
  statement {
    sid       = "DashboardBucketObjects"
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::picasso-analytics-dashboard-staging/*"]
  }

  statement {
    sid       = "DashboardBucketList"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::picasso-analytics-dashboard-staging"]
  }

  statement {
    sid       = "InvalidateStagingDistribution"
    effect    = "Allow"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = ["arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/E72QGOSH2XUD3"]
  }
}

resource "aws_iam_role_policy" "dashboard_deploy" {
  name   = "dashboard-deploy"
  role   = aws_iam_role.dashboard_deploy.id
  policy = data.aws_iam_policy_document.permissions.json
}

output "role_arn" {
  description = "ARN to set as the picasso-analytics-dashboard repo GitHub secret AWS_DEPLOY_ROLE_ARN_STAGING (Phase 2b.2)."
  value       = aws_iam_role.dashboard_deploy.arn
}

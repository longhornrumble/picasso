# ─────────────────────────────────────────────────────────────────────────────
# Tenant-config promotion READ role (staging-only).
#
# OIDC role assumed by the gated promote-tenant-config workflow to FETCH a
# staging-authored tenant config from the staging bucket before it validates and
# copies it to prod. Read-only, config objects only — the counterpart to
# promote-tenant-config-role-prod (which does the prod write). Keeping the read
# in a staging-account role (not the prod role) preserves the account boundary:
# the CI actor reads staging with a staging role and writes prod with a prod
# role; neither account holds a standing cross-account grant.
#
# Trust: :environment:production (v1 — the promote workflow runs in the existing
# `production` environment, matching promote-tenant-config-role-prod). A later
# refinement moves BOTH roles + the workflow to a dedicated, frictionless
# `config-promotion` environment (no second-party approval — the Config Builder
# is a solo-operator internal tool; the UI confirm is the deliberate gate).
#
# Gated at the module block (count = var.env == "staging" ? 1 : 0) in main.tf —
# exists only in the staging account (525); auto-applies on merge to main.
#
# Design: docs/roadmap/TENANT_CONFIG_PROMOTION_MECHANISM.md §11 step 3b.
# ─────────────────────────────────────────────────────────────────────────────

data "aws_caller_identity" "current" {}

locals {
  staging_config_bucket = "myrecruiter-picasso-staging"
}

resource "aws_iam_role" "this" {
  name = "GitHubActionsPromoteConfigReadRole"
  # ASCII-only (IAM rejects em-dash / smart-quotes on name/description/path).
  description = "OIDC read-only role for the promote-tenant-config workflow to fetch staging-authored configs. Read-only on the staging config bucket."

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com" }
        Action    = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
          StringLike   = { "token.actions.githubusercontent.com:sub" = "repo:longhornrumble/picasso:environment:production" }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "read_config_objects" {
  role = aws_iam_role.this.name
  name = "promote-tenant-config-read"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadConfigObjects"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
        ]
        Resource = [
          "arn:aws:s3:::${local.staging_config_bucket}/tenants/*",
          "arn:aws:s3:::${local.staging_config_bucket}/mappings/*",
        ]
      },
      {
        Sid    = "ListConfigBucket"
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
        ]
        Resource = ["arn:aws:s3:::${local.staging_config_bucket}"]
      },
    ]
  })
}

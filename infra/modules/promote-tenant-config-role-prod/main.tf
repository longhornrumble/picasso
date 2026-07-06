# ─────────────────────────────────────────────────────────────────────────────
# Tenant-config promotion write role (production-only).
#
# OIDC role assumed by the gated `promote-tenant-config.yml` workflow to write a
# staging-validated tenant config into the PROD tenant-config bucket
# (myrecruiter-picasso). Narrow by design: S3 config objects only
# (tenants/* + mappings/*) plus the ListBucket/versions needed for diff +
# version-restore rollback. NOT the broad prod GitHubActionsDeployRole — least
# privilege for a role that can overwrite any tenant's live chat config.
#
# Trust mirrors ci-drift-plan-role-prod's OIDC shape, scoped to the
# `:environment:production` claim — the SAME claim GitHubActionsDeployRole
# already allows, and the promotion workflow runs in the `production`
# environment, whose required-reviewer gate is the real hold. (A dedicated
# environment could tighten the trust to only this workflow; deferred — the
# narrow policy + reviewer gate are the primary controls.)
#
# dynamodb:PutItem on the prod Tenant Registry (design §10.4, new-tenant
# promotion) is intentionally NOT granted yet — the approved first use is
# existing-tenant config promotion (the V5 flag → prod MYR), which is S3-only.
# Add it in the same module when new-tenant promotion is built.
#
# Gated at the module block (count = var.env == "production" ? 1 : 0) in
# infra/main.tf — these resources exist only in the prod account (614).
#
# Design: docs/roadmap/TENANT_CONFIG_PROMOTION_MECHANISM.md §11 step 2.
# ─────────────────────────────────────────────────────────────────────────────

data "aws_caller_identity" "current" {}

locals {
  config_bucket = "myrecruiter-picasso"
}

resource "aws_iam_role" "this" {
  name = "GitHubActionsPromoteConfigRole"
  # ASCII-only (IAM rejects em-dash / smart-quotes on name/description/path).
  description = "OIDC role for the gated promote-tenant-config workflow. Writes staging-validated tenant configs to the prod config bucket. S3 config objects only."

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com" }
        Action    = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
          # Trust BOTH the `production` env (original) AND the new frictionless
          # `config-promotion` env (no required reviewer — the Config Builder's
          # own confirm dialog becomes the gate; solo-operator model). Both listed
          # for a zero-downtime cutover: the promote workflow can move from
          # `production` -> `config-promotion` without a broken window. Narrow to
          # config-promotion-only once the flip is proven.
          StringLike = {
            "token.actions.githubusercontent.com:sub" = [
              "repo:longhornrumble/picasso:environment:production",
              "repo:longhornrumble/picasso:environment:config-promotion",
            ]
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "config_objects" {
  role = aws_iam_role.this.name
  name = "promote-tenant-config-objects"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadWriteConfigObjects"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:PutObject",
        ]
        Resource = [
          "arn:aws:s3:::${local.config_bucket}/tenants/*",
          "arn:aws:s3:::${local.config_bucket}/mappings/*",
        ]
      },
      {
        Sid    = "ListForDiffAndVersionRestore"
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:ListBucketVersions",
        ]
        Resource = ["arn:aws:s3:::${local.config_bucket}"]
      },
    ]
  })
}

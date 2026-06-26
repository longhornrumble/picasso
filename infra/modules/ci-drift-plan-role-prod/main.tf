# ─────────────────────────────────────────────────────────────────────────────
# B3 drift-detection plan role (production-only).
#
# Read-only OIDC role assumed by the scheduled `infra-drift-detection.yml` cron
# (sub `repo:longhornrumble/picasso:ref:refs/heads/main`), which the prod
# `GitHubActionsDeployRole` trust does NOT allow (it permits only
# `:environment:production` and `:pull_request`). Dedicated + read-only by design:
# AWS-managed `ReadOnlyAccess` only, so a drift cron can never apply.
#
# Gated at the module block (`count = var.env == "production" ? 1 : 0`) in
# infra/main.tf — these resources only exist in the prod account.
# ─────────────────────────────────────────────────────────────────────────────

data "aws_caller_identity" "current" {}

resource "aws_iam_role" "this" {
  name = "GitHubActionsPlanRole"
  # ASCII-only (IAM rejects em-dash / smart-quotes on name/description/path).
  description = "Read-only OIDC role for scheduled terraform-plan drift detection (B3). No apply."

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com" }
        Action    = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
          StringLike   = { "token.actions.githubusercontent.com:sub" = "repo:longhornrumble/picasso:ref:refs/heads/main" }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "read_only" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

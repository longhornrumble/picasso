# Meta Messenger project — App Secret + Instagram App Secret slots.
#
# Twins of the prod-account (614) `picasso/meta/app-secret` and
# `picasso/meta/ig-app-secret`. Used for inbound webhook HMAC-SHA256 signature
# validation (X-Hub-Signature-256) and OAuth code→token exchange:
#   - picasso/meta/app-secret    → Meta_Webhook_Handler (verify) + Meta_OAuth_Handler (exchange)
#   - picasso/meta/ig-app-secret → Meta_Webhook_Handler (Instagram-object verify)
#
# Name carries NO `-staging` suffix — matches the prod naming exactly (Meta App
# secrets are account-scoped credentials under the account=environment model;
# the same logical name resolves to a distinct value per account).
#
# Default Secrets Manager encryption (no dedicated CMK) — same posture as the
# accepted `secrets-clerk-staging` pattern; these are dev-mode app secrets, not
# the higher-blast-radius Telnyx case that warranted a CMK. Values are populated
# OUT OF BAND by the operator via `aws secretsmanager put-secret-value`; no
# `aws_secretsmanager_secret_version` resource is declared, so plan/apply never
# needs GetSecretValue (Phase D audit row #13 lesson).
#
# Read access is locked to the consuming Lambda roles by an
# `aws_secretsmanager_secret_policy` that lives in the ROOT infra/main.tf (same
# circular-dep avoidance as the JWT/Clerk secret policies) — NOT here.

resource "aws_secretsmanager_secret" "meta_app_secret" {
  name        = "picasso/meta/app-secret"
  description = "Meta (Facebook) App Secret for the staging-account Messenger integration. Webhook HMAC verification + OAuth token exchange. Value injected post-apply via aws secretsmanager put-secret-value (out of Terraform state)."

  recovery_window_in_days = 14

  tags = {
    Name = "picasso/meta/app-secret"
  }
}

resource "aws_secretsmanager_secret" "meta_ig_app_secret" {
  name        = "picasso/meta/ig-app-secret"
  description = "Instagram App Secret for the staging-account Messenger integration. Instagram-object webhook HMAC verification. Value injected post-apply via aws secretsmanager put-secret-value (out of Terraform state)."

  recovery_window_in_days = 14

  tags = {
    Name = "picasso/meta/ig-app-secret"
  }
}

output "app_secret_arn" {
  value = aws_secretsmanager_secret.meta_app_secret.arn
}

output "app_secret_name" {
  value = aws_secretsmanager_secret.meta_app_secret.name
}

output "ig_app_secret_arn" {
  value = aws_secretsmanager_secret.meta_ig_app_secret.arn
}

output "ig_app_secret_name" {
  value = aws_secretsmanager_secret.meta_ig_app_secret.name
}

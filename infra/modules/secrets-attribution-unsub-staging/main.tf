# HMAC signing key for Attribution_Unsubscribe one-click unsubscribe tokens.
#
# Value is operator-injected post-apply via:
#   aws secretsmanager put-secret-value \
#     --secret-id picasso/staging/attribution/unsub-signing-key \
#     --secret-string '{"key":"<32-byte-hex-or-random-base64>"}' \
#     --profile myrecruiter-staging
#
# Terraform does NOT manage a secret version, so the value never enters
# tfstate and plan/apply never needs to read it.
#
# NOTE: the resource-based policy restricting read access to the
# Attribution_Unsubscribe and Attribution_Recap_Generator exec roles
# lives in the root infra/main.tf, NOT here.
# Adding it inside this module would create a circular dependency
# (secret policy needs the role ARNs; the Lambda modules need the secret ARN).

resource "aws_secretsmanager_secret" "unsub_signing_key" {
  name        = "picasso/staging/attribution/unsub-signing-key"
  description = "HMAC signing key for Attribution_Unsubscribe one-click tokens (staging). Value injected post-apply via aws secretsmanager put-secret-value (out of Terraform state)."

  recovery_window_in_days = 14

  tags = {
    Name = "picasso/staging/attribution/unsub-signing-key"
  }
}

output "secret_name" {
  value = aws_secretsmanager_secret.unsub_signing_key.name
}

output "secret_arn" {
  value = aws_secretsmanager_secret.unsub_signing_key.arn
}

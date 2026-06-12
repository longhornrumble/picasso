# Dub.co API key secret for the staging account.
#
# Value is operator-injected post-apply via:
#   aws secretsmanager put-secret-value \
#     --secret-id picasso/staging/dub/api-key \
#     --secret-string '{"api_key":"<value>"}' \
#     --profile myrecruiter-staging
#
# Terraform does NOT manage a secret version, so the value never enters
# tfstate and plan/apply never needs to read it.
#
# NOTE: the resource-based policy locking read access to the Attribution
# Lambda execution roles lives in the root infra/main.tf, NOT here.
# Adding it inside this module creates a circular dependency (secret
# policy needs the role ARNs; the Lambda modules need the secret ARN).

resource "aws_secretsmanager_secret" "dub_api_key" {
  name        = "picasso/staging/dub/api-key"
  description = "Dub.co API key for Attribution_Mint_Service and Attribution_Aggregator (staging). Value injected post-apply via aws secretsmanager put-secret-value (out of Terraform state)."

  recovery_window_in_days = 14

  tags = {
    Name = "picasso/staging/dub/api-key"
  }
}

output "secret_name" {
  value = aws_secretsmanager_secret.dub_api_key.name
}

output "secret_arn" {
  value = aws_secretsmanager_secret.dub_api_key.arn
}

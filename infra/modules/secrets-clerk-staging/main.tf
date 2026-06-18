resource "aws_secretsmanager_secret" "clerk_secret_key" {
  name        = "picasso/staging/clerk-secret-key"
  description = "Clerk dev-project secret key for staging-account Analytics_Dashboard_API. Value injected post-apply via aws secretsmanager put-secret-value (out of Terraform state)."

  recovery_window_in_days = 14

  tags = {
    Name = "picasso/staging/clerk-secret-key"
  }
}

# NOTE: a resource-based policy locking read access to the Analytics_Dashboard_
# API exec role lives in the root infra/main.tf, NOT here. Same circular-dep
# avoidance pattern as secrets-jwt-staging.

output "secret_name" {
  value = aws_secretsmanager_secret.clerk_secret_key.name
}

output "secret_arn" {
  value = aws_secretsmanager_secret.clerk_secret_key.arn
}

# Clerk webhook (Svix) signing secret for the dev instance. The staging Lambda's
# /webhooks/clerk verifier reads it to authenticate inbound Clerk events
# (organizationMembership.created, etc.). Value injected post-apply via
# aws secretsmanager put-secret-value (out of Terraform state). Resource-based
# read policy lives in root infra/main.tf (same pattern as clerk_secret_key).
resource "aws_secretsmanager_secret" "clerk_webhook_secret" {
  name        = "picasso/staging/clerk-webhook-secret"
  description = "Clerk dev-instance webhook (Svix) signing secret for staging-account Analytics_Dashboard_API /webhooks/clerk. Value injected post-apply via aws secretsmanager put-secret-value (out of Terraform state)."

  recovery_window_in_days = 14

  tags = {
    Name = "picasso/staging/clerk-webhook-secret"
  }
}

output "webhook_secret_name" {
  value = aws_secretsmanager_secret.clerk_webhook_secret.name
}

output "webhook_secret_arn" {
  value = aws_secretsmanager_secret.clerk_webhook_secret.arn
}

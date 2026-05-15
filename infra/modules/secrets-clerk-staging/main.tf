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

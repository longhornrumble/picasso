resource "aws_secretsmanager_secret" "jwt_signing_key" {
  name        = "picasso/staging/jwt/signing-key"
  description = "JWT signing key for staging-account Picasso Lambdas. Value injected post-apply via aws secretsmanager put-secret-value (out of Terraform state)."

  recovery_window_in_days = 14

  tags = {
    Name = "picasso/staging/jwt/signing-key"
  }
}

# NOTE: a resource-based policy locking read access to specifically the
# Master_Function exec role lives in the root infra/main.tf, NOT here.
# Adding it inside this module would create a circular dependency (secret
# policy needs the role ARN; the Lambda module needs the secret ARN).

output "secret_name" {
  value = aws_secretsmanager_secret.jwt_signing_key.name
}

output "secret_arn" {
  value = aws_secretsmanager_secret.jwt_signing_key.arn
}

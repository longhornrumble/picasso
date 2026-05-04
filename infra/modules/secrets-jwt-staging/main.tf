resource "aws_secretsmanager_secret" "jwt_signing_key" {
  name        = "picasso/staging/jwt/signing-key"
  description = "JWT signing key for staging-account Picasso Lambdas. Value injected post-apply via aws secretsmanager put-secret-value (out of Terraform state)."

  recovery_window_in_days = 7

  tags = {
    Name = "picasso/staging/jwt/signing-key"
  }
}

output "secret_name" {
  value = aws_secretsmanager_secret.jwt_signing_key.name
}

output "secret_arn" {
  value = aws_secretsmanager_secret.jwt_signing_key.arn
}

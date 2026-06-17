output "role_arn" {
  description = "ARN of the read-only drift-detection plan role. Set this as the repo variable PROD_PLAN_ROLE_ARN to activate infra-drift-detection.yml."
  value       = aws_iam_role.this.arn
}

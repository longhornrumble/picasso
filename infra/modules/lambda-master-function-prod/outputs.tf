output "function_arn" {
  description = "ARN of the prod Master_Function Lambda (null when env != production)."
  value       = length(aws_lambda_function.this) > 0 ? aws_lambda_function.this[0].arn : null
}

output "function_name" {
  description = "Name of the prod Master_Function Lambda (null when env != production)."
  value       = length(aws_lambda_function.this) > 0 ? aws_lambda_function.this[0].function_name : null
}

output "log_group_name" {
  description = "CloudWatch log group name for Master_Function prod (null when env != production)."
  value       = length(aws_cloudwatch_log_group.lambda) > 0 ? aws_cloudwatch_log_group.lambda[0].name : null
}

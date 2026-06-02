output "acm_certificate_arn" {
  description = "ARN of the staging.schedule.myrecruiter.ai ACM cert (PENDING_VALIDATION until the GoDaddy validation CNAME is added; ISSUED thereafter). Consumed by the distribution when enable_custom_domain = true."
  value       = aws_acm_certificate.redemption.arn
}

output "validation_record" {
  description = "DNS validation CNAME the operator must add in the GoDaddy console (the myrecruiter.ai zone is NOT in Route53). After adding, wait until `aws acm describe-certificate --certificate-arn <arn> --region us-east-1` shows Status=ISSUED before the Apply 2 (enable_custom_domain = true) run."
  value = {
    name  = one(aws_acm_certificate.redemption.domain_validation_options).resource_record_name
    type  = one(aws_acm_certificate.redemption.domain_validation_options).resource_record_type
    value = one(aws_acm_certificate.redemption.domain_validation_options).resource_record_value
  }
}

output "distribution_id" {
  description = "CloudFront distribution ID for the redemption edge."
  value       = aws_cloudfront_distribution.redemption.id
}

output "distribution_domain_name" {
  description = "The d###.cloudfront.net domain. Used for raw-CF validation before DNS, AND it is the target the operator points the GoDaddy CNAME at (see dns_alias_record)."
  value       = aws_cloudfront_distribution.redemption.domain_name
}

output "dns_alias_record" {
  description = "The CNAME the operator must add in the GoDaddy console to serve the redemption host (the myrecruiter.ai zone is NOT in Route53, so Terraform cannot create it). Add only AFTER enable_custom_domain = true so the distribution carries the alias."
  value = {
    name  = var.redemption_host
    type  = "CNAME"
    value = aws_cloudfront_distribution.redemption.domain_name
  }
}

output "redemption_host" {
  description = "The resolved redemption hostname (staging.schedule.myrecruiter.ai). The integrator consumes this when reconciling SCHEDULE_BASE_URL in the booking-commit / event-consumer modules (an integrator-owned coupled change, NOT this module's)."
  value       = var.redemption_host
}

# ACM certificate for the staging analytics-dashboard edge — staging-account
# (525409062831) home for staging.app.myrecruiter.ai. Part of the analytics-
# dashboard staging re-home (prod acct 614 -> staging 525), mirroring the
# completed Q5 widget edge migration (modules/acm-chat-staging).
#
# DNS validation. The myrecruiter.ai zone is hosted at GoDaddy, NOT Route53 —
# verified 2026-06-25 (ns45/46.domaincontrol.com answer staging.app.myrecruiter.ai
# directly as a CNAME; no awsdns SOA). Terraform therefore CANNOT create the
# validation record, so this module deliberately omits
# `aws_acm_certificate_validation` (that resource would block `terraform apply`
# indefinitely waiting on a DNS record that never appears). The cert is created
# in PENDING_VALIDATION and the required CNAME is surfaced via the
# `validation_record` output for the operator to add in the GoDaddy DNS console.
#
# Two-apply sequencing: the cloudfront-analytics-dashboard-staging distribution
# attaches this cert ONLY when enable_custom_domain = true (cutover). The cert
# can be created now (PENDING_VALIDATION) and validated later — adding the
# GoDaddy CNAME is deliberately the LAST step (operator, at cutover).
#
# Provider: ACM certs attached to CloudFront MUST be in us-east-1. The root
# default provider is us-east-1 (var.aws_region default) — no alias needed.

resource "aws_acm_certificate" "app_staging" {
  domain_name       = "staging.app.myrecruiter.ai"
  validation_method = "DNS"

  tags = {
    Name = "staging-app-myrecruiter-ai"
  }

  lifecycle {
    create_before_destroy = true
  }
}

output "certificate_arn" {
  description = "ARN of the staging.app.myrecruiter.ai ACM cert (PENDING_VALIDATION until the GoDaddy CNAME is added). Consumed by cloudfront-analytics-dashboard-staging only when enable_custom_domain = true."
  value       = aws_acm_certificate.app_staging.arn
}

output "validation_record" {
  description = "DNS validation CNAME the operator must add in the GoDaddy console. After adding, wait until `aws acm describe-certificate --certificate-arn <arn> --region us-east-1` shows Status=ISSUED before flipping enable_custom_domain."
  value = {
    name  = one(aws_acm_certificate.app_staging.domain_validation_options).resource_record_name
    type  = one(aws_acm_certificate.app_staging.domain_validation_options).resource_record_type
    value = one(aws_acm_certificate.app_staging.domain_validation_options).resource_record_value
  }
}

# ACM certificate for the demo microsite edge — staging-account (525409062831)
# home for demo.myrecruiter.ai. The Demo Zone microsite embeds the BrightPath
# widget, whose tenant (BRI071351) + seeded data live ONLY in staging (525), so
# the microsite is staging-wired (its widget must reach staging endpoints).
#
# Mirrors modules/acm-app-staging exactly. DNS validation; the myrecruiter.ai
# zone is hosted at GoDaddy, NOT Route53, so Terraform CANNOT create the
# validation record. This module deliberately omits
# `aws_acm_certificate_validation` (that resource would block `terraform apply`
# indefinitely waiting on a DNS record that never appears). The cert is created
# in PENDING_VALIDATION and the required CNAME is surfaced via the
# `validation_record` output for the operator to add in the GoDaddy DNS console.
#
# Two-apply sequencing: the cloudfront-demo-site-staging distribution attaches
# this cert ONLY when enable_custom_domain = true (after the cert reaches
# ISSUED). Adding the GoDaddy CNAME is deliberately the operator's step.
#
# Provider: ACM certs attached to CloudFront MUST be in us-east-1. The root
# default provider is us-east-1 (var.aws_region default) — no alias needed.

resource "aws_acm_certificate" "demo_staging" {
  domain_name       = "demo.myrecruiter.ai"
  validation_method = "DNS"

  tags = {
    Name = "demo-myrecruiter-ai"
  }

  lifecycle {
    create_before_destroy = true
  }
}

output "certificate_arn" {
  description = "ARN of the demo.myrecruiter.ai ACM cert (PENDING_VALIDATION until the GoDaddy CNAME is added). Consumed by cloudfront-demo-site-staging only when enable_custom_domain = true."
  value       = aws_acm_certificate.demo_staging.arn
}

output "validation_record" {
  description = "DNS validation CNAME the operator must add in the GoDaddy console. After adding, wait until `aws acm describe-certificate --certificate-arn <arn> --region us-east-1` shows Status=ISSUED before flipping enable_custom_domain."
  value = {
    name  = one(aws_acm_certificate.demo_staging.domain_validation_options).resource_record_name
    type  = one(aws_acm_certificate.demo_staging.domain_validation_options).resource_record_type
    value = one(aws_acm_certificate.demo_staging.domain_validation_options).resource_record_value
  }
}

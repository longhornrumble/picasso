# ACM certificate for the staging widget edge — staging-account twin of the
# prod-account cert arn:aws:acm:us-east-1:614056832592:certificate/e58e7fff-… .
# Part of Q5 (staging edge migration prod acct 614056832592 → staging
# 525409062831). Plan: ~/.claude/plans/glistening-strolling-oasis.md.
#
# DNS validation. The chat.myrecruiter.ai zone is hosted at GoDaddy, NOT
# Route53 — verified P0.1 (2026-05-15): ns45/46.domaincontrol.com answers
# staging.chat.myrecruiter.ai directly as a CNAME; the awsdns servers hold
# no zone/SOA for it. Terraform therefore CANNOT create the validation
# record, so this module deliberately omits `aws_acm_certificate_validation`
# (that resource would block `terraform apply` indefinitely waiting on a DNS
# record that never appears). The cert is created in PENDING_VALIDATION and
# the required CNAME is surfaced via the `validation_record` output for the
# operator to add in the GoDaddy DNS console.
#
# Two-apply sequencing [B1]: the cloudfront-widget-staging distribution that
# consumes this cert is a SEPARATE later apply (Q5 Phase 1 "Apply 2"), gated
# on the operator having added the GoDaddy CNAME and the cert reaching
# ISSUED. Bundling cert + distribution in one apply would fail at the
# distribution (cert not yet ISSUED).
#
# Provider: ACM certs attached to CloudFront MUST be in us-east-1. The root
# default provider is us-east-1 (var.aws_region default) — no alias needed.

resource "aws_acm_certificate" "chat_staging" {
  domain_name       = "staging.chat.myrecruiter.ai"
  validation_method = "DNS"

  tags = {
    Name = "staging-chat-myrecruiter-ai"
  }

  lifecycle {
    create_before_destroy = true
  }
}

output "certificate_arn" {
  description = "ARN of the staging.chat.myrecruiter.ai ACM cert (PENDING_VALIDATION until the GoDaddy CNAME is added). Consumed by cloudfront-widget-staging in Q5 Phase 1 Apply 2."
  value       = aws_acm_certificate.chat_staging.arn
}

output "validation_record" {
  description = "DNS validation CNAME the operator must add in the GoDaddy console. After adding, wait until `aws acm describe-certificate --certificate-arn <arn> --region us-east-1` shows Status=ISSUED before Apply 2."
  value = {
    name  = one(aws_acm_certificate.chat_staging.domain_validation_options).resource_record_name
    type  = one(aws_acm_certificate.chat_staging.domain_validation_options).resource_record_type
    value = one(aws_acm_certificate.chat_staging.domain_validation_options).resource_record_value
  }
}

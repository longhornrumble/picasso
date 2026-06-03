variable "redemption_host" {
  description = "The staging redemption hostname. Operator-decided 2026-06-02 (staging subdomain, NOT prod schedule.myrecruiter.ai). Used as the ACM cert domain_name AND the CloudFront alias."
  type        = string
  default     = "staging.schedule.myrecruiter.ai"
}

variable "redemption_function_url_domain" {
  description = "Host of the WS-D4 redemption Lambda Function URL — the CloudFront custom origin. A bare host only (no https:// scheme, no trailing slash, no path), e.g. <id>.lambda-url.us-east-1.on.aws. The default is a clearly-fake placeholder so terraform validate/plan pass before WS-D4 exists; the integrator wires the real Function URL host when D4 lands."
  type        = string
  default     = "placeholder-ws-d4-not-yet-provisioned.lambda-url.us-east-1.on.aws"
}

variable "enable_custom_domain" {
  description = "Cert-ISSUED ordering gate. false (Apply 1) = no alias + default *.cloudfront.net cert (validate via the raw d###.cloudfront.net domain); the ACM cert is created PENDING_VALIDATION. true (Apply 2) = attach the redemption_host alias + the ACM cert (requires the cert to have reached ISSUED first, i.e. the operator added the GoDaddy validation CNAME)."
  type        = bool
  default     = false
}

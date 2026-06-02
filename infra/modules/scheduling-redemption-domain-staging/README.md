# scheduling-redemption-domain-staging

Public HTTPS edge for the scheduling **token-redemption** host
`staging.schedule.myrecruiter.ai` (canonical §13.8, plan task **D3**). Fronts
the WS-D4 redemption Lambda Function URL (the six endpoints `/cancel`,
`/reschedule`, `/resume`, `/attended/{met,noshow,noconnect}` — all one origin).

Provisions:
- an **ACM cert** (`us-east-1`, DNS validation) for the host;
- a **CloudFront distribution** (HTTPS-only `redirect-to-https`, `TLSv1.2_2021`
  when the custom domain is attached) with one custom origin = the Lambda
  Function URL, `CachingDisabled` + `AllViewerExceptHostHeader`;
- CloudFront **access logging** to CloudWatch Logs (arch-SR4).

It does **NOT** create any Route53 record (see DNS note) and does **NOT**
attach a WAF (out of scope — `docs/roadmap/P22_CLOUDFRONT_WAF_PLAN.md`).

## ⚠️ DNS lives at GoDaddy, not Route53 (hosted-zone escalation)

`myrecruiter.ai` is hosted at GoDaddy (`ns45/ns46.domaincontrol.com`), same as
the sibling `staging.chat.myrecruiter.ai` edge. There is no Route53 zone in the
staging account Terraform can write to, so **two DNS records are operator-added
by hand in the GoDaddy console** — surfaced as the `validation_record` and
`dns_alias_record` outputs. Terraform owns the cert + distribution only.

## Apply sequence (cert must be ISSUED before the alias attaches)

1. **Apply 1** — `enable_custom_domain = false`: cert created
   `PENDING_VALIDATION` + distribution with the default `*.cloudfront.net`
   cert and no alias. Validate via the raw `d###.cloudfront.net` domain.
2. **Operator** — add the `validation_record` CNAME at GoDaddy; wait for
   `aws acm describe-certificate --certificate-arn <arn> --region us-east-1`
   to show `Status=ISSUED`.
3. **Apply 2** — `enable_custom_domain = true`: attaches the
   `staging.schedule.myrecruiter.ai` alias + the ISSUED cert.
4. **Operator** — add the `dns_alias_record` CNAME at GoDaddy
   (`staging.schedule.myrecruiter.ai → <distribution_domain_name>`).

Done-bar (integrator, after step 4): `nslookup staging.schedule.myrecruiter.ai`
resolves; cert `ISSUED`; `https://staging.schedule.myrecruiter.ai/cancel?t=test`
reaches the origin (any 4xx from the Lambda proves the path, not NXDOMAIN).

## Integrator wiring (do in `infra/main.tf`, not this module)

```hcl
module "scheduling_redemption_domain_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/scheduling-redemption-domain-staging"

  # Real WS-D4 Function URL host once it exists; placeholder default until then.
  redemption_function_url_domain = "<d4-fn-url-id>.lambda-url.us-east-1.on.aws"
  enable_custom_domain           = false # flip true at Apply 2 (cert ISSUED)
}
```

Then reconcile `SCHEDULE_BASE_URL` (→ `https://staging.schedule.myrecruiter.ai`)
in the booking-commit / event-consumer modules — an **integrator-owned coupled
change** spanning files this module does not own.

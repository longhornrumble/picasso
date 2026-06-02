# WS-D3 — Redemption domain: `staging.schedule.myrecruiter.ai` (§13.8)

**Plan task:** D3. [plan](../scheduling_implementation_plan.md) §6.
**Repo / branch / base:** `picasso` · `feature/scheduling-ws-d3-domain` · base `staging` (IaC).
**Quality gate:** `verify-before-commit` · weave audit = **LIGHT-to-FULL** (new public HTTPS surface — integrator security-skims the CloudFront/TLS config).
**Launch order: FIRST.** ACM cert validation can take hours; everything that serves the redemption endpoints (WS-D4 E2E) waits on a valid cert.

## Goal / done-bar (verifiable)
- A new Terraform **module** `infra/modules/scheduling-redemption-domain-staging/` that provisions, for the staging-only host **`staging.schedule.myrecruiter.ai`**:
  - an **ACM certificate in `us-east-1`** (CloudFront requirement) for that hostname, DNS-validated;
  - a **CloudFront distribution** (HTTPS-only, `redirect-to-https`, modern TLS policy ≥ `TLSv1.2_2021`) whose origin is the WS-D4 redemption Lambda **Function URL** (passed in as a variable — placeholder default until D4's URL exists);
  - the **Route53 record** `staging.schedule.myrecruiter.ai → <distribution>` (+ the ACM validation CNAME).
- Done-bar (verified by the integrator after apply): `nslookup staging.schedule.myrecruiter.ai` resolves; the ACM cert shows `ISSUED`; `https://staging.schedule.myrecruiter.ai/cancel?t=test` reaches the origin (any 4xx from the Lambda is fine — it proves the path is wired, not NXDOMAIN).

## You OWN (create/edit ONLY these)
- `infra/modules/scheduling-redemption-domain-staging/` — `main.tf`, `variables.tf`, `outputs.tf` (+ README if you like).
  - **Mirror the existing `infra/modules/acm-chat-staging/` + `infra/modules/cloudfront-oac-staging/`** for style, provider aliasing, and tagging.

## You CONSUME (frozen — never modify)
- The existing `acm-chat-staging` / `cloudfront-oac-staging` modules **as reference patterns** (do not edit them).
- **§B11 (FROZEN_CONTRACTS)** only for the host decision: target is `staging.schedule.myrecruiter.ai` (operator-decided 2026-06-02), NOT prod `schedule.myrecruiter.ai`.

## You PRODUCE
- Module **outputs**: `distribution_domain_name`, `distribution_id`, `acm_certificate_arn`, the resolved `redemption_host` (`staging.schedule.myrecruiter.ai`). The integrator consumes these when wiring `infra/main.tf` and reconciling `SCHEDULE_BASE_URL`.
- A `variable "redemption_function_url_domain"` (string) for the D4 Lambda Function URL origin — default to a clearly-fake placeholder so `terraform validate`/`plan` pass before D4 exists.

## OUT OF SCOPE / do NOT
- Do **NOT** edit `infra/main.tf` (integrator wires the module + the real `redemption_function_url_domain`).
- Do **NOT** build the redemption Lambda, its Function URL, or any application code (WS-D4).
- Do **NOT** touch the prod account or `schedule.myrecruiter.ai` (prod) — staging subdomain only.
- Do **NOT** reconcile `SCHEDULE_BASE_URL` in the booking-commit / event-consumer modules — that is an **integrator coupled change** (it spans files you don't own).
- Do **NOT** `terraform apply` — the staging apply is operator/integrator-run (credential mutation). Deliver `terraform validate`-clean code + a plan summary in the PR.
- **WAF is out of scope** (tracked separately in `docs/roadmap/P22_CLOUDFRONT_WAF_PLAN.md`) — note it, don't build it.

## Escalate (do NOT assume)
- **Hosted-zone placement.** `staging.chat.myrecruiter.ai` already resolves, but the `myrecruiter.ai` Route53 zone may live in a different account than staging (525). If the zone for the validation CNAME / the A/AAAA-alias record is not creatable from the staging account, **STOP and flag it in the PR** — the integrator/operator resolves DNS delegation. Do not hardcode a guessed zone id.

## References
- Canonical §13.8 (URL structure, greenfield CloudFront). Plan D3. `CLAUDE.md` (Deployment SOP — staging IaC via Terraform; **IAM string-charset gotcha** if you add any IAM; never-prod-apply). Drift cap (picasso staging↔main ≤5 merges, merge-commit promotes).

## Report-back (in your PR)
- PR `feat(scheduling): WS-D3 staging.schedule.myrecruiter.ai redemption domain (D3)` → **staging**.
- Doc-snippet for the integrator: plan D3 row → 🟡 (apply-pending) with the module path + outputs; note the `redemption_function_url_domain` placeholder + the hosted-zone escalation status.
- Branch, PR#, done-bar status (validate-clean + plan summary), any contract/zone issue.

# Prod IaC T2-SEC — Remedy B: close the #435 BSH streaming bypass

**Goal:** wire the CloudFront-origin-header validator into prod BSH so a direct POST to the Lambda
Function URL (which bypasses CloudFront + WAF) is rejected. Closes GH **#435** (severity Medium-HIGH:
unauth Bedrock cost abuse, fabricated PII form-writes + real SES sends, analytics SQS flood).

**Config-only — NO code deploy.** The deployed prod bundle (`Bedrock_Streaming_Handler`, CodeSha
`btUmIlyeIuD5cUQyJhL73+GBHhsyjCGEuBWlUUIgB0o=`, 176895 bytes) **already contains + calls**
`validateCfOriginHeader`; it is a no-op only because `REQUIRE_CF_ORIGIN_HEADER` is unset. This remedy
sets the env + grant + CF header + flips the flag — zero code change.

**Verified live prerequisites (2026-06-06, acct 614):** URL `AuthType=NONE`; env
`REQUIRE_CF_ORIGIN_HEADER`/`CF_ORIGIN_SECRET_NAME` both unset; secret `picasso/bsh/cf-origin-secret`
absent; role has 8 inline policies (no `CfOriginSecretRead`).

**Validator behavior — CONFIRMED from the deployed bundle (`validateCfOriginHeader`/`xK`):**
- **Flag-first:** `if (REQUIRE_CF_ORIGIN_HEADER.toLowerCase() !== "true") return {valid:true}` — the secret is
  read ONLY after the flag passes. So flag `"false"` ⇒ `GetSecretValue` is **never called** ⇒ the env+grant
  apply (step 2) is inert and **does NOT require the secret to exist yet**. The secret must exist only before
  the **flag flip** (step 4).
- **Secret is a PLAIN STRING** (compared via `Buffer.from(String(secret))` + `timingSafeEqual`), **NOT JSON**.
  Create the prod secret as the bare 64-char value (match staging — verify with
  `aws secretsmanager get-secret-value --secret-id picasso/bsh/cf-origin-secret --profile myrecruiter-staging --query SecretString --output text`).
- **Fails closed** (missing header → invalid; secret unavailable → invalid) and uses a **constant-time**
  compare. The header value must EXACTLY equal the secret value (the CF header and the secret are two manual
  entries — keep them identical).

## What this PR adds (IaC)
- `bsh-function-prod`: 2 vars (`cf_origin_secret_name` default `picasso/bsh/cf-origin-secret`;
  `require_cf_origin_header` default **`false`**) + 2 env keys (`CF_ORIGIN_SECRET_NAME`,
  `REQUIRE_CF_ORIGIN_HEADER`). With the flag **false** the function env grows 14→16 but the validator
  stays inert — **no traffic impact**.
- `bsh-iam-grants-prod`: new `CfOriginSecretRead` inline policy (`secretsmanager:GetSecretValue` on
  `picasso/bsh/cf-origin-secret-*`, **wildcard suffix = rotation-safe**). 8 policies → 9.

## ⚠️ LOAD-BEARING APPLY ORDER (wrong order = self-inflicted 403 outage on ALL chat)
The validator **fails closed**. Do these in order; do NOT flip the flag early.

1. **Operator — create the prod secret** (value out-of-band, NOT in tfstate). Mirror the staging secret's
   string format (confirm plain-string vs JSON against staging's `picasso/bsh/cf-origin-secret` first):
   ```bash
   aws secretsmanager create-secret --name picasso/bsh/cf-origin-secret \
     --secret-string '<64-char-value-V>' --profile chris-admin
   ```
2. **Merge this PR + gated apply** (`require_cf_origin_header` stays `false`):
   - Actions → "Terraform Infrastructure (production)" → Run workflow →
     `target=module.bsh_function_prod` AND a second run `target=module.bsh_iam_grants_prod`
     (or one run if the workflow accepts multiple `-target`s). Operator approves the `Production` gate.
   - Result: env gains the 2 keys (flag false → inert) + the `CfOriginSecretRead` grant. **No traffic change.**
   - Decline the app-deploy from the merge (no app code changed).
3. **Operator — add the CF custom header** to prod CF `E3G0LSWB1AQ9LP`, origin `picasso-streaming-lambda`:
   `x-picasso-cf-origin: <V>` (the SAME value as the secret). Manual — prod CF is not in IaC until T4.
   Wait until the distribution status is **Deployed**.
4. **Flip the flag** — 1-line PR bumping `require_cf_origin_header` default to `"true"` (or pass
   `-var require_cf_origin_header=true` to the gated apply). Merge → gated apply
   (`target=module.bsh_function_prod`) → operator approves. **Enforcement ON.**

> Staging-first for every step. The agent CANNOT apply to prod or approve the gate — the operator runs
> each `workflow_dispatch` apply + the `Production` approval. Apply is `-target`-scoped (full-root footgun).

## SUCCESS CRITERIA (run after step 4)
1. **Direct raw URL → 403** (was 200):
   ```bash
   curl -s -o /dev/null -w '%{http_code}' -X POST \
     https://xqc4wnxwia2nytjkbw6xasjd6q0jckgb.lambda-url.us-east-1.on.aws/ \
     -H 'content-type: application/json' -d '{"tenant_hash":"X","user_input":"x"}'   # → 403
   ```
2. **CloudFront path still streams:**
   ```bash
   curl -N -X POST https://chat.myrecruiter.ai/stream \
     -H 'content-type: application/json' -d '{"tenant_hash":"<valid>","user_input":"hello"}'  # SSE tokens flow
   ```
3. BSH CloudWatch logs show `SECURITY: streamingHandler rejected request: missing CF origin header` on the
   direct probe.
4. **API-GW path (audit finding #2 — verify, do NOT assume):** the validator runs INSIDE the Lambda, so the
   API GW invoke path (`allow-api-gateway-invoke-prod`, GW `kgvc8xnewf`) also passes through it — BUT only
   rejects if that API GW route does NOT already inject `x-picasso-cf-origin`. After the flip, probe it:
   ```bash
   curl -s -o /dev/null -w '%{http_code}' -X POST \
     https://kgvc8xnewf.execute-api.us-east-1.amazonaws.com/<stage>/<route> \
     -H 'content-type: application/json' -d '{"tenant_hash":"X","user_input":"x"}'   # want 403
   ```
   If it returns 200, the API GW path is a residual bypass — either deprecate that route or have it inject the
   header. Document the result; Remedy B's stated scope is the **Function URL** bypass.

## Pre-flag-flip checklist (audit finding #7 — the flip PR is one character; gate it)
Before merging the `require_cf_origin_header=true` PR, confirm ALL of:
- [ ] secret `picasso/bsh/cf-origin-secret` exists in prod (plain 64-char string)
- [ ] `CfOriginSecretRead` grant applied (step 2) — `aws iam list-role-policies --role-name Bedrock-Streaming-Handler-Role | grep CfOriginSecretRead`
- [ ] prod CF `E3G0LSWB1AQ9LP` streaming origin injects `x-picasso-cf-origin` = the secret value (Deployed)
- [ ] (recommended) SM resource policy on the secret restricts reads to the BSH role (see hardening below)

## Recommended hardening before the flip (audit finding #3 — defer-ok, separate apply)
The secret VALUE is the shared token; any account-614 principal with `secretsmanager:GetSecretValue` on `*`
(operators, the deploy role) can read it and replay the header. Add a Secrets Manager **resource policy**
allowing only the BSH role ARN (a follow-on PR after the secret exists — it references the live secret ARN):
```hcl
resource "aws_secretsmanager_secret_policy" "cf_origin" {
  secret_arn = "<the created secret's ARN>"
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Sid = "AllowBSHRoleOnly", Effect = "Allow", Principal = { AWS = "<BSH role ARN>" },
      Action = "secretsmanager:GetSecretValue", Resource = "*" },
    { Sid = "DenyOthers", Effect = "Deny", Principal = "*", Action = "secretsmanager:GetSecretValue",
      Resource = "*", Condition = { StringNotEquals = { "aws:PrincipalArn" = "<BSH role ARN>" } } } ]})
}
```
Note: the IAM grant's wildcard ARN (`…cf-origin-secret-*`) matches only the 6-char AWS rotation suffix, not
arbitrary names — and the runtime reads the fixed name in `CF_ORIGIN_SECRET_NAME`, so a same-prefix decoy
secret gains an attacker nothing.

## Rollback
If the flag flip 403s legitimate traffic (e.g. CF header missing/mismatched): revert the flag to `"false"`
via a 1-line PR + gated apply (fastest governed path), or `-var require_cf_origin_header=false`. The
validator returns to no-op immediately; the secret + grant + env can stay (inert).

**Emergency break-glass (outage in progress, no approver online — audit finding #6):** unset the flag
directly, then reconcile:
```bash
# 1) immediate: flip the live flag off (creates drift)
aws lambda update-function-configuration --function-name Bedrock_Streaming_Handler --profile chris-admin \
  --environment "Variables={...ALL 16 vars..., REQUIRE_CF_ORIGIN_HEADER=false}"   # full map; omitting keys DROPS them
# 2) immediately after: open a 1-line PR setting require_cf_origin_header="false" so the next gated apply
#    matches live (else the next apply would re-flip it to whatever HCL says).
```
⚠️ `update-function-configuration --environment` REPLACES the whole map — pass all 16 vars or you drop env keys.

## Residual risk → Remedy A (later)
The header secret is plaintext in CF config (readable with `cloudfront:GetDistributionConfig`) — B blocks
anonymous callers, not an AWS-read-capable actor. The permanent fix (Remedy A: Function URL
`AuthType: NONE → AWS_IAM` + CloudFront OAC) needs prod CF in IaC (Tier 4) and then strips B. See
`project_prod_iac_security_convergence_briefing_2026-06-06` (D2 sequence: B → T4 → A → strip B).

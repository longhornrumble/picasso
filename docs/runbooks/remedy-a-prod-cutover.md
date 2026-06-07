# Runbook — Remedy A (#435) PRODUCTION cutover (Lambda@Edge IAM enforcement)

**Goal:** close the #435 public BSH-streaming bypass on **production** by enforcing
`authorization_type = AWS_IAM` on the prod BSH Function URL, with an origin-request
**Lambda@Edge SigV4 signer** on the prod CloudFront `/stream*` behavior signing every
request (including the POST body). This mirrors the approach **proven + enforced on
staging 2026-06-06**.

**Why not OAC:** CloudFront Origin Access Control **cannot sign POST request bodies**
→ `InvalidSignatureException` (proven on staging; see
[[reference_cloudfront_lambda_url_iam_auth_post]]). The Lambda@Edge signer computes a
full SigV4 incl. the body hash and signs with its execution-role creds.

**Account:** production `614056832592` — `--profile chris-admin`. Always
`unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN` before terraform.

**Belt:** the prod-IaC gated belt — `infra-deploy-prod.yml` (`workflow_dispatch`,
REQUIRED `-target` input, `Production` approval gate). The agent CANNOT self-approve
the gate; the operator approves each apply.

---

## Pre-state (verify before starting)

```bash
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
# Prod BSH URL still NONE (guarded only by the Remedy B header):
aws lambda get-function-url-config --function-name Bedrock_Streaming_Handler --profile chris-admin --query AuthType --output text   # expect NONE
# Prod CF /stream* has no L@E yet:
aws cloudfront get-distribution --id E3G0LSWB1AQ9LP --profile chris-admin \
  --query 'Distribution.DistributionConfig.CacheBehaviors.Items[?PathPattern==`/stream*`].LambdaFunctionAssociations.Quantity' --output text   # expect 0
```

The prod BSH function (Tier 2) and prod CF distribution (Tier 4) are already under
Terraform — Phase 1 only **creates** the signer and **adds** a behavior association;
**no new imports** are required.

---

## Phase 1 — land the signer + association, AuthType stays NONE (INERT)

**Diff:** new `module.lambda_edge_bsh_signer_prod` (L@E function + role +
`lambda:InvokeFunctionUrl` grant on prod BSH) + a `lambda_function_association` on the
prod CF `/stream*` behavior + a staged `streaming_function_url_auth_type` var on
`bsh-function-prod` (default **NONE**, NOT set at the call site = inert).

**Why inert:** with AuthType still NONE, the Function URL accepts unsigned requests, so
the signer's SigV4 headers are simply ignored. Nothing changes at runtime. (Proven on
staging: NONE = inert.)

**Gated apply (operator dispatches `infra-deploy-prod.yml`, approves `Production`):**

```
-target=module.lambda_edge_bsh_signer_prod -target=module.cloudfront_streaming_prod
```

Terraform orders these correctly within one apply (the CF assoc depends on the signer's
`qualified_arn`). Expected plan: **create** the signer's 4-5 resources; **update** the
CF distribution (1 behavior gains a `lambda_function_association`). The
`lifecycle.ignore_changes=[origin]` on the CF dist keeps the live `x-picasso-cf-origin`
header untouched — the L@E assoc is on the BEHAVIOR, not the origin, so it applies cleanly.

> ⚠️ **TARGET BOTH MODULES — do NOT target only `module.cloudfront_streaming_prod`.**
> `-target=module.cloudfront_streaming_prod` alone pulls only the signer resources in
> CloudFront's *dependency closure* (the Lambda function + its role) — it **silently
> MISSES** `aws_iam_role_policy.invoke_bsh_url` (the `lambda:InvokeFunctionUrl` grant)
> and the `AWSLambdaBasicExecutionRole` attachment, because the CF distribution does
> not depend on them. The result is a signer with NO authorization to invoke the URL —
> which would 403 ALL chat the moment Phase 2 flips to AWS_IAM. (This happened on the
> 2026-06-06 prod cutover; caught by the mandatory IAM check below and fixed with a
> corrective `-target=module.lambda_edge_bsh_signer_prod` apply.) If the belt only
> accepts ONE `-target` value, run TWO applies: **signer module first**, then the CF
> module.

**Post-Phase-1 verification (ALL are blocking gates):**

```bash
# 1) MANDATORY — the signer role MUST carry BOTH IAM policies (the dependency-closure
#    footgun above silently omits them). If either is missing, the cutover is INCOMPLETE
#    — run `-target=module.lambda_edge_bsh_signer_prod` before proceeding.
aws iam list-role-policies --role-name picasso-bsh-edge-signer-role --profile chris-admin            # MUST include: InvokeBshFunctionUrl
aws iam list-attached-role-policies --role-name picasso-bsh-edge-signer-role \
  --profile chris-admin --query 'AttachedPolicies[].PolicyName' --output text                        # MUST include: AWSLambdaBasicExecutionRole

# 2) /stream* carries the L@E assoc:
aws cloudfront get-distribution --id E3G0LSWB1AQ9LP --profile chris-admin \
  --query 'Distribution.DistributionConfig.CacheBehaviors.Items[?PathPattern==`/stream*`].LambdaFunctionAssociations.Items[0].LambdaFunctionARN' --output text

# 3) BLOCKING — wait for CloudFront to fully propagate the L@E assoc to every edge POP.
#    Flipping AuthType before this completes 403s requests served by stale POPs.
until [ "$(aws cloudfront get-distribution --id E3G0LSWB1AQ9LP --profile chris-admin --query 'Distribution.Status' --output text)" = "Deployed" ]; do echo "CF still deploying..."; sleep 30; done

# 4) Chat still works (AuthType NONE, signer inert):
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST https://chat.myrecruiter.ai/stream \
  -H 'Content-Type: application/json' -d '{"tenant_hash":"<a-real-prod-tenant-hash>","user_input":"hi"}'   # expect 200
```

---

## Phase 1.5 — controlled flip test (operator-gated, reversible, ~30s) [RECOMMENDED]

Before the real Phase-2 IaC flip, prove the **deployed prod L@E actually signs** with a
reversible CLI flip. This is the staging-proven de-risk (flip → curl → flip back); it is
**not** an ad-hoc enforcement change — it flips back immediately.

```bash
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
# 1) Flip to AWS_IAM:
aws lambda update-function-url-config --function-name Bedrock_Streaming_Handler \
  --auth-type AWS_IAM --profile chris-admin --query AuthType --output text
# 2) CF-signed path must still 200 (the L@E is signing):
curl -s -o /dev/null -w "CF-signed: HTTP %{http_code}  ttfb=%{time_starttransfer}s\n" \
  -X POST https://chat.myrecruiter.ai/stream -H 'Content-Type: application/json' \
  -d '{"tenant_hash":"<a-real-prod-tenant-hash>","user_input":"hi"}'   # expect 200 + SSE
# 3) Direct unsigned must 403:
curl -s -o /dev/null -w "direct: HTTP %{http_code}\n" -X POST \
  https://xqc4wnxwia2nytjkbw6xasjd6q0jckgb.lambda-url.us-east-1.on.aws/ \
  -H 'Content-Type: application/json' -d '{"tenant_hash":"x","user_input":"hi"}'   # expect 403
# 4) FLIP BACK to NONE (leave Phase 2 to do the durable IaC flip):
aws lambda update-function-url-config --function-name Bedrock_Streaming_Handler \
  --auth-type NONE --profile chris-admin --query AuthType --output text
```

If step 2 returns anything but 200, **the signer is not working** — leave AuthType at
NONE, do NOT proceed to Phase 2, and debug the L@E (check the signer's CloudWatch logs
in the nearest edge region, e.g. `us-east-1` `/aws/lambda/us-east-1.picasso-bsh-edge-signer`).

---

## Phase 2 — flip the IaC var to AWS_IAM (durable enforcement)

**Diff:** one line — set `streaming_function_url_auth_type = "AWS_IAM"` on the
`module.bsh_function_prod` call site in `infra/main.tf`.

**Gated apply:**

```
-target=module.bsh_function_prod
```

Expected plan: **update** `aws_lambda_function_url.this` (`authorization_type` NONE →
AWS_IAM). The flip is instant on the Function URL.

> **Custody note:** if the Phase 1.5 controlled flip left live = AWS_IAM and you did not
> revert it to NONE, the Phase 2 apply log may show `0 changed` (live already matched).
> Confirm the apply log shows `authorization_type "NONE" -> "AWS_IAM"` and `1 changed`
> so you know **Terraform** performed the enforcement (not a leftover CLI flip). If it
> shows `0 changed`, verify state: `terraform state show 'module.bsh_function_prod[0].aws_lambda_function_url.this' | grep authorization_type` must read `AWS_IAM`.

**Post-Phase-2 verification (the #435 closure proof on prod):**

```bash
aws lambda get-function-url-config --function-name Bedrock_Streaming_Handler --profile chris-admin --query AuthType --output text   # AWS_IAM
curl -s -o /dev/null -w "CF-signed: HTTP %{http_code}\n" -X POST https://chat.myrecruiter.ai/stream \
  -H 'Content-Type: application/json' -d '{"tenant_hash":"<real>","user_input":"hi"}'   # 200 + SSE
curl -s -o /dev/null -w "direct: HTTP %{http_code}\n" -X POST \
  https://xqc4wnxwia2nytjkbw6xasjd6q0jckgb.lambda-url.us-east-1.on.aws/ \
  -H 'Content-Type: application/json' -d '{"tenant_hash":"x","user_input":"hi"}'   # 403
```

---

## Rollback

- **Fast (CLI, emergency):** `aws lambda update-function-url-config --function-name
  Bedrock_Streaming_Handler --auth-type NONE --profile chris-admin`. Instant. The Remedy
  B header still guards the URL → no exposure. (The next gated apply would re-assert the
  var, so follow with the durable rollback.)
- **Durable (PR):** set `streaming_function_url_auth_type = "NONE"` (or remove the call-
  site line) + gated `-target=module.bsh_function_prod` apply.

The signer + association are harmless when AuthType is NONE (inert), so they can stay
during a rollback.

---

## After prod A is proven — strip-B (separate change, later)

Once prod Remedy A is enforced and soaked, remove the now-redundant Remedy B header
defense-in-depth on BOTH staging and prod: delete the `x-picasso-cf-origin` injection,
set `REQUIRE_CF_ORIGIN_HEADER=false` then remove the env/secret/grant, and (prod) narrow
the Tier-4 `lifecycle.ignore_changes=[origin]`. Do NOT strip-B until prod A has soaked —
the header is the rollback safety net.

## Landmines (from the staging proof)

- **Do NOT flip AuthType before the signer + assoc are live + CF `Status: Deployed`.**
  Flipping early 403s all chat (OAC Phase-2 #452 did this on staging → reverted #454).
- **Lambda@Edge has NO env vars you set** — creds come from the runtime; the role's
  `lambda:InvokeFunctionUrl` grant is what authorizes the signed call.
- **Origin-request L@E does NOT break SSE streaming** (only MS Smooth Streaming is
  restricted) — proven on staging (first-byte ≪ total).
- **L@E logs land in the edge region**, named `/aws/lambda/<region>.<function-name>`.

See [[reference_cloudfront_lambda_url_iam_auth_post]] and
[[project_session_handoff_2026-06-06_remedy-a-staging-proven]].

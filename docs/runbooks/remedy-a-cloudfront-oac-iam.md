# Remedy A (#435 root fix) — CloudFront OAC + Function URL `AWS_IAM`

**Goal:** make the #435 streaming bypass *structurally* impossible. Flip the BSH Function URL
`authorization_type: NONE → AWS_IAM` and have CloudFront SigV4-sign every request via a `lambda`-type
Origin Access Control. Then the public Function URL rejects all unsigned requests at the IAM layer —
Remedy B's header check becomes redundant and is removed (strip-B).

**Sequence:** Remedy B ✅ → Tier 4 (CF in IaC) ✅ → **Remedy A** → strip-B.
**Staging proves the mechanism before the prod cutover** (no feature flag = hard cutover; prove first).

## The three coupled pieces (per environment)
1. `aws_cloudfront_origin_access_control` — `origin_type=lambda`, `signing_behavior=always`, `signing_protocol=sigv4`.
2. Streaming origin: `origin_access_control_id = <oac>` (CloudFront signs requests to the Function URL).
3. BSH Function URL: `authorization_type = AWS_IAM` + `aws_lambda_permission`
   (`lambda:InvokeFunctionUrl`, principal `cloudfront.amazonaws.com`, `source_arn=<dist ARN>`, `function_url_auth_type=AWS_IAM`).

## Why it's a STAGED flip (the no-outage rule)
CloudFront distribution changes take **minutes** to deploy/propagate. If `authorization_type` flips to
`AWS_IAM` *before* CloudFront has finished propagating the OAC signing, live CF sends **unsigned**
requests to an IAM-enforcing URL → **403s all chat** for the propagation window. So:

- **Phase 1** — apply OAC + attach + invoke-grant **while `authorization_type` stays `NONE`**
  (`streaming_function_url_auth_type` default). CF starts signing; the URL ignores the signature
  (NONE); Remedy B header still enforced → **zero behavior change**. Wait for CF `Deployed`.
- **Phase 2** — flip `streaming_function_url_auth_type = "AWS_IAM"` (1-line) → apply → enforcement on.
  Unsigned direct hits → 403 at IAM; CF's already-signed requests pass.

**Rollback (instant):** set `streaming_function_url_auth_type` back to `"NONE"`. The Remedy B header is
still the safety net until strip-B, so a rollback is always safe.

## Two gotchas staging proves
1. **`Authorization` header conflict** — OAC injects a SigV4 `Authorization` header; `/stream` uses the
   `AllViewerExceptHostHeader` ORP. Public widget viewers don't send `Authorization`, so it's clean —
   but Phase-2 staging streaming proves it end-to-end.
2. **Prod-only — the Tier 4 `ignore_changes`** — prod's `cloudfront-streaming-prod` used
   `ignore_changes=[origin]` + omitted the header. Attaching the OAC requires **removing** that ignore,
   which forces modeling the streaming origin's header (sensitive var from a new prod GitHub secret) or
   the apply strips it → 403. Staging has no such issue (it already models the header via var).

---

## STAGING proof

### Phase 1 (this PR) — OAC + attach + inert grant, AuthType NONE
Merge → the staging belt applies. Expected: `2 to add` (OAC + lambda permission) + `1 to change`
(distribution origin gets the OAC). **No `authorization_type` change.**

Verify (no behavior change):
```bash
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
export AWS_PROFILE=myrecruiter-staging
aws cloudfront get-distribution --id E3G30AUOEJTB36 --query 'Distribution.Status'   # wait for Deployed
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://staging.chat.myrecruiter.ai/stream \
  -H 'content-type: application/json' -d '{"tenant_hash":"MYR384719","user_input":"hi"}'   # still 200 (NONE; header injected)
```

### Phase 2 (follow-on 1-line PR) — flip to AWS_IAM
Set `streaming_function_url_auth_type = "AWS_IAM"` for the bedrock module (root `main.tf`), merge → apply.
Verify enforcement:
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://staging.chat.myrecruiter.ai/stream \
  -H 'content-type: application/json' -d '{"tenant_hash":"MYR384719","user_input":"hi"}'   # 200 (CF signs)
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://chm3ioesaxyrgsaeo3v763dmw40qaswu.lambda-url.us-east-1.on.aws/ \
  -H 'content-type: application/json' -d '{"tenant_hash":"PROBE","user_input":"x"}'         # 403 (unsigned, IAM)
```
If staging streaming 403s after the flip → roll back (`= "NONE"`), investigate the Authorization-header
gotcha / OAC propagation, re-try.

---

## PROD cutover (after staging proven)
Mirror, in `cloudfront-streaming-prod` + `bsh-function-prod`, with the extra Tier-4 step:
1. **CF module**: add the lambda OAC + set it on the streaming origin + **remove `ignore_changes=[origin]`**
   AND model the streaming `custom_header` (sensitive var from a new prod `production`-env GitHub secret)
   so the apply doesn't strip the live header. Gated `-target` apply. Wait `Deployed`.
2. **BSH module**: add the invoke grant + `authorization_type` staged var (default NONE). Gated apply.
3. **Flip** the prod auth-type var → AWS_IAM. Gated apply. Verify (chat 200 / direct 403).
4. **strip-B**: remove the header from the prod CF module + retire the Remedy B env/grant/secret +
   the CF custom header. Gated applies.

Every prod step is `-target`-scoped + `Production`-gated; rollback = auth-type var back to NONE.

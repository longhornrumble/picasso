# CloudFront — Forward Origin Header to Lambda Origins

**Status:** INVESTIGATED — root cause identified, fix pending user authorization for shared API Gateway change.
**Surfaced:** 2026-05-02 during P0a Phase 1 staging deploy.
**Investigated:** 2026-05-03 on branch fix/cloudfront-origin-header-forwarding.

## Problem

All responses from the Picasso API return `Access-Control-Allow-Origin: *` regardless of the requesting origin. The Lambda's CORS allowlist logic (`add_cors_headers()` in `lambda_function.py`) never takes effect.

**Original hypothesis (incorrect):** CloudFront was not forwarding the `Origin` header.

**Actual root cause (confirmed 2026-05-03):** The API Gateway HTTP API `kgvc8xnewf` ("picasso") has `CorsConfiguration.AllowOrigins: ["*"]`. When API Gateway has a CORS configuration, it adds/overwrites `Access-Control-Allow-Origin` on every response using its own policy — overriding whatever the Lambda function returns. The Lambda's carefully-computed specific origin is silently replaced with `*` at the API Gateway layer.

**Evidence (2026-05-03 investigation):**
- CloudWatch log for invocation `61dd1a45-0e6b-4660-a481-8f6e0ce28cb9` shows `"origin": "https://staging.chat.myrecruiter.ai"` was present in the Lambda event headers — CloudFront WAS forwarding it correctly.
- The same log shows `CORS: Allowing specific origin https://staging.chat.myrecruiter.ai` — the Lambda DID set the correct header.
- But the curl response still showed `access-control-allow-origin: *` — API Gateway overwrote it.

## Impact

- **Strict CORS allowlist enforcement is structurally bypassed.** All responses get `Access-Control-Allow-Origin: *`, regardless of which domain the request actually came from. Browser CORS still prevents cross-origin attack via cookie credentials, but the server-side allowlist is decorative.
- **The recently-fixed `validate_cors_origin` function** (PR #36 in lambda repo) is correct in code but never gets exercised on real CloudFront traffic — the Origin header it relies on is never present.
- **Tenant-specific CORS extensions** (`config.cors.allowed_origins`) cannot be applied because the validator never sees the request's Origin.

## Fix

**CloudFront is NOT the fix target.** The Origin Request Policy `a33e0165` ("Picasso-Origin-Request") already includes `Origin` in the whitelist on both `/Master_Function*` behaviors. The `/stream*` behaviors use `Managed-AllViewerExceptHostHeader` which forwards all headers. CloudFront is working correctly.

**The fix requires updating three resources:**

### 1. API Gateway `kgvc8xnewf` CorsConfiguration (SHARED — affects both staging and prod)

```bash
aws apigatewayv2 update-api --api-id kgvc8xnewf --profile chris-admin \
  --cors-configuration 'AllowCredentials=false,AllowHeaders=x-api-key,AllowHeaders=content-type,AllowHeaders=authorization,AllowMethods=GET,AllowMethods=POST,AllowMethods=OPTIONS,AllowMethods=PUT,AllowMethods=DELETE,AllowOrigins=https://chat.myrecruiter.ai,AllowOrigins=https://staging.chat.myrecruiter.ai,AllowOrigins=http://localhost:8000,AllowOrigins=http://localhost:5173,AllowOrigins=http://localhost:3000,ExposeHeaders=content-type,MaxAge=0'
```

**WARNING:** This API Gateway is shared between staging (`/primary/staging`) and production (`/primary`). There is no staging-only API Gateway. The change takes effect for both environments simultaneously.

### 2. Bedrock_Streaming_Handler_Staging Function URL CORS

```bash
aws lambda update-function-url-config --function-name Bedrock_Streaming_Handler_Staging \
  --profile chris-admin \
  --cors 'AllowCredentials=false,AllowHeaders=*,AllowMethods=*,AllowOrigins=https://staging.chat.myrecruiter.ai,AllowOrigins=https://chat.myrecruiter.ai,AllowOrigins=http://localhost:8000,AllowOrigins=http://localhost:5173,AllowOrigins=http://localhost:3000'
```

### 3. Bedrock_Streaming_Handler (production) Function URL CORS

```bash
aws lambda update-function-url-config --function-name Bedrock_Streaming_Handler \
  --profile chris-admin \
  --cors 'AllowCredentials=false,AllowHeaders=*,AllowMethods=*,AllowOrigins=https://chat.myrecruiter.ai,AllowOrigins=https://staging.chat.myrecruiter.ai,AllowOrigins=http://localhost:8000,AllowOrigins=http://localhost:5173,AllowOrigins=http://localhost:3000,MaxAge=300'
```

## Resources affected

- API Gateway `kgvc8xnewf` ("picasso") — `CorsConfiguration.AllowOrigins` — SHARED between staging and production
- Lambda Function URL: `Bedrock_Streaming_Handler_Staging` — `/stream*` on staging CloudFront
- Lambda Function URL: `Bedrock_Streaming_Handler` — `/stream*` on production CloudFront
- CloudFront distributions: NO CHANGES NEEDED (already correct)

## Acceptance criteria

- [ ] After fix, a curl request to `https://staging.chat.myrecruiter.ai/Master_Function?action=get_config&t=my87674d777bf9` with `-H "Origin: https://staging.chat.myrecruiter.ai"` produces a Lambda log entry that includes the Origin header.
- [ ] The response's `Access-Control-Allow-Origin` header reflects the actual request origin (not wildcard).
- [ ] Same verification on production CloudFront with appropriate origin and tenant.

## Caching consideration

**Confirmed not an issue.** Both Lambda-backed behaviors (`/Master_Function*` and `/stream*`) use the `Managed-CachingDisabled` cache policy (DefaultTTL=0, MaxTTL=0, MinTTL=0). Forwarding Origin in the request policy has zero impact on cache behavior — there is nothing to fragment.

## Priority

Low. Browser CORS is still functioning (the wildcard fallback works for current clients). This is hardening / defense-in-depth, not an active vulnerability. Revisit when:
- A tenant requests a custom CORS allowlist (`config.cors.allowed_origins` becomes load-bearing)
- A security audit flags wildcard CORS as an issue
- Cross-tenant origin verification becomes operationally important (e.g., tenant A's widget shouldn't be able to make authenticated calls to tenant B's API even on the same CloudFront)

## Authorization checkpoint

Before executing the fix:
1. User must authorize the API Gateway `CorsConfiguration` change (shared infra — affects production paths)
2. Since there is no way to isolate staging, the change must be treated as a production change

The risk is low (additive allowlist change, no removal of working behavior), but the principle holds: shared infrastructure changes need explicit sign-off.

## References

- [PR #36 in lambda repo](https://github.com/longhornrumble/lambda/pull/36) — restored `validate_cors_origin` in Lambda code; this API Gateway fix is the missing other half
- 2026-05-02 P0a Phase 1 investigation transcript
- 2026-05-03 fix/cloudfront-origin-header-forwarding investigation (this session)

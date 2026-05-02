# CloudFront — Forward Origin Header to Lambda Origins

**Status:** DRAFT — placeholder for a future DevOps session.
**Surfaced:** 2026-05-02 during P0a Phase 1 staging deploy.

## Problem

The CloudFront distribution `E1CGYA1AJ9OYL0` (`staging.chat.myrecruiter.ai`) — and presumably its production sibling `E3G0LSWB1AQ9LP` (`chat.myrecruiter.ai`) — does NOT forward the browser's `Origin` request header to the Lambda origins (API Gateway + Function URL).

**Evidence:** during the 2026-05-02 P0a Phase 1 verification, a curl request explicitly setting `Origin: https://staging.chat.myrecruiter.ai` resulted in the Lambda's CloudWatch logs showing only the synthetic `host: kgvc8xnewf.execute-api.us-east-1.amazonaws.com` and `via: ... CloudFront ...` headers — no Origin header. The Lambda's CORS allowlist logic (`add_cors_headers()` in `lambda_function.py`) consequently can't differentiate origins and falls back to wildcard `*`.

## Impact

- **Strict CORS allowlist enforcement is structurally bypassed.** All responses get `Access-Control-Allow-Origin: *`, regardless of which domain the request actually came from. Browser CORS still prevents cross-origin attack via cookie credentials, but the server-side allowlist is decorative.
- **The recently-fixed `validate_cors_origin` function** (PR #36 in lambda repo) is correct in code but never gets exercised on real CloudFront traffic — the Origin header it relies on is never present.
- **Tenant-specific CORS extensions** (`config.cors.allowed_origins`) cannot be applied because the validator never sees the request's Origin.

## Fix

Update each CloudFront distribution's cache behaviors to include `Origin` in the **Origin Request Policy** (or the legacy `WhitelistedHeaders`). For each behavior whose target is a Lambda origin (API Gateway, Function URL):

```bash
# Example: identify the Origin Request Policy attached to the /Master_Function* behavior
aws cloudfront get-distribution-config --id E1CGYA1AJ9OYL0 --profile chris-admin \
  --query 'DistributionConfig.CacheBehaviors.Items[?PathPattern==`/Master_Function*`]'

# Either attach an Origin Request Policy that forwards the Origin header (recommended),
# or update the legacy ForwardedValues.Headers list.
```

## Distributions affected

- `E1CGYA1AJ9OYL0` — staging.chat.myrecruiter.ai (verified problem)
- `E3G0LSWB1AQ9LP` — chat.myrecruiter.ai (production — verify same issue)
- Possibly: `EJ0Y6ZUIUBSAT` (analytics dashboard production), `E2R9VHBON5PHMK` (analytics staging) — verify if they have similar issues

## Cache behaviors that need the fix

For each CloudFront distribution above, audit:
- `/Master_Function*` → API Gateway origin
- `/stream*` → Lambda Function URL origin
- (Any other behaviors targeting Lambda origins)

S3-backed behaviors (e.g., `/tenants/*`, `/collateral/*`) do not need this — S3 doesn't process Origin.

## Acceptance criteria

- [ ] After fix, a curl request to `https://staging.chat.myrecruiter.ai/Master_Function?action=get_config&t=my87674d777bf9` with `-H "Origin: https://staging.chat.myrecruiter.ai"` produces a Lambda log entry that includes the Origin header.
- [ ] The response's `Access-Control-Allow-Origin` header reflects the actual request origin (not wildcard).
- [ ] Same verification on production CloudFront with appropriate origin and tenant.

## Caching consideration

Forwarding `Origin` adds it to the cache key, which can fragment the cache by origin. For Lambda-backed dynamic responses that don't cache anyway (`Cache-Control: no-cache`), this has no impact. Verify the cache TTLs on the affected behaviors are 0 (dynamic) before flipping the policy — if any behavior caches at all, evaluate whether per-origin cache entries are acceptable.

## Priority

Low. Browser CORS is still functioning (the wildcard fallback works for current clients). This is hardening / defense-in-depth, not an active vulnerability. Revisit when:
- A tenant requests a custom CORS allowlist (`config.cors.allowed_origins` becomes load-bearing)
- A security audit flags wildcard CORS as an issue
- Cross-tenant origin verification becomes operationally important (e.g., tenant A's widget shouldn't be able to make authenticated calls to tenant B's API even on the same CloudFront)

## References

- [PR #36 in lambda repo](https://github.com/longhornrumble/lambda/pull/36) — restored `validate_cors_origin` in Lambda code; this CloudFront fix is the missing other half
- 2026-05-02 P0a Phase 1 investigation transcript

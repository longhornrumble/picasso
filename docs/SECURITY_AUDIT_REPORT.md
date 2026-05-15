# Picasso Platform Security Audit Report

**Date:** 2026-04-14
**Scope:** Picasso Widget, Config Builder, Analytics Portal, Backend Core
**Type:** Read-only code review (no penetration testing, no production access)
**Agents:** 4 parallel Security-Reviewer agents

---

## Executive Summary

**49 total findings** across 4 codebases: **5 CRITICAL, 16 HIGH, 16 MEDIUM, 8 LOW, 4 INFO**

The platform has solid foundations in places — DOMPurify on the primary rendering path, JWT signing via Secrets Manager, server-side tenant isolation checks in the Analytics API, and thoughtful auth scaffolding in the Config Manager Lambda. However, several of those controls are either **disabled** (`ENFORCE_AUTH = false`), **bypassed** (streaming innerHTML skips DOMPurify, base64 token fallback skips JWT), or **incomplete** (Clerk RS256 signature not verified, CORS reflects arbitrary origins on OPTIONS).

The most dangerous finding is a **multi-hop attack chain** that requires zero authentication:

> **Config Builder zero-auth (CONFIG-001)** → write poisoned tenant config with `merge=false` (CONFIG-009) → `bedrock_instructions` flow unsanitized into Bedrock prompt (CORE-003) → AI exfiltrates system prompts or acts maliciously for all end users of that tenant

This chain is live in production today.

---

## Attack Chain Map

```
CONFIG-001 (zero auth on Config Builder Lambda)
  ├── CONFIG-003 (no tenantId validation) → read/write any tenant config
  ├── CONFIG-009 (merge=false bypasses validation) → full config replacement
  │     ├── CORE-003 (unsanitized bedrock_instructions) → prompt injection
  │     ├── WIDGET-002 (unsanitized calloutText) → stored XSS in widget
  │     └── WIDGET-005 (config path override) → config URL hijacking
  └── CONFIG-005 (Lambda URL in JS bundle) → attacker discovers endpoint

PORTAL-002 (Clerk JWT signature not verified)
  ├── PORTAL-004 (multi-org = super_admin) → privilege escalation
  ├── PORTAL-001 (JWT in localStorage) → XSS exfiltration
  │     └── PORTAL-003 (srcDoc + allow-same-origin) → localStorage access
  └── PORTAL-010 (no iss/aud claims) → cross-Lambda token replay

CORE-004 (base64 token fallback)
  └── Bypasses JWT signature + blacklist entirely
        └── CORE-001 (blacklist fail-open) → revoked tokens accepted

WIDGET-001 (streaming innerHTML without DOMPurify)
  ├── WIDGET-004 (DOMPurify failure returns raw HTML) → fallback XSS
  └── WIDGET-003 (postMessage targetOrigin: '*') → data broadcast
```

---

## Consolidated Findings by Severity

### CRITICAL (5)

| ID | Codebase | Title |
|----|----------|-------|
| CONFIG-001 | Config Builder | Config Builder Lambda has zero authentication |
| CONFIG-002 | Config Builder | Deployed Picasso_Config_Manager has `ENFORCE_AUTH = false` |
| PORTAL-001 | Analytics Portal | JWT in localStorage — XSS to cross-tenant data access chain |
| PORTAL-002 | Analytics Portal | Clerk JWT RS256 signature not verified (only exp/iss/kid checked) |
| WIDGET-001 | Picasso Widget | Streaming path writes hand-rolled HTML to `innerHTML` without DOMPurify |

### HIGH (16)

| ID | Codebase | Title |
|----|----------|-------|
| CONFIG-003 | Config Builder | No tenantId validation on GET/PUT/DELETE routes |
| CONFIG-004 | Config Builder | Frontend hardcodes `role: 'super_admin'` for all Clerk users |
| CONFIG-005 | Config Builder | Lambda Function URL baked into production JS bundle |
| CONFIG-006 | Config Builder | `config_builder_token` never populated — auth headers silently absent |
| PORTAL-003 | Analytics Portal | `srcDoc` + `allow-same-origin` sandbox escape via localStorage |
| PORTAL-004 | Analytics Portal | `super_admin` role escalation via multi-org membership |
| PORTAL-005 | Analytics Portal | Signing key never rotated in warm Lambda container (`lru_cache`) |
| PORTAL-006 | Analytics Portal | Production JWT secret defaults to staging path |
| WIDGET-002 | Picasso Widget | `calloutText` from tenant config injected via `dangerouslySetInnerHTML` unsanitized |
| WIDGET-003 | Picasso Widget | `sendCommand`/`sendInitMessage` use `targetOrigin: '*'` permanently |
| WIDGET-004 | Picasso Widget | DOMPurify failure modes silently return raw unsanitized HTML |
| WIDGET-005 | Picasso Widget | `window.PICASSO_CONFIG_PATH` allows host-page config URL hijacking |
| CORE-001 | Backend Core | Blacklist fail-open: revoked tokens accepted during DynamoDB outage |
| CORE-002 | Backend Core | OPTIONS preflight reflects arbitrary origin without allowlist |
| CORE-003 | Backend Core | `bedrock_instructions`/`tone_prompt` flow unsanitized into Bedrock prompt |
| CORE-004 | Backend Core | Base64 token fallback bypasses JWT signature and blacklist checks |

### MEDIUM (16)

| ID | Codebase | Title |
|----|----------|-------|
| CONFIG-007 | Config Builder | Wildcard CORS with no environment distinction |
| CONFIG-008 | Config Builder | Local dev servers have no tenantId sanitization |
| CONFIG-009 | Config Builder | `merge=false` full-replacement bypasses all section validation |
| CONFIG-010 | Config Builder | Signing key secret name hardcoded to staging path |
| PORTAL-007 | Analytics Portal | Raw exception details leaked in 500 response body |
| PORTAL-008 | Analytics Portal | Lambda Function URL hardcoded in frontend source |
| PORTAL-009 | Analytics Portal | Token-in-URL in Bubble SSO path (Referer/history risk) |
| PORTAL-010 | Analytics Portal | Internal JWT has no `iss`/`aud` claim — replayable across Lambdas |
| WIDGET-006 | Picasso Widget | `mobileCompatibility.js` uses `innerHTML` with template literals |
| WIDGET-007 | Picasso Widget | iframe `sandbox` attribute deliberately removed |
| WIDGET-008 | Picasso Widget | `window.notifyParentEvent`/`analyticsState` writable by co-tenant scripts |
| WIDGET-009 | Picasso Widget | Tenant hash accepted from URL without `validateTenantHash()` |
| CORE-005 | Backend Core | Hardcoded AWS account ID and Lambda Function URL in source |
| CORE-006 | Backend Core | Stack trace leaked in preview endpoint 500 response |
| CORE-007 | Backend Core | `bedrock_instructions_override` accepted when env flag enabled |
| CORE-008 | Backend Core | In-Lambda blacklist cache persists revoked tokens for 5 min |

### LOW (8)

| ID | Codebase | Title |
|----|----------|-------|
| CONFIG-011 | Config Builder | Zod validation only on frontend — not applied on backend |
| CONFIG-012 | Config Builder | Raw error messages expose S3/DynamoDB details |
| PORTAL-011 | Analytics Portal | `_request_user_role` global state — concurrency risk |
| PORTAL-012 | Analytics Portal | Email validation regex trivially bypassable |
| WIDGET-010 | Picasso Widget | Dev debug commands exposed in staging builds |
| WIDGET-011 | Picasso Widget | Form PII persisted to sessionStorage in plaintext |
| CORE-009 | Backend Core | Tenant ID not regex-validated before S3 key construction |
| CORE-010 | Backend Core | Full request event logged at INFO level (may include tokens) |

### INFO (4)

| ID | Codebase | Title |
|----|----------|-------|
| CONFIG-013 | Config Builder | Tenant hash salt hardcoded in source (identifier, not secret) |
| PORTAL-013 | Analytics Portal | `VITE_BUBBLE_AUTH_URL` legacy SSO path partially active |
| WIDGET-012 | Picasso Widget | CSP applied via meta tag, not HTTP header |
| CORE-011 | Backend Core | NPM dependency CVE audit incomplete — requires manual run |

---

## Recommended Remediation Priority

### Immediate (This Week) — Stop the Bleeding — ✅ COMPLETE (2026-04-14)

| Priority | Finding | Action | Status |
|----------|---------|--------|--------|
| 1 | CONFIG-002 | Set `ENFORCE_AUTH = true` in Picasso_Config_Manager Lambda | ✅ Done |
| 2 | CONFIG-006 | Wire Clerk token into API client headers (so frontend works with auth on) | ✅ Done |
| 3 | CONFIG-001 | Retire `picasso-config-builder/lambda/` from production; point to Config_Manager | ✅ Done |
| 4 | WIDGET-004 | DOMPurify failure paths return `''` instead of raw HTML | ✅ Done |
| 5 | CORE-004 | Remove base64 token fallback in Master_Function | ✅ Done |
| 6 | WIDGET-001 | Add `DOMPurify.sanitize()` to streaming `writeAccumulated` before `innerHTML` | ✅ Done |

### Short-Term (Next 2 Weeks) — ✅ COMPLETE (2026-04-15)

| Priority | Finding | Action | Status |
|----------|---------|--------|--------|
| 7 | PORTAL-002 | Add `PyJWT[cryptography]` Lambda layer; verify RS256 signature | ✅ Done |
| 8 | PORTAL-004 | Remove multi-org → super_admin shortcut; use `publicMetadata.picasso_role` only | ✅ Done |
| 9 | CORE-003 | Sanitize `bedrock_instructions`/`tone_prompt` before prompt injection | ✅ Done |
| 10 | CORE-002 | Route OPTIONS through `add_cors_headers()` allowlist | ✅ Done |
| 11 | CONFIG-003 | Apply tenantId regex to all route handlers | ✅ Done |
| 12 | WIDGET-002 | Sanitize `calloutText` through DOMPurify before rendering | ✅ Done (Phase 1) |
| 13 | WIDGET-003 | Replace `targetOrigin: '*'` with computed iframe origin | ✅ Done |
| 14 | CORE-001 | Change blacklist fail-open to fail-closed (return 503) | ✅ Done |
| 15 | CONFIG-009 | Apply schema validation even when `merge=false` | ✅ Done |

### Medium-Term (Next Month) — OPEN

| Priority | Finding | Action | Status |
|----------|---------|--------|--------|
| 16 | PORTAL-001 | Move JWT to HttpOnly cookie or sessionStorage + short-lived tokens | Open |
| 17 | PORTAL-005/006 | TTL-based signing key cache; separate staging/production keys | Open |
| 18 | WIDGET-005 | Remove `PICASSO_CONFIG_PATH` override or restrict to dev builds | Open |
| 19 | WIDGET-007 | Restore iframe `sandbox` attribute with appropriate permissions | Open |
| 20 | PORTAL-003 | Remove `allow-same-origin` from notification preview iframe | Open |
| 21 | All | Run `npm audit` across all 3 frontends; remediate HIGH/CRITICAL CVEs | Open |
| 22 | All | Move Lambda URLs behind API Gateway with WAF; remove hardcoded URLs from bundles | Open |

---

## Methodology

- 4 Security-Reviewer agents ran in parallel, each scoped to one codebase
- Read-only audit — no files modified, no deployments, no production access
- Findings validated against source code with file paths and line numbers
- Cross-codebase attack chains identified via "Chains With" field in individual findings
- Tech lead review performed on audit plan before execution

## Out of Scope

- AWS IAM policy review (requires Console access)
- S3 bucket public access block audit (requires Console access)
- Network-level penetration testing
- Third-party dependency deep audit (npm audit was blocked by sandbox)
- Clerk Dashboard configuration review
- CloudFront security headers / WAF rules

---

## Addenda (post-audit findings)

### IAM-001 — Staging Bedrock handler shares execution role with prod Master_Function (HIGH)

**Filed:** 2026-05-03 — [lambda#44](https://github.com/longhornrumble/lambda/issues/44)
**Discovery context:** surfaced during Issue #5 (server-side analytics recording) deeper-research stream

`Bedrock_Streaming_Handler_Staging` (a publicly exposed, JWT-free staging Lambda Function URL) and `Master_Function` (a production Lambda) both run under `Master_Function-role-zyux77wq`. That shared role carries prod-class IAM policies: `DynamoDBProductionAccess`, `DynamoDBBlacklistAccess`, `picassoWrite`, `BillingEventsWrite`, `SES-SendEmail`, `AmazonBedrockFullAccess`, plus secrets-read for JWT signing keys.

Net effect: any input-handling bug in the staging handler reaches production DynamoDB tables and the production blacklist. The pre-existing forge-able `?action=analytics` route (`index.js:280-285`) compounds this — arbitrary callers can submit events without authentication.

Marked HIGH (not CRITICAL) because no active exploit is known and Bedrock handler input is constrained by prompt-shape, not by the role's broader perms. Remediation tracked in [lambda#44](https://github.com/longhornrumble/lambda/issues/44): split the staging handler onto a dedicated role.

**Operational note for anyone modifying `Master_Function-role-zyux77wq`:** changing this role affects BOTH the staging Bedrock handler and the production Master_Function lambda simultaneously. There is no way to staged-rollout a policy change on this role.

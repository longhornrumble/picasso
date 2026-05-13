# CORS Origin Discovery — 2026-05-13

**Purpose:** Enumerate every unique HTTP `Origin` header hitting Picasso chat infrastructure
over the last 7 days. Informs the per-tenant allowlist for CORS hardening (plan:
`~/.claude/plans/joyful-dreaming-trinket.md`, Phase D1).

**Status:** IN PROGRESS

---

## 1. Methodology

### 1.1 Time window

Last 7 days: 2026-05-06T00:00:00Z → 2026-05-13T23:59:59Z (CloudWatch Logs Insights
uses relative `-7d` window for portability).

### 1.2 AWS accounts and profiles

| Account | ID | Profile | Role |
|---|---|---|---|
| prod | 614056832592 | `chris-admin` | **READ-ONLY** — no state changes |
| staging | 525409062831 | `myrecruiter-staging` | Normal dev access |

### 1.3 Log groups queried (in order)

The prior agent established that searching for the word "origin" in Lambda logs surfaces
CloudFront-origin-header validation warnings (a different feature: `validate_cf_origin_header`)
rather than the HTTP `Origin` browser header. All queries below are crafted to avoid that trap.

| # | Log group | Account | Lambda | Expected traffic |
|---|---|---|---|---|
| LG-1 | `/aws/lambda/Master_Function_Staging` (prod account) | prod | `Master_Function` (legacy hand-managed) | Real customer traffic |
| LG-2 | `/aws/lambda/Bedrock_Streaming_Handler_Staging` (prod account) | prod | `Bedrock_Streaming_Handler` prod Lambda | Real customer streaming |
| LG-3 | `/aws/lambda/Master_Function_Staging` (staging account) | staging | `Master_Function_Staging` v1 | Dev/test only |
| LG-4 | `/aws/lambda/Bedrock_Streaming_Handler_Staging` (staging account) | staging | BSH staging twin | Dev/test only |

> Note: the prod account has two Lambda functions with similar names. The legacy prod function
> may log to a different group — check during query phase.

### 1.4 Queries used

**Q1 — CORS reflection log lines (Master_Function)**
```
fields @timestamp, @message
| filter @message like /CORS: (Allowing|Origin.*not in)/
| parse @message /(?:Allowing specific origin|Origin) (?<origin>https?:\/\/[^\s"',}\]]+)/
| stats count(*) as hits by origin
| sort hits desc
```

**Q2 — Raw event.headers.origin capture (Master_Function)**
```
fields @timestamp, @message
| filter @message like /"[Oo]rigin":\s*"https?/
| parse @message /"[Oo]rigin":\s*"(?<origin>https?:\/\/[^"]+)"/
| stats count(*) as hits by origin
| sort hits desc
```

**Q3 — API Gateway access logs (prod API GW kgvc8xnewf)**
Stage-level access logs, if enabled. Query depends on log format.

**Q4 — BSH Lambda URL access patterns (prod)**
Lambda Function URLs log via the standard Lambda log group; structured request context
may include the Origin header if BSH logs the full event.

### 1.5 Known tenants

| Tenant ID | Name | Expected embed domain(s) |
|---|---|---|
| ATL642715 | (TBD) | TBD |
| AUS123957 | Austin Angels | austinangels.org |
| FOS402334 | Foster Angels / Foster Village | TBD |
| MYR384719 | Test tenant | chat.myrecruiter.ai only |
| NAT001622 | (TBD) | TBD |

### 1.6 What is NOT queried

- `validate_cf_origin_header` log lines — those are CloudFront-custom-header validation, not
  browser CORS.
- Security probe rejections from internet scanners — filtered from findings.

---

## 2. Log volume check (Step 1)

Verified 2026-05-13. Volume = `count(*)` over the 7-day window.

| Log group | Account | Record count (7d) | Verdict |
|---|---|---|---|
| LG-1a `/aws/lambda/Master_Function_v2` | prod | **275,806** | PRIMARY — active prod log group (see §8.1) |
| LG-1b `/aws/lambda/Master_Function_Staging` | prod | 7,229 | secondary — prod-account `_Staging` Lambda |
| LG-1c `/aws/lambda/Master_Function` | prod | 12 | minimal — log-group routed elsewhere |
| LG-2a `/aws/lambda/Bedrock_Streaming_Handler_Staging` | prod | 773 | prod-account `_Staging`-suffixed BSH |
| LG-2b `/aws/lambda/Bedrock_Streaming_Handler` | prod | 6,480 | prod BSH (no suffix) |
| LG-3 `/aws/lambda/Master_Function_Staging` | staging | 39,561 | staging MFS |
| LG-4 `/aws/lambda/Bedrock_Streaming_Handler_Staging` | staging | 296 | staging BSH |

**Critical topology finding:** the prod `Master_Function` Lambda has `LoggingConfig.LogGroup =
/aws/lambda/Master_Function_v2`. The log group named `Master_Function_v2` is therefore the
**actual production log group**, despite the misleading `_v2` suffix and the absence of any
Lambda function named `Master_Function_v2`. All Master_Function CORS events from real customer
traffic land in LG-1a.

---

## 3. Unique Origin values per log group

*Results populated during query run.*

### LG-1: Master_Function_Staging (prod)

| Origin | Hits (7d) | Inferred tenant |
|---|---|---|
| — | — | — |

### LG-2: Bedrock_Streaming_Handler_Staging (prod)

| Origin | Hits (7d) | Inferred tenant |
|---|---|---|
| — | — | — |

### LG-3: Master_Function_Staging (staging)

| Origin | Hits (7d) | Inferred tenant |
|---|---|---|
| — | — | — |

### LG-4: Bedrock_Streaming_Handler_Staging (staging)

| Origin | Hits (7d) | Inferred tenant |
|---|---|---|
| — | — | — |

---

## 4. API Gateway access logs (prod kgvc8xnewf)

*Results populated during query run.*

---

## 5. Per-tenant canonical origin summary

*Populated after queries complete.*

| Tenant | Log-mined origins | Confidence |
|---|---|---|
| ATL642715 | — | — |
| AUS123957 | — | — |
| FOS402334 | — | — |
| MYR384719 | — | — |
| NAT001622 | — | — |

---

## 6. Unknown origins (operator triage)

*Any origin that does not match a known tenant domain.*

---

## 7. Recommended canonical allowlist

*Populated after Phase D2 cross-reference.*

---

## 8. Caveats and blockers

### 8.1 Prod-account Lambda topology (verified 2026-05-13)

The prod account (`614056832592`) has THREE relevant log groups for Master_Function, not one:

| Log group | Lambda exists? | Stored bytes | Last event | Notes |
|---|---|---|---|---|
| `/aws/lambda/Master_Function` | YES (active) | 853 | 2026-05-13 | The actual production Lambda. Code in `lambda-repo/`. |
| `/aws/lambda/Master_Function_Staging` | YES (active) | 625 KB | 2026-05-12 | Despite `_Staging` suffix, lives in prod account. Cleanup-phase test target. |
| `/aws/lambda/Master_Function_v2` | **NO** (deleted) | 22 MB | (historical) | Lambda function NOT FOUND. Log group retained from deleted function. |
| `/aws/lambda/Master_Function_Dev` | (unverified) | 0 | — | Empty, ignored. |
| `/aws/lambda/Master_Function_Streaming` | (unverified) | 0 | — | Empty, ignored. |

**Resolution of prior agent's `Master_Function_v2` claim:** the log group exists with 22 MB
of historical data, but the underlying Lambda function has been deleted (`ResourceNotFoundException`
on `get-function`). The 1793 origin hits the prior agent reported likely came from this group's
historical retention. We will query it for completeness but treat its origins as **historical
production traffic** (still useful for allowlist derivation).

**Adjusted LG-1 plan:** query both `/aws/lambda/Master_Function` (current prod) AND
`/aws/lambda/Master_Function_v2` (historical prod). The original `/aws/lambda/Master_Function_Staging`
in the prod account is treated as LG-1c (lower priority — used for cleanup-phase tests, not real
customer traffic).

### 8.2 BSH log groups (verified 2026-05-13)

Prod account has two BSH log groups, both active:

| Log group | Stored bytes | Last event |
|---|---|---|
| `/aws/lambda/Bedrock_Streaming_Handler` | 500 KB | (verified active) |
| `/aws/lambda/Bedrock_Streaming_Handler_Staging` | 11.8 MB | 2026-05-13 |

The `_Staging`-suffixed group in the prod account is the high-volume one — that matches the
"despite `_Staging` suffix, this is the prod Lambda" pattern from MFS. Will query both.

---

## 9. Methodology appendix: avoiding the CF-origin-header trap

The Lambda function `Master_Function_Staging/lambda_function.py` implements
`validate_cf_origin_header()` which checks a **custom CloudFront header** (a secret value
forwarded by CF to prevent direct Lambda-URL access bypass). Log lines from this function
contain the word "origin" and look superficially like CORS events. The prior agent's attempt
was derailed by this.

**Key distinguishers:**
- CF-origin-header log: `"CF origin header validation"`, `"validate_cf_origin_header"`,
  `"CF origin mismatch"`, `"Direct Lambda URL access rejected"`.
- HTTP CORS log: `"CORS: Allowing specific origin"`, `"CORS: Origin ... not in allowed list"`,
  or `event.headers.origin` / `event.headers.Origin`.

All queries in this doc filter on the CORS-specific patterns only.

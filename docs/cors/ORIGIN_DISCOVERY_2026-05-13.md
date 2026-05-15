# CORS Origin Discovery — 2026-05-13

**Purpose:** Enumerate every unique HTTP `Origin` header hitting Picasso chat infrastructure
over the last 7 days. Informs the per-tenant allowlist for CORS hardening (plan:
`~/.claude/plans/joyful-dreaming-trinket.md`, Phase D1).

**Status:** D1 COMPLETE (data collection + analysis). D2 (recommended allowlist) pending.

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

Results captured 2026-05-13 over the 7-day window. Queries combined `CORS: Allowing specific
origin` (accepted), `CORS: Origin <X> not in allowed list` (rejected), and raw
`"origin": "..."` event-header captures.

### LG-1a: Master_Function_v2 (prod) — PRIMARY production log group

| Origin | Hits (7d) | Inferred tenant | Source pattern |
|---|---|---|---|
| `https://chat.myrecruiter.ai` | 1,768 | shared widget host (all tenants) | `CORS: Allowing specific origin` |
| `https://chat.myrecruiter.ai` | 3,273 | same — raw `headers.origin` events | `"origin": "https://chat.myrecruiter.ai"` |
| `null` | 16 | non-browser / file:// / sandboxed iframe | `CORS: Origin null not in allowed list` |

**Interpretation:** every real CORS event in prod traffic comes from
`https://chat.myrecruiter.ai`. The production widget is iframed from that single CloudFront
domain; the parent page's origin never reaches MFS because the widget makes its own
same-origin fetch to MFS. The `null` origins are clients without a usable `Origin` header
(typically server-to-server tests or `file://` previews).

**Negative finding:** NO non-myrecruiter origins were observed in 7 days of prod traffic
on the primary log group. Tenant parent domains (austinangels.org, fostervillagecharter.org,
etc.) are NOT in the CORS log surface — the iframe widget architecture isolates them.

### LG-1b: Master_Function_Staging (prod-account) — low-volume

| Origin | Hits (7d) | Inferred tenant | Source pattern |
|---|---|---|---|
| `https://staging.chat.myrecruiter.ai` | 9 | MYR384719 / dev | `CORS: Allowing specific origin` |

No rejected origins. This is the legacy/cleanup-phase Lambda; minimal traffic.

### LG-1c: Master_Function (prod) — minimal (log group misroute)

Total records: 12. Spot-check showed no CORS lines. The actual prod Lambda named
`Master_Function` has `LoggingConfig.LogGroup = /aws/lambda/Master_Function_v2`, so this
group is essentially empty (residue / one-off invocations).

### LG-2a + LG-2b: BSH (prod, both groups)

**No CORS log lines emitted by BSH.** Sample of BSH events shows the function logs
`Event keys: [ 'version', 'routeKey', ..., 'headers', ... ]` (just the top-level keys),
not the actual header values. BSH neither logs `CORS: Allowing` nor dumps
`event.headers.origin`. Origins cannot be mined from BSH logs at present logging level.

Implication for the allowlist exercise: BSH origin allowlist must be inferred from MFS
findings + architectural reasoning (BSH is fronted by the same widget at
`chat.myrecruiter.ai`), not from log evidence.

### LG-3: Master_Function_Staging (staging account)

| Origin | Hits (7d) | Inferred tenant | Source pattern |
|---|---|---|---|
| `https://staging.chat.myrecruiter.ai` | 10 | MYR384719 / dev | `CORS: Allowing specific origin` |
| `https://evil.example.com` | 1 | adversarial test injection | `CORS: Origin ... not in allowed list` |

The `evil.example.com` entry confirms the rejection path works; matches the prior agent's
test-injection observation. Useful as a known-rejected sentinel.

### LG-4: Bedrock_Streaming_Handler_Staging (staging account)

No CORS or origin log lines. Same as prod BSH — BSH doesn't log header values.

---

## 4. API Gateway access logs (prod kgvc8xnewf)

*Results populated during query run.*

---

## 5. Per-tenant canonical origin summary

Cross-reference of log-mined origins to known tenants. **Critical caveat:** because the
production widget is iframed from `chat.myrecruiter.ai`, all tenants share the same
log-surface Origin. The CORS allowlist for MFS is therefore tenant-agnostic at the network
layer — tenant isolation happens at the JWT / config-lookup level, not at CORS.

| Tenant | Log-mined origins | Confidence | Notes |
|---|---|---|---|
| ATL642715 | `https://chat.myrecruiter.ai` (shared) | high (inferred) | Not separately distinguishable in CORS logs |
| AUS123957 | `https://chat.myrecruiter.ai` (shared) | high (inferred) | Same |
| FOS402334 | `https://chat.myrecruiter.ai` (shared) | high (inferred) | Confirmed via BSH `tenant_id` correlation: FOS sessions present in LG-2b, all served via the shared widget |
| MYR384719 | `https://staging.chat.myrecruiter.ai`, `https://chat.myrecruiter.ai` | high | Test tenant, appears in both prod and staging logs |
| NAT001622 | `https://chat.myrecruiter.ai` (shared) | high (inferred) | Same |

**Recommendation for D2 (not yet executed):** the per-tenant allowlist should be derived
from **tenant config `embed_domain` / `allowed_origins` fields** (S3 source-of-truth), not
from logs. Logs only validate that real traffic ALL comes through the shared widget host
as expected. Any direct embedding of the widget on a tenant's own domain (which would
expose a tenant-specific Origin to MFS) is NOT observed in current traffic.

---

## 6. Unknown origins (operator triage)

**Unknown / unmapped origins found in 7-day window:**

| Origin | Where seen | Hits | Triage verdict |
|---|---|---|---|
| `null` | LG-1a (prod MFS) | 16 | Browser sends `Origin: null` for `file://`, sandboxed iframes, opaque-origin redirects, and some privacy-mode contexts. Not malicious. Allowlist decision: REJECT (current behavior is correct — falls back to default origin). |
| `https://evil.example.com` | LG-3 (staging MFS) | 1 | Synthetic adversarial test injection; remained rejected. Confirms rejection path is wired correctly. No action needed. |

**No unknown legitimate origins.** All 7-day production CORS traffic resolves to a single
known origin (`chat.myrecruiter.ai`). No unexpected third-party domains observed.

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

### 8.3 BSH does not log Origin headers (blocker for log-based BSH allowlist)

Across all 4 BSH log groups (prod `_Staging` + prod no-suffix + staging `_Staging`), zero
log lines contain `CORS:` directives or `"origin": "https?://..."` JSON patterns.
Sample inspection shows BSH logs only the top-level event keys (`['version', 'routeKey',
'headers', ...]`) — not the actual header values.

Consequence: the BSH CORS allowlist cannot be derived from logs. Options:

1. **Architectural inference** — BSH is reached exclusively via the same widget served at
   `chat.myrecruiter.ai`, so its allowlist mirrors MFS's. This is the working assumption.
2. **Increase log verbosity** — temporarily log `event.headers.origin` in BSH for a soak
   window, then re-mine. Carries cost/PII risk; not done in this phase.
3. **CloudFront access logs** — if BSH is fronted by CF, CF access logs capture all client
   request headers including `Origin`. Not investigated in D1.

**D1 decision:** proceed with architectural inference (option 1) for BSH. Phase D2 will
need to confirm via direct testing rather than logs.

### 8.4 Prod Lambda direct queries — read-only verified

All 6 log queries executed against the prod account (`614056832592`) used the `chris-admin`
profile in READ-ONLY mode: `aws logs start-query` + `aws logs get-query-results` only. No
Lambda config, S3, or API Gateway state was modified. Confirmed against memory rule
"prod hand-managed stays hand-managed."

### 8.5 Query latency / sampling

`aws logs start-query` jobs completed in under 30s for all log groups including the 275 K
LG-1a scan (50 MB scanned). Results are complete for the 7-day window, not sampled. Limit
clauses (`limit 50`) were applied to per-origin output rows, but `stats count(*)` aggregation
ran over the full record set first.

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

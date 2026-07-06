# Tenant Config Promotion Mechanism — Design

**Status:** DESIGN ONLY — no implementation. Gated on operator approval of the recommended option **and** the Fork A/B decision (§7). The prod IAM write-role prerequisite (§5) is a gated Phase-2 prod change.

**Author:** session 2026-07-05 (follow-on item #2 from `V5_SINGLE_PASS_TURN_PLAN.md` §10).

---

## 1. Problem

Under the **born-in-staging** model (operator directive, 2026-07-05), tenant configs are authored and validated in the **staging** Config Builder → staging bucket `myrecruiter-picasso-staging` (account 525). A prod config exists **only** because it was promoted from staging. Cross-account config replication has been **severed both directions** (picasso#707 + prod-rule removal), so there is now **no** automatic staging↔prod config flow — and **no tooling** to move a config from staging to prod on purpose (confirmed: no promotion workflow, button, or script exists anywhere in the repos).

We need a mechanism to **promote a named tenant's config staging→prod**: gated, backed up, validated, verified.

**Immediate driver:** the V5 `feature_flags.V5_SINGLE_PASS` flag lives in staging MyRecruiter's config and must reach prod **through this mechanism** — not by editing the prod config directly.

## 2. The config objects (concrete)

Per `Picasso_Config_Manager/s3Operations.mjs`:

| Object | Key | Notes |
|---|---|---|
| Live tenant config | `tenants/<TENANT_ID>/<TENANT_ID>-config.json` | the file the runtime reads |
| Backup (on each save) | `tenants/<TENANT_ID>/<TENANT_ID>-<ISO-timestamp>.json` | existing convention — reuse it |
| Tenant hash→id mapping | `mappings/<tenant_hash>.json` | separate lookup layer; ~235 B; this is why the old replication rule was scoped to `mappings/*` |

Buckets: staging `myrecruiter-picasso-staging` (525) · prod `myrecruiter-picasso` (614).

Implication: promoting an **existing** tenant copies one object (`<id>-config.json`). Promoting a **brand-new** tenant born in staging must **also** copy its `mappings/<hash>.json` (prod won't have it, because replication is severed).

## 3. Constraints that shape the design

1. **Prod is hand-managed and gated.** Any prod write is a deliberate, gated act — never routine, never automatic.
2. **Staging must not write prod stores** (`feedback_staging_data_isolation`). → the promotion **actor cannot be a staging-account resource**. This rules out a "Promote" button that calls a staging Lambda holding a prod-write role.
3. **No standing cross-account coupling.** We *just* severed prod↔staging replication; do not reintroduce a continuous dependency. A deliberate, on-demand, operator-triggered copy is fine; a standing replication/pull is not.
4. **Reuse proven patterns.** `deploy-production.yml` is already dispatch-only + `environment: production`-gated + archive-before-write + verify-after. The Config Builder prod deploy already runs a **prod-config schema validation** gate via a read-only `PROD_CONFIG_CI_ROLE_ARN`.

## 4. Options considered

| Option | Actor | Verdict |
|---|---|---|
| **A** — "Promote" button in staging Config Builder → staging Lambda writes prod | staging-account Lambda | **✗ Rejected** — violates constraint 2 (staging writes prod store). |
| **B** — prod-account "pull" Lambda reads staging bucket, writes prod in-account | prod-account Lambda | **✗ Rejected as primary** — reintroduces a standing prod→staging read dependency (constraint 3). Acceptable only as a fallback if CI-OIDC is ever unavailable. |
| **C** — gated GitHub Actions `promote-tenant-config` workflow | ephemeral CI runner (OIDC) | **✓ Recommended** — neither environment holds a standing cross-account role; the only coupling lives inside the gated job; mirrors `deploy-production.yml`. |

## 5. Recommended design (Option C)

A `workflow_dispatch` workflow in the **picasso** repo (co-located with the prod-config validation the Config Builder deploy already uses).

**Inputs:** `tenant_id` (required) · `dry_run` (default **true**) · `include_mapping` (default false; set true for a brand-new tenant).

**Job (single, serialized via a concurrency group like the other prod workflows):**

1. **Gate** — `environment: production` → human approval before any prod write (same as `deploy-production.yml`).
2. **Fetch staging config** — OIDC-assume a **staging read role**; `GetObject` `tenants/<id>/<id>-config.json` from `myrecruiter-picasso-staging`.
3. **Validate** — run the **same** prod-config schema validation the Config Builder prod deploy uses (read-only `PROD_CONFIG_CI_ROLE_ARN`). Block on failure. (This is where a malformed/oversized config or an unknown field is caught before it can reach prod.)
4. **Diff + archive** — OIDC-assume a **prod write role**; read the current prod `<id>-config.json`; render the diff into the job summary; write an immutable backup `tenants/<id>/<id>-<timestamp>.json` **reusing the existing backup convention** (not a new prefix).
5. **Write** *(skipped when `dry_run`)* — `PutObject` the validated config to the prod live key. If `include_mapping`, also copy `mappings/<hash>.json`.
6. **Verify** — read back + checksum-match; optional smoke: prod `Picasso_Config_Manager` `GET /config/<id>` returns the new version stamp.
7. **Rollback** *(documented, not automatic)* — re-dispatch pointing at the archived `<id>-<timestamp>.json`, or `aws s3 cp` the backup back over the live key.

**Prerequisite (gated Phase-2 prod IAM):** a **prod-scoped OIDC write role** (sibling of `GitHubActionsDeployRole`/`PicassoDeployPolicy`), scoped to `s3:GetObject`/`s3:PutObject` on the tenant-config prefix of `myrecruiter-picasso` only. This is a deliberate gated prod change and is the one piece that must land before the workflow can run for real. The staging **read** role is cheap/likely already available via existing OIDC roles.

## 6. The V5-flag-to-prod path (worked example)

1. Staging Config Builder: MyRecruiter `feature_flags.V5_SINGLE_PASS = true` (+ ai_available CTAs) — **already done**; soaked and retired.
2. Dispatch `promote-tenant-config tenant_id=MYR384719 dry_run=true` → review the diff (the flag flip + any drift).
3. Approve `environment: production`, re-dispatch `dry_run=false` → prod MyRecruiter config now carries the flag.

**Ordering matters:** the **BSH prod dispatch (follow-on #1) must land first** so prod BSH has the V5 *code*. If the flag reaches the prod config while prod BSH is still V4-only, it is simply a no-op (V5 arrives **dormant** — harmless), but the intended sequence is: prod BSH code → then promote the flag-bearing config.

## 7. Fork for the operator — the prod Config Builder write path

Option C makes promotion a **server-side, gated, no-browser** path. So the **prod Config Builder frontend** (`config.myrecruiter.ai`) no longer *needs* to write:

- **Fork A (recommended): prod Config Builder becomes read-only.** View/validate prod configs; the promotion workflow is the *only* prod-write path — single authoring surface (staging), fully gated + audited. **Consequence: follow-on #3's if-match/etag CORS fix is unnecessary** (reads don't send `If-Match`).
- **Fork B: keep prod Config Builder writable as break-glass.** Emergency prod-only edits stay possible. **Consequences:** (a) #3's CORS fix **is** required before the next prod frontend dispatch (the new client sends `If-Match` on save+deploy); (b) prod edits become a sanctioned **divergence source** — the operator must back-port to staging or the next promote silently overwrites the hotfix.

**Recommendation: Fork A.** Still land #3's CORS fix regardless (it is cheap, additive, and harmless) so break-glass remains *available* if ever needed — but treat routine prod authoring as forbidden under born-in-staging.

## 8. Non-goals / deferred

- Bulk / multi-tenant promotion (design for one tenant at a time first).
- Automatic promotion on staging merge — deliberately **not**; promotion is a gated human act.
- Config Builder UI integration (a "Promote" button firing the workflow via `repository_dispatch`) — possible later; v1 is a plain `workflow_dispatch`.

## 9. Open questions for the operator

1. Approve **Option C** (gated CI workflow) as the mechanism?
2. **Fork A or B** for the prod Config Builder write path?
3. Which repo hosts the workflow — **picasso** (recommended, co-located with prod-config validation) or config-builder?
4. Green-light the gated prod IAM write-role prerequisite (§5) when ready?

---

## Appendix A — Follow-on #3: prepared prod CORS change (GATED, not yet run)

The prod `Picasso_Config_Manager` Function URL is **hand-managed** (not IaC). Its CORS currently lacks the `If-Match`/`ETag` support the new Config Builder client (cb#74) sends on save + deploy. Staging was fixed in picasso#658; prod is the identical gap.

**Read-verified prod state (2026-07-05, read-only via SSO):**

```
Function URL: https://56mwo4zatkiqzpancrkkzqr43e0nkrui.lambda-url.us-east-1.on.aws/  (AuthType NONE)
CORS: AllowHeaders=[content-type, authorization]  AllowMethods=[GET,POST,PUT,DELETE]
      AllowOrigins=[*]  MaxAge=300   (no ExposeHeaders)
```

**Exact change** — add `if-match` to `AllowHeaders`, add `ExposeHeaders=[etag]`; everything else unchanged (`update-function-url-config --cors` **replaces the whole block**, so the full desired state is spelled out):

```bash
aws lambda update-function-url-config \
  --function-name Picasso_Config_Manager \
  --profile myrecruiter-prod \
  --cors '{"AllowHeaders":["content-type","authorization","if-match"],"AllowMethods":["GET","POST","PUT","DELETE"],"AllowOrigins":["*"],"ExposeHeaders":["etag"],"MaxAge":300}'
```

**Gating / necessity:**
- **Do NOT run without operator approval** — this mutates a prod resource.
- Under **Fork A** (prod Config Builder read-only) this is **not required** — reads don't send `If-Match`. Apply it only as harmless future-proofing / to preserve a break-glass write path.
- Under **Fork B** (keep prod Config Builder writable) this **must** run **before** the next prod Config Builder frontend dispatch, or save + deploy break in prod the moment the new client ships.
- Verify after: re-run `aws lambda get-function-url-config --function-name Picasso_Config_Manager --profile myrecruiter-prod --query Cors` and confirm `if-match` in `AllowHeaders` and `etag` in `ExposeHeaders`.

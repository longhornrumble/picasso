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

**Job (single, serialized via a TENANT-SCOPED concurrency group — `promote-tenant-config-${{ inputs.tenant_id }}` — so same-tenant runs can't race but unrelated tenants aren't needlessly serialized; §10.7):**

1. **Gate** — `environment: production` → human approval before any prod write (same as `deploy-production.yml`).
2. **Fetch staging config** — OIDC-assume a **staging read role**; `GetObject` `tenants/<id>/<id>-config.json` from `myrecruiter-picasso-staging`.
3. **Validate** — validate the fetched config against the current prod schema, blocking on failure. **NOTE (review correction, §10.1):** the existing `prod-config-validation` job (`picasso-config-builder/.github/workflows/deploy-production.yml`) is **not** drop-in reusable here — it validates *every currently-live prod config* against about-to-deploy schema *code* (a forward-compat regression check), not "does this one candidate blob parse." This step needs a **new single-config validation entry point that reuses the schema library** (`validate-prod-configs.ts`'s core), not the job wholesale.
4. **Diff + archive** — OIDC-assume a **prod write role**; read the current prod `<id>-config.json` **and capture its ETag** (see §10.3 TOCTOU guard); render the diff into the job summary; write an immutable backup `tenants/<id>/<id>-<timestamp>.json` **reusing the existing backup convention** (not a new prefix).
5. **Write** *(skipped when `dry_run`)* — **re-assert the ETag captured at dry-run and fail loudly if prod moved** (§10.3); then `PutObject` the validated config to the prod live key. If `include_mapping`, also copy `mappings/<hash>.json` **and promote the DynamoDB Tenant Registry row** (§10.4 — prod hash→tenant resolution is registry-first, not the S3 mapping).
6. **Verify** — read back + checksum-match. **CAVEAT (review correction, §10.2):** a `GET /config/<id>` smoke reads S3 directly and reports success the instant the object lands, but **prod BSH caches tenant configs in-memory for 5 minutes** (`response_enhancer.js`; CLAUDE.md "Cache TTL is 5 minutes"). Warm prod BSH containers keep serving the pre-promotion config for up to 5 more minutes — an S3-read smoke is a false-positive for "the change is live in chat." Either wait out the cache (and/or force cold starts) before declaring success, or verify against the actual chat-serving path. This matters most for the V5-flag example (§6), whose whole point is live prod chat behavior.
7. **Rollback** *(documented, not automatic)* — **primary: native S3 version-restore.** The prod bucket has versioning **Enabled** (a CLAUDE.md hard rule; verified live) — `list-object-versions` + copy-by-`VersionId` is the most robust restore and needs no separate backup object. The `<id>-<timestamp>.json` archive (step 4) remains a human-readable complement.

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

## 10. Tech-lead review — corrections & must-resolve gaps (2026-07-06)

An independent tech-lead review (live AWS + code verification) sharpened this design. Items below are folded into §5 above; the numbered detail lives here. **10.1–10.3 are must-resolve before implementation; 10.4–10.8 resolve before or during.**

- **10.1 — validation is not drop-in reuse (HIGH).** The existing `prod-config-validation` job validates *all live prod configs against new schema code* (forward-compat check), not one candidate blob. Build a new single-config entry point reusing the schema library. (§5.3 corrected.)
- **10.2 — BSH 5-min config cache breaks S3-read verification (HIGH).** `GET /config` reads S3; warm prod BSH serves the old config for ≤5 min. Verify via the chat path or wait out the cache. (§5.6 corrected.)
- **10.3 — TOCTOU between dry-run and real dispatch (HIGH).** Nothing pins prod's state between the two dispatches, so a break-glass edit landing in that window (the exact §7 Fork B risk) would be silently clobbered. Capture prod's ETag at dry-run, re-assert at execute, fail if it moved. (§5.4/§5.5 corrected.)
- **10.4 — DynamoDB Tenant Registry omitted (MEDIUM).** Prod hash→tenant resolution is registry-first (`USE_REGISTRY_FOR_RESOLUTION=true` on prod MFS *and* prod BSH); new-tenant S3-mapping-only promotion works **today only via an accidental registry-miss→S3 fallback** (`tenant_config_loader.py`). Promote a registry row for parity, or explicitly document the fallback dependency so a future tightening of it doesn't silently break new-tenant promotion. (§5.5 corrected.)
- **10.5 — raw S3 write bypasses `Picasso_Config_Manager` (MEDIUM, stated decision).** The workflow does a raw cross-account `GetObject`/`PutObject`, skipping `saveConfig`'s `last_updated`/`tenant_id` stamping + merge mode. This is **deliberate** — we want staging's validated bytes verbatim, not a re-merge. Consequence to accept: prod's `last_updated` will reflect the staging save time, not the promotion time (don't read it as a promotion-tracking signal; the archive object's timestamp + the workflow run are the promotion record).
- **10.6 — rollback: prefer native S3 version-restore (MEDIUM).** Prod bucket versioning is Enabled (verified). Version-restore is the primary, most-robust rollback; the timestamped backup object is a human-readable complement. (§5.7 corrected.)
- **10.7 — tenant-scoped concurrency key (MEDIUM).** (§5 job header corrected.)
- **10.8 — considered alternative: write through the existing prod `Picasso_Config_Manager` PUT (MEDIUM).** That path already has ETag/merge/stamping/validation — but it authenticates via Clerk (browser session), which a headless OIDC CI actor can't cleanly present. **Option C's raw scoped-S3 write is still preferred** for a headless, audited actor; we mitigate what we lose (validation, 10.1; stamping, 10.5) by reusing the Manager's schema library and accepting the stamping trade-off explicitly.
- **Reasoned, not implementation-blocking:** the §6 ordering claim (a V4-only prod BSH no-ops on an unrecognized `feature_flags.V5_SINGLE_PASS`) holds by the repo's additive/forward-compatible-reads discipline **and** is moot under the recommended order (BSH prod code lands before the flag-bearing config). Confirmed separately: the cb#74 client sends `If-Match` on **writes only** (the GET's ETag is echoed on the save), so **Fork A truly removes the need for #3's CORS change** (Appendix A).

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
- **Fork A confirmation:** the cb#74 client sends `If-Match` on **writes only** (verified in `config-operations.ts` / `api.ts` — the GET's ETag is echoed on the subsequent save, never on the read). So under Fork A (prod Config Builder read-only) this CORS change is genuinely **not required**.

**Separate, lower-priority security follow-up (NOT part of this change):** the prod `Picasso_Config_Manager` Function URL has `AllowOrigins=[*]` on an endpoint that **writes every tenant's live chat config** — a higher-blast-radius surface than the widget, whose own module explicitly refuses to wildcard CORS (`infra/modules/lambda-bedrock-handler-staging/main.tf` "Do NOT broaden to wildcards"). It relies entirely on Clerk Lambda-level auth for protection. Recommend a follow-up ticket to scope `AllowOrigins` to `https://config.myrecruiter.ai` (+ legit local-dev origins), independent of and after the If-Match fix.

# Naming-Alignment — Phase B (PROD 614) Operator Runbook

**Program:** strip env decoration off DynamoDB table names so staging (525) and prod (614) share one canonical `picasso-<table>` name (the AWS account boundary is the environment now).
**Phase A (staging 525): COMPLETE** — batches 1–3 renamed + verified (picasso#383/#384/#385/#388/#389, lambda#225/#226).
**This doc = Phase B (prod 614).** Covers the **7 action tables** that don't yet have the canonical name in prod. The 6 already-canonical tables and the 2 carve-outs are listed but NOT actioned here.

> ⚠️ **HARD STOP / who runs this:** every mutating command below is **operator-run against prod 614**. The agent authored + ground-truthed this doc and the copy script; the agent never creates/deletes/modifies anything in 614. Prod holds live foster-care PII (FOS/ATL/AUS tenants).

> 🔒 **Account guard on EVERY step:** before any mutation, confirm you are in prod:
> ```bash
> aws sts get-caller-identity --profile myrecruiter-prod --query Account --output text   # MUST print 614056832592
> ```
> The copy script (`ddb-rename-copy.py`) enforces this guard itself and refuses to run otherwise.

---

## Ground-truthed prod state (read-only inventory, 2026-06-04)

| Logical table | Canonical `picasso-<table>` in prod? | Decorated variant(s) in prod (rows) | Live data? | Phase B action |
|---|---|---|---|---|
| notification-sends | ✅ (36) | `…-staging` (0) | canonical | **NO rename** · optional: delete dead `…-staging` |
| notification-events | ✅ (185) | `…-staging` (0) | canonical | **NO rename** · optional dead-stray delete |
| session-events | ✅ (3624) | `…-staging` (0) | canonical | **NO rename** · optional dead-stray delete |
| session-summaries | ✅ (685) | `…-staging` (0) | canonical | **NO rename** · optional dead-stray delete |
| billing-events | ✅ (18) | `…-staging` (0) | canonical | **NO rename** · optional dead-stray delete |
| sms-consent | ✅ (1) | — | canonical, clean | **NO ACTION** |
| sms-usage | ❌ absent | — | — | **NO ACTION** (create only if prod BSH ever needs it) |
| **token-blacklist** | ❌ | `…-production` (0), `…-staging` (0) | none | **CREATE-empty → repoint → delete** (§B1) |
| **token-jti-blacklist** | ❌ | `…-staging` (0) | none | **CREATE-empty → repoint? → delete** (§B2 — verify consumer) |
| **webhook-dedup** | ❌ | `…-staging` (0) | none | **CREATE-empty → repoint → delete** (§B3) |
| **conversation-summaries** | ❌ | `production-conversation-summaries` (2), `staging-conversation-summaries` (0) | 2 rows | **CREATE → copy 2 → repoint → delete** (§B4) |
| **channel-mappings** | ❌ | `picasso-channel-mappings-staging` (3 — KMS page tokens) | 3 rows PII | **CREATE → copy 3 → repoint 3 Lambdas → delete** (§B5) |
| **recent-messages** | ❌ | `production-recent-messages` (0, MFS), `staging-recent-messages` (108, Meta) | SPLIT | **CONSOLIDATE point-forward** (§B6) |
| **audit** | ❌ | `picasso-audit-production` (0), `picasso-audit-staging` (0) | none | **CODE-DEPLOY first → create → repoint → delete** (§B7) |
| tenant-registry | ❌ | `…-production` (3, authoritative), `…-staging` (5, stray), `production-tenant-registry` (0), `staging-tenant-registry` (0) | 3 rows | **CARVE-OUT — not in this runbook** (§C1) |
| form-submissions | underscore `picasso_form_submissions` (47) | `picasso_form_submissions_staging` (0) | 47 rows | **CARVE-OUT — not in this runbook** (§C2) |

**Consumer-resolution check (done 2026-06-04):** prod `Master_Function` `ENVIRONMENT=production`. `conversation_handler` reads `MESSAGES_TABLE_NAME`/`SUMMARIES_TABLE_NAME` from env (✓ repoint via env); `token_blacklist.py` reads `BLACKLIST_TABLE_NAME` from env (✓); **but `audit_logger.py:24` COMPUTES `f"picasso-audit-{ENVIRONMENT}"` and ignores the env var** → audit rename needs a code deploy first (§B7). Meta Lambdas read `CHANNEL_MAPPINGS_TABLE`/`RECENT_MESSAGES_TABLE`/`DEDUP_TABLE` from env (✓).

---

## Prerequisites

1. `aws sso login --profile myrecruiter-prod` and confirm the account guard prints `614056832592`.
2. `python3 -c "import boto3"` works locally (the copy script needs boto3).
3. The copy script is `docs/runbooks/ddb-rename-copy.py` (next to this doc). `chmod +x` it.
4. **Low-traffic window** for §B5 / §B6 (channel-mappings + recent-messages carry live Meta conversation routing).

---

## Standard per-table pattern

```
(0) VERIFY current state + consumer env  →  (1) create canonical table (copy schema/GSIs/TTL/PITR)
 →  (2) [data tables] backup source + run ddb-rename-copy.py (dry-run then --apply) + verify counts
 →  (3) repoint EACH consumer (env var, or code deploy for audit) + confirm it reads the new name
 →  (4) soak/verify the new table is being written+read  →  (5) delete the old table(s) ONLY after verify
```
Never delete a source before its consumers are confirmed reading the new table (no delete-before-repoint gap).

---

## §B1 — token-blacklist (create-empty)

Target `picasso-token-blacklist`. Consumer: `Master_Function` env `BLACKLIST_TABLE_NAME` (currently `picasso-token-blacklist-production`, env-driven). Both variants 0 rows.

```bash
# 0. verify
aws dynamodb describe-table --table-name picasso-token-blacklist-production --profile myrecruiter-prod --query 'Table.{ks:KeySchema,ad:AttributeDefinitions,ttl:TableArn}' --output json
# 1. create canonical (match the existing schema: hash_key token_hash (S), TTL expires_at, PAY_PER_REQUEST, PITR on)
aws dynamodb create-table --table-name picasso-token-blacklist \
  --attribute-definitions AttributeName=token_hash,AttributeType=S \
  --key-schema AttributeName=token_hash,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST --profile myrecruiter-prod
aws dynamodb wait table-exists --table-name picasso-token-blacklist --profile myrecruiter-prod
aws dynamodb update-time-to-live --table-name picasso-token-blacklist \
  --time-to-live-specification "Enabled=true,AttributeName=expires_at" --profile myrecruiter-prod
aws dynamodb update-continuous-backups --table-name picasso-token-blacklist \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true --profile myrecruiter-prod
# 3. repoint consumer (env-driven; no code deploy)
aws lambda update-function-configuration --function-name Master_Function \
  --environment "$(aws lambda get-function-configuration --function-name Master_Function --profile myrecruiter-prod --query Environment.Variables --output json | python3 -c 'import json,sys; v=json.load(sys.stdin); v["BLACKLIST_TABLE_NAME"]="picasso-token-blacklist"; print(json.dumps({"Variables":v}))')" \
  --profile myrecruiter-prod
# confirm
aws lambda get-function-configuration --function-name Master_Function --profile myrecruiter-prod --query 'Environment.Variables.BLACKLIST_TABLE_NAME'
# 5. delete old (0 rows, after confirming the new name is live)
aws dynamodb delete-table --table-name picasso-token-blacklist-production --profile myrecruiter-prod
aws dynamodb delete-table --table-name picasso-token-blacklist-staging    --profile myrecruiter-prod
```
> The `update-function-configuration --environment` one-liner pattern (read current env → mutate one key → write back) is reused in every §B repoint below. Always read-modify-write the full env map; never pass a partial map (it replaces the whole block).

## §B2 — token-jti-blacklist (create-empty; verify consumer first)

Target `picasso-token-jti-blacklist`. Only `…-staging` (0 rows) exists. **No prod consumer was found reading it** (not in `Master_Function` env). VERIFY before acting:
```bash
# find any prod lambda referencing the jti table (env or code)
for fn in $(aws lambda list-functions --profile myrecruiter-prod --query 'Functions[].FunctionName' --output text); do
  aws lambda get-function-configuration --function-name "$fn" --profile myrecruiter-prod --query 'Environment.Variables' --output json 2>/dev/null | grep -qi 'jti' && echo "$fn references jti";
done
```
- If a consumer exists → create `picasso-token-jti-blacklist` (schema from the `…-staging` table), repoint that consumer's env, delete old.
- If none → the `…-staging` jti table is dead-wood; just `delete-table picasso-token-jti-blacklist-staging` (defer to dead-stray cleanup).

## §B3 — webhook-dedup (create-empty)

Target `picasso-webhook-dedup`. Consumer: `Meta_Webhook_Handler` env `DEDUP_TABLE` (currently `picasso-webhook-dedup-staging`, env-driven). 0 rows.
```bash
# describe to copy the exact schema (hash key + TTL), then:
aws dynamodb create-table --table-name picasso-webhook-dedup <…schema from describe…> --billing-mode PAY_PER_REQUEST --profile myrecruiter-prod
# (enable TTL + PITR per the source)
# repoint Meta_Webhook_Handler DEDUP_TABLE via the read-modify-write env pattern → "picasso-webhook-dedup"
# delete picasso-webhook-dedup-staging after confirm
```

## §B4 — conversation-summaries (copy 2 rows)

Target `picasso-conversation-summaries`. Live source `production-conversation-summaries` (2 rows). Consumer: `Master_Function` env `SUMMARIES_TABLE_NAME` (env-driven). Dead: `staging-conversation-summaries` (0).
```bash
# 1. create canonical (schema from production-conversation-summaries: pk/sk + TTL, PITR)
# 2. backup + copy
aws dynamodb create-backup --table-name production-conversation-summaries --backup-name prod-convsum-prePhaseB-$(date -u +%Y%m%dT%H%M%SZ) --profile myrecruiter-prod
./ddb-rename-copy.py --source production-conversation-summaries --dest picasso-conversation-summaries          # dry-run
./ddb-rename-copy.py --source production-conversation-summaries --dest picasso-conversation-summaries --apply  # writes + verifies count==2
# 3. repoint Master_Function SUMMARIES_TABLE_NAME → "picasso-conversation-summaries"
# 5. delete production-conversation-summaries + staging-conversation-summaries after verify
```

## §B5 — channel-mappings (copy 3 rows — KMS page tokens, PII; low-traffic window)

Target `picasso-channel-mappings`. Live source `picasso-channel-mappings-staging` (3 rows incl. **KMS-encrypted Meta page tokens** + `TenantIndex` GSI). Consumers: **all three** Meta Lambdas — `Meta_Response_Processor`, `Meta_OAuth_Handler`, `Meta_Webhook_Handler` — env `CHANNEL_MAPPINGS_TABLE` (env-driven).
```bash
# 1. create canonical WITH the TenantIndex GSI (PK/SK + tenantId/channelType GSI, TTL, PITR) — match describe exactly
aws dynamodb describe-table --table-name picasso-channel-mappings-staging --profile myrecruiter-prod   # copy KeySchema + GSI + TTL
# create-table with the GSI; wait active; enable TTL + PITR
# 2. backup + copy (encrypted token blobs copy verbatim — script does NOT decrypt)
aws dynamodb create-backup --table-name picasso-channel-mappings-staging --backup-name prod-chanmap-prePhaseB-$(date -u +%Y%m%dT%H%M%SZ) --profile myrecruiter-prod
./ddb-rename-copy.py --source picasso-channel-mappings-staging --dest picasso-channel-mappings          # dry-run
./ddb-rename-copy.py --source picasso-channel-mappings-staging --dest picasso-channel-mappings --apply  # count==3
# 3. repoint ALL THREE Meta Lambdas CHANNEL_MAPPINGS_TABLE → "picasso-channel-mappings" (read-modify-write env each)
# 4. soak: send a test Messenger message; confirm token decrypt + routing still works on the new table
# 5. delete picasso-channel-mappings-staging after verify
```
> KMS: the page tokens are encrypted with `alias/picasso-channel-tokens` at the item level. Copying the item carries the ciphertext as-is; the same KMS alias decrypts it from the new table — no re-encryption needed. Confirm the Meta exec roles' KMS grant is alias-scoped (not table-scoped) — it is (`KMS_KEY_ID=alias/picasso-channel-tokens`).

## §B6 — recent-messages (CONSOLIDATE, point-forward — decided 2026-06-04)

Prod is **split**: `Master_Function` (core chat) reads `production-recent-messages` (0 rows); `Meta_Response_Processor` reads `staging-recent-messages` (108 live rows). **Decision: consolidate both onto `picasso-recent-messages`, point-forward (no copy — rows carry a 24h TTL and are transient conversation context).**
```bash
# 1. create canonical (schema: hash sessionId (S), range messageTimestamp (N), TTL expires_at, PITR) — schema-identical to both
# 3. repoint BOTH consumers (env-driven):
#    Master_Function       MESSAGES_TABLE_NAME   → "picasso-recent-messages"
#    Meta_Response_Processor RECENT_MESSAGES_TABLE → "picasso-recent-messages"
# 4. point-forward: new chat turns now write to picasso-recent-messages. The 108 rows in
#    staging-recent-messages keep their 24h TTL and age out on their own.
# 5a. delete production-recent-messages NOW (0 rows).
# 5b. delete staging-recent-messages AFTER its rows age out (~24-48h; re-check ItemCount == 0), OR
#     immediately if a brief Meta-context gap is acceptable in the low-traffic window.
```
> If zero context-gap is required, use §B5-style copy instead (`--source staging-recent-messages --dest picasso-recent-messages --apply`) before repointing Meta — the operator chose point-forward.

## §B7 — audit (CODE-DEPLOY prerequisite, then create-empty)

Target `picasso-audit`. Both variants 0 rows. Consumer: `Master_Function`. **Blocker:** prod `audit_logger.py:24` = `AUDIT_TABLE_NAME = f"picasso-audit-{ENVIRONMENT}"` → it **computes** `picasso-audit-production` and **ignores** the `AUDIT_TABLE_NAME` env var. Changing the env var alone will NOT repoint audit.

**Prerequisite:** deploy the env-var-reading `audit_logger.py` (the lambda#225 change already live in staging) to **prod** `Master_Function` first, THEN:
```bash
# (after prod Master_Function has the env-var-reading audit_logger)
aws dynamodb create-table --table-name picasso-audit <…schema from picasso-audit-production…> --billing-mode PAY_PER_REQUEST --profile myrecruiter-prod
# enable any TTL/PITR per source; then set the env var (now actually read):
#   Master_Function AUDIT_TABLE_NAME → "picasso-audit"
# confirm an audited action writes to picasso-audit, THEN:
aws dynamodb delete-table --table-name picasso-audit-production --profile myrecruiter-prod
aws dynamodb delete-table --table-name picasso-audit-staging    --profile myrecruiter-prod
```
> Until the code deploy happens, **leave audit alone** — do not create `picasso-audit` and orphan it. Audit is a compliance surface; a silent mis-repoint loses the audit trail. This is the one §B table with a hard code dependency.

---

## Dead-`-staging`-stray cleanup (optional, low-risk — the 6 already-canonical tables)

Each already-canonical prod table has a **0-row `…-staging` twin** sitting in prod (the `ENVIRONMENT=staging` defect + history): `picasso-notification-sends-staging`, `picasso-notification-events-staging`, `picasso-session-events-staging`, `picasso-session-summaries-staging`, `picasso-billing-events-staging`. Confirm each is 0 rows + has **no consumer pointing at it** (`grep` prod lambda envs), then `delete-table`. This is housekeeping, not part of the rename; do it any time.

---

## Carve-outs — NOT in this runbook (their own gated mini-projects)

- **§C1 tenant-registry** — FOUR prod variants: `picasso-tenant-registry-production` (3, authoritative), `picasso-tenant-registry-staging` (5, **test-polluted stray** read by the prod Analytics defect), `production-tenant-registry` (0, dead), `staging-tenant-registry` (0, dead). High read fan-out (MFS/Analytics/BSH/Meta). **Must be done together with the prod `Analytics_Dashboard_API` `ENVIRONMENT=staging` fix** ([[reference_prod_analytics_environment_staging_defect]]) — else consolidating to `picasso-tenant-registry` leaves Analytics pointing at a deleted name. Low-traffic window; expect cold-start lag.
- **§C2 form-submissions** — prod `picasso_form_submissions` (underscore, 47 rows) vs the hyphenated canonical, AND a key-schema divergence vs staging (`submission_id`-only vs `tenant_id`+`submission_id`). Restore needs a per-row transform. Own decision + mini-project.

---

## Rollback

- Tables only renamed via create→repoint→delete: to roll back, repoint the consumer env var back to the old table name (old table still exists until step 5). After step-5 delete, restore from the on-demand backup (§B4/§B5 take one) into the old name, then repoint back.
- The copy script never deletes; the source survives until the operator explicitly deletes it post-verify.
- Account guard makes a wrong-account run impossible (the script + the per-step `get-caller-identity` check).

## Verification (end state)
`aws dynamodb list-tables` in **525** and **614** show the same `picasso-<table>` set for the 7 action tables; each prod consumer's env var reads the canonical name; old decorated variants deleted; backups retained 35d.

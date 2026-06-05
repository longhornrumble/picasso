# PII Prod Cutover — DSAR + Per-Tenant Purge (PROD 614) Operator Runbook

**Program:** PII prod-cutover #1 — make the DSAR Lambda (`picasso-pii-dsar`) and the per-tenant offboarding purge Lambda (`picasso-pii-tenant-purge`) able to run **correctly and safely against live prod (614) data**, where today they are staging-only.
**Covers plan steps #1c (prod resources), #1d (dashboard UI), #1e/G-A (subject-index enablement + backfill), #1f (this runbook + smoke).**
**Source of truth:** `~/.claude/plans/pii-prod-cutover-2026-06-04.md` + `…-GA-subject-index-2026-06-04.md`.

> ⚠️ **HARD STOP / who runs this:** every mutating command below is **operator-run against prod 614**. The agent authored + ground-truthed this doc against the live staging modules; the agent never creates/deletes/modifies anything in 614. Prod holds live foster-care PII (FOS/ATL/AUS tenants).

> 🔒 **Account guard on EVERY step:** before any mutation, confirm you are in prod:
> ```bash
> aws sts get-caller-identity --profile myrecruiter-prod --query Account --output text   # MUST print 614056832592
> ```
> The Lambda code ALSO enforces this at runtime via the `EXPECTED_ACCOUNT` env-var guard (#1a, fail-closed: unset ⇒ refuse). Both layers must agree on `614056832592`.

> 🟢 **Why CLI, not Terraform:** prod is hand-managed (deployment SOP: never `terraform apply` against 614 during feature work). These resources are created via CLI, operator-run, mirroring the naming-alignment Phase B pattern. The Lambda code is already account-agnostic after D1 (env-var account guard + canonical table-name constants), so prod = create resources + deploy the **same** zip with `EXPECTED_ACCOUNT=614056832592`.

---

## ⛔ Gating gaps — read before starting

| Gap | Status | Effect on this cutover |
|---|---|---|
| **G-A** subject-index (table + writer + backfill) | **handled by §P1 + §P5** | Without it prod DSAR-by-email resolves nothing. §P5 is mandatory, not optional. |
| **G-B** form-submissions schema divergence (= **D2**, undecided) | **CODE gap — NOT closed by this runbook** | Prod `picasso_form_submissions` is single-key (`submission_id`) + underscore name + **no `PiiSubjectIdIndex` GSI**. The deployed walkers issue `Query(KeyConditionExpression=tenant_id)` → **`ValidationException` on prod**. **⇒ prod DSAR + purge are PARTIAL until D2 ships a prod-specific form-submissions code path.** This runbook deliberately does **NOT** grant or wire form-submissions. All OTHER surfaces work. |
| **D3** archive bucket | **omitted (no-op)** | Prod has no archive bucket; the DSAR archive walker is a graceful no-op. Create one only if S3 archive retention is wanted in prod. |
| **D4** prod `picasso-sms-usage` | **recommend create (§P1.4)** | Absent in prod; prod BSH `SMS_USAGE_TABLE` points at it (latent write bug). Creating it gives the purge a real surface AND fixes the latent bug. |

**Headline:** this runbook stands up a **functional prod DSAR + purge for every surface except form-submissions**. form-submissions (the primary nonprofit PII surface) is gated on **D2** — surface that to the operator and decide D2 before relying on prod DSAR for a real subject request.

---

## Ground-truthed prod (614) PII surface state (2026-06-04, re-verify at run-time)

| Resource | Prod (614) today | §  |
|---|---|---|
| `picasso-pii-subject-index` | ❌ absent | **CREATE** §P1.1 |
| `picasso-pii-dsar-audit` (+immutability) | ❌ absent | **CREATE** §P1.2 |
| `picasso-pii-tenant-purge-audit` (+immutability) | ❌ absent | **CREATE** §P1.3 |
| `picasso-sms-usage` | ❌ absent (latent BSH bug) | **CREATE** §P1.4 (D4) |
| `picasso-pii-dsar-role` + policy | ❌ absent | **CREATE** §P2.1 |
| `picasso-pii-tenant-purge-role` + policy | ❌ absent | **CREATE** §P2.2 |
| `picasso-pii-dsar` Lambda | ❌ absent | **CREATE** §P4.1 |
| `picasso-pii-tenant-purge` Lambda | ❌ absent | **CREATE** §P4.2 |
| subject-index writer in prod BSH/MFS | ❌ not deployed (`PII_SUBJECT_INDEX_TABLE` unset) | **DEPLOY** §P5 |
| data surfaces (notification-*, recent-messages, channel-mappings, session-*) | ✅ canonical (naming-alignment Phase B) | grant in §P2 |
| `picasso_form_submissions` | ⚠️ single-key, underscore, no PiiSubjectIdIndex | **D2 carve-out — not actioned** |

---

## Prerequisites

1. `aws sso login --profile myrecruiter-prod`; account guard prints `614056832592`.
2. `python3 -c "import boto3"` locally (for the §P5 backfill script).
3. The merged D1 Lambda code (lambda `main`, canonical constants) checked out locally to build the deploy zips.
4. Operator SSO role ARN for the `lambda:InvokeFunction` grant (§P3) — the prod operator/admin SSO role. Substitute `<OPERATOR_SSO_ROLE_ARN>` throughout.
5. Decide **D2 / D3 / D4** (see the gating-gaps table + the Decisions section at the bottom).
6. **Confirm prod data-table encryption** before §P2's KMS grant: `aws dynamodb describe-table --table-name <data-table> --profile myrecruiter-prod --query 'Table.SSEDescription'`. If a CMK is in use, capture its key ARN for the DSAR role's `PiiCmkDataPlane` grant; if default/AWS-owned SSE, OMIT that grant (the staging module grants a CMK only because staging has `kms-pii-staging`).

Region throughout: `us-east-1`. Account: `614056832592`.

---

## §P1 — Create prod PII tables (canonical, **once** — never plan a replace)

> 🧨 **Race lesson (`reference_ddb_resource_policy_replace_race`):** the immutability resource policy denies `dynamodb:DeleteTable`. A later TF/CLI *replace* of an immutable table races the eventual-consistent policy deletion → `AccessDenied` partial state. **So create these once-canonical and never rename/replace them.** (Creating fresh is unaffected — there is no pre-existing deny to fight.)

### §P1.1 — `picasso-pii-subject-index`
```bash
aws dynamodb create-table --profile myrecruiter-prod \
  --table-name picasso-pii-subject-index \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    AttributeName=tenant_id,AttributeType=S \
    AttributeName=normalized_email,AttributeType=S \
    AttributeName=pii_subject_id,AttributeType=S \
  --key-schema \
    AttributeName=tenant_id,KeyType=HASH \
    AttributeName=normalized_email,KeyType=RANGE \
  --global-secondary-indexes \
    'IndexName=PiiSubjectIdIndex,KeySchema=[{AttributeName=pii_subject_id,KeyType=HASH}],Projection={ProjectionType=ALL}' \
  --tags Key=Name,Value=picasso-pii-subject-index
# wait active, then enable PITR (NO ttl — the index must outlive aged-out submissions)
aws dynamodb wait table-exists --table-name picasso-pii-subject-index --profile myrecruiter-prod
aws dynamodb update-continuous-backups --table-name picasso-pii-subject-index \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true --profile myrecruiter-prod
```

### §P1.2 — `picasso-pii-dsar-audit` (+ immutability)
```bash
aws dynamodb create-table --profile myrecruiter-prod \
  --table-name picasso-pii-dsar-audit \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    AttributeName=dsar_id,AttributeType=S \
    AttributeName=event_timestamp,AttributeType=S \
    AttributeName=status,AttributeType=S \
    AttributeName=created_at_partition,AttributeType=S \
  --key-schema \
    AttributeName=dsar_id,KeyType=HASH \
    AttributeName=event_timestamp,KeyType=RANGE \
  --global-secondary-indexes \
    'IndexName=StatusIndex,KeySchema=[{AttributeName=status,KeyType=HASH},{AttributeName=event_timestamp,KeyType=RANGE}],Projection={ProjectionType=ALL}' \
    'IndexName=ByCreatedAt,KeySchema=[{AttributeName=created_at_partition,KeyType=HASH},{AttributeName=event_timestamp,KeyType=RANGE}],Projection={ProjectionType=ALL}' \
  --tags Key=Name,Value=picasso-pii-dsar-audit
aws dynamodb wait table-exists --table-name picasso-pii-dsar-audit --profile myrecruiter-prod
aws dynamodb update-continuous-backups --table-name picasso-pii-dsar-audit \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true --profile myrecruiter-prod
# immutability resource policy (the EXACT 4 resource-policy-supported actions; PartiQL/Restore are NOT supported here)
ARN=$(aws dynamodb describe-table --table-name picasso-pii-dsar-audit --profile myrecruiter-prod --query Table.TableArn --output text)
aws dynamodb put-resource-policy --profile myrecruiter-prod --resource-arn "$ARN" --policy "$(cat <<JSON
{"Version":"2012-10-17","Statement":[{"Sid":"AuditDeleteDeny","Effect":"Deny","Principal":"*",
"Action":["dynamodb:DeleteItem","dynamodb:BatchWriteItem","dynamodb:UpdateItem","dynamodb:DeleteTable"],
"Resource":"$ARN"}]}
JSON
)"
```

### §P1.3 — `picasso-pii-tenant-purge-audit` (+ immutability)
```bash
aws dynamodb create-table --profile myrecruiter-prod \
  --table-name picasso-pii-tenant-purge-audit \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
    AttributeName=purge_id,AttributeType=S \
    AttributeName=event_timestamp,AttributeType=S \
    AttributeName=created_at_partition,AttributeType=S \
  --key-schema \
    AttributeName=purge_id,KeyType=HASH \
    AttributeName=event_timestamp,KeyType=RANGE \
  --global-secondary-indexes \
    'IndexName=ByCreatedAt,KeySchema=[{AttributeName=created_at_partition,KeyType=HASH},{AttributeName=event_timestamp,KeyType=RANGE}],Projection={ProjectionType=ALL}' \
  --tags Key=Name,Value=picasso-pii-tenant-purge-audit
aws dynamodb wait table-exists --table-name picasso-pii-tenant-purge-audit --profile myrecruiter-prod
aws dynamodb update-continuous-backups --table-name picasso-pii-tenant-purge-audit \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true --profile myrecruiter-prod
ARN=$(aws dynamodb describe-table --table-name picasso-pii-tenant-purge-audit --profile myrecruiter-prod --query Table.TableArn --output text)
aws dynamodb put-resource-policy --profile myrecruiter-prod --resource-arn "$ARN" --policy "$(cat <<JSON
{"Version":"2012-10-17","Statement":[{"Sid":"PurgeAuditMutationDeny","Effect":"Deny","Principal":"*",
"Action":["dynamodb:DeleteItem","dynamodb:BatchWriteItem","dynamodb:UpdateItem","dynamodb:DeleteTable"],
"Resource":"$ARN"}]}
JSON
)"
```

### §P1.4 — `picasso-sms-usage` (D4 — recommend create)
```bash
# Schema mirrors staging picasso-sms-usage. VERIFY the staging schema first:
#   aws dynamodb describe-table --table-name picasso-sms-usage --profile myrecruiter-staging \
#     --query 'Table.{keys:KeySchema,attrs:AttributeDefinitions,ttl:null}'
# Typical: hash tenant_id (S) [+ range month (S)], PAY_PER_REQUEST, TTL on the counter attr, PITR.
# Create to match, enable TTL + PITR. (Skip this section entirely if D4 = "accept no-op".)
```

**Verify §P1:** all created tables `ACTIVE`; `get-resource-policy` on the 2 audit tables shows the Deny; PITR enabled.

---

## §P2 — Dedicated prod execution roles + scoped least-privilege policies

> CLAUDE.md never-share-roles: DSAR and purge each get their OWN role. Trust = `lambda.amazonaws.com` only. All table ARNs are the **canonical bare** names in account 614.

Trust policy (both roles):
```json
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
```

### §P2.1 — `picasso-pii-dsar-role`
```bash
aws iam create-role --profile myrecruiter-prod \
  --role-name picasso-pii-dsar-role \
  --assume-role-policy-document file://dsar-trust.json \
  --description "Dedicated exec role for the prod DSAR Lambda. Read/Delete on the in-scope MFS surfaces + PutItem on the dsar-audit table. Never-share-roles."
```
Inline policy `picasso-pii-dsar-policy` — statements (replace `<CMK_ARN>` per Prereq 6, **omit `PiiCmkDataPlane` if default SSE**; **form-submissions + archive + fulfillment grants OMITTED** — G-B/D3):

| Sid | Actions | Resources (arn:aws:dynamodb:us-east-1:614056832592:table/…) |
|---|---|---|
| Logs | `logs:CreateLogStream,logs:PutLogEvents` | `…:614…:log-group:/aws/lambda/picasso-pii-dsar:*` |
| MfsScopedReadDelete | `Query,GetItem,DeleteItem` | `picasso-notification-sends`; `picasso-notification-events` + `/index/ByMessageId`; `picasso-recent-messages`; `picasso-conversation-summaries` |
| AuditReadOnly | `Query,GetItem` | `picasso-audit` |
| SubjectIndexReadDelete | `Query,GetItem,DeleteItem` | `picasso-pii-subject-index` + `/index/PiiSubjectIdIndex` |
| ChannelMappingsReadOnly | `Query,GetItem` | `picasso-channel-mappings` + `/index/TenantIndex` |
| SessionEventsReadDelete | `Query,GetItem,DeleteItem` | `picasso-session-events` |
| SessionSummariesReadDelete | `Query,GetItem,DeleteItem` | `picasso-session-summaries` |
| DsarAuditPutOnly | `PutItem` | `picasso-pii-dsar-audit` |
| PiiCmkDataPlane *(only if CMK SSE)* | `kms:Decrypt,kms:GenerateDataKey,kms:DescribeKey` | `<CMK_ARN>` |
| StsCallerIdentity | `sts:GetCallerIdentity` | `*` |

> **Deferred (D2):** `FormSubmissionsReadDelete` (+ PiiSubjectIdIndex GSI) — add when D2 ships the prod form-submissions path. **Deferred (D3):** the 3 `ArchiveBucket*` S3 statements.

```bash
aws iam put-role-policy --profile myrecruiter-prod \
  --role-name picasso-pii-dsar-role --policy-name picasso-pii-dsar-policy \
  --policy-document file://dsar-policy.json
```

### §P2.2 — `picasso-pii-tenant-purge-role`
```bash
aws iam create-role --profile myrecruiter-prod \
  --role-name picasso-pii-tenant-purge-role \
  --assume-role-policy-document file://purge-trust.json \
  --description "Dedicated exec role for the prod per-tenant offboarding purge Lambda. Query+DeleteItem on the tenant-partitioned surfaces + PutItem on the purge audit table. Never-share-roles."
```
Inline policy `picasso-pii-tenant-purge-policy` (**form-submissions OMITTED — G-B/D2**):

| Sid | Actions | Resources |
|---|---|---|
| Logs | `logs:CreateLogStream,logs:PutLogEvents` | `…:614…:log-group:/aws/lambda/picasso-pii-tenant-purge:*` |
| NotificationSendsQueryDelete | `Query,DeleteItem` | `picasso-notification-sends` |
| NotificationEventsQueryDelete | `Query,DeleteItem` | `picasso-notification-events` + `/index/ByMessageId` |
| SubjectIndexQueryDelete | `Query,DeleteItem` | `picasso-pii-subject-index` |
| SmsUsageQueryDelete *(if §P1.4 created)* | `Query,DeleteItem` | `picasso-sms-usage` |
| SessionSummariesQueryDelete | `Query,DeleteItem` | `picasso-session-summaries` |
| PurgeAuditPutOnly | `PutItem` | `picasso-pii-tenant-purge-audit` |
| StsCallerIdentity | `sts:GetCallerIdentity` | `*` |

> **Deferred (D2):** `FormSubmissionsQueryDelete` — and note the prod path needs a **Scan-filter** (single-key table), not the staging Query. Both code + grant land together under D2.

**Verify §P2:** `aws iam get-role-policy` on each shows the statements; every resource ARN is `arn:aws:dynamodb:us-east-1:614056832592:table/picasso-…` (no `-staging`, no `525`).

---

## §P3 — G4: operator-only invoke

Grant `lambda:InvokeFunction` to the operator SSO role ONLY (the runtime account guard is the second layer). After §P4 creates the functions:
```bash
for FN in picasso-pii-dsar picasso-pii-tenant-purge; do
  aws lambda add-permission --profile myrecruiter-prod \
    --function-name "$FN" --statement-id AllowOperatorInvoke \
    --action lambda:InvokeFunction --principal "<OPERATOR_SSO_ROLE_ARN>"
done
```
> **G4 note (vs staging):** staging relies on the resource-based grant + account guard. For prod, ALSO confirm no other PowerUser/role has a broad `lambda:InvokeFunction *`. If one exists, add an explicit Deny on these 2 function ARNs to all principals except the operator role (resource-policy or SCP) — this is the "deny-invoke-except-operator" the plan flags as the prod hardening above staging's posture.

---

## §P4 — Deploy the prod Lambdas (same code, prod guard)

Build the zips from the **D1-merged** lambda `main` (canonical constants):
```bash
cd Lambdas/lambda
( cd picasso_pii_dsar_staging && zip -j /tmp/dsar.zip lambda_function.py )
( cd picasso_pii_tenant_purge_staging && zip -j /tmp/purge.zip lambda_function.py )
```
> The dir is named `…_staging` (source layout) but the code is account-agnostic post-D1. The deployed FUNCTION names drop `-staging` (canonical).

### §P4.1 — `picasso-pii-dsar`
```bash
aws lambda create-function --profile myrecruiter-prod \
  --function-name picasso-pii-dsar \
  --runtime python3.11 --handler lambda_function.lambda_handler \
  --role arn:aws:iam::614056832592:role/picasso-pii-dsar-role \
  --memory-size 256 --timeout 120 --architectures x86_64 \
  --environment 'Variables={EXPECTED_ACCOUNT=614056832592}' \
  --zip-file fileb:///tmp/dsar.zip
```

### §P4.2 — `picasso-pii-tenant-purge` (reserved concurrency = 1, single-flight)
```bash
aws lambda create-function --profile myrecruiter-prod \
  --function-name picasso-pii-tenant-purge \
  --runtime python3.11 --handler lambda_function.lambda_handler \
  --role arn:aws:iam::614056832592:role/picasso-pii-tenant-purge-role \
  --memory-size 256 --timeout 120 --architectures x86_64 \
  --environment 'Variables={EXPECTED_ACCOUNT=614056832592}' \
  --zip-file fileb:///tmp/purge.zip
aws lambda put-function-concurrency --profile myrecruiter-prod \
  --function-name picasso-pii-tenant-purge --reserved-concurrent-executions 1
```
**Verify §P4:** `get-function-configuration` shows `EXPECTED_ACCOUNT=614056832592`, the dedicated role, reserved concurrency=1 on purge. (Do §P3 add-permission now that the functions exist.)

---

## §P5 — G-A: subject-index enablement (MANDATORY for prod DSAR-by-email)

Without this, the prod subject-index stays empty and DSAR resolves nothing.

1. **Deploy the `pii_subject` writer to prod BSH AND prod MFS** (both are active prod form writers):
   - BSH (`Bedrock_Streaming_Handler`): set env `PII_SUBJECT_INDEX_TABLE=picasso-pii-subject-index`; add a `dynamodb:PutItem,GetItem` grant on `…:614…:table/picasso-pii-subject-index` (+ `/index/PiiSubjectIdIndex`) to the BSH role. Deploy the current BSH code (it already contains `pii_subject.js`, fallback now canonical post-D1).
   - MFS (`Master_Function`): same env var + grant on its role; deploy current MFS code (`pii_subject.py`).
   > Use the read-modify-write env pattern (preserve all other vars). ⚠️ BSH/MFS deploys drag other programs' merged work — coordinate timing.
2. **Backfill** historical prod `picasso_form_submissions` rows (~47) with `pii_subject_id` + populate the index:
   ```bash
   # account-guarded (sts==614), dry-run default; --apply to write. Commit the execution log.
   python3 tools/ga3_subject_index_backfill.py            # dry-run preview
   python3 tools/ga3_subject_index_backfill.py --apply    # writes (operator-run)
   ```
   > Q-B (verified): most prod rows are MFS-written and carry NO `contact.email` — the script's `extractEmail(form_data)` fallback is the PRIMARY path. The index id is a random `psub_<32hex>`, group-and-stamp keyed by `submission_id`.

**Verify §P5:** new prod form submission → index row appears; `scan --select COUNT` on the index ≈ distinct-subject count; the backfill log shows stamped/created/skipped tallies with no `unresolved` orphans.

---

## §P6 — Dry-run smoke + audit-immutability verify (on a SEEDED synthetic prod tenant)

Seed a throwaway `TEN-PROD-SMOKE` row (subject-index + one MFS surface), then:
```bash
# DSAR access dry-run — expect status partial/complete, 0 unexpected AccessDenied/NotFound, subject resolves
aws lambda invoke --profile myrecruiter-prod --function-name picasso-pii-dsar \
  --payload '{"subject_identifier":"smoke@example.com","identifier_type":"email","request_type":"access","tenant_id":"TEN-PROD-SMOKE","operator":"<you>","dsar_id":"prod-smoke-1","dry_run":true}' /tmp/dsar_prod.json
# Purge dry-run — expect status completed, deleted:false, audit_row_pks present, 0 AccessDenied
aws lambda invoke --profile myrecruiter-prod --function-name picasso-pii-tenant-purge \
  --payload '{"tenant_id":"TEN-PROD-SMOKE","operator":"<you>","purge_id":"prod-smoke-1","grace_confirmed":false,"dry_run":true}' /tmp/purge_prod.json
# Audit immutability — DeleteItem on an audit row MUST be denied even to admin:
aws dynamodb delete-item --profile myrecruiter-prod --table-name picasso-pii-dsar-audit \
  --key '{"dsar_id":{"S":"prod-smoke-1"},"event_timestamp":{"S":"<ts-from-output>"}}'   # expect AccessDeniedException
# Account guard — confirm a wrong-account invoke would refuse (the env literal is 614; staging copy is 525).
```
Clean up the synthetic tenant rows (subject-index + data surface). Audit rows are append-only by design — leave them.

---

## §P7 — #1d: dashboard prod purge UI path

Flip the `POST /admin/tenants/{id}/purge` env-block in `Analytics_Dashboard_API` to allow prod **only** behind the super-admin Clerk guard + the account-guarded Lambda; keep the dual-gate + typed-tenant-id confirm. Verify the prod dashboard role's `lambda:InvokeFunction` grant targets `…:614…:function:picasso-pii-tenant-purge` exactly. (Defer until §P1–P6 are green.)

---

## Rollback (per section)
- **§P1 tables:** `delete-table` (audit tables: delete the resource policy first — `delete-resource-policy` — then `delete-table`; see the race lesson). Empty/synthetic data only.
- **§P2 roles:** `delete-role-policy` then `delete-role` (only after the Lambdas using them are deleted).
- **§P3 invoke grant:** `remove-permission --statement-id AllowOperatorInvoke`.
- **§P4 Lambdas:** `delete-function`.
- **§P5 writer:** revert BSH/MFS env var + role grant; the backfilled `pii_subject_id` attributes are additive (forward-compatible) and safe to leave.

## Known gaps / deferred
- **G-B / D2 (form-submissions):** prod DSAR + purge do NOT cover form-submissions until a prod-specific code path ships (DSAR: resolve subject → `submission_id`s via index → GetItem; purge: full-table Scan filtered on the `tenant_id` attribute). This is the primary remaining blocker for COMPLETE prod DSAR. Until then, form-submissions is a documented manual-fallback (operator runs an email-keyed Scan per the playbook).
- **D3 (archive):** DSAR archive walker is a permanent no-op in prod unless an archive bucket + the 3 S3 grants are added.

## Decisions to confirm before running
| ID | Decision | Recommended default |
|---|---|---|
| **D2** | form-submissions: reconcile prod schema to composite-key, OR ship a prod-specific single-key code path, OR defer | **ship the prod-specific path** (smaller than a data migration; unblocks the primary surface) — coordinate with the form-submissions naming carve-out |
| **D3** | create a prod archive bucket? | **no** — accept the archive walker no-op unless S3 archive retention is wanted in prod |
| **D4** | create prod `picasso-sms-usage`? | **yes** (§P1.4) — gives the purge a real surface + fixes the latent BSH write bug |

## Exit criteria (whole cutover)
- Prod DSAR access on a seeded synthetic subject returns all in-scope surfaces (subject-index resolves).
- Prod purge dry-run on a synthetic tenant reports every in-scope surface, 0 unexpected AccessDenied/NotFound.
- Prod purge real-delete on the synthetic tenant empties its partition rows; audit rows written + DeleteItem denied even to admin.
- Both Lambdas refuse when `EXPECTED_ACCOUNT` ≠ caller (fail-closed when unset).
- form-submissions explicitly tracked as D2-gated (NOT silently assumed covered).

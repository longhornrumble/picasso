# Sub-phase B1 — `picasso-calendar-watch-channels` table runbook

**Purpose.** Provision the DynamoDB table that backs `Calendar_Watch_Listener` (B2) and `Calendar_Watch_Renewer` (B3) per canonical [§14.1](scheduling_design.md#L744). One row per active Google Calendar push-notification watch channel.

**Pattern.** First scheduling-domain DDB runbook (operator-execute AWS CLI; no IaC for v1 per re-audit decision). Format mirrors [`subphase_a_operator_runbook_2026-05-24.md`](subphase_a_operator_runbook_2026-05-24.md), but A6 itself was IAM + branch-protection only — this is the first table-creation runbook in the scheduling track.

**Closure status.**
- **Staging-525** (`picasso-calendar-watch-channels-staging`): PROVISIONED + verified 2026-05-25. Audit-closure amendments applied same day: 2nd GSI `tenant-expiration-index` added for B3 query; PITR enabled; tags re-aligned to platform `default_tags` convention.
- **Dev-372** (`picasso-calendar-watch-channels-dev`): PROVISIONED 2026-05-25 (audit row 7 closure) so B2 unit tests have a real DDB target during implementation.
- **Prod-614** (`picasso-calendar-watch-channels-prod`): deferred to Phase-2 prod cutover per SOP; explicit + gated + rare.

---

## Schema (canonical §14.1)

| Attribute | Type | Role | Source |
|---|---|---|---|
| `channel_id` | S | PK | Google watch channel UUID (caller-supplied per stable-channel-ID-per-calendar-purpose rule) |
| `tenant_id` | S | required (GSI hash) | Tenant scoping; required so the listener can scope booking queries and ops can query "all unwatched channels for tenant X" without a full-table scan |
| `calendar_id` | S | attribute | Coordinator calendar ID (typically `coordinator@workspace.com`) |
| `calendar_provider` | S | attribute | `google` (v1) / `microsoft` reserved for v2 |
| `expiration` | N | attribute (GSI range) | Epoch millis (Google `expiration` field); B3 Renewer queries by `expiration < now+buffer` |
| `callback_url` | S | attribute | Listener Lambda HTTPS endpoint registered with Google |
| `last_renewed_at` | S | attribute | ISO-8601; updated by Renewer |
| `status` | S | attribute (GSI range) | `active` \| `unwatched_renewal_failed` \| `event_body_private` (per §14.2) |
| `channel_token` | S | attribute (Tier-4 secret) | `secrets.token_hex(32)` per channel; validated via `hmac.compare_digest`. See "channel_token encryption" note below. |

**GSIs (both required):**
- `tenant-status-index` — HASH `tenant_id` + RANGE `status`. Ops queries: "all unwatched channels for tenant X", "all event-body-private channels per tenant".
- `tenant-expiration-index` — HASH `tenant_id` + RANGE `expiration`. B3 Renewer queries: "all channels for tenant X expiring before `now + 7d`". Without this index B3 would full-scan, missing AC #12.

**Billing mode:** `PAY_PER_REQUEST` (low write volume scales with coordinator count; pilot-scale <100).

**PITR:** ENABLED on both staging + dev. Per `pii-inventory.md` header invariant: "all PII-relevant tables have PITR enabled." Although the table is NOT-CONSUMER-tier for `calendar_id`, the embedded `channel_token` is a Tier-4 secret (max-tier rule per `data-classification.md`); PITR provides forensic reconstruction of which token was active at the time of any compromise.

### `channel_token` encryption note (B2 implementation gate)

`channel_token` is a 64-char hex secret per row (`secrets.token_hex(32)`). Per `data-classification.md` max-tier rule (Rule 4), an item-level Tier-4 secret elevates the entire row to Tier-4 classification. Staging v1 stores `channel_token` with SSE-DDB only.

**B2 implementation must choose one of:**
1. **CMK item-level encryption** matching the `picasso-channel-mappings-staging` page-token precedent (KMS-encrypted at item level, table CMK on the new key).
2. **Move `channel_token` to Secrets Manager** at path `picasso/scheduling/channel-tokens/{tenant_id}/{channel_id}` and store only a SHA-256 hash in DDB for lookup. Cleaner architecture (channel tokens are functionally webhook signing secrets).

The decision is a B2 PR-level concern, NOT a B1 blocker — but the runbook fixes the gate: **B2's Security-Reviewer pass cannot close without addressing this choice.**

### IAM scope discipline note (B2/B3/B5/B6 implementation gate)

Per [Security-Reviewer P0 2026-05-02](subphase_b_oauth_provisioning_runbook_2026-05-25.md#L138): Lambda execution roles must be scoped to `secretsmanager:GetSecretValue` on `picasso/scheduling/oauth/*`. The wildcard ARN form is acceptable at pilot scale (one tenant), but **before a second tenant enters staging**, the IAM grant MUST be parameterized to `picasso/scheduling/oauth/${tenantId}/*` (either per-Lambda parameterized or tag-based ABAC via `aws:PrincipalTag/tenantId`). Same rule applies for any future `picasso/scheduling/channel-tokens/*` grants if option 2 above is chosen.

**B2/B3/B5/B6 implementation PRs must:**
- Land per-Lambda execution roles per CLAUDE.md "Never share IAM roles across Lambdas".
- Annotate the wildcard-vs-parameterized choice with a tenant-scale gate (re-visit before tenant #2 enters staging).

---

## Pre-image (verify table absent before apply)

```bash
aws dynamodb describe-table \
  --table-name picasso-calendar-watch-channels-staging \
  --profile myrecruiter-staging --region us-east-1 \
  --query 'Table.TableStatus' 2>&1 | head -3
# Expected: ResourceNotFoundException
```

---

## Apply (staging-525)

```bash
aws dynamodb create-table \
  --table-name picasso-calendar-watch-channels-staging \
  --attribute-definitions \
    AttributeName=channel_id,AttributeType=S \
    AttributeName=tenant_id,AttributeType=S \
    AttributeName=status,AttributeType=S \
    AttributeName=expiration,AttributeType=N \
  --key-schema AttributeName=channel_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[
    {
      "IndexName": "tenant-status-index",
      "KeySchema": [
        {"AttributeName": "tenant_id", "KeyType": "HASH"},
        {"AttributeName": "status", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    },
    {
      "IndexName": "tenant-expiration-index",
      "KeySchema": [
        {"AttributeName": "tenant_id", "KeyType": "HASH"},
        {"AttributeName": "expiration", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }
  ]' \
  --tags \
    Key=Environment,Value=staging \
    Key=Project,Value=myrecruiter \
    Key=ManagedBy,Value=runbook \
    Key=Subphase,Value=B1 \
    Key=CanonicalSource,Value=scheduling-design-14.1 \
  --profile myrecruiter-staging --region us-east-1

# Wait for both GSIs ACTIVE before proceeding (typically <2 min)

# Enable PITR (required per pii-inventory header invariant)
aws dynamodb update-continuous-backups \
  --table-name picasso-calendar-watch-channels-staging \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true \
  --profile myrecruiter-staging --region us-east-1
```

**Tag schema** aligns with platform `default_tags` from `infra/main.tf` lines 21–27 (`Environment`, `Project=myrecruiter`, `ManagedBy`). Subphase + CanonicalSource added as supplemental runbook-origin markers. Do NOT use lowercase `env`/`project=picasso`/`managed-by` — those tags are invisible to Cost Explorer + AWS Config rules that match on the platform convention.

---

## Verify

```bash
set -euo pipefail
SAMPLE_CHANNEL_ID="b1-smoke-test-$(date +%s)"
SAMPLE_ITEM_PATH="/tmp/b1-smoke-item.json"
SAMPLE_KEY_PATH="/tmp/b1-smoke-key.json"

# Cleanup guard: delete the smoke row + temp files even if verify steps fail mid-run
cleanup() {
  aws dynamodb delete-item \
    --table-name picasso-calendar-watch-channels-staging \
    --key "$(cat "$SAMPLE_KEY_PATH" 2>/dev/null || echo '{}')" \
    --profile myrecruiter-staging --region us-east-1 2>/dev/null || true
  rm -f "$SAMPLE_ITEM_PATH" "$SAMPLE_KEY_PATH"
  unset SAMPLE_CHANNEL_ID
}
trap cleanup EXIT

# (a) Table + both GSIs ACTIVE
aws dynamodb describe-table \
  --table-name picasso-calendar-watch-channels-staging \
  --profile myrecruiter-staging --region us-east-1 \
  --query 'Table.{Status:TableStatus,Keys:KeySchema,GSIs:GlobalSecondaryIndexes[].{Name:IndexName,Status:IndexStatus,Keys:KeySchema},Billing:BillingModeSummary.BillingMode}'

# (b) PITR enabled
aws dynamodb describe-continuous-backups \
  --table-name picasso-calendar-watch-channels-staging \
  --profile myrecruiter-staging --region us-east-1 \
  --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' --output text
# Expected: ENABLED

# (c) Tags conform to platform convention
aws dynamodb list-tags-of-resource \
  --resource-arn "arn:aws:dynamodb:us-east-1:525409062831:table/picasso-calendar-watch-channels-staging" \
  --profile myrecruiter-staging --region us-east-1 \
  --query 'Tags[?Key==`Environment` || Key==`Project` || Key==`ManagedBy`]'
# Expected: Environment=staging, Project=myrecruiter, ManagedBy=runbook

# (d) Sample write + GetItem + GSI queries (both indexes) + cleanup
cat > "$SAMPLE_ITEM_PATH" <<EOF
{
  "channel_id":        {"S": "$SAMPLE_CHANNEL_ID"},
  "tenant_id":         {"S": "MYR384719"},
  "calendar_id":       {"S": "test-coordinator@example.com"},
  "calendar_provider": {"S": "google"},
  "expiration":        {"N": "1735689600000"},
  "callback_url":      {"S": "https://example.invalid/listener"},
  "last_renewed_at":   {"S": "2026-05-25T19:30:00Z"},
  "status":            {"S": "active"},
  "channel_token":     {"S": "smoke-test-token-not-real"}
}
EOF
cat > "$SAMPLE_KEY_PATH" <<EOF
{"channel_id": {"S": "$SAMPLE_CHANNEL_ID"}}
EOF

aws dynamodb put-item \
  --table-name picasso-calendar-watch-channels-staging \
  --item "file://$SAMPLE_ITEM_PATH" \
  --profile myrecruiter-staging --region us-east-1

aws dynamodb get-item \
  --table-name picasso-calendar-watch-channels-staging \
  --key "file://$SAMPLE_KEY_PATH" \
  --profile myrecruiter-staging --region us-east-1 \
  --query 'Item.{channel_id:channel_id.S,tenant_id:tenant_id.S,status:status.S}'

# Query both GSIs to verify both work
aws dynamodb query \
  --table-name picasso-calendar-watch-channels-staging \
  --index-name tenant-status-index \
  --key-condition-expression "tenant_id = :t AND #s = :st" \
  --expression-attribute-names '{"#s": "status"}' \
  --expression-attribute-values '{":t": {"S": "MYR384719"}, ":st": {"S": "active"}}' \
  --profile myrecruiter-staging --region us-east-1 \
  --query 'Items[].{channel_id:channel_id.S,status:status.S}'

aws dynamodb query \
  --table-name picasso-calendar-watch-channels-staging \
  --index-name tenant-expiration-index \
  --key-condition-expression "tenant_id = :t AND #e < :now" \
  --expression-attribute-names '{"#e": "expiration"}' \
  --expression-attribute-values '{":t": {"S": "MYR384719"}, ":now": {"N": "9999999999999"}}' \
  --profile myrecruiter-staging --region us-east-1 \
  --query 'Items[].{channel_id:channel_id.S,expiration:expiration.N}'

# trap cleanup fires here on success or failure
```

**Expected:** (a) ACTIVE table + both GSIs ACTIVE; (b) PITR ENABLED; (c) platform tags present; (d) PK GetItem + both GSI queries return the sample row.

---

## What this runbook closes

Plan §4 Task B1 verify check: *"Runbook commands succeed; sample row writes/reads correctly; runbook updated with the new table."* All sub-criteria met against staging-525 on 2026-05-25.

**Post-audit closure (2026-05-25 same-day):** rows 1 (2nd GSI), 2 (PITR), 6 (citation), 7 (dev table), 12 (channel_token Tier-4 note), 13 (IAM tenant-scope note), 16 (smoke-test trap), 17 (file:// pattern), 18 (platform tags) all addressed in this revision.

**Plan amendment:** Task B1 row in [`scheduling_implementation_plan.md`](scheduling_implementation_plan.md) line ~154 amended to record completion.

**PII inventory:** new row added to [`docs/roadmap/PII-Project/pii-inventory.md`](../../docs/roadmap/PII-Project/pii-inventory.md) §B per the Living-Inventory PR Rule (also updated 2026-05-25 to reflect PITR=on + channel_token Tier-4 caveat + volunteer-coordinator CPRA gap-H reference).

---

## Rollback (if needed)

```bash
aws dynamodb delete-table \
  --table-name picasso-calendar-watch-channels-staging \
  --profile myrecruiter-staging --region us-east-1
```

Safe rollback: B2/B3 Lambdas not yet writing — no data loss. Once B5 onboarding hooks land, rollback requires draining active watch channels (`events.stop` calls per row) before delete.

---

## Cross-env deployment

- **Dev (372666940362):** PROVISIONED 2026-05-25 (audit row 7 closure). Same schema, same tags pattern with `Environment=dev`, same GSIs, PITR ENABLED.
- **Prod (614056832592):** Phase-2 promotion gated by full sub-phase B exit. Apply same commands with `--profile myrecruiter-prod` and `-prod` suffix on table name. Per the SOP: prod promotion is explicit + gated + rare; not part of normal B-phase work.

Per CLAUDE.md "Never share resources across environments": no single table serves multiple envs; the `{name}-{env}` naming convention is enforced.

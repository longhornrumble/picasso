# kms-pii-staging — CMK key-policy change runbook

**Purpose:** Any change to the `kms-pii-staging` CMK key policy is high-blast-radius. Every Tier-3 PII surface that becomes CMK-encrypted depends on this single policy. A mis-configured Deny SID can lock out the data-plane principals atomically; a mis-configured Allow SID can widen decryption beyond the listed roles. This runbook is the gate for *every* policy edit.

**Audience:** Solo operator + AI agent pair, making edits via Terraform + AWS CLI in staging account `525409062831`.

**Source IaC:** [`infra/main.tf`](../../../infra/main.tf) lines ~880–948 (`DataPlaneAllowListedRoles`, `DeployRoleDdbSseGrant`, `DenyDecryptToAllOtherPrincipals`, `BreakGlassDecrypt` SIDs).

---

## 0. Pre-flight — table & principal inventory

Before any policy edit, run this inventory and paste the output into the change PR description:

```bash
# CMK identity
AWS_PROFILE=myrecruiter-staging aws kms describe-key --key-id alias/picasso-pii-staging \
  --query 'KeyMetadata.[KeyId,Arn,KeyState]' --output text

# Current key policy (canonicalized for diff)
AWS_PROFILE=myrecruiter-staging aws kms get-key-policy \
  --policy-name default --key-id alias/picasso-pii-staging --output text \
  | jq -S . > /tmp/kms-pii-staging.policy.before.json
cat /tmp/kms-pii-staging.policy.before.json

# Which DDB tables in acct 525 currently use this CMK
AWS_PROFILE=myrecruiter-staging aws dynamodb list-tables --output text --query 'TableNames[]' \
  | tr '\t' '\n' | while read t; do
    sse=$(AWS_PROFILE=myrecruiter-staging aws dynamodb describe-table --table-name "$t" \
      --query 'Table.SSEDescription.KMSMasterKeyArn' --output text 2>/dev/null)
    [ -n "$sse" ] && [ "$sse" != "None" ] && echo "$t -> $sse"
  done

# Which principals appear in the current policy (Allow + Deny exception list)
jq -r '
  .Statement[]
  | select(.Sid=="DataPlaneAllowListedRoles" or .Sid=="DenyDecryptToAllOtherPrincipals" or .Sid=="BreakGlassDecrypt")
  | [.Sid, (.Principal.AWS // .Condition.StringNotEqualsIfExists."aws:PrincipalArn" // [])]
  | @json
' /tmp/kms-pii-staging.policy.before.json
```

Record the captured state in the PR description under "Pre-flight inventory."

---

## 1. Shadow-key test — gate every policy edit

**Rule:** before applying a key-policy change to `kms-pii-staging`, validate the candidate policy against a throwaway "shadow" CMK in the same account. If the shadow test fails, do NOT apply to production.

### 1.1 Provision the shadow CMK (one-time per change session)

```bash
SHADOW_ARN=$(AWS_PROFILE=myrecruiter-staging aws kms create-key \
  --description "kms-pii-staging shadow-test — DELETE within 24h" \
  --tags TagKey=Purpose,TagValue=shadow-test \
         TagKey=ExpiresAt,TagValue=$(date -u -v+1d +%FT%TZ) \
  --query 'KeyMetadata.Arn' --output text)
echo "Shadow CMK: $SHADOW_ARN"
```

### 1.2 Apply the *candidate* policy (rewritten to point at the shadow key)

Render the candidate Terraform-managed policy into the same JSON shape, but with `"Resource": "*"` referring to the shadow CMK only. Apply via:

```bash
# Render the candidate policy from your Terraform working copy.
# (Replace `<rendered.json>` with the path to the rendered candidate policy.)
AWS_PROFILE=myrecruiter-staging aws kms put-key-policy \
  --key-id "$SHADOW_ARN" --policy-name default \
  --policy file://<rendered.json>
```

### 1.3 Smoke-test the new principal(s)

For every principal newly listed in the candidate policy's `Allow` or `Deny`-exception list, simulate `kms:Decrypt` from that principal against the shadow CMK:

```bash
# 1. Generate an encrypted blob with the shadow CMK
CIPHERTEXT=$(AWS_PROFILE=myrecruiter-staging aws kms encrypt \
  --key-id "$SHADOW_ARN" --plaintext "shadow-smoke" \
  --query CiphertextBlob --output text)

# 2. For each NEW principal: assume it, attempt Decrypt
NEW_PRINCIPAL=arn:aws:iam::525409062831:role/<role-name>
CREDS=$(AWS_PROFILE=myrecruiter-staging aws sts assume-role \
  --role-arn "$NEW_PRINCIPAL" --role-session-name shadow-test \
  --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' --output text)
read -r AKI SAK SKT <<<"$CREDS"

AWS_ACCESS_KEY_ID="$AKI" AWS_SECRET_ACCESS_KEY="$SAK" AWS_SESSION_TOKEN="$SKT" \
  aws kms decrypt --ciphertext-blob "$CIPHERTEXT" \
  --query Plaintext --output text | base64 -d
# Expected: "shadow-smoke". If AccessDenied → candidate policy is wrong; STOP.
```

If shadow-key Decrypt fails for a principal that should be authorized → do not proceed.
If shadow-key Decrypt succeeds for a principal that should be denied → do not proceed.

### 1.4 Delete the shadow CMK after the test

```bash
AWS_PROFILE=myrecruiter-staging aws kms schedule-key-deletion \
  --key-id "$SHADOW_ARN" --pending-window-in-days 7
```

---

## 2. Apply to production (`kms-pii-staging`)

Only after §1 shadow test passes:

```bash
# Snapshot the live key policy (post-edit drift baseline)
AWS_PROFILE=myrecruiter-staging aws kms get-key-policy \
  --policy-name default --key-id alias/picasso-pii-staging --output text \
  | jq -S . > /tmp/kms-pii-staging.policy.before-apply.json

unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
cd infra
AWS_PROFILE=myrecruiter-staging terraform plan -var-file=envs/staging.tfvars -out=plan.tfplan
# Inspect the plan — expect ONE aws_kms_key.* policy diff, no other resource churn.

AWS_PROFILE=myrecruiter-staging terraform apply plan.tfplan
```

---

## 3. Post-apply — `jq -S` canonical drift detection

```bash
AWS_PROFILE=myrecruiter-staging aws kms get-key-policy \
  --policy-name default --key-id alias/picasso-pii-staging --output text \
  | jq -S . > /tmp/kms-pii-staging.policy.after-apply.json

diff /tmp/kms-pii-staging.policy.before-apply.json /tmp/kms-pii-staging.policy.after-apply.json
# Inspect the diff — every changed line must trace to the intended Sid additions/removals.
# If unexpected churn (key/value reordering, new SIDs, principal expansion) → rollback per §5.
```

Canonical sort (`jq -S`) is required — AWS may re-order keys server-side, and the unsorted diff produces false positives that mask real drift.

---

## 4. Post-apply smoke assertion — every authorized principal can still decrypt

For each principal in the post-apply Allow list and Deny-exception list, repeat the §1.3 smoke pattern (assume → encrypt → decrypt) but against the *real* `alias/picasso-pii-staging`. Use an ephemeral encrypted blob, NOT a real PII row.

If any authorized principal returns `AccessDenied` after apply → rollback per §5.

---

## 5. Rollback procedure

Pre-apply, the live policy is captured at `/tmp/kms-pii-staging.policy.before-apply.json`.

```bash
AWS_PROFILE=myrecruiter-staging aws kms put-key-policy \
  --key-id alias/picasso-pii-staging --policy-name default \
  --policy file:///tmp/kms-pii-staging.policy.before-apply.json
```

Then revert the Terraform commit and re-run `terraform apply` to bring state into sync. Document the rollback in the change PR with the diff that triggered it and the principal that failed smoke.

**Rollback test cycle expectation:** end-to-end rollback (revert + apply + re-smoke) completes within ~15 minutes.

---

## 6. PITR restore — re-apply DDB resource policy after restore

DynamoDB Point-in-Time Recovery creates a **new** table from the snapshot. The new table does **not** inherit the source table's `aws_dynamodb_resource_policy`. If a PITR restore is performed on `picasso-pii-dsar-audit-staging` (or any other CMK-protected PII table whose delete-deny posture is enforced via DDB resource policy — see [audit-table-retention-runbook.md](audit-table-retention-runbook.md)), the resource policy MUST be re-applied to the restored table before traffic is cut over.

```bash
# After restore completes (TableStatus=ACTIVE on the new table):
RESTORED_TABLE_NAME=<picasso-pii-dsar-audit-staging-restored-YYYYMMDD>

# Re-apply the resource policy from Terraform state:
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
cd infra
AWS_PROFILE=myrecruiter-staging terraform import \
  'module.ddb_pii_dsar_audit_staging[0].aws_dynamodb_resource_policy.audit_delete_deny' \
  "$RESTORED_TABLE_NAME"
AWS_PROFILE=myrecruiter-staging terraform apply -var-file=envs/staging.tfvars

# Smoke-assert the resource policy is attached and Deny is in effect:
AWS_PROFILE=myrecruiter-staging aws dynamodb get-resource-policy \
  --resource-arn arn:aws:dynamodb:us-east-1:525409062831:table/"$RESTORED_TABLE_NAME" \
  --query 'Policy' --output text | jq -S .
# Expect: Statement with Sid="AuditDeleteDeny", Effect="Deny", Action="dynamodb:DeleteItem".

# Confirm DeleteItem is denied:
AWS_PROFILE=myrecruiter-staging aws dynamodb delete-item \
  --table-name "$RESTORED_TABLE_NAME" \
  --key '{"dsar_id":{"S":"smoke-restore-canary"},"event_timestamp":{"S":"1970-01-01T00:00:00Z"}}' 2>&1 | grep -i "AccessDeniedException"
# Expect: AccessDeniedException. If the call succeeds, the policy did not attach — investigate.
```

If the resource policy fails to re-apply, the restored table is **unsafe to take traffic** until the policy is restored. Hold the restore.

---

## §"PR1 H3 — DSAR-role addition" (this section is the H3 instance of this runbook)

PR1 H3 adds `module.lambda_pii_dsar_staging[0].dsar_role_arn` to TWO places in the key policy:
- `DataPlaneAllowListedRoles` Allow SID (principals list)
- `DenyDecryptToAllOtherPrincipals` Deny exception list (`Condition.StringNotEqualsIfExists.aws:PrincipalArn`)

Both additions are part of a single Terraform apply. The shadow-key gate per §1 must pass for the DSAR role specifically:
- Assume the DSAR role
- Confirm `kms:Decrypt` succeeds against the shadow CMK with the candidate policy
- Confirm `kms:Decrypt` from a non-DSAR-role principal (e.g., a separate test role) returns `AccessDenied`

---

## §"PR4b SR-G — SLA Lambda role addition"

PR4b SR-G adds the **future** SLA Lambda execution role (`picasso-pii-dsar-sla-alarm-staging-role`) to BOTH the Allow SID and the Deny-exception list, mirroring the PR1 H3 pattern.

**Why two-pass (and not bundled with H3):** PR1 H3 ships before the SLA Lambda module exists. Forward-referencing a not-yet-created module via Terraform would force an artificial dependency. Two passes keep each PR self-contained and surgical.

**Mitigation for "doubled blast radius" risk:** PR4b SR-G's CMK edit MUST pass the same gates as PR1 H3:
1. Pre-apply snapshot at `/tmp/kms-pii-staging.policy.before-apply.json`
2. Shadow-key test of the SLA-role addition against a shadow CMK (per §1)
3. Post-apply `jq -S` canonical drift-detect (per §3) — confirms only the SLA-role addition appears; no other principal additions
4. Post-apply smoke: SLA Lambda role can `kms:Decrypt` an audit-table row read

Documented rollback identical to §5 (revert the Terraform commit; re-apply pre-edit snapshot via `aws kms put-key-policy`).

---

## Reference

- D5 risk register: [`privacy-risk-register.md`](privacy-risk-register.md) — F-DSAR16 + related rows
- Plan source: `~/.claude/plans/pii-dsar-fixnow4-implementation-plan.md` §4 PR1 H1
- CLAUDE.md §"Deployment SOP" — never `terraform apply` against prod account; always `unset` exported credentials before terraform

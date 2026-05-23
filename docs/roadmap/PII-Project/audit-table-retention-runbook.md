# picasso-pii-dsar-audit-staging — retention runbook

**Purpose:** Document the retention posture of the DSAR audit table and the operator procedure for the eventual counsel-determined purge.

**Audit row contents (sensitivity classification):** DSAR event metadata — `dsar_id`, `event_timestamp`, `event_type`, `status`, `created_at_partition`, and a serialized JSON `details` blob. The `details` blob carries operator-actionable context (tenant_id, operator email, error codes, walker outcomes) but the DSAR Lambda's audit-write path is engineered to never serialize consumer email or `normalized_email` (see D1 + E2 work in PR1). The strongest claim is therefore "the table contains operator-side PII (operator email) and pseudonymous DSAR-request metadata; not raw consumer PII." Retention treatment must reflect that.

**Encryption-at-rest:** **default DDB SSE (AWS-owned key) as of fix-now-4 PR1.** The plan intended to associate the audit table with the scoped PII CMK (`kms-pii-staging`), but the apply failed because the CMK policy lacks a `Principal: Service = dynamodb.amazonaws.com` Allow — Apply-2 precondition territory per the Apply-1 phase-completion-audit (2026-05-19, "Apply-2 MUST NOT proceed until G-3/4/5/6/7 satisfied"). C2 SSE-KMS is deferred to a separate PR that handles the broader Apply-2 preconditions. Default SSE is the AWS baseline; no consumer-PII rows are at rest in this table by design (only DSAR-request metadata).

**Source IaC:** [`infra/modules/ddb-pii-dsar-audit-staging/main.tf`](../../../infra/modules/ddb-pii-dsar-audit-staging/main.tf)

---

## 1. Retention basis — counsel-pending

DSAR audit rows MUST outlive the underlying consumer data they describe (GDPR Art 17(3)(b) "establishment, exercise or defence of legal claims" carve-out). The audit trail is the controller's evidence that a request was received, processed, and closed within the regulatory SLA.

**The retention period itself is not yet determined.** Counsel must establish:
- Minimum hold (likely 3+ years per common limitations periods for civil claims; jurisdiction-dependent)
- Maximum hold under Art 5(1)(e) "storage limitation" (operator must NOT retain indefinitely once the legal-claims basis no longer applies)
- Trigger events that close out a row's legal-claims basis (e.g., statute of limitations elapsed; subject DSAR explicitly closed by counsel)

Pending counsel determination, this table:
- Has **no DDB TTL** configured (TTL service principal not authorized to mass-delete audit rows)
- Has **no `expires_at` attribute** populated by the writer
- Has a **DDB resource policy** with `Deny dynamodb:DeleteItem` applied to all principals (see C2 in PR1) — preventing any principal (including the DSAR Lambda's own role) from deleting an audit row in the normal course of operations
- Carries a **D5 register row F-DSAR16** with status `OPEN — counsel-pending`, `pending_since` (set at PR1 merge), and `next_review_date` (set at `pending_since + 365d`)

---

## 2. 12-month forcing-function backstop

**Rule:** regardless of whether any Step 8 counsel-trigger fires (see [counsel-input-package.md](counsel-input-package.md) §"Triggers"), the audit-retention-basis decision MUST be formally re-reviewed at 12 months from the tranche-1 merge date (i.e., when F-DSAR16's `next_review_date` is reached).

**Why this exists:** without a calendar backstop, the "counsel-pending" status can persist indefinitely. Art 5(1)(e) (storage limitation) is a continuing obligation — silent indefinite deferral is itself a compliance risk. The backstop forces an affirmative re-decision every year.

**Re-review outcomes (exactly one of):**
1. **Counsel determines basis.** Replace this runbook's §1 with the determined retention period; update F-DSAR16 status to `CLOSED — counsel-determined`; implement the purge mechanism per §3.
2. **User acknowledges continued deferral.** Update F-DSAR16's `next_review_date` to `today + 365d` with a brief written rationale (commit to D5). Counsel-pending status remains open. This is the "we are still waiting on counsel and accept that risk" path.
3. **D5 status re-classification.** If circumstances change (e.g., the DSAR Lambda is decommissioned, audit table is migrated, organizational risk tolerance shifts), update the D5 row to reflect the new classification.

A re-review that produces none of (1), (2), or (3) is a process failure — escalate.

**Operator reminder:** the `next_review_date` in F-DSAR16 IS the forcing function. There is no separate automation that pages on this date today. The yearly re-review is a manual operator obligation. (Automating this becomes a candidate for tranche-3 work; see §6.15 of the fix-now-4 plan for tranche-3 commitment triggers.)

---

## 3. Purge mechanism (when counsel determines)

When counsel determines a retention period, purges are performed manually using the `created_at` GSI added to the audit table at PR1 H4.

### 3.1 GSI shape

- Partition key: `created_at_partition` — ISO 8601 year-month prefix (e.g., `2025-05` for any row created in May 2025). Computed by the DSAR Lambda at write time as `event_timestamp[:7]`.
- Sort key: `event_timestamp` — the ISO 8601 microsecond-precision timestamp used as the table's SK.
- Projection: `ALL` — purge requires full item read to log what is being deleted.

### 3.2 Why a GSI (not a Scan)

Without the GSI, eventual purge would require a full table Scan (potentially $$$ at scale, and operationally slow). The GSI lets the operator restrict reads to a single year-month partition per Query and walk back through eligible rows in O(N) where N = rows in that month.

Adding the GSI at table creation time is cheap (~0 cost at current zero-DSAR scale). Retroactively adding it once the table has accumulated thousands of rows requires an online backfill, which is operationally heavier and not free. Therefore: add at creation time.

### 3.3 Purge procedure (illustrative — DO NOT RUN until counsel-pending closes)

```bash
# Counsel-determined cutoff (example: "delete rows older than 7 years")
CUTOFF=$(date -u -v-7y +%Y-%m-%dT%H:%M:%SZ)
TARGET_YM=$(echo "$CUTOFF" | cut -c1-7)

# 1. Pre-purge audit: list what will be deleted
AWS_PROFILE=myrecruiter-staging aws dynamodb query \
  --table-name picasso-pii-dsar-audit-staging \
  --index-name ByCreatedAt \
  --key-condition-expression "created_at_partition = :ym AND event_timestamp < :cutoff" \
  --expression-attribute-values "{\":ym\":{\"S\":\"$TARGET_YM\"},\":cutoff\":{\"S\":\"$CUTOFF\"}}" \
  --query 'Items[].[dsar_id,event_timestamp,event_type]' --output table

# 2. BEFORE delete: DDB resource policy delete-deny MUST be temporarily lifted
#    by an explicit Terraform change. Counsel-determined purges are NOT
#    operator-routine; each purge is a deliberate IaC PR with named cutoff +
#    rationale. See §4 below for the policy-modification sequence.

# 3. After delete-deny is lifted: per-row DeleteItem with verbose logging
# (loop through query result; PK=dsar_id, SK=event_timestamp)

# 4. After purge: re-apply delete-deny via Terraform (revert §4 lift PR)
```

**Per-purge documentation requirement:** every purge produces a memory file (`project_pii_dsar_audit_purge_<YYYY-MM-DD>.md`) capturing: counsel determination basis, cutoff, row count, post-purge table-count, lift+re-apply IaC PR IDs, operator signoff. Append to D5 as a closed row.

---

## 4. Modifying the delete-deny resource policy

The DDB resource policy `AuditDeleteDeny` (added in PR1 C2) is the structural enforcement of "no operator can casually delete audit rows." Lifting it for a counsel-determined purge is a deliberate, gated operation:

1. Author a dedicated IaC PR that removes (or scopes-down) the resource policy with explicit purge-cutoff rationale in the commit message. Do NOT lift it in the same PR that performs the deletes — separation prevents an operator error from cascading.
2. After merge + apply, perform the purge per §3.3.
3. Author the re-apply IaC PR. Get this merged and applied BEFORE marking the purge complete.
4. Smoke-assert post-re-apply that `DeleteItem` returns `AccessDenied` again (per the smoke pattern in [`kms-pii-staging-policy-change-runbook.md`](kms-pii-staging-policy-change-runbook.md) §6).

If steps 1 and 3 happen but step 2 never lands (operator error, change-of-mind), the table is left UNPROTECTED until the re-apply lands. Track this in a memory file and time-box it (target: same-day re-apply).

---

## 5. PITR + restore considerations

DDB Point-in-Time Recovery is enabled on the audit table. A PITR restore creates a new table that does NOT inherit the source's resource policy (see [`kms-pii-staging-policy-change-runbook.md`](kms-pii-staging-policy-change-runbook.md) §6). After ANY PITR restore, re-apply the resource policy per the cross-reference there before cutting traffic.

## 5.1 C2 SSE-KMS deferral status (added 2026-05-22)

The audit table currently uses default DDB SSE (AWS-owned key). The intended association with `kms-pii-staging` (per fix-now-4 PR1 C2) failed in apply with `AccessDeniedException: DynamoDB service principal does not have access to the key` — the CMK policy lacks a `Principal: Service = dynamodb.amazonaws.com` Allow.

Per the Apply-1 phase-completion-audit (2026-05-19), Apply-2-style work (associating CMK with PII data tables) MUST NOT proceed until preconditions G-3/4/5/6/7 from that audit are satisfied. Adding a service-principal Allow to the CMK policy is the documented standard for DDB SSE-KMS but constitutes a policy widening that should be evaluated against those preconditions.

Tracked in D5 as the C2-SSE-deferred row (added 2026-05-22). Resolution paths (any one):
1. Apply-2 precondition PR lands → CMK gets `dynamodb.amazonaws.com` service-principal Allow → audit-table SSE-KMS association attempt resumes
2. Tranche-2 commitment trigger fires (Atlanta LOI / first Meta DSAR / 90d post-tranche-1) → Apply-2 work scheduled holistically
3. Operator + counsel determine default DDB SSE is acceptable for the audit table's sensitivity profile (operator-side PII + DSAR metadata, not consumer PII) → C2 SSE-KMS waived with rationale

---

## 6. Reference

- D5 row: [`privacy-risk-register.md`](privacy-risk-register.md) F-DSAR16
- Plan: `~/.claude/plans/pii-dsar-fixnow4-implementation-plan.md` §4 PR1 H4 + §6 gate 12 (12-month backstop) + §0 v2.4→v2.5 🔴-I closure
- Counsel context: [`counsel-input-package.md`](counsel-input-package.md) §"Triggers"
- v3 spec: [`CONSUMER_PII_REMEDIATION.md`](CONSUMER_PII_REMEDIATION.md) §"Path A Re-baseline v3"

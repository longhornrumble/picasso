# F-DSAR-C2-SSE-DEFER — binary decision

**Date:** 2026-05-23.
**Owner:** Chris.
**D5 row:** `F-DSAR-C2-SSE-DEFER` (added 2026-05-22 after fix-now-4 PR1 partial-apply).
**Closes:** [`MASTER_PROJECT_PLAN.md`](./MASTER_PROJECT_PLAN.md) M1 done-bar #6.
**Related:** [`audit-table-retention-runbook.md`](./audit-table-retention-runbook.md) §5.1, [`MASTER_PROJECT_PLAN.md`](./MASTER_PROJECT_PLAN.md) M7.

## The decision

**Choice: (a) — OPERATOR-METADATA-PROFILE WAIVER + counsel-pending-revisit tag.**

The audit table `picasso-pii-dsar-audit-staging` remains under default DDB SSE (AWS-owned key) until **either** a counsel-trigger fires (re-evaluating the waiver) **or** M7 ships (Apply-2 unlock makes SSE-KMS association possible at no incremental design cost).

This closes the F-DSAR-C2-SSE-DEFER row's "either/or" status from a deferral to an explicit waiver. The waiver remains revocable — if the conditions below stop holding, the row reopens.

## Why (a) and not (b)

### What the audit table actually contains

Per [`audit-table-retention-runbook.md`](./audit-table-retention-runbook.md) §"Audit row contents (sensitivity classification)":
- `dsar_id`, `event_timestamp`, `event_type`, `status`, `created_at_partition` — DSAR-request metadata (operator-side, pseudonymous).
- `details` JSON blob — operator-actionable context: tenant_id, operator email, error codes, walker outcomes.
- **The DSAR Lambda's audit-write path is engineered to NEVER serialize consumer email or `normalized_email`** (PR1 D1 + E2 work, verified by tests `test_d1_form_submissions_corrupted_row_log_omits_pii_subject_id`, `test_d1_notification_sends_corrupted_row_log_omits_recipient`, `test_e2_subject_resolution_client_error_does_not_leak_email_in_response`).

**The strongest claim is therefore:** the table contains operator-side PII (operator email) and pseudonymous DSAR-request metadata; **NOT raw consumer PII.**

### Why default DDB SSE is proportionate

- AWS-owned-key SSE is the AWS baseline encryption-at-rest for DDB — every row is encrypted, just not with a customer-managed key.
- D4 classification places operator-side PII (operator email) at Tier 2, not Tier 3 — and Tier 2 controls do not mandate CMK ("tenant-isolated; access controlled; no unnecessary logging; retention defined; deletion/export possible"; SSE-KMS is a Tier 3 escalation per D4 §B Tier 3 controls "restrict access" via CMK scoping).
- The DSAR-request metadata (dsar_id, timestamps, event types) is operationally pseudonymous — no consumer-rights subject can be re-identified from this metadata alone without joining against the consumer-PII tables (which would require CMK-protected delete-role access).

### Why (b) blocked-pending-M7 is over-scoped

(b) keeps the row OPEN until M7 ships. M7 is DEFERRED-with-named-trigger:
- Tenant-#2 DPA requirement that demands at-rest encryption posture
- Regulator inquiry
- Threshold-crossing feature
- Operator + counsel determine SSE-DDB no longer acceptable

If M7 never fires, (b) keeps F-DSAR-C2-SSE-DEFER open indefinitely with no remediation path. That violates the master plan's discipline against "silent indefinite deferral" (see §4 continuous obligations — 2027-05-20 calendar safety floor).

(a) is the proportionate choice for current state. (b) becomes correct only if the table's sensitivity profile changes (e.g., audit blob ever serializes consumer PII despite current design intent) or external pressure forces M7.

## Counsel-pending-revisit triggers

This waiver MUST be reconsidered if any of the following fires:

1. **Counsel response on Q1 (G-I, controller/processor)** determines audit-trail confidentiality is part of MyR's controller obligations under CCPA/CPRA — counsel may require CMK on the audit row to support the controller-side audit-integrity defense.
2. **Counsel response on Q3 (G-G, under-match reasonable steps)** determines DSAR audit trail must be customer-managed-key-protected to support "reasonable steps" defense.
3. **Audit blob design changes** to serialize consumer PII (would require D1 redaction rework + this waiver revocation).
4. **Tenant DPA with a tenant** that demands at-rest CMK for audit metadata.
5. **Regulator inquiry** that specifically questions DSAR audit-trail confidentiality.
6. **M7 ships for unrelated reasons** — at that point, audit-table SSE-KMS association is no-incremental-cost; revoke this waiver and associate.

## Operational posture (what stays in place)

These compensating controls remain active under the waiver:

- **C2 `AuditDeleteDeny` resource policy** (shipped PR1) — prevents any principal from `DeleteItem` on the audit table; immutability posture intact.
- **H3 CMK Allow + Deny-exception list** (shipped PR1) — DSAR role added to CMK's `DataPlaneAllowListedRoles` and `DenyDecryptToAllOtherPrincipals` exception; this is forward-prep for when SSE-KMS lands (e.g., when M7 ships).
- **H4 ByCreatedAt GSI** (shipped PR1) — supports eventual counsel-determined purge per the retention runbook.
- **D1 PII redaction + E2 ClientError handling** (shipped PR1) — guarantees no consumer email/normalized_email in audit blob.
- **Audit-table retention runbook** ([`audit-table-retention-runbook.md`](./audit-table-retention-runbook.md)) — counsel-pending retention + 12-month forcing function backstop intact.

## Waiver expiry / revocation

This waiver does NOT expire on a calendar — it stays in effect until a revisit trigger fires.

If a revisit trigger fires:
1. Update this decision doc with the revocation rationale.
2. Update D5 row F-DSAR-C2-SSE-DEFER status to OPEN with severity reflecting the new conditions.
3. Schedule the SSE-KMS association work under M7 (or fast-track if regulator/counsel demands).
4. Operationally, the H3 CMK exception list is already in place — only the DDB UpdateTable call (with CMK service-principal Allow added) is needed once M7 unlocks it.

## Decision recorded by

Chris Miller (Founder), 2026-05-23, with proposed rationale above. User sign-off on this waiver = merge of the PR carrying this decision doc.

## Cross-references

- D5 row: [`privacy-risk-register.md`](./privacy-risk-register.md) `F-DSAR-C2-SSE-DEFER`
- Master plan: [`MASTER_PROJECT_PLAN.md`](./MASTER_PROJECT_PLAN.md) M1 done-bar #6 + M7 (alternative path)
- Audit-table retention: [`audit-table-retention-runbook.md`](./audit-table-retention-runbook.md) §5.1
- Apply-1 audit preconditions: `~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_consumer_pii_remediation_path_a_phase2_apply1_audit_2026-05-19.md` (G-3..G-7 must be satisfied before any CMK-on-data-tables work; this waiver does NOT preempt them)
- fix-now-4 v2.6 amendment: `~/.claude/plans/pii-dsar-fixnow4-implementation-plan.md` (PR1 partial-apply that produced this deferral)

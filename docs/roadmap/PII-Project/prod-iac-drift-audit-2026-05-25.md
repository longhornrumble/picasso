# PII Prod Drift Audit Report

**Account**: 614056832592 (prod-614)
**Profile**: myrecruiter-prod
**Generated**: 2026-05-25T01:05:06Z

**Method**: read-only `describe-table` + `describe-time-to-live` + `describe-continuous-backups` against the 5 prod PII surfaces named in `dsar-operator-playbook.md` §3.1 substitution table. Expected-state derived from staging IaC modules under `infra/modules/ddb-*`.

## Findings table

| Prod table | TTL (expected) | TTL (actual) | PITR (expected) | PITR (actual) | SSE (expected) | SSE (actual) | DelProt (expected) | DelProt (actual) | Drift? |
|---|---|---|---|---|---|---|---|---|---|
| `picasso_form_submissions` | enabled:ttl | enabled:ttl | enabled | disabled | default | default | disabled | disabled | **YES** |
| `picasso-notification-sends` | enabled:ttl | enabled:ttl | enabled | disabled | default | default | disabled | disabled | **YES** |
| `picasso-notification-events` | enabled:ttl | enabled:ttl | enabled | disabled | default | default | disabled | disabled | **YES** |
| `production-recent-messages` | disabled | disabled | enabled | disabled | default | default | disabled | disabled | **YES** |
| `picasso-session-summaries` | enabled:ttl | enabled:ttl | enabled | disabled | default | default | disabled | disabled | **YES** |

## Summary

**Total drift findings**: 5 of 5 surfaces.

⚠️  Drift detected; see findings table above. Each drift row should be classified as one of:
- **(a) acceptable historical pattern** (record rationale; no action)
- **(b) fix-now** via prod Terraform import or explicit cutover work
- **(c) accept-with-named-trigger** (record trigger condition + calendar backstop)

## Sub-scope follow-ups (per audit-of-audit v0.21 — M9.G5 Step 1.5+)

Beyond the 5-surface DDB config drift check above, F-DSAR21 scope (post-2026-05-24 audit-of-audit expansion) also includes:

- **Sprint B placeholder-body anomaly** — staging DSAR Lambda returned placeholder-shaped response body despite CodeSha256 matching expected (`2tQsnrZ9vA0V7DJQH+1RBPgAF0XDbKY/d31OXChgvtg=`). Separate investigation needed — likely a Lambda env-var-driven code path or a wrapper hand-off mismatch, not a DDB drift.
- **Python+Node writer-pair enumeration** — list all surfaces with dual writers (BSH Node, MFS Python) and confirm wire-format parity is currently held (contract tests cover form_submissions + audit-table; enumerate remaining pairs).
- **Audit-table CloudTrail data-events config** — confirm `picasso-pii-dsar-audit-staging` is named in the staging-525 CloudTrail `data-events` selector OR document that it isn't, with rationale (operator-only writes today; tamper visibility relies on the 4-action append-only resource policy).
- **Prod CloudTrail → CW Logs export** — investigate enabling `myrecruiter-management-events` `CloudWatchLogsLogGroupArn` for prod UpdateTimeToLive alarming (sub-item routed here from M9.G7 closure).

These are M9.G5 sub-step targets, NOT part of Step 1 (this script). They each require their own scoped investigation.

## Drift disposition (recommended)

The drift is **uniform**: PITR is disabled on all 5 prod PII tables vs PITR enabled in staging IaC. TTL + SSE + DeletionProtection all match expected state across the board. The one drift dimension is **PITR (point-in-time recovery)**.

**Recommended classification: (c) accept-with-named-trigger** for all 5 surfaces.

**Why (c) and not (b) fix-now:**

1. **Risk class is DR/availability, not privacy/compliance.** PITR enables ~35-day continuous-backup-based recovery. The privacy/compliance posture (DSAR fulfillment, audit logging, retention) is independently controlled by TTL + append-only audit table + the documented operator playbook. PITR adds defense-in-depth against accidental delete, not a new privacy capability.
2. **Mutation cost is non-trivial.** Enabling PITR on a hand-managed prod table requires either (i) a per-table `aws dynamodb update-continuous-backups` CLI mutation, or (ii) waiting for the prod-cutover-to-Terraform program (no committed date). Either path is an explicit prod write, not a code change.
3. **No active blast radius.** No DSAR currently waiting on PITR. No incident has surfaced a need for sub-35-day point-in-time restore. The M4.G2 backfill scope (the most recent prod write) is already complete and audit-logged.
4. **Cost has a non-trivial recurring component.** Enabling PITR on `picasso-session-summaries` (863 prod rows scanned during M9.G4 G4 rehearsal — likely the largest of the 5 surfaces) and `picasso_form_submissions` (47 rows) carries a small but non-zero monthly AWS charge for retained backups. Not a blocker, but a real bill-impact that warrants user-acknowledged decision rather than silent enablement.

**Named triggers (any one fires → PITR-enable becomes mandatory):**

- **First prod DSAR ever received** — compliance pressure to verify "if we deleted the wrong row, we can recover" is real at the moment of a real subject request.
- **First DDB data-loss incident on any of the 5 surfaces** — accidental delete, schema mistake, AWS-side incident.
- **Prod cuts over to per-resource Terraform** — at that point, the staging-IaC PITR=enabled posture flows through naturally and this drift closes by default.
- **Calendar backstop: 2026-08-22 D2/D3/D4 currency review** — aligned with the existing F-DSAR21 + M7 (Apply-2) trigger family. If none of the above has fired by then, explicit re-decision required.

**Acceptable historical-pattern framing (the (a) framing rejected):** PITR drift cannot be cleanly framed as "acceptable historical pattern" because staging IaC IS the spec — staging proves PITR works on these table shapes with no operational overhead. The drift exists because prod predates the staging IaC convention, not because PITR is unsuitable for prod.

**Fix-now framing (the (b) framing rejected):** would require either a 5-table prod CLI mutation now (small but real prod-mutation risk; Sprint G4 G4 lesson about prod data ops authorization applies even to `update-continuous-backups` config writes) OR scoping the M7-class Terraform cutover prep work. Neither is right-sized for M9.G5 Step 1's "0.5d audit script" framing.

**What this disposition commits to:** the drift is recorded honestly; the (c) classification is on-record with rationale; future audits + the 2026-08-22 review have a falsifiable decision contract.

## Methodology lessons (for future audits)

1. **Read-only audit at hand-managed/IaC boundaries is right-sized.** This script took <1 minute to run against 5 surfaces. The drift was empirically surfaced in 30s of CLI calls. The cost of NOT running this was 18 months of unobserved divergence between staging IaC spec and prod reality.
2. **Uniformity of drift is itself a signal.** When all 5 surfaces drift the same way on the same dimension, the cause is structural (the IaC convention was added after the prod tables existed), not per-table neglect. Per-surface remediation would be wrong; the right remediation is the per-resource Terraform cutover program.
3. **Decision-doc-vs-fix-now-PR pattern.** This script + decision doc is the audit artifact. Any remediation (PITR-enable, Terraform cutover) is a separate, scoped PR with its own audit trail. Mixing audit findings + remediation in one PR makes the audit unreviewable.

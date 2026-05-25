# Audit-Table CloudTrail Data-Events Investigation (M9.G5 Step 1.5 — F-DSAR21 sub-step)

**Date**: 2026-05-25
**Scope**: confirm whether DDB data events on `picasso-pii-dsar-audit-staging` are captured by any CloudTrail (compensating control for the audit-of-audit row 21 structural tamper concern).
**Method**: read-only `describe-trails` + `get-event-selectors` against staging-525 + grep across `infra/` for any locally-defined trail.
**Result**: NO CloudTrail captures data events on the audit table today. No compensating control exists for the row-21 tamper concern.

## Findings

**Trails visible from staging-525 (account 525409062831, profile `myrecruiter-staging`)**: one — the `myrecruiter-montycloud` Organization Trail (vendor-managed; trail itself owned by management account; ARN: `arn:aws:cloudtrail:us-east-1:525409062831:trail/myrecruiter-montycloud`). Cannot read selectors from staging-525 (TrailNotFoundException — selector visibility belongs to the trail owner) but the same OrgTrail's selectors were captured from prod-614 in `prod-ct-cw-logs-export-2026-05-25.md`:

> Management events ONLY. No data events.

**Staging-525-owned trails**: NONE. No `aws_cloudtrail` resource exists anywhere under `infra/`. No locally-defined trail to add data events to.

**Audit-table IaC** (`infra/modules/ddb-pii-dsar-audit-staging/main.tf`): no `cloudtrail` / `data_events` / `event_selector` references; the module manages the DDB table + its resource policy only.

## Risk recap (audit-of-audit row 21)

The audit table has a 4-action Deny resource policy (Delete/Update/BatchWrite/PartiQL) — this prevents tampering with existing rows. But it CANNOT prevent operator `PutItem` from compromised staging SSO credentials writing **fabricated audit rows**. Legitimate manual audit rows from prod DSARs are written via operator `PutItem` too (see playbook §6 step 4), so blanket-denying PutItem would break the legitimate workflow.

The proposed compensating control: CloudTrail data events on the audit table → every PutItem (legitimate or fabricated) generates a CT event → reconciliation against the DSAR Lambda's audit-writer logs identifies which PutItems are legitimate (Lambda-originated) vs fabricated (direct CLI-originated). Without CT data events, no such reconciliation is possible.

## Implementation options

| Option | Effort | Cost | Trade-offs |
|---|---|---|---|
| **(A) Add data events to the OrgTrail** | Coordinate with MontyCloud (vendor); not in our control | included in OrgTrail's existing CW Logs path | We don't own the data event selectors; vendor changes could break our reconciliation; tight coupling. |
| **(B) Create new staging-525-owned trail with data events for audit table only** | New Terraform module `infra/modules/cloudtrail-audit-table-staging/`; ~1h to author + ~1h to apply + smoke | $0.10/100K events ≈ <$0.01/mo at current audit-table write volume (~few rows/day at most); plus S3 storage ($0.023/GB) | We own selectors + retention; clean separation; small terraform footprint; one more trail to operate. |
| **(C) Compensating control via CloudWatch Logs metric filter on DSAR Lambda audit-writer logs** | Existing `pii_subject.py` already logs every write; add CW Logs metric filter on success log line → emit `Picasso/PII/AuditWritesLegitimate` metric. Combined with a scheduled reconciliation Lambda comparing actual audit-table rows vs metric count → fabricated writes = (actual_rows - legitimate_count) | metric filter free; reconciliation Lambda ~$0/mo at current volume | Doesn't catch a fabricated PutItem that happens BEFORE the reconciliation Lambda's next scan. Eventual detection, not real-time. More moving parts than option B. |
| **(D) Defer-with-trigger** | none today | $0 | No compensating control today; tamper visibility deferred until trigger fires. |

## Disposition: (D) defer-with-named-trigger

Aligned with the **F-DSAR-SoD** D5 row (added 2026-05-24 in M9.G4 Sprint G3) which already documents single-actor prod DeleteItem confirm as "acceptable at current solo-operator scale, trigger-on activation."

The audit-table tamper concern is structurally similar:
- Risk = compromised staging SSO credentials writing fabricated audit rows
- Current mitigation = solo-operator scale (only Chris has staging SSO; risk = laptop session token theft, not insider abuse)
- Compensating control needed when scale changes

**Named triggers (any one → build option B)**:
- **Second operator joins** — at that point fabricated-vs-legitimate distinction becomes a real concern (insider risk). Same trigger as F-DSAR-SoD activation. **(B) becomes the lift-and-shift control alongside any SoD work.**
- **Atlanta tenant LOI received** — regulator visibility on the audit register's integrity becomes material; tamper visibility expected at audit time.
- **Any audit-of-audit finding flags compromised staging credentials as a real concern** — escalates from acceptable risk to active-build.
- **Calendar backstop 2026-08-22 D2/D3/D4 currency review** — explicit re-decision required if no other trigger has fired.

**Why not option (A) MontyCloud OrgTrail change**: not in our control; coupling our reconciliation logic to a vendor's trail config introduces a silent-break risk identical to the one flagged in the `prod-ct-cw-logs-export-2026-05-25.md` doc.

**Why not option (B) build now**: no active blast radius; cost is low but non-zero; operating one more trail adds operational overhead disproportionate to the current single-operator threat model. Trigger-on activation is right-sized.

**Why not option (C) reconciliation Lambda**: more moving parts than option (B); eventual-not-real-time detection; option (B) gives strictly better tamper visibility for similar cost.

## What this closes

- **M9.G5 Step 1.5 sub-item (audit-table CloudTrail data-events config)**: ✅ closed via this document.
- **F-DSAR21 scope-expansion item (d) Audit-table tamper structural concern (audit-of-audit row 21)**: ✅ closed — compensating control gap documented; build path (option B) chosen; triggers + cost recorded.

## What this does NOT close (last remaining M9.G5 Step 1.5 sub-item)

- Sprint B placeholder-body anomaly investigation — staging DSAR Lambda returned placeholder-shaped response body despite CodeSha256 match. Needs deployed-code SHA vs source SHA investigation; potentially expandable; the only Step 1.5 sub-item that requires touching the deployed Lambda artifact rather than read-only metadata.

## Cross-references

- F-DSAR-SoD D5 row (2026-05-24 Sprint G3) — sibling deferred concern in the same risk family
- M9.G4 audit-of-audit row 21 (audit-table tamper structural concern) — the original surface
- `prod-ct-cw-logs-export-2026-05-25.md` — methodology note on vendor-trail coupling applies here too
- Master plan §M6 (Atlanta gate) — names the LOI trigger

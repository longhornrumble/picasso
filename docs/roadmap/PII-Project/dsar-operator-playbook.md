# DSAR Operator Playbook v1

**Status:** v1.1 — published 2026-05-23; **prod-CLI variant added 2026-05-24 (M9.G4 / F-DSAR20 closure)**.
**Owner:** Chris Miller.
**Scope:** zero-volume / solo-founder DSAR fulfillment for the Picasso platform as it stands today (Path A v3 capability bundle item 1a deployed via M1; M3 SLA monitor LIVE in staging acct 525 since 2026-05-23T08:13Z; M2 ARCHIVE/Meta extension pending; M9.G4 prod-tenant manual-walk variant SHIPPED 2026-05-24).
**Updates expected:** v1.2 after M2 (Meta/S3/ARCHIVE walker LIVE); v1.3 after counsel-Q1 (G-I) response refines verification posture.

## Operational state (live as of 2026-05-23T08:15Z post-M3 deploy)

| Component | State | Where |
|---|---|---|
| DSAR Lambda (M1) | LIVE | `picasso-pii-dsar-staging` in acct 525; CodeSha256 `HNo+XSi67mi9wYmRoDzRojXrx9GNUCtBbHFl3PRYJrg=` |
| Audit table 4-action Deny (M1) | LIVE | `picasso-pii-dsar-audit-staging` resource policy in acct 525 |
| SLA Monitor Lambda (M3 #1) | LIVE | `picasso-pii-dsar-sla-monitor-staging` in acct 525; CodeSha256 `gBwoFCFJu2xt1CAgqOxBYyBYwm7atlxFJllPZvtWnHc=`; daily 14:00 UTC EventBridge schedule. Test-fire 2026-05-23 confirmed: at-risk detection + SNS publish + skip-on-closed all work end-to-end. SNS topic `picasso-ops-alerts-staging`; operator confirms email subscription. |
| Bedrock invocation logging (M3 #4) | OFF in staging (525) + prod (614) — verified 2026-05-23 | `aws bedrock get-model-invocation-logging-configuration` empty response in both accounts |
| ARCHIVE_BUCKET (M3 #5) | STAGING: `picasso-archive-staging` verified — SSE-S3, lifecycle, public-access blocked, **versioning ENABLED** (F-DSAR17). PROD: verified 2026-05-23 — **no prod session-archiver Lambda exists** (26 prod-614 Lambdas, none with archive/session-archiver in name, none carrying `ARCHIVE_BUCKET` env var). Archive surface is staging-only at current product state. | See [`archive-reachability-decision.md`](./archive-reachability-decision.md) |
| Gmail `privacy@` alias + 3 labels + filter (M3 #3) | LIVE | Operator-created 2026-05-23: alias `privacy@myrecruiter.ai` (Google Workspace admin); 3 labels `dsar/open`, `dsar/awaiting-verification`, `dsar/closed` (Gmail Web UI); 1 filter on `to:privacy@myrecruiter.ai` auto-applying `dsar/open` (Gmail Web UI). Filter applies `dsar/open` only — the other two labels are workflow-state toggles operator switches manually per playbook §1. |
| M4 #1 widget claim (Picasso) | STAGING LIVE 2026-05-23T17:08Z (`npm run build:staging` + `aws s3 sync` to `picasso-widget-staging` + CF `E3G30AUOEJTB36` invalidation `I9LYUMWR0O94OZ1UVAT26ASYTZ`; `curl staging.chat.myrecruiter.ai/iframe-main.js | grep` returns 0). PROD `chat.myrecruiter.ai` operator-pending: requires staging→main promotion + `deploy-production.sh` (uses `chris-admin` profile + `s3://picassocode/` + CF `E3G0LSWB1AQ9LP`). |
| M4 #2 form-handler TTL (Lambda) | **STAGING FUNCTIONALLY VERIFIED 2026-05-23T17:37Z**. Active widget chat-form writer is `Bedrock_Streaming_Handler_Staging/form_handler.js` (Node.js) — empirically discovered via real form submission showing `submission_id=form_contact_<ms-timestamp>` (BSH naming) vs the UUID format used by Python `Master_Function_Staging/form_handler.py`. **PR #145 fixed BSH** (the actual writer); CI auto-deployed `KPBNLMSrlaEf72R54a1jBbNFnj4jALhot0/aQMJ0Ahs=` 17:28:39Z. Subsequent test submission `form_contact_1779557864165` written with `ttl=1811093864` = exactly `now+31,536,000s` (365 days) ✅. PR #142 (Python writer) remains correct but dormant for widget chat-form path. Prod (614) `Bedrock_Streaming_Handler` requires hand-managed promotion. |

This document is the **operational** companion to:
- [`MASTER_PROJECT_PLAN.md`](./MASTER_PROJECT_PLAN.md) — milestone roadmap (§M3 covers this playbook)
- [`privacy-risk-register.md`](./privacy-risk-register.md) — D5 §"Operational fulfillment workflow"
- [`dsar-verification-posture.md`](./dsar-verification-posture.md) — interim verification standing (counsel-pending refinement)
- [`dsar-log.md`](./dsar-log.md) — flat ledger of intake / status / closure dates
- [`templates/`](./templates/) — 7 response templates (M3 added `dsar-response-correction.md`)
- [`counsel-input-package.md`](./counsel-input-package.md) — counsel triggers (5 conditions for engagement)

When in doubt, **defer to the M8 counsel triggers** rather than improvise.

---

## §1 — Intake

### Channel

Single channel: **`privacy@myrecruiter.ai`** (Gmail alias; M3 done-bar #3, operator-configured).

Three Gmail labels (operator-attested):
- `dsar/open` — applied on intake; cleared at closure
- `dsar/awaiting-verification` — applied while identity verification pending; cleared on verification
- `dsar/closed` — applied at closure (replaces `dsar/open`)

Filter (operator-configured): incoming `privacy@` mail → auto-apply `dsar/open`.

### When a DSAR arrives

1. **Reply** acknowledging receipt within 1 business day. Suggested wording in [`templates/dsar-verification-request.md`](./templates/dsar-verification-request.md) §"Acknowledgment opener" — short, professional, no commitment beyond "we received your request and will respond within the legal SLA."
2. **Create the row in `dsar-log.md`**: generate `dsar_id` (`dsar-YYYYMMDD-NNN` per ledger convention); populate `intake_date`, `request_type` (best-guess from email; revise after verification), `claimed_email`, `tenant_inferred`, `verify_by`, `respond_by`. Commit.
3. **Apply** `dsar/awaiting-verification` Gmail label.

### Per-request-type decision tree (the four paths)

The decision determines which fulfillment flow + template + audit row applies. **All four require identity verification before action.**

```
DSAR INTAKE
   │
   ├── access / portability     → §3 Access path        → dsar-response-access.md
   │                             → request_type='access' Lambda mode
   │
   ├── delete / erasure         → §4 Delete path        → dsar-response-delete.md
   │                             → request_type='delete' Lambda mode
   │
   ├── correction / rectify     → §5 Correction path    → dsar-response-correction.md
   │                             → MANUAL walk (no Lambda mode yet — current scale)
   │
   └── no-record / mistaken     → §6 No-record path     → dsar-response-no-record.md
                                  → operator verifies subject not in subject-index;
                                    no Lambda invocation needed
```

If the request type is ambiguous (e.g., "I want my data removed" could mean delete OR opt-out), reply via `templates/dsar-verification-request.md` asking for clarification BEFORE starting verification — saves re-do.

---

## §2 — Identity verification

**Authoritative reference:** [`dsar-verification-posture.md`](./dsar-verification-posture.md). This section summarizes the interim standing; the verification doc is source-of-truth.

### Current standing (interim, counsel-pending refinement)

- Identity verification is **reasonable, not absolute** (CCPA §1798.140(ah) / Cal Reg §7060)
- **Minimum:** confirm the requester controls the email address on file by replying to the originating address (zero-cost, immediate)
- **For deletion requests:** add a second factor (e.g., confirmation of a recent interaction date / tenant name they engaged) when the request is from a Gmail/free-mail address with no prior correspondence with us
- **Refuse** with [`templates/dsar-refusal.md`](./templates/dsar-refusal.md) if:
  - The requester cannot confirm the email on file
  - The request comes from a third party claiming agency without a clear delegation (CCPA §1798.135 "authorized agent" rule applies — agent verification is more stringent than direct-subject)
  - The request would imperil other subjects' privacy (e.g., "give me all data on every volunteer at XYZ org" — refuse as overbroad)

### When verification completes

- Update `dsar-log.md` `verify_date`
- Remove `dsar/awaiting-verification` Gmail label
- Proceed to the relevant fulfillment path (§3–§6)

### Counsel trigger

If a DSAR raises any of the 5 counsel-engagement triggers (per [`counsel-input-package.md`](./counsel-input-package.md) §"Trigger conditions"), **pause fulfillment** and engage counsel BEFORE responding. Most common trigger in DSAR context: subject claims jurisdiction outside CCPA (e.g., GDPR EU subject), OR subject involves a tenant relationship the platform doesn't cleanly fit (e.g., employee-on-recruiting-side DSAR vs consumer DSAR).

---

## §3 — Access / portability path

**Goal:** return all PII held about the subject in MyR-controlled systems, in human-readable JSON, within SLA.

### Procedure

1. **Resolve `pii_subject_id`** via the subject-index lookup:
   ```bash
   AWS_PROFILE=myrecruiter-staging aws dynamodb get-item \
     --table-name picasso-pii-subject-index-staging \
     --key '{"tenant_id":{"S":"<TENANT_ID>"},"normalized_email":{"S":"<email.lower().strip()>"}}'
   ```
   - If row found, capture `pii_subject_id`.
   - If NOT found, this is likely a pre-Phase-1 subject (F-DSAR1) OR no record exists. Proceed to §3.4 manual fallback to confirm before responding with "no record found."

2. **Invoke DSAR Lambda in access dry-run mode** (verifies surfaces reachable, no PII returned in this step — just counts):
   ```bash
   AWS_PROFILE=myrecruiter-staging aws lambda invoke \
     --function-name picasso-pii-dsar-staging \
     --payload '{
       "request_type": "access",
       "tenant_id": "<TENANT_ID>",
       "pii_subject_id": "<PII_SUBJECT_ID>",
       "normalized_email": "<email.lower().strip()>",
       "dry_run": true
     }' \
     --cli-binary-format raw-in-base64-out /tmp/dsar-access-dry.json
   cat /tmp/dsar-access-dry.json | python3 -m json.tool
   ```

3. **Re-invoke in non-dry-run** to capture the JSON export:
   ```bash
   AWS_PROFILE=myrecruiter-staging aws lambda invoke \
     --function-name picasso-pii-dsar-staging \
     --payload '{
       "request_type": "access",
       "tenant_id": "<TENANT_ID>",
       "pii_subject_id": "<PII_SUBJECT_ID>",
       "normalized_email": "<email.lower().strip()>",
       "dry_run": false
     }' \
     --cli-binary-format raw-in-base64-out /tmp/dsar-access.json
   ```
   - `exported_rows` is the subject-scoped JSON export — projected per F-DSAR4 mitigation (drops `sessionId`, `messageId`, `expires_at`; Article 15 data-minimization).
   - **Inspect for any third-party PII** in `responses` / `content` fields. If present (subject's submission mentions another person's email/phone/name), redact before sending — that other person's PII is not yours to share.

4. **Manual fallbacks** (per-surface; appended to the JSON export with a `_followup` block when the Lambda flags coverage gaps):
   - **F-DSAR1 (pre-Phase-1 form-submission rows)**: Lambda emits `manual_followup` with copy-pasteable Scan; run it, merge results into export.
   - **F-DSAR4 (recent-messages no subject linkage)**: if subject reports chatting WITHOUT submitting a form, run direct sessionId queries (subject must provide approximate dates / session reference):
     ```bash
     AWS_PROFILE=myrecruiter-staging aws dynamodb query \
       --table-name staging-recent-messages \
       --key-condition-expression "sessionId = :s" \
       --expression-attribute-values '{":s":{"S":"<KNOWN_SESSION_ID>"}}'
     ```
     If sessionId unknown, the 0-72h window means the message likely already aged out (24h TTL + 48h DDB grace). Document the gap in the response.
   - **F12 (Meta-only subject)**: if subject reports interacting via Messenger only (no email submission), do PSID lookup via Meta Business Suite (operator must have admin access). Cross-reference with `picasso-channel-mappings-staging`. M2 ships an automated walker; until then, this is operator-manual.
   - **F14 (ARCHIVE_BUCKET)**: archive is empty as of M3 verification (2026-05-23); future-proof procedure documented in [`archive-reachability-decision.md`](./archive-reachability-decision.md). When non-empty, use version-aware listing (F-DSAR17 — versioning is enabled).

5. **Send** [`templates/dsar-response-access.md`](./templates/dsar-response-access.md) with the export attached as JSON (or pasted inline if small). Update `dsar-log.md` to `closed`.

### §3.1 — Access path for PROD tenants (M9.G4 / F-DSAR20 closure)

**When to use:** the subject is a consumer of a **prod tenant** (e.g., Austin Angels `AUS123957`). The DSAR Lambda + PII subject-index table are **staging-only** today (see [`README.md`](./README.md) deferred surfaces); prod DSAR fulfillment is **operator-manual** until M2 / M6 promote a prod-twin.

**Account guard — RUN FIRST every prod session** (refuses to proceed against the wrong account):
```bash
test "$(aws sts get-caller-identity --profile myrecruiter-prod --query Account --output text)" = "614056832592" \
  && echo "✅ Prod account confirmed (614056832592)" \
  || { echo "❌ STOP — wrong account; expected 614056832592"; exit 1; }
```

**Staging ↔ prod substitution table** (single source of truth — apply these to every snippet in §3 above):

| Surface | Staging name | Prod name (614) | Notes |
|---|---|---|---|
| Form submissions | `picasso-form-submissions-staging` | `picasso_form_submissions` | **Underscores, no `-staging` suffix.** Also note: `picasso_form_submissions_staging` (underscores AND staging) exists as a legacy artifact — do NOT use it; canonical staging is the hyphenated name. |
| Notification sends | `picasso-notification-sends-staging` | `picasso-notification-sends` | Standard `-staging` drop. |
| Notification events | `picasso-notification-events-staging` | `picasso-notification-events` | Standard `-staging` drop. |
| Recent messages | `staging-recent-messages` | `production-recent-messages` | **Prefix change**: `staging-` → `production-`. |
| Session summaries | `picasso-session-summaries-staging` | `picasso-session-summaries` | Standard `-staging` drop. |
| Channel mappings (F12) | `picasso-channel-mappings-staging` | **does not exist in prod** | Meta walker is staging-only; prod Meta-only subjects require manual Meta Business Suite lookup (F12 §7 procedure). |
| PII subject-index | `picasso-pii-subject-index-staging` | **does not exist in prod** | Staging-only; for prod manual walks, **skip step 1 (`get-item`) entirely** and proceed directly to per-surface scans by `submitter_email`. |
| DSAR audit | `picasso-pii-dsar-audit-staging` | **does not exist in prod** | All DSAR audit rows for prod DSARs are still written to the **staging** table — it is the cross-account canonical audit register (intentional design; one auditable system-of-record). |
| Archive bucket (F14) | `picasso-archive-staging` | **does not exist in prod** | No prod session-archiver Lambda exists (verified 2026-05-23 per `archive-reachability-decision.md`); prod archive walk is N/A at current product state. |
| AWS profile | `myrecruiter-staging` | `myrecruiter-prod` | SSO profiles per CLAUDE.md `## Deployment Model & SOP`. |

**Pre-substituted prod access-path commands (copy-paste-ready):**

```bash
# Step 1 (skipped): no PII subject-index in prod. Proceed directly to per-surface scans.

# Step 2 (manual; replaces Lambda invocation): form-submissions per-tenant scan.
AWS_PROFILE=myrecruiter-prod aws dynamodb scan \
  --table-name picasso_form_submissions \
  --filter-expression "submitter_email = :e AND tenant_id = :t" \
  --expression-attribute-values '{":e":{"S":"<email.lower().strip()>"},":t":{"S":"<TENANT_ID>"}}'

# Step 3 (manual): notification-sends scan by recipient_email.
AWS_PROFILE=myrecruiter-prod aws dynamodb scan \
  --table-name picasso-notification-sends \
  --filter-expression "recipient_email = :e" \
  --expression-attribute-values '{":e":{"S":"<email.lower().strip()>"}}'

# Step 4 (manual): recent-messages per-session query (operator obtains sessionId from §3 step 2 results, if any).
AWS_PROFILE=myrecruiter-prod aws dynamodb query \
  --table-name production-recent-messages \
  --key-condition-expression "sessionId = :s" \
  --expression-attribute-values '{":s":{"S":"<SESSION_ID>"}}'

# Step 5 (audit row → STAGING table; see no-record §6 step 4 for the put-item shape).
```

**Manual-walk surface checklist (operator initials each; required before sending response template):**

```
[ ] _____ Account guard executed; ✅ prod 614 confirmed
[ ] _____ Form submissions  — picasso_form_submissions (with tenant_id filter); rows attached/redacted
[ ] _____ Notification sends — picasso-notification-sends; rows attached/redacted
[ ] _____ Notification events — picasso-notification-events (by message_id from notification-sends); rows attached/redacted
[ ] _____ Recent messages — production-recent-messages (by sessionId; document 0-72h structural window if no sessionId)
[ ] _____ Session summaries — picasso-session-summaries (by sessionId)
[ ] _____ F12 channel-mappings — Meta Business Suite lookup if subject reports Messenger interaction (no prod table)
[ ] _____ F14 archive bucket — N/A at current product state (no prod archive bucket; verified 2026-05-23)
[ ] _____ DSAR audit row written to picasso-pii-dsar-audit-staging (cross-account; see §6 step 4 shape)
[ ] _____ Subject-disclosed PII redacted from export before send (third-party PII removed)
```

**Dry-run rehearsal (REQUIRED before first prod DSAR ever):** use synthetic identifier `rehearsal-noop-$(uuidgen)@example.invalid` against a prod tenant (the UUID suffix makes the synthetic collision-proof against any test seed data that might exist — audit row 20). Run EVERY scan listed in the §3.1 pre-substituted commands AND the §6.1 no-record path AND the notification-sends + session-summaries surfaces from the manual-walk checklist below; every query MUST return `Count=0` (the synthetic email has no rows), confirming the operator has working credentials + correct table names + correct CLI shape + IAM read access to each surface without any mutation. Record rehearsal output in [`dsar-log.md`](./dsar-log.md) as `request_type=rehearsal` and reference the UUID-keyed identifier used.

**Maintenance note:** if §3 above changes (new step, new flag), update §3.1 substitutions table + pre-substituted commands in the SAME PR. The duplication is intentional (advisor review 2026-05-23: operator should not mentally substitute under SLA pressure) but creates sync debt — keep the substitution table as the single source of truth for name-mapping; only the commands need re-pre-substitution.

---

## §4 — Delete / erasure path

**Goal:** remove all PII the subject holds about themselves from MyR-controlled systems, within SLA. Audit-table records of the deletion itself are intentionally append-only (Art 17(3)(b) carve-out per D5 G-J).

### Procedure

1. **Resolve `pii_subject_id`** (same as §3 step 1).

2. **Always start with dry-run** to count + verify surfaces:
   ```bash
   AWS_PROFILE=myrecruiter-staging aws lambda invoke \
     --function-name picasso-pii-dsar-staging \
     --payload '{
       "request_type": "delete",
       "tenant_id": "<TENANT_ID>",
       "pii_subject_id": "<PII_SUBJECT_ID>",
       "normalized_email": "<email.lower().strip()>",
       "dry_run": true
     }' \
     --cli-binary-format raw-in-base64-out /tmp/dsar-delete-dry.json
   ```
   - Confirm `rows_found` matches expectation. If suspiciously low, investigate before non-dry-run.

3. **Non-dry-run delete**:
   ```bash
   AWS_PROFILE=myrecruiter-staging aws lambda invoke \
     --function-name picasso-pii-dsar-staging \
     --payload '{
       "request_type": "delete",
       "tenant_id": "<TENANT_ID>",
       "pii_subject_id": "<PII_SUBJECT_ID>",
       "normalized_email": "<email.lower().strip()>",
       "dry_run": false
     }' \
     --cli-binary-format raw-in-base64-out /tmp/dsar-delete.json
   ```
   - Inspect `rows_deleted` vs `rows_found` per surface. `rows_delete_failed` non-zero = retry needed (likely transient DDB throttle).
   - `rows_skipped_corrupted` non-zero = manual operator investigation (row missing PK/SK).

4. **F9 tenant-coordination sequencing** (if subject's data was forwarded to a tenant's downstream system per their config):
   - Check the subject's `responses` for tenant-fulfillment indicators (e.g., webhook destination, downstream email).
   - If tenant has a Finding-9 sink (per [`myrecruiter-subprocessor-list.md`](./myrecruiter-subprocessor-list.md) is **not** the source — that's MyR's sub-processors, NOT tenants' downstream systems), send [`templates/tenant-sink-deletion-request.md`](./templates/tenant-sink-deletion-request.md) to the tenant's privacy contact AT THE SAME TIME as MyR's deletion. Note the tenant disposition in `dsar-log.md`.
   - Do NOT wait for tenant confirmation before responding to the subject — disclose the tenant's separate controller relationship per [`templates/dsar-response-delete.md`](./templates/dsar-response-delete.md) "What we have NOT been able to fully control" paragraph.

5. **Manual followups** (Lambda emits these explicitly; operator must resolve before closing):
   - F-DSAR1 pre-Phase-1 Scan (if applicable; copy-pasteable in Lambda's followup payload)
   - F12 Meta-PSID lookup (if Meta-only subject; manual until M2)
   - F14 ARCHIVE_BUCKET walk (currently no-op; bucket empty)
   - Any `unindexed_row` markers from the subject-index → operator confirms whether they're orphans or pre-Phase-1 (Apply-2 backfill candidates per F-DSAR1)

6. **Send** [`templates/dsar-response-delete.md`](./templates/dsar-response-delete.md). Update `dsar-log.md` to `closed`.

### §4.1 — Delete path for PROD tenants (M9.G4 / F-DSAR20 closure)

**When to use:** consumer of a prod tenant requests deletion. **Higher-risk procedure than §3.1 access** — every step mutates prod data, with no Lambda dry_run guardrail. The substitution table from §3.1 applies; this subsection adds delete-specific safety.

**Hard prerequisites (refuse to proceed without all four):**
1. **Prod account guard executed** (see §3.1; refuses if not on account 614)
2. **Staging account guard ALSO executed** (Sprint G3 / audit row 14 — the cross-account convention writes the DSAR audit row to `picasso-pii-dsar-audit-staging`; if your `myrecruiter-staging` SSO session is expired, the audit row write at step 5 will silently fail and leave the prod deletion un-audited):
   ```bash
   test "$(aws sts get-caller-identity --profile myrecruiter-staging --query Account --output text)" = "525409062831" \
     && echo "✅ Staging account also confirmed (525); audit-row destination reachable" \
     || { echo "❌ STOP — staging SSO is expired or wrong; refresh with: aws sso login --profile myrecruiter-staging"; exit 1; }
   ```
3. **Access path §3.1 completed first** — operator has the full per-surface row list from the access walk; deletion targets ONLY those rows (no Scan-then-delete in a single pass)
4. **Identity verification §2 completed AND counsel-trigger checklist §9 cleared** (delete is irreversible; verification bar is the highest of all paths)

**Separation-of-duties posture (Sprint G3 / audit row 15):** at current scale (sole operator), single-actor typed-confirm ("DELETE PROD" in `tools/dsar-invoke.sh`) is the approved posture. This is an explicit risk-acceptance, not an oversight. If a second operator joins (Atlanta LOI or later), a mandatory 4-eyes review for prod DeleteItem MUST be added to this procedure + wrapper BEFORE their first DSAR — recorded as a deferred-with-named-trigger gap in [`privacy-risk-register.md`](./privacy-risk-register.md) F-DSAR-SoD (route on trigger).

**Pre-substituted prod delete-path commands (copy-paste-ready). REHEARSAL FIRST**: run `describe-table` for each target table (per §4.1 rehearsal block below); the `aws dynamodb delete-item` API has NO `--dry-run` flag (that flag exists only on EC2 APIs — audit row 9), so the safe-rehearsal substitute is `describe-table` to confirm key shape + `--select COUNT` on a Scan with the targeted PK to confirm the row exists before deleting it.

```bash
# Step 1: Per matched form-submission row from §3.1 access walk, delete by submission_id PK.
# (Form-submissions table PK = submission_id; confirm via describe-table if unfamiliar.)
AWS_PROFILE=myrecruiter-prod aws dynamodb delete-item \
  --table-name picasso_form_submissions \
  --key '{"submission_id":{"S":"<SUBMISSION_ID_FROM_ACCESS_WALK>"}}' \
  --return-values ALL_OLD
# Inspect ALL_OLD output; confirms the row that was deleted (operator paste into dsar-log.md).
# ⚠️ INTERPRETATION (audit row 10): ALL_OLD returns the deleted row's attributes IF a row matched.
# If ALL_OLD returns an empty `{}` Attributes map, the row did NOT exist — looks identical to a
# successful delete of an already-TTL-expired row. RECHECK your submission_id from §3.1 step 2
# results before concluding the delete succeeded. A truly-deleted row returns non-empty Attributes.

# Step 2: Per matched notification-sends row, delete by composite key.
# (Notification-sends PK = recipient_email_norm OR a composite; confirm via describe-table.)
# Notification-sends rows are append-only audit-class; per advisor review 2026-05-23 (note: this
# citation pre-dates the formal M9.G4 prod-CLI scope — audit row 19 sync debt; if counsel-Q1
# (G-I) later overrides this carve-out, this §4.1 reference + the M3 §M3 done-bar #6 playbook
# both need updating in the same PR), do NOT delete notification-sends rows for a consumer DSAR —
# they are processing logs (Art 17(3)(b)/(e) carve-out parallel to DSAR audit table). Document
# this in the response: "we retain the fact that we sent you a notification, but the content
# of your submission is deleted."

# Step 3: Recent-messages — TTL handles natural eviction in 24h. For SLA-bound deletion confirmation,
# delete by composite (sessionId, messageId) per matched row.
AWS_PROFILE=myrecruiter-prod aws dynamodb delete-item \
  --table-name production-recent-messages \
  --key '{"sessionId":{"S":"<SESSION_ID>"},"messageId":{"S":"<MESSAGE_ID>"}}' \
  --return-values ALL_OLD

# Step 4: Session-summaries (if subject had session-summary rows from §3.1 walk).
AWS_PROFILE=myrecruiter-prod aws dynamodb delete-item \
  --table-name picasso-session-summaries \
  --key '{"sessionId":{"S":"<SESSION_ID>"}}' \
  --return-values ALL_OLD

# Step 5: Write DSAR audit row to STAGING audit table.
AWS_PROFILE=myrecruiter-staging aws dynamodb put-item \
  --table-name picasso-pii-dsar-audit-staging \
  --item '{
    "dsar_id":{"S":"<DSAR_ID>"},
    "event_timestamp":{"S":"<ISO_TIMESTAMP_with_microseconds>"},
    "event_type":{"S":"delete_completed"},
    "status":{"S":"closed"},
    "created_at_partition":{"S":"<YYYY-MM>"},
    "details":{"M":{
      "request_type":{"S":"delete"},
      "operator_caller_arn":{"S":"<YOUR_PROD_ARN>"},
      "env":{"S":"prod-614"},
      "tenant_id":{"S":"<TENANT_ID>"},
      "rows_deleted":{"N":"<TOTAL_COUNT>"}
    }}
  }'
```

**Delete-specific manual-walk surface checklist (operator initials; required before sending response):**

```
[ ] _____ Access path §3.1 fully completed and rows enumerated
[ ] _____ Identity verification §2 cleared at highest standard
[ ] _____ Counsel trigger checklist §9 cleared (no triggers fired)
[ ] _____ Account guard re-executed at start of delete session
[ ] _____ Per-row delete-item executed; ALL_OLD output saved to dsar-log.md
[ ] _____ Notification-sends NOT deleted (audit carve-out per advisor review; documented in response)
[ ] _____ F9 tenant-coordination: tenant-sink-deletion-request sent in parallel (if applicable)
[ ] _____ DSAR audit row written to picasso-pii-dsar-audit-staging with rows_deleted count
[ ] _____ Response template sent; dsar-log.md updated to closed
```

**Dry-run rehearsal (REQUIRED before first prod delete ever):** in addition to §3.1 access rehearsal, run a `describe-table` for each target table to confirm the primary-key shape before any `delete-item`. Recovery from a wrong-PK delete is theoretically possible via PITR (if enabled per F-DSAR21 audit) but operationally painful — invest the 60 seconds in `describe-table` first.

---

## §5 — Correction / rectification path

**Goal:** modify inaccurate or incomplete personal information in MyR-controlled systems. CCPA §1798.106 / GDPR Art 16.

**Current implementation:** **operator-manual** (no Lambda mode). The Lambda's `request_type` enum supports `access` and `delete` only. At current scale (~zero DSARs/month historically; <50 tenants), the manual walk is appropriately auditable.

### Procedure

See [`templates/dsar-response-correction.md`](./templates/dsar-response-correction.md) "Operator procedure" section — full CLI steps for:
1. Verify identity (same standard as §2)
2. Locate row(s) via tenant-scoped Query + pii_subject_id filter
3. Manual `update-item` per row (note: form-submission rows have THREE PII copies — `responses` / `form_data` / `form_data_labeled` — correct all three)
4. Manual append to audit table with `event_type=correction_completed` and `request_type=correction`
5. Send response template; update `dsar-log.md`

### Re-classification trigger

If correction requests exceed ~5/month sustained, scope a Lambda extension (new `request_type=correction` mode) as a M9 gap-router row or new milestone (with explicit user re-scope authorization). Until then, manual walk is sufficient.

---

## §6 — No-record path

**Goal:** confirm to a subject that we hold no records on them, and document the no-record search in `dsar-log.md`.

### Procedure

1. **Verify identity** (same standard as §2). The subject still needs to verify even for no-record, because returning "no record" to a third party is a disclosure (we'd be confirming the subject's email is unknown to us).

2. **Run the index lookup** (§3 step 1). If row not found, run a Scan to confirm pre-Phase-1 absence:
   ```bash
   AWS_PROFILE=myrecruiter-staging aws dynamodb scan \
     --table-name picasso-form-submissions-staging \
     --filter-expression "submitter_email = :e" \
     --expression-attribute-values '{":e":{"S":"<claimed_email>"}}' \
     --select COUNT
   ```
   - If COUNT=0 across all candidate tenants, the no-record finding is defensible.
   - If COUNT>0, subject IS in our records → resume §3 (access) or §4 (delete) as the actual request.

3. **Send** [`templates/dsar-response-no-record.md`](./templates/dsar-response-no-record.md). Update `dsar-log.md` to `closed` with `request_type=no-record`.

4. **Write a manual audit row** (Lambda only writes audit rows when it executes; no-record skips the Lambda):
   ```bash
   AWS_PROFILE=myrecruiter-staging aws dynamodb put-item \
     --table-name picasso-pii-dsar-audit-staging \
     --item '{
       "dsar_id":{"S":"<DSAR_ID>"},
       "event_timestamp":{"S":"<ISO_TIMESTAMP>"},
       "event_type":{"S":"no_record_confirmed"},
       "status":{"S":"closed"},
       "created_at_partition":{"S":"<YYYY-MM>"},
       "details":{"M":{
         "request_type":{"S":"no_record"},
         "operator_caller_arn":{"S":"<YOUR_ARN>"},
         "search_scope":{"S":"all_tenants_subject_index_and_pre_phase_1_scan"}
       }}
     }'
   ```

### §6.1 — No-record path for PROD tenants (M9.G4 / F-DSAR20 closure)

**When to use:** subject claims to be a consumer of a prod tenant but `submitter_email` scan returns `Count=0` across all candidate prod tenants. Required to disclose "no record" rather than silently ignore (even no-record is a disclosure — the subject is entitled to confirmation under CCPA/GDPR).

**Pre-substituted prod no-record commands (copy-paste-ready):**

```bash
# Step 1: Account guard (see §3.1).

# Step 2: Per-tenant Scan to confirm absence. Repeat for each candidate prod tenant_id.
AWS_PROFILE=myrecruiter-prod aws dynamodb scan \
  --table-name picasso_form_submissions \
  --filter-expression "submitter_email = :e AND tenant_id = :t" \
  --expression-attribute-values '{":e":{"S":"<claimed_email>"},":t":{"S":"<TENANT_ID>"}}' \
  --select COUNT
# Expect Count=0 for true no-record. If Count>0, this is actually a §3.1 access request — pivot.

# Step 3: Also scan notification-sends by recipient_email (subject may have received an email without submitting a form).
AWS_PROFILE=myrecruiter-prod aws dynamodb scan \
  --table-name picasso-notification-sends \
  --filter-expression "recipient_email = :e" \
  --expression-attribute-values '{":e":{"S":"<claimed_email>"}}' \
  --select COUNT

# Step 4: Write no-record audit row to STAGING audit table (cross-account convention; see §3.1 table).
AWS_PROFILE=myrecruiter-staging aws dynamodb put-item \
  --table-name picasso-pii-dsar-audit-staging \
  --item '{
    "dsar_id":{"S":"<DSAR_ID>"},
    "event_timestamp":{"S":"<ISO_TIMESTAMP_with_microseconds>"},
    "event_type":{"S":"no_record_confirmed"},
    "status":{"S":"closed"},
    "created_at_partition":{"S":"<YYYY-MM>"},
    "details":{"M":{
      "request_type":{"S":"no_record"},
      "operator_caller_arn":{"S":"<YOUR_PROD_ARN>"},
      "env":{"S":"prod-614"},
      "tenants_scanned":{"L":[{"S":"<TENANT_ID_1>"},{"S":"<TENANT_ID_2>"}]},
      "surfaces_scanned":{"S":"picasso_form_submissions, picasso-notification-sends"}
    }}
  }'
```

**No-record manual-walk surface checklist (operator initials):**

```
[ ] _____ Account guard executed; ✅ prod 614 confirmed
[ ] _____ Per-tenant Scan picasso_form_submissions: Count=0 for EACH candidate prod tenant_id
[ ] _____ Notification-sends Scan: Count=0 by recipient_email
[ ] _____ Session-summaries Scan: Count=0 by sessionId (the access path covers session-summaries
          per §3.1 checklist; a no-record disclosure that skips this surface and a session-summary
          row later surfaces is an affirmative misrepresentation under CCPA — audit row 8)
[ ] _____ DSAR audit row written to picasso-pii-dsar-audit-staging with tenants_scanned + surfaces_scanned
[ ] _____ No-record response template sent
```

Session-summaries no-record scan command (Sprint G2 addition for audit row 8):
```bash
# Subjects who chatted without submitting a form may have session-summary rows but no
# form-submission rows. Skipping this surface would produce a false no-record finding.
AWS_PROFILE=myrecruiter-prod aws dynamodb scan \
  --table-name picasso-session-summaries \
  --filter-expression "contains(content, :phrase) OR submitter_email = :e" \
  --expression-attribute-values '{":phrase":{"S":"<UNIQUE_PHRASE_SUBJECT_PROVIDED>"},":e":{"S":"<claimed_email>"}}' \
  --select COUNT
# Best-effort: session-summaries rows do not have submitter_email if the subject never
# submitted a form during the session. The content scan is the no-record evidence.
```

---

## §7 — Per-surface manual fallback procedures

When the DSAR Lambda flags a coverage gap (`manual_followup` block in its response), the operator executes the corresponding fallback. The Lambda emits these snippets verbatim; this section is the reference glossary.

### F-DSAR1 + F-DSAR18: pre-Phase-1 + active-writer (BSH) form-submission rows

**Trigger:** Lambda's response includes `manual_followup` for the form-submissions walker. Per F-DSAR18 (added 2026-05-23), this is now the **primary** path for any real form-submission DSAR — not the fallback — because BSH `form_handler.js` (the active widget chat-form writer) does not write `pii_subject_id`, so the walker's `pii_subject_id` FilterExpression silently false-negatives on every BSH-written row. Until M9.G3 promotes the writer-side fix (D5 row F-DSAR18 option 1), expect `manual_followup` on every real DSAR for this surface.

**Action:** copy-paste the snippet provided by the Lambda — it includes the operator's email + tenant_id substituted:
```bash
AWS_PROFILE=myrecruiter-staging aws dynamodb scan \
  --table-name picasso-form-submissions-staging \
  --filter-expression "submitter_email = :e AND tenant_id = :t" \
  --expression-attribute-values '{":e":{"S":"<email>"},":t":{"S":"<TENANT_ID>"}}'
```

For each matched row, manually `delete-item` (delete path) or include in export (access path).

**Operator tracking:** trigger thresholds UPDATED 2026-05-23 per advisor review (compliance 🔴-2): **first form-submission DSAR ever** triggers promotion (was ">3× total"); DSAR volume ≥1/month sustained; prod-twin scoping; Atlanta LOI; **calendar backstop 2026-08-23**. F-DSAR18 routing corrected M9.G3 → **M1.G6** (§3 routing-rule violation — gap touches M1's walker surface). Surface the trigger status in the next session-handoff.

**✅ PROD-CLI variant SHIPPED 2026-05-24 (M9.G4 / F-DSAR20 CLOSED):** the §3-§6 CLI snippets above reference **STAGING tables + STAGING profile**. For a real **prod-tenant DSAR** (e.g., Austin Angels), use the pre-substituted procedures in:

- [`§3.1 — Access path for PROD tenants`](#31--access-path-for-prod-tenants-m9g4--f-dsar20-closure) (substitution table + pre-substituted commands + account guard + manual-walk surface checklist + dry-run rehearsal)
- [`§4.1 — Delete path for PROD tenants`](#41--delete-path-for-prod-tenants-m9g4--f-dsar20-closure) (delete-specific safety: access-first prerequisite + `describe-table` pre-check + notification-sends carve-out + delete-specific checklist)
- [`§6.1 — No-record path for PROD tenants`](#61--no-record-path-for-prod-tenants-m9g4--f-dsar20-closure) (per-tenant Count scan + cross-account audit row)
- `tools/dsar-invoke.sh` shell wrapper (forward-looking; for when a prod-twin DSAR Lambda eventually ships; account-guard + dry-run default + explicit-confirm-on-commit)

§3.1's substitution table is the single source of truth for staging↔prod name mapping; all three sub-sections reference it. **Operator MUST still run `aws sts get-caller-identity` account guard at start of every prod session** — the procedure documents it as the first step but does NOT enforce it (a future tool could; for today, operator-attested).

### F-DSAR4: recent-messages no subject linkage (chat-only-no-form subjects)

**Trigger:** subject reports chatting via widget without submitting a form, OR Lambda's recent-messages walker returns zero matches but session linkage was inconclusive.

**Action:** direct sessionId query if subject can supply session reference; otherwise document the 0-72h window structural limitation in the response:
```bash
# If sessionId known
AWS_PROFILE=myrecruiter-staging aws dynamodb query \
  --table-name staging-recent-messages \
  --key-condition-expression "sessionId = :s" \
  --expression-attribute-values '{":s":{"S":"<SESSION_ID>"}}'

# Last-resort content-substring scan (FALSE-POSITIVE PRONE — use sparingly)
AWS_PROFILE=myrecruiter-staging aws dynamodb scan \
  --table-name staging-recent-messages \
  --filter-expression "contains(content, :phrase)" \
  --expression-attribute-values '{":phrase":{"S":"<UNIQUE_PHRASE_FROM_SUBJECT>"}}'
```

### F12: Meta-only subject (PSID lookup)

**Trigger:** subject reports Messenger-only interaction (no email submission); subject-index returns no row.

**Action (operator-manual; M2 ships an automated walker):**
1. Open Meta Business Suite → Pages → MyRecruiter tenant page → Messages
2. Locate the conversation by subject's name / approximate date
3. Capture the PSID from the conversation URL or API
4. Query `picasso-channel-mappings-staging` for the PSID:
   ```bash
   AWS_PROFILE=myrecruiter-staging aws dynamodb scan \
     --table-name picasso-channel-mappings-staging \
     --filter-expression "psid = :p" \
     --expression-attribute-values '{":p":{"S":"<PSID>"}}'
   ```
5. With the resolved `pii_subject_id` (if any) OR direct sessionId, run the recent-messages query per F-DSAR4.

### F14 / F-DSAR17: ARCHIVE_BUCKET

**Trigger:** subject's session-summaries row has aged out (post-TTL); content persists in `picasso-archive-staging`.

**Action:**
- Bucket empty as of 2026-05-23 (M3 verification). Until populated, no walk needed.
- When populated, the operator playbook step is:
  ```bash
  # Version-aware listing (F-DSAR17: versioning is ENABLED with 7-day noncurrent expiration)
  AWS_PROFILE=myrecruiter-staging aws s3api list-object-versions \
    --bucket picasso-archive-staging \
    --prefix sessions/<SESSION_ID>/
  # For each version, delete with --version-id
  AWS_PROFILE=myrecruiter-staging aws s3api delete-object \
    --bucket picasso-archive-staging \
    --key <KEY> --version-id <VERSION>
  ```

### F-DSAR30: identifier_type=phone (walker-NOT-supported)

**Trigger:** consumer DSAR arrives with `identifier_type=phone` (no email, no PSID — phone-only subject).

**Why no walker:** phone numbers are not a primary subject identifier on any tenant-scoped row. They appear on `picasso-notification-sends-staging` (already covered by M1 walker via `pii_subject_id` resolution from email) and `picasso-sms-consent-staging` (opt-in artifact, not subject-rights-actionable as a primary key). Subjects who only ever interacted via SMS without ever providing an email are unreachable by Lambda.

**Action:** manual scan of `picasso-sms-consent-staging`, **with paginated retrieval** (M2 phase-completion-audit row #14 + Security #8 — single-shot Scan without `--starting-token` returns only the first 1 MB page and silently truncates on consent tables larger than that, producing false-negative DSAR results).

```bash
# Step 1: initial scan page
AWS_PROFILE=myrecruiter-staging aws dynamodb scan \
  --table-name picasso-sms-consent-staging \
  --filter-expression "phone = :p" \
  --expression-attribute-values '{":p":{"S":"<SUBJECT_PHONE_E164>"}}' \
  --output json > /tmp/dsar-phone-scan-page-1.json

# Step 2: if "LastEvaluatedKey" present in response, paginate ALL pages
# (REQUIRED — otherwise pre-1MB rows may be missed)
NEXT_TOKEN=$(jq -r '.LastEvaluatedKey // empty' /tmp/dsar-phone-scan-page-1.json)
PAGE=2
while [ -n "$NEXT_TOKEN" ]; do
  AWS_PROFILE=myrecruiter-staging aws dynamodb scan \
    --table-name picasso-sms-consent-staging \
    --filter-expression "phone = :p" \
    --expression-attribute-values '{":p":{"S":"<SUBJECT_PHONE_E164>"}}' \
    --starting-token "$NEXT_TOKEN" \
    --output json > /tmp/dsar-phone-scan-page-${PAGE}.json
  NEXT_TOKEN=$(jq -r '.LastEvaluatedKey // empty' /tmp/dsar-phone-scan-page-${PAGE}.json)
  PAGE=$((PAGE + 1))
done

# Step 3: combine all pages + check for matches
jq -s '[.[].Items[]?]' /tmp/dsar-phone-scan-page-*.json > /tmp/dsar-phone-matches.json
jq 'length' /tmp/dsar-phone-matches.json  # 0 = subject not present; >0 = manual delete/export
```

**For delete:** for each matched row, run `aws dynamodb delete-item --table-name picasso-sms-consent-staging --key '{...}'` with the row's PK+SK from the scan output. Record each delete in the dsar-log audit row.

**For access:** package the scan output as the subject's response packet.

### F-DSAR30: identifier_type=name+address (walker-NOT-supported)

**Trigger:** consumer DSAR with `identifier_type=name+address` (no email, no PSID, no phone).

**Why no walker:** name + address are free-text within `picasso-form-submissions-staging.responses` (a DynamoDB map attribute). No GSI exists on these fields; no projection. The M1 email walker already exports them as part of the form-submission row dump for email-resolved subjects. Subjects who provided name + address but no email cannot be resolved by index lookup.

**Action:** paginated scan with FilterExpression on `contains(responses, :name)`. Same pagination discipline as F-DSAR30 phone.

```bash
# Step 1: initial scan page (filter on responses map containing the name string)
# Caution: substring match — false positives possible if name is common
AWS_PROFILE=myrecruiter-staging aws dynamodb scan \
  --table-name picasso-form-submissions-staging \
  --filter-expression "contains(responses, :name)" \
  --expression-attribute-values '{":name":{"S":"<SUBJECT_NAME>"}}' \
  --output json > /tmp/dsar-name-scan-page-1.json

# Step 2: paginate until LastEvaluatedKey is absent (same pattern as F-DSAR30 phone)
NEXT_TOKEN=$(jq -r '.LastEvaluatedKey // empty' /tmp/dsar-name-scan-page-1.json)
PAGE=2
while [ -n "$NEXT_TOKEN" ]; do
  AWS_PROFILE=myrecruiter-staging aws dynamodb scan \
    --table-name picasso-form-submissions-staging \
    --filter-expression "contains(responses, :name)" \
    --expression-attribute-values '{":name":{"S":"<SUBJECT_NAME>"}}' \
    --starting-token "$NEXT_TOKEN" \
    --output json > /tmp/dsar-name-scan-page-${PAGE}.json
  NEXT_TOKEN=$(jq -r '.LastEvaluatedKey // empty' /tmp/dsar-name-scan-page-${PAGE}.json)
  PAGE=$((PAGE + 1))
done
```

**For delete:** per-row DeleteItem AFTER manual review (substring match is false-positive-prone; do NOT auto-delete without operator confirmation that each row genuinely belongs to the subject — record each decision in the dsar-log audit row with rationale).

**For access:** package only the rows that operator-review confirms belong to the subject.

**Address-only matches:** repeat the procedure with `contains(responses, :addr)` substituting the street-line address. Combine results; deduplicate by `submission_id`.

### F-DSAR32: ARCHIVE access path (object bodies)

**Trigger:** consumer DSAR `request_type=access`; Lambda walker returns archive `exported_keys` (key list, not bodies).

**Why operator-mediated:** `_walk_archive_bucket` deliberately omits `s3:GetObject` (Lambda 6 MB response cap; operator pulls bodies via own SSO role).

**Action:** for each key in the Lambda response's `exported_rows["archive"]`, fetch the object body:

```bash
# For each key returned by the Lambda walker, fetch + add to subject response packet
for KEY in $(jq -r '.exported_rows.archive[]' /tmp/dsar-lambda-response.json); do
  AWS_PROFILE=myrecruiter-staging aws s3 cp "s3://picasso-archive-staging/${KEY}" - \
    > /tmp/dsar-archive-$(basename "$KEY")
done

# Verify all keys fetched; package into subject response
ls /tmp/dsar-archive-*
```

If `s3 cp` fails on any key (delete-marker race, transient throttle), retry; if persistent, surface in the operator's dsar-log entry as `archive_fetch_failed` with the key for follow-up.

**Reference:** F-DSAR32 D5 row.

---

## §8 — SLA timekeeping

### Legal SLA

- **CCPA**: 45 days from intake (extendable to 90 with notice). [`templates/dsar-extension-notice.md`](./templates/dsar-extension-notice.md) covers the extension.
- **GDPR Art 12**: 30 days from intake (extendable to 90 with notice). Counsel-Q1 (G-I) refines whether MyR has GDPR exposure today.
- **Combined posture**: target **30 days** to be conservatively within both; extend formally if approaching.

### Internal SLA milestones

| Day | Action | Reference |
|---|---|---|
| Intake (D0) | Acknowledge within 1 business day; create dsar-log row; apply `dsar/open` label | §1 |
| D+5 | Verify identity (target); apply `dsar/awaiting-verification` if pending | §2 |
| D+10 | Execute fulfillment; manual followups resolved | §3–§6 |
| D+15 | Response sent; close row; apply `dsar/closed` | §3–§6 |
| **D+25** | **🔴 SLA-AT-RISK BANNER** — EventBridge alarm fires when M3 done-bar #1 ships; manual weekly check until then | §9 |
| D+30 | Internal deadline (conservative; legal SLA is 45) | — |
| D+45 | Legal deadline (CCPA) — must have responded OR sent extension notice | — |

### Manual SLA tracking (secondary check + post-M9.G6 weekly reminder companion)

Originally the operator-attested weekly Monday CLI; now also referenced by the M9.G6 weekly reminder Lambda's embedded snippet. Filter on the actual status the audit writer emits for intake events (`in_progress`, not `open` — the previous wording was a documentation bug surfaced by M9.G6 and fixed 2026-05-23):
```bash
AWS_PROFILE=myrecruiter-staging aws dynamodb query \
  --table-name picasso-pii-dsar-audit-staging \
  --index-name StatusIndex \
  --key-condition-expression "#s = :s" \
  --expression-attribute-names '{"#s":"status"}' \
  --expression-attribute-values '{":s":{"S":"in_progress"}}' \
  --query "Items[?event_type.S=='request_received' && !starts_with(dsar_id.S, 'smoke-')].{dsar:dsar_id.S,ts:event_timestamp.S}"
```

The `?event_type.S=='request_received'` filter is defensive — `status="in_progress"` is only set on `request_received` events today, but the audit writer is general and may add other in-progress events later.

The `!starts_with(dsar_id.S, 'smoke-')` filter (**M9.G7 / F-DSAR28**, added 2026-05-24) suppresses synthetic smoke-test rows from the operator's review. Smoke rows persist in the audit table permanently per the C2 4-action Deny resource policy (no DeleteItem allowed); without this filter, accumulated test artifacts would distort the operator's at-risk-DSAR view. Real DSARs use `dsar_id` values shaped by `Master_Function_Staging/form_handler.py`'s ID generator (or operator-chosen identifiers) — never the `smoke-` prefix.

Manually compute age: `today - intake_date`. Any row > 25 days = at-risk; > 30 days = breach risk; > 45 days = legal breach.

**Calendar reminder** (operator-configured): every Monday at 09:00 local — "DSAR SLA review." Plus the **M9.G6 weekly reminder Lambda** (Mondays 14:00 UTC) which emails this same instruction with embedded CLI snippets — an independent secondary control that fires regardless of the primary monitor's state.

### Fault-test for the EventBridge alarm — EXECUTED 2026-05-23, RESULT PASS

The alarm was fault-tested per M3 done-bar #2 using a **non-destructive FilterPolicy** approach (preferred over unsubscribe, which would require email re-confirmation):

1. Set `FilterPolicy={"fault_test_block":["never_present"]}` on the `chris@myrecruiter.ai` SNS subscription. Lambda's publish lacks that MessageAttribute → subscription filters the message out at delivery time, simulating a disabled subscription without losing the subscription itself.
2. Inserted synthetic row `smoke-sla-faulttest-001` with `event_timestamp` 30d ago, `status=in_progress`, `event_type=request_received` into `picasso-pii-dsar-audit-staging`.
3. Manually invoked `picasso-pii-dsar-sla-monitor-staging` Lambda → returned `{at_risk_count: 1, dsar_ids: ["smoke-sla-faulttest-001"]}` ✅
4. CloudWatch SNS metrics for the 16:58 UTC bucket: `NumberOfMessagesPublished=1`, **no `NumberOfNotificationsDelivered` datapoint** ✅ — confirms the message was published by the Lambda but blocked at delivery by the FilterPolicy (the "alarm-miss" scenario).
5. Secondary check (this section's weekly Monday CLI scan) executed in parallel — found `smoke-sla-faulttest-001` in its output ✅, confirming that even with the email channel down, the operator's secondary check detects the at-risk DSAR.
6. Removed FilterPolicy (`set-subscription-attributes` with `{}`), inserted closing event for `smoke-sla-faulttest-001`. Subscription returned to normal-flow.

**G-D closure conditions met:** alarm fires, SNS publish succeeds, delivery loss is detectable by secondary check, normal-flow restoration verified. Logged in master plan v0.7.

**⚠️ ADVISOR CAVEAT 2026-05-23 (compliance 🔴-1+5, F-DSAR22):** the FilterPolicy approach above is **weaker** than the original done-bar wording ("disable SNS topic"). FilterPolicy blocks delivery at one subscription; it does NOT exercise the topic-level failure mode. Additionally, the secondary check "found the row" in the same hour because the operator knew to look — a real alarm miss happens when the operator is **unaware**. The weekly Monday 09:00 CLI is operator-attested only, not enforced by a recurring calendar/cron, and is vacation-fragile. M3 done-bar #2 is therefore re-classified to **PARTIAL** with **F-DSAR22** (D5) as the open gap. Three remediation options (tracked under **M9.G6**): (1) enforce Google Calendar recurring event with response checklist; (2) belt-and-suspenders cron — second EventBridge schedule that emails the operator weekly to remember the CLI scan (~0.5d); (3) re-do fault test with operator-blinded approach (operator commitment + brief ops-alarm blind window).

**Re-run cadence:** quarterly (paired with D2/D3/D4 currency review per master plan §4) — replaces v0.7's "annually" per advisor review (compliance 🔴-1: "every change to operator email, calendar habits, vacation invalidates the secondary control more frequently than annually"). Plus: re-run after any change to the SLA monitor Lambda / topic / subscription / IAM scope.

---

## §9 — Counsel escalation triggers

**Authoritative reference:** [`counsel-input-package.md`](./counsel-input-package.md) §"Trigger conditions" (5 conditions).

**Quick reference** for DSAR-context triggers:
1. **GDPR / non-CCPA jurisdiction claim** by subject (e.g., EU resident asserting Article 17 rights)
2. **Tenant-relationship ambiguity** (employee DSAR via consumer flow; under-match potential — G-G)
3. **Counsel-Q1 (G-I) controller/processor determination** still pending AND the DSAR's response language depends on the answer
4. **F9 tenant-sink coordination** where the tenant refuses or non-responds (escalates beyond MyR's controller scope)
5. **First DSAR** that triggers an unhandled Lambda manual_followup scenario (Apply-2 backfill condition fires per F-DSAR1 trigger condition)

### Procedure

- Pause fulfillment (do NOT respond on a substantively-binding answer)
- Send `dsar-extension-notice.md` if approaching SLA, citing "consultation with counsel"
- Engage counsel per `counsel-input-package.md` §"How to engage" — fixed-fee scope, named partner-track attorney with U.S. consumer privacy experience
- Document the engagement in `dsar-log.md` (`counsel_engaged: YYYY-MM-DD; topic: ...`)
- After counsel response: update D5 row(s) with the determination; revise this playbook accordingly

### 12-month counsel safety floor (F-DSAR16)

Even if zero DSARs trigger counsel engagement, the **2027-05-20** calendar event (Phase 0.5 close + 12 months) is the mandatory floor for "no trigger fired; continue holding" OR proactive engagement. See D5 row F-DSAR16.

---

## §10 — Response-template selection logic

| If subject requested | And outcome is | Send template |
|---|---|---|
| Access / export | Records found + exported | [`dsar-response-access.md`](./templates/dsar-response-access.md) |
| Access / export | No records found | [`dsar-response-no-record.md`](./templates/dsar-response-no-record.md) |
| Delete / erasure | Deletion completed (with or without manual followups resolved) | [`dsar-response-delete.md`](./templates/dsar-response-delete.md) |
| Delete / erasure | No records found | [`dsar-response-no-record.md`](./templates/dsar-response-no-record.md) |
| Correction / rectify | Correction completed | [`dsar-response-correction.md`](./templates/dsar-response-correction.md) (new this playbook) |
| Correction / rectify | No records found | [`dsar-response-no-record.md`](./templates/dsar-response-no-record.md) |
| Verification request | Sent (intake or mid-flow) | [`dsar-verification-request.md`](./templates/dsar-verification-request.md) |
| Cannot fulfill | Refused (insufficient verification / overbroad / third-party scope) | [`dsar-refusal.md`](./templates/dsar-refusal.md) |
| Extension needed | Notify subject of 45-day extension (CCPA) or counsel consultation | [`dsar-extension-notice.md`](./templates/dsar-extension-notice.md) |
| Tenant coordination | Tenant sink deletion request to tenant's privacy contact | [`tenant-sink-deletion-request.md`](./templates/tenant-sink-deletion-request.md) |

---

## §11 — Closure + retention

### Closure checklist

- [ ] Response sent to subject
- [ ] `dsar-log.md` row updated: `status=closed`, `closed_date`, `request_type`, `surfaces_walked`, `manual_followups_resolved`, `counsel_engaged` (if applicable)
- [ ] Audit table reflects closure (Lambda writes for access/delete; manual write for correction/no-record per §5/§6)
- [ ] Gmail label switched: `dsar/open` → `dsar/closed`
- [ ] Commit the `dsar-log.md` update

### Retention of DSAR records

- **Subject's submission** (the data we deleted): gone post-deletion + 35d DDB PITR backup window
- **Notification records**: 90-day TTL per existing form_handler.py pattern
- **Form-submission rows** (when subject hasn't requested deletion): 365-day TTL per M4 PR2 writer fix (this commit's companion)
- **DSAR audit rows** (`picasso-pii-dsar-audit-staging`): **append-only**, Art 17(3)(b) carve-out per D5 G-J (counsel-pending; advisory standing); not deleted on subject request — operator must explain this carve-out in `dsar-response-delete.md`
- **CloudWatch logs**: 14-day default; D1 redaction confirms no PII in DSAR Lambda logs (`lambda_function.py` :180 + audit row 7)

### Audit-table retention runbook

See [`audit-table-retention-runbook.md`](./audit-table-retention-runbook.md) for the eventual counsel-determined purge sequence (lift Deny → purge by ByCreatedAt GSI partition → re-apply Deny). Until counsel-Q1 (G-I) and the supplementary G-J responses, retention is **indefinite** (defensible Art 17(3)(b) basis).

---

## §12 — Playbook maintenance

This playbook is v1.0. Maintenance discipline (master plan v0.3 §8):

| Trigger | Update |
|---|---|
| M2 ships (Meta + S3 + ARCHIVE walker LIVE) | §3.4 + §7 F12 + F14: replace "operator-manual" with Lambda mode |
| M3 done-bar #1+#2 ships (EventBridge alarm + fault-test) | §8 §9 "fault-test" section: convert from "when M3 ships" to "alarm operational since YYYY-MM-DD" |
| Counsel-Q1 (G-I) response | §2 + §9: refine verification + counsel-engagement language |
| F-DSAR1 backfill (Apply-2) | §7 F-DSAR1: replace manual Scan with automated walker |
| F-DSAR-C2-SSE-DEFER resolution (M7) | §11 retention: update audit-table SSE-KMS posture |
| F-DSAR17 archive versioning remediation (M9 TTL hygiene audit) | §7 F14 / F-DSAR17: update version-aware procedure or remove if versioning suspended |
| First real DSAR fulfilled | Add as Lessons-Learned section; update timing benchmarks |

### Version history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-05-23 | Chris (via Claude session) | Initial publication — M3 done-bar #6 (master plan v0.3 §M3). Covers all 8 sub-items: identity verification, 4-path decision tree, correction procedure, per-surface manual fallbacks (F-DSAR1/F-DSAR4/F12/F14/F-DSAR17), F9 tenant coordination, response-template selection, SLA timekeeping, counsel escalation triggers. References the new `dsar-response-correction.md` template (also ships in this PR). Pre-M3-alarm SLA tracking documented (weekly Monday CLI check + Google Calendar reminders). Fault-test procedure for future EventBridge alarm documented for M3 done-bar #2 closure. |

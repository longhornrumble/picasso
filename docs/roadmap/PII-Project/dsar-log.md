# DSAR Log

Flat ledger of every privacy request received. One row per request. Committed to repo so the audit trail lives in git. Status transitions: `open` → `awaiting-verification` → `executing` → `awaiting-tenant` (if Finding 9) → `closed` / `refused` / `extended`.

Schema column meanings:

- **`dsar_id`** — `YYYY-MM-DD-NNN` where NNN is the sequence for that day (`2026-05-20-001`). Matches the Lambda's audit-row key.
- **`intake_date`** — when the request arrived in `privacy@` (NOT when triaged).
- **`right`** — `access` | `export` | `delete` | `anonymize` | `correct` | `opt-out-of-sale` | `unclear`.
- **`tenant_id`** — the tenant whose widget surfaced the data. `all` if the request spans tenants. `unknown` until subject identifies one.
- **`jurisdiction`** — self-asserted state/country in the request body; `unknown` if absent; assume strictest applicable to tenant footprint when unclear.
- **`agent`** — `self` | `counsel` | `parent-of-minor` | `other` (note details in `audit_pointer`).
- **`sla_due`** — `intake_date + 30d` for GDPR-tagged, `intake_date + 45d` for CCPA-tagged. Calendar reminder set at +21d and +38d.
- **`status`** — current lifecycle stage.
- **`lambda_audit_row`** — pointer into `picasso-pii-dsar-audit-staging`; empty until first Lambda invocation.
- **`gmail_thread`** — Gmail message-id of the inbound; the canonical thread record.
- **`closed_date`** — when responded; populated on `closed`/`refused`.
- **`notes`** — one line; escalation reason, Finding 9 tenant correspondence date, etc.

## Open requests

| dsar_id | intake_date | right | tenant_id | jurisdiction | agent | sla_due | status | lambda_audit_row | gmail_thread | closed_date | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| *(no open requests as of 2026-05-20)* | | | | | | | | | | | |

## Closed requests

| dsar_id | intake_date | right | tenant_id | jurisdiction | agent | sla_due | status | lambda_audit_row | gmail_thread | closed_date | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| *(no closed requests as of 2026-05-20)* | | | | | | | | | | | |

## Rules

1. **Every inbound to `privacy@` gets a row** — even if it's later classified as "not a DSAR" (marketing unsubscribe, support gripe). Row status becomes `closed` with notes = "not a DSAR; routed to support" or similar. The log records WHAT we received, not just what we acted on.
2. **One commit per row update.** Easier for git blame to be the audit trail. Commit message: `dsar({dsar_id}): {status_change}`.
3. **Never include the subject's PII in this file.** Use `dsar_id` only; the subject's identifiers live in the Lambda audit row + Gmail thread.
4. **Verify SLA on every commit.** If `sla_due` is within 7 days and `status` is anything but `closed`/`extended`, the commit message must include `URGENT-SLA`.
5. **Counsel-trigger.** When a row's `notes` includes any of the escalation conditions (per `privacy-risk-register.md` §"Operational fulfillment workflow" §9), commit message must include `COUNSEL-TRIGGER` and counsel package is sent same day.

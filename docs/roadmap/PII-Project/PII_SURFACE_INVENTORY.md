# PII Surface Inventory — Consumer PII Remediation Path A, Phase 1

**Status:** Authoritative as of 2026-05-18. **Supersedes** the "What is NOT being
deleted today" table in `CONSUMER_PII_REMEDIATION.md` (the 2026-04-27 body), which is
materially stale and predates the Meta Messenger surfaces, the `-staging` module set,
and several schema changes.

**Method:** read-only inspection of the `origin/staging` tree (worktree `feature/pii-phase-1`
@ `5d13dd5`, PR #137 tip) — every `infra/modules/ddb-*` module's key schema + TTL block,
the writer Lambdas' `put_item`/`put_object` sites, and the S3/CloudWatch surfaces. No
infrastructure was inspected via live AWS calls; this is a code/IaC-truth inventory. The
delete pipeline (Phase 2) and TTL work (Phase 3) consume this table; any divergence found
at Phase-2 implementation against live AWS must update this file.

**Scope anchor** (`CONSUMER_PII_REMEDIATION.md` §"Scope clarification", retained-evergreen):
the pipeline is **identity-driven**, not session-driven. It walks records bearing a
*specific person's identifier*. Anonymous session/analytics records have no identifier to
match and age out via housekeeping TTL — **out of delete scope**, in scope for TTL hygiene.

---

## Legend

- **Scope** — `DELETE` = identity-driven delete pipeline must reach it (Phase 2);
  `TTL-ONLY` = no person-identifier to match, housekeeping TTL only (Phase 3 hygiene);
  `CARVE-OUT` = legally-required retention, enumerated + coordinated, **never deleted**
  (locked decision #4); `NOT-CONSUMER` = tenant/employee/operational data, not consumer PII.
- **TTL written?** — distinguishes *TTL infra enabled in IaC* from *a record actually
  writing the attribute*. "Enabled, NOT written" = the attribute never gets set, so the
  TTL **never fires** (the form-submissions bug).

---

## DynamoDB tables (the `infra/modules/ddb-*` set)

| Table (staging) | Key schema | Identity-bearing fields | TTL attr / enabled / **written?** | Writer Lambda(s) | Scope |
|---|---|---|---|---|---|
| **`picasso-form-submissions-staging`** | PK `tenant_id` · SK `submission_id` (uuid4); GSIs FormType/Status/tenant-timestamp/tenant-pipeline | `form_data` & `responses` (raw **name, email, phone**, all answers), `session_id`, `conversation_id` | `ttl` / enabled / **NO — `_store_submission` writes no `ttl`** → TTL never fires, data is **effectively permanent** | Master_Function_Staging `form_handler._store_submission` | **DELETE** (primary) |
| **`picasso-notification-sends-staging`** | PK `pk`=`TENANT#{tenant_id}` · SK `{date}#email#{msg_id}` | `recipient` (**raw email**), `submission_id`, `message_id` | `ttl` / enabled / **YES — 90 d** (`form_handler.py:796,820`) | Master_Function_Staging `form_handler._send_email_notifications` | **DELETE** |
| **`picasso-notification-events-staging`** | PK `pk` · SK `sk`; GSI `ByMessageId`(message_id) | delivery/open/bounce records tied to `message_id` → recipient | `ttl` / enabled / YES (writer: SES event handler) | `ses_event_handler` / notification pipeline | **DELETE** |
| **`picasso-recent-messages-staging`** | PK `sessionId` (incl. `meta:{pageId}:{psid}`) · SK `messageTimestamp` (N) | conversation **message content** (`userText`/`assistantText`), PSID-derived `sessionId` for Meta | **NO TTL BLOCK AT ALL** — no `ttl{}` in `main.tf` | Master_Function_Staging `conversation_handler`; Meta_Response_Processor `storeConversationContext` | **DELETE** ⚠ (see Finding 1) |
| **`picasso-conversation-summaries-staging`** | PK `sessionId`; GSI `tenantId` | conversation summary text, `sessionId` (incl. Meta PSID-derived) | `expires_at` / enabled / (writer-set) | Master_Function_Staging `conversation_handler` | **DELETE** |
| **`picasso-channel-mappings-staging`** | PK `PK` · SK `SK`; GSI `TenantIndex`(tenantId/channelType) | Meta `pageId`, **PSID**-scoped records, `lastUserMessageAt`, encrypted page tokens | `ttl` / enabled / (writer-set) | Meta_Response_Processor, Meta_OAuth_Handler | **DELETE** ⚠ (Finding 2) |
| **`picasso-webhook-dedup-staging`** | PK `mid` (Meta message id) | Meta message id (`mid`) — pseudonymous, transient | `ttl` / enabled / YES | Meta_Webhook_Handler | TTL-ONLY |
| `picasso-session-events-staging` | PK `pk` · SK `sk`; GSI tenant_hash/timestamp | mostly anonymous; *may* carry PII attributes in event payloads | `ttl` / enabled / YES | Analytics_Event_Processor / session pipeline | TTL-ONLY (Finding 3) |
| `picasso-session-summaries` | PK `pk` · SK `sk`; stream OLD_IMAGE | session summaries | `ttl` / enabled / YES | session pipeline | TTL-ONLY |
| `picasso-audit-staging` | PK `tenant_hash` · SK `timestamp_event_id`; GSI EventType | audit events — contain identifiers | `retention_expires_at` / enabled / YES | Master_Function_Staging form audit | TTL-ONLY (audit integrity — retain) |
| `picasso-billing-events-staging` | PK `pk` · SK `sk` | tenant-level billing | `ttl` / enabled / YES | billing pipeline | NOT-CONSUMER |
| `picasso-employee-registry-v2-staging` | PK `tenantId` · SK `employeeId`; GSIs Email/ClerkUserId | **employee** email, `clerkUserId` | none | employee registry | NOT-CONSUMER ⚠ (Finding 4 — employee not consumer; scope boundary stated, not owned by Path A) |
| `picasso-tenant-registry-staging` | PK `tenantId`; GSIs tenantHash/clerkOrgId/stripeCustomerId | tenant org/stripe — not consumer PII | none | tenant registry | NOT-CONSUMER |
| `picasso-token-blacklist*` | PK `token_hash` | hashed JWT — not consumer PII | `expires_at` / enabled / YES | Master_Function_Staging auth | NOT-CONSUMER |

## S3 prefixes

| Surface | Path / contents | Lifecycle | Writer | Scope |
|---|---|---|---|---|
| **Conditional form-submission fulfillment** | `s3://{tenant-configured bucket}/submissions/{tenant_id}/{form_type}/{submission_id}.json` — body = `json.dumps(responses)` = **raw form PII** | **none observed** (no lifecycle rule in code path) | Master_Function_Staging `form_handler` fulfillment (`fulfillment_type == 's3'`, `form_handler.py:967-980`) | **DELETE** ⚠ (Finding 5 — tenant-config-driven, bucket not IaC-managed) |
| Analytics events | `s3://picasso-analytics/analytics/tenant_id=…/year=…/…/{batch}.json` | not in `s3-*` modules (legacy/non-IaC bucket) | Analytics_Event_Processor | TTL-ONLY / coordinate (may carry PII attrs in events) |
| `picasso-widget-staging` | static widget assets | n/a | widget deploy | NOT-CONSUMER |
| `myrecruiter-picasso-staging` | tenant configs | n/a | Config Manager | NOT-CONSUMER |

## CloudWatch log groups

| Log group | PII exposure | Retention | Scope |
|---|---|---|---|
| `/aws/lambda/{master-function-staging}` | `recipient` email (form_handler:778,802,1151,1205), `phone` (857,860) logged at INFO/ERROR | `log_retention_days` **default 30** | TTL-ONLY (30-day age-out) — **Path B now-item owns the retention decision**; Path A enumerates only |
| `/aws/lambda/{bedrock-handler-staging}` | Bedrock prompts/response bodies may contain injected form PII | `log_retention_days` default 30 | TTL-ONLY — Path B now-item |
| `/aws/lambda/Meta_Webhook_Handler`, `/aws/lambda/Meta_Response_Processor` | PSID, message text | `log_retention_days` default 30 | TTL-ONLY — Path B now-item |

## Carve-outs (locked decision #4 — enumerated + coordinated, NEVER deleted by Path A)

| Surface | Why retained | Owner |
|---|---|---|
| `picasso-sms-usage` (PK `tenant_id` + `month`, phone + usage `count`) + SMS opt-in/STOP consent | TCPA — 4-yr consent retention | **SMS-twin project** (not MFS); Path A coordinates only |
| COPPA artifacts | COPPA retention | counsel-scoped (Phase 5 legal gate) |

---

## Findings (deltas vs. the stale 2026-04-27 charter table)

1. **`recent-messages` has NO TTL block at all** and stores conversation message
   content keyed by `sessionId` — including `meta:{pageId}:{psid}` for Meta. This is a
   PII-bearing surface with **neither retention nor a delete path**. Not in the stale
   table. → Phase 2 DELETE target; Phase 3 must add a TTL block to
   `ddb-recent-messages-staging`.
2. **Meta Messenger surfaces did not exist when the charter was written.** PSID
   (Page-Scoped User ID) is a pseudonymous personal identifier under GDPR. `channel-mappings`
   + PSID-keyed `recent-messages`/`conversation-summaries` are in delete scope. The
   identity graph the Phase-2 pipeline walks must include `sessionId LIKE meta:{pageId}:{psid}`,
   not only `pii_subject_id`/email. (Linking PSID→`pii_subject_id` is **not** solved by
   Phase 1; recorded as an open design item for Phase 2 — see Identity Contract §Open.)
3. `session-events` is classed **TTL-ONLY** per the charter scope anchor (anonymous, no
   identifier to match) **but may carry PII attributes** in event payloads. Phase 2 should
   spot-audit a sample at implementation; if identity attributes are present and matchable,
   reclassify to DELETE.
4. `employee-registry-v2` holds **employee** PII (email, clerkUserId), not consumer PII.
   Stated here as an explicit scope boundary: **out of Path A consumer-PII scope**.
   Employee data-subject rights are a separate determination (flag to counsel, Phase 5).
5. **Conditional S3 form-submission persistence** (`fulfillment_type: 's3'`) writes raw
   form responses to a *tenant-configured* bucket with no observed lifecycle. The delete
   pipeline cannot enumerate tenant-config-driven bucket names statically — Phase 2 must
   resolve the per-tenant fulfillment bucket from tenant config and include
   `submissions/{tenant_id}/{form_type}/*` in the delete walk.

## What feeds which phase

- **Phase 2 (delete pipeline)** walks every `DELETE`-scoped row, per-tenant, by the
  Phase-1 `pii_subject_id` **and** by the Meta `sessionId` pattern (Finding 2), **and**
  the conditional S3 prefix (Finding 5). Honors all `CARVE-OUT` rows.
- **Phase 3 (retention TTL)** must: add `ttl` write to `_store_submission`
  (form-submissions); add a TTL block to `ddb-recent-messages-staging` (Finding 1);
  confirm/normalize TTL writers on `notification-events`, `conversation-summaries`.
- **Phase 4 (DSAR)** access/export reads exactly the `DELETE`-scoped set by
  `pii_subject_id` + Meta `sessionId`.
- **Path B (parallel session)** owns the CloudWatch-retention now-item and the FTC §5
  widget-claim correction; Path A does not modify those — enumerated here for coordination
  only.

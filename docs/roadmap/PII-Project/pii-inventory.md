# PII Surface Inventory (D2)

**Phase 0.5 deliverable D2.** Established 2026-05-20. Picasso-wide enumeration of every surface where PII enters, is stored, is processed in memory, is logged, or is transmitted to a downstream destination. Source-of-truth for D3 (data-flow-map), D4 (classification), D5 (risk register), and the re-baselined Path A roadmap. Living document — see the "living-inventory PR rule" in [`CLAUDE.md`](../../../CLAUDE.md): any PR adding a PII surface must update this file and assign a D4 tier.

> **Method:** read-only inspection of the `origin/staging` IaC tree (`infra/modules/`) and the migrated historical seed [`PII_SURFACE_INVENTORY.md`](./PII_SURFACE_INVENTORY.md). No live AWS calls. State on AWS may diverge from IaC; the **Findings** section flags surfaces where IaC and runtime almost certainly disagree (e.g. TTL-attribute writes that don't fire). D2 covers **what is defined in code/IaC**, not what is currently running. Live-state reconciliation belongs to a later step (re-baselined Path A roadmap or a one-shot live audit), not Phase 0.5.

> **Scope anchor (verbatim from the charter [`pii-project-charter.md`](./pii-project-charter.md)):** the program covers consumer PII flowing through nonprofit chatbot conversations, volunteer interest capture, donor/supporter Q&A, contact forms, chat analytics events, AI-generated content **about** data subjects, and tenant-operator identities. **Out of scope** here: employee recruiting / FCRA / HIPAA-regulated workflows / formal GDPR / payment instrument storage / Bubble (no longer part of the platform).

> **Naming note:** several historic tables predate the `picasso-{name}-{env}` convention and live under the older `staging-{name}` shape. Where IaC and the seed inventory disagreed on a name, this document uses the **IaC** name (verified in `infra/modules/ddb-*/main.tf`).

---

## Legend

**Scope** — applied per row:

- `DELETE` — identity-driven delete pipeline must reach it (Path A Phase 2).
- `TTL-ONLY` — no person-identifier to match for deletion; housekeeping TTL only (Path A Phase 3 hygiene).
- `CARVE-OUT` — legally-required retention enumerated + coordinated; **never deleted by Path A**.
- `NOT-CONSUMER` — tenant/operator/operational data, not consumer PII. Outside Path A scope; may still be subject to other rights (operator/employee — counsel-input).
- `IN-MEMORY` — processing surface (Lambda); PII transits but does not persist here. Applies to every §A Lambda row; the row's persistence reach is named in the "Writes to" column.
- `LOG` — observability surface (CloudWatch log group); persists by retention policy, not by row.
- `INBOUND-EDGE` / `OUTBOUND-EDGE` — integration endpoint; PII transmitted through, not stored at the edge itself.

**Encryption** — applied to storage rows:

- `SSE-S3 (AES256)` — AWS-managed server-side encryption. Default.
- `CMK <name>` — customer-managed KMS key, scoped per resource.
- `SSE-DDB` — default DynamoDB encryption (AWS-owned key). PII tables do **not** yet have a CMK applied (Apply-1 created the scoped PII CMK but applied it to no table; Apply-2 will).

**Retention** — for DDB rows: `TTL attr / enabled / written?`. "Enabled / NOT written" means the IaC declares the TTL attribute but the writer Lambda does not set it, so TTL never fires. For S3: `lifecycle rule` (yes/no) + `versioning` (on/off). For logs: `retention_in_days`.

**"In-scope-for-delete"** — `Y` = the delete pipeline must reach this row. `N` = either no consumer PII (`NOT-CONSUMER`), TTL-ages-out without identity match (`TTL-ONLY`), or carve-out.

---

## A. Lambda processing surfaces

PII transits these in memory during request handling. Each one's log group is the persistence shadow — see Section D. Each one's IAM exec role gates read access to the storage surfaces it reaches.

| Lambda | Runtime | PII handled (transit) | Writes to (storage surfaces) | Notes |
|---|---|---|---|---|
| `Master_Function_Staging` (MFS) | Python 3.13 | Form responses (name/email/phone/free text), chat message content, session/conversation ids, tenant operator identities (admin actions) | `picasso-form-submissions-staging`, `picasso-notification-sends-staging`, `staging-recent-messages`, `staging-conversation-summaries`, `picasso-audit-staging`, conditional S3 fulfillment (per-tenant bucket), SES (outbound) | The central PII handler. Routes most consumer PII. IaC: `infra/modules/lambda-master-function-staging/`. |
| `Bedrock_Streaming_Handler_Staging` | Node.js 20 | Prompt content (user message + KB chunks + system prompt), streamed response tokens | Bedrock model invocation (outbound); does **not** itself persist transcripts | Streams responses to the widget via SSE. IaC: `infra/modules/lambda-bedrock-handler-staging/`. |
| `Meta_Webhook_Handler` | Node.js 20 | Meta `PSID` (pseudonymous), inbound message text, Meta `mid` (message id) | `picasso-webhook-dedup-staging`, hands off to `Meta_Response_Processor` | IaC: `infra/modules/lambda-meta-staging/` (3-Lambda module). |
| `Meta_Response_Processor` | Node.js 20 | PSID, inbound + outbound message content, channel mapping | `picasso-channel-mappings-staging`, `staging-recent-messages`, `staging-conversation-summaries`; sends via Meta Graph (outbound) | IaC: same Meta module. |
| `Meta_OAuth_Handler` | Node.js 20 | OAuth tokens for Meta pages, page metadata | `picasso-channel-mappings-staging` (encrypted page tokens) | IaC: same Meta module. Page tokens encrypted via `kms-channel-tokens-staging` CMK. |
| `SMS_Sender` | Node.js 20 | Recipient phone (E.164), message body | Telnyx API (outbound) | IaC: `infra/modules/lambda-sms-twin-staging/`. Reads Telnyx secret via dedicated CMK + secret-resource policy. |
| `SMS_Webhook_Handler` | Node.js 20 | Recipient phone, inbound message body, STOP/HELP opt-out keywords | (TBD — opt-out persistence is `CARVE-OUT` SMS-twin domain, not Path A) | IaC: same SMS-twin module. Ed25519 signature verified; fails closed if `TELNYX_PUBLIC_KEY` empty. |
| `send_email` | Python | Recipient email, subject, body | SES (outbound) | Shared utility Lambda; called by MFS for notification emails. |
| `ses_event_handler` | Python | Recipient email, bounce / complaint event payload | `picasso-notification-events-staging` | Receives SES delivery / bounce / complaint webhooks. |
| `Analytics_Event_Processor` | Python | Analytics event payloads — *may* carry identifying attributes (see Finding 3 in [seed](./PII_SURFACE_INVENTORY.md)) | SQS `picasso-analytics-events-staging` → S3 `analytics/tenant_id=…/…/{batch}.json` | IaC: `infra/modules/analytics-events-pipeline-staging/`. |
| `Analytics_Function` | Python | Analytics ingest path (legacy) | `picasso-session-events-staging` | Legacy analytics; cleanup project pending (`Q4 Analytics_Function removal` per MEMORY.md — completed in prod; staging twin remains scoped to acct 525). |
| `Analytics_Aggregator` | Python | Hourly aggregations of analytics events | S3 analytics rollups; DDB summaries | Hourly EventBridge-triggered. |
| `Aggregator_Function` | Python | Legacy aggregator | (legacy, low/no current traffic) | Cleanup pending. |
| `Analytics_Dashboard_API` | Python | **Reads** analytics tables for the dashboard UI | (no writes) | Read-path Lambda. Read access enumerated here even though it does not write — see "Who has read access" in §B. IaC: `infra/modules/lambda-analytics-dashboard-api-staging/`. |
| `SSO_Token_Generator` | Python | Operator email (for SSO tokens) | (issues short-lived tokens; no PII persistence) | Operator-PII (tenant admin) surface, not consumer. |
| `Picasso_Config_Manager` | Node.js 20 ESM | Tenant config payloads (may contain admin emails, recipient lists, copy templates that include personalization vars) | S3 `myrecruiter-picasso{,-staging}` (tenant configs) | Operator-PII surface. Backs the config-builder portal. |
| `deploy_tenant_stack` | Python 3.13 | Tenant onboarding metadata | Tenant config bucket + provisioning resources | Operator-PII surface. |
| *(future) PII delete Lambda* | TBD — Apply-2 | Operator request payload (subject id / email), per-row delete walk | Writes deletes across §B `DELETE`-scoped tables + §C conditional S3 prefix; writes audit row to `picasso-pii-delete-audit-staging` (forward-referenced in `infra/modules/lambda-pii-delete-staging/`) | **Apply-1 = IaC scaffold only (3 IAM roles).** Lambda code does not exist yet. Apply-2's six named preconditions still gate it (see [Phase-2 Apply-1 audit memory](../../../) — G-3..G-7 + G-12..G-14). **Read-access blast radius:** the future delete role reads every §B `DELETE`-scoped row across all tenants — a cross-tenant read scope wider than any current MFS execution path. Tenant-isolation review required at the Apply-2 design gate (input to Decision A + Decision B at D5). |

**Stripe webhook handler:** the IaC enumeration found a `StripeCustomerIdIndex` GSI on `picasso-tenant-registry-staging` (operator-tier, `NOT-CONSUMER`). A Stripe webhook receiver is implied by the tenant registry's stripe-id index, but no `lambda-stripe-*` module was found in `infra/modules/` on this branch. Flagged as Finding 6 below.

**Scheduling Lambdas:** **none on this branch.** The `scheduling/` directory contains only docs (per [`CLAUDE.md`](../../../CLAUDE.md): *"`scheduling/` contains only a planning doc — no code implemented yet"*). The scheduling DDB table `picasso-booking-staging` exists in IaC (see §B). When scheduling Lambdas land, the living-inventory PR rule requires this section + §B + §D + §G to be updated in the same PR.

---

## B. DynamoDB tables

All tables below have `point_in_time_recovery { enabled = true }` in their respective `infra/modules/ddb-*/main.tf`. **PITR retains a continuous backup for 35 days regardless of row deletion** — material for the delete pipeline: a deleted row remains recoverable until the PITR window passes. Only `staging-session-summaries` has `stream_enabled = true` (view: `OLD_IMAGE`); no other PII-bearing table has DDB streams in IaC.

**On-demand DDB backups:** no `aws_backup_*` resources or manual snapshot plans found in `infra/modules/` for any DDB module — suspected none; verify in D3.

**Encryption status (Apply-1 scaffold):** Apply-1 created `kms-pii-staging` CMK + 3 delete-pipeline roles; the CMK is applied to **no table**. All PII tables remain default `SSE-DDB` (AWS-owned key) until Apply-2.

**Vocabulary used in cells (per compliance-advisor strong-rec):** `unknown — verify in D3` = IaC-undefined; `TBD — Apply-2` = known-future state; `(unverified — D3)` = asserted in IaC or seed but not line-cited at D2.

| Table (IaC name) | Key schema | Identifying fields | TTL attr / enabled / **written?** | PITR | Streams | Encryption | Writer Lambda(s) | Read access (coarse, IaC-derived) | Scope | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| **`picasso-form-submissions-staging`** | PK `tenant_id` · SK `submission_id` (uuid4); GSIs FormType / Status / tenant-timestamp / tenant-pipeline | `form_data` & `responses` (raw **name, email, phone**, free-text answers); `session_id`, `conversation_id`; `pii_subject_id` (Phase 1) | `ttl` / enabled / **NO** — `_store_submission` writes no `ttl` (see [Step 5 memory](../../../) and Finding 1 below). Data **effectively permanent**. | on | off | SSE-DDB (Apply-1: no CMK; Apply-2 target) | `Master_Function_Staging.form_handler._store_submission` | MFS exec role; future `picasso-pii-delete-staging-role` (Apply-2 onward) | **DELETE** (primary) | Tenant-isolated by PK. Also future GSI `PiiSubjectIdIndex` per Phase 1 / Apply-3. |
| **`picasso-pii-subject-index-staging`** | PK `normalized_email`; GSI `PiiSubjectIdIndex(pii_subject_id)` | normalized email (lowercase + trimmed), opaque `pii_subject_id` | (no TTL) | on (`infra/modules/ddb-pii-subject-index-staging/main.tf`) | off | SSE-DDB (Apply-2 target) | MFS (Phase 1 writer) | MFS exec role; future delete role | **DELETE** | The Phase-1 lookup index. Path A walks this to find all rows by email or by subject id. **Load-bearing failure mode:** if an index row is deleted or corrupted, `picasso-form-submissions-staging` rows for that subject become **unreachable by identity match** — the UNINDEXED CloudWatch alarm (Apply-1 §G-1 fix) fires; orphan rows persist until the alarm runbook resolves. **PK is `normalized_email` only — Meta `PSID`-keyed sessions have no row in this index** (see Finding 12). |
| **`picasso-notification-sends-staging`** | PK `pk=TENANT#{tenant_id}` · SK `{date}#email#{msg_id}` | `recipient` (raw email), `submission_id`, `message_id` | `ttl` / enabled / **YES — 90 d** (`form_handler.py:796,820`) | on | off | SSE-DDB | MFS `form_handler._send_email_notifications` | MFS exec role; future delete role | **DELETE** | Persisted notification audit; 90-day TTL is hygiene, not identity-driven delete. |
| **`picasso-notification-events-staging`** | PK `pk` · SK `sk`; GSI `ByMessageId(message_id)` | delivery / open / bounce records keyed to `message_id` → recipient | `ttl` / enabled / **(unverified — D3)** writer-set | on | off | SSE-DDB | `ses_event_handler` | MFS + ses_event_handler roles; future delete role | **DELETE** | Joined back to recipient via `notification-sends`. Writer-line citation not captured at D2 — D3 must confirm `ses_event_handler.py:<line>` writes `ttl`. |
| **`staging-recent-messages`** ⚠ corrected from seed | PK `sessionId` (includes `meta:{pageId}:{psid}`) · SK `messageTimestamp` (N) | conversation **message content** (`userText` / `assistantText`); PSID-derived `sessionId` for Meta | **NO TTL BLOCK in IaC** — `ddb-recent-messages-staging` module has no `ttl{}` configured | on | off | SSE-DDB | MFS `conversation_handler`; Meta_Response_Processor `storeConversationContext` | MFS + Meta_Response_Processor exec roles; future delete role | **DELETE** ⚠ | Finding 1 (carried from seed): NO retention + NO TTL = data effectively permanent. Finding 2 (carried): PSID-derived sessionId is pseudonymous personal identifier under GDPR; identity graph must walk both `pii_subject_id` AND `meta:{pageId}:{psid}`. |
| **`staging-conversation-summaries`** ⚠ corrected from seed | PK `sessionId`; GSI `tenantId-index` | conversation summary text (AI-inferred), `sessionId` (incl. Meta PSID-derived) | `expires_at` / enabled / **(unverified — D3)** writer-set | on | off | SSE-DDB | MFS `conversation_handler` | MFS exec role; future delete role | **DELETE** | AI-generated content **about** data subjects (inferred PII) per charter scope. Writer-line citation not captured at D2 — D3 must confirm `conversation_handler.py:<line>` writes `expires_at`. |
| **`picasso-channel-mappings-staging`** | PK `PK` · SK `SK`; GSI `TenantIndex(tenantId / channelType)` | Meta `pageId`, PSID-scoped records, `lastUserMessageAt`, **encrypted page tokens** (via `kms-channel-tokens-staging` CMK) | `ttl` / enabled / (writer-set) | on | off | SSE-DDB at table level; **page tokens encrypted by `kms-channel-tokens-staging` at item level** | Meta_Response_Processor, Meta_OAuth_Handler | Meta_* exec roles; **DSAR role** (`picasso-pii-dsar-staging` — Query + GetItem on TenantIndex GSI per `ChannelMappingsReadOnly` Sid, applied 2026-05-26 via picasso#228) | **DELETE** | Page tokens are sensitive credentials (Meta OAuth); item-level CMK pattern is the live model for what Apply-2 may extend to other surfaces. DSAR walker uses TenantIndex GSI to resolve tenant→pageIds for PSID subject-resolution (M2 Sprint B). |
| **`picasso-webhook-dedup-staging`** | PK `mid` (Meta message id) | Meta `mid` — transient pseudonymous identifier | `ttl` / enabled / YES | on | off | SSE-DDB | Meta_Webhook_Handler | Meta_* exec roles | TTL-ONLY | Short-lived dedup ledger; ages out. |
| `picasso-session-events-staging` | PK `pk` · SK `sk`; GSIs tenant_hash / timestamp | mostly anonymous; **may carry PII attributes in event payloads** (see Finding 3) | `ttl` / enabled / YES | on | off | SSE-DDB | Analytics_Event_Processor / session pipeline | Analytics + MFS roles; **DSAR role** (`picasso-pii-dsar-staging` — Query + GetItem + DeleteItem per `SessionEventsReadDelete` Sid, applied 2026-05-26 via picasso#228) | **DELETE** ⚠ reclassified from TTL-ONLY 2026-05-26 (M2 Sprint B added walker; rows are now subject-reachable via PSID resolver → sessionId chain). Finding 3 spot-audit retained as deferred-with-trigger. | Walker queries by `pk=SESSION#{sessionId}` (PK query; no GSI used). Per-row max-step-export cap `MAX_EXPORTED_STEPS=1000` (audit-fix #9). |
| `picasso-session-summaries-staging` ⚠ corrected | PK `pk` · SK `sk`; **stream `OLD_IMAGE`** | session summaries | `ttl` / enabled / YES | on | **on** (OLD_IMAGE) | SSE-DDB | session pipeline | session pipeline + analytics roles | TTL-ONLY | **Only PII-adjacent table with DDB streams in IaC.** Stream consumer (if any) must also be enumerated as a downstream surface — flagged as Finding 7. |
| `picasso-audit-staging` | PK `tenant_hash` · SK `timestamp_event_id`; GSI EventType | audit events — contain identifiers | `retention_expires_at` / enabled / YES | on | off | SSE-DDB | MFS form audit | MFS exec role; future delete role | TTL-ONLY (audit integrity) | Retain for audit hygiene; delete after TTL window. Path A does not delete audit rows on subject request (carve-out semantics under audit-integrity exception). |
| `picasso-booking-staging` | PK `tenantId` · SK `booking_id`; GSI `tenantId-start_at-index`, `tenantId-coordinator_email-index` | booking attendee identifying fields (when scheduling Lambdas land); coordinator email | (no TTL — see IaC comment: *"PII deletion is sub-phase F, not a TTL"*) | on | off | SSE-DDB | **No writer Lambda yet** (scheduling code not implemented) | TBD when scheduling Lambdas land | **DELETE** (when populated) | Flagged here so the living-inventory PR rule fires when scheduling Lambdas land. |
| `picasso-calendar-watch-channels-staging` | PK `channel_id`; GSIs `tenant-status-index(tenant_id, status)` + `tenant-expiration-index(tenant_id, expiration)` | `calendar_id` (coordinator workspace email — tenant operator identity); `channel_token_sha256` (SHA-256 hash of the per-channel 64-char token — a one-way commitment, **NOT** the raw secret; the raw token is handed to Google in `events.watch` and never stored at rest, G6) | (no TTL — lifecycle managed by Renewer per B3 and onboarding/offboarding hooks per B5/B6) | **on** (enabled 2026-05-25 per audit closure row 2; PITR is the standard for any table holding a Tier-4 secret per max-tier rule) | off | SSE-DDB at table level. **`channel_token` encryption gate RESOLVED via Option 2 (hash-only):** only `channel_token_sha256` is stored; the raw token is never persisted (Listener authenticates inbound pushes by SHA-256-hashing `X-Goog-Channel-Token` and constant-time-comparing). The pre-G6 raw-token Secrets Manager store + `CreateSecret` grant were removed (lambda#171 / picasso#271). | **Writers:** `Calendar_Watch_Onboarder` (B5) + `Calendar_Watch_Renewer` (B3) PutItem/UpdateItem/DeleteItem; **reader:** `Calendar_Watch_Listener` (B2). B6 offboarder not yet implemented. | TBD — row deletion handled by B6 offboarder (not yet implemented) | **NOT-CONSUMER** ⚠ (`calendar_id` is workspace email of coordinator — for tenants where coordinators are paid staff, NOT-CONSUMER is settled; for tenants where coordinators are volunteers — likely under CPRA — the same G-H counsel-input gap as the `picasso-employee-registry-v2-staging` row above applies. Do not assert as settled for volunteer-coordinator tenants without counsel input.) | Calendar watch channel ledger (canonical §14.1). Per [`scheduling/docs/subphase_b1_calendar_watch_channels_runbook.md`](../../../scheduling/docs/subphase_b1_calendar_watch_channels_runbook.md). **Max-tier rule (re-classification candidate):** the row was Tier-4 because it held the raw `channel_token`; post-G6 it stores only `channel_token_sha256` (a one-way hash, not a usable secret), so the Tier-4 basis no longer applies. Formal re-classification deferred to a pii-data-lifecycle-advisor pass (not done unilaterally in this IaC PR). `calendar_id` (coordinator email) remains the governing PII. |
| `picasso-billing-events-staging` | PK `pk` · SK `sk` | tenant-level billing events | `ttl` / enabled / YES | on | off | SSE-DDB | billing pipeline | billing + Stripe webhook roles | NOT-CONSUMER | Tenant billing; not consumer PII. |
| `picasso-employee-registry-v2-staging` | PK `tenantId` · SK `employeeId`; GSIs `EmailIndex`, `ClerkUserIdIndex` | **employee** (tenant operator) email, `clerkUserId` | (none) | on | off | SSE-DDB | employee-registry pipeline | tenant-admin pipeline roles | NOT-CONSUMER ⚠ | Employee = tenant operator, not consumer. CPRA employee rights are a counsel-input question (gap G-H per Plan-gaps review). Out of Path A scope; named for completeness. |
| `picasso-tenant-registry-staging` | PK `tenantId`; GSIs `TenantHashIndex`, `ClerkOrgIdIndex`, `StripeCustomerIdIndex` | tenant org metadata, Clerk org id, Stripe customer id | (none) | on | off | SSE-DDB | tenant registry, Stripe webhook | tenant-admin pipeline roles | NOT-CONSUMER | Tenant-level; not consumer PII. Stripe customer-id is identifying metadata at the **tenant** level (gym, not gym-goer). |
| `picasso-token-blacklist-staging` | PK `token_hash` | hashed JWT — not consumer PII | `expires_at` / enabled / YES | on | off | SSE-DDB | MFS auth | MFS exec role | NOT-CONSUMER | JWT revocation. |
| `picasso-token-jti-blacklist-staging` | PK `jti` | JWT id — not consumer PII | `ttl` / enabled / YES | on | off | SSE-DDB | MFS auth | MFS exec role | NOT-CONSUMER | JWT id revocation (Phase 1 added to scheduling/auth path). |
| *(future) `picasso-pii-delete-audit-staging`* | TBD — Apply-2 | per-delete-request audit row (subject id / who-requested / when / what-was-deleted) | (no TTL — audit retain) | TBD — Apply-2 | TBD — Apply-2 | TBD — Apply-2 (CMK candidate) | future PII delete Lambda | future delete role + breakglass | CARVE-OUT **candidate** (pending Decision B at D4 + D5) | Forward-referenced in `infra/modules/lambda-pii-delete-staging/main.tf`. Does not exist at Apply-1. Final scope (carve-out vs. tier with TTL) decided at D4 + D5, not D2. |

**Note on "read access (coarse)":** entries above are derived from IaC role/policy attachments (best-effort from the modules read for D2). They are **not** a comprehensive IAM enumeration. A precise read-access map per table is a candidate for D3 (data-flow-map) or for the Apply-2 precondition checklist; D2 names access at the role level only.

---

## C. S3 prefixes

| Bucket / prefix | Contents | Versioning | Lifecycle | Encryption | Writer | Scope | Notes |
|---|---|---|---|---|---|---|---|
| **`s3://{tenant-configured bucket}/submissions/{tenant_id}/{form_type}/{submission_id}.json`** | body = `json.dumps(responses)` = **raw form PII** | unknown (per-tenant bucket; not IaC-managed) | unknown | unknown (tenant-bucket policy) | MFS `form_handler` fulfillment when `fulfillment_type == 's3'` (`form_handler.py:967-980`) | **DELETE** ⚠ | Finding 5 (carried from seed): the bucket name is *tenant-config-driven*, not IaC-managed. The delete pipeline cannot enumerate destinations statically; Phase 2 must resolve the per-tenant fulfillment bucket from tenant config and walk `submissions/{tenant_id}/{form_type}/*`. **Versioning + lifecycle + encryption are unknown per tenant** — they are not platform-controlled. Flagged as Finding 8 below. M2 Sprint D will implement the walker (synthetic-fixture path approved). |
| `s3://picasso-archive-staging/sessions/{sessionId}/{batch}.json` | archived Meta session conversation snapshots (`userText`/`assistantText` rotated out of `staging-recent-messages` via session-archiver pattern) | **on** (verified: `aws_s3_bucket_versioning` enabled per `infra/modules/s3-archive-staging/`) | NoncurrentVersionExpiration 7d; current-version lifecycle aligns with retention policy | SSE-S3 (AES256); MFA-Delete posture verified at DSAR cold-start via `_check_archive_mfa_delete_posture()` (lambda_function.py:1358; requires `s3:GetBucketVersioning` grant per closeout-audit blocker #2 fix in picasso#240) | session-archiver pipeline (lambda or BSH path TBD; verify writer at next D3 currency review) | **DELETE** | M2 Sprint C added version-aware walker (`_walk_archive_bucket`); DSAR role has `s3:ListBucket` + `s3:ListBucketVersions` (prefix=sessions/*) + `s3:DeleteObject` + `s3:DeleteObjectVersion` (sessions/* scope) per `ArchiveBucketListVersions` + `ArchiveBucketDeleteVersions` Sids (applied 2026-05-26 via picasso#228). `s3:GetObject` scope-omitted — walker returns keys only (Lambda 6MB cap); operator pulls bodies via own SSO role per F-DSAR32. Access-path returns `exported_keys`; delete-path iterates `(key, version_id)` + delete-markers. |
| `s3://picasso-analytics-events-staging/analytics/tenant_id=…/year=…/…/{batch}.json` | analytics event batches; may contain identifying attributes | (verify on apply) | (verify on apply) | CMK `alias/analytics-event-processor-logs-staging` (per `analytics-events-pipeline-staging/`) | Analytics_Event_Processor | TTL-ONLY / coordinate | Finding 3 ties through here: if event payloads carry identity attrs and remain matchable, this prefix joins the delete walk. Live audit on apply. |
| `s3://picasso-widget-staging` (and prod `picasso-widget`) | static widget JS bundles, source maps | **on** (verified IaC: `aws_s3_bucket_versioning` enabled) | (none observed in IaC) | SSE-S3 (AES256) | widget deploy CI | NOT-CONSUMER | Widget bundles are public assets. No PII at rest. |
| `s3://picasso-pii-dsar-int-staging/submissions/TEN-SMOKE-FULFILL/{form_id}/{submission_id}.json` | synthetic-tenant fulfillment fixture for Sprint D integration tests (test_k/test_l/test_n/test_o) | off (test fixture; no rollback need) | none (tests clean up via try/finally) | SSE-S3 default (PII CMK explicitly rejected — operator role lacks `kms:GenerateDataKey` on the PII CMK per Apply-1 NB-A policy; this is intentional defense-in-depth, not a posture gap for a test bucket) | `boto3.client('s3').put_object` from integration test seed code via operator SSO role | NOT-CONSUMER (synthetic test data, NEVER touched by real DSAR traffic) | Bucket created manually 2026-05-26T17:35Z; AWS-default block-public-access ON; DSAR Lambda role granted `s3:DeleteObject` scoped to `submissions/TEN-SMOKE-FULFILL/*` via `var.fulfillment_grants` (picasso#260). Resource-side bucket policy intentionally NOT applied — same CMK-access constraint would block test seed. Test fixture lifecycle: if bucket is accidentally deleted, re-create + add to `var.fulfillment_grants` + integration tests will re-run cleanly. Audit closure 2026-05-26 row #11 (tech-lead 🟡): manual-bucket + IaC-grant split documented here. |
| `s3://myrecruiter-picasso-staging` (and prod `myrecruiter-picasso`) | tenant configs (JSON) — may contain admin recipient emails, copy templates, KB pointers | **on** (verified IaC: `aws_s3_bucket_versioning` enabled) | (none observed in IaC) | SSE-S3 (AES256) | `Picasso_Config_Manager` | NOT-CONSUMER **candidate (presumptive)** — see notes | **Prod `myrecruiter-picasso` bucket is anonymously readable** — independent finding tracked separately ([memory project_myr_picasso_bucket_public_read_finding_2026-05-19](../../../)). Configs currently PII-free, but **versioning is on + public-read = prior config versions are anonymously retrievable via `?versionId=`**, so any historical config that ever embedded operator PII (recipient emails, admin contact) or a consumer field in test data / personalization copy persists and is retrievable. NOT-CONSUMER classification is **presumptive pending a historical-version spot-audit** for embedded consumer PII — live audit is a D5 row, not a D2 claim. Cross-tracks with the `MYR_PICASSO_BUCKET_PUBLIC_READ` roadmap item. Operator-tier; out of Path A consumer scope. |
| Bedrock Knowledge Base datasource bucket (per-tenant or shared) | KB markdown ingested for RAG | TBD | TBD | TBD | scraping / KB ingest tooling (`picasso-webscraping/`) | NOT-CONSUMER (KB content is curated nonprofit copy; no consumer PII) | Surfaced for completeness — KB content is **about** the nonprofit, not the consumer. If a tenant misconfigures KB ingestion to include PII (e.g., scrapes a "volunteers list" page), it becomes PII; living-inventory PR rule should fire then. |

---

## D. CloudWatch log groups (the observability surfaces themselves)

All Lambda log groups in IaC use `retention_in_days = var.log_retention_days` (root-level variable). **Default value not verified at D2** — seed asserts 30 d; confirmed only at the `var.log_retention_days` reference site, not at the variable definition. **Verify in D3.** Path B (scheduling-session-owned) was identified in the seed as owner of the log-retention now-item; Path A enumerates these for completeness only.

**Charter principle #3 tension flag:** "Log less." Every row below carries PII (recipient email / phone / PSID / message body / inferred-PII summaries) at default-30-day retention. The mismatch is named here as a flagged input to D5 (log-PII reduction row — redaction-at-source or retention reduction); D2 does not pre-decide the remediation.

| Log group | Owner Lambda | PII exposure observed | Retention | Scope |
|---|---|---|---|---|
| `/aws/lambda/Master_Function_Staging` | MFS | `recipient` email (`form_handler:778, 802, 1151, 1205`), `phone` (`857, 860`) logged at INFO/ERROR — see seed Finding (CloudWatch row) | `var.log_retention_days` (default 30 d) | LOG / TTL-ONLY — **Path B now-item** owns the retention/redaction decision |
| `/aws/lambda/Bedrock_Streaming_Handler_Staging` | Bedrock handler | Bedrock prompts / response bodies — may contain injected form PII | `var.log_retention_days` (default 30 d) | LOG / TTL-ONLY — Path B now-item |
| `/aws/lambda/Meta_Webhook_Handler` | Meta_Webhook_Handler | PSID, inbound message text | `var.log_retention_days` (default 30 d) | LOG / TTL-ONLY — Path B now-item |
| `/aws/lambda/Meta_Response_Processor` | Meta_Response_Processor | PSID, message content (in + out) | `var.log_retention_days` (default 30 d) | LOG / TTL-ONLY — Path B now-item |
| `/aws/lambda/Meta_OAuth_Handler` | Meta_OAuth_Handler | OAuth state tokens, page tokens (redacted? unverified) | `var.log_retention_days` (default 30 d) | LOG / TTL-ONLY — Path B now-item |
| `/aws/lambda/SMS_Sender` | SMS_Sender | recipient phone, message body | `var.log_retention_days` (default 30 d) | LOG / TTL-ONLY |
| `/aws/lambda/SMS_Webhook_Handler` | SMS_Webhook_Handler | recipient phone, inbound message, STOP/HELP | `var.log_retention_days` (default 30 d) | LOG / TTL-ONLY |
| `/aws/lambda/Analytics_Dashboard_API_Staging` | Analytics_Dashboard_API | analytics query parameters, partial response payloads | `var.log_retention_days` (default 30 d) | LOG / TTL-ONLY |
| `/aws/lambda/{analytics-event-processor,analytics-aggregator,analytics-function,aggregator-function}` | Analytics_* | event payloads (may carry identifying attrs) | `var.log_retention_days` (default 30 d) | LOG / TTL-ONLY (re-classify if Finding 3 finds identifying attrs in payloads) |
| `/aws/lambda/{send_email, ses_event_handler}` | shared email Lambdas | recipient email, bounce / complaint payloads | `var.log_retention_days` (default 30 d) | LOG / TTL-ONLY |
| `/aws/lambda/{deploy_tenant_stack, SSO_Token_Generator, Picasso_Config_Manager}` | operator-PII Lambdas | tenant admin emails, config payloads | `var.log_retention_days` (default 30 d) | LOG / NOT-CONSUMER (operator) |

---

## E. Bedrock surfaces

| Surface | What flows | Persistence | Notes |
|---|---|---|---|
| **Bedrock model invocation (input)** | Prompts: user message + system prompt + KB-retrieved chunks. User message may contain free-text PII (chat content); KB chunks are curated and typically PII-free. | **Not persisted by MyRecruiter at the model boundary** — but model-invocation logging state is unverified at D2 (see Finding 13). AWS Bedrock data-handling policy applies (per-account, per-region; AWS does not train on customer data). | Vendor surface. **Invocation region:** suspected `us-east-1` — verify in D3; cross-region inference profiles (e.g., Claude on Bedrock routed via a US inference profile spanning multiple US regions) are an open gap. Vendor inventory + full cross-border check is a second-wave deliverable (deferred per Phase 0.5 plan). |
| **Bedrock model invocation (output / retained inferences)** | Streamed assistant tokens; conversation **summaries** synthesized later | Streamed output → widget (transient); summaries → `staging-conversation-summaries` (see §B) | **Conversation summaries are inferred PII about the subject** per the charter's "AI-generated content about data subjects." In Path A delete scope via §B row. |
| **Bedrock Knowledge Base (input)** | Per-tenant KB markdown, ingested ahead of conversation | KB datasource bucket (see §C) | Curated content (nonprofit copy). PII-free if ingest hygiene holds. Tenant misconfiguration risk noted in §C. |
| **Bedrock model-invocation logging** (account-level) | If `aws_bedrock_model_invocation_logging_configuration` is enabled, the prompts (which carry user free-text PII) are persisted in AWS-managed CloudWatch and/or S3 destinations **under MyRecruiter's account**, materially expanding the persistence surface beyond §B / §D rows. | **Unverified at D2** — IaC inspection only; no Bedrock logging resource found in `infra/modules/` on this branch. **Verify in D3** at the account-level (this is not a per-Lambda resource). | Finding 13 below carries this as an open gap. |

---

## F. Inbound integration sources

| Source | Lambda receiver | PII at the edge | Notes |
|---|---|---|---|
| Browser widget POSTs (chat + form submit) | MFS via API GW / Function URL | name / email / phone / free text / chat content | The primary inbound consumer-PII channel. |
| Meta webhooks (Meta Graph → us) | Meta_Webhook_Handler | PSID, inbound message text, `mid` | Signature-verified (Meta App secret). PSID is pseudonymous personal identifier. |
| Telnyx webhooks (SMS inbound) | SMS_Webhook_Handler | phone number, inbound SMS body, STOP/HELP | Ed25519-signature-verified; fails closed if pubkey empty. |
| SES delivery / bounce / complaint events | `ses_event_handler` | recipient email, bounce reason payload | Inbound async from SES; written to `picasso-notification-events-staging`. |
| Stripe webhooks (billing events) | *(handler not in IaC on this branch — see Finding 6)* | Stripe customer id (tenant-level), billing event metadata | Operator-tier / `NOT-CONSUMER`. Handler must be enumerated. |
| (future) Operator DSAR intake | (future) PII delete Lambda | subject email or `pii_subject_id`, requester identity | Apply-2+ scope. |

---

## G. Outbound integration destinations

The charter requires explicit enumeration of "outbound integration destinations where Picasso transmits PII (SES, Telnyx, Bedrock, Meta Graph, **and any tenant-configured downstreams such as n8n, Sheets, CRM, nonprofit systems**)."

| Destination | Sender Lambda | PII transmitted | Owner | Notes |
|---|---|---|---|---|
| SES (email send) | `send_email` (called by MFS) | recipient email, subject, body (may contain form responses) | AWS account | Vendor surface — covered by AWS DPA. |
| Telnyx (SMS send) | `SMS_Sender` | recipient phone (E.164), message body | Telnyx (3rd-party) | Vendor surface — out-of-AWS. **TCPA carve-out path:** opt-in / STOP consent retention sits in the SMS-twin domain (4-yr retention; locked decision #4); Path A coordinates only. |
| Bedrock (model invocation) | `Bedrock_Streaming_Handler_Staging` (and any model-using Lambda) | Prompt content (user message + KB chunks) | AWS Bedrock | See §E. |
| Meta Graph API (page reply) | `Meta_Response_Processor` | PSID, outbound message text | Meta | 3rd-party. Bound by Meta Platform Terms. |
| **Tenant-configured downstream webhooks** (e.g. n8n, Google Sheets, Slack, CRM, nonprofit systems) | MFS fulfillment when `fulfillment_type` includes a webhook / sheet / external HTTP destination (per tenant config) | Form responses (full PII payload, tenant-defined shape) | **Per tenant** (opaque from platform view) | **The largest enumeration gap.** Platform cannot enumerate the set of downstream destinations statically — they are tenant-config-driven, may change without notice, and **live outside any DPA Picasso controls (no DPA, no encryption assurance, no delete reachability)**. Flagged as Finding 9 below. Coordinates with the conditional-S3 surface in §C (Finding 5). |
| **Tenant-configured downstream S3 buckets** (conditional form fulfillment) | MFS fulfillment when `fulfillment_type == 's3'` | Form responses (full PII payload) | **Per tenant** (per-tenant bucket; not IaC-managed) | Same vendor-edge truth as the webhooks row: **no platform-controlled DPA, no encryption assurance, no delete reachability.** See §C row + Finding 5 + Finding 8. |

---

## H. Carve-outs (locked decision #4 from Path A — enumerated + coordinated, NEVER deleted by Path A)

| Surface | Why retained | Owner |
|---|---|---|
| `picasso-sms-usage` (PK `tenant_id` + `month`; phone + usage `count`) + SMS opt-in / STOP consent records | TCPA — 4-yr consent retention | **SMS-twin project** (not MFS); Path A coordinates only |
| COPPA artifacts (if any tenant operates a COPPA-applicable program) | COPPA retention | counsel-scoped (Phase 5 legal gate) |
| `picasso-pii-delete-audit-staging` (future) | Audit integrity for delete operations | future PII delete pipeline |
| `picasso-audit-staging` (existing) | Audit integrity — operator action log | MFS; TTL-ages-out per `retention_expires_at` |

---

## Findings (deltas vs the seed and IaC, beyond the seed's original 1–5)

Findings 1–5 are carried verbatim from the seed [`PII_SURFACE_INVENTORY.md`](./PII_SURFACE_INVENTORY.md). The new findings below are net-new to D2 at Phase 0.5.

1. (seed) **`recent-messages` has NO TTL block** + stores Meta-PSID-keyed conversation content. Phase 2 DELETE target; Phase 3 must add a TTL block.
2. (seed) **Meta surfaces are post-seed-charter** — identity graph must walk PSID-keyed `sessionId` patterns in addition to `pii_subject_id` / email.
3. (seed) **`session-events` is class TTL-ONLY but may carry PII attributes in payloads** — Phase 2 spot-audit; reclassify if matchable identity attrs present.
4. (seed) **`employee-registry-v2` is employee/operator PII, not consumer** — out of Path A scope; counsel-input for CPRA employee rights (gap G-H).
5. (seed) **Conditional S3 fulfillment writes raw form PII to per-tenant buckets** — delete pipeline must resolve per-tenant bucket from tenant config at runtime.
6. **(new) Stripe webhook handler not found in `infra/modules/`** on this branch. The `picasso-tenant-registry-staging` table has a `StripeCustomerIdIndex` GSI implying a writer. Either the handler is hand-managed in prod (legacy, per CLAUDE.md "legacy operations against the hand-managed prod resources") or it lives outside the `staging-twin` set. Action: confirm during D3 flow-map; if a Lambda exists, enumerate it in §A and the corresponding log group in §D.
7. **(new) `staging-session-summaries` has DDB streams (`OLD_IMAGE`)** — only PII-adjacent table with streams in IaC. **Stream consumer is not yet enumerated** — D2 cannot name the downstream Lambda or Kinesis target that consumes this stream. Action: identify the stream consumer during D3 flow-map. Common stream targets in AWS IaC: a Lambda event-source mapping, a Kinesis Firehose to S3, or an EventBridge pipe. D3's search list: if **Lambda**, enumerate the consumer's log group as a §D row + its IAM exec role + any writes it makes; if **S3**, enumerate the destination prefix as a §C row; if **none / dangling**, record as a no-op stream.
8. **(new) Per-tenant fulfillment buckets are opaque to the platform's encryption / retention / versioning posture.** §C row for `submissions/{tenant_id}/{form_type}/*` cannot be filled for versioning, lifecycle, or encryption — those are tenant-bucket-policy controlled. **For Phase 0.5 D2 purposes this is observation, not action.** Risk-framing and any remediation belong to D5 (risk register row) and Step 10 (re-baselined Path A roadmap), not D2.
9. **(new) Tenant-configured downstream destinations are not enumerable statically.** §G rows for tenant-configured webhooks + S3 buckets are **the largest open enumeration gap in D2.** Splitting the destinations by enumerability (per lifecycle-advisor strong-rec):
   - **Platform-known vendor sinks (enumerable, in §G):** SES, Telnyx, Bedrock, Meta Graph — these are platform-controlled outbound destinations with platform-controlled credentials / DPA / region posture (where applicable).
   - **Tenant-configured opaque sinks (not enumerable at the platform level):** n8n flows, Google Sheets, CRMs, custom HTTP webhooks, tenant-configured S3 buckets. Platform cannot list which tenants send form responses to which destinations. **No platform-controlled DPA, no encryption assurance, no delete reachability.**
   This finding is an **input to Decision A** (resolver/executor flip, answered at D5). D2 records the surface gap; D5 weighs it.
10. **(new) PITR is enabled on every PII table** (verified across all 13 PII-relevant DDB modules in IaC). **PITR retains a continuous backup for 35 days regardless of row deletion** — a deleted row remains recoverable for 35 days after delete. This is **a flagged input to D5** (gap G-G — "reasonable steps" question for counsel) and to the re-baselined Path A roadmap (Step 10); D2 records the 35-day window as a fact, not a posture decision.
11. **(new) Apply-1 CMK is applied to NO PII table.** All §B PII rows are SSE-DDB (AWS-owned key) today. Apply-1 created `kms-pii-staging` + 3 roles only. Apply-2 (deferred indefinitely per [Phase 0.5 pause memo](../../../)) is what attaches the CMK to tables. **For Phase 0.5 D2 purposes this is observation, not action** — D2 records the encryption state as-is.
12. **(new) Meta-PSID → `pii_subject_id` mapping is not represented in the inventory.** The Phase-1 lookup index (`picasso-pii-subject-index-staging`) has PK = `normalized_email` and no PSID column. The Meta-channel rows in §B (`staging-recent-messages`, `staging-conversation-summaries`, `picasso-channel-mappings-staging`) carry PSID-keyed `sessionId` patterns but are not linked back to any subject identifier the delete walk can match by email. **Implication:** a Meta-only subject (chatted via Messenger; never submitted an email-bearing form) is currently **unreachable by the Phase-1 identity walk**. The seed inventory's open design item for Phase 2 ("Linking PSID→`pii_subject_id` is not solved by Phase 1") is *the same gap* — D2 surfaces it explicitly so D3 must draw the missing edge and D5 must carry it as a risk row.
13. **(new) Bedrock model-invocation logging state is unverified.** If `aws_bedrock_model_invocation_logging_configuration` is enabled on the account, every Bedrock invocation persists its prompt (which carries user free-text PII) in AWS-managed CloudWatch and/or S3 destinations **under MyRecruiter's account** — materially expanding the persistence surface beyond §B / §D. No Bedrock logging resource was found in `infra/modules/` on this branch, but it is an account-level configuration (not a per-Lambda resource), so absence from `infra/modules/` does not prove absence on-account. **Verify in D3** at the account level. Region constraint also unverified (suspected `us-east-1`; cross-region inference profiles open).

---

## What feeds which downstream deliverable

- **D3 (data-flow-map)** consumes §A → §F → §G as the edges; §B / §C / §D as the destinations. Open enumeration gaps (Findings 6, 7, 9, 12, 13) are the edges D3 must draw to "unknown" and label as such.
- **D4 (classification)** assigns Tier 0–4 to every row in §B / §C / §D / §E. The §B `Scope` column is a coarse first cut, not a tier.
- **D5 (risk register)** pre-seeded rows: G-A (widget claim — see [Step 5 verification](../../../)), G-B (this inventory existing closes the snapshot half; the CLAUDE.md PR rule closes the living half), and Findings 1, 5, 8, 9, 10, 11, 12, 13 (above) each become D5 rows.
- **Counsel input package (Step 8)** ships this file + D1 + D4 + the historical design doc. Findings 8, 9, 10, 12, 13 frame the "reasonable steps" question (gap G-G).
- **Re-baselined Path A roadmap (Step 10)** treats Finding 9 (tenant-configured downstream sinks) and Finding 12 (PSID mapping) as inputs to Decision A. D2 records the surfaces; Step 10 weighs the consequences.

---

## Open items deferred out of D2 (named here so they don't get re-discovered later)

- **Stream consumer of `staging-session-summaries`** — Finding 7. D3.
- **Stripe webhook handler enumeration** — Finding 6. D3.
- **Per-tenant fulfillment bucket validation** — Finding 8. Phase 0.5 closeout names mitigation owner.
- **Tenant-configured downstream vendor inventory** — Finding 9. Second-wave deliverable (out of Phase 0.5 scope per plan §"Scope of this plan"); explicitly named in the Phase 0.5 closeout (Step 11).
- **Live-state reconciliation** — D2 is an IaC-truth inventory. Apply-2 (deferred) or a one-shot live audit must reconcile against runtime state.

## Verification (mechanical exit-criteria check for the Phase 0.5 plan)

- **Done when "no surface a reviewer can name is missing"** — verified by:
  - All §A Lambdas have either an IaC module or are explicitly noted as legacy / hand-managed / not-yet-implemented.
  - All §B DDB tables are present in `infra/modules/ddb-*/main.tf` (16 PII-relevant tables enumerated; 17th `pii-delete-audit-staging` is forward-referenced).
  - All §C S3 prefixes are either platform-managed (verified versioning + encryption from IaC) or noted as per-tenant-opaque.
  - All §D log groups correspond 1:1 to Lambdas in §A.
  - All §E Bedrock surfaces flow into §B / §G destinations.
  - §F / §G inbound + outbound edges are complete; gaps explicitly named as Findings 6 + 7 + 9.
- **G-B inventory-snapshot closure** — this file existing satisfies the snapshot half. The living half is the CLAUDE.md PR rule (Step 3 of plan, already shipped in PR #148).

---

## Links

- Plan: `~/.claude/plans/let-s-work-on-the-cheerful-manatee.md`
- Charter (D1): [`pii-project-charter.md`](./pii-project-charter.md)
- Historical seed: [`PII_SURFACE_INVENTORY.md`](./PII_SURFACE_INVENTORY.md)
- Path A historical design: [`PII_DELETE_PIPELINE_DESIGN.md`](./PII_DELETE_PIPELINE_DESIGN.md)
- Path A roadmap (re-baseline pending Step 10): [`CONSUMER_PII_REMEDIATION.md`](./CONSUMER_PII_REMEDIATION.md)
- Strategy doc (source of truth): [`README.md`](./README.md)
- Step 5 G-A verification: `~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_pii_governance_phase05_step5_widget_claim_verification_2026-05-20.md`
- Public-bucket finding (cross-track, prod): `~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_myr_picasso_bucket_public_read_finding_2026-05-19.md`

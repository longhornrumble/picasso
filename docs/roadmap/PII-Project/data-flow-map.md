# PII Data Flow Map (D3)

**Phase 0.5 deliverable D3.** Established 2026-05-20. One Mermaid diagram + numbered narrative. Every surface enumerated in [`pii-inventory.md`](./pii-inventory.md) (D2) has at least one labeled inbound edge and (if applicable) outbound edge. Edges are labeled with the PII fields that flow across them. Open enumeration gaps surfaced in D2 (Findings 6, 7, 9, 12, 13) appear as edges drawn to "unknown" with explicit labels — **except where D3 closed them with verifiable evidence** (see "D2 verify-in-D3 closure" below). Source-of-truth for D4 (classification) and D5 (risk register).

> **Method:** read-only inspection of `origin/staging` IaC (`infra/main.tf`, `infra/modules/`) + Lambda source in `Lambdas/lambda/*` (read from the lambda-repo / `Working_Folder` working tree without modification). All citations are file:line where applicable. **Diagram nodes use D2's IaC-truth names** (e.g. `staging-recent-messages`, not the deprecated `picasso-recent-messages-staging`).

> **Scope discipline (compliance-implementation-advisor remit, carried from D2):** D3 enumerates flows and closes verify-in-D3 items. It does **not** prescribe redaction policy, vendor SLAs, or pre-decide Decisions A or B. Findings flag inputs to D5; D5 weighs them.

---

## D2 verify-in-D3 closure (what this PR resolves)

| D2 deferred item | Status in D3 | Citation |
|---|---|---|
| `ses_event_handler` writes `ttl` on notification-events | ✅ **Confirmed.** 90-day TTL. | [`Lambdas/lambda/ses_event_handler/lambda_function.py:205`](../../../) — `'ttl': int(time.time()) + (90 * 24 * 3600)` inside the `put_item` at `:190`. |
| `conversation_handler` writes `expires_at` on conversation-summaries | ✅ **Confirmed.** Writer-set TTL. | [`Lambdas/lambda/Master_Function_Staging/conversation_handler.py:717`](../../../) — `'expires_at': {'N': str(summary_ttl)}` inside `put_item` at `:743`. |
| `conversation_handler` also writes `expires_at` on `staging-recent-messages` | ⚠️ **Confirmed write, but no-op.** Writer sets `expires_at` at `:769` (`put_item` at `:784`), **BUT** `ddb-recent-messages-staging/main.tf` has no `ttl{}` block, so TTL is not enabled with that attribute. The writer's intent does not materialize at the table. **D2 Finding 1 still open** in the inverse sense from form-submissions: there, the table has TTL infra but the writer doesn't set it; here, the writer sets it but the table has no TTL infra. D5 carries the writer-attempts-but-table-has-no-TTL row; remediation owner is named at D5 / Step 10. | Same file. |
| Bedrock model-invocation logging account-level state | ⏸️ **Not resolvable at IaC layer.** No `aws_bedrock_model_invocation_logging_configuration` resource in `infra/main.tf` or modules; absence does not prove non-enablement (account-level, not necessarily IaC-managed). **Carried as Finding 13 still open** — requires AWS Console / CLI to verify. D3 advances the search list: `aws bedrock get-model-invocation-logging-configuration` per region (staging account 525, prod 614). | n/a |
| Stream consumer of `staging-session-summaries` | ✅ **Identified.** Consumer is `picasso-session-archiver` (Lambda event source mapping). It reads OLD_IMAGE stream records and writes them to an S3 archive bucket. | [`infra/main.tf`](../../../) `resource "aws_lambda_event_source_mapping" "picasso_session_archiver"` (count = staging only) + [`Lambdas/lambda/picasso_session_archiver/lambda_function.py:37,119`](../../../) — `ARCHIVE_BUCKET` env var; `s3.put_object`. **This surfaces a new S3 row** — see §C update below. |
| Stripe webhook handler | ✅ **Identified.** Lives at `Lambdas/lambda/Stripe_Webhook_Handler/` — exists in source but **not in `infra/modules/`** on this branch. Likely hand-managed in prod (per CLAUDE.md legacy note). Operator-tier (`NOT-CONSUMER`); added to §A and §F. | `Lambdas/lambda/Stripe_Webhook_Handler/` |
| `log_retention_days` numeric default | ✅ **Confirmed = 14 days** (NOT 30 as the seed asserted). | [`infra/main.tf:307`](../../../) — `log_retention_days = 14`. |

D2's stated row text for these items remains valid (it explicitly said "unverified — D3" or "verify in D3"); D3 is the canonical source for the resolved values going forward.

---

## The diagram

One graph. Left = external actors; middle = Lambdas; right = storage / vendor sinks. Edge labels = PII fields that cross the edge. Unknown / open edges drawn dashed with a `?`.

```mermaid
graph LR
  %% ── External actors ───────────────────────────────────────────────────────
  Browser[("Browser widget<br/>chat.myrecruiter.ai")]
  Meta[("Meta Graph<br/>(webhooks + reply)")]
  Telnyx[("Telnyx<br/>(SMS inbound + outbound)")]
  SES[("Amazon SES<br/>(send + bounce/complaint events)")]
  Stripe[("Stripe<br/>(billing webhooks)")]
  Bedrock[("AWS Bedrock<br/>(model + KB)")]
  KBStore[("Bedrock Knowledge Base<br/>tenant-uploaded content")]
  TenantSink[("Tenant-configured<br/>downstream sinks<br/>n8n / Sheets / CRM / webhooks")]

  %% ── Lambdas ──────────────────────────────────────────────────────────────
  MFS["Master_Function_Staging<br/>(Python)"]
  BSH["Bedrock_Streaming_Handler_Staging<br/>(Node)"]
  MetaWebhook["Meta_Webhook_Handler"]
  MetaResponse["Meta_Response_Processor"]
  MetaOAuth["Meta_OAuth_Handler"]
  SMSSender["SMS_Sender"]
  SMSWebhook["SMS_Webhook_Handler"]
  SendEmail["send_email<br/>(utility)"]
  SESHandler["ses_event_handler"]
  AnalyticsEP["Analytics_Event_Processor"]
  AnalyticsDashboardAPI["Analytics_Dashboard_API<br/>(read)"]
  SessionArchiver["picasso-session-archiver"]
  StripeHandler["Stripe_Webhook_Handler<br/>(hand-managed)"]
  ConfigManager["Picasso_Config_Manager"]
  FuturePIIDelete["(future) PII delete Lambda<br/>Apply-2 scaffold"]

  %% ── Storage ──────────────────────────────────────────────────────────────
  FormSubs[("picasso-form-submissions-staging<br/>SSE-DDB · PITR")]
  PIISubjectIdx[("picasso-pii-subject-index-staging<br/>PK normalized_email")]
  NotifSends[("picasso-notification-sends-staging<br/>ttl=90d")]
  NotifEvents[("picasso-notification-events-staging<br/>ttl=90d writer-confirmed")]
  RecentMsgs[("staging-recent-messages<br/>NO TTL block · writer-attempts-expires_at")]
  ConvSummaries[("staging-conversation-summaries<br/>expires_at writer-confirmed")]
  ChannelMaps[("picasso-channel-mappings-staging<br/>page tokens (kms-channel-tokens-staging CMK)")]
  WebhookDedup[("picasso-webhook-dedup-staging<br/>ttl")]
  SessionEvents[("picasso-session-events-staging<br/>may carry PII attrs")]
  SessionSummaries[("staging-session-summaries<br/>stream OLD_IMAGE")]
  Audit[("picasso-audit-staging<br/>retention_expires_at")]
  TenantRegistry[("picasso-tenant-registry-staging")]
  S3TenantConfig[("S3: myrecruiter-picasso{,-staging}<br/>versioning on · public-read in prod")]
  S3Fulfillment[("S3: per-tenant fulfillment bucket<br/>opaque")]
  S3AnalyticsEvents[("S3: picasso-analytics-events-staging<br/>CMK")]
  S3Archive[("S3: ARCHIVE_BUCKET<br/>AI-inferred session summaries · OLD_IMAGE archive · NEW SURFACE D3"):::newSurface]
  LogGroups[("CloudWatch log groups<br/>retention=14d (root main.tf:307)")]
  BedrockInvocationLog[("Bedrock model-invocation logging<br/>prompt + response if enabled · account-level · UNVERIFIED"):::open]
  IntentTopicLabels[("(future) intent / topic labels<br/>AI-inferred PII · surface placeholder"):::open

  %% ── Inbound edges (carry PII into platform) ──────────────────────────────
  Browser ==>|chat text · message content · form_data {class: volunteer_interest, donor_inquiry, contact, newsletter, event_rsvp} = name/email/phone/free-text| MFS
  Browser ==>|streaming chat tokens via SSE| BSH
  Meta ==>|PSID · mid · message text · signature| MetaWebhook
  Telnyx ==>|phone · inbound SMS body · Ed25519 sig| SMSWebhook
  Telnyx -.->|STOP/HELP consent signal<br/>SMS-twin TCPA carve-out| SMSWebhook
  SES ==>|recipient email · bounce/complaint payload| SESHandler
  Stripe ==>|stripe_customer_id · billing event metadata| StripeHandler

  %% ── Intra-platform Lambda → storage (writes) ─────────────────────────────
  MFS -->|form_data raw responses · session_id · pii_subject_id<br/>NO ttl written form_handler._store_submission| FormSubs
  MFS -->|normalized_email · pii_subject_id| PIISubjectIdx
  MFS -->|recipient email · message_id · ttl=90d<br/>form_handler.py:796,820| NotifSends
  MFS -->|conversation message content<br/>writer attempts expires_at:769 — NO-OP, table lacks ttl{}| RecentMsgs
  MFS -->|AI-INFERRED summary text (Bedrock-generated, about subject) · sessionId<br/>expires_at:717| ConvSummaries
  MFS -->|tenant_hash · event_id · retention_expires_at| Audit
  MFS -.->|fulfillment_type='s3' raw form PII<br/>per-tenant bucket from config| S3Fulfillment
  MFS -->|recipient · message body| SendEmail
  SendEmail ==>|recipient · subject · body| SES
  MFS -->|phone · body| SMSSender
  SMSSender ==>|phone · SMS body| Telnyx

  %% ── Bedrock invocation edges (region + content-quality annotations) ──────
  KBStore ==>|retrieved chunks injected into prompt<br/>adjacent-KB-leak risk| Bedrock
  MFS ==>|prompt = user msg + KB + system<br/>region=us-east-1 unverified · cross-region inference profile unverified| Bedrock
  BSH ==>|prompt content<br/>region=us-east-1 unverified| Bedrock
  Bedrock ==>|streamed assistant tokens · AI-INFERRED summary<br/>content-quality + hallucination + prompt-injection + KB-verbatim risk| MFS
  Bedrock ==>|streamed tokens<br/>content-quality + hallucination + prompt-injection + KB-verbatim risk| BSH
  BSH -->|streamed response to widget<br/>solicitation / tax / eligibility / safety claim risk| Browser
  Bedrock -.->|prompt + response persisted to MyR account-managed CW/S3 if enabled<br/>UNVERIFIED Finding 13| BedrockInvocationLog
  BSH -.->|prompt + response if logging on| BedrockInvocationLog
  Bedrock -.->|(future) intent / topic labels| IntentTopicLabels

  MetaWebhook -->|mid · ttl| WebhookDedup
  MetaWebhook -->|inbound event| MetaResponse
  MetaResponse -->|PSID-keyed sessionId · message content| RecentMsgs
  MetaResponse -->|PSID-keyed sessionId · AI-INFERRED summary| ConvSummaries
  MetaResponse -->|PSID · last_message_at · encrypted page tokens<br/>kms-channel-tokens-staging CMK item-level| ChannelMaps
  MetaResponse ==>|PSID · outbound message text| Meta
  MetaOAuth -->|pageId · encrypted page tokens| ChannelMaps

  SESHandler -->|message_id · recipient · bounce/complaint · ttl=90d<br/>ses_event_handler.py:205| NotifEvents

  AnalyticsEP -->|event payloads may carry PII attrs + intent signals (donate_now, volunteer_application) Finding 3| SessionEvents
  AnalyticsEP -->|event batches · CMK alias/analytics-event-processor-logs-staging| S3AnalyticsEvents

  %% Session-summaries write path (multiple writers; aggregated here)
  MFS -->|AI-INFERRED session summary| SessionSummaries
  AnalyticsEP -->|session summary| SessionSummaries

  %% Session-summaries → stream → archiver → S3 (Finding 7 closure)
  SessionSummaries -.->|stream OLD_IMAGE<br/>aws_lambda_event_source_mapping.picasso_session_archiver| SessionArchiver
  SessionArchiver ==>|archived AI-INFERRED OLD_IMAGE session summaries<br/>s3.put_object lambda_function.py:119| S3Archive

  ConfigManager -->|tenant config JSON · operator recipient lists| S3TenantConfig

  AnalyticsDashboardAPI -.->|read-only| SessionEvents
  AnalyticsDashboardAPI -.->|read-only| SessionSummaries
  AnalyticsDashboardAPI -.->|read-only| NotifEvents

  StripeHandler -->|stripe_customer_id · billing event| TenantRegistry

  %% ── Outbound to tenant-opaque sinks ───────────────────────────────────────
  MFS -.->|fulfillment_type=webhook/external<br/>full form PII to tenant-controlled URL · donor-class often → tenant CRM<br/>NO platform DPA Finding 9| TenantSink

  %% ── Future delete Lambda fan-out (Apply-2 scaffold-only intent, NOT current flows) ─
  FuturePIIDelete -.->|cross-tenant DELETE walk Apply-2| FormSubs
  FuturePIIDelete -.->|DELETE walk| PIISubjectIdx
  FuturePIIDelete -.->|DELETE walk| NotifSends
  FuturePIIDelete -.->|DELETE walk| NotifEvents
  FuturePIIDelete -.->|DELETE walk · Finding 12: Meta-only subjects unreachable until PSID index lands| RecentMsgs
  FuturePIIDelete -.->|DELETE walk · Finding 12: Meta-only subjects unreachable until PSID index lands| ConvSummaries
  FuturePIIDelete -.->|DELETE walk per-tenant bucket| S3Fulfillment
  FuturePIIDelete -.->|? Finding 12 PSID mapping gap — no row in pii-subject-index| ChannelMaps
  FuturePIIDelete -.->|? Finding 14: archive bucket reachability is a Decision-A input at D5| S3Archive

  %% ── Lambda → log group (every Lambda) ────────────────────────────────────
  MFS -.->|recipient email · phone · message bodies<br/>retention=14d| LogGroups
  BSH -.->|prompts + responses<br/>retention=14d| LogGroups
  MetaWebhook -.->|PSID · message text| LogGroups
  MetaResponse -.->|PSID · message content| LogGroups
  MetaOAuth -.->|OAuth state · page tokens?| LogGroups
  SMSSender -.->|phone · body| LogGroups
  SMSWebhook -.->|phone · inbound body| LogGroups
  SESHandler -.->|recipient · bounce payload| LogGroups
  AnalyticsEP -.->|event payloads| LogGroups
  SessionArchiver -.->|session summary content in error logs?| LogGroups
  StripeHandler -.->|stripe ids| LogGroups
  ConfigManager -.->|operator config payloads| LogGroups
  AnalyticsDashboardAPI -.->|query params · partial responses| LogGroups
  SendEmail -.->|recipient · subject| LogGroups
  FuturePIIDelete -.->|subject id · delete walk audit| LogGroups

  classDef newSurface fill:#ffe9a8,stroke:#b58900,stroke-width:2px
  classDef open fill:#f4cccc,stroke:#cc0000,stroke-width:2px,stroke-dasharray: 5 5
```

**Reading the diagram:**
- Thick edges (`==>`) = primary PII-bearing flows (single direction; what's in the label is what crosses).
- Thin edges (`-->`) = secondary or write-only persistence flows.
- Dashed edges (`-.->`) = stream / async / conditional / log / read-only / future flows.
- Yellow node = new surface surfaced by D3 (the archive bucket).
- Red dashed node = open / unverified surface (Bedrock invocation logging).

---

## Numbered narrative

Each numbered flow walks one PII path end-to-end. Edges are referenced by their label substring.

### 1. Browser → MFS → form-submissions (volunteer / donor / contact form submission — the primary consumer-PII inbound)

A visitor fills out a Picasso conversational form. The widget POSTs `form_data` to `Master_Function_Staging` (MFS). **`form_data` is per-form-class** (`volunteer_interest`, `donor_inquiry`, `contact`, `newsletter`, `event_rsvp`, etc., per tenant config) carrying raw name / email / phone / free-text answers + `session_id` / `conversation_id`. **Routing of submissions is per-form-class** — a donor-inquiry form and a volunteer-interest form on the same tenant may have different `fulfillment_type` and therefore different downstream sinks with different sensitivity; D3 does not enumerate per-tenant routing, only the platform-side flows.

MFS's `form_handler._store_submission` writes to `picasso-form-submissions-staging` with `pii_subject_id` (Phase 1) but **no `ttl`** — D2 row + Finding 1 + Step 5 widget-claim verification (G-A). Data is effectively permanent until the future delete Lambda lands.

In parallel, MFS writes a row to `picasso-pii-subject-index-staging` (PK `normalized_email`; GSI `PiiSubjectIdIndex`) so the future delete walk can find this submission by email or by subject id. **Identity-graph gap (Finding 12):** Meta-PSID sessions never produce a row here.

MFS also writes the conversation transcript to `staging-recent-messages` and attempts to set `expires_at` at `conversation_handler.py:769`, **but that table has no `ttl{}` block in IaC**, so the attribute is a no-op metadata field. This is the **inverse** of the form-submissions defect (D2 Finding 1): there the table has TTL infra and the writer doesn't set it; here the writer sets it and the table has no TTL infra.

If the tenant config sets `fulfillment_type == 's3'`, MFS additionally writes the **raw responses** JSON to a per-tenant S3 bucket (Finding 5 / Finding 8) — the platform cannot enumerate that bucket's encryption / versioning / lifecycle posture.

If the tenant config sets a webhook / external HTTP fulfillment, MFS POSTs the same payload to a **tenant-configured opaque sink** (Finding 9). No platform DPA, no encryption assurance, no delete reachability. **Donor-class submissions** routed this way typically land in tenant donor CRMs (Salesforce NPSP, Bloomerang, DonorPerfect, Raiser's Edge), whose internal access model the platform cannot observe — donor identity may become visible to volunteer-coordinator / staff at the tenant via that CRM even when the donor expected confidentiality.

**Content-class horizontal concern (carries through every edge below that transports `form_data` or `message text`):** Picasso tenants include foster/adoption, DV shelters, hospice, recovery, and other vulnerable-population programs. `form_data` free-text from these tenants may contain disclosures about minors, crisis, health, housing, or immigration status even when no field is labeled as such. D3 treats this as a horizontal concern; D5 carries the row.

### 2. Browser ↔ Bedrock_Streaming_Handler → Bedrock (the conversational AI path)

Chat messages flow from the widget to `Bedrock_Streaming_Handler_Staging` (Node, true response streaming). The handler composes a prompt = user message + KB-retrieved chunks (from `KBStore` — tenant-uploaded Knowledge Base content) + system prompt and invokes Bedrock. Tokens stream back via SSE to the widget. The same Bedrock invocation path is used by MFS for non-streaming inferences (e.g., conversation summary generation).

**AI-governance posture statement (strategy doc principle #7 — verbatim binding):** No edge in this diagram routes Bedrock output into an automated eligibility, approval, safety, tax, legal, or placement decision. AI output is informational / assistive / summarizing only. Any future edge that would route AI output into automated decisioning must trigger a dedicated AI-governance review before merge.

**Bedrock surface notes:**
- Invocation region suspected `us-east-1`; cross-region inference profile unverified. Edge labels carry the same hedge.
- Model-invocation logging account-level state **unverified** (Finding 13). If enabled, every prompt **and response** is persisted in MyRecruiter-owned CloudWatch / S3 — a parallel persistence surface beyond §B / §D.
- Two-layer prompt-persistence risk: (a) account-level Bedrock logging if on (Finding 13); (b) the BSH and MFS Lambda log groups themselves carry prompts + responses at 14-day retention regardless.
- **KB adjacency leak risk:** KB chunks injected into the prompt may appear verbatim in the streamed response, leaking adjacent KB content into the visitor's session. If tenant KB content contains operator or consumer PII (e.g., scraped volunteer rosters, donor testimonials), the leak vector is the response edge itself.
- **AI response content-quality surface:** the streamed assistant tokens may include hallucinated unsupported tax-deductibility claims, solicitation-flavored language, fabricated eligibility / onboarding guarantees, prompt-injection echoes, or KB-verbatim leaks. This is a content-quality surface distinct from prompt persistence; D5 must carry a row.
- **Future surface:** intent / topic labels (strategy doc names this as inferred PII). The placeholder `IntentTopicLabels` node exists in the diagram so the living-inventory PR rule fires when this surface lands.
- Conversation summaries synthesized later are written to `staging-conversation-summaries` by MFS's `conversation_handler` — **AI-inferred** PII about the subject (labeled "AI-INFERRED" on the diagram edges), in delete scope.

### 3. MFS → notification send + SES event return

When a form submission triggers an email notification (per tenant config), MFS routes through the `send_email` utility Lambda → SES. **The notification body contains the submitter's `form_data` payload (including donor identity if donor-class form) and is delivered to a tenant-configured recipient list (volunteer coordinators, donor-relations staff) stored in S3 tenant config (`myrecruiter-picasso{,-staging}`). Recipient-list membership is operator PII and outside the consumer delete walk; the email payload itself is consumer PII in transit to operator readers.**

SES then asynchronously delivers / bounces / complains, sending events back to `ses_event_handler`, which writes to `picasso-notification-events-staging` with `ttl = now + 90d` ([`ses_event_handler/lambda_function.py:205`](../../../)) — **D2 verify-in-D3 confirmed.** MFS also writes the send record itself to `picasso-notification-sends-staging` with `ttl = 90d` (D2 row).

### 4. MFS → SMS send via SMS_Sender → Telnyx

Recipient phone (E.164) and message body go from MFS to `SMS_Sender`, which reads the Telnyx secret from Secrets Manager (gated by `kms-channel-tokens-staging`-style scoped CMK and a secret-resource policy that only allows the two SMS Lambdas as readers). Telnyx delivers; inbound replies (STOP/HELP) arrive at `SMS_Webhook_Handler`, signature-verified via Ed25519 — fails closed if `TELNYX_PUBLIC_KEY` is empty. STOP/HELP consent records live in the SMS-twin domain carve-out (TCPA 4-yr retention).

### 5. Meta webhooks → Meta_Webhook_Handler → Meta_Response_Processor (the Meta channel path)

Meta sends webhook POSTs to `Meta_Webhook_Handler` (verified via signature against the Meta App secret). The handler writes `mid` to `picasso-webhook-dedup-staging` with TTL (transient pseudonymous dedup ledger) and hands the event off to `Meta_Response_Processor`.

`Meta_Response_Processor`:
- Writes the **PSID-keyed sessionId** message content to `staging-recent-messages` and AI-inferred summaries to `staging-conversation-summaries`.
- Updates `picasso-channel-mappings-staging` with PSID-scoped records + **encrypted page tokens** (encrypted via `kms-channel-tokens-staging` CMK — item-level encryption pattern; **this is the only PII-adjacent table with item-level CMK in IaC today**, useful contrast for D4 tier-classification).
- Sends outbound reply text via the Meta Graph API.

**STOP/HELP consent signals** arriving via Telnyx into `SMS_Webhook_Handler` are part of this Meta-adjacent inbound path conceptually but live in the SMS-twin domain (TCPA 4-yr consent retention carve-out per D2 §H). Drawn as a separate dashed inbound edge in the diagram.

**Identity-graph gap (Finding 12):** The PSID-keyed `sessionId` is a pseudonymous personal identifier under GDPR. The Phase-1 delete walk has no PSID column in `picasso-pii-subject-index-staging` — Meta-only subjects are currently unreachable by the identity walk. **The gap propagates to all three PSID-keyed tables** (`channel-mappings`, `staging-recent-messages`, `staging-conversation-summaries`); the diagram annotates each future-delete fan-out edge with the Finding 12 reference.

### 6. picasso-session-archiver: the OLD_IMAGE archive (Finding 7 closure + new §C row)

`staging-session-summaries` is the only PII-adjacent DDB table with DDB Streams enabled in IaC (view: `OLD_IMAGE`). The stream is consumed by `aws_lambda_event_source_mapping.picasso_session_archiver` (count = staging only), which routes the OLD_IMAGE records to the `picasso-session-archiver` Lambda. That Lambda reads `ARCHIVE_BUCKET` from env and writes archived AI-inferred session summaries to S3 via `s3.put_object` ([`picasso_session_archiver/lambda_function.py:37, 119`](../../../)).

**Implication — new D3 surface (operator framing):** the S3 archive bucket contains historical session-summary content (PII-adjacent; AI-inferred summary text + sessionId — i.e., archived donor + volunteer conversational summaries, including AI-inferred attributes about the subject). **Source-table TTL does not propagate to the S3 archive; the two persistence surfaces age independently.** A donor or volunteer who asks the nonprofit to delete their record may have their record removed from the live table but retained in the archive; the nonprofit cannot honor a verifiable deletion request until this bucket is in scope. Whether the delete pipeline must reach this bucket is a Decision-A input at D5. The archive bucket name + region + encryption + lifecycle are **unverified at D3** — listed in the open items below.

### 7. Analytics pipeline: SQS → S3 → (Athena, future)

Analytics events arrive (browser → MFS → SQS `picasso-analytics-events-staging`, or directly from server-side emit) and are processed by `Analytics_Event_Processor`, which writes batches to S3 (`picasso-analytics-events-staging` bucket) under `analytics/tenant_id=…/year=…/…/{batch}.json`. The bucket has a dedicated CMK (`alias/analytics-event-processor-logs-staging`).

Per Finding 3: event payloads **may carry identifying attributes**, and for nonprofit dashboards they frequently include **intent signals** (`cta_clicked: donate_now`, `form_started: volunteer_application`, `chat_topic_classified: housing_assistance`) that are themselves sensitive when joined to a session. D2 classed the surface `TTL-ONLY` pending spot-audit; D5 must carry intent-signal sensitivity as a distinct row. The Athena/aggregator legacy path was decommissioned in prod per the Q4 cleanup project (per `MEMORY.md`); analytics-events queries today route through `Analytics_Dashboard_API` (read-only) which reads `picasso-session-events-staging`, `staging-session-summaries`, and `picasso-notification-events-staging`.

### 8. Stripe webhook handler (Finding 6 closure)

`Stripe_Webhook_Handler` exists at `Lambdas/lambda/Stripe_Webhook_Handler/` — verified in source. **It is not under `infra/modules/` in this branch**, consistent with hand-managed legacy resources. It receives Stripe billing webhooks and writes to `picasso-tenant-registry-staging` via the `StripeCustomerIdIndex` GSI path. The data is **tenant-level** (`stripe_customer_id`, billing event metadata) — `NOT-CONSUMER` per D2 §B.

### 9. Tenant-config + widget bucket flows (S3, operator-tier)

`Picasso_Config_Manager` (Node ESM) backs the config-builder portal and writes tenant configs to `myrecruiter-picasso{,-staging}` S3 buckets. Per D2 + the independent cross-track finding, the **prod bucket is anonymously readable** — with `s3:Versioning` enabled, any historical version of a config that embedded operator (or consumer) PII is retrievable via `?versionId=` without authentication. NOT-CONSUMER classification is presumptive pending a historical-version spot-audit (a D5 row).

The widget bucket (`picasso-widget{,-staging}`) holds public JS bundles only — no PII at rest.

### 10. Every Lambda → its CloudWatch log group

Every Lambda in §A of D2 writes to a CW log group with `retention_in_days = var.log_retention_days = 14` ([`infra/main.tf:307`](../../../) — **D2 verify-in-D3 confirmed; the seed's 30-day assertion was wrong**). The seed and D2 row D names the PII observed in MFS, Bedrock-handler, Meta-* log groups specifically.

**Charter principle #3 tension flag (D2 §D):** PII at 14-day retention is still a recurring snapshot in CloudWatch. D5 must carry a row for log-PII reduction.

### 11. Future PII delete Lambda fan-out (Apply-2, scaffold only)

The future delete Lambda (Apply-1 = IaC-roles only) will walk every `DELETE`-scoped row in D2 §B + the conditional S3 prefix in §C. The cross-tenant read-scope observation is recorded in D2 §A row; this is an input to Decision B at D5. The fan-out includes an open edge to `picasso-channel-mappings-staging`: that edge is currently **broken by Finding 12** (no PSID→subject-id mapping), drawn dashed with `?` in the diagram. A second `?` edge to `S3Archive` records Finding 14 (archive bucket reachability is a Decision-A input at D5).

---

## Findings (continuation from D2 + new D3 finding)

D2 Findings 1–13 are carried forward. D3 closes 5 of them (see "D2 verify-in-D3 closure" above) and surfaces one new finding:

14. **(D3 new) `picasso-session-archiver` writes deleted session-summaries OLD_IMAGE records to S3 (`ARCHIVE_BUCKET`).** The archive bucket is a previously un-enumerated PII-adjacent S3 surface holding AI-inferred session summaries. **Source-table TTL does not propagate to the S3 archive; the two persistence surfaces age independently.** Surface facts:
    - The bucket should appear as a §C row in D2's next revision (or be tracked here as authoritative until D2 is re-baselined).
    - Bucket name / region / encryption / lifecycle / versioning **unverified at D3** — requires live AWS or env-var inspection (the Lambda reads `ARCHIVE_BUCKET` from env; the Terraform that creates the bucket was not found in `infra/modules/` on this branch — suspected hand-managed).
    - Whether the delete pipeline must reach this bucket is a **Decision-A input at D5**, not a D3 prescription. D5 weighs the consequence.
    - Material to the "reasonable steps" counsel question (gap G-G).

15. **(D3 new) Bedrock streamed response is a content-quality surface, not only a PII-persistence surface.** Distinct from Finding 13 (which addresses prompt persistence): the streamed assistant tokens themselves may include hallucinated tax-deductibility claims, solicitation language, fabricated eligibility / onboarding guarantees, prompt-injection echoes, or KB-verbatim leaks. D5 must carry an AI-response-quality row separately from Finding 13's prompt-persistence row.

16. **(D3 new) KB content adjacency leak risk.** Tenant-uploaded Knowledge Base content (`KBStore` node) is injected into Bedrock prompts as retrieval chunks and may appear verbatim in the streamed response. If tenant KB content embeds operator or consumer PII (e.g., scraped volunteer rosters, donor testimonials), the leak vector is the response edge to the widget. KB hygiene responsibility (platform vs tenant) is a counsel-input question.

---

## What's still open after D3

| Open item | Where to verify |
|---|---|
| Bedrock model-invocation logging account-level state (Finding 13) | `aws bedrock get-model-invocation-logging-configuration` per region, both accounts (525 staging, 614 prod). |
| `ARCHIVE_BUCKET` name + region + encryption + lifecycle + versioning (Finding 14) | Live Lambda env var inspection + S3 bucket policy inspection. Hand-managed in prod likely. |
| `Stripe_Webhook_Handler` IaC coverage — currently hand-managed (Finding 6 follow-on) | Track as an infra-modernization candidate; not a Path A gate. |
| `staging-recent-messages` no-TTL-block defect (Finding 1 inverse) | D5 row + Step 10 re-baseline. |
| Per-tenant fulfillment bucket posture (Finding 8) | Tenant-by-tenant; not platform-resolvable. D5 row. |
| Tenant-configured opaque downstream sinks (Finding 9) | Vendor-inventory second-wave deliverable (out of Phase 0.5 scope). |
| Future intent / topic labels (placeholder node in diagram) | Living-inventory PR rule fires when this surface lands. |
| `SessionEvents` writer enumeration — confirm MFS write path | D2 §B row D3 source-of-truth; verify writers via Lambda source. |
| `Audit` table writer enumeration — confirm all writers (MFS today; possibly MetaWebhook / SMSWebhook / ConfigManager) | D2 §B row; verify writers via Lambda source. |

**Living-inventory PR rule (G-B closure compatibility):** a future PR adding a new node or edge to this map (or a new surface to D2) must update the diagram + narrative + open-items table + (when applicable) the D2 inventory in the same change — same discipline as the CLAUDE.md PR rule shipped in #148.

---

## What feeds which downstream deliverable

- **D4 (classification)** consumes every node in this diagram + every row in D2 §B/§C/§D/§E and assigns Tier 0–4. Edges in this diagram are useful for sanity-checking that a "Tier 4" assignment is consistent with where the data flows (a Tier 4 destination receiving Tier 2 data, or vice versa, is a tier-classification bug).
- **D5 (risk register)** picks up the same D2 Findings 1–13 plus the new D3 Findings 14, 15, 16, plus the still-open items in the table above, plus the horizontal vulnerable-population content-class concern named in §1, plus the donor-confidentiality row distinct from generic Finding 9, plus the AI-response-quality row distinct from Finding 13. Each becomes a row with L × I; the unmitigated H/H rows must have a named owner.
- **Counsel input package (Step 8)** ships D1 + D2 + D4 + the historical design doc; D3 is a supplementary input for the "reasonable steps" question (Findings 8, 9, 10, 12, 13, 14, 15, 16 all bear on it). Counsel questions surfaced by D3: (a) donor-class submission disclosure obligations at form-submit time; (b) Bedrock streamed response as a regulated "communication" under charitable-solicitation rules; (c) recipient-list inclusion of staff emails in tenant config — staff-side notice / consent; (d) AI-inferred conversation-summary content under GDPR Art. 22 (automated individual decision-making); (e) Bedrock prompts retained in account logging — scope for the delete pipeline?; (f) cross-region Bedrock inference profile = cross-border transfer?; (g) tenant-uploaded KB content hygiene — platform vs tenant responsibility; (h) future intent/topic labels — tenant disclosure update before first inference persisted?
- **Re-baselined Path A roadmap (Step 10)** uses Findings 9, 12, and 14 as Decision A inputs. D3 records the surfaces; Step 10 weighs the consequences.

---

## Links

- Plan: `~/.claude/plans/let-s-work-on-the-cheerful-manatee.md`
- Charter (D1): [`pii-project-charter.md`](./pii-project-charter.md)
- Inventory (D2): [`pii-inventory.md`](./pii-inventory.md) (PR #150, merged 2026-05-20)
- Historical seed: [`PII_SURFACE_INVENTORY.md`](./PII_SURFACE_INVENTORY.md)
- Historical design: [`PII_DELETE_PIPELINE_DESIGN.md`](./PII_DELETE_PIPELINE_DESIGN.md)
- Strategy doc (source of truth): [`README.md`](./README.md)
- Step 5 G-A verification: `~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_pii_governance_phase05_step5_widget_claim_verification_2026-05-20.md`

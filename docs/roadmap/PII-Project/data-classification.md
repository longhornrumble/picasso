# Data Classification (D4)

**Phase 0.5 deliverable D4.** Established 2026-05-20. Tier 0–4 definitions (adapted verbatim from the strategy doc's "Data Classification" section) + tier assignment for every surface in [`pii-inventory.md`](./pii-inventory.md) (D2) and every additional node surfaced in [`data-flow-map.md`](./data-flow-map.md) (D3). One-line justifications per row. Source-of-truth for D5 (risk register) tier columns and the re-baselined Path A roadmap's prioritization (Step 10).

> **Method:** apply the strategy doc's tier system as-is. Each row's tier is the **maximum** tier of data the surface holds, processes, or transmits — a Lambda touching Tier 3 data is Tier 3, even if it also touches Tier 1. Per the plan: *"Tier 0–4 definitions (½ page, adapt strategy doc's tier system — don't write a taxonomy paper)."* This is enumeration, not classification policy invention.

> **Done bar (verbatim from plan):** *"Every D2 row has a tier."*

---

## Tier definitions

Adapted from the strategy doc's "Suggested tiers" section ([`README.md` §Data Classification](./README.md)). Verbatim discipline applies to the examples + controls.

### Tier 0 — Public
- **Examples:** Public nonprofit website content; public program descriptions; public donation links.
- **Controls:** Can be used in RAG; can be cached; can appear in chatbot responses.

### Tier 1 — Operational Non-Sensitive
- **Examples:** Tenant name; public branding config; public website URL; public contact page URL.
- **Controls:** Tenant-isolated; safe for limited frontend exposure if intended.

### Tier 2 — Personal Information
- **Examples:** Name; email; phone; address; IP address; session ID; volunteer interest; donor interest.
- **Controls:** Tenant-isolated; access controlled; no unnecessary logging; retention defined; deletion/export possible.

### Tier 3 — Sensitive or Sensitive-Adjacent
- **Examples:** Full chat transcripts; child / minor information; foster care / family status; health / disability information; financial hardship; abuse / crisis disclosures; background-check-related information; precise location; AI-generated summaries about sensitive topics.
- **Controls:** Avoid collection where possible; redact logs; restrict access; shorter retention; human handoff rules; counsel review before expanding use.

### Tier 4 — Secrets / Security-Critical
- **Examples:** API keys; JWT secrets; AWS credentials; webhook secrets; tenant private routing rules; integration tokens.
- **Controls:** Never expose client-side; secrets manager / env only; least privilege; rotation process; no logs.

---

## Cross-cutting classification rules (applied uniformly below)

1. **Max-tier rule:** a surface holding mixed-tier data takes the **maximum** tier present. A Lambda log group that may contain Tier 3 chat content + Tier 2 emails is Tier 3.
2. **Free-text fields default to Tier 3:** any `form_data` free-text answer or chat-content field is treated as Tier 3 because the visitor may disclose any of the Tier 3 examples (crisis, minors, health, etc.) in an open field. The field's *intended* purpose does not lower the tier.
3. **AI-inferred content about subjects → Tier 3** — explicitly named in the strategy doc's Tier 3 examples ("AI-generated summaries about sensitive topics"). Applies to AI-inferred *summaries*, *topic labels*, *intent labels*, and *classifications* (future surfaces): `staging-conversation-summaries`, `staging-session-summaries`, the archive bucket, future intent / topic labels. **Sub-rule 3a:** any analytics row carrying a topic / intent label drawn from the Tier-3 example list (housing, crisis, health, immigration, legal, family, foster, abuse) inherits Tier 3 regardless of payload otherwise — the label *is* the AI-inferred-about-subject content. Spot-audit determines presence, not tier.
4. **Encrypted item-level secrets → Tier 4** — even if the surrounding row is Tier 2 (e.g., Meta page tokens stored in `picasso-channel-mappings-staging`, encrypted by `kms-channel-tokens-staging` CMK). The row inherits Tier 4 by the max-tier rule.
5. **Operator PII gets the same tier as consumer PII at the same sensitivity** — Tier 2 for operator email is the same as Tier 2 for consumer email. The `NOT-CONSUMER` column in D2 §B is a **scope** flag (in / out of Path A consumer-delete pipeline), not a tier-suppressor. CPRA employee-rights coverage is a counsel-input question regardless of tier.
6. **Read-path Lambdas inherit the tier of what they read** — `Analytics_Dashboard_API` reads Tier 2/3 tables; it is Tier 3 even though it does not write PII itself.
7. **Future / unverified surfaces inherit the maximum tier their nearest classified neighbor holds**, plus an explicit note. The living-inventory PR rule fires when the surface lands and a sharper tier becomes provable. (Earlier draft used "tier-floor"; that risked under-tiering. Safer-by-default = max-tier-of-neighbors.)

8. **Tier-3-by-confidentiality is a distinct dimension from Tier-3-by-sensitive-content.** Donor-class data takes Tier 3 on a **confidentiality** basis (donor anonymity, gift-amount sensitivity, donor-advised-fund relationships) even when the payload contains none of the Tier 3 sensitive-content examples. The two Tier-3 origins require **distinct mitigation framings in D5** — different controls, different counsel questions, different breach-disclosure posture. D4 records that both produce Tier 3; D5 separates them.

---

## Tier assignments

Every D2 row + every D3-surfaced new node has a row below.

### §A Lambda processing surfaces

| Lambda | Tier | One-line justification |
|---|---|---|
| `Master_Function_Staging` | **3** | Touches Tier 3 free-text form responses + chat transcripts + tenant-routed sensitive disclosures. **Donor-class submissions are Tier 3 on a confidentiality basis (rule 8)** distinct from sensitive-content Tier 3 — D5 separates the two mitigation framings. |
| `Bedrock_Streaming_Handler_Staging` | **3** | Processes Tier 3 chat content + KB chunks in prompts; streams Tier 3 inferred-PII responses; response-edge content-quality (hallucination / KB-verbatim leak / unsafe content per D3 Finding 15) is a Tier 3 surface risk on its own and feeds D5. |
| `Meta_Webhook_Handler` | **3** | Inbound Tier 3 Meta chat content keyed by Tier 2 PSID identifiers. |
| `Meta_Response_Processor` | **3** | Persists Tier 3 PSID-keyed chat + AI-inferred summaries + Tier 4 encrypted page tokens. |
| `Meta_OAuth_Handler` | **4** | Handles Tier 4 OAuth state + Meta page tokens (integration tokens per strategy doc). |
| `SMS_Sender` | **2** | Tier 2 recipient phone + outbound message body. Reads Tier 4 Telnyx secret via scoped CMK. |
| `SMS_Webhook_Handler` | **2** floor, **3** when inbound body carries free-text disclosure | Tier 2 baseline (phone + SMS body + STOP/HELP); inbound SMS body is free-text → rule 2 elevates to Tier 3 if body carries sensitive disclosure. |
| `send_email` | **2** | Tier 2 recipient + email body (body may carry T3 form-data; see Finding-driven row in D5). |
| `ses_event_handler` | **2** | Tier 2 bounce / complaint payload keyed to Tier 2 recipient. |
| `Analytics_Event_Processor` | **2** | Tier 2 analytics event payloads; intent signals are Tier 2 (`donate_now`, `volunteer_application`); spot-audit may reclassify per D2 Finding 3. |
| `Analytics_Function` (legacy) | **2** | Same surface class as Analytics_Event_Processor. Cleanup project tracked separately. |
| `Aggregator_Function` (legacy) | **2** | Same. Legacy. |
| `Analytics_Aggregator` | **2** | Hourly aggregations over Tier 2 analytics rollups. |
| `Analytics_Dashboard_API` (read) | **3** | Reads Tier 3 `staging-session-summaries` (AI-inferred) + Tier 2 analytics tables. Read-path tier inheritance per rule 6. |
| `SSO_Token_Generator` | **4** | Issues Tier 4 SSO tokens; processes Tier 2 operator email. Max-tier = 4. |
| `Picasso_Config_Manager` | **4** | Manages tenant configs that may include Tier 4 integration tokens, Tier 2 operator emails, and tenant private routing rules. |
| `deploy_tenant_stack` | **4** | Tenant provisioning with Tier 4 secrets. |
| `Stripe_Webhook_Handler` (hand-managed) | **2** | Tier 2 Stripe-customer-id (tenant-level) + Tier 2 billing event metadata. |
| `picasso-session-archiver` | **3** | Tier 3 AI-inferred summaries from OLD_IMAGE stream → S3 archive. |
| *(future)* PII delete Lambda | **4** (max-tier rule: cross-tenant read privilege = "tenant private routing rules" per strategy doc Tier 4 examples) | Operates over Tier 2 / Tier 3 data, but holds **cross-tenant read privilege** — secrets-adjacent per Tier 4 examples ("tenant private routing rules"). Tier inheritance via rule 4 (max-tier). Decision-B input at D5. |

### §B DynamoDB tables

| Table | Tier | One-line justification |
|---|---|---|
| `picasso-form-submissions-staging` | **3** | Raw `form_data` including free-text fields → Tier 3 by rule 2. |
| `picasso-pii-subject-index-staging` | **2** | Tier 2 by content (normalized email + opaque `pii_subject_id`); **operational sensitivity is Tier-3-equivalent** — this table is the load-bearing pivot for the future delete walk. Corruption / exposure of an index row makes the corresponding form-submission unreachable by identity match. D5 carries the operational-risk row separately from the content tier (mirrors the future-delete-Lambda data-vs-access-privilege split). |
| `picasso-notification-sends-staging` | **2** | Tier 2 recipient + msg_id. 90-d TTL. |
| `picasso-notification-events-staging` | **2** | Tier 2 bounce / complaint events. 90-d TTL writer-confirmed (D3). |
| `staging-recent-messages` | **3** | Full chat transcripts → Tier 3 explicit example. Writer attempts `expires_at` but table lacks `ttl{}` (D3 / D2 Finding 1 inverse). |
| `staging-conversation-summaries` | **3** | AI-inferred summaries about subjects → Tier 3 explicit example (rule 3). |
| `picasso-channel-mappings-staging` | **4** | Encrypted Meta page tokens (integration tokens) → Tier 4 inherited per rule 4; row body is Tier 2 (PSID + last_message_at). |
| `picasso-webhook-dedup-staging` | **1** | Transient pseudonymous Meta `mid` only. Short-TTL dedup ledger. |
| `picasso-session-events-staging` | **2** floor, **3** when sensitive-topic labels present | Tier 2 by analytics event payload baseline; **Tier 3 by rule 3a** when any row carries a sensitive-topic label (housing, crisis, health, immigration, legal, family, foster, abuse). Spot-audit (D2 Finding 3) determines presence, not tier. |
| `picasso-session-summaries-staging` | **3** | AI-inferred summaries → Tier 3 (rule 3). Only PII-adjacent table with DDB streams. |
| `picasso-audit-staging` | **2** | Tier 2 operator audit events keyed by `tenant_hash`. Retain for audit integrity. |
| `picasso-booking-staging` | **3** floor (when populated) — heterogeneous | Counseling / case-management / crisis-intake bookings = strongest Tier 3 (vulnerable population + crisis + free-text). Volunteer-orientation / event-RSVP bookings = closer to Tier 2 absent free-text. **D4 records Tier 3 floor; D5 / Step 10 must capture booking-type heterogeneity when first writer lands and the discriminator is known.** Living-inventory PR rule fires at that point. |
| `picasso-billing-events-staging` | **1** | Tenant-level billing events only. Not consumer. |
| `picasso-employee-registry-v2-staging` | **2** | Operator (tenant employee) Tier 2 email + Clerk user id. CPRA-employee-rights = counsel-input (gap G-H), not a tier change. |
| `picasso-tenant-registry-staging` | **1** | Tenant org metadata, Clerk org id, Stripe customer id (tenant-level). Not consumer. |
| `picasso-token-blacklist-staging` | **4** | JWT hashes — secrets-adjacent. |
| `picasso-token-jti-blacklist-staging` | **4** | JWT JTI revocation list — secrets-adjacent. |
| *(future)* `picasso-pii-delete-audit-staging` | **3** | Will record subject id + delete-walk audit; CARVE-OUT candidate (Decision B). |

### §C S3 prefixes

| Bucket / prefix | Tier | One-line justification |
|---|---|---|
| `s3://{tenant bucket}/submissions/.../{submission_id}.json` (conditional fulfillment) | **3** | Raw form responses incl. free-text → Tier 3 by rule 2. **Donor-class submissions additionally Tier 3 by rule 8 confidentiality** (distinct mitigation framing). Per-tenant bucket; posture opaque (D2 Finding 8). |
| `s3://picasso-analytics-events-staging` | **2** | Tier 2 event batches; dedicated CMK. Reclassify to 3 if Finding 3 spot-audit confirms sensitive attrs in payloads. |
| `s3://picasso-widget-staging` (+ prod) | **0** | Public static JS bundles. |
| `s3://myrecruiter-picasso-staging` (+ prod, anonymously readable) | **2** | Tenant configs may contain Tier 2 operator emails + recipient lists. Tier 4 if any config historically embedded integration tokens — version-spot-audit row in D5. NOT-CONSUMER scope flag is independent of tier. |
| Bedrock KB datasource bucket (per-tenant) | **1** floor, **3** for nonprofits with named-individual content patterns | Curated nonprofit content is Tier 1 by default; tenant misconfiguration (scrape including PII) or named-individual content patterns (volunteer rosters, donor lists, donor testimonials, beneficiary stories) push to Tier 3 floor. **D5 carries a per-tenant KB-hygiene row; tenant-onboarding gate (Step 10) is the per-tenant enumeration point — not D4.** Living-inventory PR rule fires on ingest changes. |
| *(D3 new)* `ARCHIVE_BUCKET` (session-summaries OLD_IMAGE archive) | **3** | Archived AI-inferred summaries → Tier 3 (rule 3). Bucket posture unverified (D3 open item). |

### §D CloudWatch log groups

| Log group(s) | Tier | One-line justification |
|---|---|---|
| `/aws/lambda/Master_Function_Staging` | **3** | May log Tier 3 free-text form-data + chat content (recipient email + phone confirmed; free-text not redacted). |
| `/aws/lambda/Bedrock_Streaming_Handler_Staging` | **3** | Prompts + responses → Tier 3. |
| `/aws/lambda/Meta_{Webhook,Response_Processor,OAuth}_Handler` | **3** | PSID + chat content + OAuth state (rule 1). |
| `/aws/lambda/SMS_{Sender,Webhook_Handler}` | **2** | Phone + SMS body. |
| `/aws/lambda/{send_email,ses_event_handler}` | **3** | Recipient + bounce payloads at Tier 2 baseline; `send_email` body may carry Tier 3 form-data per rule 1 max-tier → log group is Tier 3. |
| `/aws/lambda/Analytics_*` | **2** | Event payloads (rule applies to all 4 legacy + current analytics Lambdas). |
| `/aws/lambda/Analytics_Dashboard_API_Staging` | **2** | Query parameters + partial response payloads. |
| `/aws/lambda/{Stripe_Webhook_Handler,Picasso_Config_Manager,deploy_tenant_stack,SSO_Token_Generator}` | **2** | Operator identifiers + config payloads. |
| `/aws/lambda/picasso-session-archiver` | **3** | Possible AI-inferred summary content in error logs (rule 3). |

### §E Bedrock surfaces

| Surface | Tier | One-line justification |
|---|---|---|
| Bedrock model invocation (input) | **3** | Prompts contain Tier 3 chat content. |
| Bedrock model invocation (output / retained inferences) | **3** | Streamed assistant tokens + AI-inferred summaries (rule 3). |
| Bedrock Knowledge Base (KB content as input) | **1** (with **3** caveat) | Same as §C KB bucket; rule applies per ingest hygiene. |
| Bedrock model-invocation logging (account-level, UNVERIFIED) | **3 if enabled, otherwise not a surface** | If enabled, persists Tier 3 prompts + responses in MyR-owned CW/S3 destinations (D2 Finding 13). Per rule 7: D5 treats this as a conditional Tier-3 surface pending verification. |

### §F Inbound integration sources (edges, classified by data carried)

| Source | Tier | One-line justification |
|---|---|---|
| Browser POSTs (chat + form submit) | **3** | Tier 3 free-text chat + form data. |
| Meta webhooks | **3** | PSID + Tier 3 chat content. |
| Telnyx inbound (SMS) | **2** floor, **3** when free-text body carries disclosure | Tier 2 baseline (phone + body); rule 2 elevates to Tier 3 when the body carries free-text sensitive disclosure. |
| SES events | **2** | Recipient + bounce / complaint metadata. |
| Stripe webhooks | **1** | Tenant-level Stripe metadata. |

### §G Outbound integration destinations

| Destination | Tier | One-line justification |
|---|---|---|
| SES (email) | **2** | Recipient + body. |
| Telnyx (SMS) | **2** | Recipient phone + body. |
| Bedrock (model invocation) | **3** | Prompt content (rule 1). |
| Meta Graph API (page reply) | **3** | PSID + outbound chat content. |
| Tenant-configured downstream webhooks (n8n / Sheets / CRM) | **3** | Full Tier 3 form PII to opaque sinks; tier follows the data sent, not the sink itself. **Donor-class submissions take Tier 3 by rule 8 confidentiality** even when payload carries no sensitive-content examples — distinct mitigation framing in D5 (different controls / counsel questions / breach-disclosure posture than the sensitive-content Tier-3 origin). |
| Tenant-configured downstream S3 (conditional fulfillment) | **3** | Same as the §C row, including the rule-8 donor-confidentiality framing. |

### §H Carve-outs

§H is a **view** over D2 §B (carve-out scope is independent of tier); the carve-out rows are not additional tier assignments — they cross-reference §B's existing tier. No double-counting in downstream tier-rollups.

| Surface | Tier | One-line justification |
|---|---|---|
| `picasso-sms-usage` (TCPA opt-in / STOP consent records) | **2** | Phone + consent record by content; carved out from delete (TCPA 4-yr retention). **Note:** consent records carry Tier-4-adjacent **evidentiary** sensitivity — loss / tampering of STOP records creates direct TCPA liability. D5 should treat integrity and tamper-evidence as the dominant control, not confidentiality. |
| COPPA artifacts | **3** | Records about minors → Tier 3 explicit example. Counsel-scoped Phase 5. |
| Foster-youth / vulnerable-minor program artifacts (e.g., Austin Angels reference tenant) | **3** | Strategy doc separates "foster care / family status" from "child / minor information" in Tier 3 examples — making the foster-care path concrete for nonprofits operating those programs. Counsel-scoped. |
| `picasso-audit-staging` | **2** | (Same row as §B; audit-integrity exception lets it stay past TTL.) |
| *(future)* `picasso-pii-delete-audit-staging` | **3** | (Same row as §B; CARVE-OUT candidate.) |

### D3-new node not in §A–§H above

| Node | Tier | One-line justification |
|---|---|---|
| *(future)* intent / topic labels (D3 placeholder) | **3** | AI-inferred about subjects (rule 3); surface placeholder so the living-inventory PR rule fires when this lands. |

---

## Tier-vs-lifecycle gaps (handed to D5)

The strategy doc's Tier 3 controls are *"avoid collection where possible; redact logs; restrict access; shorter retention; human handoff rules; counsel review before expanding use."* Tier 4 controls are *"never expose client-side; secrets manager / env only; least privilege; rotation process; no logs."* This subsection lists each Tier 3 / Tier 4 surface where the strategy-doc controls are **not currently met** by the in-IaC posture — D5 carries each as a row.

| Surface | Tier | Strategy-doc control violated | Current state |
|---|---|---|---|
| `picasso-form-submissions-staging` | 3 | "shorter retention" | No `ttl` written; data effectively permanent (D2 Finding 1 + Step 5 verification). |
| `staging-recent-messages` | 3 | "shorter retention" | Writer attempts `expires_at`; table has no `ttl{}` block (D3 closure + D2 Finding 1 inverse). |
| `staging-conversation-summaries` | 3 | "shorter retention" + PITR adjacency | `expires_at` writer-set; PITR adds a 35-day recovery window (D2 Finding 10). |
| `/aws/lambda/{MFS, BSH, Meta_*}` | 3 | "redact logs" | Logs carry PII at 14-day retention (D3 §10); no redaction-at-source in place. |
| `/aws/lambda/{send_email, ses_event_handler}` | 3 (per rule 1 update above) | "redact logs" | Same — body may carry T3 form-data. |
| All Tier 3 DDB tables | 3 | "restrict access" / encryption | SSE-DDB (AWS-owned key) on every Tier 3 table; Apply-1 created `kms-pii-staging` CMK but applied it to no Tier 3 table (D2 Finding 11). Apply-2 is gated. |
| `picasso-channel-mappings-staging` | 4 | "secrets manager / env only" partial | Item-level CMK encrypts page tokens (good); table-level still SSE-DDB. |
| Tier 4 token tables (`picasso-token-{,jti-}blacklist`) | 4 | "no logs" | Hashes not logged directly, but blacklist operations log to MFS CW group at 14 days. |
| `picasso-session-events-staging` | 2 / 3 (rule 3a) | "avoid collection where possible" if 3a fires | Per Finding 3 spot-audit pending. |

These are **D5 rows**, not D4 prescriptions. D4 records the tier and the gap; D5 weighs likelihood × impact and names owners.

## What this tier-map tells D5 + Step 10

- **Tier 3 surface count is large.** Free-text fields + chat content + AI-inferred summaries dominate the PII-bearing data plane. This is the strategy doc's "biggest early risk" framing.
- **Tier 4 surfaces are concentrated** in the secrets / tokens / Meta page tokens / JWT blacklist / config-manager surfaces. Apply-1 created a Tier-4-scoped CMK (`kms-pii-staging`) but applied it to no table; the only PII-adjacent table with item-level CMK today is `picasso-channel-mappings-staging` (page tokens).
- **No D2 row is Tier 0 except the public widget bundle.** Tier 1 captures tenant-org metadata + tenant-config that hasn't historically held consumer fields.
- **The maximum-tier rule produces a useful inversion** for operator-PII surfaces: `picasso-employee-registry-v2-staging` is Tier 2 (consumer-PII-equivalent for employee email) but **NOT-CONSUMER** by Path A scope. The two columns answer different questions — tier answers "how careful?", scope answers "is this Path A's problem?". They can disagree without conflict.
- **Decision B (break-glass keep/drop/document-as-root-only)** input: Tier 4 surface count + the Tier 4 access privilege on the future delete Lambda are the kms:Decrypt principal list the break-glass role was meant to cover. D4 records the inputs; D5 weighs the consequence.
- **Decision A (resolver/executor flip)** — D4 alone does not weigh in; D5 weighs. D4 records that the delete pipeline must reach every Tier 2 / Tier 3 row across §B + §C, plus the conditional per-tenant fulfillment bucket + the Meta-keyed surfaces (Finding 12 gap) + the archive bucket (Finding 14 reachability is Decision-A input at D5).
- **Strategy doc principle #7 (forward marker):** No surface in §A–§G currently routes AI output to automated eligibility / approval / safety / tax / legal / placement decisioning over Tier 3 subjects (per D3 §2). The living-inventory PR rule fires if any new surface introduces automated decisioning on AI output — that surface would require a dedicated AI-governance review before merge.

---

## Known state at time of classification

- Apply-1 scaffold-only — CMK `kms-pii-staging` exists but is applied to no Tier 3 table; all Tier 3 DDB rows remain SSE-DDB. **Reclassify post-Apply-2** if CMK scope changes per-table tier accounting (no tier change expected; encryption posture changes, recorded as a tier-vs-lifecycle row in D5).

## Open items deferred from D4

| Item | Disposition |
|---|---|
| Tier-1-vs-Tier-3 reclassification of `myrecruiter-picasso` historical config versions | Pending the version-spot-audit row in D5. |
| Tier-1-vs-Tier-3 reclassification of KB datasource bucket per tenant | Per-tenant ingest hygiene; living-inventory PR rule fires on changes; tenant-onboarding gate (Step 10) is the per-tenant enumeration point. |
| Tier 3 confirmation of `picasso-session-events-staging` rule 3a firings | Pending D2 Finding 3 spot-audit. |
| Booking-table heterogeneity (counseling vs orientation) | Pending first writer + booking-type discriminator. |

---

## What feeds which downstream deliverable

- **D5 (risk register)** uses the Tier column to prioritize: unmitigated H/H rows on Tier 3 / Tier 4 surfaces are the first to need owners. Strategy doc's Tier 3 controls ("avoid collection; redact logs; restrict access; shorter retention; human handoff rules") become candidate mitigations on D5 rows.
- **Counsel input package (Step 8)** ships D4 + D1 + D2 + the historical design doc. Tier 3 surface count plus the cross-cutting rule-2 framing (free-text defaults to Tier 3) frame the "reasonable steps" question for the verifiable-request approach.
- **Re-baselined Path A roadmap (Step 10)** uses tiers to drop / promote phases: if Tier 0 / Tier 1 surfaces dominate, Path A automation scope shrinks; if Tier 3 dominates (as it does here), Path A scope expands but with a sharper prioritization on free-text + AI-inferred surfaces first.

---

## Links

- Plan: `~/.claude/plans/let-s-work-on-the-cheerful-manatee.md`
- Strategy doc (tier system source): [`README.md`](./README.md) §Data Classification
- Charter (D1): [`pii-project-charter.md`](./pii-project-charter.md)
- Inventory (D2): [`pii-inventory.md`](./pii-inventory.md) (PR #150)
- Flow map (D3): [`data-flow-map.md`](./data-flow-map.md) (PR #151)

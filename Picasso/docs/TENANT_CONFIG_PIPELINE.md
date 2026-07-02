# Tenant Config Pipeline — How Tenants Get Implemented

> Produced 2026-07-02 (with the Hairline redesign in view — see [`HAIRLINE_REDESIGN_MAPPING.md`](HAIRLINE_REDESIGN_MAPPING.md)). End-to-end trace: how a tenant config is born, every system that writes or reads it, the file's real shape, and how the widget/backends consume it at runtime. All statements verified against code 2026-07-02; file:line details live in the section notes.

---

## 1. Lifecycle at a glance

```
CREATE                      EDIT                        ASYNC MUTATE                 SERVE                      CONSUME
Config Builder ──►  Picasso_Config_Manager    KB scanner (n8n/EC2)          widget ──get_config──►  Widget (branding/chips/
"Create tenant"     POST /config              └─► pending-proposals/…       Master_Function          quick_help/forms UI/
(minimal skeleton,  │                         └─► kb_proposal_applier       (hash→id, 5-min cache,   welcome/behavior)
not a template)     ▼                             (content_showcase,        default injection,
                    tenants/{id}/{id}-config.json  action_chips)            _cloudfront block)      BSH stream (tone_prompt,
                                                                                                    bedrock_instructions,
Config Builder ──► Picasso_Config_Manager      Analytics_Dashboard_API                              CTA selection, forms
edit/deploy         (19 editable sections,      (staging #599 grant: form                           fulfillment, scheduling,
                    ETag concurrency,           notifications, scheduling_enabled)                  KB retrieve via aws.*)
                    timestamped backups)        rag-scraper CLIs (monitor block,
                                                card_inventory)
[deploy_tenant_stack (Bubble.io) — RETIRED, disconnected; code remains in repo pending deletion]
```

## 2. Storage layout (verified — corrects earlier notes)

- **Bucket:** `myrecruiter-picasso` (prod 614). There is **no `tenant-configs/` prefix** (earlier memory/notes wrong).
- **Config:** `tenants/{tenant_id}/{tenant_id}-config.json` (some readers also try legacy `tenants/{id}/config.json` — BSH's shared `bedrock-core.js` tries both).
- **Hash map:** `mappings/{tenant_hash}.json` (hash→id reverse lookup). Hash recipe = `sha256(tenant_id + "picasso-2024-universal-widget")[:12]` prefixed with 2 chars of the id — **duplicated in both** `deploy_tenant_stack/lambda_function.py` and `Picasso_Config_Manager/s3Operations.mjs` (must-match comment; drift here breaks widget resolution).
- **Backups:** `tenants/{id}/{id}-{ISO}.json` (written on builder deploy; **no restore endpoint exists** — rollback is manual S3-side).
- **Draft:** `tenants/{id}/{id}-draft.json` (real draft/promote feature, last-write-wins, no backup).
- **Embed:** `embed/{hash}.js` (written by deploy_tenant_stack).
- **Proposals:** `pending-proposals/{tenantId}/{proposalId}.json` (KB-freshness pipeline).
- **KB markdown:** different bucket — `kbragdocs/tenants/{id}/*.md`.
- **Staging replica:** `myrecruiter-picasso-staging` (525), cross-account replication from prod, writes denied to all principals **except** the Analytics_Dashboard_API role (#599 carve-out).

## 3. Who writes a tenant config (6 writers)

| # | Writer | Trigger | Sections written | Target |
|---|---|---|---|---|
| 1 | ~~**deploy_tenant_stack**~~ **RETIRED** (operator-confirmed 2026-07-02: completely disconnected from everything) | ~~HTTP POST from Bubble.io~~ none | Historical only: created configs via ~28-field Bubble branding transform | Code still in repo + was security-review C4 subject → disposition = physical deletion (Lambda, Function URL, IAM role), not patching |
| 2 | **Picasso_Config_Manager** (builder backend) | Builder save/deploy (Clerk JWT) | 19 EDITABLE sections incl. branding/features/quick_help/widget_behavior/aws/monitor/notification_settings/topic_definitions; METADATA fields (title, welcome, tone_prompt…); only `card_inventory` is read-only. ETag If-Match concurrency; timestamped backup on deploy | prod bucket (staging twin has its own Lambda + bucket) |
| 3 | **kb_proposal_applier** | Dashboard "apply proposal" (Clerk JWT) | `content_showcase`, `action_chips.default_chips`, `retired_showcase_ids` (+ KB markdown in kbragdocs, Dub links) | prod bucket, ETag + backup + audit file |
| 4 | **Analytics_Dashboard_API** | Dashboard settings screens | `conversational_forms.{form}.notifications` (recipients/channels/templates), `feature_flags.scheduling_enabled` | staging bucket via #599 grant (the ONE sanctioned staging author) |
| 5 | **rag-scraper `update-monitor-config.js`** | Operator CLI | `monitor` block | **PROD** direct |
| 6 | **Card pipeline** (`merge-cards-to-config.js`) | Operator CLI during onboarding | `card_inventory`, `features.conversational_forms/smart_cards`, placeholder forms — **local file only**, reaches S3 via manual cp or builder PUT | local → prod |

**Creation writes a minimal skeleton, NOT a template clone** (verified 2026-07-02 against the canonical deployed Lambda — see finding #1): `POST /config` on `Lambdas/lambda/Picasso_Config_Manager/index.mjs` builds identity + hash + a default `branding` block (`#10B981/#059669/#34D399`, Inter), a `features` block that is nearly all-false (streaming/webchat on), empty quick_help, `widget_behavior` defaults, and `aws.knowledge_base_id`. The demo-template cloning (`demo-template.json`, `use_template`) exists **only in the stale vendored Lambda copy** inside `picasso-config-builder/lambda/` and is not deployed. There is no clone-from-tenant, no JSON import.

**Scheduling caveat:** appointment types, routing policies, and scheduling notification templates live in **DynamoDB**, not the config file — only `feature_flags.scheduling_enabled` and form notifications land in config.

## 4. The config file's real shape (~36 top-level keys)

Identity/meta: `tenant_id`, `tenant_hash`, `version`, `generated_at`, `active?`, `tenant_type?`, `org_name?/organization_name?`, `subscription_tier`, `model_id?`.
Widget copy/chrome: `chat_title`, `chat_subtitle?`, `welcome_message`, `callout_text?`, `branding`, `features`, `quick_help?`, `action_chips?`, `widget_behavior?`.
AI/content: `tone_prompt`, `bedrock_instructions?`, `aws` (KB id/region), `topic_definitions?`, `feature_flags?`.
Card system: `cta_definitions`, `cta_settings?`, `conversation_branches`, `content_showcase?`, `programs?`, `conversational_forms`.
Ops/pipeline: `monitor?`, `notification_settings?`, `channels?`, `scheduling?`, `card_inventory`, `retired_showcase_ids`.
Dead/orphaned: `cta_categories`, `intent_definitions` (server-editable, zero type/schema/consumer found), `form_settings` (template + Master form_handler read), `metadata` (empty in template).

**Validation coverage is uneven**: the builder's Zod `tenantConfigSchema` fully types most sections but `content_showcase`, `bedrock_instructions`, `topic_definitions`, `monitor`, `notification_settings` and several meta fields are **not in Zod** (pass through unvalidated) even though some are builder-editable; `feature_flags` is passthrough except `scheduling_enabled`. The prod-config CI validator runs this same partial schema.

## 5. Who reads it at runtime (3 consumers + gate readers)

- **Master_Function** (`get_config&t={hash}` — what the widget fetches): hash→id via DDB registry or `mappings/`, 5-min in-memory cache, **injects branding/features/quick_help/action_chips/widget_behavior/welcome_message defaults** before returning, adds `_cloudfront` URL block; returns 404 (no fallback) on failure. Also reads forms/ctas/branches server-side (`form_handler.py`, `intent_router.py`).
- **Bedrock_Streaming_Handler** (per stream, shared `bedrock-core.js`, 5-min LRU cache): `aws.knowledge_base_id` (KB retrieve), `tone_prompt`, `bedrock_instructions`, `cta_definitions` (+`ai_available` vocabulary), `cta_settings`, `conversation_branches`, `content_showcase`, `conversational_forms` (fulfillment: DDB + SES/SMS/webhook per `notifications`/`fulfillment`), `topic_definitions`, `feature_flags.*`, `scheduling.*`, `model_id`.
- **Widget** (client, from the fetched config): branding (per inventory), `welcome_message`, `action_chips`, `quick_help`, `widget_behavior`, `features.*`, and — importantly — **direct reads of the card system**: `conversational_forms[key].fields` (form UI renders from config, not from BSH), `conversation_branches`+`cta_definitions` (resolved client-side on `show_info` clicks), `content_showcase` (`show_showcase` chips render with no server call).
- **Feature-gate readers**: Booking/Attendance/Calendar Lambdas read `feature_flags.scheduling_enabled` (fail-closed) via `shared/scheduling/featureGate.js`; Meta_Response_Processor reuses bedrock-core; monitor scanner reads `monitor`.

### Ownership split that matters for the redesign
- **Client-only sections** (widget UI): welcome_message, action_chips, quick_help, widget_behavior, features.*, branding.
- **Server-only**: tone_prompt, bedrock_instructions, cta_settings, aws, topic_definitions, scheduling.*, most feature_flags.
- **Dual-read** (widget AND BSH independently resolve the same data): `cta_definitions`, `conversation_branches`, `conversational_forms`, `content_showcase`. Any shape change to these must keep BOTH readers working — and both have separate 5-min caches (MFS keyed by hash, BSH by LRU), so config edits take up to ~5 min to reach each independently.

### CTA runtime contract (unchanged by Hairline)
BSH picks CTAs post-stream (V4 selector from `ai_available` vocabulary → SSE `cta_buttons` event with `_position: primary|secondary`); the widget stages them and attaches on stream-done. Click dispatch in `MessageBubble.handleCtaClick`: `start_form`/`form_trigger` (loads fields from config), `send_query`, `external_link`, `show_info` (client-side branch resolve), `start_scheduling` (`scheduling_intent` metadata), `resume_form`/`cancel_form`/`switch_form`, `resume_scheduling` (stub). The HTTP (non-streaming) provider takes CTAs from the JSON body instead and **does not support showcase cards**.

## 6. Findings & risks (independent of the redesign)

1. **Two divergent copies of the Config Manager Lambda — canonical is deployed (verified).** CI works exclusively in `Lambdas/lambda/Picasso_Config_Manager/` (`deploy-production.yml:169`, `pr-checks.yml:121`; the infra staging module is a CI-filled placeholder). The vendored copy in `picasso-config-builder/lambda/` is stale and NOT deployed — it differs on merge lists (11 vs 19 editable, branding read-only), **creation behavior** (demo-template cloning vs the canonical minimal skeleton), and **draft routes**. Delete/single-source it; `demo-template.json` is dead code.
2. **The builder's draft feature appears broken against the deployed Lambda.** The client calls `/draft/{tenantId}` (`client.ts:317,360,395`) but the canonical Lambda only routes `/config/{id}/draft` (`index.mjs:618,669,706`) — repo evidence says draft save/load/discard 404 in production (the paths only match the stale vendored copy). Verify live once, then either fix the path or delete the whole draft feature (UI + store + API + S3 draft objects) as part of the slim-down.
3. **Backup-restore doesn't exist.** Backups are written on every deploy; types for restore exist in the builder; no endpoint or client method. Rollback = manual S3 copy.
4. **Hash recipe duplicated** across Python (deploy_tenant_stack) and JS (Config_Manager) with a must-match comment — a contract test would be cheap insurance; retiring deploy_tenant_stack (#5) leaves `Picasso_Config_Manager` as the single live implementation.
5. **deploy_tenant_stack is RETIRED** (operator-confirmed 2026-07-02: completely disconnected). The config builder is the sole tenant-creation path. Remaining action belongs to the security-remediation track: C4's disposition becomes *delete* (Lambda + Function URL + IAM role + repo code), matching the delete-not-patch treatment of the other dead pipeline Lambdas — the code still hardcodes the prod bucket, so physical deletion is what closes the finding.
6. **Validation gaps**: builder-editable sections (`content_showcase`, `bedrock_instructions`, `topic_definitions`, `monitor`, `notification_settings`) bypass Zod entirely; `feature_flags` nearly so.
7. **Dead weight in the file format**: `cta_categories`, `intent_definitions` (no consumers found), `card_inventory` (written by a CLI, read-only in builder, consumed by BSH legacy paths), `form_settings`, `metadata`, plus `conversation_branches` being legacy-V3.5 (still dual-read at runtime for `show_info`).
8. **The tenant "birth certificate" is the skeleton block in the canonical Lambda** (`Picasso_Config_Manager/index.mjs` create handler), and it hardcodes the OLD branding shape (6 legacy branding fields, Inter, 15 feature toggles). It must be rewritten to the Hairline config shape (name/primary/secondary/font enum + privacy_notice_url) or every new tenant is born legacy. (`demo-template.json` is dead vendored code — see #1 — delete, don't rewrite.)
9. **Two client-side merge implementations** in the builder (`src/lib/api/mergeStrategy.ts` vs store `deployConfig`) with different section lists — consolidation target during simplification.
10. **Dead feature toggles + unexposed flags** (verified by consumer grep). `features.sms/qr/bedrock_kb/ats/interview_scheduling/dashboard_conversations/dashboard_forms/dashboard_attribution/smart_cards` have **zero runtime consumers** in widget/BSH/Master — they exist only in the creation skeleton and Master_Function's default-injection block (config-shape-land only). Conversely, flags with real consumers that the builder's `FeatureFlagsSettings` does NOT expose (it lists exactly `V4_ACTION_SELECTOR` + `scheduling_enabled`): `AGENTIC_SCHEDULING`, `AGENTIC_SCHEDULING_SUGGEST` (BSH agent turns), `REACH_PING` (widget-host kill switch), `WORKFLOW_TRACKING` (streaming provider) — settable today only by raw config edit.

## 7. What this means for the Hairline simplification

- **The authoring surface to simplify is bigger than BrandingSettings**: creation template (`demo-template.json`), the Zod schema, the canonical Lambda's EDITABLE/METADATA lists, the vendored-Lambda cleanup, and the two client merge paths all encode the old config shape.
- **The new brand axis (name + primary + secondary + font enum)** replaces the old branding shape in the builder only — `deploy_tenant_stack` is already retired (finding #5), so the builder is the sole creation path and the **canonical Lambda's creation skeleton** (finding #8) is the single creation artifact to rewrite. No Bubble transform to migrate; `demo-template.json` is deleted with the vendored copy.
- **Sections the Hairline widget stops reading**: bulk of `branding.*` (kept tolerated), avatar/logo everything. **Sections it keeps reading unchanged**: `cta_definitions`/`_position` contract, `conversational_forms` (fields client-side), `quick_help.prompts` (→ questions overlay), `action_chips.default_chips` (→ welcome menu rows), `welcome_message`, `widget_behavior`, `features.*`. **New field**: `privacy_notice_url` (+ font enum + secondary color) — lands in Zod + builder + Lambda METADATA/EDITABLE + template in one PR.
- **Don't break the dual-read sections**: forms/CTAs/branches/showcase shapes stay as-is through the redesign (Hairline restyles their rendering, not their schema).
- **Master_Function's default-injection block** duplicates old-shape branding defaults — it must be updated (or largely deleted) in the same program, or it will keep re-injecting legacy branding keys into every served config.

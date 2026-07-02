# Config Builder Simplification — Project Brief

> Written 2026-07-02 during the widget "Hairline" redesign planning. **Status: queued — separate project, not started.** All findings below were code-verified on this date, then re-audited + live-verified against both AWS accounts later the same day (deployed-code diffs, runtime-consumer greps, CI/IAM state). Companion docs: [`Picasso/docs/HAIRLINE_REDESIGN_MAPPING.md`](../../Picasso/docs/HAIRLINE_REDESIGN_MAPPING.md) (the widget redesign this serves) and [`Picasso/docs/TENANT_CONFIG_PIPELINE.md`](../../Picasso/docs/TENANT_CONFIG_PIPELINE.md) (full pipeline trace).

## Why

The Hairline widget redesign collapses tenant theming to a four-field brand axis — **company name, primary color, secondary color, font (Plus Jakarta Sans / Inter / Lato / Arial)** — plus a small set of content sections. The config builder is currently built for the old ~28-field branding model and carries substantial dead weight ("too fat" — Chris, 2026-07-02). This project right-sizes the builder to author exactly what the new widget consumes.

Operating context that simplifies scope:
- `deploy_tenant_stack` (Bubble onboarding) is **retired and disconnected** — the builder is the **sole** tenant-creation path.
- The deployed backend is `Lambdas/lambda/Picasso_Config_Manager` — **live-verified 2026-07-02**: the deployed code in BOTH accounts diffed byte-identical to this copy (staging 525 deployed 2026-06-11, prod 614 deployed 2026-06-04; both functions are bare-named `Picasso_Config_Manager` — the `picasso-config-api` name in older docs matches no live function). It now has a full CI lane (lambda repo `deploy-staging.yml` auto-deploy on merge + `deploy-production.yml` gated dispatch, `$LATEST` + version snapshot, added 2026-07-02 in lambda@8ab2834; prod IAM ARNs already enumerated). Shape stays Terraform-owned in staging (`infra/modules/lambda-config-manager-staging`), hand-managed in prod. The copy vendored at `picasso-config-builder/lambda/` is **stale and not deployed**.
- Scheduling appointment types / routing policies / notification templates live in **DynamoDB via the dashboard**, not the config file — out of scope here.

## Verified current-state findings (the punch list's evidence base)

1. **Stale vendored Lambda copy** — `picasso-config-builder/lambda/` diverges from the deployed canonical on merge lists (11 vs 19 editable sections; branding read-only in the vendored copy, editable in canonical), creation behavior (demo-template cloning vs minimal skeleton), and draft routes. `demo-template.json` is referenced only by the vendored copy (its default create path) — the folder deletion removes it. → delete the folder, single-source from `Lambdas/lambda/Picasso_Config_Manager`.
2. **Draft feature is broken against the deployed Lambda** — client calls `/draft/{tenantId}` (`src/lib/api/client.ts:317,360,395`); canonical Lambda serves `/config/{id}/draft` (`index.mjs:618,669,706`). Drafts 404 — **live-confirmed in both accounts 2026-07-02** (the deployed code serves only `/config/{id}/draft`; the client's route+method match the never-deployed vendored copy). → delete the feature (UI + store actions + API methods + S3 draft objects) or fix the path — deletion recommended given it's evidently unused.
3. **Backup-restore was never implemented** — backups written on every deploy, `RestoreBackup*` types exist, no endpoint/client method. → decide: implement restore or drop the types (and keep backups as manual-S3 insurance).
4. **Three client-side merge implementations** — `src/lib/api/mergeStrategy.ts` (used only by `DeployButton`), the store's `deployConfig` inline allowlist (`store/slices/config.ts:203-302`), and the store's `getMergedConfig` (`config.ts:585+`, shared by save/draft/deploy), with materially different section lists: the store's deploy path ships `branding`/`features`/`quick_help`/`action_chips`/`widget_behavior`/`aws` — the exact sections mergeStrategy classifies as read-only. → consolidate to one.
5. **Nine dead `features.*` toggles** with zero runtime consumers in widget/BSH/Master (verified by grep): `sms, qr, bedrock_kb, ats, interview_scheduling, dashboard_conversations, dashboard_forms, dashboard_attribution, smart_cards`. All 9 are defined in the creation skeleton; 5 of them (`sms, qr, bedrock_kb, ats, interview_scheduling`) are also in Master_Function's default-injection block — the `dashboard_*` three came from retired deploy_tenant_stack, and `smart_cards` appears nowhere in Master_Function. → remove from skeleton, types, Zod, any UI, and the 5 from Master's default-injection.
6. **Flag exposure mismatch** — `FeatureFlagsSettings.tsx` exposes exactly `V4_ACTION_SELECTOR` + `scheduling_enabled`; consumed flags with **no builder UI**: `AGENTIC_SCHEDULING` (BSH agent-turn gate, `agentTurn.js:190`), `REACH_PING` (widget-host kill switch, `widget-host.js:531,541`), `WORKFLOW_TRACKING` (streaming provider, `StreamingChatProvider.jsx:801,1087`). `AGENTIC_SCHEDULING_SUGGEST` is telemetry-only today (its sole read pushes the name into agent-turn `flags_active`; the increment-2 suggestion gate was never built) — its decision is delete-or-finish, not expose. → decide per flag: expose, or document as ops-only.
7. **Dead config sections** (zero runtime consumers in widget/BSH/Master, verified by grep): `intent_definitions` and `form_settings` (server-editable in canonical, no UI), `card_inventory` (legacy CLI-written, read-only). `cta_categories` and `metadata` exist **only on the vendored-lambda/demo-template surface** and vanish with #1 — no separate work. → drop from EDITABLE lists/types; plan config-file cleanup.
8. **Zod validation gaps** — editable-surface sections that bypass Zod entirely: `content_showcase`, `bedrock_instructions`, `notification_settings` (all with builder UI) plus `topic_definitions` and `monitor` (server-editable store passthroughs, no UI); `feature_flags` is passthrough except `scheduling_enabled`. → close the gaps for whatever survives the slim-down.
9. **BrandingSettings is the old model** — 11 color pickers + free-text font (`src/components/settings/BrandingSettings.tsx`; the TS `BrandingConfig` type carries 16 fields). → replace with the four-field brand axis + a live preview of the derived Hairline ramp.
10. **The tenant birth certificate** is the skeleton block in the canonical Lambda's create handler (`index.mjs` `POST /config`): old branding shape (6 legacy fields, Inter), the 15-toggle features block. → rewrite to the Hairline config shape.
11. **Widget-preview components hardcode old widget class names** — `CTAsEditor/CTAPreview.tsx` (`.action-chip*`, simulated blue) and `ShowcaseEditor/ShowcaseItemPreview.tsx` (`.showcase-card-*`). → rebuild against the Hairline markup (or replace with screenshot/live-embed preview).
12. **3-way schema divergence closes naturally** — Zod (~6 branding fields) ⊂ builder types (~15) ⊂ retired deploy_tenant_stack (~28). With #10 the canonical field list becomes small enough to keep in sync everywhere.

## Stale-reference sweep (audited 2026-07-02)

References to retired/never-real names that mislead agents; fix during #1 or opportunistically:

- **Fixed 2026-07-02**: root `CLAUDE.md` (`picasso-config-api` → `Picasso_Config_Manager`; CI section); builder `CLAUDE.md` (function name ×2, manual vendored-copy deploy instructions superseded by CI lanes, deploy_tenant_stack in Related Systems, vendored `lambda/` folder notes); builder `scripts/deploy.sh` (dead `PROD_LAMBDA`/`LAMBDA_FUNCTION` vars removed — script only deploys the frontend).
- **Remaining (sweep with #1)**: builder `README.md`, `docs/WEB_CONFIG_BUILDER_PRD.md`, `DEPLOYMENT_SUMMARY_v1.4.1.md`, `SCHEMA_V1.4.1_SUPPORT_SUMMARY.md` (deploy_tenant_stack-era content); canonical `Picasso_Config_Manager/DEPLOYMENT_v1.4.1.md` (claims `action_chips` is read-only and deploy_tenant_stack-owned — contradicts the current mergeStrategy, where it's editable); canonical `README.md` (runtime says Node 20.x; live is nodejs22.x).

## Target shape (post-Hairline)

- **Branding tab** = company name, primary color, secondary color (role per redesign decision D10), font dropdown (4 options), `privacy_notice_url` (new field, D9) — plus derived-ramp preview.
- **Content sections kept as-is** (shapes frozen by the widget redesign): `cta_definitions`, `conversational_forms`, `conversation_branches` (legacy but still dual-read for `show_info`), `content_showcase`, `programs`, `quick_help`, `action_chips`, `welcome_message`/identity, `widget_behavior`, `bedrock_instructions`, `aws`, `cta_settings`, `monitor`, `notification_settings`, `channels`.
- **Feature flags panel**: real flags only, per finding #6 decisions.
- **Gone**: old branding pickers, dead toggles, dead sections, draft feature (or fixed), vendored lambda, duplicate merge path.

## Sequencing vs the widget redesign

- **Anytime (independent)**: findings #1–#4 (dead code, draft, restore decision, merge consolidation).
- **After the Hairline token contract exists (redesign P1)**: #9 ramp preview, #10 skeleton rewrite, new fields (D9/D10) — the 4-place sync (Zod + types + UI + skeleton) should land as one PR per field.
- **After the widget flip (redesign P6)**: #11 preview rebuild against final Hairline markup; config content passes (emoji labels, casing) are part of the flip checklist, not this project.

## Constraints

- Never break the **dual-read sections** (`cta_definitions`, `conversation_branches`, `conversational_forms`, `content_showcase`) — widget AND Bedrock handler both parse them; shapes are frozen.
- Master_Function's default-injection block (`tenant_config_loader.py:387-522`) partially mirrors the skeleton: it injects `features` defaults (5 of the skeleton's 15 toggles) plus branding/quick_help/action_chips/widget_behavior — it does NOT inject `feature_flags`. Change skeleton and injection block together.
- Old tenant configs remain in S3 with legacy fields; every reader stays forward-compatible (ignore unknown, never crash) per repo Schema Discipline.
- Staging config bucket is a read-only prod replica (ADA-API role is the sole staging writer, #599) — builder staging twin has its own Lambda + bucket; keep the CI env-var injection intact (`pr-checks.yml:131-142` — a missing `VITE_API_URL` makes the staging UI write to PROD).

# Config Builder Simplification — Project Brief

> Written 2026-07-02 during the widget "Hairline" redesign planning. **Status: queued — separate project, not started.** All findings below were code-verified on this date. Companion docs: [`Picasso/docs/HAIRLINE_REDESIGN_MAPPING.md`](../../Picasso/docs/HAIRLINE_REDESIGN_MAPPING.md) (the widget redesign this serves) and [`Picasso/docs/TENANT_CONFIG_PIPELINE.md`](../../Picasso/docs/TENANT_CONFIG_PIPELINE.md) (full pipeline trace).

## Why

The Hairline widget redesign collapses tenant theming to a four-field brand axis — **company name, primary color, secondary color, font (Plus Jakarta Sans / Inter / Lato / Arial)** — plus a small set of content sections. The config builder is currently built for the old ~28-field branding model and carries substantial dead weight ("too fat" — Chris, 2026-07-02). This project right-sizes the builder to author exactly what the new widget consumes.

Operating context that simplifies scope:
- `deploy_tenant_stack` (Bubble onboarding) is **retired and disconnected** — the builder is the **sole** tenant-creation path.
- The deployed backend is `Lambdas/lambda/Picasso_Config_Manager` (CI-verified: `deploy-production.yml:169`, `pr-checks.yml:121`). The copy vendored at `picasso-config-builder/lambda/` is **stale and not deployed**.
- Scheduling appointment types / routing policies / notification templates live in **DynamoDB via the dashboard**, not the config file — out of scope here.

## Verified current-state findings (the punch list's evidence base)

1. **Stale vendored Lambda copy** — `picasso-config-builder/lambda/` diverges from the deployed canonical on merge lists (11 vs 19 editable sections, branding read-only), creation behavior (demo-template cloning vs minimal skeleton), and draft routes. `demo-template.json` is dead code. → delete the folder, single-source from `Lambdas/lambda/Picasso_Config_Manager`.
2. **Draft feature is broken against the deployed Lambda** — client calls `/draft/{tenantId}` (`src/lib/api/client.ts:317,360,395`); canonical Lambda serves `/config/{id}/draft` (`index.mjs:618,669,706`). Drafts 404 in production per repo evidence (verify live once). → delete the feature (UI + store actions + API methods + S3 draft objects) or fix the path — deletion recommended given it's evidently unused.
3. **Backup-restore was never implemented** — backups written on every deploy, `RestoreBackup*` types exist, no endpoint/client method. → decide: implement restore or drop the types (and keep backups as manual-S3 insurance).
4. **Two client-side merge implementations** — `src/lib/api/mergeStrategy.ts` (used only by `DeployButton`) vs the store's `deployConfig` (`store/slices/config.ts:203-302`), with different section lists. → consolidate to one.
5. **Nine dead `features.*` toggles** with zero runtime consumers in widget/BSH/Master (verified by grep): `sms, qr, bedrock_kb, ats, interview_scheduling, dashboard_conversations, dashboard_forms, dashboard_attribution, smart_cards`. They exist only in the creation skeleton and Master_Function's default-injection block. → remove from skeleton, types, Zod, and any UI.
6. **Flag exposure mismatch** — `FeatureFlagsSettings.tsx` exposes exactly `V4_ACTION_SELECTOR` + `scheduling_enabled`; consumed flags with **no builder UI**: `AGENTIC_SCHEDULING`, `AGENTIC_SCHEDULING_SUGGEST` (BSH agent turns), `REACH_PING` (widget-host kill switch), `WORKFLOW_TRACKING` (streaming provider). → decide per flag: expose, or document as ops-only.
7. **Dead config sections** carried by the editor/merge surface: `cta_categories`, `intent_definitions` (server-editable, no UI, no consumer), `card_inventory` (legacy CLI-written, read-only), `form_settings`, `metadata`. → drop from EDITABLE lists/types; plan config-file cleanup.
8. **Zod validation gaps** — builder-editable sections that bypass Zod entirely: `content_showcase`, `bedrock_instructions`, `topic_definitions`, `monitor`, `notification_settings`; `feature_flags` is passthrough except `scheduling_enabled`. → close the gaps for whatever survives the slim-down.
9. **BrandingSettings is the old model** — ~15 color pickers + free-text font (`src/components/settings/BrandingSettings.tsx`). → replace with the four-field brand axis + a live preview of the derived Hairline ramp.
10. **The tenant birth certificate** is the skeleton block in the canonical Lambda's create handler (`index.mjs` `POST /config`): old branding shape (6 legacy fields, Inter), the 15-toggle features block. → rewrite to the Hairline config shape.
11. **Widget-preview components hardcode old widget class names** — `CTAsEditor/CTAPreview.tsx` (`.action-chip*`, simulated blue) and `ShowcaseEditor/ShowcaseItemPreview.tsx` (`.showcase-card-*`). → rebuild against the Hairline markup (or replace with screenshot/live-embed preview).
12. **3-way schema divergence closes naturally** — Zod (~6 branding fields) ⊂ builder types (~15) ⊂ retired deploy_tenant_stack (~28). With #10 the canonical field list becomes small enough to keep in sync everywhere.

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
- Master_Function's default-injection block (`tenant_config_loader.py:387-522`) mirrors whatever the skeleton defines — change them together.
- Old tenant configs remain in S3 with legacy fields; every reader stays forward-compatible (ignore unknown, never crash) per repo Schema Discipline.
- Staging config bucket is a read-only prod replica (ADA-API role is the sole staging writer, #599) — builder staging twin has its own Lambda + bucket; keep the CI env-var injection intact (`pr-checks.yml:131-142` — a missing `VITE_API_URL` makes the staging UI write to PROD).

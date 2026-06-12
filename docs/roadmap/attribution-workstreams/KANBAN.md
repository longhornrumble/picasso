# Attribution build — workstream kanban

**Owner:** integrator (sole writer). Statuses: LAUNCHED · BUILDING · IN REVIEW · FIXING · MERGED · BLOCKED · DEAD(relaunched).
**Contracts:** [FROZEN_CONTRACTS.md](FROZEN_CONTRACTS.md) (locked 2026-06-12). **Plan:** [../MISSION_INTELLIGENCE_ATTRIBUTION.md](../MISSION_INTELLIGENCE_ATTRIBUTION.md).

## Wave 1 — foundation (launched 2026-06-12)

| WS | Slice | Repo / base | Branch | Owned surface | PR | Status | Blockers / notes |
|---|---|---|---|---|---|---|---|
| A | Widget events: CONVERSATION_STARTED + LINK_CLICKED emission, PAGE_VIEW ping, `?ep=` capture (C1, C2-stamp) | picasso / `staging` | `feature/attribution-ws-a-widget-events` | `Picasso/src/analytics/` + emission call sites | — | LAUNCHED | First task: ground-truth LINK_CLICKED emission status (recon ambiguous re MessageBubble.jsx:941,950) |
| B | Mint service: registry writes + Dub client (mint/repoint/QR) (C3, C4, C4b) | lambda / `main` | `feature/attribution-ws-b-mint-service` | NEW dir `Attribution_Mint_Service/` | — | LAUNCHED | Degrades gracefully without Dub secret (C4); live Dub calls deferred to staging E2E |
| C | Pipeline: PAGE_VIEW tolerance + attribution monthly rollups + Dub reach poll (C1, C2-resolve, C5) | lambda / `main` | `feature/attribution-ws-c-pipeline` | `Analytics_Event_Processor/` + NEW `Attribution_Aggregator/` | — | LAUNCHED | **C5 re-homed 2026-06-12:** legacy Analytics_Aggregator confirmed zip-only + dead/dormant + not twinned to staging (cleanup project tracks removal) → rollups live in new clean-shape `Attribution_Aggregator` Lambda + new `picasso-attribution-aggregates` table; key patterns unchanged |
| D | `/attribution` API + recommendations rule pack, against C5 fixtures (C6) | lambda / `main` | `feature/attribution-ws-d-api` | `Analytics_Dashboard_API/` | — | LAUNCHED | Builds against fixture aggregates, not WS-C's code |

## Integrator glue (not worker-owned)

| Item | Status | Notes |
|---|---|---|
| G1 Terraform staging: `picasso-entry-points` table · `picasso-attribution-aggregates` table · `Attribution_Mint_Service` Lambda + role · `Attribution_Aggregator` Lambda + role + hourly schedule · secret `picasso/staging/dub/api-key` (placeholder) · ADA env/grants (registry read + aggregates read + mint invoke) | IN PROGRESS | `infra/` PR → base `staging` (branch `infra/attribution-wave1-glue`); bare names per uniform-env-rules; charset grep + fmt/validate before push |
| G2 Register `Attribution_Mint_Service` in lambda deploy workflow (4 points: filter, outputs, if-clause, matrix) | TODO | After WS-B's PR shape is known |
| G3 pii-inventory.md rows (§B new table, §B/§C amendments, §G Dub vendor row) — advisor-drafted | TODO | Apply with the PRs that create each surface (Living-Inventory rule); coordinate with other sessions before editing |
| G4 Phase-0 docs PR (contracts + this kanban) → main | IN REVIEW | pure docs → main per branch routing |

## Wave 2 (after staging API live) — not launched

| WS | Slice | Repo | Gate |
|---|---|---|---|
| E | Numbers workspace UI (v5) | picasso-analytics-dashboard | **merge = PROD deploy → operator-gated** |
| F | Briefing view + PDF export | picasso-analytics-dashboard | after E; operator-gated merge |
| H | Infographic generator (`Attribution_Recap_Generator`) | lambda | parallel-ok with E; communications-consent-advisor before first send |

## Escalations queue (batched for operator)

| # | Item | Needed when |
|---|---|---|
| 1 | Place Dub API key value into Secrets Manager `picasso-dub-api-key-staging` (key currently at `.firecrawl/Dub/.env`) | before staging mint/poll E2E |
| 2 | Confirm after-hours default timezone `America/Chicago` (no tenant-config tz field exists; C7 PROVISIONAL) | before staging E2E sign-off |
| 3 | Parallel compliance track: tenant notice-language template + Dub DPA/subprocessor check (privacy-data-governance-advisor), GPC/CMP configurability decision, MSA scope read (attorney, recommended) | before PROD enablement of F2 (not build-blocking) |
| 4 | Phase sign-off after staging E2E (mint → scan → `?ep=` → provenance → aggregates → API) | end of Wave 1 |

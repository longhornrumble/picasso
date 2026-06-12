# Attribution build — workstream kanban

**Owner:** integrator (sole writer). Statuses: LAUNCHED · BUILDING · IN REVIEW · FIXING · MERGED · BLOCKED · DEAD(relaunched).
**Contracts:** [FROZEN_CONTRACTS.md](FROZEN_CONTRACTS.md) (locked 2026-06-12; amendments in its change-log). **Plan:** [../MISSION_INTELLIGENCE_ATTRIBUTION.md](../MISSION_INTELLIGENCE_ATTRIBUTION.md).

## Wave 1 — foundation (launched + WOVEN 2026-06-12; staging-live)

| WS | Slice | Repo / base | PR | Status | Notes |
|---|---|---|---|---|---|
| A | Widget events (C1) + `?ep=` capture (C2-stamp) | picasso / staging | [#546](https://github.com/longhornrumble/picasso/pull/546) | **MERGED** | Fix round 1: LINK_CLICKED kept additive (live dashboard timeline reads `link_text` → C1.2 amended); CONVERSATION_STARTED on BOTH providers; REACH_PING kill switch reads S3 tenant config (loader fetches the same CDN config URL; fail closed). 415 tests. |
| B | Mint service (C3/C4/C4b) | lambda / main | [#306](https://github.com/longhornrumble/lambda/pull/306) | **MERGED** | Adversarial panel (security+code): 14-item fix-list fully applied (409-idempotency registry lookup, NFKC `@` guard, URL-fragment `?ep=` fix, secrets-cache retry, Retry-After hardening, +more). 64 tests. Staging smoke: validation invoke returns contract-exact error. |
| C | Pipeline: Event_Processor + NEW `Attribution_Aggregator` (C5) | lambda / main | [#308](https://github.com/longhornrumble/lambda/pull/308) | **MERGED** | Re-homed out of zip-only legacy dir (C5 amendment); GSI alignment fix (Query now partitions on `tenant_hash` — the `tenant_id` query would have returned 0 rows every run). 106 tests. Hourly schedule live; degrades gracefully until Dub key lands. |
| D | /attribution API + rule pack (C6) | lambda / main | [#307](https://github.com/longhornrumble/lambda/pull/307) | **MERGED** | Review: authz/tenant-isolation/key-injection clean; fix round 1 (env/table re-home, pk/sk case, target allow-list, suffix validation, utm_*-only destinations, DDB error-leak); fix round 2 (sys.modules test pollution — full dir suite 424 green). Deployed 20:13Z after include_globs guard fix. |

## Wave 2 — surfaces

| WS | Slice | Repo | PR | Status | Gate |
|---|---|---|---|---|---|
| E | Numbers workspace N1 (read-only, v5 design) | picasso-analytics-dashboard | [#30](https://github.com/longhornrumble/picasso-analytics-dashboard/pull/30) | **IN REVIEW — DO NOT MERGE** | merge = PROD deploy → operator-gated. 32 tests; zero new deps; inline-SVG charts; flag-off path untouched. |
| F | Briefing B1 (default view) + B3 print-PDF + B4 variants | picasso-analytics-dashboard | — | BUILDING | Stacked on E's branch; §03 ships the aggregate-only fallback (exemplar endpoint = Phase 2, PII-gated). Operator-gated merge, after E. |
| H | `Attribution_Recap_Generator` (monthly email) | lambda | — | BUILDING | Ships DRY-RUN by default (`RECAP_SEND_ENABLED` gate); first real send gated on communications-consent advisory + operator. Needs CI/deploy registration + Terraform schedule (glue) when PR lands. |

## Glue (integrator-owned) — all landed

| Item | Status |
|---|---|
| G1 Terraform staging (entry-points + attribution-aggregates tables, mint + aggregator twins w/ dedicated roles, `picasso/staging/dub/api-key` secret + root resource policy, hourly schedule, ADA env/grants) | **APPLIED** — picasso [#547](https://github.com/longhornrumble/picasso/pull/547) (plan: 15 add / 2 change / 0 destroy) |
| G2 deploy-staging matrix registration (both new Lambdas) | **MERGED** — lambda [#310](https://github.com/longhornrumble/lambda/pull/310) |
| G2b pr-checks matrices registration (both) + ESM NODE_OPTIONS plumbing + ADA include_globs | **MERGED** — lambda #310 / [#311](https://github.com/longhornrumble/lambda/pull/311) / [#312](https://github.com/longhornrumble/lambda/pull/312) |
| G3 pii-inventory rows (§B entry-points + PAGE_VIEW amendments, §C NDJSON, §G Dub vendor) | **MERGED** with #547 (Living-Inventory rule satisfied in the surface-creating PR) |

## Escalations queue (operator)

| # | Item | State |
|---|---|---|
| 1 | **Dub key copy** — key found at Secrets Manager `staging/dub/api` (staging acct; `prod/dub/api` in prod). Operator runs the one-liner copy into `picasso/staging/dub/api-key` (classifier correctly blocks the agent from reading credential values). | WAITING — command in session notes |
| 2 | Confirm after-hours default tz `America/Chicago` (C7 PROVISIONAL; no tenant-config field exists) | WAITING |
| 3 | Compliance parallel track before F2 PROD enablement: tenant notice template + Dub DPA/subprocessor check (privacy-data-governance-advisor), GPC/CMP configurability, MSA scope read (attorney, recommended) | OPEN (not build-blocking) |
| 4 | Dashboard prod merges: E (#30) then F — operator-gated | WAITING on review |
| 5 | First recap-email send: communications-consent advisory + `RECAP_SEND_ENABLED` flip | BLOCKED until H lands + advisory |
| 6 | Phase sign-off after staging E2E (mint → scan → `?ep=` → provenance → aggregates → API → UI) — needs #1 first | PENDING |

## Staging E2E checklist (after Dub key lands)

mint via `POST /attribution/entry-points` (real Dub link on `myrctr.link`) → scan QR → standalone chat opens with `?ep=` → CONVERSATION_STARTED stamped → hourly aggregate rows appear → `GET /attribution/summary` reconciles → Numbers UI renders from staging API.

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
| E | Numbers workspace N1 (read-only, v5 design) | picasso-analytics-dashboard | [#30](https://github.com/longhornrumble/picasso-analytics-dashboard/pull/30) | **MERGED by operator** — prod-deployed behind the flag (all tenants `dashboard_attribution:false` → PremiumLock unchanged) | 32 tests; zero new deps. |
| F | Briefing B1 (default view) + B3 print-PDF + B4 variants | picasso-analytics-dashboard | [#31](https://github.com/longhornrumble/picasso-analytics-dashboard/pull/31) | **MERGED by operator** (with #30) — prod-deployed behind the flag | 98 tests; §03 aggregate-only fallback pending exemplar endpoint (Phase 2, PII-gated). |
| H | `Attribution_Recap_Generator` (monthly email) | lambda | [#313](https://github.com/longhornrumble/lambda/pull/313) | **MERGED** | LIVE dry-run (`RECAP_SEND_ENABLED=false`); Terraform #550 + CI #314. |
| I | Recap CAN-SPAM conditions: postal address (fail-closed), per-recipient HMAC unsubscribe, suppression store + NEW public `Attribution_Unsubscribe` Lambda | lambda | [#316](https://github.com/longhornrumble/lambda/pull/316) | **MERGED** | Security review (4-item fix-list applied: token cap, marker fail-closed, suppression pagination, method gate); 42+151 tests; Terraform picasso#553 APPLIED (public Function URL, HMAC=auth); CI lambda#317/#318; signing key placed; endpoint smoked (uniform 403). |

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
| 1 | ~~Dub key~~ | ✅ RESOLVED 2026-06-12 after a 4-layer debug: personal-type keys need `?workspaceId=` (lambda#321 + infra#556, ws id from house tooling env) + console key/value storage wraps the secret in JSON (lambda#322 made both readers tolerant) + dropped doomed `tagNames` (lambda#319) + Dub error bodies now surfaced (lambda#320). Aggregator also gained `s3:ListBucket` on mappings/ (infra#558) after enumerating 0 tenants. |
| 2 | ~~Chicago tz~~ | ✅ CONFIRMED 2026-06-12 |
| 3 | Compliance package → [PROD_ENABLEMENT_COMPLIANCE.md](PROD_ENABLEMENT_COMPLIANCE.md) (merged #552): notice templates DONE, DPA checklist DONE (operator evidence capture remains), **GPC decision OPEN** (rec: honor by default), MSA brief ready for counsel | OPEN (gates first PROD tenant only) |
| 4 | ~~Dashboard merges~~ | ✅ #30 + #31 MERGED by operator (prod, flag-off) |
| 5 | First recap send: CAN-SPAM conditions BUILT (WS-I); remaining = operator supplies **postal address** (Terraform var `recap_postal_address`) + flips `RECAP_SEND_ENABLED` | WAITING on address |
| 6 | Phase sign-off after staging E2E (mint → scan → `?ep=` → provenance → aggregates → API → UI) — needs #1 | PENDING |

## Staging E2E — PASSED 2026-06-12 (automatable links)

✅ mint live: `https://myrctr.link/e2e-smoke-myr` → `ep_01KTYZYQ978ZF76YKN9FTW1TS8` + registry row · ✅ 302 redirect preserves `?ep=` · ✅ QR endpoint serves print-spec PNG · ✅ aggregator run: 1 tenant, rows written (`METRIC#attribution_summary#2026-06` + `#website` channel from real staging events) incl. clean Dub reach poll.
**Remaining (human/visual):** scan the QR with a phone → chat opens → next hourly run shows the session under `standalone` → Numbers UI (flag a staging tenant) renders it. Then operator phase sign-off.

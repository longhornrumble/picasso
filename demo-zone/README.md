# demo-zone

Fixture packs and tooling for the sales demo zone. See [`docs/roadmap/DEMO_ZONE.md`](../docs/roadmap/DEMO_ZONE.md) for the approved roadmap — this directory is its P0 output.

**Status: P0 (fixture pack authored). The seeder itself is P1 and does not exist yet.**

## What's here

```
demo-zone/
├── personas/brightpath/     Persona 1 — youth services (tenant DEMO-YS01)
│   ├── persona.json         Identity, programs, CTAs, topic mix, fictional roster
│   ├── forms.json           The 4 conversational forms
│   └── arc.json             The six-month numeric narrative arc
└── docs/
    └── PROD_TENANT_CREATION_CHECKLIST.md   Manual, gated prod creation (P4)
```

## What a fixture pack is

Plain data files describing **content**, not a tenant config. The tenant config is authored by a human in the staging Config Builder at P1 (per roadmap §9); these files are the source that authoring copies from, and the source the P1/P2 seeder maps onto the physical stores.

Fixtures are shaped to be schema-conformant where that costs nothing, so transcription into the Config Builder is mechanical.

## Verified constraints these fixtures obey

Every one of these was verified against live code on 2026-07-16. They are not stylistic choices — violating them produces data the product cannot render.

| Constraint | Source | Consequence if violated |
|---|---|---|
| Topic taxonomy is exactly `Volunteer · Donation · Events · Services · Supplies · General`, derived by **keyword match on `first_question` text** | `Analytics_Dashboard_API/lambda_function.py:6024-6036` | Invented topic labels ("Programs", "Contact & hours") never appear — the real system cannot emit them. Topic mix must be realized through authored question text. |
| Registry `channel` at mint is **`standalone` \| `campaign` only** | `Attribution_Mint_Service/validation.mjs:12` | `website` / `messenger` are **resolved at aggregation**, never registry values. Website entry points cannot be minted — see Open questions. |
| `entry_point_id` matches `/^ep_[0-9A-Za-z]{8,64}$/` | `Attribution_Mint_Service/validation.mjs:163` | Ids like `web_home` are invalid. Real ids are `ep_` + ULID, **minted once in staging at P3**. |
| No `@` in `label`/`campaign`/`placement`; no person fields in registry rows, ever | `validation.mjs`, `FROZEN_CONTRACTS.md:112` (C8) | PII guardrail. |
| Confidence floor: n < 50 conversations → rate suppressed, `rate_held: true` | C7, `FROZEN_CONTRACTS.md:201` | The campaign channel is deliberately below the floor to exercise the held-state UI. |
| CTA `action`→`type` mapping is enforced, and each action has a required field | `picasso-config-builder/src/lib/schemas/cta.schema.ts:58-113` | `start_form`→`formId`, `external_link`→`url`, `send_query`→`query`, `show_info`→`prompt`. |
| Live sends must target a MyRecruiter-owned address — never `@example.org` | roadmap §7 | Real SES sends to fake domains bounce and damage sender reputation. The roster's fake addresses are for **stored** rows only. |

## Departures from the roadmap, for review

1. **Sixth CTA added.** Roadmap §3 lists 4 forms but only 5 CTAs, leaving `donation_inquiry` unreachable from the AI's vocabulary. Added `giving_inquiry` (`start_form` → `donation_inquiry`) so every form has a route. Veto if unwanted.
2. **Arc deltas are derived, not asserted.** The parked mock hardcoded `deltas.conversations.abs = 143`, but its own trend series implies **104**; leads asserted 28 vs an implied **19**. The real aggregator computes deltas from stored month rows, so `arc.json` carries the monthly series and lets deltas fall out. The mock's numbers were internally inconsistent.
3. **Per-channel `engaged`/`applications` now reconcile to the summary.** The mock's channels summed to 843 engaged / 314 applications while its summary claimed 812 / 301. Leads and conversations did reconcile. Fixed to sum.
4. **Topic labels remapped** to the six real categories (see table above).

## Open questions (blocking P1/P3, not P0)

1. **Tenant hash fork.** `deploy_tenant_stack:884` (documented RETIRED at `picasso-config-builder/CLAUDE.md:517`) computes `tenant_id[:2] + sha256[:12]` → `DEMO-YS01` = `de8bef17d2096b`. The **live** creation path `Picasso_Config_Manager/index.mjs:240` computes `sha256[0:14]` → `8bef17d2096bd2`. Every existing tenant matches the *retired* shape (`MYR384719` → `my87674d777bf9`, `AUS123957` → `auc5b0ecb0adcb`). Roadmap §2/§3 cite the retired algorithm. **The demo tenant's real hash cannot be fixed until this is resolved** — it feeds the seeder's key scoping (§4.3) and the microsite embed (§6).
2. **Website entry points can't be minted.** Roadmap §5 wants "3 website page entry points (home/programs/giving)" as registry rows, but mint rejects `channel: website`. Either the seeder writes website registry rows directly (diverging from anything the product can mint — weakens the dogfood), or website pages carry no `ep` and lose per-page provenance, or the mint enum changes (a product decision). Unresolved.

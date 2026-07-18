# demo-zone

Fixture packs and tooling for the sales demo zone. See [`docs/roadmap/DEMO_ZONE.md`](../docs/roadmap/DEMO_ZONE.md) for the approved roadmap — this directory is its P0 output.

**Status: P0 (fixture pack authored). The seeder itself is P1 and does not exist yet.**

## What's here

```
demo-zone/
├── personas/brightpath/     Persona 1 — youth services (tenant BRI071351)
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
| Registry `channel` at mint is **`standalone` \| `campaign` only** | `Attribution_Mint_Service/validation.mjs:12` | `website` / `messenger` are **resolved at aggregation**, never registry values. The seeder writes registry rows directly to DynamoDB (roadmap §4.3), bypassing mint — so it writes `website` rows itself. Not a blocker; see Resolved below. |
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

## Open questions

1. **`self_booked_pct` / `median_first_response_minutes` are aggregator-nulled — decide at P2.** See `arc.json._unresolved_nullable_fields`. Seeded history would show values the live current month cannot.

## Resolved

- **Tenant hash fork (was: "BLOCKS P1")** — resolved empirically 2026-07-17 by creating the tenant. `BRI071351` → **`8b464847ae0ede`**, which is the LIVE `Picasso_Config_Manager` shape (`sha256(id+salt)[0:14]`), NOT the retired `deploy_tenant_stack` shape (`br8b464847ae0e`). Confirmed the config builder mints the `sha…`-prefixed shape, so the demo tenant's hash differs in shape from older tenants (`my…`, `au…`) — but that is cosmetic: the hash is opaque and every reader resolves it through `mappings/{hash}.json`, so a single self-consistent tenant works regardless of shape. **The only rule this imposes on the seeder: use `8b464847ae0ede` verbatim; never recompute the hash from the id** (that would yield the wrong `br…` shape). Roadmap §2/§3's citation of the retired algorithm is corrected there.
- **Website entry points (was: "can't be minted")** — resolved 2026-07-17, not a blocker. Mint rejects `channel: website`, but the seeder writes registry rows **directly to DynamoDB** (roadmap §4.3), so it writes `website` rows with real labels and mints the `ep_` ULIDs itself. Residual is a sales-integrity note, not an engineering gate: the demo shows per-page website attribution a customer can't currently self-serve through the mint UI.
- **QR is out of the demo** — decided 2026-07-17 (roadmap §5). No live scan moment; the flyer is a standalone artifact shown outside the demo. Seeded standalone/QR channel history **stays** in `arc.json` (it shows the product tracks print provenance and costs nothing). The `/go/` ep-forwarding bug is consequently **not** a demo dependency — it is being fixed separately on its own merits.

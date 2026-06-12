# Attribution Surface Plan — The Numbers (workspace)

**Parent:** [MISSION_INTELLIGENCE_ATTRIBUTION.md](MISSION_INTELLIGENCE_ATTRIBUTION.md) (decisions + shared foundation F1–F6 are prerequisites)
**Design source (approved 2026-06-12):** [attribution-mockups/attribution-numbers-workspace-v5-mockup.html](attribution-mockups/attribution-numbers-workspace-v5-mockup.html)
**Audience/job:** marketing/ops — "where is it working?" — direct the spend.

## Page anatomy (locked, v5)

Altitude gradient, top to bottom — *ecosystem → journey → worth → drill*:

1. **Top bar** — month picker (vs prior month), **+ Mint a link or QR**, Export CSV, "← back to briefing" crumb.
2. **Ecosystem lede (owns the top, exclusively):** donut — segments = channel share of conversations, center = total + after-hours % — beside an **outcomes table** (share/conv/leads/rate per channel; rates held under n-floor; totals row reconciles). One computed insight line in real type below.
3. **Journey band:** all-channels funnel strip — reached (dashed context chip) → conversations → engaged → applications → leads, rate end-cap, reach footnote.
4. **Money band:** dark-emerald hero — after-hours conversations · staff-hours not hired · work-weeks of coverage. Headline type (locked decision #6).
5. **Drill layer:** one full-width row per channel (icon, share-of-total bar, conv/leads/rate, 6-mo sparkline). Rows expand **in place**: channel funnel strip (same component, channel scope — collapsed numbers "uncompress"), entry-points table (provenance chips, minted date, NEW/small-sample tags), topics-within-channel, most-clicked resources, six-month trend chart, Read + Suggested-move columns, contextual mint link, n-floor note. Entry-point rows drill one level deeper (same pattern).

Recursive component: **one funnel-strip component at three scopes** (page / channel / entry point).

## Work breakdown

### N1 — Read-only workspace behind the flag
- Replace the PremiumLock branch (`picasso-analytics-dashboard/src/App.tsx:676`) with the v5 page for flagged tenants; PremiumLock remains for unflagged.
- Components (React/TS, dashboard conventions + `picasso-shared-styles` tokens + `docs/STYLE_GUIDE.md`): `EcosystemDonut`, `OutcomesTable`, `FunnelStrip` (scope-agnostic), `MoneyBand`, `ChannelRow` + `ChannelExpansion`, `EntryPointTable`, `TrendChart`, `AdviceBoxes`.
- Data: `GET /attribution/summary` + `GET /attribution/channels/{channel}` (F6). Month picker drives range; deltas vs prior month.
- Insight line + Read/Suggested-move v1 = **rule pack, not LLM** (e.g., best-rate channel above floor → "converted at X× website"; new entry points below floor → "leave them running"). Rules live server-side so all surfaces share them.

### N2 — Mint a link or QR
- Modal: label, channel family, campaign, placement (taxonomy required at mint time — locked decision #2), target (chat standalone / site URL).
- `POST /attribution/entry-points` → registry row + short URL; QR PNG generated client-side from the minted URL; download/copy actions.
- Mint affordances in both the top bar and inside channel expansions.

### N3 — Polish + export
- CSV export of the outcomes + entry-point tables.
- Empty/small-tenant states: rates suppressed under floor; channels with zero entry points prompt minting.
- Collapsed→expanded morph animation (numbers spread into funnel chips) — nice-to-have, not a gate.

## Verification

- Demo tenant on staging with seeded events across all four channels (incl. ≥5 minted entry points, two below floor) — every panel renders from live aggregates; **all numbers reconcile** (donut shares sum 100%; outcomes table sums = funnel top/bottom; channel rows = table rows).
- Mint flow E2E on staging: mint → scan QR → standalone chat opens → session stamped with provenance → appears in drill next aggregate cycle.
- Flag off → PremiumLock unchanged. Existing dashboard tabs unaffected.

## Compliance
- Implementation PRs touching new tables/Lambdas update `pii-inventory.md` (Living-Inventory rule).
- No PII rendered on this surface (aggregates only).

## Deferred (Phase 2)
LLM insights · entry-point-level trend drill · Messenger `ref` campaign rows · sort/filter on drill tables · per-tenant business-hours config.

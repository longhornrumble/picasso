# Mission Intelligence — Attribution & ROI

**Status:** design complete (2026-06-12) · build not started
**Design source:** [attribution-mockups/](attribution-mockups/) — three approved surface mockups (open in any browser)
**Surface plans:** [Numbers workspace](ATTRIBUTION_SURFACE_NUMBERS.md) · [Briefing](ATTRIBUTION_SURFACE_BRIEFING.md) · [Infographic email](ATTRIBUTION_SURFACE_INFOGRAPHIC.md)

---

## Vision

Mission Intelligence is the umbrella identity for the tenant analytics platform. The Attribution & ROI dashboard is its Premium+ anchor (`dashboard_attribution` feature flag — today a PremiumLock at `picasso-analytics-dashboard/src/App.tsx:676`). It answers two jobs:

1. **Defend the spend** (ED/CEO → board, quarterly): prove what MyRecruiter produced, in claims that survive a skeptical board member.
2. **Direct the spend** (marketing, monthly): show which channels/campaigns/placements work, so orgs stop carpet-bombing on hunches.

The platform thesis: nonprofits are understaffed and time is the enemy. MyRecruiter ships **interventions, then measures the intervention** — the whole platform is a war on waiting.

## Dashboard boundaries (locked)

| Dashboard | Question it owns |
|---|---|
| **Attribution** | *Where* did conversations and leads come from? |
| Conversations | *What* was said? (topics detail, notable questions) |
| Forms | *Who* raised their hand? |
| Lead Workspace | *What happened next?* (lead health, latency, outcomes) |

## Locked design decisions

1. **Purview principle.** Measure only MyRecruiter's surface area. Four entry families: embedded web widget · Messenger/Instagram (WhatsApp-ready) · standalone widget + QR (links postable anywhere) · minted campaign links. No claim to referee the org's whole marketing program.
2. **Provenance at birth.** Every conversation is stamped with its entry point when it starts — hierarchical taxonomy **channel → campaign → placement**, captured at link-minting time (never recoverable later). Attribution = provenance joined to outcomes.
3. **Universal funnel.** Conversations (top) → engaged → applications → **leads delivered** (the accountable bottom — close rates belong to the org). Reach (site visits, scans, link clicks) is *context above the funnel*, never a funnel stage.
4. **No Google Analytics integration.** Reach is self-measured via a widget pageview ping. GA connect = future opt-in only on customer pull.
5. **NO DOLLARS, ANYWHERE.** The estimated-value/goal-values concept is dead (2026-06-12). Value = **measured time** (staff-hours of conversations absorbed; after-hours coverage; "≈ N work-weeks not hired") + **confirmed outcomes** (org marks "became a volunteer"/"donated" in Lead Workspace; CRM round-trip later). *"Time is measured, not modeled."*
6. **The money metric never shrinks.** After-hours/unstaffed-hours is the platform's core value claim — headline type on every surface, never below the fold.
7. **Confidence floors are UI.** Insights and rate comparisons are held until n ≥ 50 conversations (per channel / per entry point) — rendered as "held · n<50" states, not footnotes.
8. **Lead latency is measured only on our surface.** First-human-touch = authenticated workspace actions (lead viewed, outcome marked, booking). Email opens/clicks are polluted (Apple MPP prefetch, SafeLinks bot clicks); SMS has no read receipts. Detail lives in Lead Workspace; Attribution carries summary stats only (58% self-booked, median first response).
9. **Conversational forms are channel-agnostic.** A "form" is a structured collection episode inside a conversation; FORM_* events apply identically on any channel.
10. **Every attribution surface ships behind `dashboard_attribution`** — the tab views (Numbers, Briefing), the `/attribution` API (server-side check), AND the monthly recap email (generator skips unflagged tenants). Data *capture* (event emission, pageview ping, provenance stamping) runs platform-wide so a tenant that upgrades has history on day one — the widget already captures GA/UTM attribution for all tenants today; the pageview ping is the marginal new collection and is in scope for the Phase-0 PII review.

## The three surfaces (one data layer, three genres)

| Surface | Genre | Audience | Cadence | Mockup |
|---|---|---|---|---|
| **Infographic** | Wrapped-style recap, pushed email | everyone; forwardable | monthly push | [infographic](attribution-mockups/attribution-monthly-infographic-mockup.html) |
| **Briefing** | narrative document; board-PDF export | ED/CEO | monthly; default tab view | [briefing v2.1](attribution-mockups/attribution-briefing-v2-mockup.html) |
| **Numbers** | workspace: ecosystem → journey → worth → drill | marketing/ops | weekly/monthly | [numbers v5](attribution-mockups/attribution-numbers-workspace-v5-mockup.html) |

Hierarchy: infographic links → briefing links → numbers. Every claim can show its work one level down.

---

## Shared foundation (Phase F — prerequisite for all three surfaces)

What exists vs net-new was ground-truthed 2026-06-11. Capture infra largely exists; the gaps:

### F1 — Emit missing widget events
`CONVERSATION_STARTED` and `LINK_CLICKED` are defined in `Picasso/src/analytics/eventConstants.js` but never emitted. Wire emission (first user message; link clicks in message content incl. outbound resources). Existing pipeline (SQS `picasso-analytics-events` → `Analytics_Event_Processor` → DynamoDB `picasso-session-events`) needs no structural change.

### F2 — Reach: pageview ping
New lightweight `PAGE_VIEW` event from the widget loader (`Picasso/src/widget-host.js` — attribution capture already lives here), throttled once per page per session. Sessionize on the GA client ID we already read (30-min windows, GA's definition). Card label everywhere: "measured by MyRecruiter."
⚠️ This makes us a site-wide measurement vendor → tenant privacy-notice implications → **pii-data-lifecycle-advisor review before build** (see Compliance).

### F3 — Provenance stamping + mint registry (Dub.co-backed — decision 2026-06-12)
- Session provenance object: `{channel, entry_point_id?, campaign?, placement?}`. Website = existing UTM/referrer attribution object; standalone/fullpage = link params; Messenger = derivable from `meta:{pageId}:{psid}` session prefix (its `ref`/`messaging_referrals` capture is Phase 2 — `Lambdas/lambda/Meta_Webhook_Handler` does not read them today).
- **Mint registry:** new DynamoDB table `picasso-entry-points-{env}` (per `{name}-{env}` convention) — tenant PK, entry-point id SK, taxonomy fields, Dub link id, destination URL, created date. The registry is the source of truth for what each link *means* (the taxonomy); Dub holds the link itself.
- **Short links + QR via Dub.co** (operator decision — Dub is already in production use with the branded domain **`myrctr.link`** and customizable suffixes, e.g. `myrctr.link/gala-tents`): minting calls `POST /links` with Dub's **native `tenantId`** (= org) and **`externalId`** (= entry-point id; workspace-unique, 409 on collision → free mint idempotency), destination carrying `?ep={entry_point_id}` so provenance lands in OUR pipeline at conversation start. **`?ep=` is preserved on redirect** (Dub appends `dub_id`, never strips destination params — confirmed in docs 2026-06-12). **Dub destinations are dynamic** — `PATCH /links/ext_{id}` repoints printed artifacts without invalidating their QR codes.
- **Reach mechanism (settled 2026-06-12 — operator is on Dub Pro): POLL, no webhooks.** Hourly aggregator makes one workspace-level `GET /analytics?groupBy=top_links` sweep + targeted timeseries pulls (Pro analytics limit 2 req/s — ample). The `trigger=qr|link` dimension natively splits **scans vs clicks** for the Opens/Scans column; `tenantId`/`externalId` filters (note: `ext_` prefix required in GET queries only) and IANA `timezone` param align rollups to tenant-local time. Raw click export (`/events`) and Dub conversion tracking (`track/lead`/`track/sale`) are Business-tier — not used; parked as a possible future confirmed-outcomes complement.
- **QR PNGs from Dub's `GET /qr` endpoint** — print spec size ≥ 1000px, error-correction level `H`; per-tenant logo/colors available on Pro.
- In-house redirect Lambda + `go.myrecruiter.ai`: **rejected** (don't rebuild a service the operator already runs); revisit only if Dub becomes a constraint. No DNS work needed — `myrctr.link` is already configured.

### F4 — Attribution aggregates
Extend the hourly `Analytics_Aggregator` (EventBridge) rollups in `picasso-dashboard-aggregates`: per tenant × month × channel × entry point — conversations, engaged, applications, leads, after-hours count, conversation-minutes, topic counts, resource-link clicks. Topics v1 = the existing keyword categorizer (`Analytics_Dashboard_API/lambda_function.py:5258`) applied **at aggregation time** (stored, not query-time). LLM topic classification = Phase 2, gated on ai-governance review.

### F5 — Definitions to lock (constants in one shared module; see surface plans for use)
- **Conversation started:** first user message in session.
- **Engaged:** session with ≥1 of {CTA_CLICKED, LINK_CLICKED, FORM_VIEWED} OR ≥2 user messages.
- **Application started / lead delivered:** FORM_STARTED / FORM_COMPLETED.
- **After hours:** outside Mon–Fri 9:00–17:00 tenant-local. v1 fixed; tenant-configurable later. (Open: confirm tenant timezone source in config.)
- **Staff-hours absorbed:** Σ per-session active conversation time (first→last message, idle-capped), monthly. Measured, not modeled.
- **Confidence floor:** n ≥ 50 conversations before any rate comparison or insight.

### F6 — Attribution API
New endpoints in `Analytics_Dashboard_API` (existing JWT auth + hot-path DynamoDB pattern), gated by `dashboard_attribution`:
- `GET /attribution/summary` — ecosystem (donut + outcomes), funnel, time metrics, monthly deltas
- `GET /attribution/channels/{channel}` — entry points, per-channel funnel/topics/resources, 6-month trend
- `GET /attribution/entry-points` + `POST /attribution/entry-points` (mint)

### Sequencing

```
F1–F6 foundation  →  Numbers v1 (the tab)  →  Briefing v1 (default view + PDF)  →  Infographic v1 (push email)
                                     Phase 2: Messenger ref capture · LLM topics · LLM narrative/insights ·
                                              cross-tenant benchmarks · CRM outcome round-trip
```

Per Deployment SOP: all build work staging-first (acct isolation), Terraform in `infra/`, promote per-resource. Code/IaC PRs → base `staging`; this plan set → base `main` (pure docs).

## Compliance checkpoints (before build, not after)

- **pii-data-lifecycle-advisor:** pageview ping (site-wide measurement, GA client ID sessionization), provenance data classification, mint-registry PII posture, and **Dub.co as a processor in the click path** (scanner IPs/click metadata flow through a third party — hits the "sends data to a third party" PII trigger). Living-Inventory rule applies to implementation PRs (new tables/Lambdas → `docs/roadmap/PII-Project/pii-inventory.md`).
- **ai-governance-advisor:** LLM topic classification + LLM narrative/insights (Phase 2 gates).
- **communications-consent-advisor:** infographic push email (see its plan).
- **nonprofit-volunteer-donor-risk-advisor:** no longer needed for dollar claims (dollars removed); revisit if confirmed-outcome claims become donor-facing.

## Open decisions

1. Topics quality gate: keyword v1 ships in Numbers drill; does LLM classification gate Briefing GA? (Recommend: yes — the briefing's recommendations lean on topic quality.)
2. Tenant timezone source for after-hours (config field audit).
3. Infographic cross-tenant benchmark ("top 13%") — deferred; needs anonymized cross-tenant aggregates design.

(Resolved 2026-06-12: Dub reach mechanism = poll on Pro plan — see F3.)

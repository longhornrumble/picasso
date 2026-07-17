# Demo Zone — Persona Demo Tenants, Seeder, Microsite, Prop Kit

**Status:** APPROVED ROADMAP (2026-07-16) — not yet built
**Owner:** Chris (solo operator)
**Design session:** 2026-07-16 (this doc is the outcome; tech-lead adversarial review passed approve-with-changes, all findings folded in)
**Related:** [`MISSION_INTELLIGENCE_ATTRIBUTION.md`](MISSION_INTELLIGENCE_ATTRIBUTION.md), [`TENANT_CONFIG_PROMOTION_MECHANISM.md`](TENANT_CONFIG_PROMOTION_MECHANISM.md), `attribution-workstreams/FROZEN_CONTRACTS.md`

---

## 1. Why / goals

Sales demos today have no home. Staging is a soak environment — definitionally the place things break, and its demo tenant has thin, stale data. Frontend mock data (tried 2026-07-16 for the Attribution dashboard, branch `feature/attribution-mock-data` in picasso-analytics-dashboard — parked unmerged, see §11) fakes exactly one surface, drifts against every schema change, and breaks the single most persuasive demo moment: **chat with the widget live, flip to Mission Intelligence, and the conversation is there.** Mock data renders frozen constants that visibly ignore what the prospect just did.

**The demo zone principle: seed the data plane, never mock the presentation layer.** A demo tenant is a *real* tenant whose data happens to be synthetic — real rows in the real DynamoDB tables, real config in S3, real KB in Bedrock. Every dashboard surface (Conversations, Forms, Leads, Attribution, Scheduling, Notifications) then works for free, forever, with zero mock branches to maintain. Live interactions during a demo land in the dashboards because it is the same pipeline.

**Goals**
- A standing environment an enterprise-software solutions consultant would recognize: log into a demo zone, demo the customer-facing widget AND the Mission Intelligence backend, crammed with a believable "day in the life" of a target-vertical tenant.
- Per-persona: youth-services vertical now; hospice later. Each persona = its own fictional org, tenant, microsite.
- Repeatable: reset to a pristine, current-dated state with one guarded command before any demo.
- A standing rehearsal of the real onboarding pipeline (config authoring, KB build, entry-point minting) — the demo zone dogfoods what we sell.

**Non-goals**
- NOT a test environment. Engineering testing stays on `MYR384719` in staging. Demo tenants never receive test noise — that is exactly the "okay if any data" failure this project replaces. (Rejected during design: standardizing the demo on `MYR384719`.)
- NO real PII, ever. All persons are fictional (§7 governance).
- NOT a second staging. Demo zone in prod runs shipping code only; demo zone in staging exists to rehearse the prod one.
- NOT this project: building the microsite HTML (a separate Claude design-build session owns that — §6 is a spec handoff), and not the widget itself (already built).

## 2. Architecture

```
Persona (fixture pack, data files)          Prod account 614 (the demo zone)
┌──────────────────────────────┐            ┌────────────────────────────────────┐
│ org identity, programs,      │   seeder   │ demo tenant (DEMO-YS01)            │
│ forms, topics, CTA set,      │──────────▶ │  · S3 config + mapping + KB        │
│ 6-month narrative arc        │            │  · rows in shared prod DDB tables  │
└──────────────────────────────┘            │  · Clerk org + demo user           │
                                            │  · entry-point registry rows       │
Born in staging 525 first                   │ microsite  demo.myrecruiter.ai     │
(same shape, rehearsed there)               │  · S3+CloudFront, widget embedded  │
                                            │ prop kit: QR flyer, campaign link  │
                                            └────────────────────────────────────┘
```

- **Persona model.** A persona is a fixture pack: org identity + program vocabulary + form definitions + CTA set + topic mix + the numeric narrative arc. **v1 is built concretely for persona 1** — fixtures live in data files, but no generalized persona framework until hospice's real shape is known (single-use abstraction is a known failure mode; the shared/specific boundary emerges when persona 2 is actually built).
- **Demo tenant per persona.** New dedicated tenant IDs with a reserved `DEMO-` prefix (e.g. `DEMO-YS01`). The tenant hash is deterministic — `tenant_id[:2].lower()` + first 12 hex of `sha256(tenant_id + salt)` per `deploy_tenant_stack/lambda_function.py` `generate_tenant_hash()` — so the same ID yields the same hash in staging and prod, and **one microsite build works against both environments**.
- **Environment path.** Staging-first per the Deployment SOP: the demo tenant, seeder, and infra are stood up and rehearsed in 525, then promoted to 614 via gated steps (§9 P4). The account boundary is the environment; all resources bare-named (`picasso-demo-site`, no env token).
- **Demo login.** A dedicated demo Clerk user, member ONLY of the demo tenant's Clerk org. Rationale: the super-admin tenant-switcher dropdown renders *real customer tenant names* — one misclick from being on a prospect's screen. The demo user sees exactly what a customer admin sees. (Clerk org ↔ tenant mapping via `picasso-tenant-registry-{env}` `clerkOrgId`, per `Analytics_Dashboard_API/tenant_registry_ops.py`.)
- **Anti-time-rot rule (load-bearing).** ALL seeded data is generated **relative to the seeder's run date** — six months of history laid down behind "now", never fixed dates. A fixed-date demo silently rots into "no upcoming appointments" (this exact failure mode currently has a time-rotted scheduling test fixture blocking dashboard CI merges). Reset before every demo re-anchors the clock.
- **Reset = guarded purge + reseed** (§4). Data-plane-only: reset never touches the Clerk user/org, tenant config, registry row, mapping file, or KB — so the login and widget the runbook depends on can never be broken by a pre-demo reset.

## 3. Persona 1 — youth services

> **Fictional-org rule:** the org, its people, and its metrics are invented. The microsite carries a "demonstration environment" notice, is `noindex`, and is unlinked. Never imitate a real organization's branding — no real logo, copy, or claim of identity.
>
> **Name collisions: unavoidable, accepted.** The nonprofit name space is saturated — a 2026-07-16 check found a real 501(c)(3) behind *every* candidate considered. A demo-only, unindexed prop that the operator narrates as fictional deceives no one, so a name coincidence alone is not a blocker. **The real risk is pipeline collision, not SEO:** never name a persona after an org that is — or could become — a MyRecruiter prospect. Check the pipeline, not just the web. Re-open the name if a persona leaks into public collateral (decks, marketing site, case-study material); that leak path is real, see the Seedling note below.

**Identity (decided by Chris, 2026-07-16):**
- **Org:** *BrightPath* — "Every young person deserves someone in their corner."
- **Known collision, accepted:** [BrightPath Youth Alliance](https://www.brightpathtennessee.com/) is a real Tennessee youth nonprofit whose programs (mentorship, academic support, career exposure) closely match the ones below. Mitigations: do **not** use the "Youth Alliance" suffix, their copy, or their branding; confirm they are not in the sales pipeline before the microsite ships.
- **Rejected — "Seedling":** an earlier draft of this doc called Seedling "the fictional org already in sales collateral." **That was wrong.** [Seedling](https://www.seedlingmentors.org/) is a real Austin mentoring nonprofit and an actual MyRecruiter prospect — `Deal_prep_level-2/seedling-brief.json` is a live Deal Prep brief on them, and `picasso-webscraping/rag-scraper/scrape-seedling-mentors.js` scraped their real site into a KB. Never use it as a persona.
- **Programs (3):** Mentorship Matches (1:1 adult mentors), Bright Futures (after-school tutoring & life skills), Launchpad (transition support for youth aging out of foster care).
- **Conversational forms:** Volunteer Application, Mentor Application, Donation Inquiry, Event Registration.
- **Topic mix:** Volunteering, Donations, Programs, Events, Contact & hours (weights per the fixture arc).
- **CTA set:** Apply to volunteer (`start_form`), Become a mentor (`start_form`), Give today (`external_link` → giving page), Register for the gala (`start_form`), Explore programs (`send_query`) — all `ai_available: true` for the V4 action selector.
- **Six-month narrative arc** (numbers adapted from the internally-consistent fixture in `picasso-analytics-dashboard` branch `feature/attribution-mock-data`, `src/services/attributionMockData.ts`): steady growth to ~1,250 conversations/month and ~215 leads/month "now"; website ≈2/3 of volume; Messenger the best converter (~18%); QR/standalone climbing from a spring event push; a campaign channel that just launched this month and sits below the n≥50 confidence floor (exercises the "held" UI states); ~46% after-hours share (the money-band story); leads spread across every pipeline state so the Lead Workspace looks alive; a plausible weekly heatmap and top-questions list.
- **Tenant:** `DEMO-YS01` (hash derived: prefix `de` + sha256 — computed at creation). Subscription tier set so all dashboard flags are on (`dashboard_conversations/forms/attribution/notifications/scheduling/settings`), plus `V4_ACTION_SELECTOR: true`.

## 4. Seeder design

A CLI in a new top-level `demo-zone/` project directory (Node or Python — pick at build time to match the contract-test tooling reused). Persona fixtures are plain data files; the seeder maps them onto the physical stores.

### 4.1 What it writes (the table matrix — verified against `Analytics_Dashboard_API` 2026-07-16)

| Surface | Store | Keyed by | Must-write attrs / gotchas |
|---|---|---|---|
| Tenant resolution | S3 `{config-bucket}/mappings/{hash}.json` | — | `{tenant_id, tenant_hash}` — **without it, hash↔id reverse lookup fails and conversations/forms queries return empty** |
| Conversations | `picasso-session-summaries` | `pk=TENANT#{hash}`, `sk=SESSION#{id}` | `started_at` (drives date filter/heatmap/after-hours), `first_question`, `outcome`, `total_response_time_ms`+`response_count` (avg is computed — a single avg field does nothing) |
| Conversations detail / Forms funnel | `picasso-session-events` | `pk=SESSION#{id}`, `sk=STEP#{n:03d}` | `tenant_hash` + `timestamp` (GSI `tenant-date-index` — row invisible without both); `event_type` (`FORM_VIEWED/STARTED/FIELD_SUBMITTED/COMPLETED`, `CONVERSATION_STARTED` w/ top-level `entry_point_id` + `attribution`); abandons are DERIVED (started−completed), never emitted |
| Forms / Leads | `picasso_form_submissions` | `submission_id`; GSIs on `tenant_id` | **BOTH `submitted_at` AND `timestamp`** (GSI sort — known gotcha); `form_data_labeled`/`form_data_display`; `pipeline_status` + `tenant_pipeline_key="{tenant_id}#{status}"` (lead queue GSI); `internal_notes` |
| Attribution | `picasso-attribution-aggregates` | `pk=TENANT#{tenant_id}` | C5 rows `METRIC#attribution_{summary\|channel\|entrypoint}#{YYYY-MM}…`; **≥6 months** or trends/deltas render zeros; shares sum 100%, table sums = funnel endpoints |
| Attribution | `picasso-entry-points` | `tenant_id` + `ep_…` | C3 registry rows (label/channel/campaign/placement/…); channel attribution resolves THROUGH these rows; **no person fields ever (C8.14)** |
| Scheduling | `picasso-booking` | GSI partition **`tenantId`** (camelCase) | ISO-Z `start_at` (lexicographic BETWEEN), `coordinator_email`, `status`, `appointment_type_id`; **never set `is_synthetic`** (those rows are filtered out of the dashboard); upcoming AND past bookings relative to run date |
| Notifications | `picasso-notification-events` | `pk=TENANT#{tenant_id}` | `sk={ISO}#{event_type}#{message_id}`; lifecycle events (`send→delivery→open→click`) **share `message_id`** or rates compute to zero |

Not seeded: `Analytics_Aggregator` / `Aggregator_Function` / `picasso-dashboard-aggregates` — **dead legacy**; the API comments state reading them yields silent all-zero responses.

### 4.2 Attribution strategy (aggregates vs raw)

Attribution is the one surface that reads **only** pre-computed aggregates + the registry — raw events alone render nothing. Split by month:
- **Historical months (−6 … −1):** write C5 aggregate rows directly. Deterministic, internally reconcilable, no dependency on Dub credentials or aggregator runs.
- **Current month:** seed raw `CONVERSATION_STARTED` events (with `entry_point_id`s) + registry rows and let the real `Attribution_Aggregator` compute — so **live demo conversations flow through the genuine pipeline** and land in the same month the prospect is looking at.
- Demo timing nuance for the runbook: Conversations/Forms/Leads update **instantly** during a live demo; Attribution updates on the aggregator's schedule.

### 4.3 Prod safety (the highest-blast-radius element of this whole project)

The seeder writes directly into **shared prod tables that also hold real customer rows**, bypassing the app-layer write path. Safety is IAM-enforced, not merely app-level:

- **Execution identity:** dedicated least-privilege role `picasso-demo-seeder` (per-account, Terraform module, assumed via operator SSO). Inline policy grants writes ONLY with partition-key conditions (`dynamodb:LeadingKeys`) **exact-matching the demo tenant keys** (`TENANT#DEMO-YS01`, `TENANT#<demo-hash>`, `tenantId=DEMO-YS01`, …). Exact-value lists, not broad wildcards.
- **The non-tenant-keyed table:** `picasso-session-events` is keyed `SESSION#{session_id}` — un-scopable by tenant. Therefore **all seeded session IDs carry a reserved prefix** (`session_demo_…`) and the policy scopes `SESSION#session_demo_*` via StringLike. The live widget never generates that prefix.
- **Defense in depth:** hardcoded demo-tenant allowlist in the seeder code; `--dry-run` is the default (prints the write plan; `--execute` required to write); every batch summary printed before execute.
- **Idempotent:** re-running replaces the seeded window cleanly (delete-by-demo-keys then write), so drift never accumulates.

### 4.4 Reset wrapper

`demo-zone reset` = purge + reseed, for use before every demo:
- **Purge step** invokes the existing `picasso-pii-tenant-purge` Lambda. That tool was built for rare, deliberate DSAR deletion; making it routine demands its own guard: the wrapper carries a **hardcoded allowlist of demo tenant IDs** and refuses anything else — operator discipline is not the control. The **dry-run-before-destroy hard rule applies to this purge step** (CLAUDE.md): dry-run output reviewed in-session immediately before the real run.
- **Data-plane-only:** never touches Clerk, config, registry, mapping, or KB (§2).
- Then reseed, re-anchored to today.

## 5. Entry points & channels

- Entry points the demo actually exercises: **3 website page entry points** (home / programs / giving) and **1–2 campaign** links (spring appeal email, newsletter). Messenger and QR/standalone are **seeded history only** — see "QR is out of the demo" below.
- **Minting order:** entry-point IDs are fixed **once, in staging, BEFORE the microsite spec handoff** (§6) so the spec carries real `?ep=` values; the seeder later writes the **same IDs verbatim** into the prod registry. The microsite HTML never changes across promotion (hash is deterministic; ep IDs preserved).
- **Channel truth:** a conversation's channel is resolved by the `Attribution_Aggregator` from the `entry_point_id`'s registry row (`no ep → website`; `meta:` session prefix → messenger). The surfaces don't self-declare channels.
- **Website entry points are seeder-written, not minted.** `Attribution_Mint_Service` accepts `channel: standalone | campaign` only (`validation.mjs:12`) — it cannot mint `website`. This does **not** block anything: the seeder writes registry rows **directly to DynamoDB**, bypassing the app-layer write path (§4.3), so it writes `website` rows with real labels and generates the `ep_` ULIDs itself. Live campaign links work through the normal path (the widget host captures `?ep=` from the page URL — `src/widget-host.js:94–145`). **The one honest caveat:** the demo shows per-page website attribution that a customer cannot currently self-serve through the mint UI. A sales-integrity note for whoever is in the room, not a build gate.

### QR is out of the demo (decided 2026-07-17)

**The QR flyer is shown as a standalone artifact, outside the demo flow** — no prospect scans anything with their own device, and the runbook has no live-scan moment. Rationale: the demo should not drag an all-tenant code change onto its critical path.

The seeded **standalone/QR channel history stays** in the arc (it demonstrates that the product tracks print/QR provenance, and it costs nothing — it is just data).

**The `/go/` bug is being fixed on its own merits, now — not deferred (decided 2026-07-17).** `Picasso/public/go/loader.js` builds the iframe URL with only `t` + `mode=fullpage` and its init postMessage carries no attribution; the iframe receives attribution *only* via the widget-host postMessage (`iframe-main.jsx:457`). **So `/go/?…&ep=…` does not attribute — for any tenant.** This is a latent product defect, not a demo-specific one, and it is decoupled from demo-zone phasing in both directions: the demo no longer waits on it, and it no longer waits on the demo. It harms no customer *today* (live Dub/QR minting is gated behind the attribution F2 compliance track, §10, so no tenant can mint a QR link to hit the broken path) — but a known bug parked until its consumer ships is a bug rediscovered under deadline. Fix shape: forward `?ep=` + UTM from the `/go/` page into the iframe init (mirror `captureAttribution`); own branch → tests → staging soak → gated prod dispatch.

## 6. Microsite

**Division of labor:** the HTML is designed and built by a **separate Claude design-build session**. This project produces the **build spec** and owns hosting.

**Build-spec handoff must contain:**
- Pages: Home, Programs, Giving. Widget on all three via the canonical embed — `<script src="https://chat.myrecruiter.ai/widget.js" data-tenant="{demo-hash}" async>` — with each page's URL carrying its **pre-minted** `?ep=` value (§5) so per-page provenance is real.
- Fictional-org identity + copy constraints (§3), a visible "demonstration environment" footer notice, `noindex` everywhere.
- Static output only (no SSR), so S3+CloudFront serving works unmodified.
- *(No `/flyer` page — QR is out of the demo flow as of 2026-07-17, §5.)*

**Hosting:** S3+CloudFront at `demo.myrecruiter.ai`, cloning the OAC-hardened module pair (`infra/modules/s3-analytics-dashboard-staging` + `cloudfront-analytics-dashboard-staging` + ACM). Bucket bare-named `picasso-demo-site`. Staging module first (`demo-staging.…` or CloudFront domain), prod via gated `-target` dispatch.
- **DNS reality check:** `myrecruiter.ai` is hosted at **GoDaddy, not Route53** — Terraform cannot write DNS. Two manual GoDaddy steps per environment (ACM validation CNAME, then the alias CNAME), same recipe as config-builder/scheduling domains.
- **CORS/origin gate (P3 exit criterion):** widget serving + Master Function/analytics APIs must accept `demo.myrecruiter.ai` before rehearsal — a silent CORS failure is a "looks broken in front of a prospect" class of bug.
- *(Interim fallback only: the `Website Redesign` repo's `sandbox/[slug].astro` system on Vercel already embeds the widget per-tenant and could host a quick page if a demo lands before P3 — not the target architecture.)*

**KB:** authored directly from the persona pack as `.md` + `.md.metadata.json` (with `metadataAttributes.tenantId`) into `s3://kbragdocs/tenants/DEMO-YS01/`, synced via `StartIngestionJob` (pattern: `kb_proposal_applier/bedrockSync.mjs`). Once the microsite is live, optionally re-scrape it with rag-scraper — the full onboarding dogfood.

## 7. Synthetic-person governance

- All persons come from a fictional roster in the persona pack. Emails `@example.org`, phones `555-01xx`, no real names, no real photos of people.
- Seeded `picasso-notification-events` rows use those fake destinations — they are history rows, **nothing is ever sent to them**.
- **Live sends during demos:** a live form completion triggers real internal notification email/SMS. The demo tenant's notification **recipients must be MyRecruiter-owned addresses** (e.g. `chris@`/`demo@myrecruiter.ai`) — never `@example.org` (real SES sends to fake domains bounce and damage sender reputation).
- PII posture: synthetic data lowers stakes but the tenant still flows through PII-governed surfaces; the demo tenant is listed in `PII-Project/pii-inventory.md` when created (Living-Inventory PR Rule). **Hospice persona (P5) requires an advisory pass** (health-adjacent conversation content) before build.

## 8. Prop kit & demo runbook

**Props**
- **Campaign email:** a static "spring appeal" mock email page (or a link kept in demo notes) whose button carries the campaign `?ep=` link. Works through the normal widget-host capture path — no `/go/` dependency.
- *(**QR flyer: out of the demo flow.** Shown as a standalone artifact outside the demo, on its own. No live scan moment, no `/flyer` page, no dependency on the `/go/` fix — §5.)*

**Runbook skeleton (full script written in P2)**
1. Pre-demo checklist: `demo-zone reset` (dry-run purge → execute → reseed), demo-user login check, widget smoke on all three pages.
2. Open on the microsite: "this is a nonprofit like yours." Chat on the giving page.
3. Flip to Mission Intelligence as the demo user: the conversation is **already in Conversations/Leads** (instant surfaces).
4. Walk the seeded backdrop: Attribution (six-month story, channel mix, money band), Forms funnel, Lead Workspace (advance a lead live), Scheduling (seeded view), Notifications.
5. Honest-caveat card carried by the script: attribution updates on aggregator cadence (today's live chats appear in Conversations instantly, in Attribution on the next aggregation); **Messenger, QR/standalone, and Notifications are seeded history**; **Scheduling is seeded-view-only in v1** (live booking demo needs a real connected calendar — deferred deliberately).

## 9. Phasing

| Phase | Scope | Exit criteria |
|---|---|---|
| **P0** | This roadmap approved; persona-1 fixture pack written (org, programs, forms, topics, CTAs, numeric arc, fictional roster); prod tenant-creation checklist drafted (manual, gated — see note) | Fixture pack reviewed by Chris (org identity approved); checklist in this doc's repo |
| **P1** | Staging demo tenant: config (staging Config Builder), Clerk org **+ staging demo user**, registry row, mapping file, KB. Seeder v1: conversations/forms/leads | Logged in as demo user on `staging.app.myrecruiter.ai`: Conversations, Forms, Leads all render the seeded story; zero real-tenant rows touched (verify via key audit) |
| **P2** | Seeder full coverage: attribution (6-month C5 history + current-month raw + registry), scheduling, notifications. Guarded reset wrapper | Full staging demo rehearsal end-to-end as demo user; reset run twice proves idempotency; date-shift test (seed, jump a "day", reseed) proves anti-time-rot |
| **P3** | Fix entry-point IDs (staging) → microsite build-spec handoff → receive HTML → host: staging infra module, then gated prod module + GoDaddy DNS ×2 + CORS check. Campaign-email prop | `demo.myrecruiter.ai` live serving the site; widget works on all 3 pages; every website + campaign entry point attributes on staging |
| **P4** (gated) | Prod cutover: manual gated tenant creation (checklist), `picasso-demo-seeder` role (targeted prod apply), seeder prod run (purge dry-run first), prod demo Clerk user | Full prod rehearsal: live chat → dashboard; reset works; demo-ready sign-off by Chris |
| **P5** (later) | Hospice persona (PII advisory pass first) + second microsite; Messenger live post-App-Review; Dub-minted QR after attribution F2 prod compliance | — |

**New-tenant-promotion note (decided):** the existing `promote-tenant-config.yml` is existing-tenant-only (its prod write-role deliberately lacks `dynamodb:PutItem` for registry rows). For the ≤2 demo tenants this project needs, prod creation is a **one-time gated manual checklist** (config promote where usable + scripted mapping/registry/flags steps, dry-run first). Generalized new-tenant promotion automation is a separate backlog item that benefits all onboarding — it is **not** a demo-zone gate.

## 10. Dependencies, risks, cost

| Item | Impact | Posture |
|---|---|---|
| `/go/` attribution fix | Touches ALL tenants' QR/standalone entry points. **Blocks nothing in the demo** — QR is out of the demo flow (§5) | Fixed on its own merits (decided 2026-07-17): own branch → tests → staging soak → gated prod dispatch. Fully decoupled from demo phasing in both directions |
| Attribution F2 prod compliance track (Dub DPA, notice, GPC/CMP) | Blocks **live Dub minting only** — NOT seeded aggregates, NOT the plain-QR prop | Demo zone does not wait on it |
| GoDaddy manual DNS | 2 manual steps per env; no Terraform DNS | Known recipe; budget operator time |
| Meta App Review | Blocks live Messenger demo | Seeded-history-only until it clears |
| Demo-data staleness | Demo silently rots | Relative-time seeder + reset-before-demo (runbook step 1) |
| Seeder prod writes | Highest blast radius in the project | IAM-scoped role + prefixed session IDs + allowlist + dry-run default (§4.3) |
| Cost | S3/CF static site, one KB ingestion per persona, seeded rows, demo Bedrock invocations | Negligible at this scale (single-digit $/month); stated for completeness |

## 11. Disposition of `feature/attribution-mock-data`

The 2026-07-16 frontend mock branch (picasso-analytics-dashboard, `bfcdc32`) stays **parked unmerged** as an emergency stopgap if a demo lands before P2. Its `attributionMockData.ts` is the numeric fixture spec for the persona-1 arc (§3). Delete the branch when P2 lands.

# Attribution — FROZEN CONTRACTS (Wave 1)

**Status:** 🔒 LOCKED 2026-06-12 (Wave-1 launch). Amendments only via the integrator, recorded in the change-log.
**Owner:** integrator (sole writer). Workers NEVER edit this file — contract disputes go in the worker's report-back.
**Parent plan:** [../MISSION_INTELLIGENCE_ATTRIBUTION.md](../MISSION_INTELLIGENCE_ATTRIBUTION.md) (10 locked decisions + F1–F6 govern; nothing here may contradict them).
**Inputs:** pipeline recon (wire formats ground-truthed from code, 2026-06-12) + pii-data-lifecycle-advisor Phase-0 review (2026-06-12 — C8 below; NOTHING blocking build; notice/DPA items gate prod enablement only).

## Change-log

| Date | Change | Why |
|---|---|---|
| 2026-06-12 | Initial lock | Phase 0 complete: recon + PII advisory folded in |
| 2026-06-12 | `created_by` REMOVED from registry + mint payloads | PII advisor: operator identity = Tier-2 reclassification; v1 registry holds no person fields |
| 2026-06-12 | F5 idle-cap locked at 5 min; work-weeks = hours/40 | F5 said "idle-capped" without a value |
| 2026-06-12 | **C5 re-homed:** rollups in NEW `Attribution_Aggregator` Lambda + NEW `picasso-attribution-aggregates` table (env `ATTRIBUTION_AGGREGATES_TABLE`, TTL attr `ttl`); key patterns unchanged. Physical names bare in the staging acct per uniform-env-rules | Live state beat plan F4: legacy `Analytics_Aggregator` is zip-only in-repo, dead/dormant in prod (cleanup project tracks removal), deliberately NOT twinned to staging (`infra/main.tf` analytics-pipeline comment). Extending a removal-slated component violates clean-shape SOP |

## Producer/consumer matrix

| Contract | Produced by | Consumed by |
|---|---|---|
| C1 Event schemas | WS-A (widget) | WS-C (pipeline) |
| C2 Provenance | WS-A (stamp) + WS-C (resolve) | WS-C, WS-D |
| C3 Registry record | WS-B (writes) | WS-C (enrich join), WS-D (list) |
| C4 Dub integration | WS-B (mint/repoint/QR), WS-C (analytics poll) | — |
| C4b Mint-service invoke | WS-B (handler) | WS-D (proxy route) |
| C5 Aggregate rows | WS-C | WS-D (serves; builds against fixtures) |
| C6 /attribution API | WS-D | dashboard surfaces (Wave 2) |
| C7 F5 definitions | this file | WS-A/C/D (embed constants verbatim) |
| C8 PII constraints | pii-data-lifecycle-advisor | ALL workers |

---

## C1 — Event schemas 🔒

### C1.0 Envelope (existing — ground-truthed from `Picasso/src/analytics/eventConstants.js:174-204`)

Every widget event uses `createAnalyticsEvent({ eventType, payload, sessionId, tenantHash, stepNumber, gaClientId })` producing:

```json
{
  "schema_version": "1.0.0",
  "tenant_id": "<tenantHash>",
  "session_id": "sess_<ts36>_<rand>",
  "timestamp": "<ISO8601>",
  "step_number": 1,
  "event": { "type": "EVENT_TYPE", "payload": { } },
  "ga_client_id": "123456789.1234567890"
}
```

Transport: batched (1000 ms debounce) HTTP POST to `${STREAMING_ENDPOINT}?action=analytics` with body `{ "action": "analytics", "batch": true, "events": [ <envelope>… ] }` (`Picasso/src/iframe-main.jsx:163-287`) → Bedrock_Streaming_Handler `handleAnalyticsEvent()` → SQS `picasso-analytics-events`. New events reuse this path unchanged.

### C1.1 `CONVERSATION_STARTED` (existing constant — wire emission)
- Emit ONCE per session, on the **first user message** (C7 definition), not on widget open.
- `payload`: `{ "entry_point_id": "<ep_…|null>", "attribution": <the existing widget attribution object, verbatim — ga_client_id/utm_*/gclid/fbclid/referrer/landing_page/captured_at> }`.

### C1.2 `LINK_CLICKED` (existing emission CONFIRMED at `MessageBubble.jsx:941,950` — amended 2026-06-12)
- Emit on click of any link inside message content, including outbound resource links.
- `payload`: `{ "url": "<href>", "label": "<anchor text, ≤120 chars>", "source": "message" | "cta" | "resource" }` **PLUS legacy-compat fields `link_text`, `link_domain`, `category` retained additively** — the live dashboard session timeline renders `payload.link_text` (`SessionTimelineEvent.tsx:186`) and that repo cannot update before Wave 2 (prod-gated). Legacy fields drop only after the Wave-2 dashboard reads `label`.

### C1.3 `PAGE_VIEW` (NEW constant — add to `eventConstants.js`)
- Emitted by the **loader** (`Picasso/src/widget-host.js`), same envelope + transport (single-event batch POST), independent of the iframe.
- **Identity:** `session_id` = `pv_<random>` kept in `sessionStorage` (created on first ping in the tab session); `step_number` = sessionStorage counter; `ga_client_id` included when the `_ga` cookie exists (read-only — existing `getGAClientId()` path). MUST NOT set any cookie; MUST NOT write `localStorage` (C8.3).
- **Payload allow-list (exhaustive — anything else is forbidden, C8.1–2):**
  `{ "path": "<location.pathname ONLY, ≤512 chars>", "referrer_host": "<hostname of document.referrer | null>", "device_class": "mobile|tablet|desktop" }`
  Forbidden: full URL, query string, hash, `document.title`, full referrer, raw UA, screen/fingerprint fields, IP, `dub_id`.
- **Throttle:** once per `(pathname, tab session)` via a sessionStorage seen-set; hard cap 100 emissions per session (C8.5).
- **Kill switch:** emit only when tenant config `feature_flags.REACH_PING !== false` (default ON when absent); all emission through ONE function (future consent/GPC choke point, C8.9).

---

## C2 — Session provenance 🔒

Canonical resolved shape (umbrella F3): `{ "channel": "website|messenger|standalone|campaign", "entry_point_id": "ep_…|null", "campaign": "…|null", "placement": "…|null" }`

**Split population responsibility:**
- **WS-A (widget, at birth):** captures `?ep=` from the page URL in `widget-host.js` when it matches `^ep_[0-9A-Za-z]{8,64}$`, adds `entry_point_id` to the attribution object (postMessage → iframe), and ships it in C1.1. The widget does NOT guess channel and never populates campaign/placement (URL is untrusted for taxonomy).
- **WS-C (pipeline, at aggregation):** resolves final channel:
  1. `entry_point_id` present → registry lookup (C3) → that record's `channel`/`campaign`/`placement` (store IDs, join labels at read — C8.11).
  2. session id prefix `meta:` → `messenger`.
  3. else → `website`; `campaign` = `utm_campaign` truncated 128 chars when present.
  Unresolvable `ep_` ids → `website` + warning metric; never drop the session.
- Schema discipline: every reader tolerates absent provenance/attribution (`item.get(...)`/`?? null`) — pre-existing rows have none. Contract/fixture test against an old-shape record REQUIRED in each reader PR.

**Entry-point id (locked):** `ep_` + ULID (26-char uppercase Crockford base32), generated by WS-B at mint. URL param `?ep={entry_point_id}` verbatim. Dub `externalId` = `entry_point_id` verbatim (namespaced apart from KB-link externalIds `{tag}:{category}:{slug}:{hash}` minted by `picasso-webscraping/rag-scraper/lib/dub.mjs`).

---

## C3 — Mint registry record 🔒

DynamoDB **`picasso-entry-points`** (bare name per the staging account's uniform-env-rules — the account boundary IS the env; code reads env var `ENTRY_POINTS_TABLE`). Terraform module = integrator glue, per `infra/modules/ddb-*-staging` conventions: PAY_PER_REQUEST, PITR on, no TTL — config data.

| Attribute | Type | Notes |
|---|---|---|
| `tenant_id` | S — **PK** | org/tenant id |
| `entry_point_id` | S — **SK** | `ep_` + ULID (C2) |
| `label` | S | display name, ≤128 chars |
| `channel` | S | `standalone` \| `campaign` (mint-time, required) |
| `campaign` | S | required at mint (locked decision #2), ≤128 chars |
| `placement` | S | required at mint, ≤128 chars |
| `target_type` | S | `standalone_chat` \| `site_url` |
| `destination_url` | S | full destination INCLUDING `?ep={id}` |
| `dub_link_id` | S | Dub `id` from mint response |
| `dub_short_link` | S | e.g. `https://myrctr.link/gala-tents` |
| `dub_key` | S | the suffix |
| `status` | S | `active` \| `archived` (no deletes v1) |
| `created_at` | S | ISO8601 |

**NO person fields — ever** (C8.14): no `created_by`, no emails. Taxonomy guardrails at mint (C8.13): length caps above, reject `@` in label/campaign/placement, API description text warns "never name an individual." No GSI v1 (list = Query PK).

---

## C4 — Dub.co integration 🔒

House conventions: `picasso-webscraping/rag-scraper/lib/dub.mjs` (auth/error/429 patterns — do NOT reuse its externalId namespace or `/links/upsert` for attribution).

- **Base** `https://api.dub.co`, `Authorization: Bearer <key>`. **Key handling (C8/Tier-4):** Secrets Manager secret **`picasso/staging/dub/api-key`** (house naming, mirrors the JWT secret), fetched at runtime via env `DUB_SECRET_NAME` (never a plaintext env var, never logged). Operator places the staging value (escalation boundary — batched). Local dev key: `.firecrawl/Dub/.env`. **If the secret is absent/empty, Dub-dependent code paths MUST degrade gracefully** (mint → `DUB_ERROR`; poll → skip with warning, write zero-reach) so staging soaks before the key lands.
- **Mint (WS-B):** `POST /links` `{ url: <destination + "?ep={id}">, domain: "myrctr.link", key: <optional custom suffix ≤190>, externalId: <entry_point_id>, tenantId: <tenant_id>, tagNames: [<tenant_id>], comments: "Attribution entry point — minted by MyRecruiter" }`. **409 semantics:** externalId is workspace-unique → 409 = already-minted; treat as success IFF the registry row exists, else surface `CONFLICT`. Deliberately POST (not house upsert): mint must fail loudly on suffix collision, never silently repoint an existing link.
- **Destination validation (C8.15, v1):** `https:` only; no userinfo; query params limited to `utm_*` (`ep` appended by the service); reject `mailto:`/`javascript:`. Domain allow-list enforced against tenant-config site-domain fields when present (schema-tolerant read), else accept + emit warning metric (v1 softening — config has no universal domain registry; noted in kanban).
- **Repoint:** `PATCH /links/ext_{entry_point_id}` `{ url }` — printed QR stays valid. Not dashboard-exposed v1; registry `destination_url` updates in the same operation.
- **QR:** `GET https://api.dub.co/qr?url={short_link}&size=1000&level=H` → PNG (print spec: size ≥ 1000, level H).
- **Analytics poll (WS-C, hourly):** `GET /analytics` — one workspace `groupBy=top_links` sweep + targeted `groupBy=timeseries`/`triggers` pulls. Filters: `externalId=ext_{entry_point_id}` (**`ext_` prefix in GET queries ONLY**), `tenantId`, `trigger=qr|link` (scan-vs-click split), `timezone` (IANA), `start`/`end`/`interval`. Limits: 2 req/s analytics, 600/min general; honor `Retry-After` on 429.
- **Persisted poll output (exhaustive, C8.17):** `{tenant_id, entry_point_id, period, trigger, country, device_class, count}` — counts only; country granularity max (no city/region); NEVER persist referer strings from Dub responses.
- **FORBIDDEN (Business tier / privacy):** `/events` raw export (must not be called even if the tier ever allows — fresh advisory required first), `track/lead`, `track/sale`, webhooks. No consumer identifier ever flows MyRecruiter → Dub (C8.18).

### C4b — Mint-service invoke 🔒

WS-D's `POST /attribution/entry-points` proxies to WS-B's Lambda (direct invoke; function name from env `MINT_FUNCTION_NAME`; IAM grant = integrator glue) AFTER JWT auth + `dashboard_attribution` flag check.

Request (WS-D → WS-B):
```json
{ "action": "mint", "tenant_id": "…", "label": "…", "channel": "standalone|campaign", "campaign": "…", "placement": "…", "target": { "type": "standalone_chat|site_url", "url": "https://…" }, "suffix": "optional-custom-key" }
```
`target.url` REQUIRED for both types in v1 (Wave-2 UI supplies the tenant's standalone page URL; the service appends `?ep=`).

Success: `{ "ok": true, "entry_point": { "entry_point_id": "ep_…", "short_link": "…", "qr_url": "https://api.dub.co/qr?url=…&size=1000&level=H", "destination_url": "…?ep=ep_…", "dub_link_id": "…", "created_at": "ISO8601" } }`
Failure: `{ "ok": false, "error": { "code": "SUFFIX_TAKEN|DUB_ERROR|VALIDATION|CONFLICT", "message": "…" } }` → WS-D maps to HTTP 409/502/400/409.

---

## C5 — Aggregate rows 🔒 (re-homed 2026-06-12 — see change-log)

Written by WS-C's **NEW `Attribution_Aggregator` Lambda** (Python 3.13, new dir, dedicated role; hourly EventBridge schedule = integrator Terraform glue) into the **NEW table `picasso-attribution-aggregates`** (bare name in the staging acct; env var `ATTRIBUTION_AGGREGATES_TABLE`; TTL attribute `ttl`). The legacy `Analytics_Aggregator` dir (zip-only, removal-slated) and the legacy `picasso-dashboard-aggregates` table are NOT touched. Key patterns:

```
attribute names: pk / sk (lowercase, matches the session-events convention) · TTL attribute: ttl
pk  TENANT#{tenant_id}
sk  METRIC#attribution_summary#{YYYY-MM}
sk  METRIC#attribution_channel#{YYYY-MM}#{channel}
sk  METRIC#attribution_entrypoint#{YYYY-MM}#{entry_point_id}
ttl = now + 420 days
```

Recompute model: each hourly run idempotently recomputes the **current** tenant-local month from `picasso-session-events` (GSI `tenant-date-index`); prior month finalized on runs during the first 3 days of a new month (events 90-d TTL makes this safe). Month boundaries = tenant-local (C7 timezone). Tenant config (for `timezone`) read from the staging config bucket via env `TENANT_CONFIG_BUCKET`, schema-tolerantly.

Fields:
1. **`attribution_summary`** — `conversations`, `engaged`, `applications`, `leads`, `after_hours_conversations`, `conversation_minutes` (int, C7 active-time), `reach_page_views_sessions` (sessionized PAGE_VIEW: ga_client_id where present else pv session id, 30-min windows), `self_booked_pct` + `median_first_response_minutes` (nullable v1 when source absent).
2. **`attribution_channel`** — same outcome fields + `topic_counts` (map), `resource_clicks` (map url→count, top 20, from LINK_CLICKED), `reach` (website: page-view sessions; minted: `{scans, clicks}` from C4 poll).
3. **`attribution_entrypoint`** — outcome fields + `dub_scans`, `dub_clicks` + denormalized `label`/`campaign`/`placement` snapshot from registry.

Aggregates contain **counts only** — no `ga_client_id`, `session_id`, or `path` below tenant×month×channel×entry-point granularity (C8.7). 6-month trend = read 6 monthly rows. All attributes additive; readers MUST tolerate old rows without them (contract/fixture test per Schema Discipline).

**Topics v1:** WS-C embeds a verbatim copy of `categorize_question(question: str) -> str` from `Analytics_Dashboard_API/lambda_function.py:5374` (6 categories: Volunteer/Donation/Events/Services/Supplies/General), source-cited in a comment, applied at aggregation time. Phase-2 dedupe noted.

**WS-C owned surface (amended):** `Analytics_Event_Processor/**` + NEW `Attribution_Aggregator/**`. The zip-only `Analytics_Aggregator/` dir is OUT OF SCOPE for everyone.

---

## C6 — /attribution API 🔒

New routes in `Analytics_Dashboard_API` (WS-D), existing single-handler path-switch + JWT (Bearer) pattern. **Every route:** server-side flag check `features.get('dashboard_attribution', False) or feature_flags.get('dashboard_attribution', False)` from tenant config (existing pattern at `lambda_function.py:1452-1461`) → **403 when off** (locked decision #10). Responses via existing `cors_response(status, body)`; body always includes `tenant_id`, `month`, `source`. Aggregates only — no per-person data (C8).

- `GET /attribution/summary?month=YYYY-MM` → body: `tenant_id`, `month`, `source`, plus
```json
{ "ecosystem": { "total_conversations": 0, "after_hours_pct": 0.0, "channels": [ { "channel": "website", "share_pct": 0.0, "conversations": 0, "leads": 0, "rate": 0.0, "rate_held": false } ] },
  "funnel": { "reached": 0, "conversations": 0, "engaged": 0, "applications": 0, "leads": 0, "rate": 0.0 },
  "time": { "after_hours_conversations": 0, "staff_hours": 0.0, "work_weeks": 0.0, "self_booked_pct": null, "median_first_response_minutes": null },
  "deltas": { "<metric>": { "abs": 0, "pct": 0.0 } },
  "insight": { "text": "…", "rule_id": "…", "held": false } }
```
- `GET /attribution/channels/{channel}?month=YYYY-MM` → `funnel` (channel scope, same shape) + `entry_points` `[ { "entry_point_id", "label", "campaign", "placement", "created_at", "short_link", "scans", "clicks", "conversations", "leads", "rate", "rate_held", "is_new" } ]` + `topics` `[ {"topic","count"} ]` + `resources` `[ {"url","clicks"} ]` + `trend` `[ {"month","conversations","leads"} ×6 ]` + `read` `{ "text","rule_id" }` + `suggested_move` `{ "text","rule_id","tier" }`.
- `GET /attribution/entry-points` → `{ "entry_points": [ <C3 records> ] }`.
- `POST /attribution/entry-points` → validate + proxy per C4b → HTTP 201 with the C4b success payload.

**Recommendations rule pack (WS-D — single source for Numbers AND Briefing):** pure functions over C5 rows → list of `{rule_id, tier: "double_down|worth_a_look|too_early", text, evidence}`. v1 rules (all suppressed below the C7 n-floor): best-rate channel above floor → `double_down`; entry point below floor → `too_early` ("leave them running"); channel rate ≥1.5× website (both above floor) → `worth_a_look` with the multiple as evidence; channel with zero entry points → mint prompt. Held states render as `held: true` / `rate_held: true`, never as absent fields.

---

## C7 — F5 definitions 🔒 (embed verbatim; cite this section)

- **Conversation started:** first user message in session.
- **Engaged:** ≥1 of {`CTA_CLICKED`, `LINK_CLICKED`, `FORM_VIEWED`} OR ≥2 user messages.
- **Application started / lead delivered:** `FORM_STARTED` / `FORM_COMPLETED`.
- **After hours:** outside Mon–Fri 09:00–17:00 tenant-local.
- **Tenant timezone:** config key `timezone` (IANA) read schema-tolerantly (`config.get('timezone', DEFAULT_TZ)`); recon confirmed NO such field exists today → `DEFAULT_TZ = "America/Chicago"` (PROVISIONAL — operator confirmation batched; single constant, one-line change).
- **Staff-hours absorbed:** Σ per-session active time; active time = Σ over consecutive-message gaps of `min(gap, 5 min)`, floor 1 min per conversation; monthly. *Measured, not modeled.*
- **Work-weeks:** `staff_hours / 40`, 1 decimal.
- **Confidence floor:** n ≥ 50 conversations (per channel / per entry point) before ANY rate comparison or insight; below floor → `rate_held: true`, rules emit `too_early` only.
- **Reach:** context above the funnel, never a stage. Website = sessionized PAGE_VIEW (30-min windows); minted = Dub scans+clicks.
- **Month:** calendar month, tenant-local.

---

## C8 — PII constraints 🔒 (pii-data-lifecycle-advisor, 2026-06-12 — binding on all workers)

1. PAGE_VIEW payload allow-list is **exhaustive**: `path` (pathname only, ≤512), `referrer_host` (hostname or null), `device_class` (enum) + standard envelope. Anything else is forbidden.
2. Explicitly forbidden in PAGE_VIEW: full URL, query string (tenant sites put emails/tokens/prefill in queries), hash, `document.title`, full `document.referrer` (do NOT copy the `referrer: document.referrer` pattern from `widget-host.js:95`), raw UA, fingerprint fields, IP.
3. No new client identifier minted/persisted beyond a `pv_`-prefixed `sessionStorage` value; `_ga` read-only; NO cookie writes, NO `localStorage` (keeps MyRecruiter out of cookie-setting-vendor classification on tenant sites).
4. **`dub_id` MUST NOT be captured** anywhere (it joins our sessions to Dub click logs).
5. Throttle once per (pathname, session); hard cap 100/session; processor tolerates duplicates idempotently.
6. **No IP at rest:** `Analytics_Event_Processor` must not enrich any event with source IP; no geo-IP in v1 (country splits come only from Dub aggregates).
7. PAGE_VIEW rows carry the session-events table's existing 90-d TTL; raw S3 events stay under the 30-d lifecycle; aggregates = counts only (no ga_client_id/session_id/path below tenant×month×channel×entry-point).
8. PAGE_VIEW rows use the same key shape `_walk_session_events` (DSAR walker) already walks; ga_client_id-only pre-chat rows are TTL-bounded-unreachable with the inventory row documenting the 90-d justification (mirrors §C G-K deferral).
9. Per-tenant kill switch `feature_flags.REACH_PING` (default ON), all emission through one function (future consent/GPC choke point).
10. New code paths never log full event payloads at info level — IDs and counts only.
11. Provenance stores IDs not labels; registry join at aggregation/read; website-channel `campaign` inline ≤128 chars.
12. `channel` closed enum; `entry_point_id` validated `^ep_[0-9A-Za-z]{8,64}$`; minted ids must exist in registry.
13. Mint taxonomy guardrails: length caps, reject `@`, "never name an individual" guidance — small-n re-identification is controlled at mint time, not just display time.
14. Registry holds **no person fields**; adding any (e.g. `created_by`) = PII-shape change → Living-Inventory rule + reclassification.
15. Mint destination allow-list (C4 v1 form).
16. Poll `GET /analytics` only; `/events` never (even if tier permits) without a fresh advisory.
17. Persisted poll output schema exhaustive (C4); country max granularity; no referer persistence.
18. Outbound to Dub = config only; no consumer identifier ever.
19. Living-Inventory rule: each implementation PR adding/changing a PII surface updates `docs/roadmap/PII-Project/pii-inventory.md` in the same PR (rows pre-drafted by the advisor; integrator applies via glue).

Parallel-track (NOT build-blocking; gate prod enablement of F2): tenant notice-language template + Dub DPA/subprocessor verification (→ privacy-data-governance-advisor); GPC/CMP configurability decision; MSA scope check (attorney, recommended). Tracked in kanban.

---

## Out of scope for Wave 1 (do NOT build)

Messenger `ref`/`messaging_referrals` capture (Phase 2) · LLM topics/narrative (Phase 2, ai-governance-gated) · Dub conversion tracking (Business tier — parked) · dashboard UI surfaces (Wave 2) · CSV export · GA integration (rejected) · dollars anywhere (locked decision #5) · prod anything (staging-first SOP) · repoint UI · `created_by`/audit person fields.

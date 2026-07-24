# Messenger / Instagram Analytics & Attribution Parity

> **Goal (Chris, 2026-07-24):** "We have to be able to get rich conversation, form and attribution data, just like we get through the chat widget, but through Messenger and Instagram. We need to put everything else on hold and solve that problem."
>
> **Status:** PLANNED — decisions D1–D4 approved by Chris 2026-07-24. Committed scope = **P0→P2**; P3/P4 specified below but gated on a reassessment after P2 ships.
>
> **Tech-lead review 2026-07-24: GO-WITH-CHANGES** — sequencing/scope/blast-radius confirmed sound (verified: P0–P2 structurally cannot degrade the widget's working pipeline); 3 REQUIRED changes folded into this revision: (1) `step_number` mechanism pinned to an atomic-ADD C4 counter (the derive-from-history option was refuted at the `MESSAGE_SENT` emit site), (2) DLQ depth alarm added to P0, (3) the prod-queue fallback fix promoted to a hard P0 exit criterion.
>
> **Everything else on hold** behind this program: the V5 CTA repeat-loop dedup fix, `messenger_label` truncation fix, ice breakers, vertical CTA layout (see §8).

All code citations are `@58adc31` (lambda repo `origin/main`, includes lambda#477) unless marked otherwise. Fact base was produced by three mapping passes **plus an adversarial re-audit (2026-07-24) that refuted five claims from the first passes** — only audit-surviving facts appear below. Live-state claims were verified against staging (525) on 2026-07-24 and MUST be re-verified before implementation (snapshot, not guarantee).

---

## 0. Context — how we found this

While evaluating ice breakers vs welcome action-chips for the Messenger channel, the question "will ice breakers lose us attribution?" led to the discovery that **the Messenger channel is analytically dark end-to-end**:

- `Meta_Response_Processor` (MRP) emits only 3 event types (`MESSENGER_MESSAGE_RECEIVED` / `MESSENGER_RESPONSE_SENT` / `MESSENGER_ESCALATED`) that **no reader recognizes**, with an envelope that **omits `tenant_hash`**.
- Live staging: MRP sends succeed to SQS, then **every event fails in `Analytics_Event_Processor`** (S3 `AccessDenied` reading the mappings bucket) → retry ×3 → DLQ. **91 messages in `picasso-analytics-events-staging-dlq`**; **0 `MESSENGER_*` rows have ever reached `picasso-session-events`** (0 of 26,905 scanned).
- No `CONVERSATION_STARTED`, no chip/CTA clicks, no form funnel, no summary rows → Messenger appears in **no** dashboard: not conversation volume, not Recent Conversations, not form funnels, not attribution.

A conversation that isn't tracked can't prove ROI. This program makes Messenger/IG conversations first-class citizens of the existing analytics machinery — by **speaking its language**, not by building a parallel one.

## 1. Verified fact base

### 1.1 The four dashboard stores (parity = feeding all four)

| Store | Written by (today) | Powers |
|---|---|---|
| `picasso-session-summaries` | chat-path writers only: MFS `analytics_writer.py` + BSH `analytics_writer.js` (contract-pinned, direct DDB) | Conversation volume / heatmap / trend (`ADA lambda_function.py:5837,6092`) **and gates the sessions list** — `handle_sessions_list` is summaries-first (`:6533-6540`), events only enrich (`:6248-6302`) |
| `picasso-session-events` | SQS `picasso-analytics-events-staging` → `Analytics_Event_Processor` | Form funnel (`:2711-2717`), bottlenecks (`:2872-2877`), session detail/outcomes (`:6354-6421`) |
| `picasso-attribution-aggregates` | `Attribution_Aggregator` (hourly EventBridge rule `attribution-aggregator-hourly`, **ENABLED**) rolling up session-events | Attribution summary / channels / entry-points (`attribution_api.py:442,577,643`) |
| `picasso-form-submissions` | MFS `form_handler.py` (Messenger forms already reach it via MRP→MFS invoke; TTL 365d) | `/forms/submissions` list (`ADA:3315+`) |

### 1.2 What readers key on (canonical event vocabulary)

- **Attribution_Aggregator `_compute_session_metrics`** (`lambda_function.py:327-488`): `CONVERSATION_STARTED` (`:383-399`), `MESSAGE_SENT` + `USER_MESSAGE` (`:404-416`), ENGAGED = {`CTA_CLICKED`,`LINK_CLICKED`,`FORM_VIEWED`} (`:66,:419`), `FORM_STARTED`→application (`:425`), `FORM_COMPLETED`→lead (`:429`), `ACTION_CHIP_CLICKED` + `SCHEDULING_*` (`:435-437`), `LINK_CLICKED`→resource clicks (`:443-447`).
- **ADA form funnel**: `FORM_VIEWED/STARTED/COMPLETED/ABANDONED` (`:2711-2717`; abandoned partly derived `started−completed`), bottlenecks add `FORM_FIELD_SUBMITTED` (`:2872-2877`).
- **ADA session detail / sessions list**: `MESSAGE_SENT/RECEIVED`, outcome ladder `FORM_COMPLETED > LINK_CLICKED > CTA_CLICKED` (`:6406-6421`, `:6296-6302`).
- **No reader anywhere matches `MESSENGER_*`.** The processor itself has **no event-type allowlist** (`Analytics_Event_Processor:207-209` warn-only) — canonical names from a new emitter flow through unchanged.

### 1.3 Channel + entry-point model (already exists; partially)

- Channel resolution (`Attribution_Aggregator:496-515`): valid `ep_` registry hit → registry channel (`standalone`/`campaign`) wins; unresolvable `ep_` → `website`; **`elif session_id.startswith('meta:') → 'messenger'`** (`:511-513`); else `website`. `VALID_CHANNELS = {website, messenger, standalone, campaign}` (`attribution_api.py:64`).
- The `meta:` branch is **dead code today** (0 `meta:` rows have ever persisted). Live `attribution_channel#…#messenger` aggregate rows are **demo-zone seeder artifacts** (BRI071351), not pipeline output.
- **`instagram` is not a channel anywhere**; IG sessions share the `meta:` session-id prefix and would roll up as `messenger`.
- **Web entry-point attribution is REAL** (adversarial audit overturned the "null in practice" claim): `widget-host.js:99-105` reads `?ep=` from the landing URL (`^ep_[0-9A-Za-z]{8,64}$`) → attribution blob (`:124`) → iframe (`PICASSO_INIT :700-707`) → `CONVERSATION_STARTED` (`StreamingChatProvider.jsx:679`) → processor hoists `entry_point_id` (`:284-288`) → aggregator resolves it against `picasso-entry-points` (registry minted by `Attribution_Mint_Service`, `ep_` + ULID, Dub short link/QR carrying `?ep=`). Entry-point parity is therefore a real target (P4), with `m.me` `ref=` as the Messenger analogue.

### 1.4 MRP's current emission (the gap)

- Three emit sites: `MESSENGER_MESSAGE_RECEIVED` (`index.js:1595`), `MESSENGER_RESPONSE_SENT` (`:3161`), `MESSENGER_ESCALATED` (`:830`). Envelope (`:223-243`): `{schema_version:'1.0', session_id, tenant_id, timestamp, event:{type,payload}}` — **no `tenant_hash`, no `step_number`**; `tenant_id` carries the RESOLVED id (`MYR384719`), which downstream expects in the *hash* slot for GSI keying.
- `tenantHash` is already in scope at both main emit sites (destructured `:1564`); `handleEscalation` (`:754-764`) lacks it — thread one param through its 4 call sites (`:1795,1925,2032,2126`).
- Session id: `lockSessionId = meta:{pageId}:{psid}` (`:1622`) — stable per user↔page pair, channel-agnostic. `channelType ∈ {messenger, instagram}` (`:1565`).
- ⚠️ Queue-URL fallback default is the **prod (614) queue** (`:144-146`) — an unset env var silently cross-posts to prod.

### 1.5 Live staging topology (verified 2026-07-24; re-verify before build)

- MRP + BSH both have `ANALYTICS_QUEUE_URL` = staging queue (the widget per-event pipeline **is live in staging** — 427 real MYR384719 web rows, most recent 2026-07-20). MFS has no SQS path at all (summaries writer only).
- `Analytics_Event_Processor-role` **cannot read `s3://myrecruiter-picasso-staging/mappings/*`** (AccessDenied; missing `s3:ListBucket` turns missing-key 404s into 403s) — the live cause of the Messenger DLQ backlog.
- Queue resource policy: send allowed for exactly {BSH-role, MRP-role} with an **explicit Deny + `StringNotEquals` exception list** — any new emitter must be added to BOTH or its sends fail silently (this exact failure occurred 2026-07-13).
- Staging `mappings/` has 4 objects (hash-keyed, incl. `my87674d777bf9` = MYR384719).
- Of 26,905 session-events rows: 26,478 demo-seeder (BRI071351), 427 real web (MYR384719), 0 Messenger.

## 2. Blockers the implementation MUST solve (adversarial-audit findings)

| # | Blocker | Detail | Solved in |
|---|---|---|---|
| B1 | **`STEP#000` SK collision** | `write_session_event` SK = `STEP#{step_number:03d}` (`:385`), default 0 (`:266`). MRP sends no `step_number` → every event of a session overwrites one row. | P1 (per-session step counter) |
| B2 | **`tenant_hash`-slot corruption** | Fixing only IAM could persist rows with the tenant ID in the hash slot → invisible to the GSI (`tenant-date-index`), the aggregator (`:739-784`), and session-detail authz (`:6370-6373`). Fix at the source: emit the server-side format (BOTH `tenant_hash` + `tenant_id`, already supported `:230-233`). | P1 |
| B3 | **`meta:` colon rejected twice** | Summary writers' `SESSION_ID_RE ^[a-zA-Z0-9_-]{1,128}$` (`analytics_writer.py:26`, `.js:13`) AND session-detail endpoint regex (`ADA:6346`) both reject colons. Consequence today: even successful Messenger form submissions have their MFS-side `FORM_COMPLETED` summary write silently dropped (`form_handler.py:465-476`). | P3 (one decision covers both) |
| B4 | Processor IAM S3 read | AccessDenied → exception → DLQ (not the clean mapping-miss drop). | P0 |
| B5 | Prod-queue fallback default | `index.js:144-146`. | P0 |
| B6 | 91-message DLQ backlog | Mostly pre-fix Messenger events; replay is pointless before B1/B2 fixes (they'd collide/corrupt). | P0 (purge, documented) |

## 3. Decisions (locked with Chris, 2026-07-24)

| # | Decision | Resolution |
|---|---|---|
| D1 | Event vocabulary | **Canonical names** — Messenger emits the same event types the widget does (`CONVERSATION_STARTED`, `MESSAGE_SENT`, `FORM_*`, `CTA_CLICKED`, `ACTION_CHIP_CLICKED`, …). Channel is data (`meta:` prefix + `channel_type` payload field), not a name prefix. The `MESSENGER_*` vocabulary is retired (except `MESSENGER_ESCALATED`, which has no widget analogue — kept as-is, renamed only if a reader ever wants it). |
| D2 | Entry-point attribution | **Real parity, deferred to P4** — mint registry entry points for Messenger surfaces (`m.me` ref / per-chip refs) after P1–P3 land. Not faked earlier; not skipped. |
| D3 | Instagram | **Split into its own channel** (aggregator branch + `VALID_CHANNELS` + carrying `channel_type` in events) — in P4. Until then IG rolls up as `messenger` (documented limitation). |
| D4 | Committed scope | **P0→P2 now**; P3 (summaries lane / contract-touching) and P4 (IG + entry points) reassessed after P2 data flows. |

## 4. Phases

### P0 — Infra prerequisites (Terraform + ops; no MRP code)

- **Scope:** make the ingestion path physically able to deliver.
- **OWN:** `infra/` module for the `Analytics_Event_Processor` role grant; DLQ runbook note.
- **Work items:**
  1. Grant `Analytics_Event_Processor-role` `s3:GetObject` on `arn:aws:s3:::myrecruiter-picasso-staging/mappings/*` + `s3:ListBucket` on the bucket (ListBucket is what turns 403→404 so the code's NoSuchKey branch works as designed). Terraform, staging belt, plan→apply per SOP.
  2. **Purge the staging DLQ** — mechanism, explicitly: (a) receive+inspect a sample, document counts; (b) export the full backlog to an S3 scratch prefix (belt-and-suspenders retention); (c) THEN `sqs purge-queue` (instant, all-or-nothing, rate-limited 1/60s). The messages are unreplayable pre-B1/B2 by design — record that rationale in the PR. Dry-run-before-destroy rule applies.
  3. **[HARD EXIT CRITERION]** Fix MRP's queue-URL fallback: default to **unset ⇒ skip emission with a WARN**, never the prod queue (`index.js:144-146`). This is a cross-account-leak safety fix, not a convenience — P0 does not close without it (own test: unset env ⇒ no SQS send + WARN logged).
  4. **DLQ depth alarm** (tech-lead REQUIRED): `aws_cloudwatch_metric_alarm` on `picasso-analytics-events-staging-dlq` `ApproximateNumberOfMessagesVisible > 0` → `picasso-ops-alerts` SNS (reuse the `ops-alarms-meta-staging` module pattern). The original 91-message backlog accumulated silently for an unknown period — P0 without this alarm repeats the failure mode it fixes.
- **DONE:** a synthetic canonical event hand-sent to the staging queue (with `tenant_hash: my87674d777bf9`) lands as a `picasso-session-events` row; DLQ = 0 and stays 0 during a Messenger test turn; the fallback test passes; the DLQ alarm exists and fires on a test message.

### P1 — Correct ingestion + CONVERSATION_STARTED (MRP)

- **Scope:** every Messenger analytics event persists correctly and attribution's `meta:`→`messenger` branch comes alive.
- **OWN:** `Meta_Response_Processor/index.js` (emission layer only — no pipeline behavior changes).
- **CONSUME (frozen):** processor server-side format (`:230-233`); SK scheme `STEP#{n:03d}`; aggregator channel branch (`:511-513`).
- **Work items:**
  1. **Envelope**: emit BOTH `tenant_hash` (raw hash, for GSI keying) and `tenant_id` (resolved) on every event; thread `tenantHash` into `handleEscalation` (4 call sites).
  2. **`step_number`**: per-session monotonic counter — **PINNED (tech-lead REQUIRED): atomic `ADD` on a new C4 `step_counter` stateType** (same pattern as the existing M-Hb `counters` stateType, `docs/messenger/CONTRACTS.md:186`), incremented via `UpdateItem ADD` at each emit site. The alternative ("derive from the recent-messages count loaded per turn") is **refuted**: the `MESSAGE_SENT` emit (`:1595`) fires pre-lock and pre-history-load — there is no per-turn count in scope there — and within a turn both emits would read the same pre-turn count and collide (exactly B1). Note: atomicity comes from DynamoDB `ADD`, NOT from the C7 lock — the lock does not cover the `:1595` site.
  3. **Canonical renames**: `MESSENGER_MESSAGE_RECEIVED` → `MESSAGE_SENT` (user turn; note the widget's naming is user-centric: SENT = user sent), `MESSENGER_RESPONSE_SENT` → `MESSAGE_RECEIVED` (bot reply, carry `response_time_ms` if cheaply available). Payloads keep `channel_type`, `page_id`, `psid`; keep lengths-only discipline (no content).
  4. **`CONVERSATION_STARTED`**: emit at BOTH first-contact hooks — the GET_STARTED handler (after successful welcome send, `~:2967`) and the session-first-turn path (`sessionWindow.isSessionFirstTurn`, `~:3108`, covers IG/typed-first). Both hooks are required — the GET_STARTED branch early-returns and never reaches the session-window code (tech-lead verified). Payload: `{channel_type, entry_source: 'get_started'|'ice_breaker'|'typed'|'chip', entry_id?: chipRoute.key|resolved.ctaId, attribution: null}` (attribution object reserved for P4 ref-links). Guard against double-fire (GET_STARTED stores history → the typed-path gate stays false afterwards — verify with a test).
  5. **Double-fire race hardening** (tech-lead SUGGESTED, adopted): `loadConversationContext`'s Query (`:338-346`) is eventually consistent — a message coalescing/draining in the consistency window right after the GET_STARTED write could see empty history and re-fire `CONVERSATION_STARTED` (same pre-existing race as the disclosure line, but now it corrupts an attribution metric). Fix: `ConsistentRead: true` on that one Query (single extra RCU) + a coalesced-drain-race test.
- **Tests:** jest — envelope shape (both tenant fields), step monotonicity across a multi-turn session, both CONVERSATION_STARTED hooks + no-double-fire, escalation event carries tenant_hash.
- **DONE (falsifiable):** one live staging Messenger conversation (MYR384719) produces ≥3 distinct-SK rows in `picasso-session-events` with `tenant_hash=my87674d777bf9`; after the next hourly aggregate, `attribution_channel#{month}#messenger` for MYR384719 shows conversations ≥ 1 **from pipeline data** (distinguish from seeder rows: MYR tenant, not BRI).

### P2 — Engagement + form funnel (MRP)

- **Scope:** the events that make Messenger sessions *rich* — engaged/lead/application classification, form funnel, chip attribution.
- **OWN:** `Meta_Response_Processor/index.js` emission at the mapped hook points (below); no formEngine/schedulingDriver signature changes needed except where noted.
- **Emission map** (hooks verified `@58adc31`):

| Event | Hook | In scope |
|---|---|---|
| `ACTION_CHIP_CLICKED` | PIC1 chip branch (`:2682-2690`) | `chipRoute.key`, label via config |
| `CTA_CLICKED` | PIC1 CTA branch (`:2694-2719`) | `resolved.ctaId`, `cta.action` |
| `FORM_VIEWED` + `FORM_STARTED` | after `beginForm` send (`:2731` caller) | `startFormId`, first field |
| `FORM_FIELD_SUBMITTED` | field-advance in `advanceFormSession` (`:2371-2389`) | `form_id`, `current_field` |
| `FORM_COMPLETED` (events-table) | submit-success (`:2321-2332`; MFS already writes `picasso-form-submissions`) | `form_id` |
| `FORM_ABANDONED` | cancel (`:2303-2311`) + ineligible (`:2373-2381`) | `form_id`, `reason` |
| `SCHEDULING_STARTED` / booking events | `beginScheduling` (`:2779`) + committed turn (`:2464`) | apptTypeId, bookingId |

- Payload field names mirror the widget's exactly (e.g. `{chip_id, chip_label, chip_action}`, `{cta_id, cta_label, cta_action}`, `{form_id, field_id, field_index}`) — same readers, same shapes. Field IDs only, never values (PII discipline).
- **Tests:** per-event emission tests at each hook (extend the existing handler test suites); a full synthetic conversation fixture asserting the expected event sequence.
- **DONE (falsifiable):** a scripted staging conversation (chip tap → form start → 2 fields → complete) yields: aggregator marks the session engaged + application + lead; ADA form-funnel endpoint for MYR384719 counts the form; session-detail outcome ladder shows `form_completed`.

### P3 — Summaries lane (GATED: reassess after P2)

- **Scope:** conversation volume / heatmap / trend + Recent Conversations list + session detail for Messenger sessions.
- **The colon decision (single decision, three consumers):** keep `meta:{pageId}:{psid}` and relax the two regexes (summary writers `SESSION_ID_RE`; ADA session-detail `:6346`), OR adopt a colon-free analytics session id. **Leaning: relax the regexes** — the `meta:` prefix is load-bearing for the aggregator's channel branch and changing the id scheme risks divergence with the C4/C7 state tables that key on it. Decide at P3 kickoff with fresh eyes on P1/P2 data.
- **Regex scoping (tech-lead, pre-committed):** if the regexes are relaxed, the relaxation is NARROW — e.g. `^meta:[^:]+:[^:]+$` OR the existing `^[a-zA-Z0-9_-]{1,128}$` — never a generic loosening. This code is shared with the widget's own summary writers; contract fixtures MUST include both an old-shape widget id and the new Messenger colon-shape.
- **Work items:** extend the **contract** (`analytics_writer_contract.json`) + both writers for the relaxed session-id rule; add a Messenger summary path — either MRP calls a summary-writer equivalent directly (preferred: a small JS port of the contract shape, own PR + contract fixtures) or extend `SUPPORTED_EVENT_TYPES`; unblock the MFS `FORM_COMPLETED` summary write for `meta:` ids (currently regex-dropped, `form_handler.py:465-476`).
- **Contract discipline:** any writer change lands with fixture tests in BOTH repos' copies (analytics_writer_contract pattern; forward-compatible reads per CLAUDE.md schema discipline).
- **DONE:** Messenger conversation appears in Recent Conversations and `/conversations/summary` counts it; session-detail renders for a `meta:` session.

### P4 — Instagram split + entry-point parity (GATED: reassess after P2/P3)

- **IG channel:** carry `channel_type` in events (done in P1 payloads); aggregator maps `channel_type=='instagram'` → `instagram` (replacing the blanket `meta:`→messenger at `:511-513` with a payload-aware branch); add `instagram` to `VALID_CHANNELS` (`attribution_api.py:64`); dashboard UI pickup.
- **Entry points:** mint registry entry points for Messenger surfaces (`POST /attribution/entry-points`); distribute as `m.me/<page>?ref=ep_…` links/QRs; MRP reads the `ref` param (arrives on GET_STARTED postback + messaging referral webhooks) into `CONVERSATION_STARTED.attribution.entry_point_id`. Reconcile the registry-channel-wins shadowing (`:498-503`) so a Messenger session with an ep still reports usefully (likely: keep registry channel for entry-point rows, session channel for channel rows — decide with data).
- **DONE:** IG and FB sessions appear as distinct channels; a test `m.me` ref link produces an entry-point attribution row tied to its registry record.

## 5. Cross-cutting rules

- **Queue resource policy:** MRP is already allowlisted (send). If ANY new emitter is added (e.g., a P3 summary writer path via SQS — not currently planned), it must be added to the Allow AND the explicit Deny's `StringNotEquals` exception, or sends fail silently (2026-07-13 incident class).
- **PII:** all payloads carry ids/lengths/labels only — never message content, never form field VALUES. This matches the widget's discipline. New event emission to the existing analytics stores adds no new PII surface, but P3's contract change and P4's ref-link capture get a `pii-data-lifecycle-advisor` pass before merge (analytics + identifier flows trigger review per CLAUDE.md).
- **Schema discipline:** all readers already tolerate missing fields; new payload fields are additive; contract/fixture tests accompany any stored-shape change.
- **Staging-first, prod untouched.** The entire program lands in staging (525). Prod promotion is a separate gated decision — and note: prod's IAM/regex/DLQ state is **unverified**, not merely un-audited; do not assume prod shares (or lacks) any of the staging defects named here.

## 6. Staging verification realities (so E2E checks don't lie)

- **Filter by tenant**: 26,478 of the session-events rows are demo-seeder (BRI071351). All verification queries key on MYR384719 / `my87674d777bf9` + time window.
- **The hourly `Attribution_Aggregator` is ENABLED** — it will re-aggregate whatever we write (and keeps touching seeder months). Don't "fix" seeder data mid-test; demo-zone memory says the seeded aggregates are load-bearing for demos.
- **Staging widget builds suppress per-event `MESSAGE_*`** (`if (!__IS_STAGING__)`) — so Messenger-vs-widget comparisons in staging use `CONVERSATION_STARTED`/CTA/FORM events, not message counts.
- The audit's live-state findings (env vars, IAM, DLQ count, policy shape) are a 2026-07-24 snapshot — **re-verify each at phase start**.

## 7. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Canonical `MESSAGE_SENT/RECEIVED` semantics inverted (widget: SENT=user, RECEIVED=bot) | **RESOLVED (tech-lead verified 2026-07-24):** the direction in P1.3 is CORRECT — aggregator treats `MESSAGE_SENT` as the user-message proxy (`:404-416`, comment says so verbatim), ADA counts SENT=user/RECEIVED=bot (`:6405-6410`), widget emits `MESSAGE_SENT` when the USER's message posts (`StreamingChatProvider.jsx:668`). The vocabulary is user-centric. Do NOT "fix" this into an actual inversion — tests + emit-site comments assert it |
| R2 | step-counter races under C7 message coalescing | Atomicity comes from DynamoDB `UpdateItem ADD` on the C4 `step_counter` row — NOT from the C7 lock (the `MESSAGE_SENT` emit at `:1595` runs pre-lock; the original "lock serializes it" mitigation was wrong) |
| R3 | CONVERSATION_STARTED double-fire (GET_STARTED + first typed turn) | Explicit test; GET_STARTED-stored history makes `isSessionFirstTurn` false afterwards; residual eventual-consistency window closed by P1.5 (`ConsistentRead: true`) |
| R4 | P3 contract change breaks widget writers | Two-repo fixture tests (contract pattern); wholesale-replace discipline unchanged |
| R5 | Registry-channel shadowing makes P4 ep-attribution steal sessions from the `messenger` channel row | Resolve in P4 design (see §4-P4); acceptable pre-P4 because no Messenger eps exist |
| R6 | DLQ purge loses data someone wanted | Purge PR documents counts + a sampled export to S3 scratch first |
| R7 | Prod queue cross-post via fallback default | P0 item 3 removes the default |

## 8. On-hold work this program supersedes or precedes

| Item | Status | Note |
|---|---|---|
| V5 CTA repeat-loop (no server-side dedup; widget masks it client-side) | ON HOLD | Real bug; resume after P2. Verified: neither BSH nor MRP dedups; widget hides repeats (`MessageBubble.jsx:501-510`, `CTAButton.jsx:180-183`) |
| `messenger_label` (≤20) short labels on `cta_definitions` | ON HOLD | Kills truncation (10 of 14 MYR CTAs >20 chars); independent of this program |
| Ice breakers (native welcome starters) | ON HOLD | Analytics-neutral vs welcome chips (both route `PIC1:chip:{key}`); P2's `ACTION_CHIP_CLICKED` covers both surfaces identically |
| Welcome chips on GET_STARTED greeting (lambda#477, shipped) | LIVE in staging | May later be superseded by ice breakers; its `PIC1:chip` routing is what P2 click events key on |
| Vertical CTA layout (button templates ≤3) | ON HOLD | Requires the dedup fix first (persistent buttons + repeats = worse) |

## 9. References

- Adversarial audit + three mapping passes: session transcripts 2026-07-24 (fact base reproduced above with citations).
- Widget emission sites: `Picasso/src/widget-host.js`, `iframe-main.jsx`, `context/{StreamingChatProvider,FormModeContext}.jsx`, `components/chat/{MessageBubble,CTAButton,WelcomeView}.jsx`, `analytics/eventConstants.js`.
- Lambda repo (`@58adc31`): `Meta_Response_Processor/`, `Analytics_Event_Processor/lambda_function.py`, `Attribution_Aggregator/lambda_function.py`, `Analytics_Dashboard_API/{lambda_function.py,attribution_api.py}`, `Attribution_Mint_Service/`, `Master_Function_Staging/analytics_writer.py` + `analytics_writer_contract.json`, `Bedrock_Streaming_Handler_Staging/analytics_writer.js`.
- Related programs: [`MESSENGER_PRODUCT_SURFACE.md`](MESSENGER_PRODUCT_SURFACE.md), [`MESSENGER_CHANNEL_EXPERIENCE.md`](MESSENGER_CHANNEL_EXPERIENCE.md), [`MESSENGER_APP_REVIEW_SUBMISSION_NARRATIVE.md`](MESSENGER_APP_REVIEW_SUBMISSION_NARRATIVE.md).

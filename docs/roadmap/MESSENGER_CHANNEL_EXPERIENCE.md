# Messenger Channel Experience — Program Plan

**Status:** 📋 PLANNED — approved by Chris 2026-07-13 (after tech-lead-reviewer adversarial pass, verdict "approve with changes", all changes applied). Execution not started. First subphase = M0.
**Owner:** Chris Miller
**Vocabulary:** "Messenger" = **Facebook Messenger + Instagram DM together** (Chris, 2026-07-12). Where the two differ, this doc says "FB" / "IG" explicitly.
**Repos:** `Lambdas/lambda` (Meta pipeline, BSH, MFS, Booking_Commit_Handler — PRs to `main`, auto-deploys touched staging functions), picasso repo (`infra/`, this doc — code/IaC PRs to `staging`, docs to `main`), `picasso-config-builder` (config types only in this program — UI is a separate project).
**Standing directive:** adversarial review of EVERY subphase before executing it — re-verify this doc's premises against code (file:line cited throughout; all citations = `origin/main` as of 2026-07-13, lambda repo `43bbdea`), try to refute each mechanism, prefer live empirical repro over inference. If a premise fails, amend this plan instead of executing it.

---

## 1. The goal, in one paragraph

The widget and Messenger must reach the **same outcomes — conversation → CTA → form / booking → staff follow-up — with different tactics** (Chris's framing). The Meta pipeline is as-built and E2E-verified on staging (both channels, KB-grounded, tenant MYR384719, 2026-07-12), but its behavior is hardcoded (prompt, caps, model), it silently drops non-text input (a Meta 30-second-rule violation), its CTAs don't exist, and forms/scheduling/escalation don't exist. This program makes Messenger a first-class, tenant-configurable channel: V5 single-pass brain, native CTA rendering (quick replies / button templates), conversational forms, scheduling, human escalation into the Business Suite inbox, and the channel-health/abuse rails a public unauthenticated surface needs. Gated per tenant by a feature flag; config trees up to Config Builder (types now, UI later).

## 2. As-built baseline (what exists today)

Reference: [`Facebook/meta-messenger-integration.md`](../../Facebook/meta-messenger-integration.md) (as-built architecture + Meta platform mechanics) and the July-2026 platform research pack [`Facebook/messenger-research-2026-07/`](../../Facebook/messenger-research-2026-07/README.md) (4 cited reports: send capabilities, windows/policy, IG DM API, handover/inbox/staff).

- **3 Lambdas, staging account (525), Terraform-managed** (`infra/modules/lambda-meta-staging/`, `ops-alarms-meta-staging/`, `secrets-meta-app-staging/`): `Meta_Webhook_Handler` (Function URL auth NONE, HMAC-SHA256 verify) → **async Lambda Invoke** (NOT SQS; SQS is DLQ + analytics only) → `Meta_Response_Processor` (buffered `InvokeModel` via shared `bedrock-core` RAG core, typing indicator, Send API with 2000-char splitting) . `Meta_OAuth_Handler` writes `picasso-channel-mappings` (PK=`PAGE#{id}`, SK=`CHANNEL#{messenger|instagram}`, holds tenantId/tenantHash/page token/`enabled`).
- Conversation history lives in `picasso-recent-messages` — **the same physical table as live widget chat**, Meta rows namespaced `sessionId = meta:{pageId}:{psid}`.
- E2E verified 2026-07-12: both channels answer KB-grounded questions on staging tenant MYR384719.

## 3. Verified as-is facts (verified 2026-07-12/13 against `origin/main`; re-verify before trusting)

> ⚠️ **Stale-checkout rule:** the operator's local `Lambdas/lambda` checkout has repeatedly lagged `origin/main` (missed lambda#427–#432 + `responsePipeline.js` in the planning session). Every executing session pulls the lambda repo to `origin/main` (or reads via `git show origin/main:…`) before trusting any file:line here.

**The pipeline (lambda repo):**

1. Webhook entry `Meta_Webhook_Handler/index.js:546` → `processMessagingEvent` `:320` → mapping lookup `getChannelMapping` `:174` (skips when `!mapping.enabled` `:383`) → mid-dedup → `invokeResponseProcessor` `:244` (async `InvokeCommand`).
2. **Invoke payload v1** (`:407-416`): `{psid, messageText, pageId, tenantId, tenantHash, channelType, messageMid, isPostback}` — **no `timestamp`, no event typing, no attachment/sticker/edit/delete/echo/standby distinction, no `app_id`**.
3. **Non-text input is silently dropped:** attachment-only messages survive the receipt guard (`:344` requires *both* no-text and no-attachments to skip) but die at the `if (!messageText)` skip (`:364-367`). Reactions/edits/deletes fall into the silent `else` skip (`:359-362`). This violates Meta's **30-second any-input responsiveness rule** (research report 02 §1).
4. **`quick_reply` appears nowhere** in either Lambda — a quick-reply tap's `payload` is never read (its `message.text` still flows as ordinary text).
5. **The 24h window guard is inert:** `Meta_Response_Processor/index.js:712` gates on `event.timestamp`, which the webhook never sends. Only stale-DLQ protection was intended; today neither works.
6. **TTL bug:** processor writes a `ttl` attribute (`:277`, `:290`, `:306`) but the shared `picasso-recent-messages` table's TTL attribute is **`expires_at`** (live-verified 2026-07-12) → **Meta history rows never expire**. (Matches [pii-inventory](PII-Project/pii-inventory.md) seed finding at `:225`.)
7. **Hardcoded behavior:** `buildMessengerPrompt` `:548` = `config.tone_prompt` + a fixed STRICT-RULES string (`:553`: "2-3 short sentences maximum … no markdown …") + KB context; history window `MAX_HISTORY_TURNS = 5` pairs (`:87`, `:562`); model `DEFAULT_MODEL_ID = 'global.anthropic.claude-haiku-4-5-20251001-v1:0'` (`:75`), overridable only via top-level `config.model_id` (`:588`). No V4/V5, no CTAs, no `messenger_behavior` section.
8. **IG typing indicator is a no-op** (`:405` — endpoint not supported for IG; typing sent only for messenger `:412`, refreshed every 8s `:829`). **Send splitting is FB-sized only:** `sendResponseMessages` `:521` splits at 2000 chars; **IG's cap is 1000** (research report 03 §1).
9. **Deploy filter is dir-only** for the Meta functions (`.github/workflows/deploy-staging.yml:137-139`; matrix rows `:510`, `:527`) — a `shared/`-only change does **not** auto-redeploy them (same known gap as the shared/scheduling bundlers, documented inline in that workflow).

**The V5 machinery to reuse (BSH, lambda repo):**

10. `prompt_v5.js`: `V5_TURN_PROMPT_VERSION = 'v5-turn.v3'` (`:62`); `buildActionCatalogBlock` (`:83`, from `ai_available` CTAs); `TURN_CHECK_QUESTION_THRESHOLD = 2` (`:119`) + `buildTurnCheckBlock` (`:127`, counts assistant messages ending in "?" over the **whole passed history** — hence the session-boundary contract, §5 C8); `buildActionTailInstruction` (`:138`); `buildV5TurnPrompt` (`:156`, splices at `USER_MESSAGE_MARKER` `:74`, throws if absent `:166`); `validateActionIds` (`:191`, filters to known CTA ids, cap 4). All pure functions.
11. `streamTail.js`: `createTailParser` (`:113`) is **chunking-invariant** — `feed(entireBufferedResponse)` + `end()` is a valid parse, so the buffered Meta processor needs none of BSH's streaming complexity. Fallback ladder precedent: valid tail → `validateActionIds`; malformed → one `selectActionsV4` call (`prompt_v4.js:979`) → no buttons.
12. BSH gates V5 via `config.feature_flags.V5_SINGLE_PASS` (`index.js:855`, `:1273`). `prompt_v5.js` requires `buildV4ConversationPrompt` (`prompt_v4.js:72`) + `intentLabel` (`:967`) — the lift unit is the **trio** `prompt_v5.js + prompt_v4.js + streamTail.js`.

**Reuse surfaces for forms + scheduling (lambda repo):**

13. **Forms:** the widget's live lane is `?action=chat` with body `{form_mode: true, action: 'submit_form', …}` → `Master_Function_Staging/lambda_function.py:877` routes to `FormHandler.handle_form_submission` (`form_handler.py:224`) — validation, fulfillment (email/SMS/webhook/S3), audit. The separate `action=form_submission` dispatch (`lambda_function.py:1278`) is **unreachable from the widget lane and unproven — do not build on it**.
14. **Scheduling:** `Booking_Commit_Handler/index.js` routes by `event.action`: `scheduling_mutate` `:606`, `scheduling_propose` `:623`, `attach_prep_note` `:639`, **default (no action) = the commit path — there is no `'scheduling_commit'` action string**. `shared/scheduling/` provides `phone.js`, `consent.js`, `notify.js`, `reschedule.js`, `cancel.js`, `slots.js`, etc. BSH's scheduling *chat orchestration* is SSE/widget-coupled — **not reused**.

**Config Builder (CB repo):**

15. `src/types/config.ts`: `ChannelConnection` `:621`, `InstagramChannelConnection` `:629`, `ChannelsConfig` `:637`, wired at `TenantConfig.channels` `:698` — this section is **OAuth-connection state written by Meta_OAuth_Handler**, which is why behavior config gets its own key (§4 D1).
16. `src/components/settings/ChannelsSettings.tsx:54`: `CHANNELS_API_URL` falls back to a **hardcoded prod OAuth Lambda URL** when `VITE_CHANNELS_API_URL` is unset — a staging build can hit prod (G6 risk row, §9; owned by the separate CB project).

**Platform ground truth** (July 2026, all cited in the [research pack](../../Facebook/messenger-research-2026-07/README.md)): 30-second any-input rule; bot disclosure required (CA/Germany, recommended universally); message tags CONFIRMED_EVENT_UPDATE/ACCOUNT_UPDATE/POST_PURCHASE_UPDATE dead Apr 27 2026; HUMAN_AGENT = 7-day App-Review-gated lane; **IG has NO post-window re-engagement lane in the US**; quick replies 13 × 20-char, transient, arrive as `messages` with `quick_reply.payload` (NOT postbacks); button template ≤3 buttons; carousel ≤10; ice breakers ≤4 + persistent menu alive on BOTH channels (pushed via Messenger Profile API; a menu tap opens a fresh 24h window); IG 1000-char cap, no `user_email` quick reply, inbound gifs/stickers fire no webhook; `is_deleted` ⇒ Meta terms **require deleting stored copies**; Handover Protocol retired (Sept–Oct 2025) → **Conversation Routing** (default app + `pass_thread_control` to inbox app IDs FB `263902037430900` / IG `1217981644879628`; staff reply auto-takes thread; 24h thread-control idle expiry); echo detection `is_echo && app_id !== ours`; Standard Access = role-holders only, Advanced Access = App Review + Business Verification + demonstrable human-escalation path; sticker webhook migration Aug 30 2026; Meta Business Agent (Jun 2026) = double-responder hazard.

## 4. Design decisions (made; re-litigate only with evidence)

- **D1 — Behavior config key is top-level `messenger_behavior`, NOT `channels.messenger`.** `channels.*` is OAuth-written connection state (fact 15); two writers on one key is clobber risk. **Three-gate hierarchy:** DDB `picasso-channel-mappings.enabled` (connection, per page+channel) → `feature_flags.MESSENGER_CHANNEL` (tenant behavior gate; name finalized in M0) → `messenger_behavior` (tuning: tone override, disclosure line, per-channel overrides, toggles). **Authority rule: the DDB `enabled` field is runtime-authoritative** (it is what the webhook consults, fact 1); any `enabled` mirror inside S3 config is display-only for Config Builder, no sync guaranteed, and **no runtime code may ever read the S3 mirror for gating**.
- **D2 — Invoke payload v2 frozen ONCE in M0; additive-only; webhook deploys first.** Typed event kinds (`text|postback|quick_reply|attachment|sticker|edit|delete|echo|standby|unsupported`) + `timestamp` + `quick_reply.payload` + `app_id`. v1 fields keep their exact names/shapes. This is the rule that makes split PRs safe across two independently-deployed Lambdas.
- **D3 — V5 single-pass is the Messenger brain.** Lift the trio (fact 12) to `Lambdas/lambda/shared/prompt/` (esbuild `bundle:true` relative-import pattern proven by `bedrock-core`); Meta processor parses the ACTIONS tail from its buffered response (fact 11). Messenger keeps its own short-form base prompt; V5 catalog/turn-check/tail blocks are spliced in. V4.0/V4.1/V3.5 are never ported to Messenger.
- **D4 — CTA rendering map** (frozen as M0 contract C9): `send_query`/LEARN-intent → quick replies (transient suggestion); `external_link`/`start_form`/commitment-intent → button template `web_url` buttons (persistent); `start_form` link-out is the interim until M7. **Free-text fallback is a frozen principle:** every tap flow must also accept the equivalent typed text (quick replies are skippable and vanish after the next message).
- **D5 — Escalation** = `pass_thread_control` to the Meta inbox app IDs + **SES email to staff (v1 — per Chris; SMS notify is a §10 non-goal)** + echo-watch pause as belt-and-suspenders. Conversation Routing model throughout (no Handover-era APIs).
- **D6 — Forms reuse; scheduling reuse.** Forms: `conversational_forms` config + direct Lambda invoke to MFS shaped like the proven widget live lane (fact 13). Scheduling: Booking_Commit_Handler actions (fact 14); commit = the default/no-action path.
- **D7 — One new DynamoDB table `picasso-conversation-state`** (bare name per naming convention; PK `sessionId`, SK `stateType`, **TTL on `expires_at`** — learning from fact 6). Schema frozen M0 (C4); provisioned M1c (first consumers: serialization lock, then escalation pause flag M6a, form sessions M7a, scheduling sessions M8a).
- **D8 — Compliance is Phase-1 work, not polish.** Facts 3, 5, 6 are live policy/hygiene violations; M1a/M1b go first and are framed as fixes, not features.
- **D9 — Reminder rail = existing SMS (Telnyx) on both channels.** FB utility templates optional later (§10); **IG has no post-window lane in the US — hard constraint: IG bookings must capture a phone number** (M8a).
- **D10 — All user-facing strings** (disclosure line, unsupported-input fallbacks, form prompts, escalation confirmations) live in `messenger_behavior` config from day one, so the approved Spanish-i18n program localizes by config, not re-plumbing (G8).

## 5. Frozen contracts (all authored + frozen in M0 → `Lambdas/lambda/docs/messenger/CONTRACTS.md`)

| # | Contract | Consumed by |
|---|---|---|
| C1 | **Invoke payload v2** — typed event kinds, timestamp, quick_reply.payload, app_id; additive-only; webhook-deploys-first rule | M1a (implements), M1b, M3b, M4, M6b, M-Ha |
| C2 | **`messenger_behavior` config section** + 3-gate hierarchy + DDB-authoritative rule + all-strings-config-driven (D10) | M1b, M3a, M5, M6a |
| C3 | **Structured payload namespace** — versioned postback/quick-reply payload format (`GET_STARTED` and unknown-payload→RAG preserved) | M4, M5, M7a |
| C4 | **`picasso-conversation-state` schema** — PK `sessionId`, SK `stateType`, TTL `expires_at`; row shapes for lock, pause, form-session, scheduling-session | M1c, M6a, M7a, M8a |
| C5 | **Capability map** — per-channel caps: message chars (FB 2000 / IG 1000) **and, distinctly, quick-reply title chars (20) + count (13)**, button template ≤3, carousel ≤10, feature availability (email QR FB-only, typing FB-only, …) | M1b, M3a, M4 |
| C6 | **Prompt precedence** — base short-form ← `messenger_behavior` overrides ← per-channel overrides; relationship to `tone_prompt` | M3a |
| C7 | **Per-conversation serialization strategy** (G2) — lock vs coalesce for parallel async invokes on one `sessionId` | M1c (implements), M7a |
| C8 | **Session-boundary definition** (G4) — >24h gap ⇒ new session; TURN-CHECK question counting + sustained-interest evaluation scoped to the current session, never the lifetime thread | M3a, M3b |
| C9 | **CTA rendering map + free-text-fallback principle** (D4) | M4, M7a, M8a |

M0 also lands the **additive config types** (CB repo `src/types/config.ts`) with a forward-compatible reader + old-shape/new-shape fixture tests (Schema Discipline rule, CLAUDE.md).

## 6. Phasing — 18 subphases + 1 milestone, one focused session + one PR each

**Standing rules for every subphase:** staging-only (prod promotion is a separate gated program, §10); pull the owning repo to `origin/main` first (stale-checkout rule, §3); adversarial review of the subphase against this doc + CONTRACTS.md before writing code; `/verify-before-commit` before every commit; PR routing lambda→`main`, picasso code/IaC→`staging`, docs→`main`; update §12 evidence log + memory in the same session. Estimates are scope ("single-session, one PR"), never hours. Agent names per [`AGENT_RESPONSIBILITY_MATRIX.md`](../../picasso-config-builder/docs/AGENT_RESPONSIBILITY_MATRIX.md).

**Dependency shape:** M0 → M1a → M1b; M1c after M0 (needs C4/C7); M2 parallel-safe with M1* (disjoint files); M3a after M2; M3b after M3a + M1a; M4 after M3b; M-Ha before M4-S; M4-S gates M5+; M6a/M6b after M4-S; App Review milestone after M6b (needs the escalation demo), parallel with M7+; M-Hb aligned with App Review; M7a→M7b; M8a (needs M7a primitives)→M8b.

---

### M0 — Contracts lock
- **Scope:** author + freeze all nine contracts (§5); land additive config types in CB repo with forward-compatible reader and old-shape fixtures; finalize the feature-flag name.
- **OWN:** `Lambdas/lambda/docs/messenger/CONTRACTS.md` (new); CB `src/types/config.ts` + schema fixtures. (One session; up to two PRs — lambda docs + CB types — both merged before DONE.)
- **CONSUME:** this doc §3–§5; research pack capability facts.
- **PRODUCE:** C1–C9, version-stamped.
- **Deliverables:** CONTRACTS.md; CB types PR with fixture tests (old-shape config without `messenger_behavior` must not crash any reader).
- **DONE:** both PRs merged; tech-lead-reviewer adversarial pass on the contracts recorded in §12; every contract has a version stamp and at least one named downstream consumer.
- *Adversarial focus:* are the contracts implementable as written? Does payload v2 cover every webhook shape in the research fixtures? Does C7 pick lock vs coalesce with evidence, not vibes?
- **Agents:** system-architect (lead), Backend-Engineer, tech-lead-reviewer.

### M1a — Webhook payload v2
- **Scope:** full event classifier in Meta_Webhook_Handler — every inbound shape becomes a typed v2 invoke or an explicitly-logged intentional skip; add `timestamp`, `quick_reply.payload`, `app_id`; **drop nothing silently** (fixes fact 3's webhook half).
- **OWN:** `Meta_Webhook_Handler/index.js` + tests + fixture library (FB and IG variants of every event kind).
- **CONSUME:** C1 (frozen).
- **PRODUCE:** payload v2 live on staging (webhook side); the fixture library downstream subphases test against.
- **Deliverables:** classifier + fixtures; dashboard runbook step: subscribe `message_edits` / `message_deletions` webhook fields.
- **DONE:** every fixture produces a typed v2 invoke or a logged intentional skip — zero silent drops; v1 fields byte-identical for the legacy processor (contract test); staging smoke with a real DM on both channels.
- *Adversarial focus:* v1 consumers must be provably unaffected (webhook deploys before any processor change — D2's rule, exercised here first).
- **Agents:** Backend-Engineer, test-engineer, code-reviewer.

### M1b — Processor hygiene — **PII gate G-P1 (blocking)**
- **Scope:** 30-second fallbacks for unsupported inputs (attachment/sticker/voice → graceful config-driven text); disclosure line on first turn (D10 string); per-channel send caps (IG 1000); make the 24h guard live (payload v2 timestamp); **TTL fix** — write `expires_at`, decide legacy-row backfill; honor `is_deleted` → delete stored history rows (+ check analytics events for copied text).
- **OWN:** `Meta_Response_Processor/index.js` + `index.test.js` only.
- **CONSUME:** C1, C2 (strings), C5 (caps).
- **PRODUCE:** a policy-compliant processor baseline every later subphase builds on.
- **Deliverables/tests:** attachment event → fallback reply sent; sticker/unsupported → fallback; first-turn reply prepends disclosure (config-driven; absent when flag off); IG sends chunk ≤1000, FB ≤2000; event with timestamp >24h old → suppressed (fixture); `is_deleted` → Query+Delete of matching `meta:` history rows; new context rows carry `expires_at` (not `ttl`); **backfill script dry-run touches ONLY `meta:`-prefixed sessionIds** (shared-table risk, §9).
- **DONE:** delete event removes history rows (DynamoDB-verified on staging); new rows expire ≈ +7d; a real attachment DM gets a fallback reply on staging; G-P1 sign-off recorded (retention decision, is_deleted handling, disclosure).
- *Adversarial focus:* the shared `picasso-recent-messages` table — prove no code path can touch a non-`meta:` row.
- **Agents:** Backend-Engineer, compliance-implementation-advisor, pii-data-lifecycle-advisor, code-reviewer.

### M1c — Conversation-state table + serialization (G2)
- **Scope:** Terraform-provision `picasso-conversation-state` (C4) + per-function IAM; implement the C7 lock/coalesce mechanism for parallel async invokes (rapid-fire messages today ⇒ interleaved replies, history races, doubled Bedrock spend — widget serializes naturally, Messenger doesn't).
- **OWN:** `infra/modules/lambda-meta-staging/main.tf` (or a new module) in the picasso repo; processor lock module + tests in the lambda repo; **`docs/roadmap/PII-Project/pii-inventory.md` + data-classification tier IN THE SAME PR (Living-Inventory rule, CLAUDE.md).**
- **CONSUME:** C4, C7 (frozen).
- **PRODUCE:** the state table live on staging; the serialization primitive M7a depends on.
- **Deliverables/tests:** two concurrent invokes on one sessionId → exactly one Bedrock call proceeds (lock) or messages coalesce per C7; lock TTL expiry frees stuck conversations; lock never blocks distinct sessionIds.
- **DONE:** table live in staging via CI Terraform apply; race tests green; pii-inventory updated in the same PR(s).
- *Adversarial focus:* lock-orphan scenarios (processor crash mid-turn); IaC charset gotchas (CLAUDE.md IAM/CloudWatch ASCII rules).
- **Agents:** Backend-Engineer, deployment-specialist, test-engineer, pii-data-lifecycle-advisor.

### M2 — V5 shared lift (parallel-safe with M1a/M1b — disjoint files)
- **Scope:** move the trio `prompt_v5.js` + `prompt_v4.js` + `streamTail.js` → `Lambdas/lambda/shared/prompt/`; flip BSH imports; **fix the deploy-staging.yml filter** so `shared/prompt/**` changes redeploy BSH *and* (once it imports them) the Meta processor (fact 9).
- **OWN:** `shared/prompt/` (new), BSH require paths, `.github/workflows/deploy-staging.yml` filters.
- **CONSUME:** nothing frozen — this is a pure move.
- **PRODUCE:** `shared/prompt/` as the single import surface for V5 machinery.
- **Deliverables/tests:** byte-identical prompt contract tests (V4 + V5 outputs before/after the move); full BSH suite green.
- **DONE:** BSH suite green with flipped imports; prompt bytes identical; workflow filter provably covers `shared/prompt/**` for both consumers.
- *Adversarial focus:* esbuild bundling of the new path (BSH bundles; verify the Meta processor's package step will too); any BSH file the trio reaches transitively.
- **Agents:** Backend-Engineer, deployment-specialist, test-engineer.

### M3a — Messenger V5 prompt: draft + evidence
- **Scope:** design the Messenger base prompt (brevity rules + `messenger_behavior` overrides per C6 precedence) with V5 catalog/turn-check/tail blocks spliced in; design C8 session-boundary semantics (>24h gap resets; turn-check counts current session only); produce format/behavior A/B evidence runs (the V5.2/V5.3 evidence-gate discipline from [V5_SINGLE_PASS_TURN_PLAN.md](V5_SINGLE_PASS_TURN_PLAN.md) — this plan cites that discipline, so it follows it).
- **OWN:** new `Meta_Response_Processor/prompt_messenger.js` (name TBD in-session) + evidence files under `Meta_Response_Processor/evals/evidence/messenger/`.
- **CONSUME:** `shared/prompt/` (M2, frozen), C2, C5, C6, C8.
- **PRODUCE:** the Messenger prompt module (frozen for M3b) + evidence.
- **Deliverables:** A/B transcripts — brevity respected with catalog spliced (responses ≤3 sentences across the sample); >24h-gap fixture resets turn-check count; lifetime-thread fixture does NOT trip TURN CHECK.
- **DONE:** evidence files committed; tech-lead-reviewer adversarial pass on prompt-evidence quality recorded (not just "looks good" — counts, failure cases, tail-emission rate).
- **Agents:** Backend-Engineer, tech-lead-reviewer.

### M3b — Messenger V5 wiring
- **Scope:** wire V5 into the processor — buffered tail parse (`createTailParser().feed(full)` + `end()`); flag gate; fallback ladder (valid tail → `validateActionIds`; malformed → one `selectActionsV4` call → no buttons); session-scoped history windowing + turn-check counting per C8.
- **OWN:** `Meta_Response_Processor/index.js` integration + tests.
- **CONSUME:** M3a prompt (frozen), C1 (timestamp for session boundary), C8, tail-parse contract (`shared/prompt/streamTail.js`).
- **PRODUCE:** validated `actionIds` per turn, handed to M4 for rendering (until M4, ids are logged, not rendered).
- **Deliverables/tests:** tail stripped from every sent chunk (asserted at `sendResponseMessages` input — it must never cross it); malformed tail → single V4-selector fallback → no buttons on failure; flag off ⇒ prompt **byte-identical** to current `buildMessengerPrompt` (pinned fixture); validated ids ∈ `cta_definitions`, ≤4.
- **DONE:** the byte-identical-when-off contract test green; scripted staging conversations show zero tail leakage; §12 records tail-emission/validity rates.
- *Adversarial focus:* tail leak into user-visible text; session-boundary edges (exactly-24h, clock skew, missing timestamp).
- **Agents:** Backend-Engineer, test-engineer, tech-lead-reviewer.

### M4 — CTA rendering + payload routing
- **Scope:** render validated actionIds per **C9**: quick replies for suggestions, button-template URL buttons for commitments — attached to the same send (no cross-turn state); route structured payloads (C3) in the processor; truncate QR titles per C5 (20-char QR cap is distinct from message-body caps); preserve `GET_STARTED` + unknown-payload→RAG.
- **OWN:** `Meta_Response_Processor/index.js` send/render path + tests.
- **CONSUME:** C3, C5, **C9 by name — the rendering decision is already made; M4 implements, it does not re-derive**; `cta_definitions`.
- **PRODUCE:** the rendering layer M5/M7/M8 reuse.
- **Deliverables/tests:** rendering matrix per action type × channel; >20-char titles truncated; ≤13 QRs, ≤3 buttons enforced; tap payload round-trips to the correct handler; free-text equivalent honored (C9 principle).
- **DONE:** staging DMs on both channels render QRs + URL buttons; taps round-trip; unknown payload falls through to RAG.
- *Adversarial focus:* IG rendering differences (structured templates invisible on IG web — verify in-app); QR transience UX (does the free-text fallback actually work when the QR vanished?).
- **Agents:** Backend-Engineer, test-engineer, code-reviewer.

### M-Ha — Channel health detection (G1) — before M4-S: protects the soak
- **Scope:** Meta emits **no token-invalidation webhook** — silent channel death is the current failure mode. Classify send errors (**190 token-dead / 551 user-unavailable / 613 rate-limit / 1545041 window-closed / 10-1893063 Page-restricted**); CloudWatch alarm on sustained per-channel send failures; subscribe the Page Integrity webhook; write the operator reconnect runbook (seed of the consolidated **Messenger Ops Runbook**, §11).
- **OWN:** processor send-error path + `infra/modules/ops-alarms-meta-staging/`; `docs/runbooks/MESSENGER_OPS.md` (picasso repo, new).
- **CONSUME:** C1 (echo/app_id for self-send detection), channel-mappings schema.
- **PRODUCE:** per-channel health signal; the runbook.
- **DONE:** synthetic 190 failure fires the alarm; classified error metrics visible per channel+tenant; runbook committed.
- *Adversarial focus:* alarm math (sustained vs one-off); don't page on user-blocked-bot (551) noise.
- **Agents:** Backend-Engineer, DevOps, technical-writer.

### M4-S — Live soak gate
- **Scope:** 48h staging soak, both channels, ≥30 conversations; zero tail leaks / silent drops; go/no-go recorded (V5-plan precedent: soak only after rendering is observable). **Tester roster named up front** (Standard Access = role-holders only under the dev-mode app; IG Self Messaging API as a synthetic option) (G7).
- **OWN:** soak evidence files under §12 (no code).
- **CONSUME:** everything M1–M4 shipped; M-Ha alarms watching.
- **PRODUCE:** the go/no-go that gates M5+.
- **DONE:** soak report in §12 with conversation count, tail-emission/validity rates, drop audit, go/no-go.
- **Agents:** qa-automation-specialist, tech-lead-reviewer.

### M5 — Welcome surfaces
- **Scope:** generate ice breakers (≤4) + persistent menu from tenant config; push via Messenger Profile API on OAuth connect; **operator re-push script** (Config Builder can't trigger yet — separate project); postbacks round-trip via M4.
- **OWN:** `Meta_OAuth_Handler` (push-on-connect) + re-push script + docs section in the Ops Runbook.
- **CONSUME:** C2 (config source), C3 (postback payloads), M4 routing.
- **PRODUCE:** the config→Profile-API push path the future Config Builder UI will trigger.
- **DONE:** connect flow pushes surfaces visible in the real FB/IG client; re-push script run + documented; ice-breaker taps answer correctly.
- *Adversarial focus:* per-locale support deferred deliberately (G8 keeps strings config-driven); menu tap opens a fresh 24h window — confirm the guard (M1b) treats it as user activity.
- **Agents:** Backend-Engineer, technical-writer.

### M6a — Escalation: transfer + notify — **PII gate G-P2 (advisory)**
- **Scope:** "talk to a human" intent → `pass_thread_control` to the inbox app ID (FB `263902037430900` / IG `1217981644879628`) with context metadata → **SES email to staff** (deep link to `business.facebook.com/latest/inbox`) → pause row in the state table; env additions for inbox app IDs; defensive handling when the tenant hasn't set us as default app.
- **OWN:** processor escalation path + tests; IAM/env via `infra/modules/lambda-meta-staging/`; SES template.
- **CONSUME:** C2 (escalation strings, D10), C4 (pause row shape), `send_email` rails.
- **PRODUCE:** the pause row + notify path M6b's resume semantics complete.
- **DONE:** staging DM "I want to talk to a person" → thread appears in Business Suite inbox + staff email received + bot paused (state row verified); G-P2 recorded (what conversation context goes into the email).
- *Adversarial focus:* **never-share-IAM-roles rule (lambda#44 class)** — new permissions land on the Meta processor's own role only; intent false-positives (escalating on "how do humans apply?").
- **Agents:** Backend-Engineer, deployment-specialist, Security-Reviewer, pii-data-lifecycle-advisor.

### M6b — Coexistence: pause/resume
- **Scope:** echo-watch pause (`is_echo && app_id !== ours` ⇒ staff is talking — bot stands down); standby-channel consumption; resume semantics (24h thread-control idle expiry / `take_thread_control`); **tenant onboarding runbook**: our app = default application, take-control ON, Business Suite automations OFF, Meta Business Agent OFF (the double-responder hazard).
- **OWN:** processor pause/resume logic + tests; onboarding section of the Ops Runbook.
- **CONSUME:** C1 (echo/standby event kinds), C4 (pause row).
- **PRODUCE:** the complete bot↔staff coexistence loop — the App Review milestone's human-escalation demo.
- **DONE:** staff reply from the inbox pauses the bot (verified live); bot resumes after idle expiry or take-control; runbook committed.
- *Adversarial focus:* pause-flag races with in-flight turns (serialization from M1c helps — prove it); unconfigured tenants (echo-watch must work even when Conversation Routing isn't set up).
- **Agents:** Backend-Engineer, test-engineer, technical-writer.

### 🏁 Milestone — App Review package (starts after M6b; parallel with M7+)
Advanced Access (`pages_messaging`, `instagram_manage_messages`, Human Agent) is the real-users gate; dev-mode covers all staging work meanwhile. Deliverables: end-to-end screencasts, test users, the demonstrable human-escalation path (M6a/M6b IS the demo — an IG review prerequisite), Business Verification checklist. Request only what we demo. Budget weeks + resubmission loops. Submission itself = operator action.
- **Agents:** technical-writer + operator.

### M-Hb — Abuse & cost controls (G3) — aligned with the App Review milestone
- **Scope:** per-PSID rate limit + per-tenant daily turn cap (config-driven; the threat = unauthenticated public path into Bedrock spend, real once Advanced Access ships); Moderate Conversations API documented as an **operator runbook, not a built tool** (one operator, one tenant today).
- **OWN:** processor/webhook throttle path (state table counters) + tests; Ops Runbook section.
- **CONSUME:** C4/C7 (counters ride the state table).
- **PRODUCE:** the throttle rails real-tenant traffic requires post-Advanced-Access.
- **DONE:** flood test from one PSID throttled per contract with a polite config-driven message; tenant daily cap enforced; runbook committed.
- **Agents:** Backend-Engineer, Security-Reviewer, technical-writer.

### M7a — Form engine — **PII gate G-P3 (blocking)**
- **Scope:** server-side form sessions on the state table (C4): field prompts, QR enums (C3 payloads), prefill (`user_email` QR is FB-only — C5), validation/re-prompt, summary + confirm, submit via the MFS live-lane-shaped invoke (fact 13); typed answers always accepted (C9 principle).
- **OWN:** new form-engine module in the processor + tests.
- **CONSUME:** `conversational_forms` config, C3, C4, C7, C9, M4 routing.
- **PRODUCE:** field-collection primitives (prompt/validate/confirm) that M8a reuses.
- **G-P3 must also address [pii-inventory Finding 12](PII-Project/pii-inventory.md) (`:239`):** a Meta-only subject is unreachable by the DSAR identity walk (no PSID→`pii_subject_id` link). Close the link for form-completing users (their email/phone now exists) **or record an explicit deferral per the inventory's convention.**
- **DONE:** a real form completes E2E in staging DMs on both channels — enums via QR, invalid input re-prompted, summary confirmed, MFS fulfillment fires (email/SMS/S3 verified), audit row present; G-P3 sign-off incl. Finding-12 disposition recorded.
- *Adversarial focus:* mid-form races (two rapid answers — C7 must serialize); abandoned-session TTL; what the summary echoes back (PII minimization in-channel).
- **Agents:** Backend-Engineer, test-engineer, pii-data-lifecycle-advisor.

### M7b — Form/brain arbitration
- **Scope:** digression handling (mid-form question → RAG answer → resume same field); cancel/exit keywords; V5 action suppression mid-form; `eligibility_gate` support.
- **OWN:** arbitration layer between form engine and V5 turn in the processor + tests.
- **CONSUME:** M7a engine (frozen).
- **PRODUCE:** the arbitration layer M8a's scheduling driver runs under.
- **DONE:** scripted staging run — digress + resume same field; "cancel" exits cleanly; no CTA buttons render mid-form; ineligible user blocked per config.
- *Adversarial focus:* state escapes (form row left behind after cancel/crash); prompt-injection via form answers reaching the V5 turn.
- **Agents:** Backend-Engineer, tech-lead-reviewer, qa-automation-specialist.

### M8a — Scheduling: book — **PII gate G-P4 (light)**
- **Scope:** program selection → `scheduling_propose` (fact 14) → slot carousel (C5: ≤10 cards) → contact capture via **M7a primitives** (hard dependency: commit needs `attendee_email`; IG has no email QR; **IG bookings REQUIRE phone — SMS is IG's only reminder lane**, D9) → confirm → commit via **Booking_Commit_Handler's default/no-action path** → confirmation message; slot-conflict retry (re-propose on commit failure).
- **OWN:** scheduling driver module in the processor + tests.
- **CONSUME:** Booking_Commit_Handler contract (fact 14), `shared/scheduling` `phone.js`/`consent.js`, C4 (session row), M7a primitives, C9.
- **DONE:** booking completes E2E in a staging DM on both channels — row in the booking table, confirmation + reminder rails verified (SMS for IG); conflict retry exercised; G-P4 recorded (consent language for SMS via `consent.js`).
- *Adversarial focus:* double-commit on rapid confirm taps (C7 + commit idempotency); timezone rendering in slot labels.
- **Agents:** Backend-Engineer, test-engineer, Security-Reviewer.

### M8b — Scheduling: manage
- **Scope:** reschedule/cancel via `scheduling_mutate` (fact 14); booking lookup UX (identify the booking from the conversation, confirm before mutating).
- **OWN:** extend the M8a driver + tests.
- **CONSUME:** M8a driver (frozen), `shared/scheduling` `reschedule.js`/`cancel.js`.
- **PRODUCE:** full booking lifecycle parity with the widget — the program's last DONE line.
- **DONE:** reschedule and cancel complete E2E from a staging DM; unknown/ambiguous booking handled gracefully (never mutates without explicit confirmation).
- **Agents:** Backend-Engineer, test-engineer.

## 7. Program success criteria (verifiable)

1. A tenant with `MESSENGER_CHANNEL` on gets: V5-driven replies ≤3 sentences with coherent CTAs, forms, booking, human escalation with staff email — on FB **and** IG, verified live on staging.
2. A tenant without the flag: behavior byte-identical to today's baseline (contract tests at M1b/M3b).
3. Zero Meta-policy violations in the M4-S soak and after: every input answered ≤30s, disclosure present, 24h window enforced, `is_deleted` honored.
4. Meta history rows expire (fact 6 closed); no PII gate skipped (G-P1..G-P4 recorded in §12).
5. Channel death is detected (M-Ha alarm), not discovered by a tenant.
6. All operator procedures live in ONE Messenger Ops Runbook (§11).

## 8. Process gates (SOP mapping)

- **Per-subphase:** SOP Phase 0–5 applies within each subphase (requirements = this doc + CONTRACTS.md; adversarial review before code; validation = the DONE line; retro = §12 entry). Phase gates: tech-lead-reviewer pass on M0 contracts and M3a evidence; **M4-S soak = hard go/no-go before M5+**; App Review milestone gates real-tenant traffic; **prod promotion is NOT part of this program** — it's a separate gated cutover per the Deployment SOP (see §9 G5).
- **PII gates:** G-P1 (M1b, blocking), G-P2 (M6a, advisory), G-P3 (M7a, blocking, incl. Finding 12), G-P4 (M8a, light) — mapped from CLAUDE.md's PII Review Triggers (transcripts/retention → G-P1; sends to third party → G-P2; form PII collection/storage → G-P3; phone/SMS consent → G-P4). Tenant verticals include foster care/minors-adjacent programs — advisors weigh that in every gate.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Payload-contract drift between the two independently-deployed Lambdas | D2: additive-only, webhook-deploys-first, contract fixtures in both repos' tests |
| Quick-reply transience breaks flows when users type instead of tapping | C9 free-text fallback is a frozen principle, tested per flow |
| Tenant default-app / Business Suite automation variance (double-responders, dropped standby) | M6b onboarding runbook + echo-watch belt-and-suspenders |
| MFS session-id semantics ripple (`meta:{pageId}:{psid}` flowing into form fulfillment/audit paths built for widget session ids) | M7a fixture tests against MFS contract; no MFS changes without old-shape fixtures |
| Meta webhook migrations (sticker attachment type Aug 30 2026) | M1a fixture library includes both shapes; §12 tracks the date |
| **G5 — prod Meta-app topology:** the single Live Meta app's webhook points at the **staging** Lambda URL; prod promotion needs its own app or a routing decision | Named here so the prod gate isn't surprised; decision owned by the (separate) prod-promotion program |
| **G6 — CB `ChannelsSettings.tsx:54`** falls back to the prod OAuth Lambda URL | Prerequisite for tenant self-serve connects; owned by the separate CB project |
| **`picasso-recent-messages` is SHARED with live widget chat** | Any Meta-side TTL/backfill/delete work filters STRICTLY by the `meta:` sessionId prefix (M1b tests enforce) |
| Meta Business Agent (Jun 2026) enabled by a tenant → double responses | M6b onboarding checklist; echo-watch detects the symptom |
| App Review timeline (weeks + resubmissions) blocks real-tenant launch | Milestone starts right after M6b, parallel with M7+; dev-mode unblocks all staging work |

## 10. Non-goals (this program)

- **Config Builder `messenger_behavior` UI** — separate project (types land in M0; UI later).
- **Messenger analytics dimension** — separate project (existing analytics events keep flowing).
- **SMS staff notification** on escalation — v1 is SES email only (Chris, 2026-07-12); Telnyx rail exists when wanted.
- **Prod promotion** — separate gated program (G5 decision, per-resource cutover SOP).
- **App Review execution** — the milestone builds the package; submission/iteration is operator-driven.
- **Paid Marketing Messages, OTN, FB utility templates** — post-window lanes deferred; reminders ride SMS (D9).
- **IG-Login onboarding lane** (tenants without FB Pages), Messenger voice/Calling API, Personas, `response_feedback` mining, WhatsApp — noted, not planned.

## 11. Relationship to existing docs

- [`Facebook/messenger-research-2026-07/`](../../Facebook/messenger-research-2026-07/README.md) — platform ground truth (July 2026), cited throughout §3/§5.
- [`Facebook/meta-messenger-integration.md`](../../Facebook/meta-messenger-integration.md) — as-built architecture + Meta mechanics reference (§2).
- [`V5_SINGLE_PASS_TURN_PLAN.md`](V5_SINGLE_PASS_TURN_PLAN.md) — the V5 architecture this program reuses; its evidence-gate discipline is adopted at M3a.
- [`PII-Project/pii-inventory.md`](PII-Project/pii-inventory.md) — Findings at `:225` (TTL) and `:239` (Finding 12) are closed/addressed by M1b/M7a; Living-Inventory rule binds M1c.
- **Messenger Ops Runbook** (`docs/runbooks/MESSENGER_OPS.md`, created M-Ha) — the ONE consolidated operator doc: reconnect (M-Ha), welcome-surface re-push (M5), tenant onboarding (M6b), moderation (M-Hb).
- [`SOP_DEVELOPMENT_WORKFLOW.md`](../../picasso-config-builder/docs/SOP_DEVELOPMENT_WORKFLOW.md) + [`AGENT_RESPONSIBILITY_MATRIX.md`](../../picasso-config-builder/docs/AGENT_RESPONSIBILITY_MATRIX.md) — process + agent selection.
- `docs/roadmap/SMS_PLATFORM_ROADMAP.md` (currently an untracked local draft — plain reference, not a link) — the Telnyx rail M8a reminders ride on.
- Spanish i18n program (approved 2026-07-02) — D10/G8 keep all strings config-driven so it localizes without re-plumbing.

## 12. Execution evidence log

> One entry per subphase at completion: PR link(s), DONE-line evidence (test summary lines, live staging verification), gate sign-offs, deviations from this plan (with why). Empty until execution begins.

### M0 — ✅ COMPLETE 2026-07-13
- **PRs (both merged):** lambda#433 → `8f4039a` (`docs/messenger/CONTRACTS.md`, C1–C9 v1.0); config-builder#82 → `6d0ec4e` (C2 types: `MessengerBehaviorConfig` + `MESSENGER_CHANNEL` flag + Zod `messengerBehaviorSchema` + old/new-shape fixture tests).
- **Tech-lead-reviewer adversarial pass (gate):** verdict APPROVE WITH CHANGES; all findings applied pre-freeze — 3 blocking (echo events invert sender/recipient ⇒ C1 now mandates `psid` = `recipient.id` for `eventKind:'echo'`; C7 release made conditional on empty `pending`, closing a drop-on-release race; C4 `lock.pending` item shape extended to carry v2 fields so non-text bursts coalesce) + 4 should-fix (metadata-only events `messaging_referrals`/`response_feedback` ⇒ logged intentional skip, not `unsupported` fallback; `replyTo` story-context field; C9 split-reply rule — QRs on final chunk, button template after it; C7 lock-TTL ≥ function-timeout+10s invariant, coupled to `lambda-meta-staging` 120s timeout). Reviewer verified the C1 deploy-gap claim against live code (`validateEvent` drops null-text without crash/retry) and confirmed C8 boundary math + C2/CB type parity.
- **DONE line:** every contract version-stamped (`v1.0 2026-07-13`) with ≥1 named downstream consumer; flag name finalized `MESSENGER_CHANNEL`. CB verification: `tsc --noEmit` clean, vitest 504/504, eslint clean. Lambda merge's Deploy-Staging run: all function deploys **skipped** (docs-only, verified).
- **Deviations:** (1) beyond "types", also added the Zod `messengerBehaviorSchema` mirror — repo convention is interface+schema in parallel (`channels` precedent); ≤4 ice-breaker cap enforced per C5. (2) C1 gained `replyTo` + metadata-skip rules and C7/C9 gained the race/split-reply fixes vs the plan's sketch — all from the adversarial pass, recorded in CONTRACTS.md's version log.

### M1a —
### M1b — (G-P1)
### M1c —
### M2 —
### M3a —
### M3b —
### M4 —
### M-Ha —
### M4-S — (soak go/no-go)
### M5 —
### M6a — (G-P2)
### M6b —
### Milestone: App Review package —
### M-Hb —
### M7a — (G-P3, Finding 12)
### M7b —
### M8a — (G-P4)
### M8b —

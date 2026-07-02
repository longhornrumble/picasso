# Spanish (Customer-Facing) Internationalization — Build Plan

**Status:** Direction approved 2026-07-02 (planning only — no code yet)
**Owner:** Chris Miller
**Scope:** End-user surfaces only — chat widget UI, AI responses, and notifications on every outbound channel (widget, email, SMS, Facebook/Instagram Messenger). The employee-facing dashboard stays English.
**Research basis:** Four deep code scans (2026-07-01/02): Picasso widget, `Lambdas/lambda`, picasso-analytics-dashboard, picasso-config-builder.

---

## 1. Goal & non-goals

**Goal:** A website visitor (or Messenger user) can experience the entire customer journey in Spanish — widget UI, AI conversation, conversational forms, scheduling, and every notification (booking confirmation, reminders, form confirmations, SMS) — with English remaining the default and the fallback everywhere.

**Non-goals (explicitly out of scope):**
- Translating the employee dashboard or config builder operator UI.
- Languages beyond Spanish. Everything is keyed by locale code (`en`/`es`) so a third language is additive, but no machinery beyond two locales is built.
- Dual-language Knowledge Bases (only if gate G1 proves retrieval quality demands it — see 0.1).
- Bubble surfaces (deprecated, do not extend).
- A translation management system (TMS) integration — see §6.

---

## 2. Current state (research summary)

**There is no language/locale concept in force anywhere in the platform.** No i18n library, no locale files, no detection, no `language` field in tenant config, session state, leads, bookings, or notification templates. PRDs list multi-language as an explicit deferred item.

### Existing seams (already built, all inert)

| Seam | Where | What it gives us |
|---|---|---|
| `text_en` English-equivalent slot on every stored message | `Master_Function_Staging/conversation_handler.py:764-772`; Meta processor writes it too; v1 = verbatim copy | Staff read English while customer chats Spanish (Phase 4 makes it a real translation) |
| Dashboard prefers `content_preview_en ?? content_preview` | `picasso-analytics-dashboard/src/components/sessions/SessionTimelineEvent.tsx:132` | Transcript views already language-aware by contract |
| Widget string tables awaiting `t()` | `Picasso/src/components/chat/SchedulingSlots.jsx:91`, `SchedulingDayPicker.jsx:66`; centralized error map `Picasso/src/utils/errorHandling.js:266` | The intended extraction pattern, stated in code comments |
| Dead `multilingual: False` feature flag | `Master_Function_Staging/tenant_config_loader.py:449` (defined, never read) | Superseded by `supported_languages` (D6); remove or repurpose |
| Config-builder `t()` scaffold (English-only, operator UI) | `picasso-config-builder/src/lib/i18n/` | Pattern precedent only |
| Scheduling config already has `default_locale`/`available_locales` (BCP-47, tests exercise `'es'`) | `picasso-config-builder/src/lib/schemas/scheduling.schema.ts`; Invariant 5 in `tenant.schema.ts:427-438` | The only existing language axis; naming precedent |

### The four text surfaces

1. **AI-generated prose** — assembled in `Bedrock_Streaming_Handler_Staging/prompt_v4.js` (locked rules hardcoded English, no language directive) and *separately* in `Meta_Response_Processor/index.js:550` for Messenger. Retrieval (`shared/bedrock-core.js:260-319`) assumes English KB.
2. **Tenant-config-authored text** — welcome/callout/titles, quick-help, action chips, CTA labels, all conversational-form field text, post-submission messages, `tone_prompt`, `fallback_message`. One English config per tenant; no language dimension in schema.
3. **Hardcoded widget UI strings** — ~200+ distinct strings across ~24 files (heaviest: StateManagementPanel ~50, forms chrome ~40, scheduling page ~30, error map 13). `<html lang="en">` hardcoded.
4. **Hardcoded backend copy + notification templates** — 14 sources, notably: deterministic scheduling click-turn copy that bypasses Bedrock (`BSH index.js:61-70`), notification defaults in `shared/scheduling/notif-defaults.js` **held byte-in-sync with a Python twin in Analytics_Dashboard_API by a CI parity test**, DDB per-tenant overrides keyed `{tenantId, moment}` (single-language), email chrome in `Booking_Commit_Handler/confirmation-email.js`, `Master_Function_Staging/notification_templates.json`, error `safe_messages` map.

### Config-builder specifics (scanned 2026-07-02)

- The Zod schema layer does **not** block a new config section: `tenantConfigSchema` is default strip mode (`tenant.schema.ts:245`), never `.strict()`. Unknown sections validate fine.
- The **real gate is the publish allowlist**, in three places: `getMergedConfig()` (`src/store/slices/config.ts:585-641` — explicit field list, drops anything not enumerated), `EDITABLE_SECTIONS` in `src/lib/api/mergeStrategy.ts:19`, and its server twin `lambda/mergeStrategy.mjs:9`. A `translations` section must be added to all three or it is silently dropped at publish.
- Load path stores raw S3 JSON un-parsed (`config.ts:66`), so an overlay already in S3 survives loading.
- No LLM integration exists anywhere in the builder (pure S3 CRUD Lambda) — a "generate Spanish" action is greenfield.
- No live widget preview exists (JSON preview only) — a rendered Spanish preview is not cheap and is not v1.
- Contract-test home: `src/lib/schemas/__tests__/` (`tenant.schema.forwardcompat.test.ts` is the pattern; `mock-s3-snapshot.test.ts` validates all fixtures).

---

## 3. Approved architecture decisions

- **D1 — Hybrid language signal (Option D).** Precedence, in order: **explicit user toggle > embed-site hint (`data-lang` on the embed / `window.PicassoConfig.language`) > browser `navigator.language` default.** The AI mirrors the user's *typed* language for prose only when no explicit choice has been made. The toggle always wins (prevents the mirror flipping a user who chose English back to Spanish).
- **D2 — Locale codes, absent-means-English.** `en`/`es` strings everywhere; every reader tolerates a missing language field and defaults to `en` (forward-compatible reads per CLAUDE.md, with old-shape fixture tests).
- **D3 — Phases 1+2 ship as one release** ("Release 1"): conversation + widget chrome + config axis together, so no half-translated intermediate ships to a pilot tenant.
- **D4 — One language attribute, designed once.** Release 1 defines the session-level language attribute (on the existing summaries-table item) in exactly the shape Phase 3 reads when stamping bookings. No rework between phases.
- **D5 — Fallback chain, enforced everywhere:** tenant-`es` → platform-`es` default → tenant-`en` → platform-`en`. A missing translation must never render a key, a blank, or crash — it renders English.
- **D6 — Config model: sparse top-level overlay.** `translations: { es: { <sparse mirror of base config paths> } }` plus `supported_languages: ["en","es"]` as the per-tenant gate (retires the dead `multilingual` flag). Rationale: additive (old readers ignore it entirely); doesn't pollute every section schema with `_es` twins; one resolver function on every reader. Cost: must be added to the three config-builder allowlists (§2) — a known, small, enumerated change. *Rejected alternative:* per-field `label_es` twins (schema sprawl, N places to resolve).
- **D7 — No i18n library in the widget.** A ~30-line `t(key, params)` helper + `en.ts`/`es.ts` dictionaries, exactly the indirection the scheduling components' comments anticipate. Two locales do not justify i18next.
- **D8 — Register: neutral Latin-American Spanish.** The tú/usted default is decided in the style guide (0.3) and is overridable per tenant via the Spanish `tone_prompt`. Working recommendation: *usted* for family-services tenants (warmer options per tenant).
- **D9 — Simplification from bundling 1+2:** the widget always sends a resolved `language` field on every request, so the backend needs **no language detection for the widget path**. Canned copy keys off the request field; the prompt directive handles prose. Server-side detection exists only for the Meta channel (mirror-only, no UI).

---

## 4. Working agreements for the AI dev team

These exist because focused subphases produce high-quality output. Every subphase below is designed to be independently assignable.

1. **One subphase = one concern = one PR (or one tight PR chain).** No subphase mixes extraction with translation, or schema with UI.
2. **Every subphase states exit criteria; they are verifiable, not aspirational.** A subphase is done when its criteria pass, not when its code exists. Run `/verify-before-commit`; staging-first; prod is always a separate gated step.
3. **No cross-subphase scope creep.** If work reveals an adjacent problem, note it in the subphase's PR description and stop.
4. **English behavior is sacred during extraction.** Any subphase marked "mechanical" must leave the English experience byte-identical (snapshot/E2E evidence required).
5. **Schema discipline applies to every new field:** additive, readers tolerate absence, old-shape fixture test in the same PR.

---

## 5. Phase 0 — Gates & foundations (parallelizable; block later work as noted)

### 0.1 Spanish RAG retrieval spot-check → **Gate G1**
- **Scope:** Run ~20 realistic Spanish visitor questions against a live tenant KB (staging, test tenant or pilot tenant KB); run their English twins; compare retrieved chunks and end-answer quality (Claude answering in Spanish from English chunks).
- **Deliverable:** Scorecard + a go/no-go memo: is query-translation-before-retrieval needed?
- **Exit criteria:** G1 decided and recorded. If "needed," subphase 4.4 moves into Phase 3.
- **Blocks:** nothing in Release 1 (directive works either way); informs 4.4.

### 0.2 Telnyx Spanish opt-out verification → **Gate G2**
- **Scope:** Empirically verify (staging Telnyx number) how Telnyx handles Spanish opt-out keywords (ALTO, CANCELAR) vs STOP — per the verify-cloud-behavior-empirically rule, not from docs alone.
- **Deliverable:** Findings memo; decision on whether our SMS webhook must handle Spanish keywords itself.
- **Exit criteria:** G2 decided. **Blocks:** 3.7.

### 0.3 Spanish style guide + glossary
- **Scope:** One document: register decision (tú/usted, D8), neutral-LatAm conventions, do-not-translate list (program names like "Love Box", org names, product terms), token handling rules (`{{var}}` never translated), tone examples.
- **Deliverable:** `docs/i18n/SPANISH_STYLE_GUIDE.md` + machine-readable glossary (JSON) for the QA harness.
- **Exit criteria:** Reviewed by Chris. **Blocks:** every translation subphase (C5, 3.2, E5).

### 0.4 Translation QA harness
- **Scope:** A repeatable script implementing the pipeline in §7: token-integrity check, length budgets, glossary enforcement, DeepL back-translation diff, adversarial LLM review. Input: `{key, en, es}` catalog; output: pass/fail report.
- **Deliverable:** Script + report format checked into the repo.
- **Exit criteria:** Harness runs against a seeded catalog with deliberately planted errors and catches all of them (broken token, register drift, glossary violation, overflow).
- **Blocks:** C5, 3.2, E5.

---

## 6. Release 1 (Phases 1+2 bundled) — conversation, chrome, config axis

Five workstreams. A/B/C/D can start immediately and run in parallel; E1 blocks E2–E6.

### WS-A — Language signal (widget)

**A1 — Language resolution module (no UI).**
- Scope: One module implementing D1 precedence (`toggle > data-lang embed hint > navigator.language`), sessionStorage persistence, sets `<html lang>` dynamically, and adds `language` to the request body in **both** providers (`StreamingChatProvider.jsx:755` requestBody and the HTTPChatProvider mirror). Also written to the session summaries item (D4 shape: attribute `preferred_language`, values `en`/`es`, absent = `en`).
- Exit: Unit tests for every precedence combination; English users see zero change; the field arrives at the backend (staging log evidence).

**A2 — Language toggle UI.**
- Scope: Compact EN/ES control in `ChatHeader.jsx` actions row + entry in StateManagementPanel Settings tab. Writes through A1's module only.
- Exit: Toggle flips chrome language live mid-session, persists across reload (sessionStorage), and updates `<html lang>`. Depends: A1, C1 (needs `t()` for its own labels).

### WS-B — AI prose

**B1 — Widget prompt language directive.**
- Scope: `prompt_v4.js` only. When request `language` is explicit → "respond in Spanish/English"; when absent → "respond in the language of the user's most recent message." Select `fallback_message` through the D5 chain. No other prompt changes.
- Exit: Prompt-assembly unit tests (explicit es / explicit en / mirror mode); staging conversation evidence: Spanish in → Spanish out; mid-conversation switch follows; English regression unchanged.

**B2 — Meta channel directive + detection.**
- Scope: `Meta_Response_Processor/index.js` — mirror directive in `buildMessengerPrompt()`, Spanish variant of `DEFAULT_FALLBACK_MESSAGE`, `welcome_message` resolved through D5 chain. Lightweight message-language detection for the fallback/welcome path only (prose handled by the mirror directive).
- Exit: Staging Messenger test: Spanish DM → Spanish response; failure path shows Spanish fallback; English unchanged.

### WS-C — Widget chrome extraction (mechanical → then translate)

C1–C4 are **extraction only** (English dictionary, zero behavior change). C5 is **translation only**. This split is deliberate — do not merge them.

**C1 — `t()` helper + core chat chrome.**
- Scope: The helper (D7) + extraction in: InputBar, ChatHeader, ChatFooter, ChatWidget, ChatWindow, FollowUpPromptBar, MessageBubble, AttachmentMenu, FilePreview, ShowcaseCard, TypingIndicator, ErrorBoundary, `errorHandling.js` map, provider fallback/resume strings, iframe boot text.
- Exit: All listed files free of literal user-facing English; `en` dictionary complete for them; English UI snapshot-identical.

**C2 — Settings panel extraction.** StateManagementPanel (~50 strings incl. toasts, date/duration helpers). Same exit criteria.

**C3 — Forms chrome + validation extraction.** FormFieldPrompt, FormModeContext validation messages, CompositeFieldGroup, FormCompletionCard (incl. its hardcoded default post_submission block), form-resume prompts in both providers. Same exit criteria.

**C4 — Scheduling UI extraction.** SchedulingPage, SchedulingMonthCalendar (replace hardcoded MONTHS/DOW arrays with `Intl.DateTimeFormat` month/weekday names keyed by locale), swap SCHEDULING_STRINGS/DAY_PICKER_STRINGS to `t()` as their comments intend. Same exit criteria.

**C5 — Spanish dictionary.**
- Scope: Translate the full catalog from C1–C4 via the §7 pipeline (style guide 0.3, harness 0.4). No code changes beyond `es.ts`.
- Exit: QA harness green; human review pass complete (§7 step 5); toggling to ES renders every extracted surface in Spanish with no key leakage.

### WS-D — Backend canned copy

**D1 — BSH deterministic copy variants.**
- Scope: `es` variants of the scheduling click-turn constants (`index.js:61-70`), SSE error strings, `agentTurn.js` copy, `postBookingPrepNote.js` ack — selected by the request `language` field, fallback `en`.
- Exit: Unit tests both languages; staging: Spanish session booking flow shows Spanish canned lines interleaved with Spanish AI prose.

**D2 — Master_Function error message variants.**
- Scope: `conversation_handler.py` `safe_messages` map + ConversationError strings, keyed off request language, default `en`.
- Exit: Unit tests; forced-error staging check in both languages.

### WS-E — Config language axis + authoring

**E1 — Schema design PR (no behavior).**
- Scope: Add `translations.es` overlay + `supported_languages` (D6) to config-builder Zod schemas; fixture updates (`mock-s3-snapshot.test.ts`); forward-compat test per the PR #67 pattern (`tenant.schema.forwardcompat.test.ts`); document the overlay's sparse-path shape.
- Exit: Schema accepts overlay configs; all existing fixtures still pass; typed `TenantConfig` includes the new sections.

**E2 — Reader resolution (widget + Lambdas).**
- Scope: One resolver implementing D5, applied where config text is consumed: widget ConfigProvider (welcome/callout/titles/chips/quick-help/CTAs/forms), BSH (`tone_prompt`, `fallback_message`, CTA labels for selector vocabulary), Master_Function defaults. Gated by `supported_languages` containing `es`.
- Exit: Old-shape config (no overlay) behaves exactly as today (fixture test); overlay config resolves es with en fallback for missing paths; contract test for a partial overlay.

**E3 — Config-builder publish plumbing.**
- Scope: Add `translations` + `supported_languages` to the three allowlists: `getMergedConfig()` (`src/store/slices/config.ts:585-641`), `EDITABLE_SECTIONS` client (`src/lib/api/mergeStrategy.ts:19`) and Lambda twin (`lambda/mergeStrategy.mjs:9`). Round-trip test: load → edit → publish preserves the overlay byte-for-byte.
- Exit: Round-trip test green; publishing a config without the overlay is unchanged.

**E4 — Config-builder authoring UI.**
- Scope: A store-level "editing language" switcher (global, per the scan's recommendation — the store centralizes all writes) that re-points field reads/writes into the overlay for: TenantIdentitySettings, CTAsEditor, ActionChipsEditor, QuickHelpSettings, FormsEditor (field text + post_submission), BedrockInstructionsSettings fallback message. English mode is exactly today's UI.
- Exit: Author a Spanish variant of every listed field type through the UI; JSON preview shows the sparse overlay; empty-field = inherits English (visible affordance).

**E5 — "Generate Spanish variant" script (v1 = operator-side, NOT builder-embedded).**
- Scope: A repo script: reads a tenant config, extracts user-facing paths, translates via Claude + style guide + glossary, emits the sparse overlay JSON + a QA-harness report. Operator reviews in E4's UI before publish. (Builder has no LLM plumbing; embedding Bedrock into it is deferred until tenant self-service authoring exists.)
- Exit: Script run on the pilot tenant produces an overlay that passes the harness and loads cleanly in E4.

**E6 — Pilot tenant enablement (staging).**
- Scope: Generate (E5), review, publish pilot tenant's Spanish overlay; flip `supported_languages: ["en","es"]` on staging.
- Exit: Pilot tenant's staging widget passes WS-V scenarios.

### WS-V — Release 1 verification

**V1 — Staging E2E bilingual sweep (exit gate for Release 1).**
Scenarios, all on staging with the pilot/test tenant:
1. Embed with `data-lang="es"` → Spanish welcome + chrome before any typing.
2. Spanish browser, no hint → Spanish chrome default; English browser → English.
3. Toggle EN↔ES mid-conversation → chrome + subsequent AI prose + canned copy all follow; toggle beats mirror (type Spanish while toggled EN → prose mirrors only if no explicit choice was made this session).
4. Conversational form end-to-end in Spanish, including a validation failure and post-submission message.
5. Scheduling flow in Spanish: entry copy, day picker, slot selection, booked confirmation line.
6. KB-miss → Spanish fallback message.
7. Messenger: Spanish DM → Spanish reply (mirror, no toggle exists).
8. Full English regression suite untouched (existing tests + snapshot).

---

## 7. Standing translation & QA pipeline (used by C5, E5, 3.2 — and any future string)

1. **Translate with Claude + context** (style guide 0.3, glossary, per-string context: "button label, ≤20 chars, usted"). Context-aware LLM translation beats context-free MT for UI strings.
2. **DeepL back-translation diff:** back-translate the Spanish, diff against English source; meaning drift surfaces without reading Spanish.
3. **Adversarial LLM review:** fresh model instance as skeptical reviewer over the whole catalog at once — mistranslations, register drift, cross-catalog terminology inconsistency, glossary violations.
4. **Mechanical checks (no Spanish required):** `{{token}}` integrity (unit test), length budgets (Spanish ≈ +25–30%; flag overflow), SMS segment counts (UCS-2).
5. **Human pass:** pilot tenant's bilingual staff/volunteers review the catalog (preferred — domain-aware, free); else a one-time professional review (§8) — the static catalog is ~2–3 reviewer-hours.

---

## 8. Resources — third-party vendors

| Vendor / tool | Role | Why recommended |
|---|---|---|
| **Anthropic Claude (via Bedrock — already integrated)** | Primary translator + adversarial QA reviewer | Only option that takes *context* (string purpose, length budget, register, glossary, do-not-translate list) — which is where UI translation quality actually comes from. Also powers the LLM-as-judge review step. No new vendor relationship, credentials, or data-processing agreement: it's the platform's existing model on existing infrastructure. |
| **DeepL API** | Independent second-opinion MT; back-translation diff; formality check | Strongest dedicated machine-translation engine for Spanish. Its explicit formality parameter (formal/informal = usted/tú) doubles as an automated register check. Being a *different* system from the translator removes shared blind spots — the point of step 2 in §7. Free tier (500k chars/mo) likely covers the entire static catalog. |
| **Amazon Translate** | Bulk utility gisting ONLY — Phase 4 `text_en` (Spanish → English for staff views) | Cheap (~$15/M chars), in-account (no data leaves AWS, no new vendor), fast, fine for internal gisting where imperfection is tolerable. **Explicitly NOT for outbound customer copy** — a tier below DeepL/LLMs in quality. |
| **Telnyx (incumbent SMS provider)** | Spanish SMS delivery + opt-out compliance | Already integrated (`SMS_Sender`, consent table). Needed from them: verified behavior on Spanish opt-out keywords (gate G2) and awareness that accented Spanish forces UCS-2 encoding → 70 chars/segment (vs 160), a per-message cost consideration surfaced in the template editors (3.6). |
| **One-time professional human review** (e.g., Gengo per-word review, or a vetted freelance Spanish reviewer) | Final pass on the static catalog if the pilot tenant has no bilingual reviewer | ~200 widget strings + notification templates ≈ 2–3 hours of professional review; low one-time cost for copy sent verbatim to families for years. Pilot-tenant staff are preferred when available (domain- and community-aware). |

**Deliberate non-recommendations:**
- **TMS platforms (Smartling, Lokalise, Crowdin, Phrase):** built for many-language, many-contributor, continuous-localization pipelines. With two locales, operator-authored configs, and an LLM-based pipeline, a TMS adds workflow overhead and per-seat cost with no quality gain. Revisit only if 3+ languages or tenant self-service translation authoring arrive.
- **i18next / react-intl:** unnecessary for a two-locale dictionary; a ~30-line `t()` matches the pattern the codebase already anticipates (D7) and adds zero dependencies to the widget bundle.

---

## 9. Phase 3 — Notifications in Spanish

**3.1 — `preferred_language` stamping chain.**
- Scope: Read the session attribute (written since A1) and stamp `preferred_language` onto: form submission record, lead record, booking record (`Booking_Commit_Handler/booking-store.js` buildBookingItem). Additive; absent = `en`; old-shape fixture tests. **Same PR must update `docs/roadmap/PII-Project/pii-inventory.md`** (Living-Inventory rule — new personal attribute on PII-bearing tables) and classify per data-classification tiers.
- Exit: Spanish staging session → booking row carries `preferred_language: "es"`; old records read fine.

**3.2 — Spanish platform notification defaults.**
- Scope: Language-scoped Spanish defaults for every moment in `shared/scheduling/notif-defaults.js` **and** the Python twin `_SCHED_NOTIF_DEFAULTS` in Analytics_Dashboard_API — the CI byte-parity test extended to cover both languages. Also `notification_templates.json` + `form_handler.py` default form emails. Translations via §7 pipeline.
- Exit: Parity test green across both languages; harness report attached to PR.

**3.3 — DDB template-override language axis.**
- Scope: Design mini-decision (recorded in PR): language-scoped override rows (`moment#es` sort-key suffix) vs lang-suffixed fields on the existing row — pick one, apply forward-compatible reads. ADA read/write support. Send-time resolution implements D5 (tenant-es → default-es → tenant-en → default-en) in `notify.js`, `confirmation-email.js`, `Scheduled_Message_Sender`.
- Exit: Override fixture matrix (es override present/absent × en override present/absent) all resolve correctly; existing single-language tenants unaffected.

**3.4 — Send-time language selection.**
- Scope: All senders read `preferred_language` from the booking/lead (never from session state — reminders fire after the session is gone). Default `en`.
- Exit: Staging: Spanish booking → confirmation + both reminders + reschedule + cancel notices all Spanish; English booking regression unchanged.

**3.5 — Token-value + email-chrome localization.**
- Scope: Locale-aware rendering of date tokens (`{{whenLabel}}`, `{{when}}`) — Spanish month/weekday names via `Intl`/locale-aware formatting in `Reminder_Scheduler`/render paths; Spanish variants of the non-editable email chrome ("Join the meeting"/"Reschedule"/"Cancel", `.ics` "Manage this booking:", sign-off fallbacks) in `confirmation-email.js` and `Scheduled_Message_Sender` action blocks.
- Exit: A Spanish confirmation email contains zero English fragments (chrome, dates, .ics).

**3.6 — Dashboard template editors: language tab.**
- Scope: Both editors — `NotificationTemplatesEditor.tsx` (scheduling moments) and `NotificationsDashboard.tsx` applicant_confirmation — gain an EN/ES switcher: per-language override/default/reset semantics, per-language preview, PATCH carries `lang`, SMS segment counter (UCS-2-aware) displayed for Spanish SMS.
- Exit: Staff can view/edit/reset the Spanish variant of every moment; English editing unchanged; segment counter matches Telnyx billing behavior.

**3.7 — SMS + consent compliance (gate before prod).**
- Scope: Spanish STOP footer per G2 findings; Spanish consent disclosures for forms; settings-panel privacy text translation review. **Communications-consent-advisor review required** (CLAUDE.md PII triggers) before production enablement.
- Exit: Advisor review recorded; Spanish opt-out verified working end-to-end on staging Telnyx number.

**3.8 — Phase 3 E2E sweep (exit gate).**
- Spanish visitor books → every lifecycle message Spanish; toggles-to-English visitor → English messages; tenant with no Spanish overrides → platform Spanish defaults; English tenant fully unaffected.

---

## 10. Phase 4 — Staff experience & analytics polish

**4.1 — Real `text_en` translation at write.** Widget + Meta producers populate `text_en` with an actual English rendering of Spanish messages (Amazon Translate, or Haiku if quality disappoints). Dashboard previews then show English automatically (contract already exists).
**4.2 — Lead/appointment language badge.** Surface `preferred_language` in Lead Workspace + My Appointments (staff know to reply in Spanish; mitigates the English mailto pre-fill mismatch).
**4.3 — Analytics language dimension.** Add `language` to session analytics aggregates + one dashboard breakdown/filter — measures adoption per tenant, informs further investment.
**4.4 — (Conditional on G1) Query translation before retrieval.** Translate Spanish queries to English pre-`retrieveKB`; only if 0.1 showed degradation.
**4.5 — Top Questions language handling.** Group or filter `first_question` by language so the list doesn't interleave.

---

## 11. Compliance & SOP hooks (checklist)

- [ ] PII Living-Inventory update in the same PR as 3.1 (`pii-inventory.md` + classification).
- [ ] Communications-consent-advisor review before 3.7 ships to prod (Spanish consent/STOP/privacy text).
- [ ] Forward-compatible reads + old-shape fixture test in every PR adding a field (D2).
- [ ] notif-defaults JS↔Python parity test extended, never bypassed (3.2).
- [ ] Staging-first everywhere; prod enablement is a separate, gated decision per tenant.
- [ ] Estimates carry the ≈2× new-capability calibration.

## 12. Open decisions (owner: Chris)

1. tú/usted default register (decided in 0.3; current lean: usted).
2. DDB override key shape (decided inside 3.3's design mini-decision).
3. Raw Spanish in staff views acceptable until 4.1? (Current plan: yes.)
4. Pilot tenant selection (drives 0.1 KB choice, E6, and the human-review path in §7).

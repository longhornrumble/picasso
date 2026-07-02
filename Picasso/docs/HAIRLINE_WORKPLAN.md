# Hairline Widget Redesign — Work Plan (multi-agent)

> The living coordination doc for the Hairline build. Agents: read this + [`HAIRLINE_REDESIGN_MAPPING.md`](HAIRLINE_REDESIGN_MAPPING.md) (esp. **§0 fidelity rule**) + [`../design/hairline/DESIGN_SPEC.md`](../design/hairline/DESIGN_SPEC.md) before starting any item. Update your item's **Status** line in the same PR as your work.
>
> Created 2026-07-02. Supporting reference: [`WIDGET_UI_INVENTORY.md`](WIDGET_UI_INVENTORY.md) (current-state), [`TENANT_CONFIG_PIPELINE.md`](TENANT_CONFIG_PIPELINE.md) (config/runtime contracts).

## Ground rules for every agent (anti-drift contract)

1. **Fidelity**: the design spec prevails. Mocked surface → implement exactly. Unmocked capability → design fresh from Hairline vocabulary; NEVER port current-widget visuals. See mapping doc §0.
2. **Functionality is frozen.** This is a re-skin. Do not change: SSE event handling, config section schemas, the CTA click-dispatch semantics, form/scheduling logic, provider routing, endpoints. If your task seems to require a behavior change, STOP and flag it in your PR description instead of doing it.
3. **Own only your files.** Each item lists the files it owns. If you need to touch a file another item owns, coordinate via the workplan (note it in Status) — don't just edit it.
4. **One item per PR** (small items may batch ONLY within the same item ID). PR title: `hairline(W<id>): <summary>`. Branch from `origin/main`. Update this doc's Status line in the same PR.
5. **Definition of done is literal.** Every item lists verifiable criteria. "Looks right to me" is not done; the fidelity check against the spec section/screenshot is.
6. **Tests**: update jest for components you touch (the known-breakage list is in mapping doc §8/inventory §9); never delete a behavioral assertion to make it pass — restyle assertions only (classNames/ARIA/snapshots).
7. **A11y preservation** (inventory §9): icon-button aria-labels, Enter-to-send, form ARIA wiring (`aria-describedby`, `role=alert aria-live=polite`), `:focus-visible` outlines, `prefers-reduced-motion`. New overlays: ESC + outside-tap dismiss. Thumbs: `aria-pressed`.
8. **Coexistence during migration**: old theme.css and new Hairline styles run side-by-side until W6.2. New CSS files + `--tenant-*`/`--ink-*` token namespace must not collide with old `--primary-color`-era names.
9. Decisions D1–D10 (mapping doc §7): items marked `[D#]` are gated. Where a default is recorded, apply the default if the decision is still open when you start; note it in the PR.

**Status vocabulary:** `TODO` · `IN-PROGRESS (<agent/branch>)` · `PR #<n>` · `DONE (<merge sha>)` · `BLOCKED (<what>)`

---

## Phase 0 — Prep (all parallel, no interdependencies)

### W0.1 Dead-code deletion
- **Status:** DONE (1f35f5f)
- **Objective:** remove confirmed-dead visual code so later items never map it.
- **Owns:** delete `src/components/chat/ResponseCard.jsx`, `ResponseCard.css`, `ChatWindow.jsx`, `MessageList.jsx`, `MessageBubble.css`, `MessageBubble.jsx.bak`, `useCSSVariables.js.bak` + their tests/imports.
- **Done when:** `npm run build:staging` + `npm test` green; `grep -r "ResponseCard\|ChatWindow\|MessageList"` in src returns only deletions' absence (no dangling imports).
- **Guardrail:** delete ONLY the listed files. `MessageBubble.jsx` (no suffix) is live — do not touch.

### W0.2 Font self-hosting
- **Status:** DONE (050979a)
- **Objective:** ship the 4-font menu same-origin.
- **Owns:** `public/fonts/` (add `plus-jakarta-sans/`, `lato/` woff2; keep `inter/`; remove `montserrat/`, `poppins/`), `src/styles/fonts.css`.
- **Done when:** dev harness (`test-dynamic.html`) loads each family same-origin (network tab: no external font hosts); weight mapping documented in fonts.css comments (PJS/Inter 400/600/700; **Lato has no 600 → map 600→700**; Arial = system, no files).
- **Guardrail:** do NOT change `--font-family` consumers or theme.css; this item is assets + @font-face only. Keep the esbuild `externalFontsPlugin` absolute-URL behavior intact.

### W0.3 Centralized chrome strings
- **Status:** DONE (b78a4d0)
- **Objective:** one module for all Hairline UI copy (also the future i18n seam).
- **Owns:** new `src/i18n/strings.js` (all fixed copy from DESIGN_SPEC: "Ask a question…", "Common questions", "Settings", group labels, privacy checklist + fine print, "Copied", "Powered by", greeting default, etc.).
- **Done when:** module exists with the spec's exact copy + unit test asserting no empty strings; NOT yet imported anywhere (consumers arrive with their screens).
- **Guardrail:** copy verbatim from DESIGN_SPEC (sentence-case rule); no i18n framework — a plain object.

## Phase 1 — Token foundation (W1.1 → W1.2 → W1.3 sequential; the redesign's keystone)

### W1.1 Tenant ramp derivation engine
- **Status:** PR #637
- **Objective:** `{primaryColor, secondaryColor?, fontKey}` → the 10 `--tenant-*` tokens + font stack. THE hardest artifact — pure logic, no DOM.
- **Owns:** new `src/theme/tenantTheme.js` + `src/theme/__tests__/tenantTheme.test.js`.
- **Spec:** DESIGN_SPEC "Derivation guidance": accent = brand desaturated toward `#fffefb`; tints = accent 6–12% over surface; hairlines 15–25%; composer-border between hairline-strong and tint. **accent-deep MUST reach ≥4.5:1 on `#fffefb`** (darken until true); muted/faint are non-text. Reference input `#a08a4a` must reproduce the spec's Atlanta Angels table within a small tolerance (document the delta). Per D10 default: consume primary only; accept secondary in the signature, unused.
- **Done when:** unit tests pass for matrix: `#a08a4a` (reference), `#10B981`, `#0066CC`, `#AA0066`, near-white, near-black, pure gray — each asserts (a) AA on accent-deep, (b) tint/hairline lightness ordering, (c) all 10 tokens emitted; font map returns the 4 stacks + fallback for unknown values.
- **Guardrail:** no DOM/React; no imports from old `useCSSVariables.js`.

### W1.2 Fixed token sheet
- **Status:** PR #638
- **Objective:** `hairline-tokens.css`: fixed tokens (surface/inks/online/danger/recording), type-scale custom properties, spacing/radius/shadow/motion constants — exactly the DESIGN_SPEC tables.
- **Owns:** new `src/styles/hairline-tokens.css`.
- **Done when:** every value in the file traces to a DESIGN_SPEC table (reviewer diffs file vs spec); imported by `iframe-main.jsx` after existing sheets; zero visual change to the live widget (old classes don't consume it yet).
- **Guardrail:** fixed + reference-default tenant tokens only; no selectors beyond `:root`.

### W1.3 Token injection provider
- **Status:** TODO — after W1.1
- **Objective:** apply `tenantTheme()` output to `documentElement` from the fetched config (name/primary/secondary/font), alongside (not replacing) the old CSSVariablesProvider.
- **Owns:** new `src/theme/HairlineThemeProvider.jsx` + mount point in `iframe-main.jsx` (one-line insertion).
- **Done when:** dev harness shows all `--tenant-*` values on `:root` for a real tenant hash; tolerates configs missing any/all brand fields (falls back to reference defaults; no crash — add an old-shape-config fixture test).
- **Guardrail:** do not modify or remove `useCSSVariables.js` (that's W6.2); read config via the existing `useConfig`/ConfigProvider, no new fetches.

## Phase 2 — Core screens (W2.1 ⊸ W2.2 first; then parallel per file-ownership)

### W2.1 Shell + header `[D1: default = fixed panel, no edge mode]`
- **Status:** TODO — after W1.2/W1.3
- **Objective:** DESIGN_SPEC "Widget Shell" + header (wordmark, sliders icon, ✕; no avatar, no subtitle, no help icon).
- **Owns:** `src/components/chat/ChatHeader.jsx`, shell markup/classes in `ChatWidget.jsx` (container only — not message list, not callout), new `src/styles/hairline-shell.css`.
- **Done when:** desktop panel is 380×min(640px,100vh−48px) inside the iframe (host change is W6.1 — inside-iframe layout must center/fit until then); 2px `--tenant-accent` top border, radius 12, spec shadow; wordmark renders `chat_title` caps at spec type incl. "BIG BROTHERS BIG SISTERS" stress-test fixture; header icons Lucide 15px muted→deep hover; ChatHeader jest updated.
- **Guardrail:** launcher/toggle/callout untouched (out of scope this phase, per spec).

### W2.2 Thread — asymmetric messages
- **Status:** TODO — after W2.1
- **Objective:** DESIGN_SPEC screen 3: user = "YOU" caps label + tinted card (max 85%); bot = wordmark label + plain body; 16px group spacing; **no avatar anywhere**; delete avatar rendering path from the thread.
- **Owns:** `src/components/chat/MessageBubble.jsx` (render/markup ONLY — the `handleCtaClick`/`handleActionClick` dispatchers are frozen logic), `TypingIndicator.jsx` (dots under wordmark label, quiet palette), new `src/styles/hairline-thread.css`.
- **Done when:** streaming + finalized messages render per spec against a live staging tenant; typing indicator matches "Loading" spec note; MessageBubble/TypingIndicator jest updated (ARIA/class assertions restyled, behavior assertions intact — esp. `ctaActionContract.test.jsx` still green).
- **Guardrail:** the sanitizer pipeline, streaming imperative writer, retry logic, and all dispatch handlers are functionality — do not alter. `MessageBubble.jsx` is single-owner: W2.3/W2.7 queue behind this item.

### W2.3 Markdown typography
- **Status:** TODO — after W2.2
- **Objective:** style rendered markdown (lists, links, bold, code, tables) inside bot plain-text at the 13.5px/1.6 `--ink-body` scale; links `--tenant-accent-deep` underline 2px offset.
- **Owns:** markdown rules in `hairline-thread.css` (`.message-text`, `.streaming-formatted` descendants); NO js changes.
- **Done when:** `test-dynamic.html` conversation with lists/links/bold renders cleanly in both streaming and finalized paths; no headers styling needed (backend bans them) but h-tags degrade gracefully if present.

### W2.4 Composer — idle + expanded
- **Status:** TODO — after W1.2/W1.3 (parallel with W2.2)
- **Objective:** DESIGN_SPEC composer states 1–2: pill (+ / placeholder / mic / send), unfilled-until-content send (text OR attachment), pill→radius-18 rect expansion at wrap, controls drop row, auto-grow 4 lines then scroll.
- **Owns:** `src/components/chat/InputBar.jsx`, new `src/styles/hairline-composer.css`.
- **Done when:** all idle/typing/expanded states match spec (200ms expansion, 150ms send fill, spec easings); Enter/Shift+Enter preserved; send not clickable when empty; `aria-label`s intact; mic renders per `features.voice_input` but stays inert `[D4 default: hidden at flip — render behind the flag, no recording]`; InputBar tests updated.
- **Guardrail:** the send path, upload wiring, and form-mode placeholder logic are frozen; the current double-row mode is replaced by the spec's single pill — that IS the design, not a behavior change.

### W2.5 Attach popover + attachment chips
- **Status:** TODO — after W2.4
- **Objective:** DESIGN_SPEC composer states 3–4: two-row popover ("Photo or video" · "File", per feature flags), chip above composer (thumb slot, name, size, ✕), chips stack, send fills when chip present.
- **Owns:** `src/components/chat/AttachmentMenu.jsx`, `src/components/chat/FIlePreview.jsx` (chip form + in-thread rendering can split: chip here, in-thread is W4.4), popover/chip rules in `hairline-composer.css`.
- **Done when:** popover anchors above-left, ESC/outside-tap dismiss, spec shadow/radius; chip matches mock incl. upload progress/error states re-expressed in Hairline; feature-flag gating preserved (4 current options collapse to the 2 spec rows: photo+camera+video → "Photo or video").

### W2.6 Response actions — copy (client-only slice)
- **Status:** TODO — after W2.2
- **Objective:** copy · thumbs row under completed bot replies per DESIGN_SPEC screens 3–4 — **copy functional; thumbs rendered but inert** `[D3: thumbs POST is W5.1]`.
- **Owns:** new `src/components/chat/ResponseActions.jsx` + its rules in `hairline-thread.css`; one mount line in `MessageBubble.jsx` (coordinate w/ W2.2 owner if concurrent).
- **Done when:** copy uses clipboard API on the reply's plain text, "Copied" confirm ~2s per spec; thumbs toggle visually (mutually exclusive, `aria-pressed`) with a no-op handler clearly marked `// W5.1`; renders only on completed (non-streaming) bot messages; unit tests for copy + toggle state.

### W2.7 Suggestion card (CTA rendering)
- **Status:** TODO — after W2.2 (queue on MessageBubble ownership)
- **Objective:** CTAs render as a menu-anatomy card; `_position: 'primary'` row emphasized (tint fill, 700, accent-deep), others standard; arrow `--tenant-accent-faint`; suggestions only under the latest bot message, removed once used.
- **Owns:** `src/components/chat/CTAButton.jsx` (becomes row-card renderer), suggestion-card rules in `hairline-thread.css`.
- **Done when:** V4 tenant on staging shows spec-fidelity suggestion cards; click dispatch table untouched (all action types verified via `ctaActionContract.test.jsx` + manual `start_form`/`send_query`/`external_link`/`show_info` clicks); "disappear once used" replaces disabled-after-click styling; CTAButton jest rewritten.
- **Guardrail:** `_position` contract and `handleCtaClick` semantics frozen.

## Phase 3 — Views

### W3.1 Welcome view + menu card
- **Status:** TODO — after W2.1/W2.2 (NOT parallel with them; touches ChatWidget + providers)
- **Objective:** DESIGN_SPEC screen 1: distinct welcome state (greeting `[D7 default: fixed copy]`, `welcome_message` paragraph, menu card from `action_chips.default_chips` + appended "Common questions" row) replacing the current welcome-bubble+chips presentation; thread begins on first send.
- **Owns:** view-state logic in `ChatWidget.jsx`, new `src/components/chat/WelcomeView.jsx`, new `src/styles/hairline-views.css`; **welcome-seeding touchpoints in the three providers** (`StreamingChatProvider`, `HTTPChatProvider`, `ChatProvider`) — hoist or adjust all three consistently (pipeline-audit watch item).
- **Done when:** first open shows welcome per mock; menu rows dispatch exactly like today's chips (same metadata to backend); returning mid-conversation shows thread not welcome; "Clear all messages" returns to welcome; works on BOTH streaming and HTTP providers; provider tests updated.
- **Guardrail:** chip dispatch payloads (`action_chip_triggered`, `target_branch`…) byte-identical to current.

### W3.2 Common questions overlay
- **Status:** TODO — after W3.1
- **Objective:** DESIGN_SPEC screen 2: dimmed/blurred underlay, overlay card, rows from `quick_help.prompts`; select → close + send as user message. Replaces FollowUpPromptBar.
- **Owns:** new `src/components/chat/QuestionsOverlay.jsx` (+ rules in `hairline-views.css`); deletion of `FollowUpPromptBar.jsx` usage.
- **Done when:** overlay matches mock (inset 18/58, shadow, hover states); ✕/outside/ESC dismiss; selecting sends the prompt exactly as FollowUpPromptBar did; `quick_help.enabled=false` hides the menu row.

### W3.3 Settings takeover `[D5 default: omit offline-sync row until decided]`
- **Status:** TODO — after W2.1 (parallel with W3.1/W3.2)
- **Objective:** DESIGN_SPEC screen 5: single grouped list (Conversation / Preferences / Your data), slide-in 240ms, back-preserves-scroll; wire to EXISTING StateManagementPanel functionality (session stats, history, connection, export→"Download conversations", clear + inline confirm + audit event).
- **Owns:** new `src/components/chat/SettingsView.jsx` (+ rules in `hairline-views.css`); retirement of `StateManagementPanel.jsx` rendering (logic/helpers may be reused as imports).
- **Done when:** every function reachable in the old 3-tab panel is reachable in the new list (or explicitly listed in the PR as intentionally dropped for Chris's sign-off); inline destructive confirm per spec; toast pattern replaced by spec-conformant inline confirms.

### W3.4 Privacy & compliance page
- **Status:** TODO — after W3.3
- **Objective:** DESIGN_SPEC screen 6: checklist card + fine print; "privacy notice" links `config.privacy_notice_url`, **row/link hidden when field absent** (tolerant read).
- **Owns:** new `src/components/chat/PrivacyView.jsx` (+ rules in `hairline-views.css`).
- **Done when:** matches mock; absent-field fixture renders without the link and without errors; copy from `strings.js`.

## Phase 4 — Unmocked surfaces (fresh Hairline treatments; parallel — disjoint files; each needs a design-review pass on staging before DONE)

### W4.1 Conversational forms suite `[D2]`
- **Owns:** `src/components/forms/FormFieldPrompt.jsx`, `CompositeFieldGroup.jsx`, `FormCompletionCard.jsx`, new `src/styles/hairline-forms.css`. **Status:** TODO
- **Done when:** all 8 field types + composite + progress + error/suspended/eligibility + completion card re-expressed in Hairline (menu-card anatomy, spec type/spacing); form logic/validation/submission untouched; forms e2e manually verified via `test-composite-fields.html` + a staging form tenant; form ARIA intact.

### W4.2 In-chat scheduling `[D2]`
- **Owns:** `src/components/chat/SchedulingSlots.jsx`, `SchedulingDayPicker.jsx`, their rules in `hairline-thread.css`. **Status:** TODO
- **Done when:** day strip, slot rows, confirm card, notice re-expressed (suggestion-card anatomy); `scheduling_action` payloads unchanged; snapshots regenerated deliberately.

### W4.3 Showcase card `[D2 — includes keep-or-retire call]`
- **Owns:** `src/components/chat/ShowcaseCard.jsx` + rules. **Status:** BLOCKED (D2)
- **Done when:** per D2 either retired (delete + BSH keeps emitting into a no-op = flag for backend follow-up) or re-expressed in Hairline; ARIA semantics preserved if kept.

### W4.4 In-thread attachments, retry, error/loading states
- **Owns:** in-thread rendering in `FIlePreview.jsx` (coordinate with W2.5 if concurrent), `ErrorBoundary.jsx`/`.css`, `ChatProviderOrchestrator.css`, iframe loading placeholder in `iframe-main.jsx`. **Status:** TODO
- **Done when:** sent image/video/PDF, retry button, error fallback, loading states all quiet-palette Hairline; reduced-motion respected.

### W4.5 Callout re-skin + fullpage + mobile sheet `[D6 default: ≤480 sheet]`
- **Owns:** callout markup in `ChatWidget.jsx` + `ChatWidget.css`, fullpage-mode rules, mobile-sheet rules in `hairline-shell.css`. **Status:** TODO
- **Done when:** callout doesn't clash with Hairline (launcher itself untouched); fullpage mode renders the new shell edge-to-edge; ≤480 full-screen sheet per spec (host-side breakpoint lands in W6.1).

### W4.6 Scheduling page `[D8]`
- **Owns:** `src/components/scheduling/*`, `src/styles/schedule-page.css`. **Status:** BLOCKED (D8)

## Phase 5 — Net-new features (each its own mini-project; gated on decisions)

- **W5.1 Thumbs feedback backend + wiring** `[D3]` — feedback endpoint (backend repo), widget POST with message id, PII/AI-governance advisory pass FIRST. **Status:** BLOCKED (D3)
- **W5.2 Voice recording** `[D4]` — capture UI per spec + transcription backend. **Status:** BLOCKED (D4; default = mic hidden at flip)
- **W5.3 Offline sync** `[D5]` — **Status:** BLOCKED (D5; default = row omitted)

## Phase 6 — Flip (sequential)

### W6.1 Host layer dims + breakpoint
- **Owns:** `src/widget-host.js` (expandedWidth 380, expandedHeight min(640,100vh−48px), mobile sheet ≤480 `[D6]`, edge-mode removal `[D1 default]`). **Status:** TODO — after P2–P4 complete
- **Done when:** open/close/resize verified on staging across desktop/mobile viewports; postMessage protocol unchanged except retired SET_EDGE_MODE `[D1]`.

### W6.2 Old-system deletion
- **Owns:** delete `theme.css`, `useCSSVariables.js`, CSSVariablesProvider path, avatar pipeline, feature-display var machinery, Montserrat/Poppins leftovers; retire legacy `--*` names. **Status:** TODO — after W6.1
- **Done when:** grep proves zero references to deleted vars/files; bundle size drop recorded; full jest green; every screen re-verified on staging post-deletion (the deletion PR is its own regression gate).

### W6.3 Per-tenant verification matrix
- **Owns:** one-off Playwright script under `Sandbox/` (screenshot: tenant × {welcome, thread+CTAs, form, scheduling, settings, privacy, composer states} on staging). **Status:** TODO — after W6.2
- **Done when:** every real tenant config renders every screen without visual defects; Chris eyeball sign-off on the screenshot set.

### W6.4 Flip-window config passes
- **Owns:** operational (no code): populate `privacy_notice_url` per tenant via Config_Manager PUT; chip-label emoji/casing content pass — **execute inside the flip window** (content edits are live-immediate to the old widget, ~5-min caches). **Status:** TODO
- **Done when:** all tenants' configs updated; verified via staging replica.

### W6.5 Prod flip
- **Owns:** the dispatch. Prod deploy via the gated workflow; synthetic monitor watched; rollback = `releases/<sha>` re-sync. **Status:** TODO — Chris-gated
- **Done when:** prod serves Hairline for all tenants; monitor green for 24h.

### W6.6 Trailing cleanup (separate PRs, non-blocking)
- **Owns:** Master_Function `ensure_frontend_fields_hash_only` legacy-branding injection + `_cloudfront` avatar block removal (lambda repo); stale test-*.html harness cull; docs updates (TENANT_CONFIG_SCHEMA etc.). **Status:** TODO — after W6.5

---

## Dependency graph (summary)

```
W0.1  W0.2  W0.3                      (parallel, start anytime)
        │
W1.1 ──► W1.2 ──► W1.3
                   │
        ┌──────────┼────────────┐
      W2.1       W2.4 ──► W2.5  │
        │                       │
      W2.2 ──► W2.3, W2.6, W2.7 (W2.x MessageBubble items queue single-file)
        │
      W3.1 ──► W3.2        W3.3 ──► W3.4   (W3.3 parallel to W3.1)
        │
      W4.1 … W4.6          (parallel, disjoint files; design-review gate each)
        │
      W5.x (decision-gated, may trail the flip)
        │
      W6.1 ──► W6.2 ──► W6.3 ──► W6.4 ──► W6.5 ──► W6.6
```

**Max sensible concurrency:** 3 agents in P0; 1 in P1 (keystone — do not parallelize); 3–4 in P2 (respect MessageBubble single-ownership); 2–3 in P3; up to 5 in P4.

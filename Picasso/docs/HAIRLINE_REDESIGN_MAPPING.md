# Hairline Redesign — Design→Codebase Mapping & Go-Forward Plan

> Produced 2026-07-02 from the design handoff (README + `Chat Widget Redesigns.dc.html`, **Turn 10 = canonical**) mapped against [`WIDGET_UI_INVENTORY.md`](WIDGET_UI_INVENTORY.md). Clean-break decision applies: all tenants flip at once; old look is not preserved. Fidelity: pixel-perfect per Turn 10, production shell dims from the README (mocks are 340×600 canvas-scaled).

## 0. Fidelity rule (governing principle — Chris, 2026-07-02)

**The new design documentation prevails. The new widget should look like the Turn 10 mocks — and nothing like the current implementation.** Do not commingle or conflate:

1. **Where Turn 10 mocks a surface** → implement exactly the mock (colors via tenant tokens, spacing/type/motion per spec). No current-widget visual idiom survives: no filled header, no avatar/seal image, no header subtitle, no "Help Menu" pill, no pill-button CTAs, no current bubble styling.
2. **Where a live capability has no Turn 10 mock** (forms, in-chat scheduling, showcase, markdown, file previews, error states) → the *capability* survives; its *appearance* is designed fresh from the Hairline vocabulary (hairline cards, ink scale, single-accent emphasis, spec type ramp) and reviewed against the mocks. Never port the current component's look as a starting point.
3. **Where a mock shows a capability the codebase lacks** (recording with real capture, thumbs feedback, offline sync) → it goes on the **feature-gap inventory** (§3 NET-NEW rows + D3/D4/D5) and is built as a feature, on its own timeline — visual spec already exists, engineering doesn't. Gap tracking is separate from styling work; the two are never merged into "restyle the old thing."

The old widget is a functional reference (what actions exist, what data flows) — never a visual one.

---

## 1. The design in one paragraph

"Hairline": minimal chrome on a warm off-white surface (`#fffefb`), a **2px tenant-accent top border** as the brand signature, a **caps wordmark instead of any logo image**, hairline-bordered cards for menus/suggestions/settings, an asymmetric thread (tinted card + "YOU" label for the user; plain text + wordmark label for the bot), and a full-featured composer pill (attach, voice, expand-on-wrap, send fills only with content). Icons: **Lucide, 2px stroke** (already the widget's library).

**Tenant brand model (Chris, 2026-07-02 — supersedes the README where they differ):** each tenant's brand identity is authored in the **Picasso config builder** and flows into the tenant config: **company name + primary color + secondary color + font choice from a fixed menu (Plus Jakarta Sans / Inter / Lato / Arial)**. The widget derives its full color ramp from these. Two deliberate deviations from the design README: (a) README says one accent color — the product model is primary **and** secondary (secondary's exact role in the ramp = decision D10); (b) README says single-family Plus Jakarta Sans — the product model is a per-tenant font from the 4-option menu, with Plus Jakarta Sans as the reference/default. The type *scale* (sizes/weights/tracking per the spec) stays fixed; only the family swaps.

## 2. Token architecture: old vs new

This is the "great simplification" confirmed. The ~200-variable runtime system collapses to:

| | Current | Hairline |
|---|---|---|
| Tenant-scoped colors | ~28 `branding.*` fields → ~80 vars | **2 fields** (`branding.primary_color` + `secondary_color`, role of secondary = D10) → 10 derived tokens (`--tenant-accent/-deep/-muted/-faint`, `--tenant-tint/-deep`, `--hairline/-soft/-strong`, `--composer-border`) |
| Fixed colors | blue `#3b82f6` defaults everywhere | ~10 fixed tokens (`--surface`, `--surface-raised`, 5 inks, `--online`, `--danger`, `--recording`) |
| Typography | per-tenant free-text font_family + size/weight vars | per-tenant family from a **fixed 4-option menu** (Plus Jakarta Sans / Inter / Lato / Arial); ~12 fixed styles (spec'd sizes/weights/tracking) |
| Logo/avatar | 6-step URL priority chain + shape + backgrounds | **none — wordmark is the logo** |
| Contrast | runtime white-vs-dark picker per surface | derivation-time AA guarantee on `--tenant-accent-deep` (≥4.5:1 on surface, bold caps only; muted/faint = non-text) |

**New derivation engine** (replaces `lightenColor`/`darkenColor`/`determineContrastColor`): one brand color → desaturate toward surface = accent; darken to AA = accent-deep; lighten steps = muted/faint; mix 6–12% over surface = tints; mix 15–25% = hairlines. This is the single hardest engineering artifact in the redesign: it must produce a usable warm-feeling ramp from *arbitrary* tenant brand colors (emerald `#10B981`, blue `#0066CC`, magenta `#AA0066` are real fixtures) and must be **unit-tested** (ramp shape + AA ratios across a tenant-color matrix) — closing the zero-coverage gap the inventory flagged. Reference values in the spec = Atlanta Angels gold; **no hue from that table may be hard-coded in chrome**.

**Surviving tenant-config reads** (everything else in `branding.*` is tolerated and ignored):

| Config field | Feeds |
|---|---|
| `chat_title` | Wordmark (rendered caps, 11px/700/0.14em) + bot sender label. Stress-tested to "BIG BROTHERS BIG SISTERS" @340px; friendly-short-name policy at onboarding |
| `branding.primary_color` | Seeds the derived ramp (accent family, tints, hairlines) |
| `branding.secondary_color` | Captured at onboarding; ramp role = **D10** (not consumed until defined — must not crash when absent on old configs) |
| `branding.font_family` | Enum: `plus-jakarta-sans` \| `inter` \| `lato` \| `arial` (default plus-jakarta-sans). Unknown/legacy free-text values fall back to the default |
| `welcome_message` | Welcome-view paragraph |
| `action_chips.default_chips` | Welcome menu-card rows (+ fixed "Common questions" row appended) |
| `quick_help.prompts` | Common-questions overlay rows (finite list, no search) |
| `features.uploads/photo_uploads/voice_input` | Composer affordances |
| `cta_definitions` / CTA `_position` | Suggestion card rows; `primary` → emphasized row (tint fill, 700, accent-deep) — the existing backend contract maps 1:1 |
| **NEW:** `privacy_notice_url` | Privacy & compliance page link (needs 4-place sync: Zod + builder type + builder UI + deploy_tenant_stack) |

## 3. Screen-by-screen mapping (design ↔ existing feature)

| Design (Turn 10) | Existing code | Disposition |
|---|---|---|
| Shell: 380×min(640px,100vh−48px), 2px accent top border, radius 12 | `chat-container` + host iframe sizing (`widget-host.js` 360×640) | Restyle + **host dimension change** (§6) |
| Header: wordmark + sliders icon + ✕ (no help icon, no avatar) | ChatHeader (logo div, title, subtitle, gear, ✕) | Rebuild — drop logo + subtitle; keep settings/close handlers |
| **Welcome view**: greeting "Hi there 👋" + welcome paragraph + menu card | welcome_message as first chat bubble + action-chip pills | **Structural change**: distinct `activeView: welcome` state (design's state model: welcome \| thread \| questionsOverlay \| settings \| privacy \| historyList). Menu rows dispatch like action chips do today |
| Common questions overlay (dimmed underlay + card) | FollowUpPromptBar sliding quick-help panel | Rebuild as overlay; same `quick_help` config; row tap sends as user message (same as today) |
| In-flight thread: user = "YOU" + tinted card (max 85%); bot = wordmark label + plain text, **no bubble, no avatar** | MessageBubble (avatar+sender header, `.message user/bot`) | Restyle heavily; delete avatar path entirely; sender labels per casing rule |
| Response actions: copy · 👍 · 👎 under every completed bot reply | **Does not exist** (verified: no clipboard/thumbs code) | **NET-NEW** — copy = clipboard API + "Copied" inline confirm; thumbs = mutually-exclusive toggle + **new backend feedback endpoint** (message id + up/down). Flag: feeds "LLM improvement loop" → PII/AI-governance advisory per CLAUDE.md triggers before build |
| Suggestion card, primary row emphasized | CTAButtonGroup (`cta-primary/secondary` buttons) | Restyle: buttons → menu-card rows; `_position: primary` → emphasized row. Backend contract unchanged. Suggestions render only under latest bot reply and disappear once used (current: disabled-after-click → becomes removed-after-use) |
| Composer idle pill: + / placeholder / mic / send (unfilled until content) | InputBar single/double-row modes | Rebuild — single pill for all states; **double-row mode dies**; send fill-state logic new |
| Composer expanded (pill→radius-18 rect on wrap, controls drop) | textarea auto-grow 20→120px | Rebuild with the pill→rect 200ms animation; auto-grow to 4 lines then internal scroll |
| Attach popover: "Photo or video" · "File" | AttachmentMenu (4-option grid: file/camera/photo/video) | Restyle + consolidate to 2 rows; keep feature-flag gating |
| Photo-attached chip (thumb slot, filename, size, ✕) | FilePreview upload states | Restyle to chip form; chips stack vertically for multiple |
| Recording state (tint pill, red dot, waveform, timer, cancel) | **Mic button is decorative** (verified: no MediaRecorder anywhere) | **NET-NEW** — full capture UI + "send transcribes/attaches per backend capability" = backend scope question (§7 D4) |
| Settings: single grouped list (Conversation/Preferences/Your data), full takeover, slide-in 240ms | StateManagementPanel modal, 3 tabs (History/Settings/Data) | Rebuild as takeover view. Maps: history list ✓ exists, connection status ✓, export → "Download conversations" ✓, clear + inline confirm ✓ (confirm pattern exists), **"Offline sync" toggle = NET-NEW** (current code has PWA/online status only) |
| Privacy & compliance page (checklist card + fine print + tenant policy link) | Data tab privacy info block | Rebuild condensed; needs `privacy_notice_url` (no such field exists today — verified) |
| Typing indicator: three-dot pulse under wordmark label, quiet palette (not mocked) | TypingIndicator (avatar + dots) | Restyle; drop avatar |
| Powered-by: "Powered by [mark] MyRecruiter", 9.5px | ChatFooter (hardcoded prod-S3 logo URL) | Restyle; ship the real MyRecruiter mark as a bundled asset instead of the hardcoded S3 URL |
| Launcher | Host bubble + callout + unread badge | **Explicitly out of scope this phase** — reuse existing (README: "not redesigned in this phase") |

## 4. Capabilities without a Turn 10 mock (designed fresh in Hairline vocabulary)

These are live *capabilities* with no Turn 10 mock. Per the fidelity rule (§0): the capability survives, the current appearance does not — each gets a fresh Hairline treatment (hairline cards, ink scale, single-accent emphasis, spec type ramp) derived from the mocks' vocabulary, reviewed by you/the design director on staging before it ships. The current components are behavioral references only:

1. **Conversational forms** — FormFieldPrompt (8 field types), CompositeFieldGroup, FormCompletionCard, progress bar, eligibility/suspended overlays. Biggest unmocked surface. Natural mapping: form card = hairline card; select-buttons = menu rows; progress = accent hairline.
2. **In-chat scheduling** — day-picker strip, slot chips, confirm card, notices. Natural mapping: slots = menu-card rows or hairline chips.
3. **Scheduling page** (`?mode=schedule`, own `--sp-*` token set) — separate decision (§7 D8).
4. **Markdown typography** — mocks show plain paragraphs; live bot replies contain lists, links, bold, occasionally tables. Need list/link/`strong` styles in the 13.5px/1.6 ink-body scale (`prompt_v4.js` already bans headers — keep). `.streaming-formatted` + `.message-text` selector contract must be re-pointed at the new thread markup.
5. **Sent attachments rendered in-thread** (image/video/PDF preview after send), retry-failed state, error boundary, provider loading states, iframe loading placeholder.
6. **Fullpage mode** and **edge/active mode** (§7 D1), mobile sheet (design: full-screen ≤480px; current host breakpoint is 768 — §7 D6).
7. **Callout teaser + unread badge** styling — launcher is reused, but the callout bubble is drawn from theme.css; it needs at minimum a re-skin to not clash with Hairline.

Content note: existing tenant configs carry **emoji-laden chip labels** ("🎯 Get Started") and the design's casing rule (sentence case everywhere except wordmark/sender labels) — a per-tenant config content pass is part of the flip checklist.

## 5. theme.css / useCSSVariables disposition (per clean-break decision)

- **New files**: `src/styles/hairline-tokens.css` (fixed tokens + Atlanta-Angels-reference defaults for the tenant ramp) and a small `src/utils/tenantTheme.js` (ramp derivation from `primary_color` + injection of the 10 tenant tokens; unit-tested). This IS the `tokens.css` extraction from `docs/roadmap/CSS_DESIGN_SYSTEM_UNIFICATION.md` — name tokens once, Analytics consumes later.
- **New stylesheet(s)** per surface, written to the spec's spacing/shape/motion tables (motion: `cubic-bezier(.4,0,.2,1)` UI / `(.16,1,.3,1)` reveals, 120–320ms, no bounce — matches the MyRecruiter DS).
- `theme.css` (5,184 lines) + `useCSSVariables.js` are **deleted at the end**, surface-by-surface as each screen moves. Also delete: avatar pipeline, `determineContrastColor` (superseded by derivation-time AA), feature-display var machinery that no longer has a consumer, ResponseCard/ChatWindow/MessageList/`.bak` dead code (pre-cleanup PR).
- Keep: body-class responsive machinery (`iframe-mobile` etc. — still needed inside the fixed iframe), sanitizer pipeline, `prefers-reduced-motion` handling (re-implement in new sheets), form/scheduling logic (restyle only).
- **Fonts** (per-tenant 4-option menu): self-host **Plus Jakarta Sans** (400/600/700) and **Lato** woff2 in `public/fonts/` per the existing same-origin pattern — NOT Google Fonts CDN (cross-origin iframe + privacy); **Inter stays** (already hosted); **Arial** is system (no hosting). Montserrat/Poppins removed. Weight-mapping table needed per family: the spec's 400/600/700 scale doesn't exist uniformly (Lato has no 600 → map to 700; Arial → normal/bold). The default/reference family is Plus Jakarta Sans, which also matches the marketing brand.
- **A11y to preserve** (inventory §9): icon-button aria-labels, Enter-to-send, form ARIA wiring, `:focus-visible` outlines (accent), reduced-motion. New: overlay ESC/outside-tap dismissal already spec'd; thumbs need `aria-pressed`.

## 6. Host-layer changes (`widget-host.js`)

- Panel 360×640 → **380 × min(640px, calc(100vh − 48px))** desktop.
- Mobile full-screen sheet at **≤480px** (currently near-fullscreen at ≤768; tablet 480px width tier likely collapses into desktop) — §7 D6.
- Iframe `borderRadius` 12px when open (top border lives inside the iframe).
- Launcher/callout/badge unchanged this phase.
- Edge/adaptive-height "active" mode conflicts with the fixed-height shell spec — §7 D1.

## 7. Decisions needed (blocking items marked ⛔ for Phase-2 start)

- **D1 ⛔ Edge/adaptive-height mode**: current widget grows to full viewport height flush-right after the first message (`SET_EDGE_MODE`). The Hairline shell is a fixed `min(640px, 100vh−48px)` panel. **Default per the fidelity rule (§0): drop it — the design's shell spec prevails** — unless you explicitly want the growth behavior re-specced for Hairline.
- **D2 Forms / in-chat scheduling / showcase cards**: confirm all three are in-scope for the flip (restyled by extrapolation, §4). Showcase especially — keep or retire? **ANSWERED (Chris, 2026-07-02): all in-scope; showcase = KEEP + restyle (W4.3 done).**
- **D3 Feedback (thumbs)**: ship with the flip or fast-follow? Needs a backend endpoint (none exists), an events/storage decision, and a PII/AI-governance advisory pass ("feeds the LLM improvement loop"). Copy-button can ship with the flip regardless (client-only). **ANSWERED (Chris, 2026-07-02): FAST-FOLLOW. Copy shipped in W2.6; thumbs render inert (`// W5.1`); backend + governance = post-flip W5.1.**
- **D4 Voice recording**: mic is decorative today. Options: (a) implement capture + transcription backend (largest net-new lift), (b) ship the recording UI only for tenants with `voice_input` once backend exists, (c) hide mic at flip. Recommend (c) then (a/b) as its own project.
- **D5 Offline sync toggle**: no offline-sync feature exists. Implement, or drop the row from Settings at flip?
- **D6 Mobile breakpoint**: adopt the design's ≤480 full-screen sheet (and retire the 768 tier), or keep 768?
- **D7 Greeting copy** ("Hi there 👋"): fixed product copy or per-tenant field? (If per-tenant: 4-place sync. Recommend fixed, revisit with Spanish i18n which will need these chrome strings localizable anyway.)
- **D8 Scheduling page** (`schedule-page.css`): restyle to Hairline in this program or as a follow-on? It's a standalone token set either way. **ANSWERED (Chris, 2026-07-02): EXCLUDED — it's a standalone webpage, not part of the widget; dropped from this program (W4.6 cancelled).**
- **D9 `privacy_notice_url`**: confirm adding the tenant field (recommended; the page's link needs a destination).
- **D10 Secondary color's role in the ramp**: the design spec derives everything from one accent; the product model captures primary + secondary per tenant. What does secondary drive — e.g. the tint family, a second emphasis slot, or captured-but-unused until the design director assigns it a slot? (Recommend: capture in config builder now; widget consumes primary only until this is answered — avoids inventing a visual role the design didn't define.)

## 8. Cross-system impacts

- **Config builder — explicit simplification workstream (Chris: "that product is going to need to be simplified as well")**: BrandingSettings collapses from ~15 color pickers + free-text font to exactly the tenant brand axis — **company name, primary color, secondary color, font dropdown (4 options)** — plus a live derived-ramp preview so staff see the Hairline palette the colors will produce. CTAPreview/ShowcaseItemPreview re-point at new class names; add `privacy_notice_url`; Zod schema + `deploy_tenant_stack` transform updated to the same shrunken field set in the same program (closes the 3-way field-list divergence the inventory flagged — the new canonical list is small enough to keep in sync).
- **Backend**: feedback endpoint (D3); `prompt_v4.js` formatting rules re-checked against 13.5px/1.6 plain-paragraph presentation (current "no headers, word caps" already matches — likely no change); CTA `_position` contract unchanged.
- **Tests**: known jest breakage list (inventory §9) rewritten per-surface; NEW unit tests: ramp derivation + AA (tenant-color matrix), send fill-state, feedback toggle; snapshot files regenerated.
- **Spanish i18n project**: the redesign introduces/touches most chrome strings ("Ask a question…", "Common questions", "Settings", group labels, privacy copy) — centralize new strings in one module now so the i18n project has a single seam.
- **Docs to update at flip**: TENANT_CONFIG_SCHEMA (both repos), CTA-styling PRDs, showcase docs, config-builder guides.

## 9. Go-forward phases (each = PRs to main → staging soak; prod = one gated dispatch at the end)

- **P0 — Decisions (§7) + prep**: dead-code cleanup PR (ResponseCard, ChatWindow/MessageList path, MessageBubble.css, .bak); self-host Plus Jakarta Sans; centralized-strings module.
- **P1 — Token foundation**: `hairline-tokens.css` + `tenantTheme.js` derivation engine with unit tests across real tenant colors (AA gate). Nothing visual ships yet.
- **P2 — Core**: shell + header + thread (asymmetric messages, markdown typography) + composer (idle/expanded/attach/chip) + typing indicator + copy-button. First visible Hairline on staging. *Watch item (from the pipeline audit): the welcome-message/chips seeding is duplicated across THREE providers (`StreamingChatProvider`, `HTTPChatProvider`, `ChatProvider`) — the welcome-view state change is the one piece of P2/P3 that crosses from components into provider logic; touch all three or hoist the seeding once. Also: the HTTP fallback provider has no showcase support and takes CTAs from the JSON body — that asymmetry is existing functionality; keep it, don't "fix" it during the re-skin.*
- **P3 — Views**: welcome view + menu card, questions overlay, settings takeover, privacy page. The widget reads `privacy_notice_url` **tolerantly** (link hidden when the field is absent) — so the widget program does NOT depend on the config-builder project for the field's authoring UI; populating it per tenant is a P6 checklist item via direct Config_Manager PUT.
- **P4 — Unmocked surfaces** (§4): forms, in-chat scheduling, file-in-thread, retry/error/loading, callout re-skin, fullpage/mobile modes. Design-director review pass on staging.
- **P5 — Net-new per decisions**: thumbs feedback (backend + governance), voice, offline sync — any of these can trail the flip.
- **P6 — Flip**: host dims; delete old theme.css/useCSSVariables + dead branding reads; per-tenant staging verification (every real tenant config × screen matrix, screenshot pass); docs; prod dispatch; monitor synthetic + rollback via `releases/<sha>`. Checklist additions from the pipeline audit:
  - **Populate `privacy_notice_url` for every tenant** via direct Config_Manager PUT before the flip (builder UI not required — that's the separate config-builder project).
  - **Config content passes are LIVE-IMMEDIATE** — chip-label emoji/casing cleanup edits shared config data with no code gate, so the *old* widget shows them the moment caches expire (~5 min). Execute the content pass inside the flip window, not days ahead.
  - **Master_Function cleanup is post-flip, non-blocking**: the `ensure_frontend_fields_hash_only` old-shape branding default-injection and the `_cloudfront` avatar/logo metadata block become dead weight the new widget ignores (tolerant reads). Schedule their removal as trailing cleanup — do NOT couple a Lambda change to the flip deploy.

**Dependencies:** the widget program blocks only on decisions D1–D10 — not on the config-builder simplification project (`docs/roadmap/CONFIG_BUILDER_SIMPLIFICATION.md`). The two meet at exactly two seams: the new-field authoring UI (builder project; widget tolerates absence) and the preview rebuild (builder project, after the flip).

# Picasso Chat Widget — UI Look & Feel Inventory

> **Purpose:** complete inventory of the widget's visual surface and everything impacted by a UI redesign. Produced 2026-07-02 as the baseline for mapping a new design file onto existing features. All paths repo-relative; line numbers current as of this date.
>
> **Decision (2026-07-02): clean break.** No legacy look-and-feel preservation — all tenants move to the new design at the prod flip. theme.css/useCSSVariables get replaced (new slim token set + stylesheet; old files deleted at the end), not pared in place. New code must still *tolerate* old-shape tenant configs (ignore unknown `branding.*` fields, never crash) but consumes only the minimal identity set the new design defines.

---

## 1. Architecture — read this first

Two facts shape everything else:

1. **The widget is a cross-origin iframe, not shadow DOM.** A tiny host script draws only the launcher bubble and iframe frame on the client's page (functional inline styles only, explicitly "NO theme styles"). All real theming lives inside the iframe React app served from `chat.myrecruiter.ai`.

2. **Theming is a runtime CSS-variable system, not static CSS.** `src/components/chat/useCSSVariables.js` injects ~200 CSS custom properties onto `document.documentElement` from each tenant's `config.branding.*` (with computed fallbacks: WCAG contrast-picked text colors, darken/lighten derivations, generated gradients/shadows). `src/styles/theme.css` (5,184 lines) holds the selectors and consumes the variables. **There is no per-tenant stylesheet — every tenant gets the same theme.css; only variable values differ.** A redesign must remain a token system, because every tenant recolors it.

**Build entry points (gotcha):** the deployed `widget.js` is built from **`src/widget-host.js`** (esbuild.config.mjs:326-328). `src/widget.js` is a legacy direct-mount entry that does NOT ship. Root-level `/widget.js` and `/iframe.html` are stale committed build outputs; the real iframe.html is generated from `public/iframe-esbuild.html`.

### Layer map

| Layer | Entry | What it draws | Styling mechanism |
|---|---|---|---|
| Host (client page) | `src/widget-host.js` → `widget.js` | `#picasso-widget-container` div + iframe; sizing/position state machine | Hardcoded inline styles only |
| Iframe app | `src/iframe-main.jsx` → `iframe-main.js` + `iframe-main.css` | Everything else | theme.css + runtime CSS variables |

---

## 2. Host layer — launcher & frame (`src/widget-host.js`)

- **Container**: fixed `bottom: 20px; right: 20px` — **hardcoded on the host**; `branding.chat_position` sets in-iframe `--widget-*` vars, but those are force-overridden to `auto` in iframe context (`useCSSVariables.js:463-467`), so corner placement is effectively host-controlled and not tenant-configurable in embed mode.
- **Size state machine** (host-side, driven by `window.innerWidth` + postMessage):
  - Closed: 56px circle (`borderRadius: 50%`)
  - Open desktop: 360×640 (`expandedWidth/Height` defaults, widget-host.js:18-27)
  - Open + **active** (after first message, desktop): full viewport height, flush-right "edge mode", `borderRadius: 12px 0 0 12px`, sends `SET_EDGE_MODE` to iframe. This is the adaptive-height behavior (spec: `docs/roadmap/WIDGET_ADAPTIVE_HEIGHT.md`).
  - Mobile ≤768: near-fullscreen `calc(100vw-20px)`; tablet ≤1024: 480px wide.
- **Host↔iframe protocol**: `PICASSO_INIT` (carries tenantHash, config, attribution, `hostViewportWidth` for mobile detection), `PICASSO_SIZE_CHANGE`, `PICASSO_EVENT` (CHAT_OPENED/CLOSED, MESSAGE_SENT, SESSION_CLEARED, RESIZE_REQUEST), `SET_EDGE_MODE`. Iframe responds by toggling body classes: `chat-open`, `edge-mode`, `fullpage-mode`, `schedule-mode`, `iframe-mobile/tablet/desktop`, `data-iframe-size`.
- **Launcher icon is hardcoded** — lucide `MessagesSquare`/`X` in `ChatWidget.jsx:572`, not tenant-configurable. Launcher colors ARE tokened (`--widget-gradient`, `--widget-icon-color`, theme.css:1702-1727).
- z-index: host container 10000 (+1000 mobile); in-iframe layers use 999999-family (see §6).

---

## 3. Visual component catalog (the features a new design must cover)

### Chat shell
| Component | File | Renders | Variants/states |
|---|---|---|---|
| ChatWidget (root) | `src/components/chat/ChatWidget.jsx` | Toggle button, unread badge, callout bubble, chat container (header + window + footer), mounts everything below | open/closed; loading; `data-input-mode="single\|double"`; callout visible/dismissed; unread badge when closed |
| ChatHeader | `chat/ChatHeader.jsx` | Header bar: logo (CSS `::before` from `--avatar-url`), title h3, subtitle, settings gear, close X | subtitle optional; settings optional; fullpage strips radius |
| InputBar | `chat/InputBar.jsx` | Auto-resize textarea + send button; double-row mode adds tools row (attach +, mic) | single/double row; send active/disabled; form-mode placeholder |
| AttachmentMenu | `chat/AttachmentMenu.jsx` | Upload popover (file/camera/photo/video grid) | options gated by `features.uploads/photo_uploads` |
| FollowUpPromptBar | `chat/FollowUpPromptBar.jsx` | "Help Menu" toggle + sliding quick-help panel with prompt grid (`config.quick_help`) | closed/opening/open/closing animation states |
| ChatFooter | `chat/ChatFooter.jsx` | Brand footer; **MyRecruiter logo hardcoded to prod S3 URL** (`ChatFooter.jsx:12`), not tenant-configurable | — |
| TypingIndicator | `chat/TypingIndicator.jsx` | Bot avatar + 3 bouncing dots | duration 0.8s streaming / 1.4s not |
| StateManagementPanel | `chat/StateManagementPanel.jsx` | Full settings modal: History/Settings/Data tabs, clear-conversation danger zone, export, toasts | active tab; online/offline; clear-confirm; toast success/error/info |
| Callout bubble | in ChatWidget + theme.css | Proactive teaser bubble near launcher (`features.callout`: text, delay, auto_dismiss) | visible/dismissed/auto-dismissed |

### Message stream
| Component | File | Renders | Variants/states |
|---|---|---|---|
| MessageBubble | `chat/MessageBubble.jsx` | One message row; bot rows get avatar+sender header; body via sanitized HTML (finalized) or imperative streaming render; hosts CTAs, chips, scheduling widgets, showcase cards, attachments below the text | user/bot; streaming vs finalized; retry/retry-failed; avatar error fallback; CTA disabled-after-click |
| CTAButton(+Group) | `chat/CTAButton.jsx` | `cta-button` in group wrapper | primary (brand fill) / secondary (outlined) / info-tertiary from `_position` metadata; responsive 320/768 breakpoints |
| ShowcaseCard | `chat/ShowcaseCard.jsx` | "Digital flyer": hero image, type badge, title, tagline, stats, testimonial, highlights 2-col, primary+secondary CTAs | type program/event/initiative/campaign; all sections optional; hover elevation/zoom |
| FilePreview | `chat/FIlePreview.jsx` (sic) | Attachment preview: image / video / PDF iframe / generic file card with progress bar | uploading/error/complete; cancel while uploading |
| Suggested & action chips | in MessageBubble / theme.css | Pill chips (`.suggested-chip`, `.action-chip`) | disabled; hover |

### Conversational forms
| Component | File | Renders | Variants/states |
|---|---|---|---|
| FormFieldPrompt | `forms/FormFieldPrompt.jsx` | In-chat form card: title/intro/progress bar/"Step X of Y"/field + hint, Submit/Cancel; eligibility-failure and suspended overlays | 8 field types (text/email/phone/number/date/textarea/select-buttons/composite); validation error; suspended |
| CompositeFieldGroup | `forms/CompositeFieldGroup.jsx` | Grouped subfields in one step (name/address; phone+consent buttons+disclosure) | per-subfield errors; consent selected state |
| FormCompletionCard | `forms/FormCompletionCard.jsx` | Success card: checkmark, confirmation copy, submitted-data summary, "What happens next", action buttons | sections conditional; primary/secondary actions |

### Scheduling
| Component | File | Renders | Variants/states |
|---|---|---|---|
| SchedulingSlots (+ConfirmCard, Notice) | `chat/SchedulingSlots.jsx` | Slot chips (reuse `.suggested-chip`), confirm card, inline notice | unselected/selected; confirm pre/post click |
| SchedulingDayPicker | `chat/SchedulingDayPicker.jsx` | Horizontal 7-day chip strip | pre/post selection; disabled while typing |
| SchedulingPage | `scheduling/SchedulingPage.jsx` | **Standalone full-page surface** (`?mode=schedule`): brand header, Calendly-style picker (day chips, month calendar, time rows, confirm bar), success state, collapsible companion chat | purpose new/reschedule/cancel; loading/error/empty; done |
| SchedulingMonthCalendar | `scheduling/SchedulingMonthCalendar.jsx` | Month grid, prev/next nav, window tomorrow…+60d | selected/disabled/nav-bounds |

### Fallback/system
| Component | File | Renders |
|---|---|---|
| ErrorBoundary | `components/ErrorBoundary.jsx` + `.css` | Error fallback panel with reload button; dark-mode + high-contrast + mobile queries |
| ChatProviderOrchestrator | `context/ChatProviderOrchestrator.jsx` + `.css` | Loading/error/fallback/spinner chrome |
| iframe loading/error | `iframe-main.jsx` | Raw-DOM "🎨 Loading Picasso…" placeholder and error panel |

### Legacy / dead visual code (candidates to delete during redesign, not restyle)
- `chat/ResponseCard.jsx` — 100% hardcoded inline styles (`#007bff` etc.); its `ResponseCard.css` is ignored by the JSX; **not on the active render path**.
- `chat/ChatWindow.jsx` + `chat/MessageList.jsx` — alternate window not used by ChatWidget's main path; ChatWindow renders a visible `debug-info` JSON dump (ChatWindow.jsx:74-76).
- `chat/MessageBubble.css` — declares `.message-bubble-*` classes that the live MessageBubble.jsx (which emits `.message`/`.message-text`) never uses.
- `MessageBubble.jsx.bak`, `useCSSVariables.js.bak` — stale backups, not built.

---

## 4. CSS file catalog

| File | ~Lines | Covers |
|---|---|---|
| `src/styles/theme.css` | 5,184 | **The master stylesheet.** `:root` defaults (63-213), typing indicator, file preview, input bar, container/header, message + markdown typography (~1064-1423), streaming, footer, toggle/callout/badge, quick-help, unified button system (2056-2275), chips, dark-mode/high-contrast/reduced-motion, scrollbars, mobile-Safari/PWA, fullpage mode, settings panel (3428-4104), forms (4176-4758), showcase cards (4765-5057), legacy response cards |
| `src/styles/schedule-page.css` | 347 | The `?mode=schedule` page, scoped under `.sched-page`; local `--sp-*` tokens derived from branding vars; emerald `#1f9d6b` fallbacks; uses `color-mix()` |
| `src/styles/fonts.css` | 139 | Self-hosted `@font-face`: **Montserrat, Inter, Poppins only** (400-700, woff2, `font-display: swap`) |
| `src/styles/widget-entry.css` | 115 | Reset, root isolation, z-index 999999, fullpage overrides, print |
| `src/components/chat/ChatWidget.css` | 69 | Loading, callout click/close, root positioning |
| `src/components/ErrorBoundary.css` | 158 | Error panel incl. dark/high-contrast/mobile |
| `src/context/ChatProviderOrchestrator.css` | 114 | Provider loading/error/spinner |
| `src/components/chat/MessageBubble.css` | 132 | Legacy `.message-bubble-*` (unused by live JSX) |
| `src/components/chat/ResponseCard.css` | 315 | Legacy card variants (JSX ignores it) |

CSS ships as one separate file `iframe-main.css` (~102 KB), bundled from the four `src/styles/*` imports in `iframe-main.jsx:19-22`.

---

## 5. The CSS-variable contract (theming levers)

Every variable follows `branding.<field> || <computed> || <hardcoded default>`. Groups set in `useCSSVariables.js:105-445`:

- **Base colors**: `--primary-color` (←`branding.primary_color`), `--primary-light/dark` (computed), `--secondary/font/background/border-color`, status colors
- **Bubbles**: `--user-bubble-color` (←`user_bubble_color||primary_color`), `--user-bubble-text-color` (**WCAG contrast-computed**), `--bot-bubble-color/-text-color/-border`
- **Header/interface**: `--header-background-color` (←`header_background_color||primary_color`), `--header-text-color` (computed), subtitle, `--widget-icon-color`, `--widget-background-color`, link colors
- **Input system**: bg/border/text/placeholder/focus + size/padding/radius vars
- **Typography**: `--font-family` (←`branding.font_family`, default `system-ui`), `--font-size-base/heading/small/large`, weights, line-heights
- **Layout**: `--border-radius` (←`branding.border_radius`, default 12px) + small/large, spacing, padding
- **Dimensions/position**: `--chat-width/height` (360/640) + responsive variants; `--widget-bottom/right/top/left` — **all force-overridden (100%/auto) in iframe mode** (`:447-478`)
- **Avatar/logo**: `--avatar-url` (priority chain `avatar_url→logo_url→bot_avatar_url→icon→custom_icons.bot_avatar→_cloudfront.urls→hash-based S3 path→default`), `--avatar-border-radius` (←`avatar_shape`: circle/rounded/square/hidden), backgrounds
- **Action chips**, **unified button system** (`--button-bg/text/border-primary|secondary|option` + hover, mobile/desktop radii+padding), **callout**, **shadows** (`--primary-shadow` forced `none` in iframe), **gradients**, **animations** (`--transition-*`, `--typing-animation-duration`)
- **Feature-display toggles**: `--upload-button-display`, `--voice-display`, `--action-chips-display`, `--callout-display`, `--notification-display` + body classes `feature-*-disabled` (`:784-815`)
- **Quick-help**, **forms** (`--form-*`), **showcase cards** (`--showcase-card-*`)

**Contrast engine**: `determineContrastColor`/`getContrastRatio`/`getRelativeLuminance` (`useCSSVariables.js:711-763`) auto-pick white vs dark text at WCAG 4.5:1 for every branded surface. **No jest coverage** — validated only manually via `test-wcag-contrast.html`. A redesign that hardcodes text colors bypasses this and regresses silently.

**Fonts caveat**: only Montserrat/Inter/Poppins exist as real webfonts (`public/fonts/`); the `fontLoader.js` referenced in fonts.css comments **does not exist**. Any other `branding.font_family` value falls back to system. New design font = drop woff2 in `public/fonts/` + add `@font-face` + keep the esbuild `externalFontsPlugin` path absolute.

**Defined-but-unused lever**: `:root[data-logo-tone='light'|'dark']` (theme.css:2926-2933) — nothing sets it.

### Hardcoded inline-style hotspots (won't respond to token remapping)
| Location | What's hardcoded |
|---|---|
| `widget-host.js` | All host chrome: corner 20px, sizes, transitions, border-radius states, z-index 10000 |
| `MessageBubble.jsx:979-990` | message-text paint-control style object (display/opacity/contain/etc.) |
| `InputBar.jsx:240,291` | send icon colors `white`/`#94a3b8`; `:22,31` font fallbacks |
| `FormFieldPrompt.jsx:212-237` | suspended overlay colors (`rgba(0,0,0,0.7)`, `#fff`, `#333`) |
| `StateManagementPanel.jsx:233-282` | toast colors `#10b981/#ef4444/#3b82f6` + injected keyframes |
| `SchedulingDayPicker.jsx:148,170` | day-strip flex/overflow/radius inline |
| `ChatWindow.jsx:47-49` (legacy) | header fallbacks `#F3F4F6`/`#1F2937` |
| `ResponseCard.jsx` (legacy) | entire palette incl. `#007bff` |
| `ChatFooter.jsx:12` | MyRecruiter logo prod S3 URL |
| `schedule-page.css` | emerald `#1f9d6b` / danger `#d23b53` fallbacks |
| `iframe-main.jsx:619-639` | fallback config with blue `#3b82f6` branding |
| theme.css `:root` | generic blue `#3b82f6` default system |

---

## 6. Visual behavior outside components

- **Markdown typography**: two render paths — finalized (marked+DOMPurify via `utils/markdownProcessor.js`; allowed tags p/br/strong/em/u/strike/lists/blockquote/code/pre/hr/h1-h6/a/img/table; links forced `target="_top"`) and streaming (MessageBubble's own regex renderer wrapping output in `.streaming-formatted`). New typography must key off `.message-text …` and `.streaming-formatted …` descendant selectors (theme.css ~1064-1423).
- **Animations**: typing-dot bounce, quick-help slide, callout show/hide, showcase hover zoom, spinner, toast keyframes (injected inline), eased custom auto-scroll (cubic, 800ms, `ChatWidget.jsx:322-355`); `prefers-reduced-motion` blocks at theme.css 2650 & 4092.
- **Z-index layers (in-iframe)**: root/containers 999999; chat-container 99998; toggle/header 99999; badge +2; callout 999; quick-help 30; settings overlay 99999; mobile-Safari 1000000; form overlays 10-20.
- **Responsive strategy**: real media queries don't work inside the fixed-size iframe — responsiveness is via **host-set body classes** (`iframe-mobile/tablet/desktop`, `edge-mode`) + container queries (theme.css 2433-2617). `widget_behavior.mobile.*` overrides merge when `hostViewportWidth < 768`.
- **Dark mode / high contrast**: `prefers-color-scheme`/`prefers-contrast` blocks exist in theme.css and ErrorBoundary.css.

---

## 7. Tenant-config appearance fields (runtime contract)

Beyond `branding.*` (§5), fields with visual impact:

| Field | Effect |
|---|---|
| `chat_title` / `branding.chat_title` | Header title |
| `chat_subtitle` / `header_subtitle` | Header subtitle (fallback "How can we help you today?") |
| `welcome_message` | First assistant bubble |
| `branding.brandText` | Footer text |
| `features.uploads/photo_uploads/voice_input` | Input-row buttons |
| `features.action_chips.enabled` | Chip row |
| `features.quick_help` (+`quick_help.title/toggle_text/prompts[]`) | Help panel |
| `features.callout` (enabled/text/delay/auto_dismiss/dismiss_timeout) | Proactive bubble |
| `features.streaming` | Typing animation speed |
| `widget_behavior.start_open/auto_open_delay/remember_state` + `mobile.*` | Open behavior |
| `cta_definitions` / `content_showcase[]` / `action_chips.default_chips` | Button/card/chip content |
| `cta_settings.max_ctas_per_response` | CTA count cap (backend-enforced) |
| `bedrock_instructions.formatting_preferences` | Rendered text style (see §8) |

**Note:** `src/types/config.ts` (`ThemeConfig`/`WidgetConfig`) is aspirational/unused — the runtime reads raw snake_case `branding.*` JSON. Treat as documentation only.

Config fetch: `ConfigProvider.jsx` → `get_config&t=<hash>` via Master_Function; sessionStorage cache (2-min TTL, revalidate on visibility). Real configs live in S3 `myrecruiter-picasso/tenant-configs/{hash}.json`.

---

## 8. External systems that must stay in sync

### picasso-config-builder (staff editing UI)
- **Settings page tabs** edit appearance: `BrandingSettings.tsx` (~15 color/font/position/asset fields), `TenantIdentitySettings` (title/subtitle/welcome), `FeaturesSettings` (callout), `WidgetBehaviorSettings`, `QuickHelpSettings`, `CTASettings`, `BedrockInstructionsSettings`; editors for action chips / showcase / CTAs.
- **Coupling risk — previews hardcode widget class names**: `CTAsEditor/CTAPreview.tsx` (`.action-chip*`, simulated blue) and `ShowcaseEditor/ShowcaseItemPreview.tsx` (`.showcase-card-*`, "same CSS classes from theme.css"). Renaming widget classes silently breaks these previews. There is **no full widget simulator** (PreviewConfigModal renders JSON only) — previews will visually diverge from a redesigned widget with no test catching it.
- **Zod validation** (`lib/schemas/tenant.schema.ts`): hex regex on colors; validates only a ~6-field subset of what the UI writes.

### Backend (Lambdas)
- **Three divergent branding field lists**: Zod schema (~6) ⊂ builder `BrandingConfig` type (~15) ⊂ `deploy_tenant_stack/lambda_function.py:590-677` transform (**~28 fields — the canonical fullest list**). A new appearance field must be added in all three + the BrandingSettings UI.
- **Picasso_Config_Manager** `index.mjs:212-269`: create-tenant defaults (`#10B981` emerald system, `Inter`).
- **Master_Function** `tenant_config_loader.py:392-415`: injects default `branding` when missing; reconciles `chat_title`.
- **Bedrock_Streaming_Handler** owns two UI contracts:
  - `response_enhancer.js`: emits CTAs with **`_position: 'primary'|'secondary'`** (legacy per-CTA `style` field stripped) — the widget's variant styling must keep consuming this metadata; caps count via `cta_settings.max_ctas_per_response`; builds showcase payloads.
  - `prompt_v4.js:194-265`: **hardcodes widget-layout assumptions into the prompt** — "small chat widget… do not use markdown headers", word caps by detail_level, emoji caps. A redesign that changes content affordances (e.g. supports headers or longer text) requires editing this Lambda, not just CSS.

### Design references & divergences
- **`marketing_style_guide`** (repo root): marketing brand = Plus Jakarta Sans, emerald `#50C878` — **diverges from the widget's actual system (Inter, `#10B981`)**. Brand-alignment reference, not the widget's current tokens.
- **`docs/roadmap/CSS_DESIGN_SYSTEM_UNIFICATION.md`**: plan to extract `Picasso/src/styles/tokens.css` as canonical brand-token source consumed by Analytics via `@picasso/tokens`; `picasso-shared-styles/` is an orphan being retired (the widget does NOT consume it); config-builder intentionally allowed to drift. **A widget token refresh is intended to cascade to the Analytics dashboard under this plan.**
- **`docs/roadmap/WIDGET_ADAPTIVE_HEIGHT.md`**: sizing/UX spec for the active-session height behavior (widget-internal only).
- `skills/myrecruiter-brand.skill`: brand guidelines for documents/decks.

### Docs that go stale on redesign (update or flag in the PR)
`Picasso/docs/`: PRD/PROJECT_PLAN_CONTEXT_BASED_CTA_STYLING, PRD/TDD_SHOWCASE_ITEMS_CTA_HUBS, TENANT_CONFIG_SCHEMA.md, FULLPAGE_CHAT_QUICKSTART.md · `picasso-config-builder/docs/`: TENANT_CONFIG_SCHEMA.md, CONTENT_SHOWCASE_IMPLEMENTATION_GUIDE.md · `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/`: CONFIG_BUILDER_INTEGRATION.md (already has stale enums), SHOWCASE_ITEMS_*.md, formatting-analysis docs · `docs/archive/` style-grid references.

---

## 9. Test/QA impact

### Jest (runs in CI `pr-checks.yml`: lint → typecheck → test:coverage; **no e2e, no visual gate**)
**Will break under redesign:**
- `ShowcaseCard.test.jsx` — pins `.showcase-card-*` classes, ARIA (`role=article`, `aria-labelledby`, labeled groups), `data-showcase-*` (very fragile)
- `CTAButton.test.jsx` — pins `cta-button/cta-primary/cta-secondary` + data attrs (~25 assertions)
- `SchedulingSlots.test.jsx` + `SchedulingDayPicker.test.jsx` — DOM assertions **plus Jest snapshots** (`__snapshots__/*.snap` freeze exact markup)
- `MessageBubble.test.jsx` — showcase/ARIA portions fragile; behavior portions safe
- Lighter: `FormCompletionCard` (copy/labels), `SchedulingPage`, `SchedulingMonthCalendar` (testids)

**Watch:** `ctaActionContract.test.jsx` — a source-scan contract that regexes `MessageBubble.jsx` for handled CTA action literals; breaks if the dispatcher is refactored, regardless of markup.

**Safe:** all logic/analytics/config/util tests (no testing-library imports).

**Gap:** the WCAG contrast engine has no unit test — add one when touching the palette.

### Manual/visual verification (all that exists)
- **No Playwright/e2e anywhere renders the widget.** Visual review = staging URL + manual harnesses.
- `test-dynamic.html?t=<hash>` — the useful generic local harness; ~20 other `test-*.html` files are tenant/feature one-offs (forms, composite fields, CTA demos, V3.5/V4 pipelines); several stale (old CF domain `d2noing900kbk5`, hardcoded dist paths).
- `test-wcag-contrast.html` — manual DevTools harness validating white-vs-dark auto-contrast on branded buttons. **A new palette must pass this.**
- Screenshots in `Picasso/` root (Sept 2025) document the current look — useful before/after baselines.

### Accessibility to preserve (redesign must not regress)
- Icon-button `aria-label`s (Send, Add Attachment, Close chat, settings, quick-help close)
- Enter-to-send (not Shift+Enter) in InputBar
- Forms: auto-focus first input, `aria-describedby` error linkage on every field type, `role="alert" aria-live="polite"` errors, `aria-pressed` consent toggles, `role=group`+`aria-labelledby`
- ShowcaseCard semantics (article/labelledby/groups/blockquote/h3)
- `:focus-visible` outlines on chips/CTAs (theme.css:2200-2203), `focus-within` input ring
- `prefers-reduced-motion` and dark-mode/high-contrast blocks
- Runtime auto-contrast (§5)

---

## 10. Ship mechanics (how a UI change reaches users)

- A redesign lands almost entirely in `iframe-main.css`/`iframe-main.js` — **fixed filenames, 1-year immutable object cache**. They refresh only because (a) `iframe.html` (5-min cache) points at them with a new `?v=<timestamp>` per build, and (b) the deploy workflow invalidates CloudFront `/*`. Bypass the workflow and skip the invalidation → stale UI for up to a year.
- Pipeline: PR → `pr-checks.yml` gates → merge → staging deploy (`picasso-widget-staging`, CF `E3G30AUOEJTB36`, **staging.chat.myrecruiter.ai** — the visual-review surface, test tenant MYR384719) → Slack ping → manual `production-approval` gate → prod (`picassocode`, CF `E3G0LSWB1AQ9LP`, chat.myrecruiter.ai) with `releases/<sha>/` archive, smoke + auto-rollback.
- `prod-synthetic-monitor.yml` curls widget.js/iframe.html/health every ~10 min post-deploy.
- Host `widget.js` changes affect all embeds within ~5 min (short-cache path).

---

## 11. Mapping checklist for the design file

When the design arrives, map it against every surface in §3 and confirm:

1. **Launcher states**: closed bubble, callout teaser, unread badge, open transition, edge/active mode, mobile fullscreen
2. **Header**: logo/avatar treatment, title/subtitle, settings + close affordances
3. **Message stream**: user/bot bubbles, avatar+sender header, markdown typography (headings/lists/links/tables/code), streaming state, typing indicator, retry state
4. **Buttons/chips**: CTA primary/secondary/info variants (position-based, not per-CTA styled), action chips, suggested chips, disabled/clicked states
5. **Showcase card**: all optional sections (image/badge/stats/testimonial/highlights/CTAs)
6. **Forms**: all 8 field types, composite groups, consent pattern, progress, error/suspended/eligibility states, completion card
7. **Scheduling**: in-chat day picker + slots + confirm + notice, AND the standalone scheduling page (own token system)
8. **Attachments**: menu popover, file/image/video/PDF previews, upload progress/error
9. **Quick-help panel**, **settings modal**, **footer**, **error boundary**, **loading states**
10. **Modes**: embedded desktop / edge-active / mobile / tablet / fullpage / schedule page; dark mode & high contrast
11. **Tenant theming**: which design values become new token defaults vs stay per-tenant-configurable — the design must be expressed as the CSS-variable system, and any NEW appearance knobs need the 4-place sync (Zod + builder type + builder UI + deploy_tenant_stack)
12. **Content constraints**: if the design implies different text density/headers, `prompt_v4.js` formatting rules must change too

# Hairline Chat Widget — Design Spec (Tenant-Themed, Multi-Tenant)

> **Provenance:** transcribed 2026-07-02 from the design handoff bundle README (design director, 10 iterations). The original bundle lives at [`bundle/`](bundle/) — `Chat Widget Redesigns.dc.html` (exploration canvas; **Turn 10 `#t10` = canonical master set**) and the 11 numbered PNG captures of every Turn 10 screen; **on any discrepancy the original bundle prevails.** (Not included: the canvas runtime `support.js` — the canvas won't render interactively, but its inline markup/styles are readable directly; and `assets/logo-icon.png` — the powered-by MyRecruiter mark asset gets sourced from the brand system when its consumer is built.)
> **Product amendments (Chris, 2026-07-02, supersede this spec where they differ):** (1) tenant brand axis is name + primary + **secondary** color + **font from a 4-option menu** (Plus Jakarta Sans / Inter / Lato / Arial) — not single-color/single-family; type *scale* below stays fixed. (2) See `Picasso/docs/HAIRLINE_REDESIGN_MAPPING.md` §0 fidelity rule and §7 decisions D1–D10. (3) **Header scroll treatment (Chris, 2026-07-03, mirroring the Claude app):** header padding becomes `18px 24px 14px` (spec said no bottom padding), and a ~28px fade + backdrop-blur zone hangs below the header so scrolling content rolls under the headline instead of clipping hard; the welcome view's top padding is rebalanced 34→30px so the greeting clears the fade band at rest (wordmark→greeting rhythm grows to ~44px — accepted cost of the roll-under treatment, confirmed on staging). (4) **Type scale re-based on researched norms (Chris, 2026-07-03):** the table below was drawn/reviewed at desktop distance on a 340px canvas and sat under platform norms (Apple HIG body 17pt; Material 3 body-large 16sp / 14sp minimum; embedded desktop messengers ~14–15px; iOS auto-zooms inputs <16px). **Desktop** reading roles gain +0.5px (body/composer 14, menu rows 14, cards/rows/checklist 13.5, values/danger 13, page titles 13.5; greeting/micro-labels unchanged). **Mobile full-screen sheet** carries its own reading scale via the `iframe-mobile`/fullpage≤480 token overrides in `hairline-tokens.css`: body & composer **16** (also clears the iOS input-zoom threshold), rows/cards/titles 15, values 14, greeting 22, wordmark & group labels 12, sender labels 10, fine print 13/11, powered-by 10.5/11. Micro-chrome (attach popover, chip metadata, "Copied", overlay/confirm titles, showcase internals) intentionally keeps fixed sizes. (5) **Settings "History" and "Download conversations" rows removed (Chris, 2026-07-03):** History was a dead read — nothing ever wrote the archive it listed, and storage is session-only by design; Download exported metadata without message content (and was silently blocked by the iframe sandbox). The Conversation card keeps only "Current session"; "Your data" keeps Storage / Privacy & compliance. Transcript export, if ever wanted, is a new feature through the PII advisory gate.

## Overview

A complete redesign of the MyRecruiter embeddable chat widget — direction named **"Hairline"** — replacing the current heavy, filled-header widget with minimal chrome that accentuates rather than competes with the host (tenant) website: a 2px tenant-gold top border, a caps wordmark instead of a logo image, hairline dividers, and a single accent color doing all emphasis work.

Reference tenant throughout: **Atlanta Angels** (muted gold). Every tenant-specific value is isolated as a token so any org can be themed with a display-name string and accent color(s) — no logo assets required.

The design files are **references created in HTML** — static mockups showing intended look, states, and behavior; NOT production code to copy. Recreate the designs in the widget's actual embed stack using its established patterns and libraries.

## Fidelity

**High-fidelity.** Colors, typography, spacing, radii, and copy in the Turn 10 mocks are final design intent. Recreate pixel-perfectly, substituting tenant tokens where noted. Mock screens are drawn at 340×600 for canvas layout; **production dimensions are in "Widget Shell" below** — treat proportions (not absolute px) as canonical for the shell; treat absolute px as canonical for everything inside.

---

## Widget Shell

- **Panel**: 380px wide × min(640px, calc(100vh − 48px)) tall on desktop; full-screen sheet on mobile (≤480px viewport).
- **Surface**: `--surface` `#fffefb` (warm off-white)
- **Border**: 1px solid `--hairline-strong` `#e8e2ce`; **top border 2px solid `--tenant-accent`** — the gold top edge is the brand signature.
- **Radius**: 12px
- **Shadow**: `0 2px 24px rgba(15,23,42,0.08)` — deliberately soft; the widget should not "float" aggressively above the host page.
- **Layout**: flex column — header (fixed) / content (flex:1, scrolls) / footer (fixed).

## Design Tokens

### Color — tenant-scoped (values shown = Atlanta Angels reference theme)

**Every color in this table is a per-tenant token, not a constant.** The gold exists only because the reference tenant is Atlanta Angels; each tenant's onboarding sets brand color(s) and the full ramp is derived. **Nothing in the widget chrome may hard-code a hue from this table.**

| Token | Value | Use |
|---|---|---|
| `--tenant-accent` | `#a08a4a` | Top border, send button fill, toggles, filled thumb, user-message marker |
| `--tenant-accent-deep` | `#8a7439` | Wordmark, sender label (bot), links, active icons, emphasized suggestion text |
| `--tenant-accent-muted` | `#b4a67a` | Idle header icons, inactive composer icons, "YOU" sender label |
| `--tenant-accent-faint` | `#c3b483` | Arrows on menu rows, unfilled-send arrow |
| `--tenant-tint` | `#fbf8ee` | User message card fill, hover fill, emphasized suggestion row fill |
| `--tenant-tint-deep` | `#f0ecdd` | Active feedback-button fill |
| `--hairline` | `#ede7d3` | Card borders (menu, suggestion, checklist cards) |
| `--hairline-soft` | `#f2eddc` | Row dividers inside cards |
| `--hairline-strong` | `#e8e2ce` | Shell border, user-card border |
| `--composer-border` | `#e3dcc6` | Composer pill/rect border, unfilled send border |

Derivation guidance for other tenants: accent = the org's brand color desaturated toward the surface; tints = accent at ~6–12% over `--surface`; hairlines = accent at ~15–25% over `--surface`. Keep the whole ramp warm against `#fffefb`.

### Color — fixed (all tenants)

| Token | Value | Use |
|---|---|---|
| `--surface` | `#fffefb` | Widget background |
| `--surface-raised` | `#ffffff` | Composer, overlay card, attach chip |
| `--ink` | `#0f172a` | Headings, menu rows, user message text, page titles |
| `--ink-body` | `#475569` | Bot message body |
| `--ink-soft` | `#64748b` | Secondary values, fine print body |
| `--ink-faint` | `#94a3b8` | Placeholders, tertiary values |
| `--ink-ghost` | `#b7ae93` | Powered-by line (warm) |
| `--online` | `#22c55e` | Connection dot |
| `--danger` | `#dc2626` | Clear-messages action + node |
| `--recording` | `#dc2626` | Recording dot |

Contrast note: `--tenant-accent-deep` `#8a7439` on `#fffefb` is ~4.6:1 — passes AA for the small caps labels only because they're bold; do not go lighter for text. `--tenant-accent-muted` and lighter are **non-text** colors (icons ≥15px, decorative).

### Typography

Reference family: **Plus Jakarta Sans** (weights 400/600/700 only). Fallback: `system-ui, sans-serif`. *(Product amendment: family is per-tenant from the 4-option menu; the scale below is fixed.)*

| Style | Spec | Use |
|---|---|---|
| Wordmark | 11px / 700 / tracking 0.14em / caps / `--tenant-accent-deep` | Header tenant name |
| Page title | 13px / 700 / `--ink` | "Settings", "Privacy & compliance" |
| Greeting | 21px / 700 / `--ink` | "Hi there 👋" |
| Body | 13.5px / 400 / lh 1.6–1.65 / `--ink-body` | Bot messages, welcome copy |
| Menu row / message (user) | 13.5px (13px in cards) / 600 / `--ink` | Menu rows, suggestions, user text |
| Sender label | 9px / 700 / tracking 0.12em / caps | Bot label (`--tenant-accent-deep`), "YOU" (`--tenant-accent-muted`) |
| Row label | 13px / 600 / `--ink` | Settings rows |
| Row value | 12.5px / 400 / `--ink-faint` or `--ink-soft` | Settings values |
| Group label | 11px / 700 / `--tenant-accent-muted` | "Conversation", "Preferences", "Your data" (sentence case) |
| Fine print | 10–12px / 400 / lh 1.5–1.65 | Compliance notes |
| Powered-by | 9.5px / 400 / `--ink-ghost` + "MyRecruiter" at 10px / 700 / `#8f8871` | Footer attribution |

**Casing rule (decided explicitly):** caps are reserved for the header wordmark and thread sender labels ONLY. Everything else — page titles, group labels, buttons, chips, powered-by — is sentence case.

### Spacing & shape

- Horizontal page margin: 24px (20px inside overlay/thread contexts)
- Header padding: 18px 24px 0 (welcome) / with 14px bottom + hairline divider on takeover pages
- Menu/settings card: radius 10px, border `--hairline`, rows 12px 15px padding (11px 14px settings), dividers `--hairline-soft`
- Composer pill: radius 999px; expanded composer: radius 18px
- Overlay card: radius 12px, shadow `0 16px 48px rgba(15,23,42,0.16)`
- Message cards (user): radius 10px, padding 10px 13px
- Feedback buttons: 26×26px, radius 8px
- Send button: 30×30px circle
- Icons: Lucide, 2px stroke, rounded caps/joins. Header 15px, composer 15–16px, feedback 13px, row chevrons 13px.

### Motion

Per the MyRecruiter design system: `cubic-bezier(.4,0,.2,1)` for color/UI changes, `cubic-bezier(.16,1,.3,1)` for reveals, 120–320ms, **no bounce or overshoot**. Suggested: overlay fade+scale-in 160ms; composer pill→rect expansion 200ms height animation; send fill/unfill 150ms color; thumb fill 150ms; recording waveform bars animate continuously.

---

## Screens / Views (Turn 10 master set)

### 1. Welcome (`10a Welcome`)

Purpose: first-open state; orient and invite action.
- **Header**: wordmark left; right icon group (gap 14px): settings (sliders icon), close (✕) — all `--tenant-accent-muted`, hover `--tenant-accent-deep`. **No help icon anywhere in the header** (decided: the welcome menu row is the sole questions entry). No avatar/logo image anywhere — the wordmark IS the logo (decided policy; tenants provide a friendly display name, judged at onboarding).
- **Content** (24px margins): greeting "Hi there 👋"; welcome paragraph; then the **menu card** — bordered rounded-10 card, one row per quick action, each row: label left (13.5px/600 `--ink`), arrow right in `--tenant-accent-faint`, hover fill `--tenant-tint`. Rows (reference): Learn about mentoring · Sponsor a family · Request support for your family · Make a donation · Contact us · Schedule a call · **Common questions** (folded into the menu — opens the questions overlay).
- **Footer**: composer (idle, unfilled send — see Composer states) + powered-by line centered beneath: "Powered by [16px MyRecruiter icon] MyRecruiter".

### 2. Common questions (`10a Common questions`)

Purpose: browse the finite FAQ list. Summoned from the welcome menu row.
- Underlay: welcome screen dimmed by `rgba(255,254,251,0.6)` + 2px backdrop blur.
- Overlay card: inset 18px from sides, 58px from top; `--surface-raised`, radius 12, border `--hairline-strong`, shadow above.
- Card header row: "Common questions" (12.5px/700 `--tenant-accent-deep`) left, ✕ right; hairline divider below.
- Rows: plain text 13px `--ink-body`, padding 10px 15px, hover: `--tenant-tint` fill + `--ink` text. **No search input** (decided: list is finite).
- Selecting a question closes the overlay and sends it as a user message.

### 3. In-flight conversation (`10a In-flight`)

Purpose: active thread. **Asymmetric message treatment** (decided; validated against Claude's mobile app):
- Header: wordmark + settings + close — same as welcome (no help icon).
- **User message**: right-aligned, max-width 85%; caps label "YOU" (9px/700/0.12em, `--tenant-accent-muted`, right-aligned) above a **tinted card** — `--tenant-tint` fill, `--hairline-strong` border, radius 10, padding 10px 13px, text 13px `#334155`.
- **Bot message**: left-aligned, no card/bubble; caps wordmark label (`--tenant-accent-deep`) above plain body text 13.5px/1.6 `--ink-body`.
- **Response actions** under every completed bot reply, 9px top margin, left-aligned row, 3px gap, order: **copy · thumbs-up · thumbs-down**. 26×26 radius-8 buttons; idle icon `--tenant-accent-muted`, no fill; hover `--tenant-tint` fill + `--tenant-accent-deep` icon. Thumbs post feedback to the LLM improvement loop; copy copies the reply's plain text.
- **Suggestion card** (bot follow-ups): same anatomy as menu card; **primary suggestion row emphasized** — `--tenant-tint` fill, 700 weight, `--tenant-accent-deep` text; other rows standard. Tapping a suggestion sends it as a user message (re-enters the thread as a "YOU" message).
- Thread spacing: 16px between message groups; content bottom-aligned, scrolls.

### 4. Feedback given (`10a Feedback given`)

State variant of screen 3:
- Thumbed: thumb-up icon fills (`fill: --tenant-accent`), button gets `--tenant-tint-deep` fill + `--tenant-accent-deep` icon. Thumbs mutually exclusive; tap again to clear.
- Copied: "Copied" confirmation (10.5px/600 `--tenant-accent-deep`) appears inline 5px right of the buttons, ~2s, then fades.

### 5. Settings (`10a Settings`)

Purpose: history, preferences, data — **one scrolling grouped list, no tabs** (decided). Full-widget takeover.
- Header: back chevron + "Settings" (13px/700 `--ink`) left, ✕ right; hairline divider.
- Three group labels (11px/700 `--tenant-accent-muted`, sentence case), each above a bordered card:
  - **Conversation**: Current session — "1 message" · History — "None yet" + chevron (drills into past-conversations list).
  - **Preferences**: Connection — green dot + "Online" · Offline sync — toggle (34×20 pill, `--tenant-accent` when on, white 16px knob).
  - **Your data**: Storage — "Session · clears on close" · **Download conversations** (link-style row, download icon, `--tenant-accent-deep` 700) · Privacy & compliance — chevron → screen 6.
- Below cards: **Clear all messages** — trash icon + 12.5px/600 `--danger` text row; beneath it fine print "Logged for audit compliance · can't be undone" (10px `--ink-ghost`). Destructive action requires an inline confirm (confirm/cancel pill pair replaces the row).

### 6. Privacy & compliance (`10a Privacy`)

Purpose: the old long Data form, aggressively condensed (decided).
- Header: back chevron + "Privacy & compliance" + ✕.
- One bordered card, three checklist rows (gold check icon 13px + 13px `#334155` text): All data is encrypted in transit · Audit logging for compliance · Retention varies by data type.
- Below: one paragraph of fine print (12px/1.65 `--ink-soft`): "Exports include conversation metadata and statistics only — message content is never included. See the privacy notice for retention details." — "privacy notice" is a link (`--tenant-accent-deep`, underline, 2px offset) to the tenant's full policy.

### Composer states (`10b`, applies to all screens' footers)

**Idle** — white pill (`--surface-raised`, border `--composer-border`, radius 999, padding 8px 8px 8px 12px, shadow `0 1px 3px rgba(15,23,42,0.05)`), contents left→right with 9px gap: **+** (attach, 16px), placeholder "Ask a question…" (13.5px `#a99e7e`), **mic** (15px), **send** (30px circle). **Send is unfilled when the input is empty** (decided): white fill, `--composer-border` border, `--tenant-accent-faint` arrow. It fills (`--tenant-accent` fill, white arrow) the moment there is content to send — typed text, an attachment, or an active recording.

**Expanded** — when text wraps past one line, the pill relaxes to a radius-18 rounded rect (animated): text block on top (13.5px/1.5 `--ink`, full width), controls drop to a bottom row — + left, spacer, mic + filled send right.

**Attach menu** — tapping + (icon turns `--tenant-accent-deep`) opens a popover anchored above-left: radius-12 white card, shadow `0 12px 32px rgba(15,23,42,0.14)`, two rows (12.5px/600, gold icon + label, hover `--tenant-tint`): "Photo or video" · "File".

**Photo attached** — chip above the composer: radius-10 bordered row — 32px radius-8 `#f5f0e1` thumb slot with image icon, filename (12px/600 `--ink`) + "2.4 MB · ready to send" (10.5px `--ink-faint`), ✕ to remove. Send filled.

**Recording** — pill switches to `--tenant-tint` fill: ✕ (cancel) · red 7px recording dot · live waveform (2px bars, mix of `--tenant-accent` and `#d4c9a8`) · elapsed "0:07" (11.5px/700 `--tenant-accent-deep`) · filled send.

### Header name stress test

"BIG BROTHERS BIG SISTERS" at the wordmark spec clears the header icons at 340px width (Turn 9, `9a Name stress test`). Policy: tenants use their friendly short name; abbreviate case-by-case if ever needed.

---

## Interactions & Behavior

- **Open/close**: launcher button on host page (**not redesigned in this phase — reuse existing**) toggles the panel. ✕ in header closes; state persists per session.
- **Welcome menu rows / suggestion rows / question rows**: tap sends the label as a user message (questions/suggestions) or triggers the mapped flow (menu). All show `--tenant-tint` hover; active = slightly deeper tint.
- **Thread**: autoscrolls to newest; suggestions render only under the latest bot message and disappear once used.
- **Composer**: Enter sends (Shift+Enter newline on desktop); auto-grow up to 4 lines then internal scroll; send unfilled and not clickable when empty.
- **Voice**: mic → recording state; ✕ cancels and restores prior text; send transcribes/attaches per backend capability.
- **Attach**: popover dismisses on outside tap or ESC; selected file shows as chip; multiple chips stack vertically.
- **Feedback**: thumbs mutually exclusive, toggleable; POST to feedback endpoint with message id. Copy uses clipboard API, shows "Copied" ~2s.
- **Settings**: full takeover slides in from right 240ms; back chevron returns to thread preserving scroll.
- **Clear messages**: inline confirm; on confirm, clears thread, logs audit event, returns to welcome.
- **Overlay (questions)**: dismiss via ✕, outside tap, or ESC.
- **Loading**: bot typing = three-dot pulse under the wordmark sender label (not mocked; keep to the same quiet palette).
- **Offline**: Connection row shows gray dot + "Offline"; composer stays enabled if offline sync is on.

## State Management (design's model)

- `panelOpen`, `activeView` (welcome | thread | questionsOverlay | settings | privacy | historyList)
- `messages[]` ({id, role, text, attachments[], feedback: null|up|down, timestamp})
- `composer` ({text, attachments[], recording: {active, elapsed}})
- `suggestions[]` (attached to latest bot message; primary flagged)
- `session` ({messageCount, storage: 'session'}), `history[]` (past conversations metadata)
- `settings` ({offlineSync: bool}), `connection` (online|offline)
- `tenantTheme` ({displayName, accent, …derived ramp}) — injected at embed time
- Feedback + clear actions emit audit-log events.

## Assets

- **No tenant logo assets** — wordmark-as-logo policy (decided: client seals distort at ≤32px).
- MyRecruiter mark: used only in the powered-by line (real logo asset to be bundled — do not hotlink).
- Icons: Lucide (lucide.dev), 2px stroke — sliders, x, chevrons, trash-2, download, check, plus, mic, image, file-text, copy, thumbs-up, thumbs-down, arrow-up.
- Font: Plus Jakarta Sans 400/600/700 (self-hosted in this codebase, not Google Fonts CDN — cross-origin iframe).

## Screenshot index ([`bundle/*.png`](bundle/), numbered in spec order)

`01-welcome` · `02-common-questions` · `03-in-flight` · `04-feedback-given` · `05-settings` · `06-privacy` · `07-composer-idle` · `08-composer-expanded` · `09-attach-menu` · `10-photo-attached` · `11-recording`

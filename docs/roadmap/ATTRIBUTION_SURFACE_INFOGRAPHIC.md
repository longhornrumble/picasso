# Attribution Surface Plan — Monthly Infographic Email

**Parent:** [MISSION_INTELLIGENCE_ATTRIBUTION.md](MISSION_INTELLIGENCE_ATTRIBUTION.md) (foundation F1–F6 prerequisite; Briefing B1 recommended first — the email's CTA lands there)
**Design source (approved 2026-06-11 — "love, love, love"):** [attribution-mockups/attribution-monthly-infographic-mockup.html](attribution-mockups/attribution-monthly-infographic-mockup.html)
**Audience/job:** pushed to org leadership monthly; the forwardable, shareable proof-of-value artifact. Zero login required — the value comes to them.

## Email anatomy (locked)

Wrapped/Grammarly genre, ~620px single column:

1. Brand row + title: "Your {Month}, by the numbers" · prepared for {org}.
2. **Hero (dark gradient): the after-hours stat** — "the night shift you never had to staff" — N conversations after close, with chips (% of all engagement; benchmark chip deferred — see below).
3. **Big three:** conversations (▲ vs prior) · leads delivered · **~staff-hours saved ≈ work-weeks** (no dollars anywhere — locked decision #5).
4. **Channel MVP** trophy card (best converting channel above n-floor, with evidence).
5. **What people asked about** — top-3 topic bars + one "quiet overachiever" note.
6. **Superlatives strip** — fastest application · % self-booked · busiest hour (all computed from existing event timestamps — no new instrumentation).
7. **CTA:** "Read your full {Month} briefing →" + board-packet nudge.
8. Footer: why-you're-receiving-this, settings, unsubscribe, epistemic one-liner.

## Work breakdown

### I1 — Generator
- Monthly EventBridge schedule (first business day, after the month's final aggregate run) → new `Attribution_Recap_Generator` Lambda (dedicated execution role per hard rule): reads the same attribution aggregates payload as Briefing/Numbers, selects template variant, renders email HTML.
- **Production email = table-based MJML build** of the approved design (the mockup is the design spec, not the sendable artifact). Render snapshot tests against the mock.
- Send via existing `send_email` Lambda (SES) with `ses_event_handler` bounce/complaint handling.

### I2 — Variant logic (the genre's hidden traps, addressed up front)
- **Bad month:** lead with the best true thing (there is always one — a placement, a fastest application, an after-hours stat); state the dip honestly mid-email; never spin. Template variants selected by simple rules; shares the Briefing's down-month logic.
- **Small tenant:** below global floors → fewer panels, no rates, still proud ("47 conversations — every one answered"). Never renders an empty superlative.
- **First month:** welcome-flavored variant, no deltas.

### I3 — Recipients, cadence, settings
- Recipients: tenant-configured list (default: dashboard admin users); managed in dashboard Settings alongside existing notification prefs.
- Unsubscribe/settings link mandatory in v1. One email per tenant per month; no re-sends on regeneration.

## Verification
- Staging: trigger generator against the demo tenant → email received; numbers match the Briefing for the same month; all links land (briefing deep-link, settings, unsubscribe).
- Variant fixtures: good month / bad month / small tenant / first month — each renders sane copy, no empty panels, no dollar signs.
- Rendering pass across major clients (Gmail, Apple Mail, Outlook) via MJML output — the design's gradients/cards degrade acceptably.

## Compliance
- **communications-consent-advisor before first send:** operational/service email to org staff (not marketing to supporters) — confirm classification, unsubscribe handling, CAN-SPAM footer requirements.
- **No lead PII in the email** — aggregate stats only (progressive-disclosure principle; inboxes are outside our retention controls).
- pii-inventory update with the new Lambda + any recipient-list storage (Living-Inventory rule).

## Deferred (Phase 2)
- **Cross-tenant benchmark chip** ("top 13% of nonprofits your size") — needs anonymized cross-tenant aggregate design; privacy-clean but a real platform feature.
- Social-share rendition (image card the org can post — the flywheel: their impact proof is our word-of-mouth).
- Quarterly recap variant; per-recipient personalization.

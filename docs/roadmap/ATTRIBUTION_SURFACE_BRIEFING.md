# Attribution Surface Plan — The Briefing

**Parent:** [MISSION_INTELLIGENCE_ATTRIBUTION.md](MISSION_INTELLIGENCE_ATTRIBUTION.md) (decisions + foundation F1–F6 prerequisite; Numbers N1 recommended first — briefing deep-links into it)
**Design source (outline approved; content at v2.1, 2026-06-12):** [attribution-mockups/attribution-briefing-v2-mockup.html](attribution-mockups/attribution-briefing-v2-mockup.html)
**Audience/job:** ED/CEO — defend the spend — the artifact that goes in the board packet.

## Document anatomy (v2.1)

Single readable column, document genre. Five sections, closing on marching orders:

1. **Masthead** — "Your {Month} Briefing · from your AI team member"; primary action **Export for your board packet** (PDF); quiet link "prefer charts? open the numbers →".
2. **Lede** — 3–4 generated sentences: conversations, after-hours count, leads delivered, **staff-hours absorbed (no dollars)**, the month's headline insight.
3. **§01 What happened** — narrative + funnel strip (same component as Numbers).
4. **§02 What it was worth** — *"Your team never worked a night shift. Your mission did."* Dark time-strip (after-hours · staff-hours not hired · work-weeks of coverage — identical band to Numbers' money band) + self-booked % + median first response + confirmed-outcomes invitation. **No estimated dollars — "time is measured, not modeled."**
5. **§03 One story from this month** — anonymized exemplar journey timeline (entry scan → questions → application → self-booked), coda "human staff time spent: zero — until the handshake."
6. **§04 Where they came from** — channels ranked with one-sentence interpretations + quiet proportion bars; below-floor channels say "too early to judge."
7. **§05 What to do next** — three recommendation cards ranked by confidence (Double down / Worth a look / Too early), each with "Why we say this" evidence line.
8. **Epistemic footer** — "every number is something MyRecruiter directly witnessed… no estimated dollars… recommendations held until sample size supports them."

## Work breakdown

### B1 — Briefing view (default landing for the Attribution tab)
- Route: Attribution tab default = Briefing; "open the numbers" → Numbers view. Load-bearing figures deep-link to the corresponding Numbers drill (credibility mechanism: narrative that can always show its work).
- Data: same `GET /attribution/summary` + channels payloads as Numbers (no new aggregates).
- **Narrative v1 = deterministic templates with computed slots** — no LLM. The lede, section headlines, and channel interpretations are template variants selected by rules (e.g., best-channel clause variants; below-floor phrasing). LLM-authored narrative is Phase 2, gated on ai-governance review.
- Recommendations: same server-side rule pack as Numbers (single source — Read/Suggested-move and §05 cards must never disagree).

### B2 — One story (exemplar journey)
- Selection heuristic: completed application, prefer after-hours + self-booked + minted entry point; fall back gracefully (no qualifying session → section renders a aggregate-only variant).
- **Anonymization rules (PII gate):** no name/contact; time, entry point, topic, durations only. pii-data-lifecycle-advisor sign-off on the rendered shape before GA.

### B3 — Board PDF export
- v1: print stylesheet + browser print-to-PDF (the document genre is already print-shaped); dated, paginated, footer with epistemic note.
- v2 (with infographic automation): server-side render (Puppeteer Lambda) so the PDF can be attached to email without a browser.

### B4 — Month variants
- Down-month rule: lede leads with the best true thing, states the dip plainly, never spins (shared template-variant logic with the infographic's bad-month rules).

## Verification
- Staging demo tenant: briefing renders fully from live aggregates; every deep link lands on the right Numbers drill; PDF export produces a clean dated document; numbers identical to Numbers view (same payload, same month).
- Template variants: force up-month / down-month / sparse-tenant fixtures — no section renders nonsense or empty claims.
- §03 renders only anonymized fields (review against B2 rules).

## Compliance
- pii-data-lifecycle-advisor: §03 exemplar shape (B2).
- ai-governance-advisor: only at Phase 2 (LLM narrative).

## Deferred (Phase 2)
LLM-authored narrative + insights · server-side PDF · confirmed-outcomes reporting in §02 (depends on Lead Workspace outcome marking) · quarterly board-pack variant (3-month roll-up).

# Widget Feedback Loop — Capture & Consumption Strategy

**Status:** Parked (post-Hairline-flip; builds on W5.1)
**Origin:** Hairline build session, Chris + build lead, 2026-07-03
**Companion:** capture-side design lives in `Picasso/docs/HAIRLINE_WORKPLAN.md` § W5.1 (agreed same day)

---

## Purpose

The Hairline widget ships thumbs up/down icons under every completed bot reply (rendered today, inert per D3). This doc parks the strategy for what happens *after* a visitor clicks one: how the signal is captured safely and how it is consumed to actually improve the product. It exists so the W5.1 build (post-flip fast-follow) starts from an agreed design instead of re-deriving it.

## Capture design (summary — W5.1 is the source of truth)

Anthropic-style feedback capture, Picasso-shaped:

- **Thumbs-up records silently** (brief inline "Thanks for the feedback" confirm, mirroring the "Copied" pattern). No modal — positive-detail modals add friction and rarely get filled by mid-task visitors.
- **Thumbs-down opens a small optional sheet**: category dropdown + free text, both optional; dismissing still records the bare vote.
- **Categories map to Picasso failure modes**, actionable by a tenant admin: *Answer was wrong* / *Didn't answer my question* / *Couldn't find what I was looking for* / *Something looked broken*. Each points at a fix class — KB gap, CTA coverage, config, UI bug.
- **Data minimization (load-bearing):** the POST carries ONLY the rated exchange (visitor question + rated reply) plus message id, category, free text. **Never the whole conversation** — transcripts can contain names, phones, family/foster-care details (CLAUDE.md PII review triggers apply).
- **Explicit disclosure microcopy** in the sheet stating what is sent and to whom.
- **Per-tenant feedback store**; retention set during the advisory pass.
- **Gate:** the PII/AI-governance advisory pass runs FIRST and may amend this design.

## Consumption model — three tiers, two of which are ours

### Tier 1 — Analytics & triage (no ML; first and biggest payoff)

Aggregate the votes and put a human in the loop:

- Per-tenant thumbs-down rate, sliced by topic/time; spike alerts.
- A triage queue of flagged exchanges for human review (tenant admin and/or MyRecruiter ops).
- The fixes that come out are mundane and high-value: stale KB page, missing CTA, tone-prompt problem, broken formatting.

This is the loop that pays for the feature. It directs human curation; it trains nothing.

### Tier 2 — Evaluation sets (regression protection)

Downvoted exchanges become test cases:

- When the prompt, model version, or KB chunking changes, replay the failed exchanges and check the failure is fixed without breaking what worked.
- Categories make this sliceable — a cluster of *Answer was wrong* reports is a grounding-quality measurement, not just complaints.
- Natural home: extends the existing V4 config-optimization verification-scenario pattern (`skills/V4_CONFIG_OPTIMIZATION.skill` step 6).

### Tier 3 — Model training (NOT ours; recorded for clarity)

At the model labs, thumbs signals feed preference training: human preferences train a reward model, and the LLM is optimized against it (RLHF/DPO). Free text is mostly clustered to mine systemic failure modes rather than trained on directly. Known hazard: self-selected feedback is biased — users reward agreeable, flattering answers, so naive optimization produces sycophancy, not correctness; labs counter with reward-model regularization and human review.

**Picasso does not train models.** Bedrock's models are frozen. Our levers are the KB, tenant config (CTAs, tone), prompts, and model choice — so our loop is Tiers 1+2 by design, not as a lesser fallback. That is also the tenant-facing story: *your visitors' feedback directly tunes your assistant's knowledge base.*

## Phasing (post-flip)

1. **W5.1** — capture: endpoint + widget POST + thumbs-down sheet, behind the advisory gate. (Workplan owns this.)
2. **Loop v1** — Tier 1: feedback table surfaced in the analytics dashboard (counts, rates, category slices, exchange drill-down). Reuses the per-tenant analytics pipeline patterns.
3. **Loop v2** — Tier 2: "replay downvoted exchanges" harness wired into config-change verification; feedback-derived cases added to tenant eval sets.

## Open questions (for the advisory gate / Loop v1 design)

- Retention window for rated exchanges (they contain the visitor's question text).
- Whether tenant admins see raw free-text or a summarized/redacted view.
- DSAR/purge interaction: rated exchanges must be reachable by the existing per-tenant purge path.
- Volume expectations — if feedback is sparse per tenant, category slices may need platform-level aggregation to be meaningful (with tenant separation preserved in storage).

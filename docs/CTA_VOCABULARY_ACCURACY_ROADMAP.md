# CTA Vocabulary Accuracy Roadmap

## Purpose

This document captures the strategy for improving CTA button selection accuracy and link handling in the Picasso v3.5 Tag & Map system. It covers two main areas: making the AI pick better buttons, and clarifying how links should be delivered to users.

---

## Part 1: Improving Button Selection AccuracyA

The v3.5 Tag & Map system gives the AI a predefined vocabulary of buttons to choose from. The AI picks IDs, code maps them to full button objects. The AI's selection quality depends on two levers.

### Lever 1: Shrink the Menu Per Turn (Code-Side Pre-Filtering)

**Priority: High -- this is the bigger lever.**

Right now the AI sees the full inventory every turn. The less it has to choose from, the harder it is to choose wrong. The code already knows conversation state -- it could pre-filter before the AI ever sees the options.

**Example for Atlanta Angels:**

| Turn | State | Vocabulary Shown to AI |
|------|-------|----------------------|
| Turn 1 (fresh) | Nothing discussed | All options: both learns, both queries, both links |
| Turn 2 (Love Box discussed) | Love Box explained | Remove `learn:lb_apply`. AI literally can't offer it. |
| Turn 3 (clicked "How to Get Involved") | Process explained | Remove `query:get_involved`. Only `query:discovery` remains as the commit action. |

The AI can't pick the wrong button if the wrong button isn't on the menu. This moves the intelligence from "hoping the AI follows rules" to "the code only shows valid options."

**Why this works:** It's the same principle as `direct_cta: false` -- forms without that flag never appear as `apply:` buttons. Same concept, extended to conversation state.

**What it requires:**

1. **Session state tracking** -- the frontend passes a `ctas_clicked` array with each request, tracking which CTA buttons the user has clicked during the session:
   ```json
   {
     "session_context": {
       "completed_forms": ["lovebox"],
       "ctas_clicked": [
         { "id": "get_involved", "turn": 2 },
         { "id": "discovery", "turn": 3 }
       ]
     }
   }
   ```

2. **Vocabulary filtering in `buildV3Prompt()`** -- before building the vocabulary block, filter `formEntries`, `queryEntries`, and `linkEntries` arrays based on `sessionContext.ctas_clicked`. Zero prompt text changes, zero latency impact.

3. **Topic tracking (stretch)** -- beyond clicks, track what the AI has already discussed. If the AI explained Love Box in its response (even without a button click), remove `learn:lb_apply` from subsequent turns. This could be done by parsing the AI's response for program mentions, or by tracking which KB topics were retrieved.

**Connects to analytics:** The same `ctas_clicked` data that enables pre-filtering also feeds the analytics pipeline for journey tracking. See [CTA_ANALYTICS_ROADMAP.md](CTA_ANALYTICS_ROADMAP.md).

### Lever 2: Better Descriptions (Config-Side)

**Priority: Medium -- complements Lever 1.**

The vocabulary descriptions currently tell the AI *what* each button is. They should also hint at *when* to offer it.

**Current (generic):**
```
Explore:
  learn:lb_apply — Tell them more about Love Box
  learn:dd_apply — Tell them more about Dare to Dream
Commit:
  apply:lb_apply — Love Box application form
  query:get_involved — How to Get Involved
  query:discovery — Schedule Discovery Session
```

**Improved (intent-aware):**
```
Explore:
  learn:lb_apply — They're curious about Love Box but haven't heard details
  learn:dd_apply — They're curious about Dare to Dream but haven't heard details
Commit:
  apply:lb_apply — They've learned about Love Box and want next steps
  query:get_involved — They want to understand the volunteer process (offer before explaining it)
  query:discovery — They're ready to schedule (offer after they understand the process)
```

These are short enough to avoid latency impact but give the AI intent signals that work with the W5 WHO/WHY reasoning.

**What it requires:**

1. Update `available_actions` in tenant configs with better descriptions
2. Modify vocabulary builder in `buildV3Prompt()` to use the description field instead of (or in addition to) the label
3. No prompt structure changes

### Implementation Order

| Step | Work | Lever | Effort |
|------|------|-------|--------|
| 1 | Update vocabulary descriptions in tenant configs | Lever 2 | Small |
| 2 | Modify vocabulary builder to use descriptions | Lever 2 | Small |
| 3 | Add `ctas_clicked` to frontend session context | Lever 1 | Medium |
| 4 | Add vocabulary pre-filtering in `buildV3Prompt()` | Lever 1 | Medium |
| 5 | Add topic tracking (stretch) | Lever 1 | Larger |

---

## Part 2: Link Handling Strategy

### The Problem

The KB markdown files are scraped from websites and contain dense link content: navigation menus, footer links, inline CTAs, donate buttons, program pages -- often 15+ links per section, many repeated across every page. When Bedrock retrieves a chunk, the LLM sees all those links in its context window.

The v3.5 prompt currently says "Never put links in your text" to keep the response clean for CTA buttons. But this creates a conflict: informational referral links (like "check out our events page") are useful in-text, while action links (like "Apply Now") belong as CTA buttons.

### The Three-Layer Solution

**Layer 1: KB Refinement (at scrape/author time)**

When creating the .md files that feed the RAG knowledge base, curate links deliberately. Instead of raw scraped content with nav menus and donate buttons on every section, the refined KB should have one clean referral URL per topic:

```markdown
## Love Box Program
Love Box connects volunteers with local fostering families for ongoing
relationship-based support. Volunteers commit to monthly visits...

For more details: https://www.nationalangels.org/lovebox.html
```

Not the 15+ scraped nav/footer/CTA links that currently repeat per section.

**Layer 2: CTA Vocabulary (conversion actions only)**

Strip most `link:` entries from `available_actions`. The CTA vocabulary should be almost entirely:
- `learn:` -- deepen understanding of a program
- `apply:` -- start a form
- `query:` -- trigger a guided flow (get involved, discovery)

Informational links (events, jobs, research, program detail pages) surface naturally through the KB when the user asks about those topics. They don't need to be CTA buttons.

If a link is truly a conversion action (donate is arguably one), it can stay. But things like events, contact, and program detail pages belong in KB responses, not in the button tray.

**Layer 3: Prompt Adjustment (minimal)**

One line change in `buildV3Prompt()`:

**Current:** `"Never put links in your text"`

**New:** `"Include referral URLs from the knowledge base when relevant. Never create action buttons or CTAs in your text."`

This lets the LLM say "you can learn more at nationalangels.org/lovebox" when contextually appropriate -- the link came from the KB, not from the CTA vocabulary.

### The Result

Links and CTA buttons serve different purposes and never overlap:

| Channel | Purpose | Source | Example |
|---------|---------|--------|---------|
| **Inline link** | "Here's where to learn more" | KB content | "check out the events page at nationalangels.org/events" |
| **CTA button** | "Here's your next step" | Vocabulary | [How to Get Involved] [Learn About Dare to Dream] |

The AI doesn't have to choose between putting a link in text vs. a button. They're different things. Referral links inform. CTA buttons convert.

### What Changes

| Change | Type | Effort |
|--------|------|--------|
| Soften "never put links" prompt rule | Prompt (1 line) | Minimal |
| Trim `link:` entries from tenant configs | Config | Small |
| Curate KB .md files with clean referral URLs | Content authoring | Per-tenant, ongoing |

---

## Key Lesson from v71-v76 Iteration

**Business logic must be handled in code, not prompt rules.**

During v71-v76 iteration, adding even small constraining rules to the prompt ("Buttons must continue the user's current conversation path") caused 3-5x latency regression (2.8s to 13.6s first token). Haiku 4.5 thinks harder when given more constraints.

Both levers in this roadmap follow that lesson:
- Lever 1 (vocabulary pre-filtering) is pure code -- zero prompt changes
- Lever 2 (better descriptions) extends existing config data -- no new prompt rules
- The link handling change is a loosening (fewer restrictions), not an addition

---

*Created: 2026-02-16 | Context: Picasso v3.5 Tag & Map CTA system (Lambda v76)*
*Related: [CTA_ANALYTICS_ROADMAP.md](CTA_ANALYTICS_ROADMAP.md)*

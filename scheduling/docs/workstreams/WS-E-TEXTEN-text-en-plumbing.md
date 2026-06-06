# WS-E-TEXTEN — `text_en` write plumbing (E1a/E1b)

**Plan task(s):** E1a + E1b. [implementation plan](../scheduling_implementation_plan.md) §7.
**Repo / branch / base:** `lambda` (E1a) + `picasso-analytics-dashboard` (E1b) · `feature/scheduling-ws-e-texten` (lambda) + `feature/scheduling-ws-e-texten-dash` (dashboard) · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **light** (additive copy field, no logic/auth/PII surface).
**⚠ CORRECTED 2026-06-05 (§E5 seam dry-run): only ONE turn-text write site exists — NOT three, NOT solo-first, no collision.** Build it standalone whenever.

## Goal / done-bar (verifiable)
- **E1a:** add an additive `text_en` field (v1: `text_en = text`, verbatim copy) at the **ONE real turn-text write site** per §E5: `Master_Function_Staging/conversation_handler.py:768` (the `content` write to `picasso-recent-messages`). BSH (session-summaries) + Analytics_Event_Processor (events) are NOT turn-text writers → OUT OF SCOPE. Unit test: the record carries `text_en === text`.
- **E1b:** the dashboard read-path prefers `text_en`, falls back to `text` when absent (`text_en ?? text`). Unit test: renders correctly for both old-shape (no `text_en`) and new-shape records.
- **CO-DEPLOY GATE:** E1b's CI completes/merges BEFORE E1a merges (no window where writers emit `text_en` but the dashboard isn't reading it).

## You OWN (create/edit ONLY these — additive, surgical)
- lambda: the `text_en` field add at `Master_Function_Staging/conversation_handler.py:768` ONLY (do not refactor surrounding logic) + its unit test.
- dashboard: the read-path `text_en ?? text` fallback + its test.

## You CONSUME (frozen — never modify)
- **§E5** (the `text_en` write contract). **§A** record shapes (read defensively, schema discipline).

## You PRODUCE
- The `text_en` field on every conversation-turn write (the dashboard + analytics readers depend on it).

## OUT OF SCOPE / do NOT
- Do NOT add real translation — v1 is a verbatim copy (`text_en = text`).
- Do NOT touch BSH session-summaries or Analytics events (NOT turn-text writers); add the field at the ONE site only; do NOT touch shared docs.
- Do NOT reorder the co-deploy gate (E1b before E1a).

## References
- Plan E1a/E1b; canonical §15.5 / Risk 7; `feedback_super_admin_codeploy.md` (co-deploy precedent); `CLAUDE.md` (schema discipline).

## Report-back (in your PR)
- Two PRs: `feat(scheduling): WS-E-TEXTEN E1a text_en writers` (lambda→main) + `…E1b dashboard read-path` (dashboard→main). Note the co-deploy ordering.
- Doc-snippet: plan E1a/E1b status; confirm `text_en === text` at all 3 writers + the dashboard fallback. Flag any 4th writer you discover.
- Branch, PR#, done-bar status, any contract issue (STOP + flag, don't fork).

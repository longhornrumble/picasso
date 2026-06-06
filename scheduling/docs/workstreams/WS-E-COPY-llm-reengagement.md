# WS-E-COPY — LLM re-engagement copy + compliance injection (E7)

**Plan task(s):** E7. [implementation plan](../scheduling_implementation_plan.md) §7.
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-e-copy` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **FULL** (LLM output + mandatory compliance-element injection — the compliance elements must ALWAYS be present; verify adversarially). Primary agent: Data-AI-RAG.

## Goal / done-bar (verifiable)
A re-engagement copy generator (§11.4): an LLM-prompted (NOT hardcoded-template) message via Bedrock, with **programmatic compliance injection** that guarantees the required structural elements regardless of what the model returns.
1. The prompt produces diplomatic re-engagement copy (no-show / missed-event re-outreach to the volunteer).
2. **Programmatic injection (not model-trusted):** the reschedule link, `STOP` opt-out, and unsubscribe affordance are injected into the required output structure AFTER generation — they are present even if the model omits them.
3. Tone is diplomatic; never blames the volunteer; never uses "no availability" framing.

- **Done-bar:** unit tests assert the compliance elements (reschedule link + STOP + unsubscribe) are ALWAYS present in the final output across varied model responses (including a stubbed empty/adversarial model reply); tone-snapshot tests for the diplomatic copy.

## You OWN (create/edit ONLY these)
- the re-engagement copy module (prompt template + the post-generation compliance-injection wrapper) + tests. (Confirm the BSH-vs-standalone home with the integrator at launch — mirror the V4.0 Action-Selector focused-call pattern if in BSH.)

## You CONSUME (frozen — never modify)
- Bedrock (existing model invocation pattern), **§E4** (the missed-event escalation that consumes this copy), **§E3** (the SMS body must carry STOP — coordinate the affordance with the channel gate).

## You PRODUCE
- The re-engagement copy generator (WS-E-ATTEND / E10 escalation consumes it).

## OUT OF SCOPE / do NOT
- Do NOT hardcode the copy as a static template — it must be LLM-prompted with programmatic compliance injection.
- Do NOT trust the model to include STOP/links — inject them programmatically.
- Do NOT build the escalation cadence (WS-E-ATTEND/E10) or the dispatch (WS-E-REMIND).

## References
- Plan E7; canonical §11.4; FROZEN §E3/E4; `CLAUDE.md` (ai-governance routing, TCPA). `ai-governance-advisor` may advise.

## Report-back (in your PR)
- PR `feat(scheduling): WS-E-COPY re-engagement copy + compliance injection (E7)` → main. **Flag for the FULL audit (compliance-injection invariant).**
- Doc-snippet: plan E7 status; confirm the compliance elements are programmatically guaranteed (the adversarial-model test).
- Branch, PR#, done-bar status, any contract issue (STOP + flag, don't fork).

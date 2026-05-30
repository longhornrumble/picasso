# WS-C2 — Bedrock form-data injection (§5.6)

**Plan task:** C2 — [plan](../scheduling_implementation_plan.md) row C2.
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-c2` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **FULL** (prompt-injection surface).

## Goal / done-bar
- Bedrock_Streaming_Handler fetches same-session form submissions via the `tenant-session-index` GSI, **sanitizes** (escape JSON, strip control chars, cap field lengths, reject structural-injection markers), and injects them as a `<user_application_context>` block so the LLM can skip the qualifier.
- **Unit test per sanitization step.** **Red-team test: the 4 §5.6 attack cases all fail to compromise the prompt.**

## You OWN (create/edit ONLY these) — [proposed; integrator confirms in §4.0]
- `Bedrock_Streaming_Handler_Staging/scheduling/formInjection.js` + `__tests__/formInjection.test.js`
- The single BSH handler call-site that invokes it (you are the ONLY workstream touching BSH this wave — flag the call-site + any `package.json` dep in your PR so the integrator confirms no overlap).

## You CONSUME (frozen — never modify; [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md))
- §A `tenant-session-index` GSI (query by `(tenant_id, session_id)`). §B5 the `<user_application_context>` block shape.

## You PRODUCE
- §B5 (the context-block shape) — keep it stable; WS-EUI/analytics may key off it later.

## OUT OF SCOPE / do NOT
- Do NOT change the GSI or the form_submissions schema. Do NOT touch any other Lambda or shared doc. The fetch is read-only.
- Forward-compatible reads (CLAUDE.md): tolerate submissions missing any field.

## References
- Canonical §5.6 (the injection mechanism + the 4 required red-team cases). Plan C2. `CLAUDE.md`.

## Report-back
- PR `feat(scheduling): WS-C2 form-data injection (§5.6)` → main. Snippet: plan C2 row → 🟡/🟢 + red-team result. Flag the BSH call-site edit to the integrator.

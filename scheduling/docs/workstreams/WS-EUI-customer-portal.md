# WS-EUI — Customer Portal UI surfaces (early E)

**Plan task:** E10–E16 (the UI-plan surfaces integrated into sub-phase E). [plan](../scheduling_implementation_plan.md) §7.
**Repo / branch / base:** `picasso` · `feature/scheduling-ws-eui` · base `staging`.
**Quality gate:** `verify-before-commit` · weave audit = **light** (additive UI; no backend/auth change) — UNLESS it renders user-generated content, then add an XSS pass.

## Goal / done-bar
- Build the Customer-Portal surfaces that depend only on the **data contract** (Booking schema + status vocabulary), not on C8's commit internals: the status/booking views + the operational-debt surface (UI-plan Surfaces 1/2/3/7/8/9 per the plan E10–E16 mapping).
- Renders against the **WS-FIX synthetic fixture** + the Booking schema; component tests for each surface; a11y + the design-system tokens (`picasso-shared-styles`).

## You OWN (create/edit ONLY these) — [proposed; integrator confirms the frontend home in §4.0]
- The Customer-Portal frontend component files + their tests. **The frontend home is the most uncertain ownership boundary — DO NOT START until the integrator confirms whether this is the Picasso widget, a new portal app, or the config-builder, and assigns the exact directory.**

## You CONSUME (frozen — never modify; [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md))
- §A Booking schema + Booking.status vocabulary (render the 5 states); the WS-FIX fixture for test data. Treat the booking shape as read-only contract.

## OUT OF SCOPE / do NOT
- Do NOT build backend reminder logic (that's E's backend, post-C8). Do NOT depend on C8 being live — render from the schema + fixture. Do NOT touch any Lambda or shared doc.
- Forward-compatible reads: tolerate Booking rows missing optional fields (CLAUDE.md schema discipline).

## References
- Plan §7 (E10–E16) + the UI plan it references. `marketing_style_guide` + `picasso-shared-styles` for tokens. `CLAUDE.md`.

## Report-back
- PR `feat(scheduling): WS-EUI customer-portal surfaces` → staging. Snippet: plan E10–E16 → 🟡. **First message to integrator: confirm the frontend home before building.**

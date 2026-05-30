# WS-EUI — Customer Portal UI surfaces (early E)

**Plan task:** E10–E16 (the UI-plan surfaces integrated into sub-phase E). [plan](../scheduling_implementation_plan.md) §7.
**Repo / branch / base:** `picasso` · `feature/scheduling-ws-eui` · base `staging`.
**Quality gate:** `verify-before-commit` · weave audit = **light** (additive UI; no backend/auth change) — UNLESS it renders user-generated content, then add an XSS pass.

## Goal / done-bar — **SCOPED BY INTEGRATOR 2026-05-30 to E12 + E15 (render-only)**
- **THIS slice = E12 + E15 only:** the **My Bookings** list/status views (E12) + the **operational-debt metrics** surface (E15) — net-new, render-only from §A Booking schema + 5-state status vocabulary + the WS-FIX fixture. These match the light-weave/additive-UI gate.
- **DEFERRED to integrator-sequenced follow-ups (NOT this slice):** E11 Calendar Connection (OAuth + Secrets Manager + revocation = backend+Security workstream, pairs w/ B5), E13/E14 (extend EXISTING `TeamManagement.tsx`/`NotificationPreferences.tsx` — edit-existing, collision risk, sequenced solo), E16 Calendar embed (per-staff OAuth iframe, depends on E11). Reason: those carry backend/auth/edit-existing surface that breaks "additive UI, no backend/auth change, create new files only."
- Renders against the **WS-FIX synthetic fixture** + the Booking schema; component tests for each surface; a11y + the design-system tokens.

## You OWN (create/edit ONLY these) — **CONFIRMED BY INTEGRATOR 2026-05-30**
- **Home: `picasso-analytics-dashboard`** (React 19 / Vite 7; Clerk auth; deploys S3 `app-myrecruiter-ai` + CloudFront `EJ0Y6ZUIUBSAT`).
- **Create ONLY net-new files** under `picasso-analytics-dashboard/src/pages/scheduling/` + `picasso-analytics-dashboard/src/components/scheduling/` + their colocated tests.
- **Do NOT touch** `TeamManagement.tsx`, `NotificationPreferences.tsx`, `NotificationsDashboard.tsx`, or any existing file.
- **Reuse (read, never edit):** the Clerk role model (`admin`/`super_admin` → "admin"; `member` → "staff"), `VITE_ANALYTICS_API_URL`, and the inlined `./styles/tokens.css`.
- **Live data is a deferred backend follow-up:** build presentational components rendering the §A Booking shape with the data-fetch behind a hook/stub (fixture-driven) so wiring a future `Analytics_Dashboard_API` scheduling read-endpoint is a one-line swap.

## You CONSUME (frozen — never modify; [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md))
- §A Booking schema + Booking.status vocabulary (render the 5 states); the WS-FIX fixture for test data. Treat the booking shape as read-only contract.

## OUT OF SCOPE / do NOT
- Do NOT build backend reminder logic (that's E's backend, post-C8). Do NOT depend on C8 being live — render from the schema + fixture. Do NOT touch any Lambda or shared doc.
- Forward-compatible reads: tolerate Booking rows missing optional fields (CLAUDE.md schema discipline).

## References
- Plan §7 (E10–E16) + the UI plan it references. `marketing_style_guide` + `picasso-shared-styles` for tokens. `CLAUDE.md`.

## Report-back
- PR `feat(scheduling): WS-EUI customer-portal surfaces` → staging. Snippet: plan E10–E16 → 🟡. **First message to integrator: confirm the frontend home before building.**

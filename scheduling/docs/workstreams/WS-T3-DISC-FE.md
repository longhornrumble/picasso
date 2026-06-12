# WS-T3-DISC-FE — calendar Disconnect (dashboard UI)

Plan task: A6 tail / §E11 remaining scope. Repo/branch/base: picasso-analytics-dashboard · `feature/scheduling-t3-disconnect-fe` · base `main`. **Merge = PROD deploy → OPERATOR-ONLY merge.**
Quality gate: verify-before-commit (always) · weave audit = full (auth-adjacent UI; prod-deploying repo).

## Goal / done-bar (verifiable)
1. `CalendarConnection.tsx`: a Disconnect button visible when `status.status ∈ {'connected','stale_connected'}`; confirm step (native `window.confirm` acceptable v1) with copy stating bookings stop routing to this calendar and existing events are NOT deleted; on confirm → `disconnectCalendarConnection()`; success → status flips to disconnected + success banner; failure → inline error + retry. Tests for every branch incl. cancel-at-confirm.
2. `schedulingApi.ts`: `disconnectCalendarConnection()` → Clerk-authed `POST /scheduling/connection/disconnect` (§E11b ADA endpoint; follow the existing `schedulingWrite`/init-fetch patterns — auth header, error normalization via `SchedulingApiError`).
3. No regressions: full scheduling test suite + tsc + lint + build green (the repo lints `react-hooks` strictly — no render-time side effects; the lint-failure lesson from dash#28).
4. Friendly errors only — never raw URLs/internals (the errMessage pattern shipped in dash#28).

## You OWN (create/edit ONLY these)
- `src/components/scheduling/CalendarConnection.tsx` + `src/components/scheduling/__tests__/CalendarConnection.test.tsx`.
- `src/services/schedulingApi.ts` (+ its types in `src/types/scheduling.ts` if a response type is needed).

## You CONSUME (frozen — never modify)
- §E11b (endpoint + response shape `{status, watch}`), the shipped status/init fetch patterns, `VITE_OAUTH_ORIGIN` pinning (not involved — the disconnect goes via ADA, NOT the OAuth origin).

## OUT OF SCOPE / do NOT
- NO lambda changes (WS-T3-DISC-BE). NO admin-roster disconnect affordances (self-view only). NO new dialog library. NO shared docs/IaC.

## Report-back (in your PR)
Title `feat(scheduling): T3 — Disconnect button (dashboard, §E11b)`, base `main`. Include: done-bar status, tsc/lint/test/build summaries, kanban doc-snippet, note that merge is operator-gated, any contract concern (STOP and flag).

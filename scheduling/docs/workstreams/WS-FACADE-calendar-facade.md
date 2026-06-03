# WS-FACADE — auth-bound calendar facade (B2, §B13)

**Plan task:** B-minimal / Track B2. [plan](../D_DEPLOY_AND_C_CHAT_INTEGRATION_PLAN.md).
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-facade` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **FULL** (auth-bound; per-tenant OAuth scoping).

## Goal / done-bar (verifiable)
A module `shared/scheduling/calendarFacade.js` exporting **`buildCalendarFacade({ tenantId, coordinatorId, deps })`** (§B13) that returns `{ buildEventBody, insertEvent(calendarId, body), deleteEvent(calendarId, eventId), extractMeetJoinUrl }` — a thin wrapper over `Booking_Commit_Handler/calendar-events.js` (whose `insertEvent`/`deleteEvent` take `authClient` FIRST) with the per-(tenant,coordinator) OAuth client **curried in** via `Booking_Commit_Handler/oauth-client.js` `getOAuthClient({tenantId, coordinatorId})`.
- This is exactly the **§B9 `deps.calendar`** that the shipped `reschedule.js`/`cancel.js` already consume — the facade method shapes must match §B9 + §B13 EXACTLY.
- **Security:** the OAuth client is per-(tenant,coordinator); the facade MUST NOT allow a cross-tenant calendar id (it resolves auth from the `tenantId`/`coordinatorId` it was built with — no caller-supplied authClient).
- **Done-bar:** unit tests with `deps={getOAuthClient, calendarEvents}` mocked — facade calls curry the right authClient; insert/delete forward to `calendar-events`; `extractMeetJoinUrl`/`buildEventBody` pass through; a build with tenant A never produces tenant-B auth. ≥1 test proves the §B9 shape (so D6/D7 can inject it unchanged).

## You OWN (create/edit ONLY these)
- `shared/scheduling/calendarFacade.js` + `shared/scheduling/__tests__/calendarFacade.test.js`.
- Do NOT touch `shared/scheduling/package.json`; run `npm ci` in `shared/scheduling/` before tests.

## You CONSUME (frozen — never modify)
- **§B13** (your signature) + **§B9** (the calendar-facade method shape — match exactly).
- `Booking_Commit_Handler/calendar-events.js` exports (`buildEventBody`, `insertEvent(authClient,…)`, `deleteEvent(authClient,…)`, `extractMeetJoinUrl`) and `oauth-client.js` `getOAuthClient` — **as references** (DI-injected via `deps`; do NOT edit them).

## You PRODUCE
- §B13 `buildCalendarFacade` — the SoT facade WS-CONVO (+ later C8) inject into reschedule/cancel/commit.

## OUT OF SCOPE / do NOT
- Do NOT build the conversation, the binding, or invoke reschedule/cancel. Do NOT modify `calendar-events.js`/`oauth-client.js` (consume via DI). Do NOT add a Zoom path (that's WS-ZOOM / the §B6 conference provider).

## References
- §B13, §B9. `Booking_Commit_Handler/oauth-client.js:66`, `calendar-events.js`. `CLAUDE.md` (never-share-IAM, per-tenant OAuth, schema discipline).

## Report-back
- PR `feat(scheduling): WS-FACADE auth-bound calendar facade (B2)` → main. Snippet: plan B2 → 🟢; confirm the facade shape matches §B9/§B13. Flag any contract issue (STOP, don't fork).

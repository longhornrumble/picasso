# WS-ZOOM — Zoom updateMeeting (B4, §B15)

**Plan task:** B-minimal / Track B4 (seam-3). [plan](../D_DEPLOY_AND_C_CHAT_INTEGRATION_PLAN.md).
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-zoom` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **FULL** (external API; per-tenant token).

## Goal / done-bar (verifiable)
Add ONE method to `Booking_Commit_Handler/zoom-client.js`: **`updateMeeting({ tenantId, meetingId, start, end, timezone })`** (§B15) — a PATCH of the reused meeting's start/end time. Reschedule already preserves the JOIN URL (via `createMeeting({existingMeetingId})`) but the meeting's TIME stays stale; this closes that.
- Mirror the existing `createMeeting`/`getMeeting`/`deleteMeeting` style: per-tenant token via the existing `getAccessToken(tenantId)`, the `zoomFetch` helper, timeout signal, the same error/eviction handling.
- **Idempotent** (re-PATCH to the same time is a no-op-equivalent 204).
- **Done-bar:** unit tests (mock `zoomFetch`/token) — PATCH issued to the meeting with the new start/end+timezone; non-2xx → throws like the siblings; token-eviction-on-401 path matches `createMeeting`. Export added to `module.exports`.

## You OWN (create/edit ONLY these)
- `Booking_Commit_Handler/zoom-client.js` (ADD the one method + export) + its test file (`zoom-client.test.js` if present — add cases; do NOT rewrite existing tests).
- **No other slice touches `zoom-client.js`** → disjoint.

## You CONSUME (frozen — never modify)
- **§B15** (your signature). The existing `zoom-client.js` helpers (`getAccessToken`, `zoomFetch`, `timeoutSignal`, eviction) — reuse, don't duplicate.

## You PRODUCE
- §B15 `updateMeeting` — consumed by WS-CONVO's reschedule path (via the §B6 conference provider / facade).

## OUT OF SCOPE / do NOT
- Do NOT touch `calendar-events.js`, `conference-providers.js`, or any other C8 file. Do NOT wire it into reschedule.js (the integrator/WS-CONVO does that). Do NOT change `createMeeting`'s existing reuse behavior.

## References
- §B15, §9.4 (reschedule preserves join URL). `Booking_Commit_Handler/zoom-client.js` (the sibling methods). `CLAUDE.md` (per-tenant secret scoping, schema discipline).

## Report-back
- PR `feat(scheduling): WS-ZOOM updateMeeting (B4)` → main. Snippet: plan B4 → 🟢; confirm the sibling-style token/error handling. Flag any contract issue (STOP, don't fork).

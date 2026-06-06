# WS-E-PORTAL — Customer-Portal surfaces (E12-wire/E13/E13b/E14/E15/E16)

**Plan task(s):** E12 (wire), E13, **E13b (new)**, E14, E15 (metrics), E16. [implementation plan](../scheduling_implementation_plan.md) §7; UI plan Surfaces 2/3/7/8/9.
**Repo / branch / base:** `picasso-analytics-dashboard` · `feature/scheduling-ws-e-portal` (split per-surface as needed) · base `main`.
**Quality gate:** `verify-before-commit` (the SHIPPED scheduling vitest gate must stay green) · weave audit = **light** per-surface — BUT **operator-gated merge** (merge to dashboard `main` triggers a prod deploy; the PR's `deploy-staging` job validates first). NO auto-merge by the integrator.
**Sequence:** after the dashboard CI gate lands (dash#9); E16 after WS-E-OAUTH (reuses the refresh token); E13 after A8 fields confirmed.

## Goal / done-bar (verifiable)
The tenant-facing Customer-Portal scheduling surfaces. Tenant admin is the primary author of config (D4/D8); super-admin Config Builder is the fallback.
1. **E12 (Surface 2 — My Bookings):** wire the SHIPPED render-slice into nav/routing (App.tsx ~30 lines) + fetch from `GET /scheduling/bookings` (§E7) + the two admin-override actions (cancel-on-behalf → `events.delete` path; trigger-reschedule → tokenized link to guest).
2. **E13 (Surface 3 — Team Settings):** assign staff to **Teams** (a Team = a `scheduling_tag`) + `calendar_email_override` + calendar-required + no-team warnings. Vocabulary validation in the Lambda, not the frontend.
3. **E13b (NEW — Appointment Types + Teams CRUD):** the tenant-admin surface to create/edit Teams + Appointment Types (each → a handling Team). Generates the `AppointmentType` + a `RoutingPolicy` (`tag_conditions`=team, `tie_breaker`=round_robin) UNDER THE HOOD — **zero backend routing change** (maps onto the shipped `resolveCandidates`/`evaluatePool`). Add **`modified_at`** (timestamp + last-modifier) on both row types (additive; dual-write guard, shown in both UIs). **Size 4–6d** — run a 4-hour state-count spike against the existing `TeamManagement.tsx` pattern first.
4. **E14 (Surface 7 — Notification templates):** confirmation / 24h-reminder / cancellation / missed-event-re-engagement overrides; **un-deferred SMS template variants** (per D7) editable by the tenant admin.
5. **E15 (Surface 8 — Analytics):** wire the SHIPPED operational-debt slice into nav + add historical metrics (booking volume, no-show rate by program/appt-type); admin/staff scopes via `?scope=`.
6. **E16 (Surface 9 — Calendar embed):** Google Calendar iframe (week view) + "Open in Google Calendar"; own-calendar only; degraded-state UX for blocked iframes.

- **Done-bar:** each surface renders + persists; E12 actions fire the right paths; E13 tag-validation in the Lambda (rolls back on 400); E13b create-Team+AppointmentType → call `evaluatePool` → confirm routing (the acceptance test) + `modified_at` present; permissions matrix enforced; the scheduling vitest suite stays green.

## You OWN (create/edit ONLY these)
- the dashboard scheduling pages/components for Surfaces 2/3/7/8/9 + E13b + the App.tsx nav-wire + the API client calls + tests. (Backend `/scheduling/bookings` endpoint + the vocabulary-validation Lambda path = integrator/backend glue — deliver the contract you need.)

## You CONSUME (frozen — never modify)
- **§E7** (`/scheduling/bookings` API), **§A** `AppointmentType`/`RoutingPolicy`/`Booking` (E13b writes the existing tables), the SHIPPED tag routing (`resolveCandidates`), the SHIPPED E12/E15 render-slices (dash#5), WS-E-OAUTH connection state (E16), the SHIPPED scheduling vitest gate.

## You PRODUCE
- The tenant-facing portal surfaces (the admin config the whole routing layer reads).

## OUT OF SCOPE / do NOT
- Do NOT expose "routing policies / tag_conditions" to the admin — present Teams + Appointment Types; generate the policy under the hood.
- Do NOT change the backend routing model (zero backend change — Teams=tags). Do NOT let the integrator auto-merge (dashboard merge = prod deploy → operator).
- Do NOT add a per-user "bookable" toggle (D3 — bookable = connected + on a team; keep only the admin force-off override).

## References
- Plan E12–E16; UI plan Surfaces 2/3/7/8/9 + §8 permissions; SCHEDULING_UX_DECISIONS D3/D4/D8; FROZEN §E7 + §A; `CLAUDE.md`.

## Report-back (in your PR)
- PRs per surface: `feat(scheduling): WS-E-PORTAL <surface> (E1x)` → dashboard main. **Flag for operator merge (prod deploy).**
- Doc-snippet: plan E12–E16 status; confirm Teams→tags mapping + `modified_at`; the `/scheduling/bookings` + vocabulary-validation contracts you need from the integrator.
- Branch, PR#, done-bar status, any contract issue (STOP + flag, don't fork).

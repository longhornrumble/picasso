# WS-E-OAUTH — Calendar Connection: Google consent flow + revocation + UI (E11)

**Plan task(s):** E11 (UI plan Surface 1). [implementation plan](../scheduling_implementation_plan.md) §7.
**Repo / branch / base:** `lambda` (backend) + `picasso-analytics-dashboard` (UI) + `infra/` (deploy-note) · `feature/scheduling-ws-e-oauth-backend` THEN `feature/scheduling-ws-e-oauth-ui` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **FULL — HIGH-RISK** (OAuth / Secrets Manager / IAM / per-staff refresh tokens). Mandatory Security-Reviewer + operator go-ahead. NO auto-merge.
**⚠ SPLIT — backend-first, frontend-second** (per tech-lead): ship the credential path as its own PR (Security audits it early); the UI PR follows. Revocation-detection seam is stubbed in the backend PR (returns "connected") until the UI ships.

## Goal / done-bar (verifiable)
The interactive **Google 3-legged per-user OAuth consent flow** + revocation detection + the staff Calendar-Connection UI. (NOT Clerk — this is a staff member delegating access to their OWN Google Calendar; D2.)
1. **Backend consent flow (the new work):** Connect → redirect to Google consent (`access_type=offline`, `prompt=consent`, signed `state` carrying tenant/coordinator + CSRF) → Google redirects to the handler on the existing `staging.schedule.myrecruiter.ai` (D3) domain → exchange `code` → `refresh_token` → **write the per-coordinator secret** `picasso/scheduling/oauth/{tenantId}/{coordinatorId}` (only `{refresh_token, scopes, coordinator_email, calendar_id, connected_at}` — app `client_id`/`client_secret` live in ONE platform secret/env, NOT per-coordinator) → fire the SHIPPED B5 onboarding (watch channel). Scopes: minimal (`calendar.events` + free/busy).
2. **Revocation detection:** on every staff portal page-load, a no-op `freeBusy.query` for next-24h with the cached token. **401 `invalid_grant` → mark disconnected + email staff + admin notification + `bookable:false`.** **5xx/transient → log + serve stale "connected"** (distinguish these in a unit test).
3. **UI (Surface 1):** connected-account card (email, provider, status, last-synced) + Connect / Reconnect / Disconnect.
4. **Gating:** the Connection surface appears only when Flag B `calendar_integration_enabled` (tenant) is on (Flag A `scheduling_enabled` is the super-admin entitlement — §E0).

- **Done-bar:** OAuth round-trip works; refresh token persisted in Secrets Manager (verify `aws secretsmanager describe-secret` returns the expected name); reconnect re-establishes after revocation; disconnect revokes locally + on Google; **revocation test distinguishes `invalid_grant` (→disconnect+bookable:false within 5min) from 5xx (→stale-connected)**.

## You OWN (create/edit ONLY these)
- backend: the consent redirect-handler + code-exchange + secret-write + revocation-check module + tests (REUSE the shipped `Calendar_Watch_Onboarder/oauth-client.js` — do not re-implement the OAuth2 client).
- dashboard: the Calendar-Connection page/components + tests.
- `infra/` deploy-note for the per-secret IAM (`secretsmanager:GetSecretValue` on `picasso/scheduling/oauth/*` ONLY — no DDB for OAuth creds).

## You CONSUME (frozen — never modify)
- the shipped `oauth-client.js` + the `picasso/scheduling/oauth/{tenantId}/{coordinatorId}` secret pattern, the D3 `staging.schedule.myrecruiter.ai` domain, the SHIPPED B5 onboarding hook, `send_email`, **§E0** flags.

## You PRODUCE
- The connected-calendar state + per-staff refresh token (E16 calendar-embed depends on it; routing/freeBusy already consume the secret).

## OUT OF SCOPE / do NOT
- Do NOT use Google Workspace domain-wide delegation (D2 rejected it). Do NOT store the refresh token in DDB (Secrets Manager only).
- Do NOT pursue Google app verification (deferred to Beta — Testing-mode for the operator-controlled MYR test tenant; D2/Q3).
- Do NOT write the per-secret IAM/Terraform — integrator glue (deliver the deploy-note). Do NOT mutate existing secrets.

## References
- Plan E11; UI plan Surface 1; SCHEDULING_UX_DECISIONS D2; FROZEN §E0; `CLAUDE.md` (never-share-IAM, credential-mutation gate, per-tenant secret scope). Living-Inventory Rule (OAuth tokens = PII surface → pii-inventory snippet, integrator coordinates).

## Report-back (in your PR)
- Two PRs (backend then UI): `feat(scheduling): WS-E-OAUTH backend consent flow (E11)` + `…UI (E11)`. **Flag HIGH-RISK for the FULL audit.**
- Doc-snippet: plan E11 status; the per-secret IAM deploy-note; the pii-inventory line (OAuth secret); confirm secret-shape + scope-minimization + the revocation 401-vs-5xx test.
- Branch, PR#, done-bar status, any contract issue (STOP + flag, don't fork).

# Runbook — Zoom Server-to-Server OAuth provisioning (sub-phase C8 gate)

**Owner:** operator (Chris). **When:** any time before C8 (the booking-commit keystone) reaches the Zoom provider path — provisioning ahead removes a serial wait. **Effort:** ~30 min. Lever #3 of the acceleration plan.

**Why this gates only the Zoom path:** C8 builds **Meet-first** (`conferenceData.createRequest`, which rides the *existing* Google Calendar OAuth) + a `NullConferenceProvider` (no-op) per canonical §5.2 item 4. The `ZoomProvider` path cannot be integration-tested until this secret exists; everything else in C8 (and all of C1–C7, C9, D1a, E-UI) is unblocked.

## ⭐ Model — pilot S2S → production published-OAuth (the multi-tenant pivot)

**The end-state is client-owned meetings, exactly analogous to Google Calendar/Meet:** each tenant's meetings are created in *their own* Zoom account; MyRecruiter-collected volunteers are added as attendees. Two stages:

| Stage | Mechanism | Per-tenant Zoom *app*? | Notes |
|---|---|---|---|
| **Pilot (MYR384719 — DONE, operator-confirmed)** | **Server-to-Server OAuth** app in MyRecruiter's *own* Zoom account | n/a (MyRecruiter's own account) | Fastest way to exercise the C8 Zoom path; zero friction since it's MyRecruiter's account. **Creds already in Secrets Manager + the Zoom app is set up (operator-confirmed 2026-05-31).** |
| **Production multi-tenant (PIVOT before Zoom-tenant #2)** | **One published MyRecruiter Zoom OAuth marketplace app**; each tenant **authorizes** it against their own Zoom account → per-tenant tokens | **NO** — exactly like Google: one MyRecruiter OAuth app, each tenant clicks "authorize," no tenant builds an app | The Google-analogous model. Meetings in the tenant's account, volunteers added as attendees. Requires the OAuth consent flow + Zoom marketplace review. |

**Do NOT adopt per-tenant S2S apps as the scaling model** — that would force every Zoom-using tenant to build their own app (friction Google does not impose). The pilot uses S2S only because it's MyRecruiter's own account.

**C8 `ZoomProvider` build instruction (so the pivot is a secret-shape change, not a rewrite):** read the per-tenant secret `picasso/scheduling/zoom/{tenant}` and **acquire the access token in whichever mode the secret declares** — S2S (`account_id`/`client_id`/`client_secret` → `account_credentials` grant) now, or an OAuth `refresh_token` later. The meeting-creation call (`POST /users/{userId}/meetings`) is **identical** for both, so production migration is just storing OAuth tokens at the same secret path. The per-tenant secret path is correct for **both** stages.

## Steps (pilot — `MYR384719`; ✅ DONE, operator-confirmed)

1. **Create the Zoom app.** Zoom Marketplace → **Develop → Build App → Server-to-Server OAuth**, in **MyRecruiter's own Zoom account** (pilot only; production uses the published-OAuth app per the Model section above). Capture **Account ID**, **Client ID**, **Client Secret**.
2. **Scopes.** Add `meeting:write:admin` (create meetings) + `meeting:read:admin` (read-before-write idempotency per canonical §3.1 / C8). Activate the app.
3. **Store in Secrets Manager (staging).** Mirror the Google OAuth secret shape:
   ```bash
   unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
   AWS_PROFILE=myrecruiter-staging aws secretsmanager create-secret \
     --name "picasso/scheduling/zoom/{tenant_id}" \
     --secret-string '{"provider":"zoom","account_id":"...","client_id":"...","client_secret":"...","created_at":"2026-..","rotate_after":"2026-.."}'
   ```
   Use the real tenant id (pilot = `MYR384719`). One secret **path** per tenant — never a shared/wildcard secret. (The secret's *contents* are S2S creds for the pilot; per-tenant OAuth tokens in production — same path either way, per the Model section.)
4. **IAM (lands with C8, not now).** The C8 commit Lambda's dedicated exec role grants `secretsmanager:GetSecretValue` scoped **per-tenant** to `picasso/scheduling/zoom/{tenant}/*` (no wildcard) — same posture as the Google OAuth grant (never-share-IAM-roles + per-tenant scope, CLAUDE.md). The C8 work-order owns that IAM.

## Verifier
```bash
AWS_PROFILE=myrecruiter-staging aws secretsmanager list-secrets \
  --query "SecretList[?starts_with(Name,'picasso/scheduling/zoom/')].Name" --output text
```
Non-empty → the C8 Zoom path is unblocked. **Pilot status: operator-confirmed provisioned 2026-05-31** (re-run the verifier after `aws sso login --profile myrecruiter-staging` to print the secret name).

## Notes
- This is a **credential mutation** (Secrets Manager create) → operator-run (the auto-mode gate blocks an agent from doing it). Hand the agent the verifier output, not the secret.
- Prod tenant provisioning is deferred to Phase-2 cutover (per the Deployment SOP) — staging only for now.
- **Multi-tenant pivot is a design decision, gated before Zoom-tenant #2** (not a v1-pilot blocker): build the published-OAuth marketplace app + per-tenant authorize flow per the Model section. C8 ships now against the pilot S2S secret with the token-acquisition abstraction so that pivot is config, not code.

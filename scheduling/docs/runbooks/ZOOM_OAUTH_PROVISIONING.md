# Runbook — Zoom Server-to-Server OAuth provisioning (sub-phase C8 gate)

**Owner:** operator (Chris). **When:** any time before C8 (the booking-commit keystone) reaches the Zoom provider path — provisioning ahead removes a serial wait. **Effort:** ~30 min. Lever #3 of the acceleration plan.

**Why this gates only the Zoom path:** C8 builds **Meet-first** (`conferenceData.createRequest`, which rides the *existing* Google Calendar OAuth) + a `NullConferenceProvider` (no-op) per canonical §5.2 item 4. The `ZoomProvider` path cannot be integration-tested until this secret exists; everything else in C8 (and all of C1–C7, C9, D1a, E-UI) is unblocked.

## Steps

1. **Create the Zoom app.** Zoom Marketplace → **Develop → Build App → Server-to-Server OAuth**. Name it per tenant (e.g. `picasso-scheduling-{tenant}`). Capture **Account ID**, **Client ID**, **Client Secret**.
2. **Scopes.** Add `meeting:write:admin` (create meetings) + `meeting:read:admin` (read-before-write idempotency per canonical §3.1 / C8). Activate the app.
3. **Store in Secrets Manager (staging).** Mirror the Google OAuth secret shape:
   ```bash
   unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
   AWS_PROFILE=myrecruiter-staging aws secretsmanager create-secret \
     --name "picasso/scheduling/zoom/{tenant_id}" \
     --secret-string '{"provider":"zoom","account_id":"...","client_id":"...","client_secret":"...","created_at":"2026-..","rotate_after":"2026-.."}'
   ```
   Use the real tenant id (pilot = `MYR384719`). One secret per tenant — never a shared/wildcard secret.
4. **IAM (lands with C8, not now).** The C8 commit Lambda's dedicated exec role grants `secretsmanager:GetSecretValue` scoped **per-tenant** to `picasso/scheduling/zoom/{tenant}/*` (no wildcard) — same posture as the Google OAuth grant (never-share-IAM-roles + per-tenant scope, CLAUDE.md). The C8 work-order owns that IAM.

## Verifier
```bash
AWS_PROFILE=myrecruiter-staging aws secretsmanager list-secrets \
  --query "SecretList[?starts_with(Name,'picasso/scheduling/zoom/')].Name" --output text
```
Non-empty → the C8 Zoom path is unblocked.

## Notes
- This is a **credential mutation** (Secrets Manager create) → operator-run (the auto-mode gate blocks an agent from doing it). Hand the agent the verifier output, not the secret.
- Prod tenant provisioning is deferred to Phase-2 cutover (per the Deployment SOP) — staging only for now.

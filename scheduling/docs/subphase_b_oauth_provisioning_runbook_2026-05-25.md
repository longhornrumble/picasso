# Sub-phase B OAuth Provisioning — operator-execute runbook

**Purpose:** clear the [sub-phase B Entry precondition line 131](scheduling_implementation_plan.md#L131) — "Google Calendar OAuth credentials provisioned in Secrets Manager for staging tenant." Sub-phase B Implementation (B1–B11 + CI-3b/c/d) cannot start without this gate met.

**Why an operator runbook (not auto-mode action):** the Google Cloud Console steps require an interactive browser session with an authenticated Google identity that owns or admins the test calendar; auto-mode Claude has no path to that surface. AWS Secrets Manager + IAM steps are scriptable but second-half of the flow only — Google Cloud Console must happen first.

**Audit-of-record precedent:** [`subphase_a_operator_runbook_2026-05-24.md`](subphase_a_operator_runbook_2026-05-24.md). Same pattern: one-section-per-step, pre-image, copy-paste apply, verifier, what's closed.

---

## Pre-flight state (verified 2026-05-25)

```bash
# Confirms ZERO scheduling/oauth/google/calendar secrets in staging-525:
aws secretsmanager list-secrets --profile myrecruiter-staging \
  --query "SecretList[?contains(Name, 'google') || contains(Name, 'oauth') || contains(Name, 'scheduling') || contains(Name, 'calendar')].Name" \
  --output text
# Expected: empty
```

---

## Step 1 — Google Cloud Console: create OAuth client + enable Calendar API

**Where:** https://console.cloud.google.com/ — sign in as a Google identity that owns or admins the test calendar.

**Project choice:**
- If a `picasso-scheduling` (or similarly-named) project already exists, use it.
- Otherwise create a new project named `picasso-scheduling-staging` (or your convention) in the org. The project name is internal-only; only the OAuth client + API enablement leave the project.

**Sub-steps inside the project:**

1. **APIs & Services → Library → enable "Google Calendar API"** (required for all sub-phase B Lambdas: B2 listener, B3 renewer, B5 onboarding, B6 offboarding, B10 responseStatus polling).
2. **APIs & Services → OAuth consent screen** → User Type = `External` (or `Internal` if Google Workspace org); App name = `Picasso Scheduling (staging)`; User support email = `chris@myrecruiter.ai`; Developer contact = same. Add scope `https://www.googleapis.com/auth/calendar` (read-write events). **For staging-only access**, leave publishing status as **Testing** and add your test calendar Google account as a Test User. Production publishing is a separate operator step for sub-phase F prod cutover.
3. **APIs & Services → Credentials → + Create Credentials → OAuth client ID**:
   - Application type: `Web application` (forward-compat for sub-phase E coordinator-facing OAuth UI; for sub-phase B alone, `Desktop app` is sufficient — `Web application` is preferred so the same client carries forward to E11)
   - Name: `picasso-scheduling-staging-web`
   - Authorized JavaScript origins: `https://staging.chat.myrecruiter.ai` (preemptive for E; sub-phase B doesn't use it)
   - Authorized redirect URIs: leave empty for sub-phase B; populate in sub-phase E when the Customer Portal Surface 1 OAuth flow lands per [plan E11 line 386](scheduling_implementation_plan.md#L386). Or pre-populate with a staging callback URL if the architecture is decided (e.g., `https://staging.chat.myrecruiter.ai/api/scheduling/oauth/callback`).
   - **Save and capture `client_id` + `client_secret`** — they will not be shown again in plaintext (downloadable as JSON).

**Cost:** $0. Google Cloud free-tier covers Calendar API for staging-scale volumes.

**What you have at end of Step 1:** `client_id`, `client_secret`, and an OAuth consent screen that any added Test User can grant calendar scope to.

---

## Step 2 — Obtain a test refresh token (one-time, out-of-band)

Sub-phase B's integration tests (`events.watch`, `events.stop`, `events.get`) need a long-lived refresh token bound to a test calendar. The token is per-`(tenantId, coordinatorId)` — for staging integration tests, the operator's own Google account is typically the test coordinator.

**Easiest path: OAuth 2.0 Playground**

1. Visit https://developers.google.com/oauthplayground/
2. Click the gear icon (top right) → check **"Use your own OAuth credentials"** → paste `client_id` + `client_secret` from Step 1.
3. In Step 1 of the Playground (left panel), expand "Google Calendar API v3" and select the scope `https://www.googleapis.com/auth/calendar`. Click **Authorize APIs**, sign in as the test coordinator account, grant scope.
4. In Step 2, click **Exchange authorization code for tokens**.
5. **Capture the `refresh_token`** from the response panel (string starting with `1//`).

**What you have at end of Step 2:** `refresh_token` for one test coordinator. The access token is short-lived; only the refresh token is persisted.

**Hygiene note:** the OAuth Playground requires the redirect URI `https://developers.google.com/oauthplayground` to be added to the OAuth client's Authorized redirect URIs in Step 1 temporarily. Add it before doing Step 2; remove it after capturing the refresh token if you want to keep the OAuth client redirect surface clean.

---

## Step 3 — Persist credentials in staging-525 Secrets Manager

**Canonical path** per [plan E11 line 386](scheduling_implementation_plan.md#L386): `picasso/scheduling/oauth/{tenantId}/{coordinatorId}`.

For sub-phase B integration tests, choose stable values. Recommended:
- `{tenantId}` = `MYR384719` (MyRecruiter test tenant — used for sub-phase B integration testing; sub-phase F prod cutover uses real tenants)
- `{coordinatorId}` = `test-coordinator` (or the Google email's local-part if you want it human-readable; lowercase + alphanumeric)

**Pre-image:**
```bash
aws secretsmanager describe-secret \
  --secret-id picasso/scheduling/oauth/MYR384719/test-coordinator \
  --profile myrecruiter-staging 2>&1 | head -3
# Expected: error "ResourceNotFoundException" (secret does not yet exist)
```

**Apply (copy-paste; substitute the four values from Step 1 + Step 2):**
```bash
# Substitute the four placeholders with your actual values from Steps 1+2:
GOOGLE_CLIENT_ID='REPLACE_WITH_STEP_1_CLIENT_ID'
GOOGLE_CLIENT_SECRET='REPLACE_WITH_STEP_1_CLIENT_SECRET'
GOOGLE_REFRESH_TOKEN='REPLACE_WITH_STEP_2_REFRESH_TOKEN'
COORDINATOR_EMAIL='REPLACE_WITH_TEST_COORDINATOR_GOOGLE_EMAIL'

# JSON payload — forward-compat shape per E11 description
cat > /tmp/oauth-secret.json <<EOF
{
  "provider": "google",
  "client_id": "${GOOGLE_CLIENT_ID}",
  "client_secret": "${GOOGLE_CLIENT_SECRET}",
  "refresh_token": "${GOOGLE_REFRESH_TOKEN}",
  "coordinator_email": "${COORDINATOR_EMAIL}",
  "scopes": ["https://www.googleapis.com/auth/calendar"],
  "token_endpoint": "https://oauth2.googleapis.com/token",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "purpose": "subphase-b-integration-tests",
  "rotate_after": "$(date -u -v+90d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+90 days' +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

aws secretsmanager create-secret \
  --name picasso/scheduling/oauth/MYR384719/test-coordinator \
  --description "Sub-phase B integration-test OAuth credentials for MYR384719 staging tenant (test coordinator). Provisioned 2026-05-25 per subphase_b_oauth_provisioning_runbook." \
  --secret-string file:///tmp/oauth-secret.json \
  --profile myrecruiter-staging

# Cleanup local plaintext immediately
shred -u /tmp/oauth-secret.json 2>/dev/null || rm -P /tmp/oauth-secret.json 2>/dev/null || rm /tmp/oauth-secret.json
```

**Verifier (no plaintext leakage):**
```bash
aws secretsmanager describe-secret \
  --secret-id picasso/scheduling/oauth/MYR384719/test-coordinator \
  --profile myrecruiter-staging \
  --query '{Name: Name, ARN: ARN, Description: Description, CreatedDate: CreatedDate}'
# Expected: returns a Name + ARN + 2026-05-25 CreatedDate; ARN of shape
#   arn:aws:secretsmanager:us-east-1:525409062831:secret:picasso/scheduling/oauth/MYR384719/test-coordinator-XXXXXX
```

**Round-trip verifier (confirms payload schema; redacts secret values):**
```bash
aws secretsmanager get-secret-value \
  --secret-id picasso/scheduling/oauth/MYR384719/test-coordinator \
  --profile myrecruiter-staging \
  --query 'SecretString' --output text | jq 'with_entries(if .key | test("secret|token|client_id") then .value = "REDACTED" else . end)'
# Expected: JSON with client_id/client_secret/refresh_token = "REDACTED",
#   other fields visible (provider=google, scopes=[calendar], purpose=…, etc.)
```

---

## Step 4 — IAM scope: grant scheduling Lambda execution roles `GetSecretValue` on `picasso/scheduling/oauth/*`

**Per Security-Reviewer P0 (2026-05-02):** Lambda execution roles must be scoped to `secretsmanager:GetSecretValue` on `picasso/scheduling/oauth/*` only — no DynamoDB access for OAuth credentials, no broader Secrets Manager wildcard.

Sub-phase B's listener (B2) and renewer (B3) Lambdas don't exist yet — they're built during Phase 2 Implementation. The IAM grant lands **with** each Lambda's execution-role definition (per [CLAUDE.md "Never share IAM roles across Lambdas" rule](../../CLAUDE.md#L107)). This runbook reserves the pattern; per-Lambda grants happen in B1/B2/B3 implementation PRs.

**Reservation pattern (to be applied per Lambda in implementation phase):**
```json
{
  "Sid": "SchedulingOAuthSecretRead",
  "Effect": "Allow",
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "arn:aws:secretsmanager:us-east-1:525409062831:secret:picasso/scheduling/oauth/*"
}
```

No action required in this runbook step — captured here for forward reference.

---

## Step 5 — Gate-closure verification

After Steps 1–3 complete, the sub-phase B Entry precondition is met when **all** of the following return non-empty:

```bash
# (a) Secret exists in staging-525 at the canonical path
aws secretsmanager list-secrets --profile myrecruiter-staging \
  --query "SecretList[?starts_with(Name, 'picasso/scheduling/oauth/')].Name" \
  --output text
# Expected: picasso/scheduling/oauth/MYR384719/test-coordinator

# (b) Secret payload is structurally valid (no jq parse errors)
aws secretsmanager get-secret-value \
  --secret-id picasso/scheduling/oauth/MYR384719/test-coordinator \
  --profile myrecruiter-staging \
  --query SecretString --output text \
  | jq -e 'has("client_id") and has("client_secret") and has("refresh_token") and has("scopes")' >/dev/null \
  && echo "OAuth secret payload structurally valid" \
  || echo "FAIL: payload missing one or more required keys"

# (c) Google API reachable with the credentials (one-time live check; safe — read-only)
# Run from a Python venv with `google-auth google-api-python-client` installed,
# OR defer to the first B5/B6 integration test which exercises the same path.
```

After (a)+(b) pass, sub-phase B's Entry precondition line 131 transitions from 🔵 VERIFY → 🟢 VERIFIED, and Phase 2 Implementation (B1+) can begin.

---

## What this runbook closes

Plan §4 Entry preconditions row 3 (line 131): "🔵 VERIFY: Google Calendar OAuth credentials provisioned in Secrets Manager for staging tenant" → **converts the verbal precondition into copy-paste operator steps**. The actual provisioning is operator-side; this runbook eliminates the context-switch overhead and ensures the canonical Secrets Manager path + payload shape match sub-phase E11's forward-compat design.

## What this runbook does NOT do

- Production publishing of the OAuth consent screen (separate sub-phase F prod-cutover step)
- Per-coordinator OAuth UI in the Customer Portal (sub-phase E11)
- Lambda code that reads the secret (sub-phase B implementation PRs)
- Rotation automation (rotate_after field is informational; rotation runbook is a Phase 5 Operations item)
- Background scheduling secret in `picasso/scheduling/jwt/signing-key` (already addressed elsewhere per [plan §6 line 285](scheduling_implementation_plan.md#L285))

## Plan amendment after operator runs this

After successful Step 5 verification, [`scheduling_implementation_plan.md` line 131](scheduling_implementation_plan.md#L131) should be amended in the same PR pattern as line 132 (VERIFIED 2026-05-25 SNS) — convert 🔵 VERIFY → 🟢 VERIFIED 2026-MM-DD with a one-line provenance note pointing back to the canonical secret ARN. A separate one-line plan PR after operator confirmation suffices.

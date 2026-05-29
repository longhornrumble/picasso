# Sub-phase B5 — `Calendar_Watch_Onboarder` smoke runbook

> **⚠️ AMENDMENT 2026-05-29 (B5 phase-completion-audit, lambda#171 + picasso#271 / finding G6):**
> The Onboarder **no longer stores a raw channel token** in Secrets Manager. The raw
> token is handed to Google in `events.watch` and never persisted at rest; only its
> SHA-256 hash lives in the DDB channel row (the Listener authenticates inbound pushes
> by hashing `X-Goog-Channel-Token` and constant-time-comparing). Consequently:
> - There is **no** `picasso/scheduling/channel-token/{channel_id}` secret to create or delete.
> - The Onboarder response payload does **not** include a `secret_id` field.
> - The `CHANNEL_TOKEN_SECRET_PREFIX` env var was removed.
> - Teardown is **`channels.stop` + delete the DDB row only** — no `delete-secret` step.
> The Step 1/2/3 examples below have been corrected; ignore any lingering raw-token-secret
> references. Re-smoke verified against the post-G6 code 2026-05-29 (table left empty).

**Purpose.** Operator-execute B5's "Concrete integration test" per [`scheduling_implementation_plan.md` B5 done-bar](scheduling_implementation_plan.md): direct-invoke the Onboarder Lambda end-to-end against the staging-525 test coordinator and verify channel registration. Closes the operator-driven smoke deferral noted in the B5 plan-row's matrix entry rationale.

**Why operator-execute (not auto-CI):** the smoke exercises live Google Calendar API (`events.list` + `events.watch`) using OAuth credentials stored in Secrets Manager. The CI runner has no path to Google's auth surface. Same operator-execute pattern as [`subphase_b_oauth_provisioning_runbook_2026-05-25.md`](subphase_b_oauth_provisioning_runbook_2026-05-25.md) and [`subphase_b1_calendar_watch_channels_runbook.md`](subphase_b1_calendar_watch_channels_runbook.md).

**Audit-of-record precedent:** [`subphase_a_operator_runbook_2026-05-24.md`](subphase_a_operator_runbook_2026-05-24.md). Same shape: pre-image, apply, verifier, cleanup, what's closed.

---

## Pre-flight checks

```bash
# (a) Onboarder Lambda deployed
AWS_PROFILE=myrecruiter-staging aws lambda get-function-configuration \
  --function-name Calendar_Watch_Onboarder \
  --query '{Handler:Handler,Runtime:Runtime,LastModified:LastModified,EnvKeys:Environment.Variables|keys(@)}'
# Expected: Handler=index.handler, Runtime=nodejs20.x (or later), Environment includes
#   CALENDAR_WATCH_CHANNELS_TABLE, LISTENER_URL, OAUTH_SECRET_PATH_PREFIX
# (NOTE: CHANNEL_TOKEN_SECRET_PREFIX was REMOVED by lambda#171 / B5-audit G6 —
#  the Onboarder no longer stores the raw channel token. See the G6 banner at top.)

# (b) Listener Function URL is non-empty
AWS_PROFILE=myrecruiter-staging aws lambda get-function-configuration \
  --function-name Calendar_Watch_Onboarder \
  --query 'Environment.Variables.LISTENER_URL'
# Expected: an https:// URL ending in .lambda-url.us-east-1.on.aws/

# (c) OAuth secret present at canonical path
AWS_PROFILE=myrecruiter-staging aws secretsmanager describe-secret \
  --secret-id picasso/scheduling/oauth/MYR384719/test-coordinator \
  --query '{Name:Name,ARN:ARN,LastChangedDate:LastChangedDate}'
# Expected: Name + ARN present. If ResourceNotFoundException, run
#   subphase_b_oauth_provisioning_runbook_2026-05-25.md first.

# (d) Channels table exists with both required GSIs
AWS_PROFILE=myrecruiter-staging aws dynamodb describe-table \
  --table-name picasso-calendar-watch-channels-staging \
  --query 'Table.{Status:TableStatus,PITR:RestoreSummary,GSIs:GlobalSecondaryIndexes[*].IndexName}'
# Expected: Status=ACTIVE, GSIs contains tenant-status-index AND tenant-expiration-index.
```

If any pre-flight fails, **stop**. The B5 done-bar cannot be exercised without all four.

---

## Step 1 — Direct-invoke the Onboarder

```bash
# Capture the invocation result + log tail for triage if assertions fail
INVOKE_OUT=$(mktemp -t b5-smoke.XXXXXX.json)
AWS_PROFILE=myrecruiter-staging aws lambda invoke \
  --function-name Calendar_Watch_Onboarder \
  --cli-binary-format raw-in-base64-out \
  --payload '{"tenant_id":"MYR384719","coordinator_id":"test-coordinator","calendar_id":"primary"}' \
  --log-type Tail \
  --query 'LogResult' --output text "$INVOKE_OUT" | base64 -d | tail -40

echo ""
echo "=== Invocation result ==="
cat "$INVOKE_OUT" | jq .
```

**Expected response payload** (post-G6 — no `secret_id`):
```json
{
  "channel_id": "<UUID>",
  "expiration": <epoch_ms>,
  "last_sync_token_seeded": true
}
```

Capture `channel_id` for the assertions:
```bash
CHANNEL_ID=$(jq -r '.channel_id' "$INVOKE_OUT")
echo "CHANNEL_ID=$CHANNEL_ID"
```

---

## Step 2 — Assertions (B5 done-bar)

### (1) DDB row exists with expected attributes

```bash
AWS_PROFILE=myrecruiter-staging aws dynamodb get-item \
  --table-name picasso-calendar-watch-channels-staging \
  --key "{\"channel_id\":{\"S\":\"$CHANNEL_ID\"}}" \
  --query 'Item.{tenant_id:tenant_id.S,coordinator_id:coordinator_id.S,calendar_id:calendar_id.S,resource_id:resource_id.S,resource_uri:resource_uri.S,expiration:expiration.N,status:status.S,channel_token_sha256_present:channel_token_sha256.S!=`null`,last_sync_token_present:last_sync_token.S!=`null`}'
```

**Expected:** tenant_id=`MYR384719`, coordinator_id=`test-coordinator`, calendar_id=`primary`, resource_id non-null, resource_uri matches `https://www.googleapis.com/calendar/v3/calendars/.../events`, expiration is a numeric epoch-ms, status=`active`, channel_token_sha256_present=true, last_sync_token_present=true.

### (2) Google watch is registered (proxy via `events.list`)

Google Calendar API has no `channels.list` primitive — registered watches aren't enumerable. The proxy is that the OAuth client can read the calendar at all (which is what the Onboarder did during `events.list` to seed the sync token):

```bash
# Look at the Onboarder's CloudWatch log for the sync_token_seeded event
AWS_PROFILE=myrecruiter-staging aws logs tail \
  /aws/lambda/Calendar_Watch_Onboarder \
  --since 5m \
  --filter-pattern 'sync_token_seeded' \
  --format short | tail -5
```

**Expected:** a `sync_token_seeded` log line for the invocation with `seed_token_present: true` and `seed_pages >= 1`.

The `events_watch_registered` log line is the more direct evidence — it carries the `resource_id` returned by Google:

```bash
AWS_PROFILE=myrecruiter-staging aws logs tail \
  /aws/lambda/Calendar_Watch_Onboarder \
  --since 5m \
  --filter-pattern 'events_watch_registered' \
  --format short | tail -5
```

**Expected:** an `events_watch_registered` line for the invocation with `resource_id` non-empty and `expiration` matching the DDB row's `expiration` field.

### (3) `expiration` within 7 days of now

Google `events.watch` returns a TTL bounded by Google's per-resource ceiling (commonly ≈7 days for Calendar). Verify the DDB row's `expiration` is in the future AND within 7 days:

```bash
EXPIRATION_MS=$(AWS_PROFILE=myrecruiter-staging aws dynamodb get-item \
  --table-name picasso-calendar-watch-channels-staging \
  --key "{\"channel_id\":{\"S\":\"$CHANNEL_ID\"}}" \
  --query 'Item.expiration.N' --output text)
NOW_MS=$(($(date -u +%s) * 1000))
DELTA_DAYS=$(( (EXPIRATION_MS - NOW_MS) / 86400000 ))
echo "expiration is +${DELTA_DAYS} days from now"
test "$DELTA_DAYS" -gt 0 && test "$DELTA_DAYS" -le 7 && echo "OK: within 7 days" || echo "FAIL: outside [0, 7] days"
```

**Expected:** `OK: within 7 days`. If `FAIL`, Google may have changed its TTL ceiling — record the actual delta and surface to the user before adjusting the assertion.

---

## Step 3 — Cleanup (mandatory; staging is shared)

Leaving a watch registered means Google will deliver push notifications to the Listener for any change on the test calendar. Clean up immediately after assertions pass (or after triage if they fail):

# (a) Stop the Google watch via channels.stop — eliminates push notifications.
# Needs the resource_id from the DDB row (read it before deleting the row).
# Python bridge (stdlib + boto3 only; no node_modules) — reads the OAuth secret
# in-process, exchanges the refresh token, calls channels.stop. NOTE: this reads
# ONLY the OAuth secret — there is no channel-token secret in the post-G6 design.
```bash
RESOURCE_ID=$(AWS_PROFILE=myrecruiter-staging aws dynamodb get-item \
  --table-name picasso-calendar-watch-channels-staging \
  --key "{\"channel_id\":{\"S\":\"$CHANNEL_ID\"}}" \
  --query 'Item.resource_id.S' --output text)

AWS_PROFILE=myrecruiter-staging CHANNEL_ID="$CHANNEL_ID" RESOURCE_ID="$RESOURCE_ID" python3 - <<'PY'
import boto3, json, os, sys, urllib.request, urllib.parse, urllib.error
sm = boto3.client("secretsmanager", region_name="us-east-1")
o = json.loads(sm.get_secret_value(SecretId="picasso/scheduling/oauth/MYR384719/test-coordinator")["SecretString"])
tr = urllib.request.Request("https://oauth2.googleapis.com/token",
    data=urllib.parse.urlencode({"client_id":o["client_id"],"client_secret":o["client_secret"],
        "refresh_token":o["refresh_token"],"grant_type":"refresh_token"}).encode(),
    headers={"Content-Type":"application/x-www-form-urlencoded"})
at = json.loads(urllib.request.urlopen(tr).read())["access_token"]
sr = urllib.request.Request("https://www.googleapis.com/calendar/v3/channels/stop",
    data=json.dumps({"id":os.environ["CHANNEL_ID"],"resourceId":os.environ["RESOURCE_ID"]}).encode(),
    headers={"Authorization":f"Bearer {at}","Content-Type":"application/json"})
try:
    with urllib.request.urlopen(sr) as r: print(f"channels.stop HTTP {r.status} — stopped")
except urllib.error.HTTPError as e:
    print(f"channels.stop HTTP {e.code}" + (" — already absent (OK)" if e.code==404 else f": {e.read().decode()}"))
    sys.exit(0 if e.code==404 else 1)
PY
# Expected: 'channels.stop HTTP 204 — stopped'.

# (b) Delete the DDB row
AWS_PROFILE=myrecruiter-staging aws dynamodb delete-item \
  --table-name picasso-calendar-watch-channels-staging \
  --key "{\"channel_id\":{\"S\":\"$CHANNEL_ID\"}}"
# Expected: no output (success). Confirm the table is empty afterward:
AWS_PROFILE=myrecruiter-staging aws dynamodb scan \
  --table-name picasso-calendar-watch-channels-staging --select COUNT --query 'Count'

# (c) Clean up local tmp
rm -f "$INVOKE_OUT"
unset CHANNEL_ID INVOKE_OUT EXPIRATION_MS NOW_MS DELTA_DAYS RESOURCE_ID
```

**No secret to delete (post-G6):** there is no `picasso/scheduling/channel-token/{channel_id}` secret in the current design — the raw token is never stored at rest. Do NOT run `delete-secret`; it will return `ResourceNotFoundException`.

**B6 note:** when B6 Offboarder ships, steps (a)+(b) collapse to a single direct-invoke of the Offboarder with `{tenant_id, channel_id}`. This runbook is the bridge until then.

---

## Step 4 — Closure update

After Steps 1–3 pass cleanly:

1. Update [`scheduling_implementation_plan.md`](scheduling_implementation_plan.md) B5 plan-row Status `🟡 stg (v1 pilot, direct-invoke)` → `🟢 stg (v1 pilot, smoke-verified <DATE>)`.
2. Add a closure log entry to the plan's "Sub-phase B closure log" section with the invocation timestamp, the channel_id (for audit trail), and a one-line "B5 done-bar verified end-to-end" attestation.
3. Cite this runbook by path in the closure entry so future operators can re-run.

---

## What this runbook closes

- B5 done-bar's "Concrete integration test" (3 conditions: DDB row + Google liveness + 7-day expiration) — converts the verbal requirement into copy-paste operator steps.
- B5 plan-row's "Operator-driven smoke (deferred from auto-CI per matrix entry rationale): runs against `MYR384719/test-coordinator` after IaC apply" — IS this operator-driven smoke.

## What this runbook does NOT do

- Replace B6 Offboarder (Step 3 cleanup is a bridge pattern; B6 ships the proper teardown path).
- Test the Listener's response to the push notifications the smoke registers — that's a B2 Phase 2b concern (handler wire-up + typed-event derivation), exercised by a separate runbook.
- Verify the Onboarder's reaction to OAuth-secret-missing failure mode — that's unit-test coverage in [`Calendar_Watch_Onboarder/oauth-client.test.js`](../../Lambdas/lambda/Calendar_Watch_Onboarder/oauth-client.test.js).
- Verify IAM tenant-scoping — that gate fires before tenant #2 enters staging per the B1/B5 plan-row carry-forward notes.
- Validate the channel-token entropy or hash-vs-raw separation — that's B8 unit-test coverage.

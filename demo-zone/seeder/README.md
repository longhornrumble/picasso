# BrightPath demo seeder

Writes synthetic-but-real rows for demo tenant **BRI071351** (hash
`8b464847ae0ede`) into the **staging** data plane so every Mission-Intelligence
dashboard renders a believable "day in the life". Principle: **seed the data
plane, never mock the UI** — the demo tenant is a real tenant whose data happens
to be synthetic.

## Files

| File | Role |
|---|---|
| `generate.py` | Deterministic conversation universe from the persona fixtures + `arc.json`. The single source every writer serializes from. |
| `seed.py` | CLI. One writer per surface, dry-run by default, guarded reset. |
| `ddb.py` | boto3 IO: marshalling (float→Decimal), batched writes/deletes with retry, paginated queries. |
| `verify.sh` | Re-runs each dashboard's reader query and prints the counts. |

Fixtures live one level up: `../personas/brightpath/{persona,forms,arc}.json`.

## Usage

```bash
aws sso login --profile myrecruiter-staging
export AWS_PROFILE=myrecruiter-staging

python3 seed.py all                    # dry-run everything (default — writes nothing)
python3 seed.py conversations --live --limit 40   # small live sample first
python3 seed.py all --live             # full seed (~12,340 rows)
python3 seed.py <surface> --live       # one surface: conversations|events|forms|attribution|scheduling|notifications
python3 seed.py reset                  # dry-run purge manifest
python3 seed.py reset --live           # actually purge every demo row
bash verify.sh                         # confirm each reader query returns data
```

`--live` is required to write or delete; without it every command is a dry run.
The run is **idempotent** — deterministic session/submission/booking ids mean a
re-run overwrites the same rows instead of duplicating. Reseed before every demo
to re-anchor timestamps to "now".

## What gets written (full seed)

| Table | Rows | Surface |
|---|---|---|
| `picasso-session-summaries` | 6107 | Conversations (volume, heatmap, topics, trend, after-hours) |
| `picasso-session-events` | ~4400 | Forms /summary funnel tiles (FORM_VIEWED/STARTED/COMPLETED) |
| `picasso-form-submissions` | 1012 | Forms list + Lead Workspace pipeline |
| `picasso-attribution-aggregates` | 30 | Attribution summary + channel + entry-point (6 months) |
| `picasso-entry-points` | 4 | Attribution entry-point registry (QR + campaign) |
| `picasso-booking` | 33 | Scheduling (9 upcoming, 24 past) |
| `picasso-notification-events` | 749 | Notifications (268 messages × lifecycle) |

All numbers trace to `arc.json` (the six-month narrative). The universe
reconciles exactly: 6107 conversations, 1012 leads, per-channel/topic totals as
authored.

## Load-bearing decisions & gotchas (why the code looks the way it does)

- **Two pk conventions.** Conversations key on the **tenant_hash**
  (`TENANT#8b464847ae0ede`); form-submissions/booking key on **tenant_id**
  (`BRI071351`); notifications & attribution pk on **tenant_id**
  (`TENANT#BRI071351`). The hash is used **verbatim** — never recomputed from the
  id (the live Config-Manager hash shape differs from the retired
  deploy_tenant_stack shape).
- **Anti-time-rot.** Every timestamp is relative to the seed run. Conversations
  for "month j-ago" fall in `[now-(j+1)*30d, now-j*30d)`, so a trailing-30d
  dashboard view reads the arc's m0 total, 90d reads m0+m-1+m-2, etc. Bookings
  sit within now±90d (the scheduling GSI window). Reseeding re-anchors the clock.
- **Attribution shape — dual-written on purpose.** The dashboard's reader
  (`Analytics_Dashboard_API/attribution_api.py`) reads metrics **top-level**
  (`summary_row.get("conversations")`), but the aggregator writer emits them
  under a **`data` Map**. Real stored rows use the `data` wrapper — which the
  dashboard reader would read as **zeros**. So each C5 row is written **both**
  ways (top-level primary + `data` hedge). Verified empirically against live
  rows, not the fixture's `_c5_row_shapes` note (which documents only the `data`
  form and would render zeros through the current reader).
- **m0 seeded directly, not via the live aggregator (v1).** The roadmap's
  `_seeding_split` wanted the current month computed by the real
  `Attribution_Aggregator` from raw `CONVERSATION_STARTED` events. v1 writes all
  months (incl. m0) as **direct C5 aggregates** — deterministic, no dependency on
  the aggregator's schedule/credentials mid-demo. Live conversations created
  *during* an actual demo still flow through the real pipeline on top. (Open:
  wire the live-pipeline m0 path for the P2 rehearsal if desired.)
- **Nullable time fields seeded as null.** `self_booked_pct` /
  `median_first_response_minutes` are `None` in production (no scheduling source
  wired). Seeded null for all months — consistent, matches reality (resolves the
  arc's `_unresolved_nullable_fields` for v1).
- **Lead pipeline enum remap.** The arc's aspirational states map to the product
  enum `VALID_PIPELINE_STATUSES = new/reviewing/contacted/archived`:
  qualified→reviewing, converted→archived. `tenant_pipeline_key` = `"{tenant_id}#{status}"`
  is written in lockstep with `pipeline_status` (the queue GSI depends on it), and
  both `timestamp` and `submitted_at` are written (two different GSI sort keys).
- **`is_synthetic` is never set on bookings** — the scheduling reader filters out
  any row that has it. Setting it hides the row.
- **Notification event types** are lowercase SES names (`send`/`delivery`/`open`/
  `click`/`bounce`), and a message's lifecycle events **share one `message_id`**
  (or the detail/lifecycle rollup breaks). Stored destinations are the fictional
  `@example.org` roster — these rows are **history only, never actually sent**.
- **`DEMO_STAFF_EMAIL`** (`seed.py`, default `demo@myrecruiter.ai`) is the
  bookings' `coordinator_email` (lowercased). The default scheduling scope
  (`staff_self`) filters on the viewer's email, so **this must equal the scoped
  Clerk demo user's email** or the demo user sees no bookings (an admin using the
  `tenant_aggregate` scope sees them regardless). Set it to whatever address the
  P1 demo user is provisioned under.
- **Session-id prefix `sess-demo-`** on every conversation, so a future prod IAM
  policy can scope `SESSION#sess-demo-*` (roadmap §4 prod-safety).

## v1 scope boundaries (deliberately deferred)

- **Conversation transcript drill-down** — the recent-conversations list renders
  (first question, topic, outcome), but drilling into a single conversation shows
  only the FORM_* funnel events, not a full message-by-message Q&A transcript.
  Seeding per-message events for 6107 conversations (~50k rows) is a secondary
  view; deferred.
- **Per-page website entry points** — the mint service rejects `channel:website`,
  so per-page website provenance (Homepage vs Giving page) isn't producible
  through the supported path. v1 accepts a single undifferentiated `website`
  channel (arc `entry_points._not_mintable`). Only the 4 mintable eps (2
  standalone QR + 2 campaign) get registry rows.

## Prerequisite for the entry-points *list* endpoint

`GET /attribution/entry-points` returns `[]` unless the `Analytics_Dashboard_API`
Lambda has `ENTRY_POINTS_TABLE=picasso-entry-points` set in its env. The channel
view still renders (falls back to the aggregate row's denormalized
label/campaign/placement). Verify the env var before relying on the eps list.

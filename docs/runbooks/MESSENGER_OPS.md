# Messenger Ops Runbook

> THE consolidated operator doc for the Messenger channel (FB Messenger + Instagram DM), per the program plan §11 ([MESSENGER_CHANNEL_EXPERIENCE.md](../roadmap/MESSENGER_CHANNEL_EXPERIENCE.md)). Seeded by M-Ha (channel health); M5 (welcome-surface re-push), M6b (tenant onboarding), and M-Hb (moderation) add their sections here — do not fork per-subphase docs.

Everything here is staging-account (525) unless a section says otherwise. Prod promotion is a separate gated program.

---

## 1. Channel health (M-Ha)

**The failure mode:** Meta emits NO token-invalidation webhook. A disconnected Page, expired token, or Meta policy action simply makes every send fail — without detection that is silent channel death, discovered by the tenant.

**The signal chain:** every failed Send API call in `Meta_Response_Processor` logs a structured `META_SEND_FAILURE` line with a `classification` field (`metaSendErrors.js`, lambda repo) → CloudWatch metric filters (`infra/modules/ops-alarms-meta-staging/`) publish `Picasso/MetaSend` metrics per class with a `ChannelType` dimension → alarms → `picasso-ops-alerts-staging` SNS → Slack.

| Classification | Meta error | Meaning | Alarm |
|---|---|---|---|
| `token_dead` | code 190 | Page token invalid/expired — **channel is dead** | `OUTAGE! Meta {channel} channel dead…` — Sum ≥ 2/5min for 3 periods (a dead token fails *every* send; sustained ≠ blip) |
| `page_restricted` | code 10 / subcode 1893063 | Meta restricted the Page's messaging (policy enforcement) | `OUTAGE! Meta {channel} Page messaging restricted…` — immediate (≥1) |
| `rate_limited` | code 613 | Send rate limit | ≥ 15/5min burst alarm |
| `window_closed` | code 10 / subcode 1545041 | Sent outside the 24h window | metric only — the processor's 24h guard owns this; sustained appearances mean a guard bug |
| `user_unavailable` | code 551 | Recipient unavailable/blocked the Page | metric only — per-user noise, never page-worthy |

### Reconnect procedure (token_dead fired)

1. Confirm: CloudWatch → `Picasso/MetaSend` → `MetaSendFailure_token_dead` by `ChannelType`; correlate `META_SEND_FAILURE` lines in `/aws/lambda/Meta_Response_Processor` (fields: pageId, channelType, code/subcode — no content).
2. Identify the tenant: `pageId` → `picasso-channel-mappings` (`PK=PAGE#{pageId}`).
3. Re-run the OAuth connect flow for that tenant (Config Builder → Channels → Connect; or the `Meta_OAuth_Handler` connect URL). A successful reconnect writes a fresh encrypted token to `picasso-channel-mappings`.
4. Verify: send a test DM → reply arrives; `token_dead` metric stops incrementing; alarm returns OK (ok_actions notify).
5. If reconnect fails with the same 190: check the Meta App Dashboard for app-level issues (secret rotation, app restriction) before suspecting the tenant's Page.

### page_restricted fired

Meta took policy action against the tenant's Page. Check the Page's **Support Inbox** (business.facebook.com → Page settings → Support Inbox) for the violation notice + cure window (typically 7 days). This is a tenant-communication event, not an infrastructure fix. Pause expectations accordingly; document the notice.

### Webhook field subscriptions (dashboard-side)

Source of truth: `Lambdas/lambda/docs/messenger/DASHBOARD_RUNBOOK.md` (M1a). Additionally for health (this subphase):

- Subscribe **Page Integrity** (`messaging_policy_enforcement` webhook field) in the App Dashboard — Meta pushes policy-enforcement notices there; today they land as logged intentional skips in the webhook (visible in logs), a future subphase may route them to alerting.

### Synthetic verification (DONE-line check, operator)

With staging SSO: temporarily corrupt the encrypted token for a TEST page mapping (or revoke the test Page's token in the Meta dashboard), send a DM → expect `META_SEND_FAILURE`/`token_dead` lines, metric increments, and the OUTAGE alarm within ~15 min. Restore/reconnect afterwards. Never run this against a real tenant's Page.

---

## 2. Welcome-surface re-push (M5)

Connect-time pushes happen automatically (OAuth callback, flag-gated). When a
tenant's `messenger_behavior.welcome` changes AFTER connect (the Config
Builder can't trigger pushes yet), re-push with operator staging creds:

```bash
cd Lambdas/lambda/Meta_OAuth_Handler
CONFIG_BUCKET=<staging tenant-config bucket> CHANNEL_MAPPINGS_TABLE=picasso-channel-mappings python3 scripts/repush_welcome_surfaces.py <TENANT_ID> --channel messenger   # dry-run: prints the exact profile payload
# review, then add --execute
```

Notes: ice breakers cap at 4 (C5); menu titles truncate at 20 chars; a tenant
with linked IG shares the same Page profile (one push covers both). Verify in
the real client: profile changes can take a few minutes + a conversation
refresh to appear.

## 2b. Escalation notify (M6a)

Escalations pass thread control to the Business Suite inbox and email the
address in `messenger_behavior.escalation_email` (unset ⇒ transfer + pause
still happen, no email — configure it for every live tenant). The email is
CONTENT-FREE by tested invariant (G-P2): channel, tenantId, pageId, timestamp,
deep link only — staff read the conversation in the inbox
(business.facebook.com/latest/inbox). The bot pauses 24h per escalation
(`picasso-conversation-state` `pause` row); M6b adds staff-reply echo-watch +
resume semantics.

## 3. Tenant onboarding checklist (M6b)

## Why this matters

Once a tenant connects a Page/IG account (`Meta_OAuth_Handler`) with
`feature_flags.MESSENGER_CHANNEL` on, the bot answers every inbound DM. If
staff ALSO reply from Meta Business Suite on the same thread — or another
connected tool sends a message — two systems can answer the same customer at
once unless one of them stands down. M6b gives the bot two independent ways
to detect "a human/other tool just replied" and stand down for ~24h:

1. **Thread-control handoff (M6a)** — when a user explicitly asks for a
   human, the bot calls `pass_thread_control` to hand the Page's default
   inbox app the conversation. Requires **Conversation Routing** to be
   configured (below).
2. **Echo-watch (M6b, belt-and-suspenders)** — works even if Conversation
   Routing was never set up: every reply on a thread (bot's own, staff's, or
   another tool's) generates a Meta "echo" webhook event carrying an
   `app_id`. If that `app_id` isn't ours, M6b treats it as a signal that a
   human/other tool is now active and writes the same C4 pause row directly
   — no dependency on thread-control state.

Both paths write to the same `picasso-conversation-state` `pause` row (C4);
either one standing the bot down is sufficient.

## Onboarding checklist

- [ ] **Our app is the Page's default application.** Meta Business Suite →
      Settings → this Page's connected apps → confirm the Picasso app is
      listed and set as default under **Conversation Routing** (formerly
      "Automated Assistant handover"). Conversation Routing is what makes
      `pass_thread_control` (M6a) actually move the thread instead of
      returning a non-2xx (which M6a treats as "not configured, proceed
      anyway" — the escalation confirmation, pause, and email still fire, but
      the thread does NOT visibly transfer in the Business Suite inbox UI
      without this step).
- [ ] **Take/pass thread control is enabled** for our app on this Page (same
      Conversation Routing screen — the toggle that allows an app to hand
      control back and forth). Without it, `pass_thread_control` calls fail
      even if our app is the default.
- [ ] **Business Suite instant-reply / away-message automations are OFF**
      for this Page. Meta's own auto-responders are a second bot answering
      the same inbound message the Picasso bot just answered — a
      double-responder hazard distinct from a staff member typing a reply.
      Business Suite → Automation → turn off "Instant Reply" and "Away
      Message" (or scope them to hours Picasso itself isn't handling, if the
      tenant insists on keeping one).
- [ ] **Meta Business AI Agent ("Meta Business Agent") is OFF** for this
      Page/IG account. This is Meta's own AI auto-responder product — running
      it alongside Picasso is the same double-responder hazard as the
      instant-reply automations above, except AI-generated (less
      predictable, harder for staff to notice conflicting replies).
- [ ] **Webhook fields subscribed** (see `docs/messenger/DASHBOARD_RUNBOOK.md`
      — subscribe at M6b, not before): `message_echoes` (FB) /
      `message_echoes` (IG) and `messaging_standby` (FB) / `standby` (IG).
      Without these subscriptions Meta never delivers the echo/standby
      events echo-watch and standby-consumption depend on — the bot would
      still work, but silently lose BOTH coexistence mechanisms (M6a's
      confirmation-and-pause still works via the user's own escalation
      request; echo-watch and standby-consumption specifically need these
      fields).
- [ ] **`messenger_behavior.escalation_email`** set in the tenant config if
      staff want a notification when a user asks for a human (optional — the
      handoff + pause proceed either way; C2).

## Verification steps (staging)

Do this on both a Facebook Page and an Instagram account connected to the
same test tenant:

1. **Send a test DM** to the connected Page/IG account from a personal
   test-user account. Confirm the bot replies normally.
2. **Reply as staff** from the Business Suite inbox (typing a real reply,
   not tapping "AI suggested reply" if that's a distinct Meta feature) on
   that same thread.
   - Expected: the next inbound message from the test user gets **no bot
     reply** — CloudWatch shows `Echo-watch pause written — foreign-app
     reply detected, bot standing down` (or, if Conversation Routing was
     already configured and the user had explicitly asked for a human, the
     M6a escalation path already paused it first — either is correct).
   - Verify the `picasso-conversation-state` table has a `pause` row for
     `meta:{pageId}:{psid}` with `reason` = `echo_watch` (or `escalation`)
     and `expires_at` ≈ now + 24h.
3. **Resume — wait it out (soak-friendly shortcut: don't actually wait 24h
   in staging)**: either
   - let the pause row's `expires_at` pass (24h) — the next inbound message
     gets a normal bot reply again, and the stale row is opportunistically
     deleted on that same read (best-effort; DynamoDB's own TTL sweep is the
     backstop if the opportunistic delete doesn't fire), OR
   - **explicit resume (NOT YET IMPLEMENTED)**: staff can hand the thread
     back via **Take Thread Control** in the Business Suite inbox, but our
     bot does NOT currently consume thread-control webhooks — the local
     pause row still gates replies until it expires (24h) or the
     opportunistic cleanup fires. Consuming pass/take_thread_control events
     to clear the pause early is a named follow-up. For staging
     verification, test the expiry path with a short-lived synthetic row
     rather than waiting a day.
4. **Double-responder regression check**: with Business Suite instant-reply
   OFF and Meta Business Agent OFF (checklist above), send a DM and confirm
   only ONE reply arrives (the bot's). If two replies arrive, one of those
   automations is still on for this Page.

## What "done" looks like

- A staff reply from the inbox visibly pauses the bot (CloudWatch log +
  `pause` row, verified live per step 2 above).
- The bot resumes after either the 24h idle expiry or an explicit
  Take Thread Control handoff (step 3).
- No double-reply is observed with the tenant's automations configured per
  the checklist (step 4).

## 4. Moderation & rate limits (M-Hb)

## Why this matters

Any DM to a connected Page/IG account reaches `Meta_Response_Processor`
without any login, CAPTCHA, or account creation — it is an unauthenticated
public path straight into a Bedrock call. That's an acceptable, expected
surface for one operator/one tenant during Meta's App Review "developer +
tester" allowlist window, but becomes a real spend risk once **Advanced
Access** ships and any member of the public can message a connected Page.
M-Hb adds two automatic, config-driven counters (`Meta_Response_Processor/rateLimits.js`)
so a flood — accidental (a broken client retry loop) or deliberate (a
scripted flood) — gets bounded, polite pushback instead of unbounded spend.

Moderation itself (blocking/reporting an abusive PSID) is **not** a built
tool — it is a manual step in the Business Suite inbox, documented below as
an operator procedure. The rate limiter buys time to do that; it does not
replace it.

## What the rate limits do

Two independent counters, both riding the C4 `picasso-conversation-state`
table (additive `stateType` rows — `rl_user:{yyyymmddHH}`, UTC hour bucket;
`rl_day:{yyyymmdd}`, UTC day bucket):

| Limit | Default | Config override | Scope |
|---|---|---|---|
| Per-PSID hourly turn count | **30** turns/hour | `messenger_behavior.rate_limits.per_user_hourly` | one Messenger/IG user, one tenant |
| Per-tenant daily turn count | **1000** turns/day | `messenger_behavior.rate_limits.tenant_daily` | every user of one tenant, combined |

```json
{
  "messenger_behavior": {
    "rate_limits": {
      "per_user_hourly": 30,
      "tenant_daily": 1000
    }
  }
}
```

Both fields are optional — omit either (or the whole `rate_limits` section)
to keep the code default. **v1 does not honor `channel_overrides`** for rate
limits — one pair of numbers applies to both Messenger and Instagram DM for
a tenant. (If a tenant later needs Messenger and Instagram tuned separately,
that's a small additive follow-up, not a redesign.)

Checked ONCE per winning invocation of the C7 per-conversation lock — after
the escalation check (see "escalation is never throttled" below), before any
Bedrock call. This also covers any C7 drain cycles that invocation goes on
to run: a coalesced burst is already combined into a single Bedrock call
(C7's own spend model), so one rate-limit check/increment per winning
invocation is the correct accounting unit — not one per message.

**Behavior once a limit is hit:**
- First 3 breaches past the limit → the bot still replies, with the
  polite, config-driven `rate_limited` string (`messenger_behavior.strings.rate_limited`;
  default: *"You're sending messages faster than I can keep up — one moment
  please."*).
- 4th+ consecutive breach in the same window → fully silent. No reply, no
  Bedrock call, no history write. This is deliberate — a sustained flood
  does not need four warnings, and every additional reply is itself more
  spend.
- Either way: no Bedrock call, no `picasso-recent-messages` history rows for
  a rate-limited turn.

**Escalation is never throttled.** The "talk to a human" detector
(`escalation.detectEscalationIntent`) runs *before* the rate-limit check. A
user who has been rate-limited can still reach a human by asking for one —
the limiter only ever suppresses bot replies, never a user's ability to
escalate.

**Fail-open.** If the `picasso-conversation-state` table is unreachable (or
any DynamoDB error occurs while bumping a counter), the limiter logs a WARN
and lets the turn proceed normally. A flaky counters table must never be the
reason a legitimate user gets no reply — this is a cost control, not an
availability gate.

## The `TENANT_DAILY_CAP` log marker

When the **tenant-wide** daily cap is hit, the processor logs a structured
WARN whose `message` field is the literal string `TENANT_DAILY_CAP`
(CloudWatch Logs Insights / a metric filter can watch for it directly). A
per-user hourly breach instead logs `RATE_LIMITED user`. Seeing
`TENANT_DAILY_CAP` repeatedly for one tenant is the signal that either:
- the tenant's real traffic has genuinely grown past 1000 turns/day (raise
  `messenger_behavior.rate_limits.tenant_daily` for that tenant), or
- one or more PSIDs are flooding hard enough, spread across enough hourly
  windows or distinct users, to add up to the tenant-wide cap — worth
  checking the per-PSID `RATE_LIMITED user` volume for the same window
  before assuming it's legitimate growth.

There is no CloudWatch alarm wired to this marker yet — for now it's a
grep/Insights-query target during an incident, not a paging alert.

## Operator procedure: blocking/reporting a PSID (Moderate Conversations)

The rate limiter buys time; it does not stop a determined abuser
indefinitely (three polite replies per window, forever, is still bounded
but non-zero spend). For sustained abuse from one person, use Meta's
**Moderate Conversations** feature directly from the Page/IG inbox. This is
a manual operator action — Picasso has no API integration with it and none
is planned.

**When to use this:** a specific PSID keeps hitting `RATE_LIMITED user` well
past the first-3-breaches polite window, session after session — i.e. the
automatic throttle is firing repeatedly for the same person, not a one-off
burst.

**How:**
1. Open **Meta Business Suite** → **Inbox** for the connected Page (or the
   Instagram professional account's inbox).
2. Find the conversation thread with the abusive PSID (search by name/last
   message, or cross-reference the `psid` from the `RATE_LIMITED user` log
   line against the inbox thread list — the log intentionally does not
   carry enough context to jump straight to the thread; matching by
   timestamp + recent message content in the inbox is the practical path).
3. Open the conversation, click the participant's name/profile chip →
   **Block** (or **Report**, if the content itself warrants it — spam,
   abuse, illegal content, etc., per Meta's own reporting flow).
4. Blocking prevents that PSID from messaging the Page/IG account at all —
   this stops the flood at the Meta platform level, upstream of Picasso
   entirely (no more webhook deliveries for that PSID, so the rate limiter
   never even sees future traffic from them).

**This is deliberately a one-operator, one-tenant manual procedure today**
— no bulk-block tooling, no cross-tenant blocklist, no API automation. If a
future phase needs bulk/cross-tenant moderation tooling, that's a new
scoped subphase, not a retrofit of this doc.

## What "done" looks like

- A flood test from one PSID gets the polite `rate_limited` reply for its
  first 3 breaches, then goes silent — verified against a live staging DM
  burst.
- A tenant-wide daily cap test produces the `TENANT_DAILY_CAP` log marker
  and a polite reply, without touching Bedrock.
- An operator can find and block a real abusive PSID via Business Suite
  inbox using the steps above.

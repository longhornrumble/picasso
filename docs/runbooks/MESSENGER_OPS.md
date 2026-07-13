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

## 2. Welcome-surface re-push (M5 — placeholder)

Added when M5 ships: operator script to re-push ice breakers + persistent menu from tenant config via the Messenger Profile API.

## 3. Tenant onboarding checklist (M6b — placeholder)

Added when M6b ships: our app = default application, take-control ON, Business Suite automations OFF, Meta Business Agent OFF (double-responder hazard).

## 4. Moderation (M-Hb — placeholder)

Added when M-Hb ships: Moderate Conversations API (block/spam) operator procedures.

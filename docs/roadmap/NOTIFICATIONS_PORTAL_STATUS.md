
# Notifications — Project Status

> Standalone project tracker for the notification system. Portal-wide status is in [PORTAL_PROJECT_STATUS.md](PORTAL_PROJECT_STATUS.md).

---

## Completed

| Item | Status |
|------|--------|
| Phase 1 — notification reliability | Complete |
| Phase 2a — dashboard API + frontend | Complete |
| Phase 2b — recipients management | Complete |
| Phase 2c — template editing | Complete |
| Applicant confirmation emails (name extraction, auto-capitalize) | Complete |
| Feature flag `dashboard_notifications` in config builder | Complete |
| SSO_Token_Generator reads flag from config (not auto-derived) | Complete |
| Notification summary fix (single source of truth from events table) | Complete |
| Mock data for demo tenant (MYR384719) | Complete |
| GitHub issues #6, #7, #10 closed; #13 created | Complete |
| Config builder dead code cleanup (`NotificationConfig` component + tests) | Complete |

---

## What's Built

**Top nav:** Conversations | Forms | Attribution | **Notifications** (feature-flagged via `dashboard_notifications` in config builder Settings > Features)

### Three sub-tabs

#### 1. Dashboard
- 4 stat cards: Sent, Delivered, Bounced, Opened (with rates)
- Paginated event log with filters (channel, status, search by recipient)
- Date range selector
- Per-message detail view (full delivery lifecycle)

#### 2. Recipients
- Per-form recipient management (add/remove email addresses)
- Enable/disable notifications per form
- Channel toggles (email/SMS)
- Test-send to verify a new recipient
- Save with dirty tracking

#### 3. Templates
- Per-form template editor (form selector dropdown)
- Internal notification: subject + body template
- Applicant confirmation: subject + body template + tenant branding toggle
- Template variables reference: `{first_name}`, `{last_name}`, `{email}`, `{phone}`, `{organization_name}`, `{form_data}`
- Preview modal (sandboxed iframe rendering with sample data)
- Test-send (sends to authenticated user's email)
- Save with dirty tracking

---

## Backend (Analytics_Dashboard_API)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/notifications/summary` | Delivery stats for date range |
| GET | `/notifications/events` | Paginated event log |
| GET | `/notifications/events/{message_id}` | Single message lifecycle |
| GET | `/settings/notifications` | All form notification settings |
| PATCH | `/settings/notifications` | Update recipients/channels per form |
| POST | `/settings/notifications/recipients/test-send` | Test email to recipient |
| GET | `/settings/notifications/templates` | All form templates |
| PATCH | `/settings/notifications/templates/{form_id}` | Update templates |
| POST | `/settings/notifications/templates/{form_id}/preview` | Render preview HTML |
| POST | `/settings/notifications/templates/{form_id}/test-send` | Send test email |

All write endpoints enforce `admin`/`super_admin` role. S3 ETag optimistic locking on config updates. Deep merge preserves BPO-owned fields.

---

## What Triggers Notifications

Form submission → Bedrock handler reads per-form `notifications` config → sends internal notification to recipients via SES → sends applicant confirmation to submitter's email → writes audit records to `picasso-notification-sends` DynamoDB table → SES delivery events flow to `picasso-notification-events` via `ses_event_handler`.

---

## Uncommitted Work

| Repo | What |
|------|------|
| Lambda | SSO_Token_Generator feature flag change, Analytics API summary fix |
| Dashboard | Mock data for notifications |

---

## Not Started

| Item | Notes |
|------|-------|
| SES OPEN/CLICK events on ConfigurationSet | Prerequisite for open/click tracking in production |
| Production tenant config population (#11) | Deferred until per-tenant approval |
| Bubble SES forwarding disable | Deferred — notifications still dual-writing to Bubble |

---

## Branch Map

| Repo | Dev Branch | Production |
|------|-----------|------------|
| lambda | `feature/portal` | `main` |
| dashboard | `feature/notifications-dashboard` | — |

---

## Key Infrastructure

| Resource | ID/URL |
|----------|--------|
| Analytics API | `Analytics_Dashboard_API` Lambda |
| Notification sends table | `picasso-notification-sends` DynamoDB |
| Notification events table | `picasso-notification-events` DynamoDB |
| SES event handler | `ses_event_handler` Lambda |

---

## Config Builder Touchpoints

The config builder is **not** where notification recipients/templates are managed — the portal owns that. Config builder's role:

- **`dashboard_notifications` feature flag** (Settings → Features) — gates the Notifications tab in the portal
- **`notification_settings`** (Settings → General) — bubble_forwarding toggle + from_email (tenant-wide plumbing)
- **`FormNotificationConfig` type** — preserved in types for merge passthrough; no UI renders it

Notification setup for new tenants is an **onboarding process step**, not a config builder feature: enable the flag, point the customer to the portal's Notifications tab.

---

## Known Gaps

| # | Area | Issue | Priority |
|---|------|-------|----------|
| G1 | Backend | **SMS channel not implemented** — Recipients UI shows email/SMS toggles, config saves, but `form_handler.js` never reads `notifications.internal.channels.sms`. SMS is silently ignored. | Critical |
| G2 | Backend | **`use_tenant_branding` flag ignored** — Templates UI has branding checkbox for applicant confirmations. Saves to config but `sendConfirmationEmail()` never checks it. Emails are bare `<div>` with `<br>` regardless. | Critical |
| G3 | Backend | **Test-send doesn't match production rendering** — Recipients and Templates test-send both send plain text via SES, but actual form submissions produce basic HTML. Preview and test emails don't reflect what recipients get. | Medium |
| G4 | Backend | **Bounce/complaint events lack detail** — Dashboard shows "bounced" or "complained" with no reason (hard vs. soft bounce, complaint type). SES delivers this data but `ses_event_handler` doesn't extract or store it. | Medium |
| G5 | Backend | **`session_id` SES tag never populated** — `form_handler.js` sets `form_id` and `submission_id` tags but never `session_id`. `ses_event_handler` tries to extract it and gets nothing. Can't trace notification → session. | Medium |
| G6 | Backend | **Template variable substitution edge cases** — Empty merge variables produce artifacts (`"Hi !"`, doubled commas). Collapse logic in `form_handler.js` is fragile. | Medium |
| G7 | Backend | **Applicant confirmation fallback logic** — `form_handler.js` mixes old-style (`config.send_confirmation_email`) and new-style (`notifications.applicant_confirmation.enabled`) checks. Inconsistent behavior between config styles. | Medium |
| G8 | Ops | **No alerting on notification failures** — SES send failures are logged and recorded as failed in DynamoDB, but nothing alerts. Silent production failures. | Medium |
| G9 | Frontend | **Event detail endpoint exists but isn't called** — `GET /notifications/events/{message_id}` is implemented in the API but the dashboard UI never calls it. Per-message detail view may be incomplete. | Low |
| G10 | Infra | **SES OPEN/CLICK events not enabled** — ConfigurationSet doesn't have OPEN/CLICK event destinations. Open/click rates will show 0% in production. | Medium |
| G11 | Process | **No onboarding checklist** for guiding customers through notification setup | Low |

---

## Remediation Plan

### Phase R1 — Fix what's broken (G1, G2, G7)

The UI makes promises the backend doesn't keep. These are trust issues — a customer enables a feature and it silently does nothing.

#### R1.1 — SMS via dedicated Telnyx Lambda (G1)

**Decision:** Build. SMS is foundational — needed now for form notifications (internal + applicant) and later for appointment scheduling reminders.

**Architecture:** Separate `SMS_Sender` Lambda (Node.js) + `SMS_Webhook_Handler` Lambda. Shared service — form notifications and future scheduling both invoke SMS_Sender.

**Why Telnyx:**
- Native `send_at` param for scheduled appointment reminders (up to 7 days out)
- Delivery status webhooks (message.sent, message.finalized → delivered/failed) feed into `picasso-notification-events`
- Automatic STOP/HELP keyword compliance for opt-out
- No SDK dependency — simple REST API with `fetch`
- Ed25519 webhook signature verification via Node.js built-in `crypto`
- Toll-free number avoids A2P 10DLC registration delays

**Implementation:**

1. **Telnyx account setup**
   - Account created. Buy toll-free number via Mission Control Portal.
   - Create API key (Mission Control → API Keys)
   - Store API key + from number in Secrets Manager: `picasso/telnyx`
   - Get public key for webhook verification (Mission Control → Keys & Credentials)

2. **`SMS_Sender` Lambda** (new, Node.js 20.x) — **BUILT**
   - Input: `{ to, body, tenantId, formId, submissionId, sessionId, type }`
   - Direct REST call: `POST https://api.telnyx.com/v2/messages` (no SDK)
   - Per-message `webhook_url` with context query params for delivery tracking
   - Writes send record to `picasso-notification-sends` (channel: `sms`)
   - DLQ configured for failed async invocations
   - IAM: Secrets Manager read, DynamoDB write

3. **`SMS_Webhook_Handler` Lambda** (new, separate Lambda with Function URL) — **BUILT**
   - Receives Telnyx delivery webhooks (message.sent, message.finalized)
   - Ed25519 signature validation via `TELNYX_PUBLIC_KEY` env var
   - Writes to `picasso-notification-events` (channel: `sms`)
   - IAM: DynamoDB write only (no Secrets Manager)

4. **Form notification pipeline** — **BUILT**
   - `form_handler.js`: reads `notifications.internal.channels.sms` + `sms_recipients`
   - Invokes `SMS_Sender` Lambda async per recipient
   - Per-recipient rate limit counting
   - Legacy `fulfillment.sms_to` still supported as fallback

5. **Recipient phone numbers**
   - `sms_recipients: string[]` added to `FormNotificationConfig` type — **BUILT**
   - E.164 server-side validation on Analytics API PATCH — **BUILT**
   - Portal Recipients tab: phone number input UI — **NOT YET BUILT**

6. **Dashboard integration**
   - Event log already has channel filter — SMS events will appear with `channel: "sms"`
   - Summary stats: add SMS sent/delivered/failed counts (or unified with email)

**Files:**
- `Lambdas/lambda/SMS_Sender/` — Telnyx SMS Lambda (REST API, Secrets Manager)
- `Lambdas/lambda/SMS_Webhook_Handler/` — Telnyx delivery status webhook handler
- `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/form_handler.js` — SMS invocation + branding + confirmation logic
- `Lambdas/lambda/Analytics_Dashboard_API/lambda_function.py` — E.164 validation
- `picasso-config-builder/src/types/config.ts` — sms_recipients type

**Future use by scheduling:**
- Appointment reminders invoke `SMS_Sender` with `type: "reminder"` and Telnyx `send_at` for scheduling
- EventBridge rules for intervals beyond 7 days
- Two-way SMS: Telnyx webhook receives inbound replies (message.received), routes to scheduling confirmation

#### R1.2 — Tenant branding in applicant confirmations (G2)

**Goal:** When `use_tenant_branding: true`, wrap confirmation emails in an HTML template with tenant logo, colors, and styling.

**Implementation:**
1. In `form_handler.js` → `sendConfirmationEmail()`: read `use_tenant_branding` from per-form notification config
2. If true, load tenant branding from config (`branding.logo_url`, `branding.primary_color`, `branding.organization_name`)
3. Wrap the body template in a branded HTML email layout (responsive, inline CSS for email client compatibility)
4. If false, send current bare HTML (existing behavior)

**Files:**
- `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/form_handler.js` — `sendConfirmationEmail()`
- Need to define a base HTML email template (inline CSS, logo placement, color theming)

#### R1.3 — Clean up confirmation fallback logic (G7)

**Goal:** Single code path for deciding whether to send applicant confirmations.

**Implementation:**
1. In `form_handler.js`: if `notifications.applicant_confirmation` exists on the form config, use it exclusively
2. Only fall back to `config.send_confirmation_email` when `notifications.applicant_confirmation` is absent (legacy tenants)
3. Add a comment documenting the precedence

**Files:**
- `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/form_handler.js` — confirmation send logic

---

### Phase R2 — Fix data quality (G4, G5, G6)

The notification pipeline works but records incomplete or malformed data.

#### R2.1 — Store bounce/complaint detail (G4)

**Implementation:**
1. In `ses_event_handler/lambda_function.py`: extract `bounce.bounceType`, `bounce.bounceSubType`, `complaint.complaintFeedbackType` from SES event payload
2. Store as `bounce_type`, `bounce_subtype`, `complaint_type` fields in `picasso-notification-events` DynamoDB records
3. Update `Analytics_Dashboard_API` event query to return these fields
4. Update dashboard event log to display bounce reason in detail column or tooltip

**Files:**
- `Lambdas/lambda/ses_event_handler/lambda_function.py` — event extraction
- `Lambdas/lambda/Analytics_Dashboard_API/lambda_function.py` — event query response
- `picasso-analytics-dashboard/src/pages/NotificationsDashboard.tsx` — event log display

#### R2.2 — Populate session_id SES tag (G5)

**Implementation:**
1. In `form_handler.js`: pass `sessionId` (already available in the handler context) as an SES message tag when sending notifications
2. In `ses_event_handler`: already extracts `session_id` from tags — will start receiving real values

**Files:**
- `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/form_handler.js` — SES send call, message tags

#### R2.3 — Fix template variable substitution (G6)

**Implementation:**
1. In `form_handler.js`: after variable replacement, collapse multiple spaces to single space, trim leading/trailing punctuation artifacts (`, ,` → `,`), handle empty variable gracefully (remove the variable and surrounding whitespace/punctuation)
2. Add test cases: empty first_name, empty all variables, variables adjacent to punctuation

**Files:**
- `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/form_handler.js` — template rendering logic

---

### Phase R3 — Improve fidelity (G3, G9, G10)

Test-send and dashboard should reflect reality.

#### R3.1 — Test-send should match production rendering (G3)

**Implementation:**
1. In `Analytics_Dashboard_API`: recipients test-send and templates test-send should render HTML the same way `form_handler.js` does (including branding if applicable)
2. Extract email rendering into a shared utility or duplicate the rendering logic in the API Lambda
3. Templates preview modal should use the same rendering

**Consideration:** The Analytics API (Python) and Bedrock handler (Node.js) are different runtimes. Options:
- Duplicate the HTML template in both (simpler, some drift risk)
- Store the HTML email template in S3 and have both Lambdas read it (single source of truth)

**Files:**
- `Lambdas/lambda/Analytics_Dashboard_API/lambda_function.py` — test-send endpoints
- `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/form_handler.js` — production rendering

#### R3.2 — Wire up event detail view (G9)

**Implementation:**
1. Verify `GET /notifications/events/{message_id}` returns complete lifecycle data
2. In dashboard UI: add click handler on event log rows to fetch and display the detail view
3. Show full delivery lifecycle: sent → delivered/bounced, timestamps, bounce reason if applicable

**Files:**
- `picasso-analytics-dashboard/src/pages/NotificationsDashboard.tsx` — event log row click handler
- `Lambdas/lambda/Analytics_Dashboard_API/lambda_function.py` — verify endpoint response

#### R3.3 — Enable SES OPEN/CLICK events (G10)

**Implementation:**
1. Update SES ConfigurationSet to add OPEN and CLICK event destinations (SNS → `ses_event_handler`)
2. Verify `ses_event_handler` handles `open` and `click` event types (may already work if event type extraction is generic)
3. Confirmation emails need tracking pixel (for opens) and link wrapping (for clicks) — SES handles this automatically when ConfigurationSet has these events enabled

**Note:** This is an AWS console / CLI change, not a code change. May also need SES sending identity verification for the configuration set.

**Infrastructure:**
- AWS SES ConfigurationSet — add event destinations
- Verify `ses_event_handler` Lambda is subscribed to the SNS topic

---

### Phase R4 — Operational visibility (G8, G11)

#### R4.1 — Notification failure alerting (G8)

**Implementation options (pick one):**
- **CloudWatch alarm:** Filter `ses_event_handler` logs for `event_type=bounce` or `event_type=complaint`, alarm when count exceeds threshold → SNS → email/Slack
- **DynamoDB Streams:** Trigger a Lambda on `picasso-notification-events` writes where `event_type` is `bounce` or `complaint` → send alert
- **Simple approach:** In `form_handler.js`, when SES send fails, write to a CloudWatch custom metric. Alarm on metric > 0.

**Recommendation:** CloudWatch alarm on `ses_event_handler` logs — least code, most signal.

#### R4.2 — Onboarding checklist (G11)

**Process, not code.** Document the notification onboarding steps:
1. Enable `dashboard_notifications` flag in config builder
2. Deploy tenant config
3. Walk customer through Recipients tab — add emails per form
4. Walk customer through Templates tab — customize subject/body
5. Send test email to verify delivery
6. Confirm SES identity for tenant's from_email if custom

---

### Execution Order

| Phase | Gaps | Scope | Dependencies |
|-------|------|-------|-------------|
| R1 | G1, G2, G7 | New SMS Lambda + Twilio setup, Bedrock handler, dashboard UI | Twilio account + phone number required for R1.1 |
| R2 | G4, G5, G6 | Bedrock handler + ses_event_handler + API | None — independent of R1 |
| R3 | G3, G9, G10 | API + dashboard UI + AWS infra | R1.2 (branding must exist before test-send can match it) |
| R4 | G8, G11 | CloudWatch + process doc | R2.1 (bounce detail needed for meaningful alerts) |

R1 and R2 can run in parallel. R3 depends on R1.2. R4 depends on R2.1.

**R1.1 is the largest item** — new Lambda, Twilio integration, recipient schema change, dashboard UI update. Consider splitting into:
- R1.1a: SMS_Sender Lambda + Twilio setup (backend only, testable via CLI)
- R1.1b: Wire into form_handler.js notification pipeline
- R1.1c: Recipient phone numbers in portal UI + API
- R1.1d: Twilio status webhook → notification events pipeline

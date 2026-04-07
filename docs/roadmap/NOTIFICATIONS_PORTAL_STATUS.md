# Notifications in the Portal — Status & Gaps

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

## Known Gaps & Dead Ends (as of 2026-04-07)

_To be populated after UI review._

| Area | Issue | Priority |
|------|-------|----------|
| | | |

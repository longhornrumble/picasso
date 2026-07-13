# Meta Messenger Platform Integration — Picasso/MyRecruiter.ai

> **Purpose:** Reference document for the Meta Messenger Platform integration in the Picasso multi-tenant chat platform. Covers Meta API mechanics, permissions, messaging policy, and the **as-built** AWS architecture.

> **⚠️ AS-BUILT (2026-05-18):** The integration is **implemented** (not a greenfield build). Sections 4–7 and 9–12 are accurate Meta-platform reference. Sections **2, 3, 8, 13** and **16** have been reconciled to the real implementation — the earlier placeholder names (`picasso-tenants`, `RAGResponseHandler`, `MessengerWebhookHandler`, API Gateway) are **superseded**. Real architecture: 3 Lambdas (`Meta_Webhook_Handler`, `Meta_Response_Processor`, `Meta_OAuth_Handler`) behind **Lambda Function URLs** (not API Gateway), reusing the shared `bedrock-core` RAG core, deployed via Terraform to the **staging AWS account (525)** per the 3-account staging-first SOP. See §16 for the deployment model and the live cutover state. Plan: `~/.claude/plans/i-m-continuing-work-on-zany-popcorn.md`.

---

## 1. Overview

### What is the Messenger Platform?

The Meta Messenger Platform is a single API that powers two distinct messaging channels:

| Channel | Entry Point | Object Type |
|---|---|---|
| **Messenger for Business** | "Message" button on a Facebook Business Page | Facebook Page |
| **Instagram Messaging** | Instagram DMs, story mentions, post replies | Instagram Professional Account |

Both channels use **the same webhooks, the same Send API endpoint, and the same app review process**. The difference is the object type in the payload (`page` vs `instagram`).

As of **July 2024**, Instagram Professional accounts no longer require a linked Facebook Page to use the Messaging API.

### Why This Matters for Picasso

Picasso is a multi-tenant SaaS platform. A single Meta App (representing MyRecruiter.ai) connects to multiple client Facebook Pages. Each nonprofit client authorizes the app against their Page via OAuth. Meta's App Review is a **one-time platform-level approval** — not per client. Once approved, onboarding new tenants requires no additional review.

---

## 2. High-Level Architecture

```
Nonprofit's Facebook Page / Instagram Professional account
        │  User sends message
        ▼
Meta Messenger Platform
        │  POST webhook event (JSON), signed X-Hub-Signature-256
        ▼
Meta_Webhook_Handler  (Lambda Function URL, auth NONE)
        │  • HMAC-SHA256 verify (picasso/meta/app-secret | ig-app-secret)
        │  • dedup on message mid (picasso-webhook-dedup-staging)
        │  • resolve tenant from Page ID (picasso-channel-mappings-staging)
        │  • returns 200 < 5s; async-invokes ↓ (never awaits RAG)
        ▼
Meta_Response_Processor  (async; shared/bedrock-core RAG)
        │  • decrypt Page token (KMS alias/picasso-channel-tokens)
        │  • loadConfig (S3 tenant config) → retrieveKB (cross-account
        │    Bedrock KB via assumed prod-side retriever role) → InvokeModel
        │  • conversation context: staging-recent-messages (shared w/ chat)
        ▼
Meta Send API  ──►  Messenger / Instagram thread (user sees response)

Meta_OAuth_Handler  (separate Lambda Function URL): tenant Page connect/
disconnect/toggle/list. Driven by the Config Builder "Channels" UI.
```

### Key Identifiers

- **Page ID** — The client's Facebook Page ID. Routes to the tenant via `picasso-channel-mappings-staging` (PK=`PAGE#<pageId>`, SK=`CHANNEL#<messenger|instagram>`; GSI `TenantIndex` for list-by-tenant).
- **Page Access Token** — Per-tenant credential. Stored **KMS-encrypted** (CMK `alias/picasso-channel-tokens`) in `picasso-channel-mappings-staging`. Required for all Send API calls.
- **PSID (Page-Scoped ID)** — The user's unique ID *per Page*. Not their real Facebook ID. Used as `recipient.id` in Send API calls. The session/user key per tenant.
- **KB ID** — Comes from the **tenant config** (`config.aws.knowledge_base_id`, loaded by `bedrock-core.loadConfig` from the S3 config bucket) — portable across environments; NOT stored in the channel-mappings table.

---

## 3. AWS Infrastructure (Picasso Stack)

### Components Needed

As-built (staging account 525; Terraform `infra/modules/`):

```
Lambda Function URL (auth NONE)
    └── Meta_Webhook_Handler        node22, 256MB, 10s
            ├── GET  webhook verification (MESSENGER_VERIFY_TOKEN)
            ├── POST inbound: HMAC verify → dedup → tenant resolve
            └── async-invoke Meta_Response_Processor (never awaits)

    Meta_Response_Processor          node22, 512MB, 120s, async DLQ
            ├── decrypt Page token (KMS alias/picasso-channel-tokens)
            ├── shared/bedrock-core: loadConfig (S3) → retrieveKB
            │     (cross-account Bedrock KB via assumed prod role) →
            │     InvokeModel
            ├── conversation context: staging-recent-messages
            ├── analytics → SQS picasso-analytics-events-staging
            └── Meta Send API (2000-char split, typing indicator)

Lambda Function URL (auth NONE)
    └── Meta_OAuth_Handler           py3.13, 256MB, 30s
            └── OAuth connect/callback + channels list/toggle/disconnect

DynamoDB (PAY_PER_REQUEST)
    ├── picasso-channel-mappings-staging   PK/SK + GSI TenantIndex; TTL
    │     (per-tenant Page tokens, KMS-encrypted; the durable table)
    ├── picasso-webhook-dedup-staging      PK mid; TTL (idempotency)
    └── staging-recent-messages            REUSED (shared w/ core chat;
          sessionId/messageTimestamp; already Terraform-managed)

KMS    alias/picasso-channel-tokens   CMK — OAuth encrypts, Processor decrypts
Secrets Manager   picasso/meta/app-secret + picasso/meta/ig-app-secret
                  (default encryption; resource-policy locked to the
                   consuming Lambda roles; values set out-of-band)
SQS    meta-response-processor-dlq-staging   (Processor async-invoke DLQ)
CloudWatch   5 alarms → existing picasso-ops-alerts-staging SNS topic
```

Each Lambda has a **dedicated** IAM execution role (never shared) with
explicit prod-account Deny guards, and a KMS-encrypted CloudWatch log
group. Cross-account KB requires the prod-side role
`614…:role/picasso-kb-retriever-from-staging` to trust
`Meta_Response_Processor-role` (named prerequisite — see §16).

### Lambda: MessengerWebhookHandler

This Lambda must handle two request types:

#### GET — Webhook Verification

Meta sends this when you first configure the webhook in the App Dashboard.

```javascript
// GET /webhook
exports.handler = async (event) => {
  if (event.httpMethod === 'GET') {
    const mode = event.queryStringParameters['hub.mode'];
    const token = event.queryStringParameters['hub.verify_token'];
    const challenge = event.queryStringParameters['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      return { statusCode: 200, body: challenge };
    }
    return { statusCode: 403, body: 'Forbidden' };
  }
};
```

**Important:** `VERIFY_TOKEN` is a string you define (store in SSM). It is NOT a Meta-issued token — it's your own shared secret to confirm the webhook is from Meta.

#### POST — Inbound Message Event

```javascript
// POST /webhook
const body = JSON.parse(event.body);

// Validate X-Hub-Signature-256 header (REQUIRED — do not skip)
// See Section 6 for signature validation code

if (body.object === 'page') {
  for (const entry of body.entry) {
    const pageId = entry.id; // Use this to look up tenant in DynamoDB
    for (const messagingEvent of entry.messaging) {
      const psid = messagingEvent.sender.id;
      const messageText = messagingEvent.message?.text;
      if (messageText) {
        // Async invoke RAGResponseHandler — do NOT await here
        // You must return 200 OK within 5 seconds
        await lambda.invoke({
          FunctionName: 'RAGResponseHandler',
          InvocationType: 'Event', // async
          Payload: JSON.stringify({ psid, messageText, pageId })
        }).promise();
      }
    }
  }
  return { statusCode: 200, body: 'EVENT_RECEIVED' };
}
```

> **Critical:** The webhook endpoint must return `200 OK` within **5 seconds**. Never await the RAG pipeline inline. Use async Lambda invocation, SQS, or EventBridge to offload processing.

---

## 4. Meta Send API

### Send a Text Response

```bash
POST https://graph.facebook.com/v21.0/{PAGE-ID}/messages
  ?recipient={"id":"{USER-PSID}"}
  &message={"text":"Thanks for reaching out! How can I help?"}
  &messaging_type=RESPONSE
  &access_token={PAGE-ACCESS-TOKEN}
```

### Send Quick Replies (Recommended for Intake Flows)

Quick replies render as tappable buttons in Messenger — ideal for volunteer qualification:

```json
{
  "recipient": { "id": "USER-PSID" },
  "message": {
    "text": "What best describes your interest?",
    "quick_replies": [
      { "content_type": "text", "title": "Volunteer", "payload": "INTENT_VOLUNTEER" },
      { "content_type": "text", "title": "Donate", "payload": "INTENT_DONATE" },
      { "content_type": "text", "title": "Learn more", "payload": "INTENT_INFO" }
    ]
  }
}
```

Postback payloads arrive at the webhook as `messagingEvent.postback.payload`.

### Typing Indicator (UX Best Practice)

Send before and after the RAG response to simulate human-like response timing:

```bash
POST .../messages
  &sender_action=typing_on
  &recipient={"id":"USER-PSID"}
  &access_token=...
```

---

## 5. Inbound Webhook Payload Reference

### Standard Text Message

```json
{
  "object": "page",
  "entry": [{
    "id": "PAGE_ID",
    "time": 1716000000000,
    "messaging": [{
      "sender": { "id": "USER-PSID" },
      "recipient": { "id": "PAGE-ID" },
      "timestamp": 1716000000000,
      "message": {
        "mid": "m_AbCdEfGh...",
        "text": "Hello, I want to volunteer with CASA"
      }
    }]
  }]
}
```

### Quick Reply / Postback

```json
{
  "messaging": [{
    "sender": { "id": "USER-PSID" },
    "postback": {
      "title": "Volunteer",
      "payload": "INTENT_VOLUNTEER"
    }
  }]
}
```

---

## 6. Security — Payload Signature Validation

Meta signs every webhook POST with HMAC-SHA256 using your App Secret. **Always validate this.**

```javascript
const crypto = require('crypto');

function validateSignature(rawBody, signature, appSecret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// In handler:
const sig = event.headers['x-hub-signature-256'];
const rawBody = event.body; // unparsed string
if (!validateSignature(rawBody, sig, process.env.APP_SECRET)) {
  return { statusCode: 403, body: 'Invalid signature' };
}
```

Store `APP_SECRET` in AWS Secrets Manager or SSM Parameter Store. Never hardcode.

---

## 7. Required Meta App Permissions

| Permission | Purpose | Access Level Needed |
|---|---|---|
| `pages_show_list` | Get client's Page ID and Page Access Token | Standard |
| `pages_messaging` | Send/receive messages — core permission | **Advanced (App Review required)** |
| `pages_read_engagement` | Read posts/comments for comment→DM flows | Advanced |
| `instagram_basic` | Connect Instagram Professional accounts | Standard |
| `instagram_manage_messages` | Send/receive Instagram DMs | Advanced |

### App Review — One-Time Platform Approval

- App Review is required to get **Advanced Access** for `pages_messaging`
- This is a **one-time approval for your Meta App** — not per client tenant
- In development mode, the bot only works with app admins/testers (max 25 test users)
- After approval, any client can authorize your app against their Page via OAuth
- **Timeline:** 2–8 weeks. Plan accordingly before your first production launch
- Meta reviews the end-to-end bot experience — have a working demo ready
- Required submission materials: screencast of full flow, test credentials, privacy policy URL, per-permission justification

---

## 8. Multi-Tenant Onboarding — OAuth Flow

Each new nonprofit client authorizes Picasso's Meta App against their Facebook Page using standard OAuth 2.0. No App Review required per client.

**As-built:** the tenant-facing UI already exists — `picasso-config-builder/src/components/settings/ChannelsSettings.tsx` ("Channels" settings), which calls `Meta_OAuth_Handler` at `VITE_CHANNELS_API_URL` (its Lambda Function URL). The OAuth callback is a path on that same Function URL (`/meta/oauth/callback`), gated by a signed-state JWT; the management routes are Clerk-JWT-gated. The callback URL is registered in the Meta App Dashboard and is environment-specific — see §16 (two-apply + cutover).

### Flow

```
1. Client clicks "Connect Facebook Page" in the Config Builder Channels UI
        │
        ▼
2. Redirect to Meta OAuth dialog:
   https://www.facebook.com/v21.0/dialog/oauth
     ?client_id={APP_ID}
     &redirect_uri={PICASSO_CALLBACK_URL}
     &scope=pages_show_list,pages_messaging
     &state={tenantId}  ← use state param to tie back to tenant
        │
        ▼
3. Client logs in as Facebook admin, selects their Page, grants permissions
        │
        ▼
4. Meta redirects to your callback URL with ?code=...&state={tenantId}
        │
        ▼
5. Exchange code for User Access Token:
   GET https://graph.facebook.com/v21.0/oauth/access_token
     ?client_id={APP_ID}&client_secret={APP_SECRET}
     &redirect_uri={CALLBACK}&code={code}
        │
        ▼
6. Exchange User Access Token for long-lived Page Access Token:
   GET https://graph.facebook.com/v21.0/me/accounts
     ?access_token={USER_ACCESS_TOKEN}
   → Returns array of Pages with per-Page access_token
        │
        ▼
7. Meta_OAuth_Handler stores in picasso-channel-mappings-staging:
   PK=PAGE#{pageId}  SK=CHANNEL#{messenger|instagram}
   { tenantId, channelType, pageName, pageAccessToken (KMS-encrypted
     via alias/picasso-channel-tokens), connectionStatus, ... }
        │
        ▼
8. Subscribe the Page to your webhook:
   POST https://graph.facebook.com/v21.0/{PAGE-ID}/subscribed_apps
     ?subscribed_fields=messages,messaging_postbacks
     &access_token={PAGE-ACCESS-TOKEN}
```

### Long-Lived Tokens

Page Access Tokens obtained via the above flow do **not expire** as long as the user doesn't revoke access. User Access Tokens expire in ~1 hour — always exchange immediately for the long-lived Page Access Token and discard the user token.

---

## 9. Messaging Policy — 24-Hour Window

This is the most important operational constraint. Design conversation flows around it.

| Time Since Last User Message | Bot Can Send | Notes |
|---|---|---|
| 0–24 hours | ✅ Free-form any message | Full RAG responses, quick replies, media |
| 24 hrs – 7 days | ⚠️ Human agent only (manual) | `HUMAN_AGENT` message tag required |
| After 7 days | ❌ Blocked | Must wait for user to message again |

### Outbound Re-engagement (Opt-In Required)

For proactive messaging (volunteer reminders, event notifications), use **Recurring Notifications**:

- Users opt in during the 24-hour window
- They choose frequency: daily, weekly, or monthly
- Available as of July 2025 via the Messenger Platform API
- Cannot be used for unsolicited promotional content
- Violation risks page restrictions or account ban

### Message Tags (Outside 24-hr Window)

Approved tags for non-promotional updates to specific users:

| Tag | Use Case |
|---|---|
| `CONFIRMED_EVENT_UPDATE` | Remind user of event they registered for |
| `POST_PURCHASE_UPDATE` | Order/donation confirmation update |
| `ACCOUNT_UPDATE` | Application status, intake update |
| `HUMAN_AGENT` | Human agent follow-up (7-day window) |

---

## 10. Useful Platform Features for Nonprofit Use Cases

### Get Started Button
Fires a `messaging_postbacks` event when a user opens a new conversation for the first time. Use this to trigger a greeting/onboarding message from the bot before the user types anything.

```json
POST https://graph.facebook.com/v21.0/{PAGE-ID}/messenger_profile
{
  "get_started": { "payload": "GET_STARTED" }
}
```

### Persistent Menu
A hamburger menu always visible in the Messenger thread. Configure once per Page. Requires App Review.

```json
{
  "persistent_menu": [{
    "locale": "default",
    "call_to_actions": [
      { "type": "postback", "title": "Volunteer sign-up", "payload": "MENU_VOLUNTEER" },
      { "type": "postback", "title": "Donate", "payload": "MENU_DONATE" },
      { "type": "web_url", "title": "Our website", "url": "https://client-site.org" }
    ]
  }]
}
```

### Handover Protocol
Pass a conversation from your bot to a human agent inbox (Meta Business Suite) and back. Essential for escalation flows where the AI can't resolve the inquiry.

```json
POST https://graph.facebook.com/v21.0/{PAGE-ID}/pass_thread_control
{
  "recipient": { "id": "USER-PSID" },
  "target_app_id": 263902037430900,  // Meta Business Suite app ID
  "metadata": "Escalated — complex inquiry"
}
```

### Customer Chat Plugin
Embed a Messenger chat widget on the nonprofit's website. Conversations persist across the site and the Messenger app. Configured with a snippet on the client's site pointing to their Page ID.

---

## 11. Instagram DMs — Same App, Additional Config

To also handle Instagram DMs:

1. Add `instagram_basic` and `instagram_manage_messages` permissions to App Review submission
2. In webhook subscription, add object type `instagram` in addition to `page`
3. Client's Instagram Professional account connects in Meta App Dashboard (no longer requires linked Facebook Page as of July 2024)
4. Webhook payload structure is identical — sender PSID, message text
5. Send API endpoint is the same; use the Instagram-scoped User ID as recipient

---

## 12. Rate Limits

| Limit | Value |
|---|---|
| Send API calls | 250 requests/second per Page |
| Broadcast (Recurring Notifications) | 1 message per 48 hours per opt-in token |
| Webhook delivery | Meta retries failed deliveries for up to 24 hours |

---

## 13. Environment Variables Required

As-built per-Lambda env contract (Terraform-managed in `infra/modules/lambda-meta-staging`; `AWS_REGION` is auto-set by the Lambda runtime — not declared):

```bash
# Meta_Webhook_Handler
ENVIRONMENT=staging
CHANNEL_MAPPINGS_TABLE=picasso-channel-mappings-staging
DEDUP_TABLE=picasso-webhook-dedup-staging
META_APP_SECRET_ARN=arn:aws:secretsmanager:...:picasso/meta/app-secret
IG_APP_SECRET_ARN=arn:aws:secretsmanager:...:picasso/meta/ig-app-secret
MESSENGER_VERIFY_TOKEN=***            # reuse 614 value; GitHub staging secret
RESPONSE_PROCESSOR_FUNCTION=Meta_Response_Processor

# Meta_Response_Processor  (cross-account-KB superset the 614 original lacked)
ENVIRONMENT=staging
CHANNEL_MAPPINGS_TABLE=picasso-channel-mappings-staging
RECENT_MESSAGES_TABLE=staging-recent-messages
KMS_KEY_ID=alias/picasso-channel-tokens
ANALYTICS_QUEUE_URL=https://sqs...525.../picasso-analytics-events-staging
KB_RETRIEVER_ROLE_ARN=arn:aws:iam::614056832592:role/picasso-kb-retriever-from-staging
CONFIG_BUCKET=myrecruiter-picasso-staging
TENANT_REGISTRY_TABLE=picasso-tenant-registry-staging
USE_REGISTRY_FOR_RESOLUTION=true

# Meta_OAuth_Handler
ENVIRONMENT=staging
META_APP_ID=791705810685396           # single Meta App, both accounts (dev mode)
META_APP_SECRET_ARN=arn:aws:secretsmanager:...:picasso/meta/app-secret
KMS_KEY_ID=alias/picasso-channel-tokens
CHANNEL_MAPPINGS_TABLE=picasso-channel-mappings-staging
OAUTH_CALLBACK_URL=https://<oauth-fn-url>/meta/oauth/callback  # two-apply (§16)
```

---

## 14. Development & Testing

- In **development mode**, the bot works only with app admins, developers, and testers (up to 25 test users)
- Add test users in App Dashboard → Roles
- Use the **Graph API Explorer** (developers.facebook.com/tools/explorer) to test Send API calls manually
- Use **ngrok** or AWS SAM local to expose your webhook handler during local dev
- Meta provides a **Webhook Test** button in the App Dashboard to send sample payloads to your endpoint

---

## 15. Reference Links

| Resource | URL |
|---|---|
| Messenger Platform Overview | https://developers.facebook.com/docs/messenger-platform/overview |
| Get Started Guide | https://developers.facebook.com/docs/messenger-platform/get-started |
| Webhooks Reference | https://developers.facebook.com/docs/messenger-platform/webhooks |
| Send API Reference | https://developers.facebook.com/docs/messenger-platform/send-messages |
| Instagram Messaging | https://developers.facebook.com/docs/messenger-platform/instagram |
| App Review | https://developers.facebook.com/docs/messenger-platform/submission-process |
| Messaging Policy | https://developers.facebook.com/docs/messenger-platform/policy |
| Recurring Notifications | https://developers.facebook.com/docs/messenger-platform/send-messages/recurring-notifications |
| Graph API Explorer | https://developers.facebook.com/tools/explorer |
| Meta for Developers | https://developers.facebook.com |

---

## 16. As-Built Deployment Model (MyRecruiter)

### 3-account, staging-first

The platform runs across 3 isolated AWS accounts (prod 614056832592, staging
525409062831, dev 372666940362 — dormant). The Meta integration was originally
hand-built in the **prod account (614)** under `*-staging` names (dormant Q3-parked
prod residue: all 3 Lambdas Active, 2 public Function URLs registered in the Meta
App Dashboard, `picasso-channel-mappings-staging` with 3 **first-party** connections
— 2 `myrecruiter.ai` Instagram + "Chris Miller Business Page" Messenger — Meta App
in **Development mode**, App Review never submitted).

The correct home is the **staging account (525)**, deployed via Terraform
(`infra/modules/` — 6 new modules, wired in `infra/main.tf` under
`var.env == "staging"`). This is the SOP promotion model: deploy clean-shape
resources in staging, **not** a `terraform import` of the 614 originals. The 614
cluster is left intact (instant rollback) and is the Q3 prod-residue sweep's
concern — out of scope here.

### Cross-account KB (the load-bearing seam)

The Bedrock KB lives in 614. `Meta_Response_Processor` (525) reuses
`shared/bedrock-core`, which assumes `614…:role/picasso-kb-retriever-from-staging`
(`KB_RETRIEVER_ROLE_ARN`) via `@aws-sdk/credential-providers` to call cross-account
`Retrieve`. The KB **ID** is portable tenant-config data (`config.aws.knowledge_base_id`
from S3) — environment-agnostic. **🔴 Named prerequisite:** that prod-side role's
**trust policy** must list `arn:aws:iam::525409062831:role/Meta_Response_Processor-role`
(it currently trusts only the BSH + MFS staging roles). Until added (hand-applied,
prod, operator-gated), cross-account Retrieve returns AccessDenied → bedrock-core
silently returns empty KB context → the bot answers **without grounding**. This is
the `auth_contract_close_both_sides` discipline: the Terraform adds the 525 caller
side (`sts:AssumeRole`); the 614 target-trust side is the other half.

### Cutover model (Meta App Dashboard is the single hard switch)

The Meta App has exactly **one** webhook callback URL. Standing up 525 in parallel
then swapping the App Dashboard webhook + OAuth-redirect URLs (614→525 Function
URLs) is the cutover. 614 stays intact = instant rollback. The 3 first-party
connections **re-OAuth** against 525 (tokens are 614-KMS-encrypted — not migratable
cross-account); `staging-recent-messages` history does not migrate (ephemeral/TTL).
`OAUTH_CALLBACK_URL` is a **two-apply** value (a Lambda cannot reference its own
Function URL without a Terraform cycle): apply → capture the
`oauth_function_url` output → set `meta_oauth_callback_url` in `infra/main.tf` →
re-apply → register in the Meta App Dashboard. Full runbook (C0–C7) in the plan
`~/.claude/plans/i-m-continuing-work-on-zany-popcorn.md`.

### Delivery state (2026-05-18)

- Lambda PR **longhornrumble/lambda#127** (→`main`): `@aws-sdk/credential-providers`
  for cross-account KB. CI green.
- Infra PR **longhornrumble/picasso#136** (→`staging`): the 6 Terraform modules.
  `plan` = 34 add / 0 change / 0 destroy. CI `terraform plan` is red-by-design
  until the operator creates the `MESSENGER_VERIFY_TOKEN` *staging* GitHub secret
  (same operator-gated pattern as `q5_*_cf_origin_secret`).
- Deploy-matrix wiring (3 Meta fns into the lambda `deploy-staging.yml`) is a
  **separate PR deferred until after `terraform apply`** creates the 525 Lambda
  shells (Phase B/C "add to deploy gates" pattern) — merging it earlier would
  deploy code to non-existent functions.

---

*Generated April 2026; §2/3/8/13/16 reconciled to as-built 2026-05-18 (v21.0 — verify against Meta changelog before further changes).*

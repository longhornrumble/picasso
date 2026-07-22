# Messenger App Review — Submission Narrative (paste-ready)

> Paste-ready answers for the six App Review components (verification, app settings, allowed usage,
> data handling, data protection, reviewer instructions). Grounded in the live staging architecture
> (Meta pipeline + PII program). **`[CONFIRM]`** marks a spot needing operator input before submitting.
> App ID `1396867945592726`. Companion: `MESSENGER_APP_REVIEW_PACKAGE.md` (screencast shot list + checklist).

## What we request (and nothing else)
| Item | Access level | Demo that proves it |
|---|---|---|
| `pages_messaging` | Advanced | KB answer + human escalation on Facebook |
| `instagram_manage_messages` | Advanced | KB answer + human escalation on Instagram |
| Human Agent feature | — | staff reply from Business Suite within 7 days of an escalation |
| `pages_show_list`, `pages_read_engagement`, `instagram_basic` | supporting | needed to resolve the connected Page/IG account at connect time |

Explicitly **not** requested (no demo, no need): `pages_utility_messaging`, marketing messages, one-time-notification (OTN).

---

## 1. Verification ✅ (done — Phase 0)
Business Verification is complete. In this section, select the verified organization (MyRecruiter) to connect to the app. No narrative needed.

## 2. App Settings ✅ (done — confirm values)
- **App icon:** uploaded. **Category:** "Messenger bots for business." **Business email:** chris@myrecruiter.ai.
- **Privacy Policy URL:** `https://www.myrecruiter.ai/privacy` — **[CONFIRM]** this page names Messenger/Instagram data handling (Meta cross-checks the narrative below against it).
- **Platforms:** Website. (The product is a server-side integration; there is no iOS/Android store app.)
- **App Purpose:** set to **"Clients"** (the app is meant for external nonprofit tenants, i.e. users *without* a role on the app). Do NOT pick "yourself/your own business" — that's only if it stays role-holder-only.
- **App icon:** must be **1024×1024** and contain **none of Meta's trademarks/logos** (check the current icon).

## 3. Allowed Usage
> Certify each Advanced permission is used only within its allowed usage, and describe the use + UX benefit.

**App purpose (one paragraph, reusable):**
Picasso is an AI assistant that nonprofit organizations embed on their Facebook Page and Instagram account. When a visitor sends the Page/account a direct message, Picasso answers using *that organization's own knowledge base* — program details, eligibility, how to volunteer or donate — and, the moment the visitor asks to speak with a person, hands the conversation to the organization's staff. Every conversation is **user-initiated**; the app never sends unsolicited, promotional, or marketing messages.

**`pages_messaging` — how we use it & UX benefit.**
Used to receive a Facebook visitor's inbound message and send back a knowledge-base-grounded reply, plus quick-reply/button options that link to the organization's own pages. Benefit: visitors get accurate, instant answers to nonprofit-program questions 24/7 instead of waiting for staff, and can self-serve common tasks. Used only to respond within the user-initiated conversation and to route human-escalation requests — no broadcast, marketing, or OTN messaging.

**`instagram_manage_messages` — how we use it & UX benefit.**
Identical purpose on Instagram DMs: receive the visitor's DM, reply with a KB-grounded answer, and support human escalation. Benefit: the same instant, accurate assistance for the organization's Instagram audience. IG is where the human-escalation path is most important (see Data Protection), and our escalation flow is the demonstrable handoff Meta requires for IG messaging.

**Human Agent feature — how we use it & UX benefit.**
Used so an organization's staff member can send a human-authored reply within 7 days of the visitor's last message *after the bot has escalated* the conversation. Benefit: when the AI recognizes a request for a person (or a situation it shouldn't handle), a real staff member takes over from the Business Suite inbox and the bot stands down — a genuine human handoff, not an automated loop.

## 4. Data Handling
**What data each permission touches:**
- Inbound message **content** (the visitor's text), the visitor's **page-scoped ID (PSID)** / IG-scoped sender ID, and **Page/IG account identifiers**. We do **not** request or read profile fields, contact lists, posts, or any data beyond the message thread.

**How it is processed and stored:**
- **Transient processing:** the visitor's message + the organization's knowledge base are sent to **AWS Bedrock** (our AI infrastructure, same AWS trust boundary) to generate the reply. The message is not used for training or any secondary purpose.
- **Short-term conversation context:** the recent question/answer pair is stored in a DynamoDB table (`picasso-recent-messages`) purely to maintain conversational continuity, with a **7-day time-to-live — rows auto-delete after 7 days.** **[CONFIRM]** state this 7-day window in the form; it's enforced in code.
- **Page/IG access tokens:** stored **encrypted with AWS KMS** (`picasso-channel-mappings`); deleted when the organization disconnects the channel.
- **Tenant isolation:** each organization's data is isolated by **AWS account boundary** (separate accounts per environment), and by tenant within the store.

**Retention & deletion:** conversation context expires automatically at 7 days; access tokens are removed on disconnect; a user-data-deletion path exists (see Data Protection). **[CONFIRM]** any other retention windows you want to state (e.g. escalation-email logs).

## 5. Data Protection
**App purpose / data-sharing:** Platform Data (message content, PSID) is used **only** to operate the conversation described above. It is **not sold, and not shared with third parties** for their own purposes. The only external processors are **AWS** services (Bedrock for answer generation, SES for the escalation email, DynamoDB/KMS for storage) — infrastructure subprocessors under our own controls, not independent data recipients. **[CONFIRM]** AWS is named as a subprocessor in the privacy policy / your DPA posture.

**Data security:**
- **Encryption:** access tokens encrypted at rest with **AWS KMS**; all transport over **TLS**.
- **Least privilege:** each Lambda runs under a **dedicated IAM execution role**; no shared roles.
- **Access control:** the channel-management endpoints authorize the caller and enforce tenant ownership (a caller can only act on its own tenant) — a public unauthenticated path was closed and verified.
- **Escalation notifications are content-free:** the email that alerts staff to an escalation contains **no conversation transcript** — staff read the thread in Meta's own Business Suite inbox, keeping message content inside Meta's surface.

**Data deletion:** user-data-deletion is handled via the instructions at `https://www.myrecruiter.ai/privacy`; conversation context also auto-expires at 7 days; disconnecting a channel removes stored tokens. **[CONFIRM]** the `/privacy` page contains actual "how to request deletion" steps (Meta checks the link resolves to real instructions). Optional hardening: switch to the programmatic **Data Deletion Callback URL** (our `is_deleted` handling backs it), which also removes the manual Section 3(d)(i) obligation.

## 6. Reviewer Instructions
> Meta's reviewers follow these literally, using our test setup, to reproduce each permission. If they can't reproduce it, that permission is denied — so this section is the highest-leverage part of the submission.

**Access / test setup (operator to complete before submitting):**
- **[CONFIRM]** Add the Meta review team's test user as a **Tester** on the app AND grant it a role on the test Page, so it can message the Page and observe behavior. (Standard Access requires reviewer-accessible role-holders.)
- **[CONFIRM]** Provide the **Page name / @handle** the reviewer should message (the connected "MyRecruiter" review Page) and, if any web surface is involved, staging URL + test credentials. The Page must stay **connected and the Messenger flag ON** for the entire review window.
- Real device required for Instagram (button/quick-reply templates are invisible on IG web).

**Script — `pages_messaging` (Facebook):**
1. Open Messenger and send the Page a question a nonprofit visitor would ask, e.g. *"How do I volunteer?"*
2. Expect: a concise, knowledge-base-grounded answer within a few seconds, with quick-reply buttons.
3. Tap a quick reply → expect the corresponding answer / a button that opens the organization's page.

**Script — human escalation (the Instagram prerequisite; run on `instagram_manage_messages` and repeat on FB):**
1. In the DM, send *"I want to talk to a person."*
2. Expect: the bot confirms a human will follow up and **stands down** (stops auto-replying).
3. The conversation appears in the **Business Suite inbox**; a staff member replies from there (Human Agent feature) → the reply is delivered to the visitor.
4. Send another message → expect the bot to **stay silent** (paused for the human), demonstrating the handoff is real.

**Script — `instagram_manage_messages` (Instagram, real device):**
1. From Instagram, DM the connected IG account the same *"How do I volunteer?"* question → expect the KB-grounded answer.
2. Then run the escalation script above in the IG thread.

**Supporting permissions:** `pages_show_list` / `pages_read_engagement` / `instagram_basic` are exercised implicitly at connect time (resolving which Page/IG account to attach) — note this so the reviewer understands why they're requested.

---

## Submission mechanics & common-mistake guards (from Meta's Tutorial + Common Mistakes)

- **Add permissions via the Use Cases tab** (new nav) — click "add" on each of the four items; status flips to "ready for testing"; then open **App Review** (it prepopulates from what you added). Request **only** these four — asking for anything "you might need later" is an explicit rejection reason.
- **Make ≥1 real API call per requested permission within 30 days of submitting.** Our staging pipeline already exercises `pages_messaging` (Send API on the escalation reply) and `instagram_manage_messages` (IG DM send/receive) live — just re-run a DM + escalation on both FB and IG **within 30 days of hitting Submit** so the calls are fresh.
- **Screen recordings must show BOTH** (a) an app user **granting** each permission (the OAuth consent screen during the Page/IG connect, listing the permissions) **and** (b) the app **using** it (DM → KB answer; escalation → handoff). A permission with no recording of its use is auto-denied. Recording specs: **1080p+**, **English UI**, captions/tool-tips naming each permission, **mouse not keyboard**, enlarged cursor, **no audio**, record only the app window. Real device for IG (templates invisible on IG web).
- **Stay in Development mode until AFTER approval.** Switching to Live prematurely restricts the app to *approved* permissions **even for role-holders** — it would break your own testing. (Also: dev-mode test data becomes visible on the switch to Live.)
- **The "can't find Facebook Login" trap doesn't apply the usual way** — reviewers don't log into a web app here; they **test by messaging the Page/IG account**. Make the reviewer instructions state this explicitly so they don't hunt for a login button and reject as "inaccessible."
- **Don't touch Basic/Advanced settings after submitting** — changes can force a re-review.
- **No fake accounts** in the test setup — use a real reviewer test-user / role-holder.

### Pre-submit checklist (from the package doc, still operator-owned)
- [ ] Screencasts recorded per the shot list (one take/flow, captions naming the permission, ≤90s, real device for IG).
- [ ] Reviewer test user added + Page connected + flag ON for the window.
- [ ] Privacy policy names Messenger/IG data handling **and** deletion instructions.
- [ ] Each `[CONFIRM]` above resolved.
- [ ] Request **only** the four items in the table — no extras.

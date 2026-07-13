# Humans + Bots on Meta Messaging Channels — State of the World, Mid-2026

**Scope:** FB Messenger + Instagram DM via Messenger Platform APIs; Meta Business Suite as the staff surface. Researched 2026-07-12 against live Meta docs (the new `developers.facebook.com/documentation/business-messaging/...` tree), Meta changelogs, Business Help Center, and bot-platform docs.

**The single most important finding:** the "Handover Protocol" as documented for years is **gone as a brand and partially gone as a mechanism**. Meta migrated both Messenger and Instagram to **"Conversation Routing"** (Instagram migration announced complete Oct 23, 2025). It is backwards compatible with most handover APIs (`pass/take/release_thread_control`, `standby`), but the configuration model changed (default app instead of primary/secondary receivers), and — critically — **it fully works on Instagram DMs now**. Also note: the old doc URLs (`/docs/messenger-platform/handover-protocol/*`) now return 404s; everything lives under `/documentation/business-messaging/`.

---

## 1. Handover Protocol current state → it's now "Conversation Routing"

**Deprecation/rename.**
- *"Meta no longer supports Handover Protocol for Messenger and all the businesses are migrated to Conversation Routing. Conversation Routing is backwards compatible with most of the Handover Protocol API and functionalities and expected to function without any interruptions."* — [Conversation Routing (Messenger), updated Sep 24, 2025](https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversation-routing)
- Same statement for Instagram, changelog entry **Oct 23, 2025**: *"Meta no longer supports the Handover Protocol for Instagram. All businesses have been migrated to Conversation Routing."* — [Messenger Platform changelog](https://developers.facebook.com/docs/messenger-platform/changelog); [Conversation Routing for Instagram, updated Jun 30, 2026](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/conversation-routing)
- The legacy overview URLs 404 (verified live 2026-07-12).
- Page settings even showed *"During migration to conversation routing, the handover protocol is disabled"* during the 2025 migration ([ManyChat community, June 2025](https://community.manychat.com/general-q-a-43/during-migration-to-conversation-routing-the-handover-protocol-is-disabled-6273)).

**Does it work on Instagram DMs? YES — first-class.** Instagram has its own Conversation Routing doc with the same five control flows, its own inbox app ID, ig.me link routing, and Click-to-Direct ad routing ([IG Conversation Routing](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/conversation-routing), plus [Conversation Routing APIs for IG](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/conversation-routing/apis)). Requirements: IG professional account linked to a Facebook Page (New Pages Experience), app with messaging permissions, and a configured default app. The `messaging_feature_status` field on the Page object reports `msgr_multi_app` / `ig_multi_app` (and legacy `hop_v2`) so you can check per-tenant enablement: `GET /me?fields=messaging_feature_status` ([same doc](https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversation-routing)).

**New model vs old:**

| Old (Handover Protocol) | Now (Conversation Routing) |
|---|---|
| Primary/Secondary receiver roles set in Page Settings → Advanced Messaging → App Settings | **Default application** set in Page Settings ([Messenger routing tab](https://www.facebook.com/settings?tab=msgr_conversation_routing), [IG routing tab](https://www.facebook.com/settings/?tab=ig_conversation_routing)); per-app "Allow this app to take control of conversations" toggle under Advanced Messaging |
| `app_roles` webhook / roles API | `app_roles` event still documented in [`messaging_handovers` reference](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks/webhook-events/messaging_handovers) but role assignment UI is the routing/default-app config; primary/secondary requirement was removed back in the 2021-22 "Handover v2" migration ([changelog Sep 14, 2021 / Mar 2022](https://developers.facebook.com/docs/messenger-platform/changelog)) |
| Thread control persistent until passed | **Thread control expires after 24h of inactivity → thread goes "idle"**; only the default app can message an idle thread. Extend up to 7 days via `extend_thread_control`; ad-originated threads extendable to 30 days via `receiving_app_control_expiration` (Messenger CTM: changelog Jul 22, 2025; IG CTD: Sep 16, 2025) |

**The APIs (all unchanged in shape, still `POST /PAGE-ID/...` with page token)** — per [Conversation Routing](https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversation-routing):
- `pass_thread_control` (`recipient`, `target_app_id`, optional `metadata`) — new owner gets a `messaging_handovers` webhook with `pass_thread_control.previous_owner_app_id` / `new_owner_app_id` / `metadata`.
- `release_thread_control` — sets the thread to **idle** (recommend releasing when the bot flow ends rather than letting the 24h expiry hit).
- `take_thread_control` — **blocked unless a default application is set** (zero-config mode). Only apps with the "take control" toggle enabled may use it.
- `request_thread_control` — current owner gets a `request_thread_control` webhook and may honor it by passing.
- `extend_thread_control` (`duration` seconds, up to 7 days).
- `GET /PAGE-ID/thread_owner?recipient=PSID` — returns `app_id` + `expiration` (only if you're the owner or the default app).
- **New convenience (post-handover era):** the Send API now accepts an inline `thread_control: {app_id, control_type: "pass"|"release"}` on a message send — send "Let me transfer you to a live agent" and hand over in one call.

**Standby channel: still exists and unchanged.** Non-owner apps subscribed to `standby` receive the conversation's `messages`, `message_reads`, `message_deliveries` (and payload-stripped `messaging_postbacks`) under the `standby` array instead of `messaging` — [standby reference, updated Sep 25, 2024](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks/webhook-events/standby); it explicitly applies to "bots using the handover protocol **and conversation routing**." Subscribe your app to `messages`, `messaging_postbacks`, `messaging_referral`, `messaging_handover(s)`, and `standby` ([Conversation Routing → Before You Start](https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversation-routing)).

**Zero-config ("default behavior") mode.** If a tenant never sets a default app: all connected apps get all message webhooks, all can reply (duplicate-response risk), `take_thread_control` is blocked, `pass`/`request_thread_control` still work, and only campaign routing (ads) is available ([Messenger doc](https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversation-routing), [IG doc — "Default message routing behavior"](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/conversation-routing)). Meta's own guidance for single-app pages: *"You may use the Page Inbox to respond to users in addition to the application connected, but you are responsible for coordinating responses between your app and the Inbox."*

---

## 2. The Page Inbox / Business Suite inbox as a routing participant

- **The inbox is modeled as just another connected app**, and **can itself be the default application**: *"Conversation routing allows your business to use Meta Business Suite Inbox as another application connected to your page… An inbox can also be assigned as a default application."* — [Conversation Routing](https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversation-routing); same for IG.
- **Magic app IDs (current, official):** *"To pass control to an Inbox, set `target_app_id` to **263902037430900** for the Page Inbox and **1217981644879628** for the Instagram Inbox."* — [Conversation Routing → Pass Thread Control](https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversation-routing). (TWO inbox app IDs now; use the IG one for IG threads.)
- **Humans grabbing threads implicitly:** *"if you move a message to the Main folder or respond to a message in a conversation not controlled by the inbox, the inbox takes control of the conversation"* (same doc). So a staff reply from Business Suite is itself a take-over event — the app sees a `messaging_handovers` change and starts receiving that thread on `standby`.
- **Folder mechanics (staff-facing):** Business Suite inbox = unified Messenger + IG + WhatsApp; staff can mark unread, flag for follow-up, move to **Done** or **Spam**, filter by unread/follow-up/**assignee**, add labels/notes to contacts, and search — [About Inbox in Meta Business Suite](https://www.facebook.com/business/help/294426838452244). Assignment and inbox labels are **UI-only** (see §8). The legacy behavior where bot-controlled threads were auto-filed to Done is no longer stated in current docs — don't rely on it.
- Requests-folder caveat for API reads: conversations sitting in the Requests folder inactive >30 days aren't returned by the Conversations API ([Conversations API](https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversations)).

---

## 3. Without handover: echoes of staff replies

**Yes, you get echoes — and yes, you can tell staff replies apart.**

- **Messenger:** subscribe to `message_echoes`. Fires *"when your page sends a message"* — from any source, including Business Suite. Payload: `message.is_echo: true`, `app_id`, optional `metadata`, `mid` — [message_echoes reference, updated Jun 1, 2026](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks/webhook-events/message-echoes).
- **Distinguishing who sent it — official:** *"Starting Graph API v12.0+, `app_id` field will return Facebook Page inbox app id (`26390203743090`) whenever the message is sent via Facebook Page inbox"* (same reference). ⚠️ That doc prints a 14-digit ID while the routing doc gives the inbox app ID as `263902037430900` (15 digits) — one has a typo (the 15-digit value is the long-established canonical one). **Robust logic: treat `is_echo && app_id !== YOUR_APP_ID` as human/other-app; don't exact-match the inbox ID.** Your own bot's echoes carry your `app_id`; you can additionally set `metadata` on every send and skip echoes carrying your own metadata.
- **Instagram: there is no separate `message_echoes` field.** *"This separate webhook field is available only for Messenger conversations. For Instagram Messaging conversations, the message echo notifications are included with the `message` webhook field subscription."* — [Webhooks overview](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks). The IG `messages` webhook payload includes `is_echo: true` when the business sent the message; reactions don't produce echoes. IG echo payloads are thinner (app_id attribution less consistently documented for IG — test per tenant; sender.id = your IG account ID is the reliable echo marker).
- **If the thread was handed to the inbox** (you're not the owner), you do NOT get echoes/messages on the normal channel — you get the conversation's activity on **`standby`** instead (§1). Echo-watching is only the mechanism for the "no routing configured / you still own the thread" case.

**Practical note:** echo-based detection is the classic "cheap" coexistence pattern — if you see a non-bot echo, auto-pause the bot for that user for N minutes/hours. Works on both channels, needs zero Page-settings configuration, but gives no protection against the bot and a human double-replying to the same inbound message.

---

## 4. Staff-side notification reality

- **Business Suite notification plumbing:** staff get in-product notifications, mobile push (Business Suite app), and optional email, controlled at Business Suite → Settings → Notifications ([Change Your Notification Settings in Meta Business Suite](https://www.facebook.com/business/help/486960815135452)). Messenger-specific alerts for a Page are separately toggled in Business Suite desktop Inbox → Settings, in the Business Suite mobile app, and in the Messenger app — desktop and mobile settings are independent and must be configured separately ([Manage Messenger Notifications for a Facebook Page](https://www.facebook.com/business/help/985984849235554)).
- **Does a subscribed bot suppress inbox notifications?** There is **no official Meta documentation** stating that an API-connected app suppresses Business Suite notifications. Empirically (community reports), Business Suite message notifications are unreliable in general, and a bot that replies instantly means threads arrive "already answered," which in practice keeps them from surfacing as needing attention. **Design assumption: do NOT rely on Business Suite to alert staff about bot-escalated threads.** Meta's only documented "staff attention" push is for its own AI: Meta Business Agent *"You will receive a notification on your device if Meta Business Agent determines that a customer needs your attention"* ([About Meta Business Agent](https://www.facebook.com/business/help/1505847033372169)) — no equivalent hook for third-party apps. Build your own notification channel (email/SMS — we already have SES + Telnyx rails).
- **Built-in Business Suite automations ("Inbox automations"):** instant reply, away message, FAQs, location/contact/hours, custom keywords, comment-to-message — [About Inbox automations](https://www.facebook.com/business/help/395965998733706). Documented interaction rules:
  - Keyword automations fire **after 15 minutes** unless a person replies first; template automations (e.g., away message) **beat** keyword automations when both match.
  - These automations run **independently of your API bot** — Meta does not arbitrate between Business Suite automations and a third-party app. Both will answer (see §5).
  - Turning on **Meta Business Agent** pauses Business Suite's own automations — but nothing is documented about it yielding to third-party apps.

---

## 5. Business Suite automations vs third-party bots — conflicts & recommended config

- **Known conflict class:** Pages with both an external bot and Business Suite instant-reply/away-message get double responses. Abundantly reported (Reddit, ecosystem guides). Meta's own docs concede the coordination burden: with a single connected app *"Coordination of responses from both the application and page inbox is necessary to ensure no duplicate responses"* ([Conversation Routing](https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversation-routing)).
- **Recommended tenant configuration for a Page using an external bot** (matches ManyChat's customer instructions, [Nov 27, 2025 doc](https://help.manychat.com/hc/en-us/articles/14281188830748-Conversation-Routing-for-Instagram)):
  1. Turn **off** all Business Suite Inbox automations (instant reply, away message, FAQs, keywords).
  2. Do **not** enable Meta Business Agent (a competing bot; inserts AI-disclosure UX you don't control).
  3. Set **your app as the default application** — Messenger: Page Settings → [Conversation Routing tab](https://www.facebook.com/settings?tab=msgr_conversation_routing); Instagram: [IG conversation routing tab](https://www.facebook.com/settings/?tab=ig_conversation_routing) (for IG-Login-connected accounts: Business Suite → Settings → Integrations → Conversation Routing).
  4. In [Advanced Messaging](https://www.facebook.com/settings/?tab=advanced_messaging), enable the app's toggles incl. **"Allow this app to take control of conversations"**, and make sure no *other* app has take-control enabled.
  5. Leave any leftover legacy "Primary receiver for handover protocol" selection **empty** (ManyChat explicitly tells users to deselect it post-migration).

---

## 6. How bot platforms actually implement "talk to a human" (evidence from their docs)

**Pattern A — own live-chat inbox + bot pause (no Meta handover at all).** ManyChat's primary model: escalation runs through **ManyChat Inbox** (their own agent console). "Open Conversation" marks the thread as needing a human; agents get Inbox seats, folders (`Unassigned`/`Assigned to me`/team), labels, auto-assignment, a "Notify Assignees" automation action, and mobile push. When an agent starts replying, **automation is auto-paused for 30 minutes** (configurable) ([ManyChat Inbox overview](https://help.manychat.com/hc/en-us/articles/14281070478748-Manychat-Live-Chat-Overview)). Chatfuel is the same shape.

**Pattern B — Meta routing to the Page/IG Inbox.** Platforms that route to Business Suite staff use `pass_thread_control` to the inbox app IDs; FlowXO documents handover to the Page inbox ([FlowXO](https://support.flowxo.com/article/237-facebook-handover-protocol)). ManyChat also publishes the Meta-side setup (default app = ManyChat, take-control on).

**Notify-staff patterns in the wild:** in-platform inbox badge + mobile push, explicit "notify assignees"/email actions in flows, third-party bridges (Slack/email). **Nobody relies on Business Suite's native notifications for escalations.**

**Policy note that forces the issue on Instagram:** Meta *requires* IG messaging apps to have a human-escalation path — either a custom inbox on your own app ID, or Conversation Routing pass to the IG Inbox; App Review makes you demonstrate it ([Human Agent Escalation, updated Jul 2, 2026](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/human-agent-escalation)).

**Related:** the **HUMAN_AGENT message tag** lets a human (not automation) reply up to **7 days** after the last user message, on both Messenger and IG; requires the "Human Agent" permission via App Review. Apps with the Human Agent feature can't `take_thread_control` while sending HA-tagged messages unless the Page has enabled take-control for them ([IG Conversation Routing](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/conversation-routing)).

---

## 7. Read/seen semantics

- **The bot controls "seen" explicitly** via `mark_seen` (then `typing_on`/`typing_off`); Meta best practice is `mark_seen` on receipt ([Sender Actions](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/sender-actions)). **IG got typing + mark_seen Sept 23, 2025.**
- **Staff reading in Business Suite:** NOT documented whether opening a thread emits a read receipt to the end user. Treat as unspecified. Staff can deliberately "mark as unread."
- **The reverse direction** (user read the bot's message) arrives via `message_reads` — on `standby` if not thread owner.
- **Design consequence:** if the bot `mark_seen`s everything instantly but escalates to a human who takes an hour, the user saw "Seen" immediately — set expectations in the handoff message ("A team member will reply within…").

## 8. Inbox labels / assignment via API — can and can't

**Can't:** no API to assign a conversation to a staff member in Business Suite, no API for Business Suite inbox labels, follow-up flags, or Done-folder state. Assignment is UI-only. This is why ManyChat & co. built their own inboxes.

**Can:**
- **Conversations API** (`GET /PAGE-ID/conversations?platform=messenger|instagram`, `?user_id=`, `/CONVERSATION-ID?fields=messages`, `/MESSAGE-ID?fields=from,to,message,reply_to`) — read threads/messages both channels; detail limited to **20 most recent messages** per conversation; Requests-folder threads idle >30 days invisible ([Conversations API](https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversations)).
- **`is_owner` filter (NEW Oct 13, 2025):** `?fields=messages,is_owner` — per-conversation whether your app owns the thread (Conversation Routing only); built for "respond only to threads you own" + post-outage recovery.
- **Custom Labels API (Messenger):** page-level labels attached to users/threads — **API-side only, not the Business Suite labels staff see**.
- **Moderate Conversations API:** block/unblock/ban users and **move conversations to Spam** — Messenger since Mar 31, 2025, IG since Oct 21, 2025. First APIs that write Business-Suite-visible folder state.
- **Sending "from the inbox context"** isn't a thing for third parties — you always send as your app; passing control to the inbox app ID is what lands the thread with staff.

## 9. New 2025–2026 (summary table)

| Date | Change |
|---|---|
| Mar 31, 2025 | Messenger Moderate Conversations API (block/ban/spam-folder) |
| Jul 22 / Sep 16, 2025 | Thread-control window for CTM/CTD ads: `receiving_app_control_expiration` 1–30 days |
| Sep 10, 2025 | IG `message_edit` webhook |
| Sep 23, 2025 | IG typing + `mark_seen` sender actions |
| Sep–Oct 2025 | **Handover Protocol retired** → **Conversation Routing** (default-app model, 24h thread-control expiry/idle, inline `thread_control` on Send API, two inbox app IDs) |
| Oct 13, 2025 | Conversations API `is_owner` field |
| Oct 21, 2025 | IG Moderate Conversations API |
| Nov–Dec 2025 | IG multi-image sends; reactions via Send API both channels; `reply_to` + `is_self_reply` in echoes |
| Ongoing 2026 | **Meta Business Agent** (Meta's own AI in Business Suite, Meta One paid tier): pauses native automations, AI-disclosure banner, staff push on escalation. A tenant enabling this installs a competing bot — detect and advise against |
| Until Aug 30, 2026 | Webhook payload migrations: `sticker` attachment type replaces `image` for stickers; IG post-share `ig_post` replaced `share` (old type removed Feb 1, 2026) |
| Docs | Doc tree moved to `developers.facebook.com/documentation/business-messaging/...`; old handover URLs 404; new docs have "Copy for LLM" / `.md` views |

---

### Recommended architecture (synthesis)

1. **Adopt Conversation Routing properly, per tenant:** onboarding checklist = connect app → set our app as **default application** (both Messenger + IG routing tabs) → enable take-control toggle → disable Business Suite automations → confirm via `messaging_feature_status` + `thread_owner` probe.
2. **Escalation = `pass_thread_control` to the inbox app ID** (`263902037430900` FB / `1217981644879628` IG) with `metadata` context. Staff reply in Business Suite; their reply/move-to-Main auto-takes control, so recovery from weird states is self-healing.
3. **Stay subscribed to `standby` + `messaging_handovers`** to watch threads while humans have them; **auto-resume** via `take_thread_control` (default + take-enabled) after staff finish, or rely on 24h idle-expiry returning control to the default app.
4. **Notifications are ours to build:** on escalation, email/SMS on-call staff with a deep link to `business.facebook.com/latest/inbox`. Do not depend on Business Suite badges/push.
5. **Keep echo-watching as belt-and-suspenders** (`is_echo && app_id !== ours` → pause bot for that user) — also covers tenants who never complete routing setup.
6. **Apply for the Human Agent permission** if staff will ever reply through OUR UI (7-day window); IG App Review requires demonstrating the human-escalation path regardless.

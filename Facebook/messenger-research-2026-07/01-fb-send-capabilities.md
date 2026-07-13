# Meta Messenger Platform — Send Capabilities for Facebook Pages (Ground Truth, July 2026)

**Method note:** All `developers.facebook.com` pages below were fetched live (2026-07-12). Meta has **migrated Messenger docs from `/docs/messenger-platform/...` to `/documentation/business-messaging/messenger-platform/...`** — old URLs 301-redirect. The new pages carry "Updated:" dates and machine-readable `.md` variants ("Copy for LLM"). The one page that would not render server-side (Send API Reference) was verified via a Jan-2025 Wayback snapshot, flagged where used.

---

## 1. API Versions & Deprecation Schedule (we are on v21.0)

Source: https://developers.facebook.com/docs/graph-api/changelog

| Version | Introduced | Available until |
|---|---|---|
| **v25.0 (latest)** | Feb 18, 2026 | TBD |
| v24.0 | Oct 8, 2025 | TBD |
| v23.0 | May 29, 2025 | TBD |
| v22.0 | Jan 21, 2025 | TBD |
| **v21.0 (ours)** | Oct 2, 2024 | **TBD — not yet scheduled** |
| v20.0 | May 21, 2024 | **Sep 24, 2026** |
| v19.0 | Jan 23, 2024 | May 21, 2026 |
| v18.0 | Sep 12, 2023 | Jan 26, 2026 |

- **v21.0 has no announced sunset date yet.** Versions live ~28 months → expect **v21.0 retirement ≈ Jan–Feb 2027**. Runway exists, but plan the bump to v23+/v25 this year.
- ⚠️ **Out-of-cycle deprecation that hits regardless of version pin:** effective **April 27, 2026**, Send API requests using message tags `CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE`, `POST_PURCHASE_UPDATE` return **error code 100**. Migrate to Utility Templates or Marketing Messages API. (Changelog, Mar 27 2026: https://developers.facebook.com/documentation/business-messaging/messenger-platform/changelog)
- `HUMAN_AGENT` and `CUSTOMER_FEEDBACK` tags remain valid (https://developers.facebook.com/docs/graph-api/reference/page/messages).

## 2. Message Types & Structured Messages

### Text
- `message.text`: **UTF-8, < 2,000 characters**; `metadata` (echoed to `message_echoes`) **< 1,000 chars**. *(Verified via archived Send API Reference, snapshot 2025-01-04; no changelog entry alters these limits.)*
- Send guide (updated May 5 2026): https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages
- `messaging_type` enum is now `{RESPONSE, UPDATE, MESSAGE_TAG, UTILITY}` — note the newer `UTILITY` value.
- Compliance note in current docs: automated experiences must disclose bot status where required by law (California, Germany called out explicitly).

### Quick replies (doc updated Jun 17 2026)
Source: https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/quick-replies
- **Max 13** per message; attach to `text` or `attachment`.
- `title`: **20-char limit**; `payload`: **1,000-char limit**; optional `image_url` (min 24×24 px).
- `content_type`: `text`, `user_phone_number`, `user_email`. **Location quick reply is long dead.**
- Behavior: tapping **dismisses the whole rail**, posts the title as a user message, fires a **`messages` webhook with `message.quick_reply.payload`** (NOT `messaging_postbacks`). "Quick replies disappear after the next message. Do not use for actions you want to be permanent."
- Phone/email quick replies pre-fill from profile; missing profile field → button not shown; value arrives in `payload` once.

### Button template (updated Jun 17 2026)
Source: https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/template/button
- `text`: **640 chars**, **1–3 buttons**.
- Button types: `web_url`, `postback`, `phone_number` (call), `account_link`/`account_unlink`, `game_play`. Plus **`audio_call`** since Calling API GA (Feb 11 2026).
- All button `title`s: **20 chars**; `postback.payload`: **1,000 chars**; call button payload = `+<COUNTRY><NUMBER>`.
- URL buttons support `webview_height_ratio` (`compact|tall|full`), `messenger_extensions`, `fallback_url`, `webview_share_button:"hide"`.

### Generic template / carousel (updated Apr 22 2026)
Source: https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/template/generic
- **Up to 10 elements.** Per element: `title` **80 chars**, `subtitle` **80 chars**, optional `image_url`, optional `default_action`, **max 3 buttons**.
- **Image aspect ratio: 1.91:1** (auto scale/crop; the old `image_aspect_ratio` param no longer documented). GIFs render but **don't animate**.
- Optional `sharable: true`.

### Media template (updated Jun 17 2026)
- **Image or video only — no audio.** Exactly **1 element**, up to **3 buttons**.
- Media source must be an **`attachment_id`** or a **Facebook URL** — arbitrary external URLs rejected.

### Receipt template (updated Jun 17 2026)
- Required: `recipient_name`, unique `order_number`, `currency`, `payment_method`, `summary.total_cost`. Optional: up to **100 elements**, `address`, `adjustments`, etc.

### Other current templates
Templates hub (updated Jun 30 2026): https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/templates — catalog: Button, Generic, Media, Receipt, **Product**, **Coupon**, **Customer Feedback**, **Image Grid** (new, §10), **Utility Messaging** (pre-approved transactional), **Structured Information** (collect shipping info). **Airline + List templates gone.**

### Attachments
- By `url` or pre-uploaded `attachment_id`; **max 25 MB**; type enum `audio|file|image|template|video`.
- **Attachment Upload API**: `POST /<PAGE_ID>/message_attachments` with `payload.is_reusable:true` → reusable `attachment_id`.
- **Multi-image messages:** `message.attachments[]`, **images only, up to 30** (Mar 19 2025).
- **Stickers:** send via `message.sticker_id`; Sticker API (§10).

## 3. Sender Actions

Source (updated Jan 21 2026): https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/sender-actions
- **`typing_on`** (auto-expires after **20 s** or on response), **`typing_off`**, **`mark_seen`**.
- **NEW: `react`/`unreact`** sender actions (§8).
- Sender-action request contains only `recipient` + `sender_action`.

## 4. Persistent Menu & Ice Breakers (Messenger Profile API)

Profile API (updated Mar 18 2026): https://developers.facebook.com/documentation/business-messaging/messenger-platform/reference/messenger-profile-api — `POST /me/messenger_profile` with Page token. Properties: `get_started`, `greeting`, `ice_breakers`, `persistent_menu`, `whitelisted_domains`, `account_linking_url`, `commands`.

**Persistent menu** (updated Jun 17 2026):
- **Up to 20 top-level items** (old 3-item/2-submenu structure no longer documented); **`web_url` + `postback` only**; item `title` **30 chars**; `payload` **1,000 chars**.
- **Requires a Get Started button**; not shown in Facebook's in-app browser.
- **Locale support**: per-locale menus, `"locale":"default"` required.
- `composer_input_disabled: true` locks users to menu/buttons.
- **Per-user override**: `POST/GET/DELETE /me/custom_user_settings` with `psid` — real-time (Page-level changes take up to 24h); limit **10 calls/user/10 min**.
- ⚠️ If **Commands** are configured, the commands menu **overrides** the persistent menu.

**Ice breakers — NOT deprecated on Messenger** (reference updated Jun 26 2024): still a live profile property. **Max 4 questions**; localized (`"locale":"default"` required); taps arrive as `messaging_postbacks`. Precedence: **API ice breakers > Get Started button > Page-inbox "Custom Questions"**. Newer additive alternative: **Commands** + commands menu (Jan 10 2024).

## 5. m.me Links & ref Deep-Linking

Source (updated Mar 23 2026): https://developers.facebook.com/documentation/business-messaging/messenger-platform/discovery/m-me-links
- `https://m.me/<PAGE-NAME>`; `?text=` pre-fills composer; `?ref=` passes context (**alphanumeric + `-`,`_`,`=` only**).
- New conversation: Get Started tap → `messaging_postbacks` with `postback.referral.{ref, source:"SHORTLINK", type:"OPEN_THREAD"}`.
- Existing conversation: opens thread, **resets the 24-hour window**, fires `messaging_referrals`.
- Supported in **QR codes**.
- ⚠️ Meta: **ref delivery is not guaranteed** — design flows to degrade gracefully without the ref.

## 6. Customer Chat Plugin — CONFIRMED DEAD

- **Shut down May 9, 2024** (guest mode died earlier in 2024). Old docs URL redirects to the Discovery & Engagement hub, which lists **no website live-chat widget**.
- Meta's website alternatives: m.me links (incl. QR), **Message Us Plugin**, **Send to Messenger Plugin**, **Checkbox Plugin** (follow-up opt-in), Login Connect with Messenger. No first-party embedded chat window anymore — validates owning the on-site widget and treating Messenger as a separate channel joined via m.me/ref.

## 7. Postbacks & Webhooks (button / quick-reply taps)

- Webhooks hub: fields include `messages`, `messaging_postbacks`, `messaging_optins`, `messaging_referrals`, `message_deliveries`, `message_reads`, `message_echoes`, `message_reactions`, `message_edits`, `response_feedback`, `messaging_seen` (IG).
- **`messaging_postbacks`** (updated Feb 26 2026): fires for **postback buttons, Get Started, persistent-menu items** (+ ice-breaker taps, image-grid postbacks). Payload: `postback.mid`, `.title`, `.payload` (only delivered to the app that sent the message), `.referral` for m.me/CTM/QR entry.
- **Quick-reply taps** arrive as **`messages`** events with `message.quick_reply.payload`.
- Delivery/read: `message_deliveries`, `message_reads`.
- **`response_feedback`** (Oct 8 2024): thumbs up/down on business messages.

## 8. Reactions, Replies, Edits

**Receive:**
- `message_reactions` — `reaction.{reaction: smile|angry|sad|wow|love|like|dislike|other, emoji, action, mid}`.
- `message_edits` — `message_edit.{mid, text, num_edit}` (added Apr 9 2024).
- `reply_to.{mid, is_self_reply}` in `messages`/`message_echoes`/Conversations API (Oct 6 2025).

**Bot can:**
- **Reply to a specific message** (Jul 15 2025): top-level `reply_to:{mid}` on Send API.
- **React/unreact to a user's message** (Dec 2 2025): `sender_action:"react"` with `payload.{message_id, reaction}`.
- **Bots CANNOT edit their own sent messages** — no edit API; `message_edits` is inbound-only.

## 9. Personas API — ALIVE (not deprecated)

Source (updated Apr 22, 2026): https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/personas
- `POST /<PAGE_ID>/personas` (`name` ≤50 chars, `profile_picture_url` ≤8 MB) → `persona_id`; pass in Send API calls. GET/DELETE supported.
- Europe/Japan access restored Oct 17, 2023. Third-party deprecation claims are wrong as of mid-2026.

## 10. New in 2025–2026

| Date | Feature |
|---|---|
| **Jun 3, 2026** | **Meta Business Agent + Business Agent Platform** — Meta's own no-code AI agent for Pages on Messenger/IG/WhatsApp (answers questions, catalog recs, appointments, lead qualification, human-handoff), free now, paid tiers coming; connects Shopify/Zendesk/etc. Direct competitor/complement to third-party bot platforms. https://about.fb.com/news/2026/06/meta-business-agent/ |
| **Jun 30, 2026** | **Image grid template** (`template_type: image_grid`): 2–6 images, optional hero, per-image `web_url`/`postback` tap actions, title 45 / subtitle 80, ≤3 buttons. |
| **Jun 1, 2026** | **Sticker API** (`/sticker_packs`, `/sticker_search`); send via `message.sticker_id`. ⚠️ **Webhook migration deadline Aug 30, 2026**: sticker messages currently send both `image` and `sticker` attachment types; after that **`sticker` only** — update handlers. |
| Mar 26, 2026 | Post/Reel share metadata (`post`, `ig_post`, `reel`, `ig_reel`) in `messages` webhooks + Conversations API. |
| Mar 6, 2026 | **Utility Templates: named parameters** (`{{customer_name}}`, `parameter_format: NAMED`). Image support in utility messages since Sep 29, 2025. |
| Mar 3, 2026 | **Appointment booking data** (`appointment_booking` attachment: status, start/end, timezone) in webhooks + Conversations API. |
| **Feb 11, 2026** | **Messenger Calling API GA** — WebRTC voice calls business↔user; `audio_call` button CTA; call-permissions, call-settings webhook, metrics. |
| Jan 30, 2026 | **Page Integrity API/webhook** — real-time Page restriction/violation status (alerting when a tenant's Page gets messaging-restricted; pairs with error `10`/subcode `1893063` "Page temporarily restricted from sending", Jun 25 2026). |
| Dec 2, 2025 | Bot reactions via Send API. |
| Oct 23, 2025 | **IG Handover Protocol killed** → Conversation Routing; `is_owner` filter (Oct 13). |
| Oct 6, 2025 | `reply_to` in webhooks/Conversations API. |
| Jul 15, 2025 | Send replies to specific messages. |
| Jul 22, 2025 | CTM ads: custom thread-control window (up to 30 days). |
| Mar 31, 2025 | **Moderate Conversations API** — block/ban/spam via API. |
| Mar 19, 2025 | Multi-image messages (≤30). |
| Feb 24, 2025 | `flow_id` in ad-referral webhooks. |

**Deprecations recap:** Customer Chat Plugin — dead May 9, 2024. Tags `CONFIRMED_EVENT_UPDATE`/`ACCOUNT_UPDATE`/`POST_PURCHASE_UPDATE` — dead Apr 27, 2026 (error 100). IG `share` attachment → `ig_post` (removal from Apr 27, 2026). Sticker `image` webhook shape ends Aug 30, 2026. IG Handover → Conversation Routing (Oct 2025). List/airline templates + location quick replies — long gone. **Ice Breakers (Messenger) and Personas — NOT deprecated despite folklore.**

**Bottom line for our v21.0 Lambdas:** no forced upgrade before ~early 2027, but the Apr-2026 message-tag kill and Aug-2026 sticker-webhook change apply NOW regardless of pinned version; June-2026 template/Sticker/Calling additions are callable from v21.0 today.

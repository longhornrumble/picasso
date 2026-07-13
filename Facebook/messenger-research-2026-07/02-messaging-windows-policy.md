# Meta Messenger Platform & Instagram Messaging — Policy Ground Truth (researched 2026-07-12)

**Method note:** All primary claims verified against live Meta documentation fetched 2026-07-12, mostly via Meta's own raw-markdown doc endpoints. Meta **restructured its docs in 2025-2026**: canonical home is now `developers.facebook.com/documentation/business-messaging/...`; many old `/docs/messenger-platform/...` URLs redirect or 404. Key doc dates: Policy "Updated Apr 6, 2026"; Send Messages "Updated May 5, 2026"; Rate Limits "Updated Mar 23, 2026"; Changelog "Updated June 30, 2026". Where Meta's own pages contradict each other, both are cited and flagged.

**Headline:** the tag-based follow-up model (CONFIRMED_EVENT_UPDATE etc.) is **dead as of April 27, 2026**. Post-window messaging on Messenger now splits into: **Utility Message templates** (transactional, pre-approved), **paid Marketing Messages** (opt-in promotional), **HUMAN_AGENT** (manual human replies, 7 days), and **OTN** (one-shot, still alive but unmaintained). Instagram is more restricted than Messenger on every one of these.

---

## 1. The 24-hour standard messaging window

Source: [Send a Message](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages) (May 5, 2026) and [Platform Policy](https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy) (Apr 6, 2026).

- Window = **24 hours from the person's last qualifying action**. Inside: promotional content OK. Outside: need a tag, utility template, paid marketing message, or OTN token.
- `messaging_type` must be `RESPONSE` or `UPDATE` inside the window; `MESSAGE_TAG` outside (non-promotional only).

**User actions that open (or re-open) the window** — current list:
1. Person **sends a message** to the Page or IG Professional account (free-text, quick-reply taps, ice-breaker/FAQ taps — all arrive as `messages` webhooks).
2. Person **clicks a CTA button** (Get Started / postbacks) within a conversation.
3. Person clicks a **Click-to-Messenger ad** then sends a message.
4. Person messages via a **plugin** (Send to Messenger, Checkbox).
5. Person clicks an **m.me link** into an existing conversation.
6. Person clicks an **ig.me link** into an existing IG conversation.
7. Person **reacts to a message** — explicitly including a reaction to a marketing message.
8. Person **comments on a post** on the Page or IG account. *(In practice governed by the Private Reply rule: one message, 7 days — see §9.)*
9. Person **publishes a visitor post** on the Page.

- **IG story replies** arrive as `messages` → open the window. Story **mentions** carry ephemeral CDN content you must not store.
- **Marketing-message replies re-open the window**; merely opting in to marketing messages does NOT.
- **Responsiveness policy** (separate from the window): bots flagged "automated" must respond to **any and all input within 30 seconds**; violations → Page Support Inbox notice → messaging limited if not fixed in 7 days ([Policy — responsiveness](https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy)).
- CTM/CTD ad conversations: receiving app's *thread control* is 24h from last user message, extendable to 30 days via `receiving_app_control_expiration` (thread control ≠ send window).

---

## 2. Message tags — 2026 state

### ⚠️ THE big 2026 change — three tags killed
> "Effective April 27th, 2026, all API requests containing the Message Tags **CONFIRMED_EVENT_UPDATE, ACCOUNT_UPDATE, and POST_PURCHASE_UPDATE** will receive error code 100." — [Send a Message doc](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages); [Changelog Mar 27, 2026](https://developers.facebook.com/documentation/business-messaging/messenger-platform/changelog/).

- Migration paths named by Meta: [Utility Templates](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/utility-messages) (transactional) or [Marketing Messages API](https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger) (promotional). **Do not design against the dead tags.**

### Tags still alive (mid-2026)
| Tag | Permits | Window | FB | IG |
|---|---|---|---|---|
| `HUMAN_AGENT` | A **human agent manually responding** when the issue can't be resolved in 24h | **7 days** from the user's message | ✅ | ✅ |
| `NON_PROMOTIONAL_SUBSCRIPTION` | News messages — only for News Page Index Pages. Not relevant to us. | ongoing | ✅ | ❌ |

- All tagged messages must be **non-promotional**. Misuse → Page send restrictions.
- `CUSTOMER_FEEDBACK` tag no longer appears in current docs (survives only as the in-window Customer Feedback Template). Treat as gone.

### HUMAN_AGENT specifics
- **7-day window**, both FB and IG (rolled out to IG in 2023; "Messenger-only" claims are outdated).
- **Gated by App Review + Business Verification** — requested as a *feature* ("Human Agent") in App Dashboard → Permissions and Features.
- **Enforcement reality:** strictly *human-authored escalation*. Automated/scheduled sends via this tag = policy violation (`messaging_policy_enforcement` webhooks, Page Support Inbox notices, send restrictions). It can power a "staff inbox replies within 7 days" feature; it cannot power bot-sent follow-ups or drip reminders.

---

## 3. One-Time Notification (OTN) — alive but zombie-ish, Messenger-only

- **Not formally deprecated.** Apr 2026 Policy page still documents OTN (Beta): user taps "Notify me" → Page gets a **one-use token valid 1 year**. **Not available for IG.**
- **However**, the dedicated OTN doc URL now 404s and no OTN page exists in the new doc tree — Meta stopped maintaining it; its free-re-engagement siblings (Recurring Notifications, Sponsored Messages) are both dead.
- **Assessment:** works today, policy-sanctioned, but **at-risk** — fine as a lightweight "notify me" feature, don't make it load-bearing. (Historically needed per-Page enablement via Advanced Messaging / Messaging Feature Review API — re-verify empirically.)

---

## 4. Recurring Notifications → paid "Marketing Messages" (2025-2026 overhaul)

### Legacy Recurring Notifications (RN) — DEPRECATED
Was the free, opt-in (`notification_messages` template) daily/weekly/monthly re-engagement channel on both FB and IG. Timeline:
- **Sept 1, 2025** — no new RN integrations; cooldown loosened to 1/48h.
- **Jan 12, 2026** — RN "deprecated" ([MM FAQ](https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/faq)).
- **Feb 10, 2026** — RN **discontinued globally, API returns errors** — *except* AU/EU/JP/KR/UK (where the paid replacement isn't offered).
- Naming hazard: 2023 changelog renamed RN → "Marketing Messages"; old blog posts conflate free RN with the new paid product.

### Current: Marketing Message API for Messenger (paid)
Source: [MM Overview](https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/get-started) (May 5, 2026), [MM FAQ](https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/faq).
- Paid, opt-in promotional messages outside the 24h window. Launched to all tech providers **July 1, 2025**.
- **Tech providers only** (platforms like us), App Review **Advanced Access** to `ads_management`, `pages_messaging`, and `paid_marketing_messages` or `marketing_messages_messenger`; Facebook Login for Business; Marketing API tier; business-portfolio-owned Business app. **Web apps only.**
- **US: yes** (20 listed regions). Messages **cannot deliver to users located in EU, UK, JP, KR, AU**.
- **Opt-in:** (a) CTM ad click+response → auto-subscribed; (b) CRM list upload (email/phone, not PSIDs); (c) in-thread opt-in template during a standard window. Subscriber = non-expiring **subscription token**. No opt-out webhook currently.
- **Frequency cap: 1 marketing message per user per Page per day.** Billed **per delivered message** on the ads invoice. Meta-controlled in-thread opt-out link on every message.
- **Instagram: paid MM is Messenger-only.** With IG RN dead (US) as of Feb 10, 2026, **there is NO API surface for opt-in recurring marketing on Instagram DMs for US users.**
- **Sponsored Messages: deprecated July 31, 2024** (MM FAQ; lingering mentions in policy/send docs are stale).

### Utility Messages (the transactional lane — our follow-up/notification lane)
Source: [Send a utility message](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/utility-messages) (Mar 13, 2026).
- Pre-approved **templates** (`category: UTILITY`) for order/account status, **appointment and event reminders**; `{{placeholders}}` (positional or named since Mar 6, 2026), optional images, URL & postback buttons. Sent with `messaging_type: UTILITY`.
- Templates: Meta's library (`/message_template_library`) or Page-owned (`/PAGE_ID/message_templates` — approval "within seconds"). Requires **`pages_utility_messaging`** permission.
- **No marketing content.** No documented window/expiry for utility sends (the sanctioned post-window transactional channel replacing the dead tags); MM FAQ mentions "12 hours and 90 day limits" surfacing as errors in marketing contexts — verify empirically per use case. No charge documented for Messenger utility messages today (unlike WhatsApp) — architecture is WhatsApp-convergent; expect pricing pressure later.
- **Messenger-only** (no IG utility template docs exist).

---

## 5. Europe (EEA/Japan) rules

Source: [Messenger API Updates for Europe and Japan](https://developers.facebook.com/docs/messenger-platform/europe-updates) (Mar 18, 2026).
- The 2020-2021 privacy shutdowns for EEA/Japan users were progressively restored through **Oct 17, 2023**. Still NOT restored: **Messenger Extensions SDK, PSID/ASID matching, Account Linking, video in Media template**.
- No new 2023-2024 EEA restriction wave. What's new is the reverse: **new products don't launch in EU/UK** (paid MM can't target EU/UK/JP/KR/AU users; legacy RN persists only there).
- **US business messaging a user in the EU:** (1) residual feature gaps apply per *user* region; (2) marketing messages won't deliver to EU/UK-located users. Standard 24h messaging, HUMAN_AGENT, utility messages work normally. Corner case for US nonprofits, but build sends to tolerate per-recipient delivery errors.

---

## 6. Permissions & App Review in 2026

Sources: [Permissions Reference](https://developers.facebook.com/docs/permissions), [Messenger App Review](https://developers.facebook.com/documentation/business-messaging/messenger-platform/app-review) (Mar 24, 2026), [IG Messaging App Review](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/app-review), [Human Agent feature](https://developers.facebook.com/docs/features-reference/human-agent).

**Permission set for a multi-tenant chatbot platform (Facebook-Login route, Page-linked IG):**
- `pages_messaging` (deps: `pages_manage_metadata`, `pages_show_list`) — Page conversations; allowed usage incl. customer support, confirmations, calling.
- `pages_manage_metadata` (dep: `pages_show_list`) — webhook subscriptions.
- `instagram_basic` (deps: `pages_read_user_content`, `pages_show_list`).
- `instagram_manage_messages` (deps: `instagram_basic`, `pages_read_engagement`, `pages_show_list`) — explicitly for CRM/inbox tools.
- IG messaging additionally expects `business_management` and the **Human Agent feature**; IG apps **must provide a human-escalation path** (hard requirement).
- Specialty: `pages_utility_messaging` (utility templates); `marketing_messages_messenger`/`paid_marketing_messages` + `ads_management` (paid MM).
- Alternative stack: **Instagram API with Instagram Login** (June 2024+) — no Page required, `instagram_business_basic`, `instagram_business_manage_messages`.

**Standard vs Advanced Access (unchanged in 2026):**
- **Standard/Dev:** app works only with users holding **a role on the app** (and, for IG, a role on the IG account). Full build/test possible without review.
- **Advanced:** required to message the general public; per-permission App Review; **Business Verification required for all Advanced Access**.

**Review requirements & realities:**
- Hard requirements: published FB Page; webhook returns `200 OK` **within 20 seconds**; reviewer access to gated flows.
- Each permission needs a **screencast of the complete flow** (login/grant → feature in action; e.g. `pages_messaging`: show message sent from the app AND arriving in Messenger). Screenshots insufficient.
- Common rejections: requesting permissions not demonstrated/built; screencast not end-to-end; bundling IG scopes into a Messenger-only OAuth flow. Request only what you demo.
- Timelines: no published SLA; community reports days-to-weeks per submission with resubmission loops. Budget for iteration.

---

## 7. Automation disclosure & AI policies

- Meta's rule is **law-triggered**: "When required by applicable law, automated chat experiences must disclose that a person is interacting with an automated service" — at conversation start, after a significant lapse, or when switching human→bot. Meta calls out **California** and **Germany** (CA B.O.T. Act is the practical driver). Suggested copy: "I'm the [Page Name] bot," "You are talking to a bot."
- "Even where not legally required, we recommend informing users" — best practice. For a US nonprofit platform: **always disclose at conversation start** — satisfies CA, matches Meta's recommendation, costs nothing.
- Bot-type declaration (automated/manual/hybrid) governs the 30-second responsiveness policy (§1); IG requires human-escalation path (§6).
- **No new AI-specific Messenger Platform policy 2024-2026** — LLM bots governed by the same disclosure/responsiveness/content rules + Developer Policies + Community Standards. (Meta's Gen-AI product terms apply to Meta's own AI, not our bot.) Nonprofit clients: Community Standards independently require care with minors/health/crisis content — align with existing PII/AI-governance gates.

---

## 8. Rate limits & enforcement

Source: [Rate limits](https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview/rate-limiting) (Mar 23, 2026); [Error codes](https://developers.facebook.com/documentation/business-messaging/messenger-platform/error-codes).

**Messenger (per Page):**
- Overall budget: **200 × engaged users** calls per rolling 24h.
- **Send API: 300 calls/sec** text-class; **10/sec** audio/video. Per-thread throttling if you flood one conversation.
- Conversations API: 2/sec. Private Replies: 750/hour.
- **High-volume brake:** >40 messages/sec → inbox display + sending frozen until volume decreases.

**Instagram (per IG account):**
- Send API: **300/sec** text-class (raised from 100 on Oct 8, 2024), 10/sec audio-video; Conversations 2/sec; Private Replies 750/hr posts / 100/sec Live.
- High-volume brake at **72,000 messages** sent+received ("Your Message May Be Delayed" banners).

**Enforcement:**
- No published numeric block/report thresholds — the standard is qualitative "excessive negative feedback → messaging restricted."
- Wire-level signals: error **613** (rate limited), **551** (user unavailable/blocked), **1545041** (window closed), **10/subcode 1893063** = "Page temporarily restricted from sending" (new Jun 25, 2026).
- Ops surface: subscribe to **`messaging_policy_enforcement`** webhooks + **Page Integrity API/webhook** (Jan 30, 2026) for real-time restriction/violation/appeal status. Policy violations land in Page Support Inbox with a 7-day cure window.

---

## 9. Everything else recent

- **Doc migration:** everything under `developers.facebook.com/documentation/business-messaging/…`; old links rot (OTN page already 404s). Examples use **v25.0**.
- **IG Handover Protocol gone** → **Conversation Routing** (Oct 23, 2025).
- **Private Replies:** ONE message per comment/visitor post, within **7 days** of the action, auto-linked to the comment. IG supported (posts/ads/reels; Live only during broadcast).
- **Moderate Conversations APIs:** block/unblock/ban/spam — Messenger Mar 2025, IG Oct 2025.
- **Messenger Calling API GA** (Feb 11, 2026) under `pages_messaging`.
- **Content features 2025-2026:** `reply_to` (Jul 2025 FB / Dec 2025 IG), multi-image sends, IG PDF attachments (Dec 2025), reactions via API (Dec 2025), IG typing/mark-seen (Sep 2025), Sticker API (Jun 2026; `sticker` webhook migration ends **Aug 30, 2026**), image-grid template (Jun 2026), **appointment-booking data in webhooks/Conversations API (Mar 3, 2026 — directly useful for our scheduling product)**, `response_feedback` (thumbs up/down on bot messages, Oct 2024), `message_edits` (Apr 2024).
- **IG `share` → `ig_post`** webhook migration completed Apr 27, 2026.
- **Welcome Message Flows** for CTM/CTD ads via Marketing API — the sanctioned "ads → bot conversation" funnel and a paid-MM subscriber source.

**Practical synthesis for the follow-up/notification roadmap (US nonprofits):**
1. In-window (24h): free-form bot messaging, promotional OK.
2. Post-window transactional (appointment/event reminders, application status): **Utility Message templates** (Messenger only; get `pages_utility_messaging` in App Review). Replaces the dead tags.
3. Post-window human support: **HUMAN_AGENT** (7 days; FB+IG; App Review + Business Verification; human-authored only).
4. One-shot "notify me": **OTN** (Messenger only; alive but unmaintained — at-risk).
5. Recurring promotional: **paid Marketing Message API** only — tech-provider gated, Advanced Access ×3 permissions, 1/user/day, per-delivered billing. Nothing free remains in this lane, and **nothing at all exists in this lane for Instagram** in the US today.

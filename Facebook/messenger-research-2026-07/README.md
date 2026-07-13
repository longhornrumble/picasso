# Messenger Channel Research — State of the Platform, July 2026

**Purpose:** ground-truth briefing on Meta's Messenger Platform (Facebook Messenger + Instagram DM) before designing the Picasso Messenger channel experience. Compiled 2026-07-12 from four parallel deep-research passes against live Meta documentation (every claim in the four reports carries a source URL; deprecations are dated).

**"Messenger" in Picasso vocabulary = Facebook Messenger + Instagram DM together** (per Chris, 2026-07-12).

| Report | Covers |
|---|---|
| [01-fb-send-capabilities.md](01-fb-send-capabilities.md) | Message types, templates, quick replies, persistent menu/ice breakers, attachments, sender actions, m.me links, API version runway, 2025-26 additions |
| [02-messaging-windows-policy.md](02-messaging-windows-policy.md) | 24-hour window, message tags, utility/marketing messages, OTN, EEA rules, App Review & permissions, bot disclosure, rate limits & enforcement |
| [03-instagram-dm-api.md](03-instagram-dm-api.md) | The two IG API generations, IG feature matrix vs FB, IG webhooks, story replies/mentions, private replies, Requests folder, eligibility, IG rate limits |
| [04-handover-inbox-staff.md](04-handover-inbox-staff.md) | Conversation Routing (Handover successor), Business Suite inbox, staff-reply detection (echoes), staff notifications, competitor patterns, Conversations API |

---

## The ten findings that shape our build

1. **Handover Protocol is retired on BOTH channels (Sept–Oct 2025) → "Conversation Routing."** Same core APIs (`pass/take/release_thread_control`, `standby`), new model: a per-Page **default application** + 24h thread-control expiry. It works first-class on Instagram now. Escalation to staff = `pass_thread_control` to the inbox app IDs (**263902037430900** FB / **1217981644879628** IG); a staff reply in Business Suite auto-takes control (self-healing). *(Report 04 §1–2)*

2. **The free follow-up era is over.** Message tags `CONFIRMED_EVENT_UPDATE`/`ACCOUNT_UPDATE`/`POST_PURCHASE_UPDATE` hard-died Apr 27, 2026 (error 100). The post-window lanes now: **Utility Message templates** (transactional — appointment/event reminders; Messenger-only; `pages_utility_messaging`), **HUMAN_AGENT** (7-day human-authored replies, FB+IG, App-Review-gated), **OTN** (one-shot "notify me", Messenger-only, unmaintained/at-risk), **paid Marketing Messages** (Messenger-only, tech-provider-gated, 1/user/day, billed per delivery). **Instagram has NO recurring/marketing lane for US users at all.** *(Report 02 §2–4)*

3. **The 30-second responsiveness rule.** Automated experiences must respond to **any and all input within 30 seconds** — including attachments, stickers, and voice notes we can't process. Our SQS pipeline meets the latency easily, but we must never silently drop an input type; every inbound needs at least a graceful fallback reply. Violations → Page Support Inbox notice → 7-day cure window → send restrictions. *(Report 02 §1)*

4. **Bot disclosure is required.** California + Germany trigger Meta's law-based disclosure rule; Meta recommends it universally. Decision: always disclose at conversation start ("I'm the [Org] assistant…"). Costs nothing, closes the compliance question. *(Report 02 §7)*

5. **Staff notifications are ours to build.** Business Suite's native notifications are unreliable and have no API hook; no serious bot platform relies on them. On escalation: pass thread to the inbox + send our own email/SMS (SES + Telnyx rails exist) with a deep link to `business.facebook.com/latest/inbox`. Staff-reply detection: echo webhooks (`is_echo && app_id !== ours` → pause bot). IG App Review **requires** demonstrating a human-escalation path — this feature is a review prerequisite, not polish. *(Report 04 §3–6)*

6. **Rich CTA rendering toolbox, with one nuance.** Quick replies (13 × 20 chars) are **transient** — they vanish after the next message; button templates (3 buttons, persistent in thread) suit commitment CTAs (Apply, Schedule); carousels (10 cards), image grid (new Jun 2026). Ice breakers (4 questions) + persistent menu work on **both** channels and are pushed via the Messenger Profile API at config-publish time (a Config Builder job, not runtime). A persistent-menu tap **opens a fresh 24h window**. Note: quick-reply taps arrive as `messages` (with `quick_reply.payload`), NOT `messaging_postbacks`. *(Reports 01 §2/§4, 03 §2)*

   > Conflict resolved: one report repeated the folklore that FB ice breakers died in 2023; the direct scrape of the live Messenger Profile reference (updated Jun 2024, precedence rules included) shows them **alive** on both FB and IG. Personas API also alive despite folklore.

7. **Instagram is the tighter envelope.** 1,000-char text cap (FB: 2,000); no `user_email` quick reply; no phone-call buttons; inbound GIFs/stickers fire **no webhook at all**; structured templates invisible on IG web. Users can edit/delete messages — `message_edit` webhook exists (subscribe to it), and Meta's terms **require deleting stored copies** when `is_deleted` arrives (bears on our conversation-history design + PII review). Our Page-linked API path has **no sunset risk** — actively maintained, higher rate limits than the newer IG-Login path; the IG-Login path is a future onboarding lane for tenants without FB Pages. *(Report 03 §1–3)*

8. **The website chat plugin is dead (May 2024) — Meta has no embedded web chat.** Validates the Picasso widget strategy. The web↔Messenger bridge is m.me / ig.me links with `ref` params (QR-supported; ref delivery not guaranteed — degrade gracefully). Clicking one into an existing thread **re-opens the 24h window**. *(Report 01 §5–6)*

9. **Meta Business Agent (launched Jun 2026) is both competitor and config hazard.** Meta's own free AI agent for Pages answers questions, books appointments, qualifies leads. A tenant enabling it (or leaving Business Suite's instant-reply/away automations on) double-responds alongside our bot — documented, widespread conflict. Tenant onboarding needs a checklist: our app = default application, take-control ON, Business Suite automations OFF, Business Agent OFF. *(Reports 04 §4–5, 01 §10)*

10. **Version runway + live migrations.** v21.0 (our pin) is safe until ~early 2027; bump to v25.0 opportunistically. Two migrations apply NOW regardless of pin: sticker webhooks switch to `sticker` attachment type Aug 30, 2026; IG post-share `share`→`ig_post` completed Apr 2026. New goodies relevant to us: **appointment-booking data in webhooks** (Mar 2026 — scheduling synergy), `response_feedback` (thumbs up/down on bot messages = free quality signal), reply-to, bot reactions, Messenger voice Calling API, Page Integrity webhook (alert when a tenant's Page gets send-restricted). *(Reports 01 §1/§10, 02 §8–9)*

---

## Implications for the Picasso Messenger channel (feeds the roadmap)

- **V5 single-pass turn transfers cleanly.** Meta_Response_Processor is buffered, so the V5 action-tail parse is trivial (no streamTail complexity). Reuse `buildActionCatalogBlock`/`buildTurnCheckBlock`/`validateActionIds` from BSH (lift to a shared module); splice into the Messenger short-form base prompt instead of the V4 widget prompt.
- **CTA rendering map:** transient suggestion (LEARN/send_query) → quick replies; commitment step (APPLY/SCHEDULE/external_link) → button template with `web_url`; `start_form` → URL button linking out (conversational collection is a later phase). Respect 20-char title caps in config validation.
- **Welcome surface:** ice breakers (≤4) + persistent menu, generated from tenant config and pushed via Messenger Profile API on config publish (Config Builder feature; per-locale support available).
- **Every-input handling:** typing_on immediately on receipt; graceful text fallback for attachments/stickers/voice; respect the 30-second rule across all webhook shapes.
- **Escalation loop:** detect "talk to a human" intent → pass_thread_control to inbox app ID with context metadata → notify staff via SES/Telnyx → standby watch → auto-resume via take_thread_control or 24h idle expiry. Echo-watching as belt-and-suspenders for unconfigured tenants.
- **Scheduling tie-in:** utility templates cover appointment reminders on Messenger (post-window transactional); IG has no such lane — reminders for IG users must route via SMS/email (we already collect phone via scheduling).
- **Data hygiene:** honor `is_deleted`/`message_edit` in conversation history storage; PSID-keyed transcripts need retention/TTL decisions → PII review triggers apply before production.
- **App Review runway:** dev-mode/Live+role-holders works today for MyRecruiter's own accounts; serving real tenant Pages requires Advanced Access (`pages_messaging`, `instagram_manage_messages`, Human Agent feature, Business Verification) with end-to-end screencasts and a demonstrable human-escalation path. Budget weeks + resubmission loops; request only what we demo.
- **Ops:** subscribe `messaging_policy_enforcement` + Page Integrity webhooks; map error 613/551/1545041/10-1893063 to distinct handling; watch the Aug 30, 2026 sticker webhook migration.

# Messenger Activation & Verification Checklist (operator)

> Turns the Messenger Product Surface from **built + staged** into **live + verified** on a tenant. Everything below is on **staging** (account 525); prod is a separate gated program. Reference tenant: `MYR384719`.
>
> **Why this exists:** the whole surface was built and unit/integration-tested by a CLI agent, which cannot mint a browser Clerk session or drive a real Meta page. Every step here is an operator action that closes one of those verification gaps. Companion docs: the pipeline soak is [`../roadmap/MESSENGER_CHANNEL_EXPERIENCE.md`](../roadmap/MESSENGER_CHANNEL_EXPERIENCE.md) §12 + [`MESSENGER_SOAK_KIT.md`](MESSENGER_SOAK_KIT.md); the program itself is [`../roadmap/MESSENGER_PRODUCT_SURFACE.md`](../roadmap/MESSENGER_PRODUCT_SURFACE.md).

## Already verified this session (you do NOT need to re-check)

- **`messenger_behavior` is server-editable + live** on the staging Config Manager (lambda#458) — CB edits to escalation/behavior/welcome persist.
- **Scheduling infra gates 3 & 4 wired + permissioned** on the staging `Meta_Response_Processor`: `CONVERSATION_STATE_TABLE=picasso-conversation-state` (ACTIVE, CRUD granted) + `BOOKING_COMMIT_FUNCTION=Booking_Commit_Handler` (Active, InvokeFunction granted).
- **Welcome auto-push is wired both ways:** browser trigger (cb#91) + server-side backstop (lambda#461) with the IAM grant + `META_OAUTH_FUNCTION` env **verified live** on the Config Manager (picasso#780; code intact post-apply).

## Prerequisites

- [ ] A **Meta Page / IG account connected** for the tenant (Config Builder → Channels, or the portal → Integrations connect card). Connection lives in `picasso-channel-mappings` (DDB).
- [ ] **CTAs defined** in the tenant config — ice-breaker and persistent-menu payloads are dropdowns of `cta_definitions` (they resolve `PIC1:cta:{id}`). No CTAs ⇒ the welcome editors show "define CTAs first."
- [ ] If you want scheduling in Messenger: the tenant's **`scheduling_enabled` flag on** + scheduling actually set up (appointment types, availability, calendar connected) — same setup the widget uses. See the parity audit (`../audits/messenger_scheduling_parity_2026-07-14.md`) for what's supported in Messenger vs the widget.

## Step 1 — Configure (Config Builder → Settings → Messenger, super-admin band)

- [ ] Turn on **Messenger Channel** (`MESSENGER_CHANNEL`).
- [ ] Set the **escalation recipient** email (must be a verified SES identity).
- [ ] Optional: **disclosure line**, **tone override**.
- [ ] **Welcome surfaces:** add ice breakers (≤4, each links a CTA) + persistent menu (CTA or URL).
- [ ] **Deploy.** Confirm the "Configuration deployed successfully" toast, then confirm the config landed in the staging bucket (`s3://myrecruiter-picasso-staging/tenants/MYR384719/MYR384719-config.json`).

## Step 2 — Verify the welcome auto-push (the thing that replaced the manual script)

- [ ] On Deploy, confirm the **"Welcome surfaces pushed to Facebook / Instagram (N ice breakers, M menu items)"** toast (browser trigger).
- [ ] Open the tenant's Page in **Messenger on a real device** (ice breakers/menu are invisible on Messenger web) → confirm the ice breakers + persistent menu appear on a **fresh** conversation.
- [ ] (Backstop check, optional) In CloudWatch, the `Picasso_Config_Manager` log for that deploy should show it invoked `Meta_OAuth_Handler`; the `Meta_OAuth_Handler` log should show `push_welcome_surfaces` result. Both the browser and server-side pushes are idempotent, so seeing one or both is fine.

## Step 3 — Verify human escalation

- [ ] In Messenger, send **"I want to talk to a person"** (or tap an escalation CTA) → the bot confirms + stands down.
- [ ] The **escalation email arrives** at the recipient from Step 1 (content-free body by design — no transcript).
- [ ] The thread appears in the **Business Suite inbox**; a staff reply from there does not get stepped on by the bot (pause behavior).

## Step 4 — Verify scheduling (only if `scheduling_enabled`)

- [ ] Tap a **"schedule a call"** ice breaker / CTA (a `start_scheduling` CTA) → the bot sends the **availability carousel** (≤10 slot cards).
- [ ] Pick a slot → confirm → a **calendar event is created** (same `Booking_Commit_Handler` as the widget) and the visitor gets a confirmation.
- [ ] Try **reschedule / cancel** on the booking (a `resume_scheduling` CTA) — confirm against the **parity audit** for exactly what's supported (Messenger scheduling is a v1 subset; do not assume every widget scheduling feature is present).

## Step 5 — Verify the portal (tenant band)

- [ ] Portal → **Integrations → Meta connect card**: a role-holder can connect / see status / disconnect. (The `GET /meta/channels/{id}` connection-status read 500'd on staging until 2026-07-14; **fixed in lambda#462** — DynamoDB `Decimal` (the `ttl`) wasn't JSON-serializable — deployed + live-verified. Status display now works.)
- [ ] Portal → **escalation editing**: change the escalation recipient → confirm it round-trips into the config (writes via `Analytics_Dashboard_API`'s deep-merge, preserving sibling `messenger_behavior` keys).

## Step 6 — Quick UI sanity (jsdom couldn't verify these)

- [ ] Config Builder → Settings → Messenger: the **CTA dropdowns** in the welcome editors populate from your CTAs and update as CTAs change (the Radix dropdown couldn't be driven in tests; one click-through confirms it).

## Known gates / caveats (not blockers, but know them)

- **App Review / Advanced Access** gates *real-tenant self-serve* connect. Role-holders can test everything above now; non-role-holder tenants can't connect until Meta approves — see [`../roadmap/MESSENGER_APP_REVIEW_PACKAGE.md`](../roadmap/MESSENGER_APP_REVIEW_PACKAGE.md).
- **`Meta_OAuth_Handler` caller-authz gap — CLOSED 2026-07-14** (lambda#463 + picasso#784/#785, deployed + live-verified on staging). The `/meta/channels/*` routes now authorize the caller: the portal's internal Picasso JWT with a matching `tenant_id` (a mismatch is a 403), or the Config Builder operator's Clerk JWT (any tenant). OAuth `url`/`callback` stay public (Meta's redirect); the server-side welcome-repush backstop (IAM invoke) is exempt. Unauthenticated disconnect/enumerate now returns 401 (verified live).
- **Prod** promotion is out of scope here; the dashboard prod build additionally needs `VITE_META_OAUTH_URL` set (the prod `Meta_OAuth_Handler` URL) before a prod portal deploy.

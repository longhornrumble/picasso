# Messenger App Review Package — checklist

> Milestone prep (program plan §6 milestone block). **Submission and iteration
> are operator-driven** — this doc makes the package assembly mechanical.
> Advanced Access is the real-users gate; dev-mode covers all staging work
> meanwhile. Budget weeks + resubmission loops. Request ONLY what we demo.

## What we request

| Permission / feature | Why (demo mapping) | Notes |
|---|---|---|
| `pages_messaging` (Advanced) | the whole FB channel | |
| `instagram_manage_messages` (Advanced) | the whole IG channel | IG review REQUIRES a demonstrable human-escalation path — M6a/M6b IS that demo |
| Human Agent feature | 7-day human-authored follow-ups post-escalation | request together; demo = staff reply from Business Suite after an escalation |
| Business Verification | prerequisite for Advanced Access | legal-entity docs; start EARLY (longest lead time) |

Explicitly NOT requested (no demo, no need): `pages_utility_messaging` (deferred — reminders ride SMS per D9), marketing messages, OTN.

## Screencast shot list (record on staging, MYR384719, dev-mode app)

1. **Core value:** user DMs the Page → KB-grounded answer ≤3 sentences → quick replies render → tap answers correctly. Repeat on IG in-app.
2. **Commitment flow:** sustained-interest conversation → button template renders → tap opens the tenant URL.
3. **Human escalation (the IG prerequisite):** user says "I want to talk to a person" → bot confirms → thread appears in Business Suite inbox → staff email arrives (show the content-free email) → staff replies from the inbox → bot stays silent (paused) → show the pause behavior on a follow-up user message.
4. **Welcome surfaces:** fresh conversation shows ice breakers; persistent menu visible; Get Started produces the welcome message.
5. **Disclosure:** first turn of a session shows the automated-assistant disclosure line.

Production tips: one take per flow, captions naming the permission being demonstrated, real device for IG (templates invisible on IG web), keep each ≤90s.

## Reviewer test-user setup

- Add 2 reviewer-accessible test users as app role-holders (Standard Access constraint) OR provide the reviewer-instructions template with credentials per Meta's guidance.
- Written step-by-step instructions per screencast flow (Meta reviewers follow scripts literally).
- Confirm the staging tenant's Page + IG account stay connected + flag-on for the review window.

## Pre-submission checklist

- [ ] Business Verification COMPLETE (start first — longest pole)
- [ ] Privacy policy URL live + names Messenger/IG data handling (coordinate with the PII program's public-notice work)
- [ ] App icon, category, description current in the dashboard
- [ ] M4-S soak passed (never demo an unsoaked build)
- [ ] M6a/M6b live-verified (escalation demo must work first-take)
- [ ] Data deletion callback URL configured (Meta requires one; is_deleted handling M1b backs it)
- [ ] Screencasts uploaded, instructions attached, permissions justified 1:1 with demos

## After submission

- Track status in the App Dashboard; typical loop = days–weeks per round.
- Rejections: read the reviewer note literally, fix ONLY what's named, resubmit with a change note.
- On approval: Advanced Access + Business Verification unlock real-tenant Pages — that's the input to the (separate, gated) prod-promotion program, NOT an automatic go-live (G5: prod app topology decision still owed).

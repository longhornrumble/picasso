# pii-inventory snippet — WS-E-TCPA (consent TTL + booking opt-in + channel selection)

**Status:** DELIVERABLE for the PII session to merge into
[`docs/roadmap/PII-Project/pii-inventory.md`](../../docs/roadmap/PII-Project/pii-inventory.md).
**Per CLAUDE.md (the PII session owns `pii-inventory.md`), WS-E-TCPA does NOT edit that file
directly** — this snippet is the coordinated hand-off (Living-Inventory PR Rule).

Triggered by: WS-E-TCPA modifies the **PII shape of the `picasso-sms-consent` table** (adds a
`ttl` attribute + 4yr+30d retention) and adds **two new processing surfaces** (a booking-time
consent writer + a pure channel-selection module). PRs: lambda `feature/scheduling-ws-e-tcpa`
(form_handler.js ttl + `shared/scheduling/consent.js` + `shared/scheduling/channels.js`) +
picasso `feature/scheduling-ws-e-tcpa` (infra TTL block).

---

## 1. Storage surface — `picasso-sms-consent` (NEW row / shape change)

No dedicated row exists in §B today (the table appears only in the 2026-06-04 naming-alignment
note). Proposed row, in the §B "Table (IaC name)" format:

| Table (IaC name) | Key schema | Identifying fields | TTL attr / enabled / **written?** | PITR | Streams | Encryption | Writer Lambda(s) | Read access (coarse) | Scope | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| `picasso-sms-consent` (`infra/modules/picasso-form-tables`) | PK `pk=TENANT#{tenantId}` · SK `sk=CONSENT#{consent_type}#{phone_e164}`; GSI `phone-lookup(phone_e164, pk)` | **`phone_e164` (Tier 2 — recipient phone)**; `consent_given`, `opted_out_at`, `opt_out_source`, `consent_method`, `consent_language`, `consent_type`, `booking_id`/`form_id`/`submission_id` (provenance) | `ttl` / **enabled (WS-E-TCPA)** / **YES — 4yr+30d** (form_handler.js `writeConsentRecord` + `shared/scheduling/consent.js`) | on | off | SSE-DDB | **BSH `form_handler.js writeConsentRecord`** (web-form opt-in) · **`shared/scheduling/consent.js recordBookingSmsConsent`** (booking opt-in, WS-E-TCPA) | `SMS_Sender` (consent gate, GetItem on the SK) + future delete/DSAR roles | **⚠ DELETE vs CARVE-OUT — PII-session/counsel call (see note)** | TCPA consent proof. **Shape change (WS-E-TCPA):** `ttl` attribute added in IaC + both writers now set `ttl = epoch(now + 4yr + 30d)`; pre-existing rows without `ttl` are untouched (DynamoDB only expires items carrying it), so enable-and-writer are order-independent. Phone is stored **on the record** (survives booking deletion) — FROZEN_CONTRACTS §E3. |

## 2. Processing surfaces — two NEW library modules (Lambda/lib table, §A format)

| Lambda / lib | Runtime | PII handled (transit) | Writes to | Notes |
|---|---|---|---|---|
| `shared/scheduling/consent.js` (`recordBookingSmsConsent`, WS-E-TCPA) | Node.js lib (not a Lambda) | Recipient **phone (E.164, Tier 2)** + consent metadata; normalizes/validates to E.164 **before** any write (never writes a non-E.164 number). Error/warn logs are **PII-redacted** (tenant + booking id only — never the phone). | Conditional PutItem → `picasso-sms-consent` (write-only; **does NOT send SMS** — the opt-in confirmation SMS is integrator-wired BCH glue). | Booking-time SMS opt-in writer (SEAM-2). One consent record per (tenant, phone) covers all four moments. Consuming Lambda (Booking_Commit_Handler) carries the DDB PutItem grant on `picasso-sms-consent`. |
| `shared/scheduling/channels.js` (`selectChannels`, WS-E-TCPA) | Node.js lib (pure logic) | Receives a **consent record object** in memory (reads only `consent_given`/`opted_out_at`) + `booking.timezone`. **No phone processing, no storage, no logging of PII.** | (none — pure decision `{email, sms}`) | TCPA channel-selection (SEAM-1): email-floor; SMS gated by org-flag + consent (fail-closed) + volunteer-local quiet-hours (fixed 8pm–8am). Consumed at fire-time inside `Scheduled_Message_Sender` (REMIND glue). |

## 3. Tier classification (per `data-classification.md`)

| Surface | Tier | One-line justification |
|---|---|---|
| `picasso-sms-consent` table | **2** | Recipient phone (Tier 2) + consent metadata; no Tier-3 free-text/sensitive-content. The WS-E-TCPA `ttl` **adds** the Tier-2 "retention defined" control (4yr+30d) — a data-minimization improvement, not a tier change. |
| `shared/scheduling/consent.js` | **2** | Transits + persists a Tier-2 phone; logs PII-redacted; no Tier-3 content. |
| `shared/scheduling/channels.js` | **2** (in-transit only) | Handles a Tier-2 consent record object transiently; reads only boolean consent flags + timezone; no persistence, no PII logging. |

## 4. Open question flagged for the PII session (do not resolve unilaterally)

**Scope column — DELETE vs CARVE-OUT vs TTL-ONLY for `picasso-sms-consent`.** TCPA consent
records are *proof of consent / opt-out* and are conventionally retained for the limitation
window (~4 years) — which is exactly why the TTL is `now+4yr+30d` rather than a short hygiene
window. That tension (a DSAR delete of the subject's phone vs. retaining opt-out proof so a
STOP cannot be "forgotten" and re-contacted) is a **counsel/PII-session decision**. WS-E-TCPA
sets the retention TTL per §E3 but does **not** assert the delete-pipeline scope. Recommend the
PII session classify this row's Scope (and whether the delete pipeline should preserve
`opted_out_at` even when deleting other fields).

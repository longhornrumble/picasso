# Attribution — Production Enablement Compliance Package

**Produced:** 2026-06-12 by privacy-data-governance-advisor + communications-consent-advisor (advisory, not legal advice).
**Gates:** (A) flipping `REACH_PING`/`dashboard_attribution` for the first PROD tenant; (B) first real recap-email send (`RECAP_SEND_ENABLED=true`). Staging is NOT gated by anything here.

---

## A. Reach ping + Dub (privacy-data-governance-advisor)

### A1. Tenant privacy-notice template

**Short clause (drop into an existing policy):**
> Our website chat is provided by MyRecruiter. On pages where the chat widget appears, MyRecruiter measures page visits (page path only) on our behalf to help us understand how people find and use our programs. It reads, but never sets, the Google Analytics cookie to group visits into sessions, and retains visit data for up to 90 days (summary statistics thereafter).

**Fuller disclosure:**
> We use MyRecruiter to power the chat assistant on our website. On pages where the widget loads, MyRecruiter records that the page was visited — the page path only, never the full address, form contents, or anything you type outside the chat. To connect visits within a browsing session, it reads the Google Analytics cookie already set by our site; it does not set cookies or store identifiers of its own. Visit records are kept for up to 90 days, after which only aggregate counts remain. If you reach our site through one of our short links or QR codes, the click is routed through Dub.co, our link-management provider, which reports aggregate click counts to us.

### A2. Dub DPA checklist (operator)

1. Read dub.co/legal/dpa — auto-incorporated into the Terms (no signature flow; verified live 2026-06-12, last updated 2024-08-13). Save a dated PDF as evidence.
2. Confirm the Pro workspace sits under the account that accepted the Terms (that acceptance binds the DPA).
3. Capture Dub's published click-data claims (dub.co/legal/privacy + analytics docs): IP handling/anonymization and click-event retention — dated screenshot (the DPA itself is silent on IP anonymization).
4. Note Dub's subprocessors (dub.co/legal/subprocessors) for the records.
5. EEA transfers: DPA commits to SCCs/adequacy — sufficient for the current US tenant base; revisit on first EU tenant.
6. Tenant-facing subprocessor line:
> Dub, Inc. (dub.co) — short-link and QR redirect service; processes click metadata (timestamp, link, device/region); MyRecruiter receives aggregate counts only.

### A3. GPC recommendation (operator decision — OPEN)

**Recommendation: honor `navigator.globalPrivacyControl` by default at the loader's single emission choke point — hardcoded, no tenant config in v1.** The widget sets no cookies and stores no cross-site identifiers, so GPC arguably doesn't apply — but the GA client ID at rest is still a CPRA "unique identifier," and the one-line suppression removes the question from every future tenant conversation at negligible reach-data cost. (~5-line widget change + test once ratified.)

### A4. MSA scope-read brief (forward to counsel verbatim)

- Does the services/data-processing clause authorize MyRecruiter to collect page-view data **site-wide where the widget loads**, or only chat-interaction data?
- Does the clause establish CPRA **service-provider** status (processing only per the agreement, no sale/sharing, no cross-tenant combination) covering this measurement?
- Is reading the tenant's Google Analytics cookie for sessionization within the authorized processing purposes?
- Does the agreement permit subprocessors generally, and does Dub.co fit, or is tenant notice/consent required?
- Does anything obligate the tenant to update their own privacy notice, and should we add a clause requiring them to post our disclosure (A1)?
- Do the 90-day retention and aggregate-thereafter terms conflict with any retention/deletion commitments?

### A5. Enablement checklist (first prod tenant, in order)

1. Dub §G vendor row reaches `main` via the next staging→main promote (currently on `staging` — it rode infra PR picasso#547 per the Living-Inventory same-PR rule).
2. DPA evidence captured (A2.1–A2.4, dated).
3. GPC decision made; if adopted, suppression verified live in staging (GPC browser → no PAGE_VIEW).
4. MSA brief to counsel; scope confirmed or addendum executed.
5. Tenant has published notice language (A1) — confirm URL.
6. C8 spot-check on the prod build artifact (pathname-only, referrer hostname only, no cookie/localStorage writes, no `dub_id`).
7. 90-day TTL on the prod table; kill switch verified (`feature_flags.REACH_PING` false → no emission).
8. Flip for the one tenant; record date + config version in the decision log.

**No blocking findings in the shipped C8 posture.**

---

## B. Recap email (communications-consent-advisor)

**Classification:** account-statement-style reporting on the recipient's own paid service → CAN-SPAM transactional/relationship carve-out; the board-packet flavor means we meet the commercial bar anyway. Tenant-configured recipients = sufficient consent (standard B2B operational pattern); no per-recipient opt-in.

**Verdict: APPROVED-WITH-CONDITIONS — do not set `RECAP_SEND_ENABLED=true` until 1–3 ship:**

1. **Physical postal address** in the HTML footer + text fallback (missing; `send_email` injects nothing). → Implemented as env `RECAP_POSTAL_ADDRESS`, **fail-closed** (empty = no send even when enabled). Operator supplies the address value.
2. **Functional unsubscribe:** the bare `/unsubscribe` link is non-functional (no recipient token; login-gated dashboard ≠ CAN-SPAM-adequate). → Tokenized (HMAC over tenant+email), login-free endpoint writing a **persistent suppression record**; generator filters recipients against suppression before every send.
3. **Suppression overrides tenant config permanently** (config is re-read monthly; an admin re-adding an unsubscribed address must not resurrect sends). Suppression store added to pii-inventory (Living-Inventory rule — emails at rest).
4. Verify `/unsubscribe` + settings links land (staging checklist).

Recommended, non-blocking: `List-Unsubscribe`/`List-Unsubscribe-Post` headers (needs a small send_email header pass-through); route SES complaints into the same suppression set.

**Build status:** conditions 1–3 are in flight as workstream WS-I (`Attribution_Recap_Generator` + new `Attribution_Unsubscribe` Lambda); the address VALUE and the GPC decision are the only operator inputs.

---

## Resolved alongside

- **After-hours timezone default `America/Chicago` CONFIRMED by operator 2026-06-12** (C7's PROVISIONAL marker resolved; no code change — shipped default already Chicago).

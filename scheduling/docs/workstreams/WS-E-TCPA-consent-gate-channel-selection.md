# WS-E-TCPA — TCPA consent gate + channel-selection (E8)

**Plan task(s):** E8. [implementation plan](../scheduling_implementation_plan.md) §7.
**Repo / branch / base:** `lambda` (+ `infra/` deploy-note) · `feature/scheduling-ws-e-tcpa` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **FULL — HIGH-RISK (TCPA).** Mandatory Security-Reviewer + operator go-ahead before merge. NO auto-merge.

## Goal / done-bar (verifiable)
The `selectChannels` channel-selection gate (§E3) + the booking-end opt-in capture, so SMS is sent ONLY with TCPA-compliant consent.
1. **`selectChannels({ tenantId, attendee, moment, nowLocal, tenantPrefs }) → { email:true, sms:<bool> }`** per §E3 — `sms = org-flag === true && consentGiven(...) [FAIL-CLOSED: absent → false] && !inQuietHours(nowLocal, sms_quiet_hours)`. Email is ALWAYS true (floor).
2. **Quiet-hours:** `nowLocal` computed AT FIRE TIME from `Booking.timezone` (fallback tenant `scheduling.timezone`, else UTC); 8pm–8am drop SMS (email still sends). Fire-time enforcement, never creation-time.
3. **Opt-in capture (booking-end):** write `picasso-sms-consent` (PK `TENANT#{tenantId}` · SK `CONSENT#transactional#{phone_e164}`; `consent_given:true`, `phone_e164` **E.164-normalized BEFORE write**, `ttl = epoch(now+4yr+30d)`). The opt-in language covers ALL FOUR moments (confirmation/reminder/cancel/reschedule), not just reminders.
4. **`sendType:'contact'`** on every contact-facing `SMS_Sender` invoke (the field that activates the shipped consent gate). Every SMS template carries STOP/HELP text — **test-enforced** (rendered body without STOP = failing test).
5. **⚠ Bring-up FIRST (before E3 logic):** the shipped `Bedrock_Streaming_Handler_Staging/form_handler.js` consent writer OMITS `ttl` AND the `picasso-sms-consent` IaC has NO TTL attribute → **patch both** (add the `ttl` write + the IaC TTL attribute) as your first commits.

- **Done-bar:** unit tests — fail-closed (absent consent → sms:false), opted-out (consent_given:false OR opted_out_at present → false), quiet-hours drop (SMS suppressed, email kept) with fire-time tz, E.164-before-write, STOP-in-every-template, one-opt-in-covers-4-moments.

## You OWN (create/edit ONLY these)
- the `selectChannels` module + consent-capture writer + tests; the `form_handler.js` `ttl` patch; the `infra/` TTL-attribute add on `picasso-sms-consent` (deliver as your own files + a deploy note — integrator applies the IaC).

## You CONSUME (frozen — never modify)
- **§E3** (the contract you PRODUCE — honor it exactly), `picasso-sms-consent` (shipped shape), `SMS_Sender` (`sendType:'contact'`, E.164 validate), `SMS_Webhook_Handler` (STOP/HELP/UNSTOP — already handles inbound), `Booking.timezone`/`attendee_phone` (§A).

## You PRODUCE
- **§E3 `selectChannels`** + the consent-capture writer (WS-E-REMIND, C8 confirm, `notify.js` cancel all consume the gate).

## OUT OF SCOPE / do NOT
- Do NOT send marketing SMS — transactional only. Do NOT build the reminder cadence (WS-E-REMIND) — you PRODUCE the gate it calls.
- Do NOT create consent on UNSTOP from scratch (UNSTOP only re-enables a prior opt-in — TCPA). Do NOT tenant-filter the STOP GSI (cross-tenant STOP is deliberate).
- Do NOT mutate deployed Lambda code or secrets directly — code + deploy note only.

## References
- Plan E8 (Security-Reviewer P1/P2 notes); canonical §12.2; FROZEN §E3; `CLAUDE.md` (PII triggers, credential-mutation gate); Living-Inventory Rule (consent = PII surface → pii-inventory snippet, integrator coordinates with PII session).

## Report-back (in your PR)
- PR `feat(scheduling): WS-E-TCPA consent gate + channel-selection (E8)` → main. **Flag HIGH-RISK for the FULL audit.**
- Doc-snippet: plan E8 status; the IaC TTL + form_handler ttl deploy note; the **pii-inventory line** for the consent surface (integrator applies after PII-session coordination); confirm §E3 verbatim.
- Branch, PR#, done-bar status, any contract issue (STOP + flag, don't fork).

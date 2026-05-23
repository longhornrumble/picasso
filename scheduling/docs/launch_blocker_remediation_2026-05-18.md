# Scheduling v1 — Launch-Blocker Remediation Plan

**Created:** 2026-05-18
**Status:** Design only — no code. Produced from the 2026-05-18 multi-agent review (tech-lead / architect / security / PM) of the platform-currency-reconciled canonical + implementation plan.
**Scope:** the four launch-gating findings (N1, N2, N3, N4). Other review findings (N5, N6, N8, N9) are tracked in the appendix, out of this remediation's scope.
**Sibling docs:** `scheduling_design.md` (canonical → § Platform Currency Reconciliation → Resolved decisions), `scheduling_implementation_plan.md`.

---

## Gate summary

| ID | Blocker | Gates | Type | Owner |
|---|---|---|---|---|
| N1 | SQS FIFO dispatch queue has no provisioning task | **Sub-phase B start** (B2 cannot dispatch) | Plan completeness | DevOps + Backend-Engineer |
| N2 | PII Remediation governance — **RESOLVED 2026-05-18** | **F1 / prod flag-flip** + immediate FTC §5 claim | Governance decision (made) | **Chris** (PII owner) |
| N3 | Telnyx STOP webhook: no timestamp replay window | **Pre-prod (F1)**; recommend pre-staging-soak | Security | Backend + Security-Reviewer |
| N4 | Telnyx webhook public key in env var; silent-drop on misconfig | **Pre-prod (F1)** | Security | Backend + Security/DevOps |

N3/N4 touch `SMS_Webhook_Handler`, **already live in staging** on the transactional-SMS path — these are live-platform gaps scheduling *inherits*, not scheduling-introduced. Fixing them benefits the platform now and is a prerequisite scheduling depends on.

---

## N1 — Calendar dispatch SQS FIFO queue (task B0a)

**Problem.** `listener_dispatch_interface.md` specifies an SQS FIFO queue as the delivery mechanism between `Calendar_Watch_Listener` (B2) and the booking-lifecycle consumers (C4/C8/C9). No B-phase task provisions it; B2's verify check does not assert its existence. B2 cannot ship to staging without it. This is a planning gap, not a design flaw.

**Design (insert as implementation-plan task B0a, before B2):**
- Resource: `picasso-calendar-dispatch-${var.env}.fifo` SQS FIFO queue, provisioned via the R1-resolved `infra/modules/` Terraform pattern (new `infra/modules/sqs-calendar-dispatch/`), naming per R6.
- Dedup: `MessageDeduplicationId` = the consumer dedupe key already defined in the dispatch interface (`{event_id}:{last_calendar_mutation_at}`); `MessageGroupId` = `tenant_id` (per-tenant ordering, no cross-tenant head-of-line blocking). Content-based dedup off (explicit ID).
- Dead-letter queue `picasso-calendar-dispatch-dlq-${var.env}.fifo`, `maxReceiveCount` = 5.
- Queue policy: least-privilege — only `Calendar_Watch_Listener`'s execution role may `SendMessage`; only the consumer Lambdas' roles may `ReceiveMessage`/`DeleteMessage`. No `sqs:SendMessageBatch` in the resource policy (see `feedback_sqs_resource_policy_action_names`).
- Alarm: DLQ `ApproximateNumberOfMessagesVisible` > 0 → the **R5-resolved** staging topic `arn:aws:sns:us-east-1:525409062831:mfs-phase5-alarms`.
- Plan wiring: queue ARN becomes a B2 *entry precondition*; B-phase exit criteria gains a queue end-to-end smoke test (listener publishes → consumer stub receives → DLQ empty).

**Verification.** Terraform plan/apply in staging shows queue + DLQ + policy + alarm; smoke test: synthetic listener message is received by a consumer stub and deleted; a poison message lands in DLQ after 5 receives and fires the alarm.

**Sequencing.** Blocks B2. Author B0a now; it does not block sub-phase A.

---

## N2 — PII Remediation governance (F0 gate)

**Problem (at review time).** `docs/roadmap/CONSUMER_PII_REMEDIATION.md` was *Initiation 2026-04-27, owner TBD, not started* (21 days unchanged) — **now owned by Chris; see Decision below.** The implementation plan's F0 gate ("identity-driven deletion operational against the `Booking` table; cannot be waived") blocks the prod flag-flip. Separately, the widget's live "No personal information stored permanently" claim is an active FTC §5 deceptive-practices exposure that scheduling *compounds* (adds Bedrock CloudWatch prompt traces + `text_en`). This is a governance/PM decision, not engineering.

**Decision (ratified 2026-05-18).**
- **F0 scope = Path B.** Identity-driven hard-delete operational across the **full identity graph** — `Booking` + `picasso-form-submissions` + `picasso-notification-sends`/`-events` + `picasso-sms-usage` + the written Google Calendar event — plus the now-items (corrected FTC §5 widget claim, manual DSAR path, CloudWatch retention). The five conditions below are the F0 definition; "delete the Booking row only" is explicitly **not** F0.
- **Owner = Chris** (PII project owner; satisfies F0 (a)). Recorded in `docs/roadmap/CONSUMER_PII_REMEDIATION.md` Status: **started 2026-05-18; Path B operational target ≤ 2026-05-25** (F0 (a)/(b) evidence). Path A (full pipeline / tenant-#2 gate) keeps the charter's 4–6-week estimate.
- **Path A is a separate, parallel platform project**, owned by Chris — its own charter (`docs/roadmap/CONSUMER_PII_REMEDIATION.md`), platform-backend code (**not** the scheduling repo), promoted on its own staging→prod track. Path A gates **tenant #2 / Atlanta only — not Austin v1**.
- **Scheduling builds in parallel.** Only the **F1 prod flag-flip** waits on Path B being operational against the identity graph including `Booking`. Staging build + soak proceed unblocked.
- **Three coordination seams** (own them, don't ignore them): (1) the stable user identifier (PII Phase 1) is upstream — scheduling's `Booking`/token identity keying *consumes* it, does not invent its own; (2) Path A/B delete + retention logic must enumerate scheduling's added surfaces (`Booking`, the Google Calendar event, scheduling-Lambda CloudWatch traces); (3) F0 references "delete operational against the identity graph incl. `Booking`," owned by the PII project, verified at scheduling's F1.

The framework below is retained as the rationale that was weighed; it is now decided, not open.

**Design — decision framework (decided 2026-05-18 → Path B; retained as rationale):**

1. **Assign a named owner + committed start date** for PII Remediation. Without this, F0 is structurally unsatisfiable and v1 cannot legally flip prod.
2. **Choose F0 scope** (two viable paths):
   - **Path A — full `CONSUMER_PII_REMEDIATION`** (doc estimate 4–6 wk): stable identifier → delete pipeline → TTLs → DSAR → audit. Satisfies F0 and the tenant-#2 gate together.
   - **Path B — v1-minimal narrowing** (smaller, F0-only): identity-driven hard-delete on the `Booking` table + the existing form-submission/notification stores it references, built as a sub-phase F task; **plus** the two now-items below. Tenant #2 remains hard-gated on the full pipeline (Path A) regardless. PM review judged Path B a defensible narrowing.
3. **Now-items, independent of pipeline timing (do before any scheduling-enabled session is served):**
   - Correct or remove the widget's "No personal information stored permanently" claim (FTC §5 — true today, before scheduling).
   - Stand up a manual DSAR path (`privacy@myrecruiter.ai` + runbook).
   - Set explicit CloudWatch log-retention (e.g. 30 days) on `Bedrock_Streaming_Handler_Staging` + future scheduling Lambda log groups (bounds the prompt-trace PII surface; one-line IaC, not pipeline-gated) — security finding S-009.
4. **EU/UK exposure check:** confirm whether the Austin pilot's volunteer population could include EU/UK users. If yes, F0 must satisfy GDPR erasure on `Booking`, not "in principle." If domestic-US-only, regulatory risk is materially lower (the now-items still apply).

**Verification.** Owner + start date recorded in `CONSUMER_PII_REMEDIATION.md`. Chosen scope documented in the impl plan F0 criterion. Now-items closed before F1. F0 test: identity-driven delete request removes all `Booking`-linked PII for a synthetic user and an auditor confirms zero residue.

**Sequencing.** Owner/scope decision needed *now* (before sub-phase C finishes — that's when `Booking` starts holding PII). Now-items gate the first scheduling-enabled session. Pipeline completion gates F1/prod flag-flip and (Path A) tenant #2.

---

## N3 — Telnyx STOP-webhook timestamp replay window

**Problem.** `SMS_Webhook_Handler` validates the Ed25519 signature over `{timestamp}|{payload}` but never checks `telnyx-timestamp` against wall-clock. A captured valid STOP webhook can be replayed indefinitely to suppress a victim's SMS reminders across all tenants (TCPA-relevant). Net-new surface from the SNS→Telnyx migration; absent from the 2026-05-02 baseline review because that assumed SNS.

**Design.** Immediately after signature verification, reject when `abs(now_seconds - parseInt(telnyx_timestamp)) > 300` → HTTP 400, structured log line `telnyx_webhook_stale_timestamp` (no PII). Symmetric with the replay-window requirement the design already mandates for `Calendar_Watch_Listener` (B2). Small change; design-only here — implementation is a separate gated PR against the live staging Lambda.

**Verification.** Unit: stale timestamp (>300 s) → 400; fresh → 200; signature-valid + stale → still 400 (timestamp checked independently of signature). Replay test: a previously-valid captured request replayed after 6 min is rejected.

**Sequencing.** Hard gate before F1 (prod). Recommended before staging soak since the gap is live in staging now.

---

## N4 — Telnyx webhook public key → Secrets Manager + fail-closed init

**Problem.** `TELNYX_PUBLIC_KEY` loads from `process.env` with a `|| ''` default. An empty/replaced key makes signature verification return `false` and the handler **silently rejects all STOP/UNSTOP webhooks** — a silent TCPA-compliance failure on misconfigured deploy, and the key is exposed to any principal with `lambda:GetFunctionConfiguration`.

**Design.**
- Move the public key to Secrets Manager: extend the existing `picasso/telnyx` secret with a `webhook_public_key` field (or a dedicated `picasso/telnyx/webhook-public-key`). Load + cache at handler init alongside the existing Telnyx API-key fetch.
- Fail closed: if the key is absent or zero-length at init, **fail Lambda initialization** (throw) rather than booting into a state that silently rejects every webhook. A hard init failure is alarmable; silent reject-all is not.
- Apply the same CloudTrail/audit coverage the API key has. Document a rotation step in the Telnyx secret runbook.

**Verification.** Missing/empty key → Lambda init throws (observable as init failure + alarm), not a running function returning 200/silent-reject. Valid key in Secrets Manager → handler verifies signatures normally. Rotation runbook step exercised once in staging.

**Sequencing.** Hard gate before F1 (prod). Pairs naturally with N3 (same handler, same PR boundary).

---

## Appendix — other review findings (tracked, out of this remediation's scope)

Carried for traceability; resolve during the relevant sub-phase, not here.

- **N5 (architect F-03, High)** — shared JWT signing-key + dual-key layer refactor blast radius = all platform auth. Sub-phase D must deploy the refactored layer to `Scheduling_Handler` first, run the chat-session JWT smoke suite in isolation, then update `Master_Function_Staging`; verify no existing prod chat token omits/mismatches `iss` before enforcing it.
- **N6 (architect F-04/F-05, High)** — add `rescheduled_old_event_id: string?` to the canonical `Booking` model (additive, forward-compat read) at A8c; add the "calendar `events.insert` OK / `Booking` DDB write failed → delete calendar event, else `orphan_calendar_event` + nightly reconciler" failure mode to §5.5.
- **N8 (security S-004/S-006, Medium)** — `Scheduled_Message_Sender` consumer must enforce `dynamodb:LeadingKeys` to its own tenant prefix (cross-tenant SMS-billing risk); E8 stop-gap TTL contradicts SMS plan's "No TTL" TCPA retention — remove the TTL, defer disposition to PII Remediation carve-out.
- **N9 (architect F-09, doc bug)** — align canonical §13.7/§16 (informal "keyed by `jti`") to the shipped composite key (`tenantId` PK + `jti` SK) per the runbook and schema §10.
- **Security S-003/S-010/S-011** — `iss` mismatch as first-class D-exit security smoke test; consider 14→7-day `post_application_recovery` window; make the listener 100/min rate-limit a per-tenant config param.

Full consolidated gap matrix: 2026-05-18 review session output.

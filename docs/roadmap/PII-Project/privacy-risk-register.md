# Privacy Risk Register (D5)

**Phase 0.5 deliverable D5.** Established 2026-05-20. Table form, **17 rows** (11 G-rows + 4 F-rows seeded at Phase 0.5 + 2 F-DSAR rows added 2026-05-20 from the DSAR Lambda item-1a audit). Pre-seeded with the 11 gaps from the 2026-05-19 plan-gaps review (G-A..G-K) plus 4 new rows for the highest-priority D2+D3+D4-surfaced findings that don't map cleanly into a G-row. Each row carries a **named owner**; no unmitigated H/H row is ownerless.

> **Method:** consolidate prior enumeration. The 16 findings in D2+D3 + the Tier-vs-lifecycle gaps in D4 + the 11 gaps in the plan-gaps review + horizontal concerns surfaced by advisors are condensed into the row budget. Where a single risk has multiple findings as evidence, those are listed in the **Surface(s) / evidence** column. D5 is **the consolidation point**, not a re-derivation.

> **Done-bar (verbatim from plan):** *"each G-A..G-K gap has a row, and no unmitigated H/H row lacks a named owner."*

> **L × I semantics — no false precision.** H/M/L only. No numeric scoring. **Likelihood** = how likely is the risk to materialize in the next 12 months given current state. **Impact** = severity if it materializes (regulatory fine, FTC §5 enforcement, tenant churn, reputational, breach-notification). **L × I = "L/I"** in the table cell.

> **Owner semantics.** "Chris" = Chris Miller (Founder), the program owner. "Counsel-pending-on-trigger" = the answer comes from the Step 8 counsel package (PR #153), but **engagement is held until a real-party trigger fires** (see "Counsel triggers" below). "Path B" = the scheduling-session-owned now-items track (not in this program's direct ownership). "Closed" rows have already been remediated and are kept as audit trace, not active risks.

> **Counsel-engagement trigger list (program-wide).** The counsel input package (PR #153) is a **prepared artifact, held until a real-party trigger fires**. Triggers — any one:
> 1. Tenant signs an LOI / requests a DPA / demands a privacy attestation in vendor diligence (e.g., Atlanta tenant-#2).
> 2. A DSAR (consumer rights request) arrives requiring a substantive response.
> 3. A regulator inquiry arrives in any form (subpoena, CID, informal letter, attorney-general request).
> 4. A new product feature crosses a sensitivity threshold (explicit health-data handling; eligibility decisioning; payment instrument storage; minor-targeted flows).
> 5. A material commercial event (large foundation, healthcare-adjacent partner, enterprise customer) demands legal sign-off as part of onboarding.
>
> Engaging counsel today, absent these triggers, would be process theater. Counsel hours are bounded; engaging on hypotheticals produces memos that may shift before any trigger actually fires. The proportionate posture: package ready, triggers named, engage on first event.

> **Capability-now posture (the project delivers operational capability for what we collect today, regardless of trigger state).** Per the `compliance-implementation-advisor` fulfillment workflow review, the platform can respond to a DSAR today via the operator workflow below; what's missing is the artifacts that turn capability into ready-to-execute procedure. **Step 10 re-baseline names the DSAR tool + SLA alarm + Gmail config as the single remaining engineering deliverable.** Day-1 docs artifacts land in this PR alongside D5. See "Operational fulfillment workflow" below.

---

## Risk register

| # | Risk | Surface(s) / evidence | Tier (D4) | L × I | Current mitigation | Gap | Owner | Target action |
|---|---|---|---|---|---|---|---|---|
| **G-A** | **Live false widget claim** ("✅ No personal information stored permanently") + form-submissions persist forever (no `ttl` on `_store_submission`) → FTC §5 deceptive-practice exposure. | `Picasso/src/components/chat/StateManagementPanel.jsx:535` (claim); `picasso-form-submissions-staging` + `form_handler._store_submission` (persistence). Step 5 verification 2026-05-20 ([memory](../../../)). | 3 | **H / H** | None — both halves verified open in prod 2026-05-20. | UI claim is verifiably false today. | **Path B** (scheduling-session track) | (1) Path B ships widget-claim correction to chat.myrecruiter.ai; (2) Path B adds `ttl` write to `_store_submission` on lambda main. Verification re-run after Path B claims completion; row stays open until BOTH confirmed live in prod by independent re-check. |
| **G-B** | No living data-inventory process → surfaces accumulate without governance (Meta surfaces post-dated the original charter, etc.). | All §B/§C/§D surfaces. | n/a | M / H | **CLOSED** — CLAUDE.md PR rule from PR #148 (any PR adding DDB/Lambda/S3 PII surface must update inventory + tier in D4); D2 snapshot in PR #150. | None — closed by Phase 0.5 deliverables. | Closed | Audit-trace; no further action. Re-open if the PR rule is violated in practice. |
| **G-C** | Backup / PITR / S3-versioning / archive-bucket residue persists deleted data beyond delete-pipeline reach → "reasonable steps" question for counsel; auditor's immediate question under GDPR Art 17. | DDB PITR 35-day on every PII table (D2 Finding 10); S3 versioning on `myrecruiter-picasso{,-staging}` + `picasso-widget`; `ARCHIVE_BUCKET` archive of OLD_IMAGE session-summaries (D3 Finding 14). | 3 (across surfaces) | M / M | Apply-1 scaffold; no remediation. | No documented "reasonable steps" position; archive-bucket reachability undetermined. | **Counsel-pending-on-trigger** (S5 supplementary in PR #153) + **Chris** (operational verification post-counsel) | Counsel response on S5 → documented position + Step 10 roadmap update. Verify `ARCHIVE_BUCKET` name/region/encryption/lifecycle (D3 open item). |
| **G-D** | DSAR response-deadline data field exists with no enforcer — no SLA alarm, no escalation, no named backup handler → CCPA 45-day / GDPR Art 12(3) 1-month miss risk. | Path A historical design (§response handling); platform has not yet received a DSAR. | n/a | H / M | None today (no DSAR volume). | No SLA mechanism even at zero-volume. | **Chris** | One CloudWatch alarm or daily cron: any `pending` DSAR within 5 days of `intake+30d` emails owner; runbook names a backup handler. Small. Land alongside Apply-2 of Path A or sooner. |
| **G-E** | Counsel engagement gate has no owner / date / input package → tenant-#2 gate can never be satisfied (counsel lead time 3–4 weeks). | Original Path A roadmap. | n/a | n/a | **CLOSED** — Step 8 input package merged (PR #153), owner=Chris, send date will be recorded at engagement initiation. | None — closed by package merge. | Closed | Audit-trace; reopen if package is never sent. |
| **G-F** | DSAR access / portability (read side) under-designed vs delete — 2 sentences vs a 490-line delete design; same 45-day deadline. | Path A historical design. | n/a | M / M | None — Phase 4 of Path A is unbuilt. | Export coverage definition + surface list mirroring delete allow-list is missing. | **Chris** | 2-paragraph Phase-4 "export coverage" doc; mirror the delete allow-list. NOT new machinery — written definition only. Land when re-baselined Path A roadmap (Step 10) names Phase 4. |
| **G-G** | "Under-match approach is compliant" is an engineering risk-acceptance with no counsel cover; pushes completeness burden onto the data subject (alternate-identifier self-declaration). | Path A delete-walk design; D2 Finding 12 (Meta-PSID gap) makes this worse for Meta-only subjects. | 3 (data); 4 (access privilege) | H / M | None — engineering assertion only. | No counsel sign-off on "reasonable steps." | **Counsel-pending-on-trigger** (Q3 primary in PR #153) | Counsel response on Q3 → record determination in memo + Step 10 roadmap update. If counsel rejects under-match, redesign Phase 2 identity walk. |
| **G-H** | `picasso-employee-registry-v2-staging` (tenant-operator PII) scoped out of Path A with no documented legal basis. CPRA (2023) removed the employment exemption; CA employees now have full consumer rights. | `picasso-employee-registry-v2-staging` (D2 §B; D4 Tier 2). | 2 | H / M | None — `NOT-CONSUMER` scope flag in D2 is an internal classification, not a legal determination. | No counsel determination of rights-allocation between MyRecruiter and tenant employer. | **Counsel-pending-on-trigger** (Q2 primary in PR #153) | Counsel response on Q2 → determine if MyR has rights-fulfillment obligations; if yes, expand Path A scope. |
| **G-I** | No privacy-notice / point-of-collection disclosure determination. Controller/processor posture (tenant=controller; MyR=processor) is **assumed, not legally determined**. Affects every consumer-facing surface. | All inbound widget POSTs (D3 §F); tenant-config disclosure obligations (D3 §3). | 3 | **H / H** | None — silent assumption. | No CCPA/CPRA controller-processor determination; no compliant point-of-collection notice. | **Counsel-pending-on-trigger** (Q1 primary in PR #153) | Counsel response on Q1 → categories-of-obligations list → draft privacy notice + DPA + tenant disclosure in separate workstream. |
| **G-J** | `picasso-audit-staging` holds identifiers, retained for audit integrity, untouched by Path A delete → needs documented GDPR Art 17(3)(b) ("legal claims") basis, not just an "audit integrity" category label. | `picasso-audit-staging` (D2 §B / §H carve-out). | 2 | M / M | TTL-aged-out via `retention_expires_at` (writer-set). | No written Art 17(3)(b) basis. | **Chris** + **Counsel-pending-on-trigger** (advisory) | 2 paragraphs in the re-baselined Path A roadmap (Step 10) citing Art 17(3)(b) and the audit-integrity exception — land in Step 10. |
| **G-K** | Analytics surfaces "may carry PII attrs" — D2 Finding 3 + D4 rule 3a (sensitive-topic labels in intent signals). Classification is presumptive TTL-ONLY pending a spot-audit that has not run. | `picasso-session-events-staging` (D2 §B); `picasso-analytics-events-staging` S3 (D2 §C); intent signals (`donate_now`, `volunteer_application`, `chat_topic_classified: housing_assistance`, etc.). | 2 floor; 3 if rule 3a fires | M / M | TTL on the DDB rows; CMK on the S3 bucket. | Spot-audit unrun. If sensitive-topic labels are joined to session_id, rule 3a fires → Tier 3 + delete-scope expansion. | **Chris** | 10-file grep spot-audit of event payloads pre-Apply-2 (gate). If matchable identity attrs OR sensitive-topic labels present → reclassify to Tier 3 + add to delete walk. |
| **F9** | **Tenant-configured downstream destinations** (n8n / Sheets / CRMs / webhooks + per-tenant conditional S3 fulfillment buckets). Full Tier 3 form PII leaves the platform to destinations the **tenant (as controller)** has chosen — outside MyRecruiter's sub-processor scope. **Donor-class submissions (D4 rule 8 confidentiality) are a distinct mitigation framing.** | D2 Finding 9 + D2 Finding 8 (per-tenant fulfillment); D3 §G; D4 rule 8. | 3 (both content + confidentiality origins) | **H / H** | Partial: `tenant-sink-deletion-request.md` template (PR #154) coordinates DSAR with tenant. | Three load-bearing parts not yet complete: (a) MyR-published sub-processor list; (b) tenant DPA language requiring tenant DSAR-honor at downstream destinations; (c) counsel determination on Q1 (processor/controller posture). | **Chris** (a + c structurally) + **Counsel-pending-on-trigger** (Q1 in PR #153 + donor-disclosure S5) | **Three-part mitigation per Step 10 v3 re-baseline** — see `CONSUMER_PII_REMEDIATION.md` v3 §"Per-D5-row closure" F9 row. (NOTE: prior framing as "vendor inventory" conflated MyR-subprocessors-of-MyR with tenant-controlled-downstream-of-tenant; corrected 2026-05-20 in Step 10 re-baseline.) |
| **F11** | Apply-1 CMK (`kms-pii-staging`) exists but is applied to **no Tier 3 table**. All Tier 3 DDB rows remain SSE-DDB (AWS-owned key). Strategy doc Tier 3 control "restrict access" + Tier 4 "secrets manager" not yet met by encryption posture. | All Tier 3 DDB tables (D4 §B); D2 Finding 11; Apply-1 audit (memory). | 3 / 4 | M / H | Apply-1 scaffold (CMK + 3 IAM roles); CMK on no table yet. | Apply-2 deferred indefinitely pending Phase 0.5 outcome. | **Chris** (Apply-2 design gate) | Apply-2 design gate weighs CMK scope using D4 tier-map. Apply-2 preconditions G-3..G-7 must be satisfied before apply. Re-baselined Path A roadmap (Step 10) names Apply-2 disposition. |
| **F12** | **Meta-PSID → `pii_subject_id` mapping not represented.** Phase-1 lookup index keys on `normalized_email` only; Meta-only subjects (chatted via Messenger; never submitted email-bearing form) are currently **unreachable** by the Phase-1 identity walk. | `picasso-pii-subject-index-staging` PK schema; PSID-keyed rows in `staging-recent-messages`, `staging-conversation-summaries`, `picasso-channel-mappings-staging` (D2 §B; D3 Finding 12). | 3 (data) | H / M | None — gap discovered at D2/D3. | No PSID→subject-id linking design exists. | **Chris** | Design input for the re-baselined Path A roadmap (Step 10) + counsel Q3 (G-G) bears on this directly. If Q3 accepts under-match, a PSID-aware identity-graph extension lands as a Phase 2 add-on; if Q3 rejects, full redesign. |
| **F13 + F15** | **Bedrock-output surfaces:** (a) prompt persistence if account-level model-invocation logging is enabled (Finding 13, unverified); (b) AI response content-quality risk distinct from prompt persistence — hallucination / prompt-injection / KB-verbatim leak / solicitation/tax/eligibility claim risk (Finding 15); (c) KB content uploaded by tenants may embed PII and leak adjacent (Finding 16). | D2/D3 Findings 13, 15, 16; D4 §E. | 3 | M / H | (a) verified unset in IaC, account-level state unverified; (b) no content-quality controls beyond prompt design; (c) tenant KB hygiene is tenant-controlled. | Account-level Bedrock logging unverified; no content-quality SLA or hallucination-detection; KB hygiene contract absent. | **Chris** + **Counsel-pending-on-trigger** (S1, S2, S4 supplementary in PR #153) | (1) Verify `aws bedrock get-model-invocation-logging-configuration` per region in both accounts; (2) document AI-response-quality risk row owner; (3) KB-hygiene tenant contract = second-wave deliverable. |
| **F-DSAR1** | **Pre-Phase-1 form-submission rows lack `pii_subject_id`** → DSAR walker (form-submissions) misses any submission written before lambda #130 merged 2026-05-18. Subject deletion appears successful but a pre-Phase-1 row class remains, in tension with the Art 17 erasure obligation. | `picasso-form-submissions-staging` (D2 §B; D4 Tier 3); `Lambdas/lambda/picasso_pii_dsar_staging/lambda_function.py:_walk_form_submissions` coverage gap; theoretical-to-operational graduation triggered by DSAR Lambda landing 2026-05-20. | 3 | M / M | DSAR Lambda emits an explicit `manual_followup` on every invocation with a copy-pasteable `aws dynamodb scan --filter-expression 'submitter_email = :e ...'` CLI snippet substituting the operator's email + tenant_id (audit fix-now #3, 2026-05-20). Subject-not-found path emits the same snippet so pre-Phase-1 subjects get an actionable fallback even when the index returns null. | Procedural mitigation only — pre-Phase-1 rows are not reached by the automatic walker. Operator must execute the manual Scan from the followup. Durable fix = Apply-2 backfill of `pii_subject_id` onto pre-Phase-1 rows (deferred per Decision A / Phase 2 Apply-1 audit). | **Chris** | Operational: confirm Apply-2 backfill is named as a precondition for "all Phase-1-and-later rows reachable via Lambda alone" in the re-baselined Step 10 (item 1a / capability bundle). Until Apply-2 ships, the manual fallback in the DSAR Operator Playbook (deliverable item 7) is the standing procedure. **Severity remains H/H by impact when a pre-Phase-1 subject DSAR arrives**; M/M reflects expected DSAR frequency at current volume. |
| **F-DSAR2** | **DSAR Lambda IAM `DeleteItem` not bounded to operator-requested `tenant_id` via `dynamodb:LeadingKeys`** — tenant isolation is enforced in walker code only. A walker bug or compromised request payload could in principle trigger cross-tenant deletion within the surfaces the role can reach. | `infra/modules/lambda-pii-dsar-staging/main.tf` §`FormSubmissionsReadDelete` + walker `KeyConditionExpression` uses request `tenant_id` as PK; audit fix-now item #1 (Security advisor F-5) flagged the residual gap 2026-05-20. | 3 | L / H | Code-only tenant isolation: walker's `KeyConditionExpression = Key("tenant_id").eq(tenant_id)` bounds Query to one partition; `DeleteItem` Key includes the row's PK (recovered from the bounded Query). 4 dispatcher tests + 7 walker tests assert tenant boundaries hold (`Lambdas/lambda/picasso_pii_dsar_staging/test_dsar.py`). Operator workflow places a human in the loop on every invocation (`dry_run=true` default). | No IAM-level guard. **Dynamic per-request tenant_id is not expressible as a static IAM condition** — static `dynamodb:LeadingKeys` enumeration of all tenant_ids defeats isolation; per-tenant assumed-role pattern adds an STS hop + per-tenant role provisioning (over-engineered at <50 tenants); session-policy at invoke-time requires operator to construct policy per call (operationally fragile, error-prone). | **Chris** | **Documented as accepted residual risk under L/H Phase 0.5 posture.** Revisit triggers (any one fires): (a) tenant count crosses 50; (b) cross-tenant near-miss observed in integration tests (item 6); (c) operator role expands beyond Chris (multi-operator deployment); (d) any post-incident finding implicating cross-tenant blast radius. On trigger fire, design assumed-role pattern + ABAC migration. |

---

## Operational fulfillment workflow (per `compliance-implementation-advisor` review, 2026-05-20)

This section is the **how**: what the operator (Chris) actually does when a request arrives. Designed for zero-volume / solo-founder scale. Operational posture = `Gmail + AWS CLI + DSAR Lambda + 6 markdown templates`. No custom UI; no ticketing system; no portal.

### Workflow (numbered, end-to-end)

1. **Intake.** `privacy@myrecruiter.ai` alias → Chris's Gmail. Filter routes inbound mail to label `dsar/open`. Published in tenant DPAs + consumer-facing widget privacy notice + marketing site footer. Mailed letters scanned into the same Gmail thread.
2. **Triage.** Open a new row in [`dsar-log.md`](./dsar-log.md). Decide: is this a DSAR? Which right? Which jurisdiction? Which tenant? Authorized agent (counsel-for-subject)?
3. **Verification.** Per [`dsar-verification-posture.md`](./dsar-verification-posture.md) — interim "reply-from-on-file-email + one corroborating fact for mismatches" posture (counsel-reviewed at trigger).
4. **Execution.** `aws lambda invoke` with payload `{subject_identifier, identifier_type, request_type, tenant_id, operator, dsar_id, dry_run}`. Lambda dry-runs by default; operator reviews `rows_touched` preview; re-invokes with `dry_run=false`.
5. **Manual-followup tickets.** Lambda returns a `manual_followups` array. For Finding 9 (tenant sinks): operator emails tenant admin using [`templates/tenant-sink-deletion-request.md`](./templates/tenant-sink-deletion-request.md). For Finding 12 (PSID): tenant-scoped DDB Scan or operator gets PSID from Meta Business Suite. For Finding 14 (ARCHIVE_BUCKET): operator runs the recorded reachability procedure from [`archive-reachability-decision.md`](./archive-reachability-decision.md).
6. **Response to subject.** Gmail reply on the same thread with one of [`templates/dsar-response-access.md`](./templates/dsar-response-access.md), [`templates/dsar-response-delete.md`](./templates/dsar-response-delete.md), or [`templates/dsar-response-no-record.md`](./templates/dsar-response-no-record.md). JSON attachment for access / export.
7. **Audit.** Three layers: Lambda's audit row in `picasso-pii-dsar-audit-staging` + `dsar-log.md` row (closed status) + Gmail thread retained under label `dsar/closed`.
8. **SLA mechanics.** EventBridge → SNS → email alarm fires at intake+25d for any open row. Google Calendar belt-and-suspenders reminders at intake+21d / intake+38d.
9. **Escalation triggers (engage counsel).** Subject contests verification; novel authorized-agent claim; cross-border element; tenant refuses Finding-9 sink deletion; subject asserts model-training; controller-vs-processor conflict; 3+ concurrent open DSARs.

### Day-1 artifacts (what must exist for the workflow to be operational)

| Artifact | Type | Status |
|---|---|---|
| **`picasso-pii-dsar-staging` Lambda + IaC** — operator-invocable; takes `{subject_identifier, identifier_type, request_type, tenant_id, operator, dsar_id, dry_run}`; walks D2, executes via Apply-1 IAM role, writes audit row, returns rows-touched + manual-followups | Code | **Next** — single Path A engineering deliverable (post-Phase-0.5) |
| **6 markdown templates** — `dsar-response-{access,delete,no-record}.md` + `dsar-verification-request.md` + `dsar-refusal.md` + `dsar-extension-notice.md` + `tenant-sink-deletion-request.md` | Docs | **Phase 0.5 / this PR** |
| **`dsar-log.md`** — flat ledger schema; one row per request | Docs | **Phase 0.5 / this PR** |
| **`dsar-verification-posture.md`** — interim verification standing language; counsel-reviewed at trigger | Docs | **Phase 0.5 / this PR** |
| **`archive-reachability-decision.md`** — one-shot CLI verification result for `ARCHIVE_BUCKET` posture | Docs (records CLI output) | **Phase 0.5 / this PR** |
| **`bedrock-invocation-logging-decision.md`** — one-shot CLI verification result for account-level Bedrock logging | Docs (records CLI output) | **Phase 0.5 / this PR** |
| **EventBridge SLA alarm** (G-D enforcer) — scans `picasso-pii-dsar-audit-staging` daily for open rows nearing SLA; SNS → email | Infra | **Next** (alongside Lambda) |
| **Gmail `privacy@` alias + `dsar/{open,awaiting-verification,closed}` labels + filter** | Operator config | **Next** (Chris sets up directly; no repo artifact) |

### What this changes about counsel triggers

The fulfillment workflow runs **without counsel**. Counsel is the escalation path (workflow §9), not the routine path. Engaging counsel pre-trigger remains process theater; engaging on the escalation conditions above is the right use of counsel hours.

---

## Cross-cutting horizontal concerns (named here so they aren't lost; not separate rows — they are facets that bear on G-A / G-G / G-I / F9 above)

- **Vulnerable-population content class** (foster/adoption, DV shelters, hospice, recovery; Austin Angels reference tenant). Form-data free-text from these tenants may contain disclosures about minors, crisis, health, housing, immigration even when no field is labeled as such. **Affects every Tier 3 row in this register** by elevating the impact column from "M/H" toward "H/H" in practice. D5 records this here rather than as a 16th row because no single surface owns it — it is a property of the tenant population.
- **Donor confidentiality vs sensitive-content (D4 rule 8).** Donor-class data is Tier 3 by confidentiality even when payload carries no sensitive-content. D5 row F9 carries both framings; the mitigations differ (sensitive-content = redact + restrict; confidentiality = pseudonymize + audit access).
- **Tier 3 controls vs current posture (D4 Tier-vs-lifecycle gaps subsection).** The strategy doc's Tier 3 controls ("redact logs; restrict access; shorter retention; human handoff rules") are NOT currently met on the Tier 3 surfaces (no log redaction; no CMK on Tier 3 tables; long retention on form-submissions). This is distributed across rows G-A (logs), G-C (retention), F11 (encryption).
- **Recipient-list inclusion of staff emails in tenant config** = operator PII flowing to operator readers (D3 §3). Folded into G-H scope (operator-PII rights determination).

---

## Verification (mechanical exit-criteria check)

- ✅ **Each G-A..G-K gap has a row** (11 rows).
- ✅ **Row count: 17 rows** (11 G-rows + 4 F-rows seeded at Phase 0.5 + 2 F-DSAR rows added 2026-05-20 from DSAR Lambda item-1a audit). Original ≤ 15 cap superseded once theoretical gaps graduated to operational on Lambda landing.
- ✅ **No unmitigated H/H row lacks a named owner:**
  - G-A H/H → Path B
  - G-I H/H → Counsel-pending
  - F9 H/H → Chris + Counsel-pending
  - F-DSAR1 L/I = M/M today (expected frequency low); H/H by impact when triggered — owner Chris.
  - F-DSAR2 L/I = L/H — owner Chris; documented residual risk with named revisit triggers.
- ✅ **Closed rows preserved as audit trace** (G-B, G-E).
- ✅ **All columns populated** for every row.
- ✅ **No new policy invention** — D5 records risks + named target actions; specific mitigation design lives in Step 10 / Apply-2 / second-wave.
- ✅ **No Decision A or B pre-decisions** — F9 explicitly flags Decision A as input at Step 10.

## What this register feeds

- **Step 10 (re-baseline `CONSUMER_PII_REMEDIATION.md`)** consumes this register as **the prioritization input**. Path A phases re-ordered to address H/H rows first (G-A via Path B coordination; G-I via counsel; F9 via Decision A). Rows G-B and G-E are closed; rows G-C, G-J, F11, F12 inform Apply-2 preconditions.
- **Step 11 (Phase 0.5 closeout)** records (a) which gaps closed in Phase 0.5 (G-B, G-E); (b) which rows have new named owners (all of them); (c) which rows are counsel-pending (G-G, G-H, G-I + supplementaries); (d) the named **next concrete Path A action** that this register surfaces.
- **Counsel response (when it arrives)** will update G-G / G-H / G-I + the supplementary rows tied to S1–S5 in PR #153. Re-baseline + closeout reference this register; the register itself is updated in a small focused PR when counsel responds.

## Open items deferred from D5

| Item | Why deferred | Where it goes |
|---|---|---|
| Per-tenant vendor inventory (second-wave) | Out of Phase 0.5 scope per plan; named in Step 11 closeout. | Second-wave deliverable. |
| Live-state reconciliation of D2 inventory vs runtime AWS | Apply-2 precondition; Phase 0.5 is IaC-truth. | Apply-2 design gate. |
| `ARCHIVE_BUCKET` posture (name/region/encryption/lifecycle) | D3 open item; requires live AWS inspection. | Apply-2 precondition or operational verification. |
| F14 archive-bucket retention design (delete-reachability) | Decision A input at Step 10. | Step 10. |

---

## Links

- Plan: `~/.claude/plans/let-s-work-on-the-cheerful-manatee.md` (Step 9)
- D1 charter: [`pii-project-charter.md`](./pii-project-charter.md)
- D2 inventory: [`pii-inventory.md`](./pii-inventory.md) — Findings 1–13
- D3 flow map: [`data-flow-map.md`](./data-flow-map.md) — Findings 14–16 + horizontal concerns
- D4 classification: [`data-classification.md`](./data-classification.md) — Tier-vs-lifecycle gaps + rule 8
- Counsel package: [`counsel-input-package.md`](./counsel-input-package.md) — Q1/Q2/Q3 + S1–S5
- Plan-gaps review (G-A..G-K origin): `memory/project_consumer_pii_remediation_path_a_plan_gaps_review_2026-05-19.md`
- Step 5 widget-claim verification (G-A evidence): `memory/project_pii_governance_phase05_step5_widget_claim_verification_2026-05-20.md`

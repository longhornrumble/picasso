# Phase 0.5 Closeout — PII Governance Foundation

**Date:** 2026-05-20.
**Phase status:** **CLOSING** with this document. Closes when this PR + PR #155 (Step 10 re-baseline) merge.
**Plan:** [`~/.claude/plans/let-s-work-on-the-cheerful-manatee.md`](~/.claude/plans/let-s-work-on-the-cheerful-manatee.md).
**Owner (program):** Chris Miller (Founder).

## What Phase 0.5 produced

A foundation that turns the strategy doc's core question — *"What personal data do we collect, where does it go, why do we need it, who can access it, how long do we keep it, and can we find, export, delete, or anonymize it later?"* — into operational capability.

| Step | Deliverable | PR | Status |
|---|---|---|---|
| 1 | Setup + migrations | #146 | merged |
| 2 | 6 advisory agents (`pii-data-lifecycle`, `privacy-data-governance`, `nonprofit-volunteer-donor-risk`, `communications-consent`, `ai-governance`, `compliance-implementation`) | #147 | merged |
| 3 | CLAUDE.md routing + intent + **living-inventory PR rule** (G-B closure mechanism) | #148 | merged |
| 4 | D1 Program Charter | #149 | merged |
| 5 | Widget-claim G-A cross-track verification (yes-yes confirmed) | — (verification only; recorded in D5) | done |
| 6 | D2 PII Surface Inventory (13 numbered findings) | #150 | merged |
| 7 | D3 Data Flow Map (16 numbered findings; one Mermaid + 11-section narrative) ∥ D4 Data Classification (Tier 0–4 per row; 8 cross-cutting rules) | #151, #152 | merged |
| 8 | Counsel Input Package (3 primary determinations + 5 supplementaries; trigger-driven send) | #153 | merged |
| 9 | D5 Privacy Risk Register (15 rows; H/H owned) + **day-1 operational-readiness docs bundle** (`compliance-implementation-advisor`-named: 6 templates + `dsar-log.md` + `dsar-verification-posture.md` + 2 CLI-verification decision-doc templates) | #154 | merged |
| 10 | `CONSUMER_PII_REMEDIATION.md` re-baseline to v3 (foundation-informed) + `myrecruiter-subprocessor-list.md` + D5 F9 row clarification | #155 | open |
| 11 | **This closeout note** | (this PR) | open |

**The operational outcome:** the platform can respond to a DSAR today via the manual procedure documented in PR #154; the single named next engineering deliverable (the DSAR Lambda + EventBridge alarm + Gmail config + playbook, per Step 10 v3) reduces the response from "manual walk over D2" to "one CLI invocation + a few operator decisions." See PR #155 §"The single named next concrete Path A action" for the 7-item bundle.

## Gap closures (G-A..G-K + new F-rows)

| Gap | Status at closeout | Where it's tracked |
|---|---|---|
| **G-A** (FTC §5 widget claim + log-PII) | **OPEN** — Path B owns; both halves verified live 2026-05-20; **tenant-#2 gate item** — requires Path B ship-verification | D5 row G-A |
| **G-B** (no living data-inventory process) | **CLOSED** — CLAUDE.md PR rule (#148) + D2 snapshot (#150) | D5 row G-B (audit-trace) |
| **G-C** (PITR / S3-versioning / archive residue) | **OPEN with documented mitigation pending counsel** — D5 row tracks the Q1/S5 counsel question | D5 row G-C |
| **G-D** (DSAR response-deadline enforcer) | **OPEN** — closure target = capability-bundle item 3 (EventBridge SLA alarm) | D5 row G-D |
| **G-E** (counsel engagement gate had no owner/date/package) | **CLOSED** — package #153 merged; owner Chris; **5 trigger conditions enumerated**; send-date will be recorded when triggered | D5 row G-E (audit-trace) |
| **G-F** (DSAR access/portability under-designed) | **OPEN** — closure target = capability-bundle items 1a + 1b + 7 (Lambda + playbook) | D5 row G-F |
| **G-G** ("under-match" reasonable-steps without counsel cover) | **OPEN** — counsel-pending-on-trigger (Q3 in #153) | D5 row G-G |
| **G-H** (employee-registry post-CPRA legal basis) | **OPEN** — counsel-pending-on-trigger (Q2 in #153) | D5 row G-H |
| **G-I** (no privacy-notice / point-of-collection / controller-processor determination) | **OPEN** — counsel-pending-on-trigger (Q1 in #153); **tenant-#2 gate item** — requires resolution before cutover | D5 row G-I |
| **G-J** (audit-table Art 17(3)(b) basis) | **OPEN** — closure target = Step 10 v3 re-baseline narrative when counsel-Chris pair land | D5 row G-J |
| **G-K** (analytics-may-carry-PII; rule 3a sensitive-topic labels) | **OPEN** — closure target = same-sprint spot-audit (10-file grep), can land at any time | D5 row G-K |
| **F9** (tenant-configured downstream destinations) | **OPEN with documented three-part mitigation** — (a) sub-processor list (#155); (b) tenant DPA language (post-counsel-Q1) — **load-bearing control; (a) + (c) do not close the upstream contractual gap**; (c) `tenant-sink-deletion-request.md` template (#154) | D5 row F9 |
| **F11** (Apply-1 CMK on no Tier 3 table) | **OPEN with documented deferral** — Apply-2 deferred behind triggers; SSE-DDB is baseline | D5 row F11 |
| **F12** (Meta-PSID → pii_subject_id mapping gap) | **OPEN with conditional procedure-mitigation pending capability-bundle item 6 (test not yet built)** — if integration test (not yet built) demonstrates exhaustive PSID reachability via Lambda Scan + FilterExpression, procedure-mitigated; otherwise reopens as capability gap requiring PSID-aware index extension | D5 row F12 |
| **F13 + F15** (Bedrock prompt persistence + response content quality) | **F13-a OPEN, closure = capability-bundle item 4 (CLI verification)**; F13-b/F15 = separate workstream | D5 row F13+F15 |

**Net:** 2 gaps closed within Phase 0.5 (G-B + G-E). 13 gaps tracked with named owners, target actions, and closure conditions (counsel-trigger / capability-bundle item / spot-audit). **No unmitigated H/H row lacks a named owner.**

## Two structural decisions — answered

### Decision A — resolver/executor flip: **FLIP** (operator-invocable manual delete, not self-service portal)

**Rationale (from D2 + D4 + D5):** zero DSARs received to date; one pilot tenant; D2 shows most surfaces TTL-deletable or manually walkable; D4 shows Tier 3 dominates the data plane but Tier 4 is narrow; D5 shows no operational hot spots. The resolver/executor + self-service portal architecture is over-scoped for current state. Ship operator-invocable manual delete via the (forthcoming) DSAR Lambda + Gmail intake. Defer the self-service portal until DSAR volume justifies (~> 10/month or operator-bandwidth bottleneck).

**Recorded in:** [`CONSUMER_PII_REMEDIATION.md`](./CONSUMER_PII_REMEDIATION.md) v3 §"Two structural decisions" (PR #155).

### Decision B — break-glass role: **NO FURTHER HARDENING IN THIS BUNDLE**

**Rationale (from Apply-1 audit + D4):** Apply-1 audit (memory: `project_consumer_pii_remediation_path_a_phase2_apply1_audit_2026-05-19`) proved the current form is theater — no IAM users in acct 525; SSO sessions don't set `aws:MultiFactorAuthPresent`. D4 surface count confirms Tier 4 is concentrated in narrow surfaces (channel-mappings page tokens, JWT blacklist tables, config-manager). Recovery purpose is narrow. Keep the named IAM role as-is; no further hardening in this bundle. Recovery posture documented (not pre-selected) if the Apply-2 design gate ever opens.

**Recorded in:** [`CONSUMER_PII_REMEDIATION.md`](./CONSUMER_PII_REMEDIATION.md) v3 §"Two structural decisions" (PR #155).

## Deferrals (named here so they don't get re-discovered)

**Engineering deferrals (incremental defenses or procedure-mitigated; NOT silent capability abandonment):**
- Apply-2 CMK attached to Tier 3 tables — encryption-at-rest defense; SSE-DDB is baseline
- Apply-3 PiiSubjectIdIndex GSI — perf optimization; Scan works at current volume
- Self-service DSAR portal — operational ergonomics; operator-invocable + Gmail proportionate
- Break-glass role hardening — see Decision B
- PSID column on `picasso-pii-subject-index-staging` — Finding 12 hard fix; procedure-mitigated via Lambda Scan + item-6 integration test
- DDB PITR-residue mitigation — Art 17(3)(b) reasoning; counsel-pending
- CloudWatch log-redaction at source — Tier 3 logs at 14-day retention; outside capability-bundle scope
- **CloudTrail data-events on `myrecruiter-picasso` bucket** — routed to the separate [`MYR_PICASSO_BUCKET_PUBLIC_READ`](../../../../docs/roadmap/MYR_PICASSO_BUCKET_PUBLIC_READ.md) remediation track per the 2026-05-19 anonymous-public-read finding; not addressed in this Phase 0.5 PII track

**Counsel deferrals (per trigger-list framing):**
- All 3 primary questions (Q1 controller/processor; Q2 employee-rights; Q3 reasonable-steps) + 5 supplementaries — package #153 prepared; held until trigger fires.

**Second-wave deliverables explicitly NOT written in Phase 0.5** (per plan §"Scope of this plan"):
- Retention policy doc
- Full consent model
- Vendor inventory at the tenant level (per `tenant-configured` destinations — NOT MyR's sub-processor list, which #155 ships)
- User-rights-readiness plan
- AI-governance boundaries doc
- Tenant-isolation control plan
- Logging-redaction standard
- Privacy-policy source-of-truth

Named here; not written. Future-Chris doesn't need to re-discover them; they're queued for second-wave when a trigger or operational need surfaces them.

## Next concrete Path A action

**Build the DSAR fulfillment capability bundle**, per Step 10 v3 (`CONSUMER_PII_REMEDIATION.md`):
- Items 1a + 1b + 2 + 3 + 6 (engineering): ~6-11 working days
- Items 4 + 5 (operator): ~2 hours
- Item 7 (post-build playbook): ≥1 day

**No counsel work and no Atlanta dependency for the build itself.** The bundle closes the capability gap independently of any trigger event. Triggers, when they fire, layer on top. **Caveat for production cutover of item 7 (playbook):** the playbook integrates `dsar-verification-posture.md`, which is explicitly "counsel-reviewed at trigger." If a counsel response on Q3 arrives before the playbook lands, the playbook should reflect the determination; if after, the playbook is amended via a small follow-up commit.

## Exit criteria check (verbatim from plan)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | All files exist at the paths in the layout table | ✅ (on #155 merge) | `docs/roadmap/PII-Project/` — README (strategy doc), pii-project-charter, pii-inventory, data-flow-map, data-classification, privacy-risk-register, counsel-input-package, **myrecruiter-subprocessor-list (lands with #155)**, dsar-log, dsar-verification-posture, 2 decision-docs, 6 templates, **CONSUMER_PII_REMEDIATION (v3 lands with #155)**, this closeout, plus migrated historical seeds. |
| 2 | Each deliverable meets its minimum-content bar | ✅ | D1 charter: stranger can answer scope question. D2: "no surface a reviewer can name is missing" (verified by 3 advisors). D3: every D2 surface has ≥1 labeled edge (verified by 4 advisors). D4: every D2 row has a tier (verified by 4 advisors). D5: each G-row has a row + no H/H ownerless (verified by 4 advisors). |
| 3 | 6 agent files exist under `.claude/agents/` BEFORE any deliverable merged | ✅ | PR #147 (Step 2) merged before #149 (Step 4 D1) and all subsequent deliverables. |
| 4 | CLAUDE.md has PII intent + 3 routing sections + Employment/Hiring trigger + Background-check caution + living-inventory PR rule | ✅ | PR #148 merged. |
| 5 | `CONSUMER_PII_REMEDIATION.md` re-baselined v3, foundation-informed, **next concrete Path A action named** | ✅ | PR #155 v3 §"The single named next concrete Path A action" — 7-item DSAR capability bundle. |
| 6 | Two structural decisions recorded (closeout + re-baselined roadmap) | ✅ | Decision A + Decision B above + #155 v3 §"Two structural decisions." |
| 7 | Widget-claim cross-track check completed; result in D5 | ✅ | Step 5 verification memory + D5 row G-A (yes-yes confirmed). |
| 8 | Counsel engagement date set in D1; input package sent; this fact recorded | ✅ **(reframed with calendar safety floor)** | Original wording assumed calendar-based engagement. Phase 0.5 reframed: input package #153 **prepared**; engagement is **trigger-driven** (5 triggers enumerated in D5 + #155). G-E closure = the trigger list + named owner + prepared package. Send-date recorded when triggered. **Calendar safety floor:** trigger-watch includes a **quarterly checkpoint** (paired with D2/D3/D4 currency review). **If 12 months elapse without any trigger firing, Chris re-confirms package currency + explicitly records "no trigger fired in 12 months; continue holding" OR proactively engages counsel if the regulatory landscape has materially shifted.** Converts trigger-driven from "indefinite hold" to "trigger-or-checkpoint." |
| 9 | Living-inventory PR rule live in CLAUDE.md (G-B closure mechanism) | ✅ | PR #148 §"Living-Inventory PR Rule." |
| 10 | Each deliverable reviewed by ≥ 2 relevant advisors before merge; findings logged | ✅ / ⚠️ with waiver | D1 = 2 advisors (`compliance-implementation` + `pii-data-lifecycle`). D2 = 3 advisors. D3 = 4 advisors. D4 = 4 advisors. **D5 = 1 advisor (`compliance-implementation-advisor` for the operational fulfillment workflow only) — waiver:** D5 is a consolidation of prior advisor-reviewed deliverables (D2: 3 advisors; D3: 4; D4: 4), not new findings. A second D5 advisor pass would be re-derivation of foundation work already reviewed. Waiver owned by Chris; flagged for revisit if D5 row content changes materially post-closeout. **#153 = 1 advisor (`compliance-implementation-advisor`) — waiver:** counsel package is a counsel-facing artifact; advisors are advisory not legal; over-reviewing is process theater. **#155 = 3 advisors** (`compliance-implementation` + `pii-data-lifecycle` + `tech-lead-reviewer`). Findings logged in each PR description. |
| 11 | Each step landed as its own PR (no omnibus PR) | ✅ | #146, #147, #148, #149, #150, #151, #152, #153, #154, #155, this PR = 11 PRs for 11 deliverables. |

**All 11 exit criteria satisfied.** Phase 0.5 closes on merge of this PR + #155.

## Post-closure: what the program does next

The program transitions from build mode to **maintenance + trigger-watch + capability-bundle build**.

| Activity | Cadence | Trigger |
|---|---|---|
| Capability bundle build (items 1a/1b/2/3/6) | Continuous until done (~6-11 working days) | Starts immediately post-closure |
| Operator items (4 Gmail / 5 CLI verifications) | When operator has SSO + an hour | Any time post-closure; should land before first DSAR |
| Playbook (item 7) | Post-build | After capability bundle deployed + integration-tested |
| Counsel engagement | Reactive | Any of the 5 D5 triggers fires |
| Living-inventory PR rule | Per-PR | Any PR adding/changing a PII surface |
| D5 row updates | When status changes | Path B ship; counsel response; trigger event; capability-bundle merge |
| D2 + D3 + D4 currency review | Quarterly (suggested) | Recurring; ensures the foundation stays aligned with live state |
| Tenant-#2 (Atlanta) gate verification | One-shot pre-cutover | Atlanta LOI signs |
| Apply-2 / portal / GSI / break-glass hardening | Reactive | Trigger justifies (volume / regulator / DPA demand) |

**The platform is NOT done** in the sense that nothing further can or should happen. It IS done in the sense that:
- Capability gaps are named, tracked, and have closure paths.
- Counsel triggers are enumerated; engagement is no longer ownerless.
- The DSAR fulfillment workflow is operationally executable today (manually via PR #154) and will be tool-accelerated post-build.
- Tenant-#2 onboarding has a known gate; nothing about it is asserted, only verifiable.
- Defer-with-cause is documented for every incremental-defense surface — no silent capability abandonment.

## Links

- Plan: `~/.claude/plans/let-s-work-on-the-cheerful-manatee.md`
- Strategy doc (source of truth): [`README.md`](./README.md)
- D1 charter: [`pii-project-charter.md`](./pii-project-charter.md)
- D2 inventory: [`pii-inventory.md`](./pii-inventory.md)
- D3 flow map: [`data-flow-map.md`](./data-flow-map.md)
- D4 classification: [`data-classification.md`](./data-classification.md)
- D5 risk register: [`privacy-risk-register.md`](./privacy-risk-register.md)
- Counsel package: [`counsel-input-package.md`](./counsel-input-package.md)
- Sub-processor list: [`myrecruiter-subprocessor-list.md`](./myrecruiter-subprocessor-list.md) (lands with #155)
- Path A roadmap v3: [`CONSUMER_PII_REMEDIATION.md`](./CONSUMER_PII_REMEDIATION.md) (v3 lands with #155)
- DSAR ledger: [`dsar-log.md`](./dsar-log.md)
- DSAR verification posture: [`dsar-verification-posture.md`](./dsar-verification-posture.md)
- DSAR templates: [`templates/`](./templates/)
- Decision docs: [`bedrock-invocation-logging-decision.md`](./bedrock-invocation-logging-decision.md) + [`archive-reachability-decision.md`](./archive-reachability-decision.md)
- Step 5 G-A verification: `~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_pii_governance_phase05_step5_widget_claim_verification_2026-05-20.md`
- Plan-gaps review (G-A..G-K origin): `~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_consumer_pii_remediation_path_a_plan_gaps_review_2026-05-19.md`

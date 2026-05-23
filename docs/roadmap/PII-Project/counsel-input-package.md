# Counsel Input Package — Picasso PII Governance, Phase 0.5

**Status:** **DRAFT** — prepared 2026-05-20 during Phase 0.5 Step 8. Pending review + send.
**Engagement type:** scoped advisory; **not** a full privacy-program retainer.
**Owner:** Chris Miller (Founder, MyRecruiter).
**Phase 0.5 closure trigger:** **the package being *sent* is what closes Phase 0.5 — not the response.** Phase 0.5 closes whether counsel responds in 3 days or 6 weeks.
**Expected turnaround:** 3–4 weeks async (target, not hard).
**Closes:** gap G-E from the 2026-05-19 plan-gaps review — counsel-engagement gate previously had no owner / date / input package.

> **This document is a cover briefing.** The substantive evidence is in the four attached primary deliverables (D1 charter, D2 inventory, D4 classification, historical delete-pipeline design). This page frames the three scoped questions and tells counsel what we are **not** asking.

---

## Who we are and what we built

MyRecruiter operates **Picasso**, an AI chat widget embedded on nonprofit websites. The widget supports volunteer interest capture, donor / supporter Q&A, contact forms, and conversational AI responses backed by AWS Bedrock + per-tenant Knowledge Bases. The platform is **B2B SaaS** to nonprofits (the tenants); consumer visitors (volunteers, donors, supporters) interact through the widget.

Scope of the program seeking advice is defined in the attached charter ([D1](./pii-project-charter.md)). What is in scope: consumer PII from chat conversations, form submissions, AI-generated content **about** data subjects, tenant-operator (employee) identities. What is out of scope: employee recruiting / FCRA / HIPAA-regulated workflows / GDPR as the primary applicable law (we monitor for EU subjects but do not market to or onboard EU tenants) / payment instrument storage.

We have completed an architectural foundation (Phase 0.5) — inventoried every PII surface ([D2](./pii-inventory.md), 13 numbered findings), mapped data flows ([D3](./data-flow-map.md), 1 Mermaid + 11 numbered narrative sections, 3 net-new findings), and assigned tier classifications ([D4](./data-classification.md), Tier 0–4 per surface). We have **paused** further engineering on the delete pipeline (Path A, Apply-1 scaffold only; no consumer data encrypted) until the three structural questions below are answered.

---

## The three scoped questions

### Question 1 — Controller / processor determination (gap G-I)

**Determination requested:** Under California privacy law (CCPA / CPRA), is MyRecruiter a **service provider / processor** with respect to consumer PII captured through the Picasso widget on tenant nonprofit websites — with the tenant nonprofit as the **business / controller** — and what **categories of obligations** does that posture produce on MyRecruiter (notice, contract, sub-processor, transfer)?

**Why we are asking:** the entire Path A delete pipeline assumes a posture (tenant = controller; MyRecruiter = processor) that has been **silently assumed, not legally determined**. The plan-gaps review flagged this as gap G-I. We need the determination so we can scope our delete-pipeline obligations, sign tenant DPAs with the right party-shape, and draft accurate disclosure language downstream.

**What we ship as evidence:** D1 charter (program scope) + D2 inventory (every surface where consumer PII enters / moves / exits MyRecruiter-owned AWS resources) + D4 classification (tier framework).

**What we are NOT asking:** we are not asking counsel to **draft** the privacy notice, the DPA template, the point-of-collection text, or the tenant-onboarding disclosure language. We are asking for the determination + the **categories** of obligations it produces. The drafting follows in a separate workstream.

---

### Question 2 — Employee-registry rights under CPRA (gap G-H)

**Determination requested:** The DynamoDB table `picasso-employee-registry-v2-staging` holds **tenant-operator** identities (email, Clerk user id) — the tenant nonprofit's staff who administer their Picasso configuration. CPRA (effective 2023) removed the prior employment exemption; California employees now have full consumer rights. Do MyRecruiter's tenant-operators (the nonprofit's staff using our admin portal) have CPRA consumer rights against **MyRecruiter** directly, against the **tenant nonprofit** (their employer) only, or both? And what rights-fulfillment obligations does that allocation produce on MyRecruiter as the data infrastructure provider?

**Why we are asking:** D2 classifies this table as `NOT-CONSUMER` for Path A scope, but the plan-gaps review (G-H) flagged the silent assumption. The Path A delete pipeline does not reach this table; if MyRecruiter has rights-fulfillment obligations on operator data, that scope expands materially. We need the legal determination before we scope Path A.

**What we ship as evidence:** D2 §B `picasso-employee-registry-v2-staging` row + D4 §B Tier 2 classification (consumer-PII-equivalent tier; scope-out is **independent** of tier per D4 rule 5).

**What we are NOT asking:** we are not asking counsel to advise on the tenant nonprofits' employer-side obligations to their own staff. We are not asking counsel to draft employee-facing notice text. We are not asking for a sub-processor assessment of Clerk (our auth provider) at this engagement. We are asking specifically what rights-fulfillment obligations flow back to MyRecruiter.

---

### Question 3 — "Reasonable steps" for the verifiable-request approach (gap G-G)

**Determination requested:** The Path A delete pipeline (historical [design doc](./PII_DELETE_PIPELINE_DESIGN.md)) uses an **under-match approach** — the delete walk is keyed on `pii_subject_id` (an opaque platform-generated identifier) and `normalized_email`. A data subject submitting a delete request via email-address-only **does not have to** produce a separate verified identifier; the platform deletes what matches the supplied email. Submissions for the same person under alternate emails or via Meta Messenger (PSID-keyed sessions; not currently linked to `pii_subject_id` — D2 Finding 12) are **not reached** by that request unless the subject self-declares them. Does this approach constitute **"reasonable steps"** under CCPA §1798.130, GDPR Art 12 (verification of identity), and FTC guidance on verifiable consumer requests?

**Why we are asking:** the plan-gaps review (G-G) named this as an engineering risk-acceptance with no counsel cover. The "under-match" approach pushes completeness burden onto the data subject (self-declaration of alternate identifiers). It is **defensible** — but the defense requires legal sign-off, not an engineering claim.

**What we ship as evidence:** historical [design doc](./PII_DELETE_PIPELINE_DESIGN.md) (§5 identity-contract + §7 delete-walk + §11 audit) + D2 inventory (every `DELETE`-scoped surface) + D2 Finding 12 (Meta-PSID gap — Meta-only subjects are currently unreachable by the email-keyed walk) + D3 §11 (future delete Lambda fan-out with the Finding-12 `?` edge) + D4 §A future-delete-Lambda Tier 4 row (cross-tenant read privilege).

**What we are NOT asking:** we are not asking counsel to redesign the identity graph (we are aware of Finding 12 and have several technical options). We are asking whether the under-match approach + alternate-identifier self-declaration is enough for "reasonable steps."

---

## Supplementary questions (kept tight — others deferred to the response cycle)

These are **secondary** — counsel may treat any of these as inputs to Q1–Q3 or defer. Per scope discipline we trimmed engineering-retention questions to the response-cycle queue.

| # | Question | Surfaced by |
|---|---|---|
| S1 | Are persisted Bedrock prompts (if model-invocation logging is enabled at the account level) in scope for the delete pipeline, and what is the acceptable retention? | D2 Finding 13 + D3 Finding 13 + D4 §E |
| S2 | Does AI-inferred conversation-summary content (D4 Tier 3, "AI-generated summaries about sensitive topics") trigger CPRA / GDPR Art 22 (automated individual decision-making) treatment even when used only for staff review? **Counsel may treat as a fourth primary determination if appropriate.** | D3 Findings 14 + 15 + D4 §B |
| S3 | Does cross-region Bedrock inference profile routing (us-east-1 + cross-region — unverified) constitute a cross-border transfer requiring SCCs / DPAs if GDPR data subjects are ever in scope? | D3 §2 + D4 §E |
| S4 | KB content uploaded by tenants may itself contain consumer PII (volunteer rosters, donor testimonials). What is the platform's vs. tenant's responsibility for KB hygiene? | D3 Finding 16 + D4 §C |
| S5 | Donor-class submission routing to tenant CRMs via webhook fulfillment — does this require disclosure in the widget consent text at form-submission time? | D3 §1 + D4 rule 8 |

**Out of scope for this engagement (queued for response cycle):** archive-bucket reachability framing (D3 Finding 14); DDB PITR 35-day retention posture (D2 Finding 10); recipient-list staff-consent (D3 §3); future intent / topic labels (D3 placeholder). These are retention-posture / engineering questions; we will surface them after Q1–Q3 land.

**Note on the FTC §5 live-claim exposure (Step 5 G-A verification):** the widget's "✅ No personal information stored permanently" claim is currently false in production (`_store_submission` writes no `ttl`). This is being corrected by the scheduling-track (Path B), not by Path A. **We are not asking counsel to quantify exposure here** — we are flagging it as a known condition that Path B is correcting. If counsel sees anything we should do *between now and Path B ship date* beyond accelerating that ship, please flag.

---

## Attachments

**Primary (the substantive evidence — please read in this order):**

| # | Document | What it answers |
|---|---|---|
| A | [D1 PII Project Charter](./pii-project-charter.md) | Program scope, ownership, advisory-vs-counsel boundary. |
| B | [D2 PII Surface Inventory](./pii-inventory.md) | Every surface where consumer PII enters / is stored / is logged / is transmitted. 13 numbered findings. |
| C | [D4 Data Classification](./data-classification.md) | Tier 0–4 per surface + 8 cross-cutting application rules + Tier-vs-lifecycle gaps subsection. |
| D | [Historical PII Delete Pipeline Design](./PII_DELETE_PIPELINE_DESIGN.md) | The under-match approach + identity graph + delete walk + audit. Apply-1 scaffold lives in staging acct 525. |

**Supplementary (read if helpful for context; not required):**

| # | Document | What it answers |
|---|---|---|
| E | [D3 PII Data Flow Map](./data-flow-map.md) | One Mermaid + 11-section narrative. Edges labeled with PII fields. 16 numbered findings. Useful for Q3 if the Meta-PSID identity-graph gap (Finding 12) needs visual context. |
| F | [Path A Roadmap (re-baseline pending)](./CONSUMER_PII_REMEDIATION.md) | Current Path A status; Step 10 will re-baseline after Q1–Q3 land. |

---

## Engagement scope (what we are and are not buying)

- **In scope:** Q1 + Q2 + Q3 determinations, with reasoning sufficient for us to defend our position to a regulator. Supplementary questions S1–S10 may be addressed at counsel's discretion or deferred.
- **Out of scope:** drafting privacy notice / DPA / tenant disclosures (we'll draft from your determination); GDPR cross-border SCC negotiation (deferred until S3 lands); engineering review (we have D2/D3/D4 + advisory agents); operational privacy-program retainer (separate engagement).
- **Response format:** written determinations on Q1 + Q2 + Q3 (any reasonable form — memo, letter, structured response). Supplementary may be inline or deferred.
- **Time budget:** 3–4 weeks async. We are not blocked on the response for Phase 0.5 closure (the package being **sent** is the closure trigger); we **are** blocked on it for any further Path A engineering and for tenant-#2 (Atlanta) onboarding.

---

## What we will do with the response

- Update D5 (privacy risk register, Phase 0.5 Step 9) with the closures + any new risks counsel surfaces.
- Re-baseline `CONSUMER_PII_REMEDIATION.md` (Path A roadmap, Step 10) with the next concrete Path A action informed by the determinations.
- Record the determinations in a memo within `docs/roadmap/PII-Project/` for audit traceability.
- Re-engage counsel on the supplementary questions if the determinations leave them open.

---

## Operational

- **Engaged counsel:** *(to be named when engagement is initiated)*.
- **Package send date:** *(to be recorded once sent — this date closes gap G-E)*.
- **Expected response by:** package-send-date + 4 weeks (target, not hard).
- **MyRecruiter point of contact:** Chris Miller (Founder).
- **MyRecruiter response capacity:** ≤ 5 business days to any clarifying questions from counsel.

---

## Internal references (not part of the counsel package)

The following are MyRecruiter internal documents referenced during Phase 0.5 preparation. They are **not** sent to counsel; listed here so this file is self-contained for internal audit traceability.

- Plan: `~/.claude/plans/let-s-work-on-the-cheerful-manatee.md` (Step 8 framing).
- Plan-gaps review (G-A..G-K origin): `memory/project_consumer_pii_remediation_path_a_plan_gaps_review_2026-05-19.md`.
- Strategy doc (program source-of-truth): [`README.md`](./README.md).
- Step 5 widget-claim verification: `memory/project_pii_governance_phase05_step5_widget_claim_verification_2026-05-20.md`.

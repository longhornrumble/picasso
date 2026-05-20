# PII Project Charter

**Phase 0.5 deliverable D1.** Established 2026-05-20. One-page program charter — establishes what this project is, what it's not, who owns it, and where the boundary between advisory agents and qualified counsel lies. Source of truth for everything in [`docs/roadmap/PII-Project/`](.).

> **This charter is an internal planning document. It is not legal advice and does not constitute a compliance determination.** Qualified counsel makes legal determinations; this charter prepares the inputs.

## Goal

*"Design MyRecruiter/Picasso so personal information is collected intentionally, stored minimally, protected by default, separated by tenant, retained only as long as needed, and easy to disclose, export, delete, or anonymize later."*

— verbatim user statement, 2026-05-19.

**Operational stance:** the design principles below are the standing rules for everything in scope. "Best efforts for legal compliance" is operational language for known-unknown areas (counsel hasn't ruled yet, regime applicability unclear); it is **not** a justification for accepting documented high-likelihood/high-impact risks without remediation.

## What this program covers

Picasso is an AI chat widget embedded on nonprofit websites. The PII this program covers (use cases first; surfaces named below):

**Use cases:**
- Nonprofit website chatbot conversations (chat transcripts).
- Volunteer interest capture (form submissions: name, email, phone, free text).
- Donor/supporter Q&A (chat content, optional contact info).
- Contact forms (intentional identifying submissions).
- Chat analytics events (structured events about conversations).
- Client/tenant admin / operator identities (the platform's tenant operators, including any employee-registry entries).
- AI-generated content **about** data subjects (conversation summaries, future intent/topic labels) — inferred PII.

**Surface classes** (D2 enumerates exact instances; this list is the row-class scope D2 must cover, not the inventory itself):
- All Picasso/MFS Lambdas that touch PII, **including their CloudWatch log groups**.
- All scheduling Lambdas that touch PII, including their log groups.
- All DynamoDB tables holding PII — **plus** their backup surfaces (point-in-time recovery, on-demand backups) and their streams.
- All S3 prefixes holding PII — including any versioning retention.
- Bedrock inputs (what PII reaches the model) **and** Bedrock outputs that are retained (AI summaries).
- Inbound integration sources (e.g., Meta webhooks carrying PSID + message content).
- Outbound integration destinations where Picasso transmits PII (SES, Telnyx, Bedrock, Meta Graph API, and any tenant-configured downstreams such as n8n, Sheets, CRM, nonprofit systems). **Note:** the strategy doc (`README.md`) names Bubble repeatedly — Bubble is no longer part of the platform; the strategy doc remains the historical source-of-truth and is not edited per the no-liberties discipline, but Bubble is **not** in scope here.

**"The data we control"** is a deliberate placeholder pending the controller/processor counsel determination (gap G-I: no point-of-collection / controller-processor determination has been made). Until counsel rules, this charter treats "data we control" as data MyRecruiter writes to or processes through MyRecruiter-owned AWS resources.

## Out of scope

Explicitly **not** what this program is solving today:

- **Employee recruiting**, applicant screening, resume processing, hiring decisions, interview scoring, ATS integration for paid roles, AI-assisted employment recommendations. Picasso does not recruit employees today. If that changes, see the Employment/Hiring Compliance Trigger in [`CLAUDE.md`](../../../CLAUDE.md) — separate counsel + employment-law/AI-hiring compliance review required before such features begin.
- **Employee-registry rights as a consumer-PII problem.** The `picasso-employee-registry-v2-staging` table holds tenant-operator identities, not consumer PII; CPRA removed the employment-exemption so employee rights are real but they are a **counsel-input** question (gap G-H), not a Path A delete-pipeline problem.
- **Background-check evaluation** (FCRA workflows) — Picasso does not evaluate, summarize, recommend, or rank based on consumer-report or background-check data. See Background Check Caution in `CLAUDE.md`.
- **HIPAA-regulated workflows.** Picasso does not operate in covered healthcare data flows today. State health-privacy statutes (e.g., Washington MHMDA) may still reach chat transcripts that incidentally contain health content — flagged as a counsel-input item, not pre-decided here.
- **Formal GDPR implementation.** EU/UK applicability is a counsel-input item, not a baseline assumption.
- **Payment instrument storage.** Picasso does not store card / bank account data. Stripe customer-id / billing-event metadata that the platform may route through `Stripe_Webhook_Handler` is **in scope** for the inventory but is identifying metadata not payment instruments — D2 enumerates exactly.
- **Specific privacy-regime prioritization.** Which state/federal regimes the program reads to (California, multi-state, EU, etc.) is a counsel-input determination informed by D2 and D4; it is **not** pre-decided in this charter.

## Owner, accountability, counsel engagement

- **Owner:** Chris Miller (Founder).
- **Counsel engagement:** initiated immediately after D2 (inventory) + D4 (classification) land — Phase 0.5 Step 8. Target window: **≤ end of week 2 from Phase 0.5 start** (target, not a commitment to a calendar date). Input package = D1 + D2 + D4 + the historical design doc. Three scoped questions: controller/processor determination (gap G-I), employee-registry rights under CPRA (gap G-H), and "reasonable steps" for the verifiable-request under-match approach (gap G-G). This closes the previously-unowned counsel-engagement gap (G-E from the 2026-05-19 plan gaps review — no owner / date / input package had been named).

## Advisory agents vs qualified counsel — the boundary

The six project-level advisory agents under [`.claude/agents/`](../../../.claude/agents/) are **advisory**, not legal. They do not provide legal advice, do not make legal determinations, do not declare MyRecruiter legally compliant, and do not replace counsel. They identify risks, recommend safer patterns, flag issues for attorney review, and convert findings into implementable work.

Qualified counsel makes legal determinations. The advisors prepare the inputs and accelerate the review; counsel signs off. The full advisory boundary is stated verbatim in `CLAUDE.md` under "Compliance and Governance Advisory Model" and in each advisor file under `.claude/agents/`.

## Relationship to Path A (and Path B)

This charter is the **program**. Picasso-platform-wide PII governance.

[`CONSUMER_PII_REMEDIATION.md`](./CONSUMER_PII_REMEDIATION.md) (Path A) is **one project** under this program — the identity-driven delete pipeline + retention TTLs + DSAR fulfillment for the surfaces in this charter's scope. Path A's status, the next concrete action, and its relationship to Apply-1's existing scaffold are tracked in the Path A roadmap — re-baselined to v3 at Phase 0.5 close (Step 10 in the plan).

Path B (scheduling-session-owned: corrected widget claim at `Picasso/src/components/chat/StateManagementPanel.jsx:535`, manual DSAR, CloudWatch retention) is a parallel track outside this program's direct ownership. This charter coordinates with Path B but does not own it. The Phase 0.5 Step 5 cross-track verification will independently check whether the widget claim is corrected in prod and whether `_store_submission` writes a `ttl`; the **verification result** (recorded in D5 risk register), not this charter, determines the framing — Path B's ownership does not change MyRecruiter platform's exposure if the false claim is still live.

## Design principles

Standing rules (verbatim from the strategy doc, [`README.md`](./README.md), "Strategic Framing" section):

1. Collect less.
2. Store less.
3. Log less.
4. Separate tenants.
5. Define retention before storage.
6. Treat chat transcripts as PII by default.
7. Do not let AI make eligibility, approval, safety, tax, legal, or placement decisions.

## What "done" looks like

**Phase 0.5 closes** when [`CONSUMER_PII_REMEDIATION.md`](./CONSUMER_PII_REMEDIATION.md) (re-baselined v3) names the next concrete Path A action, the 5 deliverables (charter, inventory, flow-map, classification, risk register) meet their minimum-content bar, the 6 advisors exist and have reviewed their assigned deliverables, counsel engagement is initiated with the input package sent, and the living-inventory PR rule is live in `CLAUDE.md`. Plan: `~/.claude/plans/let-s-work-on-the-cheerful-manatee.md`. Full exit criteria there.

**Program-level "done" shape** is defined in the re-baselined `CONSUMER_PII_REMEDIATION.md` (Step 10) after D2–D5 land — not pre-decided here. Tenant-#2 (Atlanta) cutover gating is defined in that re-baselined roadmap (not yet written; to be produced in Step 10).

## Review cadence

This charter is re-read and updated: when counsel returns a determination that affects scope; on tenant-#2 onboarding; and at a minimum annually. Updates land via a small focused PR per the project's working discipline.

# AI Governance Boundaries (M9.G1 decision doc)

**Status:** Decision doc closing **M9.G1**. Authored 2026-06-07. **Owner:** Chris Miller (+ counsel-pending on F13-b).
**Captures:** F13(a) Bedrock prompt persistence · F13-b/F15 AI content-quality risk · F16 tenant-KB hygiene.
**Disposition:** (a) **scoped + verified now**; (b)+(c) **second-wave deferral with named triggers** (counsel floor 2027-05-20).

> **Advisory, not legal advice.** Documents the AI-governance posture/boundary for the current product (nonprofit
> volunteer / donor / supporter / visitor scope). Not counsel; the content-quality + KB-hygiene rows are counsel-pending.

## §1 — (a) Bedrock prompt persistence (Finding 13) — **VERIFIED OFF**
Risk: if account-level Bedrock model-invocation logging is enabled, user prompts + model outputs (which can carry
free-text PII) persist to an S3/CloudWatch sink — a new PII surface.
**Verified 2026-06-07 (read-only):** `aws bedrock get-model-invocation-logging-configuration --region us-east-1`
returns **`null` (unconfigured) in BOTH accounts** (staging 525 + prod 614). → No prompt/output persistence via this
path today. IaC carries no logging config either.
- **Owner:** Chris. **Re-verify trigger:** any enablement of Bedrock invocation logging, a new Bedrock region added to
  the platform (today us-east-1 only), or the 2026-08-22 D2/D3/D4 currency review. If ever enabled, the sink must be
  added to D2 inventory + D4 classification + the DSAR delete walk.

## §2 — (b) AI response content-quality (Findings 13-b + 15) — **counsel-pending, second-wave deferral**
Risk distinct from persistence: hallucination, prompt-injection, KB-verbatim leak, and **solicitation / tax /
eligibility / benefit claims** the AI must not make for a nonprofit audience.
**Controls already in place (documented here as the standing boundary):**
- **Locked prompt rules** in the Bedrock handler — SOURCE / CONTEXT / FORMATTING / CLOSING (BSH `prompt_v4`); responses
  are KB-grounded, not free-generation.
- **Advisory boundaries (CLAUDE.md, in force):** Picasso does **not** make legal/tax/eligibility determinations,
  evaluate background checks, or make placement/hiring decisions; the **Employment/Hiring stop-trigger** halts work if
  the product crosses into recruiting; **Background-Check Caution** applies.
- **PII redaction** (`redact_pii`) on logged/analytics paths.
**Gap (accepted, deferred):** no formal content-quality SLA or automated hallucination/injection detection beyond
prompt design. **F13-b is a counsel-pending row** (per F-DSAR16 list). **Disposition:** second-wave deferral.
- **Promote-to-build triggers:** (1) any counsel trigger fires (S1/S2/S4 — see `counsel-input-package.md`); (2) a real
  incident (a harmful/false AI claim reaches a consumer); (3) tenant LOI/DPA requiring a content-quality commitment;
  (4) **calendar floor 2027-05-20** (the 12-month counsel re-confirmation, F-DSAR16) — record "no trigger fired;
  continue holding" OR engage counsel.

## §3 — (c) Tenant-KB hygiene (Finding 16) — **second-wave deliverable, deferred**
Risk: tenant-uploaded KB content may embed PII and leak to adjacent tenants/sessions. KB ingestion is tenant-controlled
today with no platform hygiene contract.
**Disposition:** the **KB-hygiene tenant contract** is a named **second-wave deliverable** (matches the strategy guide
Near-Term "AI governance documentation"). Deferred with triggers: (a) first multi-tenant shared-KB configuration; (b)
tenant DPA template drafting (**batch with M5.G1 / M8** — the DPA is the natural home for a KB-hygiene clause);
(c) onboarding a tenant whose KB plausibly contains PII; (d) the 2027-05-20 counsel floor.

## §4 — Summary
| Item | Posture | State |
|---|---|---|
| F13(a) prompt persistence | controlled — logging off both accounts | ✅ verified 2026-06-07; re-verify on enablement |
| F13-b/F15 content quality | boundary documented (locked prompt + advisory rules); no SLA | ⏸ counsel-pending, second-wave |
| F16 KB hygiene | tenant-controlled; contract absent | ⏸ second-wave deliverable (batch w/ DPA) |

## §5 — References
D5 rows F13+F15+F16, F-DSAR16 (counsel floor 2027-05-20) · CLAUDE.md (advisory model, hiring + background triggers) ·
`counsel-input-package.md` · README strategy guide (AI-governance Near-Term) · BSH locked prompt rules (`prompt_v4`).

# Template: Tenant-Sink Deletion Request (Finding 9 workaround)

**Use when:** the DSAR Lambda has surfaced a manual-followup ticket indicating the tenant has received a copy of the subject's data via `fulfillment_type: webhook | external | s3` (per their tenant config). Per [`data-flow-map.md`](./data-flow-map.md) Finding 9, the platform cannot reach tenant-controlled destinations.

**Send via:** email to the tenant's admin contact (from `privacy@myrecruiter.ai`). The tenant should be in the operator's contacts; if not, look up via `Picasso_Config_Manager` or `picasso-tenant-registry-staging`.

**Timeline:** send within 24 hours of triaging the inbound DSAR. Tenant response target: 14 days (gives MyRecruiter a buffer against the 30/45-day subject-facing SLA). If no response in 14 days, escalate per `privacy-risk-register.md` §"Operational fulfillment workflow" §9.

---

**Subject:** Privacy request — action required on your end ({dsar_id})

Hello {TENANT_ADMIN_NAME},

This email is in connection with a data-subject privacy request we received at MyRecruiter regarding data collected through the Picasso widget on your website ({TENANT_SITE}).

**Request summary:**
- Subject identifier: {SUBJECT_IDENTIFIER — e.g., "the email jane@example.com"}
- Type of request: {RIGHT — access / delete / anonymize / correct}
- Submission origin: {FORM_OR_CHAT_REFERENCE — e.g., "volunteer-interest form submitted on or around March 12, 2026"}
- Our request ID: **{dsar_id}**
- Subject-facing response target: **{sla_due}**

**Why this affects you:**

Your Picasso configuration routes form submissions of this type to {DESTINATION_DESCRIPTION — e.g., "your Bloomerang donor CRM" / "your team Google Sheet" / "your n8n workflow at https://n8n.example.org/webhook/xxx"}. The submission referenced above was therefore delivered to your downstream system in addition to being stored on the MyRecruiter platform.

**What we have done on our side:**

{MYR_ACTION_TAKEN — e.g., "We have deleted all records of this subject from MyRecruiter-controlled systems as of {DATE}." / "We have prepared an export of this subject's data; the export is attached for your records as well."}

**What we are asking you to do:**

Please action the equivalent request on your end:

- **For a delete request:** delete the corresponding records from {DESTINATION_DESCRIPTION}. Confirm completion to us in writing (email reply is sufficient).
- **For an access/export request:** the export we have prepared covers MyRecruiter-side data only. If the subject's request encompasses what your downstream system holds, please coordinate directly with the subject — your contact for them is {SUBJECT_CONTACT — only if they provided it and consented to disclosure to you}.
- **For an anonymize request:** apply the same anonymization on your side (replace identifying fields with placeholders).
- **For a correct request:** apply the correction on your side.

Please reply to this email with confirmation by **{response_target_date — intake_date + 14 days}** so we can complete the subject-facing response within our statutory deadline.

**Why this matters:**

Both MyRecruiter (as a service provider) and your organization (as the business/controller) have obligations under privacy law. We cannot reach your downstream systems on your behalf, but you and we together are responsible for the subject's data across the full delivery chain. If you have questions about how to action this, your legal/privacy contact is the right person to consult; we are also happy to coordinate on a call.

**For audit reference,** please retain this email and your reply confirming completion. We retain both in our records as evidence that the request was honored end-to-end.

Best,
Chris Miller
Founder, MyRecruiter
privacy@myrecruiter.ai

---

**Placeholders to fill before sending:**
- `{dsar_id}` — from `dsar-log.md`
- `{TENANT_ADMIN_NAME}` — admin contact at tenant
- `{TENANT_SITE}` — friendly site name + URL
- `{SUBJECT_IDENTIFIER}`, `{RIGHT}`, `{FORM_OR_CHAT_REFERENCE}`, `{sla_due}` — from the inbound + dsar-log
- `{DESTINATION_DESCRIPTION}` — friendly description of the tenant's downstream sink
- `{MYR_ACTION_TAKEN}` — describe MyR-side action factually
- `{SUBJECT_CONTACT}` — only if consented + applicable
- `{response_target_date}` — intake_date + 14d

**After sending:** update `dsar-log.md` row status to `awaiting-tenant`; populate `notes` with tenant + send-date; commit.

**If tenant doesn't respond by `{response_target_date}`:**
- First nudge email (one-paragraph reminder).
- Second nudge at +18 days from original send.
- Escalation at +22 days: counsel-trigger (tenant DPA dispute / contract escalation).

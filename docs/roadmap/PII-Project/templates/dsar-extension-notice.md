# Template: DSAR Extension Notice

**⚠️ DO NOT SEND WITHOUT COUNSEL SIGN-OFF.** Extensions are permitted by CCPA (one 45-day extension) and GDPR (up to two months for complex requests), but the rationale must hold up to regulatory review. Counsel reviews the extension reason before sending.

**Use when:** original SLA cannot be met for a documented, defensible reason (complexity, identity-verification challenge, tenant-coordination delays per Finding 9, etc.).

**Send via:** reply on the same Gmail thread, from `privacy@myrecruiter.ai`. **Must be sent before the original deadline expires** — late extension notice = effectively a missed deadline.

---

**Subject:** Re: Privacy request — extending response timeline

Hello,

Thank you for your privacy request **{dsar_id}**, received on {intake_date}.

Our original response target was **{original_sla_due}**. Due to {EXTENSION_REASON_CATEGORY — e.g., "the complexity of the records to locate" / "the need to coordinate with a third party (the tenant whose website you interacted with)" / "verification challenges that we are continuing to work through"}, we are extending the response deadline by an additional {EXTENSION_DAYS} days, to **{new_sla_due}**.

Specifically, {EXTENSION_DETAIL — counsel-approved specific reason. Example: "we have identified that some of your data was shared with the tenant organization's internal volunteer-coordination system, and we are coordinating with them to ensure complete handling of your request. We expect their response by {DATE} and will complete our full response within {DAYS} business days of receiving their confirmation."}

This extension is permitted under {APPLICABLE_LAW — "CCPA §1798.130(a)(2)(B)" / "GDPR Art 12(3)" — counsel-confirmed}.

If you have any questions or concerns about the extension, please reply. We are continuing to work on your request and will respond no later than {new_sla_due}.

Best,
Chris Miller
Founder, MyRecruiter
privacy@myrecruiter.ai

---

**Placeholders to fill before sending:**
- `{dsar_id}`, `{intake_date}`, `{original_sla_due}` — from `dsar-log.md`
- `{EXTENSION_REASON_CATEGORY}` + `{EXTENSION_DETAIL}` — counsel-reviewed
- `{EXTENSION_DAYS}` + `{new_sla_due}` — counsel-confirmed within statutory limits
- `{APPLICABLE_LAW}` — counsel-confirmed citation

**After sending:** update `dsar-log.md` row status to `extended`; populate `notes` with extension reason; commit with `COUNSEL-TRIGGER` in commit message.

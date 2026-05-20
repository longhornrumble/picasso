# Template: DSAR Verification Request

**Use when:** subject has submitted a privacy request from an email that doesn't match `picasso-pii-subject-index-staging` for the tenant they identified, OR the subject did not identify a tenant.

**Send via:** reply on the same Gmail thread. Do NOT send from `chris@myrecruiter.ai` directly — send from `privacy@myrecruiter.ai` to keep the audit trail clean.

---

**Subject:** Re: Privacy request — verification needed

Hello,

Thank you for your privacy request. To process it, I need to verify the request comes from the person whose data we hold.

The email you submitted from doesn't directly match a record on file. To help locate your data, could you reply with **one** of the following:

- The email address you used when you originally interacted with [TENANT NAME — e.g., Austin Angels]
- The approximate month and year you submitted the form or had the conversation
- The name of the form you filled out (if you remember — for example, "volunteer interest" or "contact us")

Any one of those will let me locate your record. I am not asking for government ID or notarized documents — those are not required.

If you don't remember any of the above, that's OK — let me know and I'll respond accordingly.

For reference, your request is logged as **{dsar_id}**. Our target response time is **{sla_due}** ({jurisdiction_label}).

Best,
Chris Miller
Founder, MyRecruiter
privacy@myrecruiter.ai

---

**Placeholders to fill before sending:**
- `{TENANT NAME}` — the tenant the subject identified, or "the platform" if they didn't
- `{dsar_id}` — from `dsar-log.md`
- `{sla_due}` — from `dsar-log.md`
- `{jurisdiction_label}` — "30-day GDPR-target" or "45-day CCPA-target" per the row

**After sending:** update `dsar-log.md` row status to `awaiting-verification` and commit.

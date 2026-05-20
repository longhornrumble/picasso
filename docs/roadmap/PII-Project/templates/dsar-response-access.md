# Template: DSAR Response — Access / Export

**Use when:** the subject requested access (right to know) or portability (export), verification passed, Lambda execution completed.

**Send via:** reply on the same Gmail thread, from `privacy@myrecruiter.ai`. **Attach** the JSON file the Lambda generated: `dsar-{dsar_id}-{request_type}.json`.

---

**Subject:** Re: Privacy request — data on file

Hello,

Thank you for your privacy request **{dsar_id}**.

Attached is a JSON file containing the data MyRecruiter holds about you from your interaction with **{TENANT NAME}**. Here's a plain-language summary of what's in it:

- **Form submissions:** {N_FORM_SUBMISSIONS — e.g., "1 volunteer-interest form from March 2026"} — includes the name, email, phone number, and free-text answers you provided.
- **Chat conversations:** {N_CONVERSATIONS — e.g., "2 chat sessions"} — includes the message content you sent and the AI's responses.
- **Email notifications we sent you:** {N_NOTIFICATIONS — e.g., "1 follow-up email on March 12"} — includes when each was delivered.
- {ADDITIONAL_SURFACES — if anything else applies}

**What we have shared with others on your behalf:** {TENANT_SINK_DISPOSITION — e.g., "Austin Angels' internal volunteer-coordination system received a copy of your volunteer-interest submission. We have informed them of this request; their internal records are subject to Austin Angels' own privacy practices."}

**What we have NOT included:**
- Operational logs (limited to 14-day retention; subject to our internal data classification, not user-facing).
- Backup copies retained for {RETENTION_CONTEXT — e.g., "DynamoDB point-in-time recovery, 35-day window"}.

If you have any follow-up questions about this data or want to make a follow-on request (delete, anonymize, correct), reply to this email.

Best,
Chris Miller
Founder, MyRecruiter
privacy@myrecruiter.ai

---

**Placeholders to fill before sending:**
- `{dsar_id}` — from `dsar-log.md`
- `{TENANT NAME}` — friendly tenant name
- `{N_FORM_SUBMISSIONS}`, `{N_CONVERSATIONS}`, `{N_NOTIFICATIONS}` — from Lambda `rows_touched`
- `{ADDITIONAL_SURFACES}` — any rows the Lambda surfaced beyond the common 3
- `{TENANT_SINK_DISPOSITION}` — describe Finding-9 disposition (whether tenant has been notified + their status)
- `{RETENTION_CONTEXT}` — be honest about what backup retention applies

**After sending:** update `dsar-log.md` row to `closed`; populate `closed_date`; commit.

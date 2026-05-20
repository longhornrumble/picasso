# Template: DSAR Response — Delete / Anonymize

**Use when:** the subject requested deletion or anonymization, verification passed, Lambda executed in non-dry-run mode, manual-followup tickets resolved (or escalation accepted).

**Send via:** reply on the same Gmail thread, from `privacy@myrecruiter.ai`.

---

**Subject:** Re: Privacy request — deletion completed

Hello,

Your privacy request **{dsar_id}** has been completed.

**What we deleted from MyRecruiter-controlled systems:**

- {N_FORM_SUBMISSIONS} form submissions from {TENANT NAME}
- {N_CONVERSATIONS} chat conversation records
- {N_NOTIFICATIONS} email notification records
- {ADDITIONAL_SURFACES — if applicable}

Deletion was completed on **{deletion_date_utc}** UTC.

**What we have NOT been able to fully control on your behalf:**

{TENANT_SINK_DISPOSITION — only include if Finding 9 applies. Example: "Austin Angels also received a copy of your volunteer-interest submission to their internal coordination system. We have asked Austin Angels to delete from their records as well; their confirmation is pending / received on {DATE}. If you wish to confirm directly with them, their contact is volunteer-coordinator@austinangels.org."}

**About retained / backup copies:**

For up to **35 days** from deletion, your data may persist in DynamoDB point-in-time recovery backups. These backups are not used for any business purpose — they exist solely for catastrophic-recovery scenarios. After 35 days, they age out completely. CloudWatch log entries containing your data age out within 14 days from when they were created.

**About future interactions:**

This deletion applies to data we held as of {deletion_date_utc}. If you interact with the Picasso widget again on a tenant site, new data may be collected. This deletion request does not "opt you out" of future collection — you would need to make a new request after the new interaction.

If you have any follow-up questions, reply to this email. Your request is now closed in our system.

Best,
Chris Miller
Founder, MyRecruiter
privacy@myrecruiter.ai

---

**Placeholders to fill before sending:**
- `{dsar_id}` — from `dsar-log.md`
- `{N_*}` — from Lambda `rows_touched`
- `{TENANT NAME}` — friendly tenant name
- `{ADDITIONAL_SURFACES}` — anything beyond the common 3
- `{deletion_date_utc}` — Lambda invocation time in UTC
- `{TENANT_SINK_DISPOSITION}` — omit entire paragraph if Finding 9 doesn't apply; otherwise describe tenant correspondence honestly

**After sending:** update `dsar-log.md` row to `closed`; populate `closed_date`; commit.

**For anonymize requests:** replace "deleted" with "anonymized" throughout; explain that identifying fields have been replaced with `[anonymized:YYYY-MM-DD]` placeholders while non-identifying analytics value is preserved.

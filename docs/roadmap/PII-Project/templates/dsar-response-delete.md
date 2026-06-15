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
- {SCHEDULING_SUMMARY — only if the subject had appointments. Example: "{N_BOOKINGS} appointment booking(s), {N_REMINDERS} appointment reminder/confirmation message(s), and {N_SCHEDULING_SESSIONS} scheduling-session record(s), and we deleted the corresponding event(s) from the host's Google Calendar."}
- {ADDITIONAL_SURFACES — if applicable}

Deletion was completed on **{deletion_date_utc}** UTC.

**What we have NOT been able to fully control on your behalf:**

{TENANT_SINK_DISPOSITION — only include if Finding 9 applies. Example: "Austin Angels also received a copy of your volunteer-interest submission to their internal coordination system. We have asked Austin Angels to delete from their records as well; their confirmation is pending / received on {DATE}. If you wish to confirm directly with them, their contact is volunteer-coordinator@austinangels.org."}

**About staff records of communications involving your submission:**

When you submitted information through the Picasso widget on {TENANT NAME}, our system sent internal email or SMS notifications to {TENANT NAME}'s staff so they could process your inquiry. Those notification records, where the recipient is a member of {TENANT NAME}'s staff (not you), are under {TENANT NAME}'s separate controller relationship as their employer — they are processed by us as their service provider, not by us as a controller of the recipient's data. Those records are subject to {TENANT NAME}'s own retention and deletion policies, not to this deletion request. The CONTENT of your submission has been removed from records WE control under our consumer relationship with you. If you wish to also have these staff-side communications inspected or deleted, you may contact {TENANT NAME} directly, or you may reply to this email and we will coordinate with {TENANT NAME} on your behalf under our F9 sub-processor inventory disclosure. {OMIT THIS PARAGRAPH IF the consumer received zero direct-recipient notifications AND no staff notifications were triggered by their submission(s).}

**About your appointments and calendar copies:** {OMIT THIS PARAGRAPH IF the subject had no bookings.}

If you booked an appointment, we deleted the booking, its reminder/confirmation messages, the scheduled reminders, and the event on the **host organization's** Google Calendar. Two honest limits: (1) if you accepted a calendar invitation, a copy of that event may still appear on **your own** personal calendar — we cannot reach your calendar, so please delete it there yourself if you wish; and (2) where you previously gave consent to receive text-message reminders, we retain a minimal record of that consent (date and scope only — not the message content) for a limited period to comply with telecommunications consent-recordkeeping law. Everything else related to your appointment has been removed from the systems we control.

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
- `{SCHEDULING_SUMMARY}` — F0: from Lambda `rows_touched.booking` / `.scheduled-messages` / `.scheduling-session` + `.calendar`. **Omit the scheduling lines + the "About your appointments and calendar copies" paragraph if `rows_touched.booking == 0`.** If the booking walker returned `calendar_delete_unconfirmed` (a calendar event could not be confirmed deleted — see the manual_followups), do NOT send this template yet: resolve the manual calendar deletion first, then re-invoke; the DSAR status will be `partial_error` until then.
- `{deletion_date_utc}` — Lambda invocation time in UTC
- `{TENANT_SINK_DISPOSITION}` — omit entire paragraph if Finding 9 doesn't apply; otherwise describe tenant correspondence honestly
- **Staff-records paragraph** — omit if both true: (a) the notification-sends walker returned zero consumer-recipient rows AND (b) no staff notifications were triggered for the consumer's submission. When in doubt, include it — the disclosure is honest and the scope-distinction is the artifact a regulator inquiry would expect alongside the DSAR Lambda's technical capability (D5 G-H + F9; advisor audit 2026-05-21 item 5)

**After sending:** update `dsar-log.md` row to `closed`; populate `closed_date`; commit.

**For anonymize requests:** replace "deleted" with "anonymized" throughout; explain that identifying fields have been replaced with `[anonymized:YYYY-MM-DD]` placeholders while non-identifying analytics value is preserved.

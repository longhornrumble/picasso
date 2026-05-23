# Template: DSAR Response — Correction / Rectification

**Use when:** the subject requested correction of inaccurate or incomplete personal information (CCPA §1798.106 right to correct; GDPR Art 16 right to rectification). Verification has passed; operator has identified the row(s) needing correction; manual update completed.

**Send via:** reply on the same Gmail thread, from `privacy@myrecruiter.ai`.

---

**Subject:** Re: Privacy request — correction completed

Hello,

Your privacy request **{dsar_id}** has been completed.

**What we corrected in MyRecruiter-controlled systems:**

{LIST_OF_CORRECTIONS — itemize each surface + field changed, OLD value → NEW value, redacted in this reply for your privacy. Example:
- 1 form submission record at {TENANT NAME}: email address corrected
- 1 form submission record at {TENANT NAME}: phone number corrected
- 0 chat records corrected (chat history is a record of past messages — corrections to message content are not applied retroactively; only forward messages reflect updated information)
}

Correction was completed on **{correction_date_utc}** UTC.

**About what cannot be corrected:**

Certain records are historical by design and cannot be modified retroactively:

- **Chat message content** ({TENANT NAME} widget): each chat message is a point-in-time record of what was actually said. We do not edit message content after the fact — that would compromise the integrity of the conversation log. If specific message content is materially incorrect or misleading, you may instead request **deletion** of those messages via a follow-up request.
- **Notification records** (emails or SMS messages we sent on your behalf or to you): once sent, these messages are historical events. The notification record reflects what was actually sent at the time. We do not rewrite past notifications. If a future notification will be triggered by the corrected information, it will reflect the updated values.
- **Audit logs**: our DSAR audit records (`picasso-pii-dsar-audit-staging`) and CloudTrail logs are not corrected — they are an append-only legal-defensibility record showing what actions were taken on your data and when (consistent with our Article 17(3)(b) retention basis for the integrity-of-audit purpose, per our internal retention policy).

**About staff records of communications involving your submission:**

When you submitted information through the Picasso widget on {TENANT NAME}, our system may have sent internal email or SMS notifications to {TENANT NAME}'s staff with the original (now-corrected) information. Those staff-side notification records, where the recipient is a member of {TENANT NAME}'s staff (not you), are under {TENANT NAME}'s separate controller relationship as their employer. They are not corrected by this request — they reflect what was sent at the time. If you wish to also have {TENANT NAME}'s staff notified of the correction, you may contact {TENANT NAME} directly, or you may reply to this email and we will coordinate with {TENANT NAME} on your behalf under our F9 sub-processor inventory disclosure. {OMIT THIS PARAGRAPH IF the consumer's submission triggered zero staff notifications.}

**Going forward:**

Any new interactions with the Picasso widget on tenant sites, or new notifications triggered by future activity, will reflect the corrected information you provided. If you wish to also DELETE the original record after correction (rather than have the corrected version persist), reply to this email with a deletion request and we will process it.

If you have any follow-up questions, reply to this email. Your request is now closed in our system.

Best,
Chris Miller
Founder, MyRecruiter
privacy@myrecruiter.ai

---

**Placeholders to fill before sending:**
- `{dsar_id}` — from `dsar-log.md`
- `{LIST_OF_CORRECTIONS}` — itemize per-surface; redact specific OLD/NEW values for privacy (don't echo PII back to subject in the email body — they already know what they corrected; the row count + surface is the artifact)
- `{TENANT NAME}` — friendly tenant name
- `{correction_date_utc}` — operator's correction-completion timestamp in UTC

**Operator procedure (M3 playbook §Correction path):**

1. **Verify identity** per `dsar-verification-posture.md` (same standard as access/delete).
2. **Locate the row(s) needing correction** — typically `picasso-form-submissions-staging`. Use:
   ```
   AWS_PROFILE=myrecruiter-staging aws dynamodb query \
     --table-name picasso-form-submissions-staging \
     --key-condition-expression "tenant_id = :t" \
     --filter-expression "pii_subject_id = :p" \
     --expression-attribute-values '{":t":{"S":"<TENANT_ID>"},":p":{"S":"<PII_SUBJECT_ID>"}}'
   ```
3. **For each row needing correction, manually update via DDB**:
   ```
   AWS_PROFILE=myrecruiter-staging aws dynamodb update-item \
     --table-name picasso-form-submissions-staging \
     --key '{"tenant_id":{"S":"<TENANT_ID>"},"submission_id":{"S":"<SUBMISSION_ID>"}}' \
     --update-expression "SET responses.email = :new_email, form_data.email = :new_email, form_data_labeled.<EMAIL_FIELD_LABEL> = :new_email" \
     --expression-attribute-values '{":new_email":{"S":"<NEW_EMAIL>"}}'
   ```
   (Adjust attribute path per field being corrected — note that the submission row has THREE PII copies: `responses` (raw), `form_data` (raw), `form_data_labeled` (human-readable). Correct all three or the correction is partial.)

4. **Manually write an audit row** to `picasso-pii-dsar-audit-staging` so the correction is recorded alongside delete/access fulfillments:
   ```
   AWS_PROFILE=myrecruiter-staging aws dynamodb put-item \
     --table-name picasso-pii-dsar-audit-staging \
     --item '{
       "dsar_id":{"S":"<DSAR_ID>"},
       "event_timestamp":{"S":"<ISO_TIMESTAMP>"},
       "event_type":{"S":"correction_completed"},
       "status":{"S":"closed"},
       "created_at_partition":{"S":"<YYYY-MM>"},
       "details":{"M":{
         "request_type":{"S":"correction"},
         "operator_caller_arn":{"S":"<YOUR_ARN>"},
         "rows_corrected":{"N":"<N>"},
         "fields_changed":{"L":[{"S":"email"},{"S":"phone"}]},
         "manual_walk":{"BOOL":true}
       }}
     }'
   ```
   This is a manual append because the DSAR Lambda's current `request_type` modes are `access` and `delete` only — correction is a future Lambda extension (no enumerated milestone; current product scale doesn't warrant the Lambda extension yet, and the manual walk is appropriately auditable).

5. **Send this template** as the response. Update `dsar-log.md` row to `closed`.

**Re-verification:** if the correction was specifically because the original submission triggered downstream notifications with incorrect information (e.g., a tenant's volunteer-coordinator now has a wrong email), explicitly include the staff-records paragraph above so the subject understands the correction is forward-looking only.

**After sending:** update `dsar-log.md` row to `closed`; populate `closed_date`; commit.

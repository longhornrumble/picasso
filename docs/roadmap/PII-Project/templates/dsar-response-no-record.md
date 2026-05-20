# Template: DSAR Response — No Record

**Use when:** the subject's request has been verified-as-best-as-possible AND the Lambda's exhaustive walk returned no rows for any identifier we have.

**Send via:** reply on the same Gmail thread, from `privacy@myrecruiter.ai`.

---

**Subject:** Re: Privacy request — no record found

Hello,

Thank you for your privacy request **{dsar_id}**.

I searched our records for the identifiers you provided ({IDENTIFIERS_SEARCHED — e.g., "the email jane@example.com and any phone numbers or Facebook PSIDs you mentioned"}) across the data we hold for **{TENANT NAME — or "all our tenant sites" if unspecified}**.

**We have no record matching those identifiers.**

A few reasons this is possible:
- You may have submitted from a different email address than the one you're writing from now.
- You may be thinking of a different organization's site.
- Your data may have already been deleted (either by you, by tenant action, or by retention expiration).

If you believe this is incorrect and you have additional identifiers — a different email, an approximate date, or the specific form you filled out — please reply and I will run the search again.

If you have no additional identifiers, this request is closed. No data was found; no action was taken.

Best,
Chris Miller
Founder, MyRecruiter
privacy@myrecruiter.ai

---

**Placeholders to fill before sending:**
- `{dsar_id}` — from `dsar-log.md`
- `{IDENTIFIERS_SEARCHED}` — be specific about what you actually checked
- `{TENANT NAME}` — tenant identified, or "all our tenant sites" if unknown

**After sending:** update `dsar-log.md` row to `closed`; populate `closed_date`; notes = "no record found"; commit.

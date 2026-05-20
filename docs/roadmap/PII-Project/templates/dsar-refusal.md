# Template: DSAR Refusal

**⚠️ DO NOT SEND WITHOUT COUNSEL SIGN-OFF.** Refusal is a regulatory-risk action. The counsel package (PR #153) must be triggered (sent) before this template is used; counsel reviews the specific refusal reason before the response is sent.

**Use when:** verification has failed two consecutive times, OR the request is outside MyRecruiter's controller responsibility (e.g., explicit out-of-scope regime), OR counsel has reviewed and approved refusal for a documented reason.

**Send via:** reply on the same Gmail thread, from `privacy@myrecruiter.ai`. Counsel may want to be CC'd or BCC'd; ask counsel.

---

**Subject:** Re: Privacy request — unable to process

Hello,

Thank you for your privacy request **{dsar_id}**.

After reviewing your request, **we are unable to process it at this time** for the following reason:

{REFUSAL_REASON — counsel-approved language. Examples:
- "We were unable to verify your identity to a reasonable standard. The data we hold is sensitive, and we cannot release or modify it without confirming the requester is the data subject. If you can provide additional information — see our earlier email — we are happy to re-attempt verification."
- "The data you have described falls outside MyRecruiter's scope as a service provider. The organization that operates the website where you interacted ({TENANT NAME}) is the controller of that data; please direct your request to them at {TENANT_PRIVACY_CONTACT}."
- "Your request appears to seek records from a regulated category (e.g., consumer reports, background checks) that MyRecruiter does not collect or process. We have no records matching the regulatory framework you referenced."
}

**Your appeal options:**

{APPEAL_LANGUAGE — counsel-provided per jurisdiction. CCPA appeals to CA AG; GDPR appeals to relevant DPA; FTC complaint route; etc. Counsel writes this language.}

If you have new information that addresses the reason above, please reply and I will reconsider.

Best,
Chris Miller
Founder, MyRecruiter
privacy@myrecruiter.ai

---

**Placeholders to fill before sending:**
- `{dsar_id}` — from `dsar-log.md`
- `{REFUSAL_REASON}` — counsel-reviewed specific language
- `{TENANT NAME}` + `{TENANT_PRIVACY_CONTACT}` — if controller-mismatch refusal
- `{APPEAL_LANGUAGE}` — counsel-reviewed

**After sending:** update `dsar-log.md` row to `refused`; notes include counsel-memo date + reason category; commit with `COUNSEL-TRIGGER` in commit message.

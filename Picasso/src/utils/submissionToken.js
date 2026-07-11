/**
 * FS5 — client idempotency token for form submissions.
 *
 * Derives a STABLE token from (session, form, form contents):
 *   sha256(`${sessionId}|${formId}|${JSON.stringify(formData)}`) → 64 lowercase hex.
 *
 * Content-derived (not random-per-call) on purpose: the classic duplicate is a
 * dropped stream/timeout where the user re-clicks Submit with the same answers —
 * a fresh random token would miss that retry, a content-derived one catches it
 * with zero client-side state. If the user edits an answer and resubmits, the
 * hash (and so the token) changes → correctly treated as a NEW submission.
 *
 * Both Lambda form paths (BSH form_handler.js, MFS form_handler.py) key the
 * submission on this token via a conditional write, so a retry is answered with
 * success WITHOUT re-running fulfillment (no duplicate rows, no double emails).
 *
 * Fail-open: any error (crypto.subtle unavailable in non-secure contexts, etc.)
 * returns null and the caller simply omits the field — the servers treat an
 * absent token as legacy traffic and keep today's behavior.
 */

export async function computeSubmissionToken(sessionId, formId, formData) {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const material = `${sessionId || ''}|${formId || ''}|${JSON.stringify(formData || {})}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

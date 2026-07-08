/**
 * Parent-window origin helpers for the iframe app's postMessage bridge.
 *
 * Extracted from iframe-main.jsx so the origin logic is a single, unit-tested
 * source of truth (RESCHEDULE_WIDGET_REMEDIATION_2026-07-08 §SR-1/§SR-2).
 */

/**
 * Resolve the `targetOrigin` for a postMessage to `window.parent`.
 *
 * SR-1: never fall back to the `'*'` wildcard. Callers MUST skip the post when
 * this returns `null` (fail closed) rather than broadcasting to any origin.
 *
 * - Standalone shells (`?mode=schedule` / `?mode=fullpage`) are same-origin with
 *   this iframe, so the correct target is our own origin.
 * - Embedded on a client page: the parent's origin is the referrer's origin.
 * - No usable referrer in the embedded case → `null` (drop).
 *
 * @param {{ mode?: string|null, referrer?: string, locationOrigin: string }} ctx
 * @returns {string|null}
 */
export function resolveParentTargetOrigin({ mode, referrer, locationOrigin }) {
  if (mode === 'schedule' || mode === 'fullpage') {
    return locationOrigin;
  }
  if (referrer) {
    try {
      return new URL(referrer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Build the allowlist of parent origins whose inbound postMessages are trusted.
 *
 * SR-2: the widget is embed-anywhere, so the embedding page's origin (the
 * referrer) is echoed in — there is no fixed registry of legitimate client
 * domains, so this echo is retained deliberately. The hardcoded entries below
 * add the same-origin widget hosts (`chat` / `staging.chat`) so the standalone
 * schedule/fullpage case does NOT depend solely on the referrer being present.
 *
 * @param {{ isDev?: boolean, referrer?: string }} ctx
 * @returns {string[]}
 */
export function getAllowedParentOrigins({ isDev, referrer }) {
  const origins = [];

  // Embed-anywhere: trust the embedding page (referrer). Retained by necessity —
  // there is no clean allowlist of legitimate client embed domains.
  if (referrer) {
    try {
      origins.push(new URL(referrer).origin);
    } catch {
      // ignore an unparseable referrer
    }
  }

  if (isDev) {
    origins.push('http://localhost:5173');
    origins.push('http://localhost:3000');
    origins.push('http://localhost:8000');
    origins.push('http://127.0.0.1:5173');
    origins.push('http://127.0.0.1:3000');
    origins.push('http://127.0.0.1:8000');
    origins.push('null'); // file:// protocol for local testing
  }

  // Same-origin widget hosts (SR-2): the standalone schedule/fullpage shell is
  // same-origin with this iframe — accept these explicitly rather than relying
  // entirely on the referrer echo above.
  origins.push('https://chat.myrecruiter.ai');
  origins.push('https://staging.chat.myrecruiter.ai');

  // Marketing / app hosts (pre-existing).
  origins.push('https://myrecruiter.ai');
  origins.push('https://www.myrecruiter.ai');
  origins.push('https://app.myrecruiter.ai');

  return origins;
}

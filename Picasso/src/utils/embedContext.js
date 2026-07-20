/**
 * Mis-embed (sandboxed iframe) detection for the widget host.
 *
 * The embed snippet must run in the top-level document: widget-host appends a
 * position:fixed container to document.body, which only anchors to the browser
 * viewport when that body IS the page. Site builders like Wix render "Embed
 * HTML" elements as a sandboxed iframe (served from filesusr.com), so the
 * widget pins to that element's box instead of the viewport (Atlanta Angels,
 * 2026-07-18). The fix is always on the embedding site — inject the snippet
 * via the builder's site-wide custom-code feature — so detection here only
 * warns and reports; it never blocks the widget from booting.
 */

// Hostname-shape allowlist. Reports carry hostnames ONLY (never full URLs,
// which can hold query-string PII) — per pii-data-lifecycle-advisor review
// 2026-07-18. The server re-validates with the same shape.
const HOSTNAME_RE = /^[a-z0-9.-]{1,253}$/;

const REPORTED_FLAG = 'picasso_misembed';

export function isFramedEmbed(win = window) {
  try {
    return win.self !== win.top;
  } catch (e) {
    // Cross-origin access throw — definitely framed.
    return true;
  }
}

function cleanHostname(value) {
  const s = String(value || '').toLowerCase();
  return HOSTNAME_RE.test(s) ? s : '';
}

export function buildMisEmbedReport(win = window) {
  let frameHost = '';
  try {
    frameHost = cleanHostname(win.location.hostname);
  } catch (e) {
    // Opaque-origin sandbox — location unreadable; send empty.
  }
  let pageHost = '';
  try {
    pageHost = cleanHostname(new URL(win.document.referrer).hostname);
  } catch (e) {
    // Referrer empty or not a URL — never fall back to the raw string.
  }
  return { type: 'embed_sandboxed_frame', frame_host: frameHost, page_host: pageHost };
}

/**
 * Fire-and-forget mis-embed report to the log_error endpoint, at most once
 * per session (per page load where sessionStorage is sandbox-blocked).
 * sendBeacon/no-cors fetch: no preflight, response ignored — delivery does
 * not depend on CORS.
 */
export function reportMisEmbed(endpoint, tenantHash, win = window) {
  if (!endpoint) return false;
  try {
    if (win.sessionStorage.getItem(REPORTED_FLAG)) return false;
  } catch (e) {
    // Storage blocked in sandbox — fall through, still one report per load.
  }
  const url = `${endpoint}&t=${encodeURIComponent(tenantHash || '')}`;
  const payload = JSON.stringify(buildMisEmbedReport(win));
  let sent = false;
  try {
    if (win.navigator && typeof win.navigator.sendBeacon === 'function') {
      sent = win.navigator.sendBeacon(url, payload);
    }
    if (!sent && typeof win.fetch === 'function') {
      win.fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true, body: payload });
      sent = true;
    }
  } catch (e) {
    return false;
  }
  if (sent) {
    try {
      win.sessionStorage.setItem(REPORTED_FLAG, '1');
    } catch (e) {
      // Sandbox — acceptable to re-report on next load.
    }
  }
  return sent;
}

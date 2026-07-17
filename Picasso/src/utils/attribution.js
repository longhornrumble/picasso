/**
 * Attribution capture — the single source of truth.
 *
 * Extracted from widget-host.js (2026-07-17) for two reasons:
 *
 *  1. Two surfaces capture attribution and must agree: the embedded widget
 *     (widget-host.js, which reads ?ep=/UTM from its HOST page) and the /go/
 *     fullpage launcher (which has no host page — it IS the page). They had
 *     drifted apart within a single PR of being "kept in sync" by comment.
 *
 *  2. These functions previously lived on a closure-private object literal
 *     inside widget-host.js with no export path, so tests could not reach
 *     them and instead RE-IMPLEMENTED them in harnesses — meaning the tests
 *     asserted their own copies were self-consistent and would pass even if
 *     the real implementation were deleted. Named exports let tests exercise
 *     the real code.
 *
 * C2 contract: docs/roadmap/attribution-workstreams/FROZEN_CONTRACTS.md §C2
 * names widget-host.js as the owner of ?ep= capture and locks the
 * entry_point_id shape. The backend mint service enforces the same regex
 * independently (Lambdas/lambda/Attribution_Mint_Service/validation.mjs:163);
 * that copy is a deliberate cross-repo contract boundary — different repo,
 * different runtime — and is not something this module can share away.
 */

/**
 * C2: locked entry-point id shape. Do not loosen without a contract change —
 * the mint service rejects ids that fail this same test, so a mismatch here
 * silently admits ids the backend will never have registered.
 */
export const ENTRY_POINT_ID_RE = /^ep_[0-9A-Za-z]{8,64}$/;

/**
 * Get a URL parameter from the current page.
 * @param {string} name - Parameter name
 * @returns {string|null} Parameter value or null
 */
export function getUrlParam(name) {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  } catch (e) {
    return null;
  }
}

/**
 * Extract the GA4 client id from the _ga cookie, for session stitching.
 * @returns {string|null}
 */
export function getGAClientId() {
  try {
    const gaCookie = document.cookie
      .split('; ')
      .find(row => row.startsWith('_ga='));

    if (gaCookie) {
      // _ga=GA1.2.123456789.1702900000 → extract "123456789.1702900000"
      const parts = gaCookie.split('.');
      if (parts.length >= 4) {
        return parts.slice(2).join('.');
      }
    }
  } catch (e) {
    console.warn('[Picasso] Failed to read GA cookie:', e);
  }
  return null;
}

/**
 * C2: validate and capture the ?ep= entry-point id from the page URL.
 * Malformed ids become null rather than propagating — an unregistered or
 * junk ep resolves to the `website` channel downstream anyway, and
 * forwarding junk would pollute the registry join.
 * @returns {string|null}
 */
export function getEntryPointId() {
  const raw = getUrlParam('ep');
  if (raw && ENTRY_POINT_ID_RE.test(raw)) {
    return raw;
  }
  return null;
}

/**
 * Capture all attribution data from the current page.
 * Called once during initialization.
 * @returns {Object} Attribution data object
 */
export function captureAttribution() {
  const attribution = {
    // GA4 session stitching key
    ga_client_id: getGAClientId(),

    // UTM parameters (works with any tracking system: Dub.co, Bitly, manual)
    utm_source: getUrlParam('utm_source'),
    utm_medium: getUrlParam('utm_medium'),
    utm_campaign: getUrlParam('utm_campaign'),
    utm_term: getUrlParam('utm_term'),
    utm_content: getUrlParam('utm_content'),

    // Ad platform click IDs
    gclid: getUrlParam('gclid'),   // Google Ads
    fbclid: getUrlParam('fbclid'), // Facebook Ads

    // C2: Entry-point id (null when absent or malformed)
    entry_point_id: getEntryPointId(),

    // Referrer and landing page
    referrer: document.referrer || null,
    landing_page: window.location.pathname,

    // Timestamp
    captured_at: new Date().toISOString()
  };

  // Log attribution capture for debugging
  const hasAttribution = attribution.ga_client_id ||
                        attribution.utm_source ||
                        attribution.referrer;
  if (hasAttribution) {
    console.log('[Picasso] Attribution captured:', {
      ga_client_id: attribution.ga_client_id ? '✓' : '✗',
      utm_source: attribution.utm_source || '(none)',
      utm_medium: attribution.utm_medium || '(none)',
      entry_point_id: attribution.entry_point_id || '(none)',
      referrer: attribution.referrer ? new URL(attribution.referrer).hostname : '(direct)'
    });
  }

  return attribution;
}

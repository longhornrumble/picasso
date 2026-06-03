/**
 * Read the opaque scheduling session-binding id from the page URL (`?session=<uuid>`).
 *
 * The scheduling redemption Lambda redirects a volunteer to `…/?session=<uuid>`. The
 * widget forwards this opaque value to the backend, which resolves the session-context
 * binding via `(tenant_id from context, session_id=<uuid>)` (FROZEN_CONTRACTS §B12).
 *
 * The widget passes ONLY the opaque value — it does NOT parse/validate it, does NOT read
 * the binding, and does NOT read tenant from the URL (tenant comes from widget config).
 * The backend enforces. Returns `null` when the param is absent.
 *
 * @param {string} [search=window.location.search] - the URL query string
 * @returns {string|null} the opaque session value, or null if not present
 */
export function getBindingSessionId(search = window.location.search) {
  return new URLSearchParams(search).get('session');
}

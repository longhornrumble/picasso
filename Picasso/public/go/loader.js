// Fullpage Chat Launcher
// Loads the Picasso chat iframe at 100% viewport for social media links.
//
// Externalized from an inline <script> so a strict CSP (script-src 'self', no
// 'unsafe-inline') can be enforced on the fullpage host surface.
(function() {
  const urlParams = new URLSearchParams(window.location.search);
  const tenantHash = urlParams.get('t') || urlParams.get('tenant');

  if (!tenantHash) {
    // Show error if no tenant specified
    document.getElementById('loading-container').style.display = 'none';
    document.getElementById('error-container').style.display = 'flex';
    return;
  }

  // ---------------------------------------------------------------------------
  // Attribution capture.
  //
  // MIRRORS captureAttribution() in src/widget-host.js (~line 94-146) — that is
  // the source of truth; keep the shape and the C2 regex in sync with it.
  //
  // Duplicated rather than imported ON PURPOSE: this file is copied VERBATIM
  // into dist/<env>/go/ (esbuild.config.mjs ~line 227) and is not an esbuild
  // entry point, so it cannot import from src/.
  //
  // Why this exists at all: the embedded widget captures ?ep=/UTM from its HOST
  // page. /go/ has no host page — it IS the page — so without this, a link like
  // /go/?t=…&ep=ep_… silently lost its attribution and every conversation
  // started from a QR code or social link was miscredited to `website`.
  // ---------------------------------------------------------------------------

  function getUrlParam(name) {
    try {
      return urlParams.get(name);
    } catch (e) {
      return null;
    }
  }

  function getGAClientId() {
    try {
      const gaCookie = document.cookie
        .split('; ')
        .find(function(row) { return row.startsWith('_ga='); });

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

  // C2: validate ?ep= against the locked regex. Malformed ids become null
  // rather than propagating — an unregistered/garbage ep resolves to `website`
  // downstream anyway, and forwarding junk would pollute the registry join.
  function getEntryPointId() {
    const raw = getUrlParam('ep');
    if (raw && /^ep_[0-9A-Za-z]{8,64}$/.test(raw)) {
      return raw;
    }
    return null;
  }

  function captureAttribution() {
    return {
      // GA4 session stitching key
      ga_client_id: getGAClientId(),

      // UTM parameters
      utm_source: getUrlParam('utm_source'),
      utm_medium: getUrlParam('utm_medium'),
      utm_campaign: getUrlParam('utm_campaign'),
      utm_term: getUrlParam('utm_term'),
      utm_content: getUrlParam('utm_content'),

      // Ad platform click IDs
      gclid: getUrlParam('gclid'),
      fbclid: getUrlParam('fbclid'),

      // C2: entry-point id (null when absent or malformed)
      entry_point_id: getEntryPointId(),

      // Referrer and landing page
      referrer: document.referrer || null,
      landing_page: window.location.pathname,

      // Timestamp
      captured_at: new Date().toISOString()
    };
  }

  // Captured once, at load, before the iframe exists — same as the embedded
  // widget does during init.
  const attribution = captureAttribution();

  // Create fullpage iframe
  const iframe = document.createElement('iframe');
  iframe.id = 'fullpage-iframe';
  iframe.title = 'Chat Assistant';
  iframe.allow = 'camera *; microphone *; geolocation *';

  // Build iframe URL with fullpage mode flag
  const iframeSrc = window.location.origin + '/iframe.html?t=' + encodeURIComponent(tenantHash) + '&mode=fullpage';
  iframe.src = iframeSrc;

  // The iframe is same-origin BY CONSTRUCTION (its src is built from
  // window.location.origin above), so target it explicitly rather than '*'.
  // Mirrors widget-host.js, which posts to a captured iframeOrigin. This
  // matters more now that attribution (ep id, UTM, referrer) rides these
  // messages: '*' delivers regardless of what the frame's origin turns out
  // to be, so a future change to iframeSrc could silently widen the audience.
  const iframeOrigin = window.location.origin;

  // Handle iframe load
  iframe.onload = function() {
    // Hide loading, show iframe
    document.getElementById('loading-container').style.display = 'none';

    // Send fullpage init command to iframe
    iframe.contentWindow.postMessage({
      type: 'PICASSO_COMMAND',
      action: 'OPEN_CHAT'
    }, iframeOrigin);

    // Also send init message with tenant info.
    // Shape mirrors sendInitMessage() in src/widget-host.js (~line 685).
    // `attribution` is consumed at src/iframe-main.jsx (~line 457).
    iframe.contentWindow.postMessage({
      type: 'PICASSO_INIT',
      tenantHash: tenantHash,
      attribution: attribution,
      config: { mode: 'fullpage' }
    }, iframeOrigin);
  };

  // Handle iframe load errors
  iframe.onerror = function() {
    document.getElementById('loading-container').style.display = 'none';
    document.getElementById('error-container').style.display = 'flex';
  };

  // Add iframe to page
  document.body.appendChild(iframe);

  // Listen for messages from iframe to update page title
  window.addEventListener('message', function(event) {
    if (event.data.type === 'PICASSO_LOADED' && event.data.config) {
      const title = event.data.config.chat_title || event.data.config.branding?.chat_title;
      if (title) {
        document.title = title;
      }
    }
  });
})();

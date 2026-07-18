/**
 * Fullpage Chat Launcher (/go/).
 *
 * Loads the Picasso chat iframe at 100% viewport for QR codes and social
 * links. Unlike the embedded widget, /go/ has no host page — it IS the page —
 * so it captures attribution from its own URL and forwards it into the iframe.
 *
 * Bundled by esbuild (entry: go-loader-entry.js) into dist/<env>/go/loader.js,
 * so it can import the shared attribution module instead of hand-copying it.
 * The page loads the built file as an external <script src="./loader.js">, which
 * keeps the fullpage host surface compatible with a strict CSP
 * (script-src 'self', no 'unsafe-inline').
 */

import { captureAttribution } from './utils/attribution.js';

export function initFullpageLauncher() {
  const urlParams = new URLSearchParams(window.location.search);
  const tenantHash = urlParams.get('t') || urlParams.get('tenant');

  if (!tenantHash) {
    // Show error if no tenant specified
    document.getElementById('loading-container').style.display = 'none';
    document.getElementById('error-container').style.display = 'flex';
    return;
  }

  // Capture attribution (?ep=, UTM, GA client id, referrer) once, at load,
  // before the iframe exists — the same data the embedded widget captures from
  // its host page. Without this, a /go/?t=…&ep=ep_… link would lose its
  // entry-point id and be miscredited to the `website` channel.
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
  // '*' delivers regardless of what the frame's origin turns out to be, and
  // attribution (ep id, UTM, referrer) rides these messages.
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
    // Shape mirrors sendInitMessage() in src/widget-host.js; `attribution` is
    // consumed at src/iframe-main.jsx.
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

  // Listen for messages from the iframe to update the page title.
  window.addEventListener('message', function(event) {
    // Only trust the same-origin iframe we created. Without this, any window
    // holding a handle to this page could postMessage a fake PICASSO_LOADED
    // and set document.title (a small phishing surface).
    if (event.origin !== iframeOrigin) return;
    // Guard event.data before reading .type — a page can postMessage(null),
    // which would throw on `.type`. Same bug class as widget-host.js:311.
    if (!event.data || event.data.type !== 'PICASSO_LOADED' || !event.data.config) return;

    const title = event.data.config.chat_title || event.data.config.branding?.chat_title;
    if (title) {
      document.title = title;
    }
  });
}

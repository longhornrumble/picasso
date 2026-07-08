// Fullpage scheduling launcher.
// Mirrors /go/ (the social-share fullpage host): loads the Picasso iframe app at
// 100% viewport, but in mode=schedule. The tenant is identified PUBLICLY by its
// hash (?t=) — never the raw tenant_id. ?session= carries the §B10 binding the
// redemption handler minted; ?purpose= (reschedule|cancel) selects the framing.
//
// Externalized from an inline <script> so a strict CSP (script-src 'self', no
// 'unsafe-inline') can be enforced on the redemption/reschedule surface.
(function () {
  const urlParams = new URLSearchParams(window.location.search);
  const tenantHash = urlParams.get('t') || urlParams.get('tenant');
  const session = urlParams.get('session');
  const purpose = urlParams.get('purpose');

  if (!tenantHash) {
    document.getElementById('loading-container').style.display = 'none';
    document.getElementById('error-container').style.display = 'flex';
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.id = 'fullpage-iframe';
  iframe.title = 'Scheduling';

  // Build the iframe URL: tenant hash + scheduling mode + (binding) session + purpose.
  let iframeSrc = window.location.origin
    + '/iframe.html?t=' + encodeURIComponent(tenantHash) + '&mode=schedule';
  if (session) iframeSrc += '&session=' + encodeURIComponent(session);
  if (purpose) iframeSrc += '&purpose=' + encodeURIComponent(purpose);
  iframe.src = iframeSrc;

  iframe.onload = function () {
    document.getElementById('loading-container').style.display = 'none';
    // Hand the tenant hash to the iframe app (same handshake /go/ uses).
    iframe.contentWindow.postMessage({
      type: 'PICASSO_INIT',
      tenantHash: tenantHash,
      config: { mode: 'schedule' }
    }, '*');
  };

  iframe.onerror = function () {
    document.getElementById('loading-container').style.display = 'none';
    document.getElementById('error-container').style.display = 'flex';
  };

  document.body.appendChild(iframe);

  // Update the page title from the tenant's branding once the app loads.
  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'PICASSO_LOADED' && event.data.config) {
      const title = event.data.config.chat_title || event.data.config.branding?.chat_title;
      if (title) document.title = title;
    }
  });
})();

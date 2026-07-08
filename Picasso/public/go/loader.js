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

  // Create fullpage iframe
  const iframe = document.createElement('iframe');
  iframe.id = 'fullpage-iframe';
  iframe.title = 'Chat Assistant';
  iframe.allow = 'camera *; microphone *; geolocation *';

  // Build iframe URL with fullpage mode flag
  const iframeSrc = window.location.origin + '/iframe.html?t=' + encodeURIComponent(tenantHash) + '&mode=fullpage';
  iframe.src = iframeSrc;

  // Handle iframe load
  iframe.onload = function() {
    // Hide loading, show iframe
    document.getElementById('loading-container').style.display = 'none';

    // Send fullpage init command to iframe
    iframe.contentWindow.postMessage({
      type: 'PICASSO_COMMAND',
      action: 'OPEN_CHAT'
    }, '*');

    // Also send init message with tenant info
    iframe.contentWindow.postMessage({
      type: 'PICASSO_INIT',
      tenantHash: tenantHash,
      config: { mode: 'fullpage' }
    }, '*');
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

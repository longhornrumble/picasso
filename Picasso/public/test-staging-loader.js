// Staging widget test-page loader.
// Externalized from an inline <script> so the test page keeps working when a
// strict CSP (script-src 'self', no 'unsafe-inline') is enforced on staging.
const urlParams = new URLSearchParams(window.location.search);
const tenantHash = urlParams.get('t') || 'my87674d777bf9';
document.getElementById('tenantHash').textContent = tenantHash;

const script = document.createElement('script');
script.src = 'https://staging.chat.myrecruiter.ai/widget.js';
script.setAttribute('data-tenant', tenantHash);
document.body.appendChild(script);

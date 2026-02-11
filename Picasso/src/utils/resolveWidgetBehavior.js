const MOBILE_BREAKPOINT = 768;

// Host viewport width passed from widget-host.js via PICASSO_INIT postMessage.
// In embedded mode, the iframe's own window.innerWidth reflects the iframe size
// (e.g. 92px when closed), not the host page viewport. This variable stores the
// actual host page viewport width so we can make correct mobile/desktop decisions.
let _hostViewportWidth = null;

/**
 * Set the host page viewport width (called when PICASSO_INIT is received).
 */
export function setHostViewportWidth(width) {
  _hostViewportWidth = width;
}

/**
 * Get the effective viewport width for mobile detection.
 * Prefers host viewport (embedded mode) over iframe's own innerWidth.
 */
function getViewportWidth() {
  if (_hostViewportWidth != null) return _hostViewportWidth;
  if (typeof window !== 'undefined') return window.innerWidth;
  return MOBILE_BREAKPOINT; // default to desktop if no window
}

/**
 * Resolves effective widget behavior settings by merging mobile overrides
 * onto global defaults when the host page viewport is below 768px.
 *
 * Config shape:
 *   widget_behavior: {
 *     start_open: true,
 *     auto_open_delay: 3,
 *     remember_state: true,
 *     mobile: { start_open: false, auto_open_delay: 0 }
 *   }
 *
 * Host viewport >= 768px: returns global settings as-is.
 * Host viewport < 768px:  spreads mobile overrides onto global settings.
 * If no mobile block: identical to today's behavior on all devices.
 */
export function resolveWidgetBehavior(config) {
  const base = config?.widget_behavior || {};
  const { mobile, ...globalSettings } = base;

  if (!mobile || getViewportWidth() >= MOBILE_BREAKPOINT) return base;

  return { ...globalSettings, ...mobile };
}

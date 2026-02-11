const MOBILE_BREAKPOINT = 768;

/**
 * Resolves effective widget behavior settings by merging mobile overrides
 * onto global defaults when the viewport is below the mobile breakpoint (768px).
 *
 * Config shape:
 *   widget_behavior: {
 *     start_open: true,
 *     auto_open_delay: 3,
 *     remember_state: true,
 *     mobile: { start_open: false, auto_open_delay: 0 }
 *   }
 *
 * Viewport >= 768px: returns global settings as-is.
 * Viewport < 768px:  spreads mobile overrides onto global settings.
 * If no mobile block: identical to today's behavior on all devices.
 */
export function resolveWidgetBehavior(config) {
  const base = config?.widget_behavior || {};
  const { mobile, ...globalSettings } = base;

  if (!mobile || typeof window === 'undefined' || window.innerWidth >= MOBILE_BREAKPOINT) return base;

  return { ...globalSettings, ...mobile };
}

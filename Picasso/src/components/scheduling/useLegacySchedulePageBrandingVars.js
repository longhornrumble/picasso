import { useEffect } from 'react';

/**
 * useLegacySchedulePageBrandingVars — minimal legacy-branding-var bridge for
 * the scheduling page ONLY (Hairline redesign W6.2).
 *
 * Context: the old `useCSSVariables.js` / `CSSVariablesProvider` system
 * (~150 CSS custom properties derived from `branding.*`) was deleted as
 * part of the Hairline old-system cleanup — every Hairline surface now
 * derives its palette from `HairlineThemeProvider`'s `--tenant-*` tokens
 * instead. The scheduling page (`?mode=schedule`) is explicitly EXCLUDED
 * from the Hairline redesign (HAIRLINE_REDESIGN_MAPPING.md §7 D8) and its
 * stylesheet (`schedule-page.css`) derives its own local `--sp-*` token set
 * from exactly six of the old vars: `--primary-color`, `--font-color`,
 * `--background-color`, `--border-color`, `--border-radius`,
 * `--font-family`. Deleting the old system out from under it would silently
 * drop per-tenant branding on this page (every tenant would render the
 * generic fallback colors below instead of their own). This hook reproduces
 * ONLY those six properties, with the exact same fallback values the old
 * system used, so the scheduling page's appearance is unchanged.
 *
 * Do not extend this hook. If the scheduling page ever needs more than
 * these six values, give it its own small token set instead of resurrecting
 * the deleted one.
 */
export function useLegacySchedulePageBrandingVars(config) {
  useEffect(() => {
    const branding = config?.branding || {};
    const root = document.documentElement;

    root.style.setProperty('--primary-color', branding.primary_color || '#3b82f6');
    root.style.setProperty('--font-color', branding.font_color || '#374151');
    root.style.setProperty('--background-color', branding.background_color || '#ffffff');
    root.style.setProperty('--border-color', branding.border_color || 'rgba(59, 130, 246, 0.1)');
    root.style.setProperty('--border-radius', ensurePixelUnit(branding.border_radius || '12px'));
    root.style.setProperty('--font-family', branding.font_family || 'system-ui, -apple-system, sans-serif');
  }, [config]);
}

// Reproduced verbatim from the deleted useCSSVariables.js so the scheduling
// page's radius derivation doesn't change (e.g. a numeric 12 -> '12px').
function ensurePixelUnit(value) {
  if (!value) return value;
  if (typeof value === 'number') return `${value}px`;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? value : `${parsed}px`;
}

/**
 * useLegacySchedulePageBrandingVars tests (Hairline redesign W6.2).
 *
 * This hook is the scheduling page's sole remaining bridge to the six
 * `--primary-color`-era CSS vars after the old useCSSVariables.js/
 * CSSVariablesProvider system was deleted. Covers: full branding config,
 * an old-shape config missing `branding` entirely (forward-compatible
 * reads — CLAUDE.md "Schema Discipline"), and a null/pre-fetch config.
 */
import { renderHook } from '@testing-library/react';
import { useLegacySchedulePageBrandingVars } from '../useLegacySchedulePageBrandingVars';

function getVar(name) {
  return document.documentElement.style.getPropertyValue(name);
}

describe('useLegacySchedulePageBrandingVars', () => {
  afterEach(() => {
    [
      '--primary-color',
      '--font-color',
      '--background-color',
      '--border-color',
      '--border-radius',
      '--font-family',
    ].forEach((name) => document.documentElement.style.removeProperty(name));
  });

  test('sets all six vars from a fully-populated branding config', () => {
    const config = {
      branding: {
        primary_color: '#a1905f',
        font_color: '#222222',
        background_color: '#fafafa',
        border_color: 'rgba(1,2,3,0.5)',
        border_radius: 20,
        font_family: 'Georgia, serif',
      },
    };
    renderHook(() => useLegacySchedulePageBrandingVars(config));

    expect(getVar('--primary-color')).toBe('#a1905f');
    expect(getVar('--font-color')).toBe('#222222');
    expect(getVar('--background-color')).toBe('#fafafa');
    expect(getVar('--border-color')).toBe('rgba(1,2,3,0.5)');
    expect(getVar('--border-radius')).toBe('20px'); // numeric -> px unit
    expect(getVar('--font-family')).toBe('Georgia, serif');
  });

  test('falls back to defaults for an old-shape config with no branding field', () => {
    const config = { tenant_id: 'abc123', chat_title: 'Old Tenant' };
    renderHook(() => useLegacySchedulePageBrandingVars(config));

    expect(getVar('--primary-color')).toBe('#3b82f6');
    expect(getVar('--font-color')).toBe('#374151');
    expect(getVar('--background-color')).toBe('#ffffff');
    expect(getVar('--border-color')).toBe('rgba(59, 130, 246, 0.1)');
    expect(getVar('--border-radius')).toBe('12px');
    expect(getVar('--font-family')).toBe('system-ui, -apple-system, sans-serif');
  });

  test('tolerates a null/undefined config (pre-fetch) without throwing', () => {
    expect(() => renderHook(() => useLegacySchedulePageBrandingVars(null))).not.toThrow();
    expect(getVar('--primary-color')).toBe('#3b82f6');
  });
});

/**
 * HairlineThemeProvider.jsx — Hairline redesign token injection provider (W1.3).
 *
 * Reads the tenant's brand fields off the config ALREADY fetched by
 * `ConfigProvider` (no new network calls — see `useConfig()`), derives the
 * 10 `--tenant-*` tokens + font stack via `tenantTheme()` (W1.1), and applies
 * them to `document.documentElement` at runtime.
 *
 * Coexistence (HAIRLINE_WORKPLAN.md ground rule #8): this runs ALONGSIDE the
 * old `useCSSVariables.js` / `CSSVariablesProvider` — it does not read from,
 * modify, or remove that system. The two write disjoint CSS custom-property
 * namespaces (`--tenant-*`/`--hairline*`/`--composer-border` here vs.
 * `--primary-color`-era names there), so both can safely run every render.
 * Removing the old system is W6.2, not this item.
 *
 * Verified config field paths (HAIRLINE_REDESIGN_MAPPING.md §2, confirmed
 * against `ConfigProvider.jsx`'s fallback-config shape and the config-builder
 * schema): `config.branding.primary_color`, `config.branding.secondary_color`,
 * `config.branding.font_family`. Per decision D10, `secondary_color` is read
 * and forwarded but not yet consumed by the derivation engine.
 *
 * Tolerant reads (CLAUDE.md "Schema Discipline"): every field is read with
 * nullish-safe optional chaining, so a config missing `branding` entirely, or
 * missing individual brand fields, or still `null` (pre-fetch) never throws.
 * `tenantTheme()` already defaults a missing/invalid `primaryColor` to the
 * DESIGN_SPEC reference gold (`#a08a4a`) and a missing/unrecognized `fontKey`
 * to the Plus Jakarta Sans stack (this also covers legacy free-text
 * `font_family` values like `"Inter, sans-serif"`, which don't match the new
 * kebab-case enum and so fall back exactly like a missing value would).
 * Given that, this provider deliberately does NOT branch on whether brand
 * fields are present — it always calls `tenantTheme()` and always applies
 * all 10 tokens. For an old-shape config this reproduces the exact same
 * values already sitting in `hairline-tokens.css` (W1.2)'s reference-default
 * `:root` block, so there is no visible change; it's simpler than
 * conditionally skipping the `setProperty` calls and arrives at the same
 * place.
 */
import { useEffect } from 'react';
import { useConfig } from '../hooks/useConfig';
import { tenantTheme } from './tenantTheme';

// New, additive custom property for the derived font stack. Not part of the
// 10-token color ramp `tenantTheme()` returns under `tokens` (those map 1:1
// to DESIGN_SPEC's "Color — tenant-scoped" table); no surface consumes this
// property yet (font-family wiring lands with the screens that need it).
const FONT_FAMILY_PROPERTY = '--tenant-font-family';

export function HairlineThemeProvider({ children }) {
  const { config } = useConfig();

  const primaryColor = config?.branding?.primary_color;
  const secondaryColor = config?.branding?.secondary_color;
  const fontKey = config?.branding?.font_family;

  useEffect(() => {
    const { tokens, fontStack } = tenantTheme({ primaryColor, secondaryColor, fontKey });
    const root = document.documentElement;

    Object.entries(tokens).forEach(([name, value]) => {
      root.style.setProperty(name, value);
    });
    root.style.setProperty(FONT_FAMILY_PROPERTY, fontStack);
  }, [primaryColor, secondaryColor, fontKey]);

  return children;
}

/**
 * tenantTheme.js — Hairline redesign tenant-ramp derivation engine (W1.1).
 *
 * Pure function: `{ primaryColor, secondaryColor, fontKey } -> { tokens, fontStack }`.
 * No DOM access, no CSS injection, no React, no npm dependencies. Applying
 * `tokens` to `documentElement` is a separate item (W1.3) — this module only
 * computes values.
 *
 * Spec: docs/HAIRLINE_WORKPLAN.md (W1.1) and
 * design/hairline/DESIGN_SPEC.md ("Derivation guidance" + the Atlanta Angels
 * reference token table). Per the fidelity rule (HAIRLINE_REDESIGN_MAPPING.md
 * §0), DESIGN_SPEC's exact reference values are authoritative over any
 * summarized guidance elsewhere when the two disagree (see the
 * composer-border note below).
 *
 * -----------------------------------------------------------------------
 * Derivation approach
 * -----------------------------------------------------------------------
 * 1. `accent` = the tenant's primary color with its HSL saturation capped
 *    (never raised) at SATURATION_CAP — hue and lightness pass through
 *    unchanged. This is "desaturated toward the surface": a brand color
 *    that's already muted (e.g. the Atlanta Angels reference gold, ~37%
 *    saturation) is left alone; a fully-saturated brand color (pure blue,
 *    magenta, etc.) gets pulled down to a chroma that reads as "accent",
 *    not "neon."
 * 2. `accent-deep` = `accent` darkened — hue/saturation held fixed, lightness
 *    walked down via binary search — until its contrast ratio against the
 *    warm surface (#fffefb) is >= 4.5:1 (WCAG AA, normal text; the token is
 *    only ever used for bold caps labels per DESIGN_SPEC). The search checks
 *    the *rounded* hex at every step (hslToRgb always rounds to whole
 *    channels), so the returned color genuinely clears the gate — no
 *    continuous-math approximation that rounding could shave back under the
 *    line. If `accent` already clears AA at its own lightness, no darkening
 *    happens.
 * 3. `accent-muted` / `accent-faint` = `accent` linearly mixed toward the
 *    surface in RGB space at increasing weight (25% / 35% surface). Both are
 *    non-text, decorative-only colors (icons, arrows, the "YOU" label) — no
 *    contrast requirement.
 * 4. `tint` / `tint-deep` / `hairline-soft` / `hairline` / `hairline-strong` /
 *    `composer-border` = `accent` mixed toward the surface at successively
 *    *lower* weights (94% surface down to 70% surface — i.e. the strongest
 *    member of this group, composer-border, carries the most accent). This
 *    is one continuous mix ramp; the tint/hairline naming split is about
 *    usage (fills vs. borders), not a break in the math.
 *
 * Every mix is a plain linear RGB blend — no color library, no dependency.
 *
 * -----------------------------------------------------------------------
 * Per-token delta vs. the DESIGN_SPEC Atlanta Angels reference table
 * (input `#a08a4a`; see tenantTheme.test.js for the executable assertion)
 * -----------------------------------------------------------------------
 *   --tenant-accent        #a08a4a  exact match (input's 37% saturation is
 *                                   already under SATURATION_CAP)
 *   --tenant-accent-deep   #87753f  vs #8a7439 — contrast lands at exactly
 *                                   4.500:1 (spec's own swatch is ~4.6:1);
 *                                   both sit right at the AA line by design
 *                                   ("darken to AA", not "darken to match a
 *                                   hand-picked swatch")
 *   --tenant-accent-muted  #b8a776  vs #b4a67a (delta +4/+1/-4)
 *   --tenant-accent-faint  #c1b388  vs #c3b483 (delta -2/-1/+5)
 *   --tenant-tint          #f9f7f0  vs #fbf8ee (delta -2/-1/+2)
 *   --tenant-tint-deep     #f0ebdf  vs #f0ecdd (delta  0/-1/+2)
 *   --hairline-soft        #f1ede0  vs #f2eddc (delta -1/ 0/+4)
 *   --hairline             #ece7d8  vs #ede7d3 (delta -1/ 0/+5)
 *   --hairline-strong      #e7e1cf  vs #e8e2ce (delta -1/-1/+1)
 *   --composer-border      #e3dbc6  vs #e3dcc6 (delta  0/-1/ 0)
 * All deltas are within +-5/255 (<=2%) except accent-deep, which is governed
 * by the AA gate rather than swatch-matching.
 *
 * Deviation from the workplan's shorthand: HAIRLINE_WORKPLAN.md summarizes
 * composer-border as "between hairline-strong and tint in strength."
 * Reverse-solving the mix ratio from DESIGN_SPEC's actual reference hex
 * values shows the opposite: composer-border (~70% surface weight) is
 * *stronger* (more accent, darker) than hairline-strong (~75% surface
 * weight) — not sandwiched between it and tint (~94% surface weight). Per
 * the fidelity rule, DESIGN_SPEC's numbers win; this engine follows them.
 */

const SURFACE = { r: 0xff, g: 0xfe, b: 0xfb }; // #fffefb — warm off-white surface
const DEFAULT_PRIMARY_HEX = '#a08a4a'; // DESIGN_SPEC reference default (Atlanta Angels gold)
const SATURATION_CAP = 0.45; // caps (never raises) accent's HSL saturation
const MIN_ACCENT_DEEP_CONTRAST = 4.5; // WCAG AA, normal text

// Surface-mix weights (fraction of SURFACE blended into `accent`), lightest to
// darkest. See "Derivation approach" step 4 above for why composer-border
// (weakest surface weight in this group) is the *strongest* color of the six.
const MIX = {
  tint: 0.94,
  tintDeep: 0.84,
  hairlineSoft: 0.85,
  hairline: 0.80,
  hairlineStrong: 0.75,
  composerBorder: 0.70,
};
// accent-muted / accent-faint use the same mix operation, just at much lower
// surface weight (they stay close to raw accent — decorative, not a fill).
const ACCENT_MUTED_MIX = 0.25;
const ACCENT_FAINT_MIX = 0.35;

/**
 * fontKey -> CSS font-family stack. Family names match the @font-face
 * declarations in src/styles/fonts.css exactly. Unknown/legacy free-text
 * values (including undefined/missing) fall back to the Plus Jakarta Sans
 * stack, the redesign's reference/default family.
 */
const FONT_STACKS = {
  'plus-jakarta-sans': '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  inter: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  lato: '"Lato", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  arial: 'Arial, Helvetica, sans-serif', // system font — no self-hosted files
};
const DEFAULT_FONT_STACK = FONT_STACKS['plus-jakarta-sans'];

// ---------------------------------------------------------------------------
// Color math (hex <-> HSL <-> RGB, linear mix, WCAG contrast). Deliberately
// reimplemented here — do not import from the old useCSSVariables.js
// (lightenColor/darkenColor/determineContrastColor); this engine replaces it.
// ---------------------------------------------------------------------------

/** Parses a 3- or 6-digit hex color string. Returns null if invalid. */
function parseHexColor(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function toHex({ r, g, b }) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const c = (n) => clamp(n).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** RGB (0-255 channels) -> HSL ({h: 0-360, s: 0-1, l: 0-1}). */
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  let h = 0;
  let s = 0;
  // Guard: for achromatic colors (delta === 0 — includes pure gray and
  // black/white), hue is undefined; fix it at 0 rather than dividing by
  // zero. This is the pure-gray stress case from the test matrix.
  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / delta) % 6;
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

/** HSL ({h: 0-360, s: 0-1, l: 0-1}) -> RGB (0-255 channels, rounded). */
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1;
  let g1;
  let b1;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/** Linear RGB blend: `weight` is the fraction of `to` mixed into `from`. */
function mixRgb(from, to, weight) {
  return {
    r: from.r + weight * (to.r - from.r),
    g: from.g + weight * (to.g - from.g),
    b: from.b + weight * (to.b - from.b),
  };
}

/** WCAG relative luminance of an RGB color (0-255 channels). */
function relativeLuminance({ r, g, b }) {
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two RGB colors (0-255 channels). */
function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Darkens an HSL color (fixed h/s, decreasing l) until its rounded RGB
 * clears `minRatio` contrast against `surfaceRgb`. Binary search over the
 * continuous L value. `hslToRgb` rounds to whole hex channels internally, so
 * every candidate the search evaluates (including the final one it returns)
 * is already checked against the *rounded* color, not a continuous
 * approximation — there is no separate rounding step that could shave a
 * passing result back under the line. L = 0 always yields RGB (0,0,0),
 * which trivially clears any realistic ratio against a near-white surface,
 * so `lo` starts at a known-good value and the search always converges.
 */
function darkenForContrast(h, s, startL, surfaceRgb, minRatio) {
  const startRgb = hslToRgb(h, s, startL);
  if (contrastRatio(startRgb, surfaceRgb) >= minRatio) {
    return startRgb; // already meets AA at the accent's own lightness
  }
  let lo = 0; // known-good (contrast always passes at L=0)
  let hi = startL; // known-bad (checked above)
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(hslToRgb(h, s, mid), surfaceRgb) >= minRatio) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hslToRgb(h, s, lo);
}

/**
 * Derives the Hairline tenant color ramp + font stack from a tenant's brand
 * fields.
 *
 * @param {object} [brand]
 * @param {string} [brand.primaryColor] - hex color (3 or 6 digit). Falls
 *   back to the DESIGN_SPEC reference gold if missing/invalid.
 * @param {string} [brand.secondaryColor] - accepted but intentionally NOT
 *   consumed. Per decision D10 (HAIRLINE_REDESIGN_MAPPING.md §7), secondary
 *   color's role in the ramp is undecided; the widget consumes primary only
 *   until D10 is resolved, rather than inventing a visual role the design
 *   didn't define.
 * @param {string} [brand.fontKey] - one of 'plus-jakarta-sans' | 'inter' |
 *   'lato' | 'arial'. Falls back to 'plus-jakarta-sans' for any other value.
 * @returns {{ tokens: Record<string,string>, fontStack: string }}
 */
export function tenantTheme({ primaryColor, secondaryColor, fontKey } = {}) {
  void secondaryColor; // D10 — intentionally unused, see @param doc above

  const brandRgb = parseHexColor(primaryColor) || parseHexColor(DEFAULT_PRIMARY_HEX);
  const { h, s, l } = rgbToHsl(brandRgb.r, brandRgb.g, brandRgb.b);
  const accentS = Math.min(s, SATURATION_CAP);

  const accentRgb = hslToRgb(h, accentS, l);
  const accentDeepRgb = darkenForContrast(h, accentS, l, SURFACE, MIN_ACCENT_DEEP_CONTRAST);
  const accentMutedRgb = mixRgb(accentRgb, SURFACE, ACCENT_MUTED_MIX);
  const accentFaintRgb = mixRgb(accentRgb, SURFACE, ACCENT_FAINT_MIX);
  const tintRgb = mixRgb(accentRgb, SURFACE, MIX.tint);
  const tintDeepRgb = mixRgb(accentRgb, SURFACE, MIX.tintDeep);
  const hairlineSoftRgb = mixRgb(accentRgb, SURFACE, MIX.hairlineSoft);
  const hairlineRgb = mixRgb(accentRgb, SURFACE, MIX.hairline);
  const hairlineStrongRgb = mixRgb(accentRgb, SURFACE, MIX.hairlineStrong);
  const composerBorderRgb = mixRgb(accentRgb, SURFACE, MIX.composerBorder);

  return {
    tokens: {
      '--tenant-accent': toHex(accentRgb),
      '--tenant-accent-deep': toHex(accentDeepRgb),
      '--tenant-accent-muted': toHex(accentMutedRgb),
      '--tenant-accent-faint': toHex(accentFaintRgb),
      '--tenant-tint': toHex(tintRgb),
      '--tenant-tint-deep': toHex(tintDeepRgb),
      '--hairline': toHex(hairlineRgb),
      '--hairline-soft': toHex(hairlineSoftRgb),
      '--hairline-strong': toHex(hairlineStrongRgb),
      '--composer-border': toHex(composerBorderRgb),
    },
    fontStack: FONT_STACKS[fontKey] || DEFAULT_FONT_STACK,
  };
}

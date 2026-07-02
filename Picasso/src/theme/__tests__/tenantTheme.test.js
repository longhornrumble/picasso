import { describe, it, expect } from '@jest/globals';
import { tenantTheme } from '../tenantTheme';

// ---------------------------------------------------------------------------
// Independent verification helpers.
//
// These are deliberately NOT imported from tenantTheme.js: a bug in the
// engine's own contrast/lightness math would otherwise silently agree with
// itself. This is the hard accessibility gate for the redesign, so the test
// re-derives contrast and lightness from scratch against the engine's hex
// output.
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }) {
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(hexA, hexB) {
  const l1 = relativeLuminance(hexToRgb(hexA));
  const l2 = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Perceptual lightness proxy for ordering checks (0-1, higher = lighter). */
function lightness(hex) {
  return relativeLuminance(hexToRgb(hex));
}

const SURFACE_HEX = '#fffefb';
const AA_MIN = 4.5;

const TOKEN_NAMES = [
  '--tenant-accent',
  '--tenant-accent-deep',
  '--tenant-accent-muted',
  '--tenant-accent-faint',
  '--tenant-tint',
  '--tenant-tint-deep',
  '--hairline',
  '--hairline-soft',
  '--hairline-strong',
  '--composer-border',
];

const HEX_RE = /^#[0-9a-f]{6}$/i;

/** Shared assertions run against every matrix color. */
function expectValidRamp(tokens) {
  // (c) all 10 tokens emitted, each a well-formed hex color
  TOKEN_NAMES.forEach((name) => {
    expect(tokens).toHaveProperty(name);
    expect(tokens[name]).toMatch(HEX_RE);
  });

  // (a) accent-deep meets AA (>= 4.5:1) on the warm surface — the hard gate
  const ratio = contrastRatio(tokens['--tenant-accent-deep'], SURFACE_HEX);
  expect(ratio).toBeGreaterThanOrEqual(AA_MIN);

  // (b) tint/hairline lightness ordering NEVER INVERTS:
  //   - within the tint family: tint at least as light as tint-deep
  //   - within the hairline family: soft at least as light as hairline, which
  //     is at least as light as hairline-strong ("strength" order)
  //   - accent-deep is never lighter than accent; accent-faint is never
  //     lighter... i.e. never *darker* than accent-muted
  //
  // Every one of these uses >= rather than a strict >, because a near-white
  // brand color legitimately collapses most of the ramp: once `accent`
  // itself is only ~1-2 RGB units from the surface, mixing it toward the
  // surface at any of these ratios (70-94%) rounds to the same 8-bit hex.
  // That's a precision ceiling, not an ordering bug -- ties are fine,
  // *inversions* are not. Strict, per-relationship inequality checks (with
  // the near-white exception spelled out per pair) live in their own
  // describe blocks below, alongside the exact "accent-deep only darkens
  // when the un-darkened accent fails AA" invariant.
  expect(lightness(tokens['--tenant-tint'])).toBeGreaterThanOrEqual(lightness(tokens['--tenant-tint-deep']));
  expect(lightness(tokens['--hairline-soft'])).toBeGreaterThanOrEqual(lightness(tokens['--hairline']));
  expect(lightness(tokens['--hairline'])).toBeGreaterThanOrEqual(lightness(tokens['--hairline-strong']));
  expect(lightness(tokens['--tenant-accent'])).toBeGreaterThanOrEqual(lightness(tokens['--tenant-accent-deep']));
  expect(lightness(tokens['--tenant-accent-muted'])).toBeGreaterThanOrEqual(lightness(tokens['--tenant-accent']));
  expect(lightness(tokens['--tenant-accent-faint'])).toBeGreaterThanOrEqual(lightness(tokens['--tenant-accent-muted']));
}

// Module scope so multiple describe blocks below can reuse the same
// fixture set (the AA-safety sweep, plus the two more precise ordering
// checks that follow it).
const MATRIX = {
  'reference gold (Atlanta Angels)': '#a08a4a',
  emerald: '#10B981',
  blue: '#0066CC',
  magenta: '#AA0066',
  'near-white': '#fefdf8',
  'near-black': '#0a0908',
  'pure gray': '#808080',
};

describe('tenantTheme', () => {
  describe('color matrix', () => {
    Object.entries(MATRIX).forEach(([label, primaryColor]) => {
      it(`derives a valid, AA-safe ramp for ${label} (${primaryColor})`, () => {
        const { tokens } = tenantTheme({ primaryColor, fontKey: 'plus-jakarta-sans' });
        expectValidRamp(tokens);
      });
    });

    it('never throws for the achromatic stress cases (no divide-by-zero in HSL math)', () => {
      ['#808080', '#000000', '#ffffff', '#fefdf8', '#0a0908'].forEach((primaryColor) => {
        expect(() => tenantTheme({ primaryColor })).not.toThrow();
      });
    });

    // The 7-color matrix above happens to land in only 4 of the 6 hue
    // sextants the internal hslToRgb conversion branches on (hue-to-RGB is
    // a standard 6-case piecewise formula, one case per 60deg of the color
    // wheel). These two extra fixtures land in the remaining two sextants
    // (yellow-green ~90deg, blue-violet ~264deg) for full branch coverage
    // of that helper.
    it.each([
      ['yellow-green (~90deg hue)', '#80FF00'],
      ['blue-violet (~264deg hue)', '#6600FF'],
    ])('derives a valid, AA-safe ramp for %s (%s)', (label, primaryColor) => {
      const { tokens } = tenantTheme({ primaryColor });
      expectValidRamp(tokens);
    });
  });

  describe('accent-deep darkens exactly when needed, and only when needed', () => {
    // Tighter than the >= tolerance in expectValidRamp: for each fixture,
    // independently check whether `accent` alone already clears the AA gate
    // against the surface. If it does (blue, magenta, near-black -- all
    // naturally dark/saturated enough already), accent-deep must be
    // byte-identical to accent (no gratuitous darkening). If it doesn't
    // (gold, emerald, near-white, pure gray), accent-deep must be strictly
    // darker.
    Object.entries(MATRIX).forEach(([label, primaryColor]) => {
      it(`${label} (${primaryColor})`, () => {
        const { tokens } = tenantTheme({ primaryColor });
        const accentAlreadyPasses = contrastRatio(tokens['--tenant-accent'], SURFACE_HEX) >= AA_MIN;
        if (accentAlreadyPasses) {
          expect(tokens['--tenant-accent-deep']).toBe(tokens['--tenant-accent']);
        } else {
          expect(lightness(tokens['--tenant-accent-deep'])).toBeLessThan(lightness(tokens['--tenant-accent']));
        }
      });
    });
  });

  describe('family ordering is strict, except at the near-white extreme', () => {
    // Pairs are [lighter token, darker token]. "lighter" must stay strictly
    // lighter than "darker" for every fixture except the near-white brand:
    // there, `accent` itself is only ~1-2 RGB units from the surface, so
    // every mix ratio in the 70-94% range rounds to the same 8-bit hex (see
    // expectValidRamp's comment above).
    const PAIRS = [
      ['--tenant-tint', '--tenant-tint-deep'],
      ['--hairline-soft', '--hairline'],
      ['--hairline', '--hairline-strong'],
      ['--tenant-accent-faint', '--tenant-accent-muted'],
    ];

    Object.entries(MATRIX).forEach(([label, primaryColor]) => {
      const { tokens } = tenantTheme({ primaryColor });
      PAIRS.forEach(([lighterName, darkerName]) => {
        it(`${label}: ${lighterName} vs ${darkerName}`, () => {
          const lighter = lightness(tokens[lighterName]);
          const darker = lightness(tokens[darkerName]);
          if (label === 'near-white') {
            expect(lighter).toBeGreaterThanOrEqual(darker);
          } else {
            expect(lighter).toBeGreaterThan(darker);
          }
        });
      });
    });
  });

  describe('reference reproduction (Atlanta Angels, input #a08a4a)', () => {
    // DESIGN_SPEC.md "Color — tenant-scoped" table. accent-deep is excluded
    // from the tight tolerance below and checked separately (contrast-gate
    // driven, not swatch-matching driven — see tenantTheme.js header comment
    // for why #87753f vs the spec's #8a7439 is an expected, documented
    // deviation).
    const REFERENCE = {
      '--tenant-accent': '#a08a4a',
      '--tenant-accent-muted': '#b4a67a',
      '--tenant-accent-faint': '#c3b483',
      '--tenant-tint': '#fbf8ee',
      '--tenant-tint-deep': '#f0ecdd',
      '--hairline': '#ede7d3',
      '--hairline-soft': '#f2eddc',
      '--hairline-strong': '#e8e2ce',
      '--composer-border': '#e3dcc6',
    };
    // Max per-channel delta (0-255) tolerated vs. the spec's hand-authored
    // swatches. The engine's own worst observed delta is 5/255 (~2%); this
    // budgets some headroom around that measured worst case.
    const TOLERANCE = 8;

    const { tokens } = tenantTheme({ primaryColor: '#a08a4a', fontKey: 'plus-jakarta-sans' });

    it('reproduces --tenant-accent exactly (input saturation is already under the cap)', () => {
      expect(tokens['--tenant-accent']).toBe('#a08a4a');
    });

    Object.entries(REFERENCE).forEach(([name, referenceHex]) => {
      it(`reproduces ${name} within tolerance`, () => {
        const got = hexToRgb(tokens[name]);
        const want = hexToRgb(referenceHex);
        expect(Math.abs(got.r - want.r)).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(got.g - want.g)).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(got.b - want.b)).toBeLessThanOrEqual(TOLERANCE);
      });
    });

    it('derives --tenant-accent-deep at/above the AA gate, close to the spec swatch', () => {
      // Spec's own reference (#8a7439) is documented as ~4.6:1 -- i.e. it
      // also sits right at the AA line. This engine "darkens to AA" rather
      // than "darkens to match a hand-picked swatch", so we assert the gate
      // plus a looser proximity check instead of a tight hex match.
      const ratio = contrastRatio(tokens['--tenant-accent-deep'], SURFACE_HEX);
      expect(ratio).toBeGreaterThanOrEqual(AA_MIN);
      const got = hexToRgb(tokens['--tenant-accent-deep']);
      const want = hexToRgb('#8a7439');
      expect(Math.abs(got.r - want.r)).toBeLessThanOrEqual(12);
      expect(Math.abs(got.g - want.g)).toBeLessThanOrEqual(12);
      expect(Math.abs(got.b - want.b)).toBeLessThanOrEqual(12);
    });
  });

  describe('font resolution', () => {
    it('returns the Plus Jakarta Sans stack (matches @font-face family name)', () => {
      const { fontStack } = tenantTheme({ primaryColor: '#a08a4a', fontKey: 'plus-jakarta-sans' });
      expect(fontStack).toContain('"Plus Jakarta Sans"');
    });

    it('returns the Inter stack', () => {
      const { fontStack } = tenantTheme({ primaryColor: '#a08a4a', fontKey: 'inter' });
      expect(fontStack).toContain('"Inter"');
    });

    it('returns the Lato stack', () => {
      const { fontStack } = tenantTheme({ primaryColor: '#a08a4a', fontKey: 'lato' });
      expect(fontStack).toContain('"Lato"');
    });

    it('returns the Arial (system) stack', () => {
      const { fontStack } = tenantTheme({ primaryColor: '#a08a4a', fontKey: 'arial' });
      expect(fontStack).toBe('Arial, Helvetica, sans-serif');
    });

    it('falls back to the Plus Jakarta Sans stack for an unknown/legacy free-text value', () => {
      const { fontStack } = tenantTheme({ primaryColor: '#a08a4a', fontKey: 'Comic Sans MS' });
      expect(fontStack).toContain('"Plus Jakarta Sans"');
    });

    it('falls back to the Plus Jakarta Sans stack when fontKey is missing', () => {
      const { fontStack } = tenantTheme({ primaryColor: '#a08a4a' });
      expect(fontStack).toContain('"Plus Jakarta Sans"');
    });
  });

  describe('robustness / forward-compatible reads', () => {
    it('falls back to the reference default color when primaryColor is missing', () => {
      const { tokens } = tenantTheme({});
      expect(tokens['--tenant-accent']).toBe('#a08a4a');
    });

    it('falls back to the reference default color when primaryColor is invalid', () => {
      const { tokens } = tenantTheme({ primaryColor: 'not-a-color' });
      expect(tokens['--tenant-accent']).toBe('#a08a4a');
    });

    it('does not throw when called with no arguments at all', () => {
      expect(() => tenantTheme()).not.toThrow();
    });

    it('accepts a 3-digit hex primaryColor', () => {
      const { tokens } = tenantTheme({ primaryColor: '#0bc' });
      expect(tokens['--tenant-accent']).toMatch(HEX_RE);
    });
  });

  describe('D10 — secondaryColor is captured but not consumed', () => {
    it('produces identical tokens regardless of secondaryColor', () => {
      const a = tenantTheme({ primaryColor: '#10B981', secondaryColor: '#000000' });
      const b = tenantTheme({ primaryColor: '#10B981', secondaryColor: '#AA0066' });
      const c = tenantTheme({ primaryColor: '#10B981' }); // absent entirely
      expect(a.tokens).toEqual(b.tokens);
      expect(a.tokens).toEqual(c.tokens);
    });
  });
});

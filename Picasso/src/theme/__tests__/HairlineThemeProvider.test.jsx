import { render } from '@testing-library/react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { HairlineThemeProvider } from '../HairlineThemeProvider';
import { tenantTheme } from '../tenantTheme';

// Mock the config hook directly rather than mounting a real ConfigProvider
// (which performs a real fetch on mount) — this test only cares about how
// HairlineThemeProvider reacts to whatever `useConfig()` returns, per the
// Schema Discipline forward-compatible-reads contract (CLAUDE.md).
const mockUseConfig = jest.fn();
jest.mock('../../hooks/useConfig', () => ({
  useConfig: (...args) => mockUseConfig(...args),
}));

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

function readAppliedTokens() {
  const root = document.documentElement;
  const applied = {};
  TOKEN_NAMES.forEach((name) => {
    applied[name] = root.style.getPropertyValue(name);
  });
  applied['--tenant-font-family'] = root.style.getPropertyValue('--tenant-font-family');
  return applied;
}

describe('HairlineThemeProvider', () => {
  beforeEach(() => {
    mockUseConfig.mockReset();
    // Clear any tokens a previous test applied to documentElement.
    TOKEN_NAMES.concat('--tenant-font-family').forEach((name) => {
      document.documentElement.style.removeProperty(name);
    });
  });

  it('renders children unchanged', () => {
    mockUseConfig.mockReturnValue({ config: { branding: { primary_color: '#a08a4a' } } });

    const { getByText } = render(
      <HairlineThemeProvider>
        <div>child content</div>
      </HairlineThemeProvider>
    );

    expect(getByText('child content')).toBeInTheDocument();
  });

  // --- Forward-compatible reads (CLAUDE.md Schema Discipline) ---------------
  // Old-shape-config fixtures: configs written before `branding` (or any of
  // its brand fields) existed. The provider must apply the reference-default
  // ramp rather than crash on the missing fields.

  it('does not crash and applies reference defaults when config is null (pre-fetch state)', () => {
    mockUseConfig.mockReturnValue({ config: null });

    expect(() =>
      render(
        <HairlineThemeProvider>
          <span>ok</span>
        </HairlineThemeProvider>
      )
    ).not.toThrow();

    const expected = tenantTheme({});
    const applied = readAppliedTokens();
    TOKEN_NAMES.forEach((name) => {
      expect(applied[name]).toBe(expected.tokens[name]);
    });
    expect(applied['--tenant-font-family']).toBe(expected.fontStack);
  });

  it('does not crash and applies reference defaults when config has no branding key at all (old-shape config)', () => {
    // Fixture: a pre-Hairline tenant config shape — no `branding` object.
    mockUseConfig.mockReturnValue({
      config: { chat_title: 'Legacy Tenant', welcome_message: 'Hi!' },
    });

    expect(() =>
      render(
        <HairlineThemeProvider>
          <span>ok</span>
        </HairlineThemeProvider>
      )
    ).not.toThrow();

    const expected = tenantTheme({});
    const applied = readAppliedTokens();
    TOKEN_NAMES.forEach((name) => {
      expect(applied[name]).toBe(expected.tokens[name]);
    });
    expect(applied['--tenant-font-family']).toBe(expected.fontStack);
  });

  it('does not crash and applies reference defaults when branding exists but every brand field is absent', () => {
    mockUseConfig.mockReturnValue({ config: { branding: {} } });

    expect(() =>
      render(
        <HairlineThemeProvider>
          <span>ok</span>
        </HairlineThemeProvider>
      )
    ).not.toThrow();

    const expected = tenantTheme({});
    const applied = readAppliedTokens();
    TOKEN_NAMES.forEach((name) => {
      expect(applied[name]).toBe(expected.tokens[name]);
    });
  });

  it('falls back gracefully when font_family is legacy free-text (pre-Hairline configs)', () => {
    mockUseConfig.mockReturnValue({
      config: { branding: { primary_color: '#a08a4a', font_family: 'Inter, sans-serif' } },
    });

    render(
      <HairlineThemeProvider>
        <span>ok</span>
      </HairlineThemeProvider>
    );

    const expected = tenantTheme({ primaryColor: '#a08a4a', fontKey: 'Inter, sans-serif' });
    const applied = readAppliedTokens();
    expect(applied['--tenant-font-family']).toBe(expected.fontStack);
  });

  // --- Real per-tenant derivation --------------------------------------------

  it('applies a tenant-specific ramp derived from branding.primary_color', () => {
    mockUseConfig.mockReturnValue({
      config: { branding: { primary_color: '#0066CC', font_family: 'inter' } },
    });

    render(
      <HairlineThemeProvider>
        <span>ok</span>
      </HairlineThemeProvider>
    );

    const expected = tenantTheme({ primaryColor: '#0066CC', fontKey: 'inter' });
    const applied = readAppliedTokens();
    TOKEN_NAMES.forEach((name) => {
      expect(applied[name]).toBe(expected.tokens[name]);
    });
    expect(applied['--tenant-font-family']).toBe(expected.fontStack);

    // And it must differ from the reference-default ramp (Atlanta Angels gold).
    const referenceDefault = tenantTheme({});
    expect(applied['--tenant-accent']).not.toBe(referenceDefault.tokens['--tenant-accent']);
  });

  it('re-derives tokens when the config brand fields change (useEffect dependency array)', () => {
    mockUseConfig.mockReturnValue({
      config: { branding: { primary_color: '#AA0066' } },
    });

    const { rerender } = render(
      <HairlineThemeProvider>
        <span>ok</span>
      </HairlineThemeProvider>
    );

    const firstAccent = document.documentElement.style.getPropertyValue('--tenant-accent');
    expect(firstAccent).toBe(tenantTheme({ primaryColor: '#AA0066' }).tokens['--tenant-accent']);

    mockUseConfig.mockReturnValue({
      config: { branding: { primary_color: '#10B981' } },
    });
    rerender(
      <HairlineThemeProvider>
        <span>ok</span>
      </HairlineThemeProvider>
    );

    const secondAccent = document.documentElement.style.getPropertyValue('--tenant-accent');
    expect(secondAccent).toBe(tenantTheme({ primaryColor: '#10B981' }).tokens['--tenant-accent']);
    expect(secondAccent).not.toBe(firstAccent);
  });
});

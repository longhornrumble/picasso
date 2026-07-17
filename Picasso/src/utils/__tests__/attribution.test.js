/**
 * @jest-environment-options {"url": "https://example.org/programs"}
 */

/**
 * Attribution capture — contract tests against the REAL implementation.
 *
 * Why this file matters: before src/utils/attribution.js was extracted, these
 * functions lived on a closure-private object inside widget-host.js with no
 * export path. Every test that "covered" them actually re-implemented them in
 * a harness and asserted the harness against itself — so they would have
 * passed even if the real implementation were deleted. These tests import the
 * real functions.
 */

import {
  ENTRY_POINT_ID_RE,
  captureAttribution,
  getEntryPointId,
  getGAClientId,
  getUrlParam,
} from '../attribution.js';

/** Point the jsdom page at a URL without replacing window.location. */
function setSearch(search) {
  window.history.replaceState({}, '', '/programs' + search);
}

function setReferrer(referrer) {
  Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
}

beforeEach(() => {
  setSearch('');
  setReferrer('');
});

afterEach(() => {
  document.cookie = '_ga=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  jest.restoreAllMocks();
});

describe('ENTRY_POINT_ID_RE (C2 locked contract)', () => {
  it('is not a global regex (a /g flag would make .test() stateful across calls)', () => {
    expect(ENTRY_POINT_ID_RE.global).toBe(false);
  });

  it.each([
    ['minimum 8 chars', 'ep_ABCDEF12'],
    ['26-char ULID suffix', 'ep_01ARZ3NDEKTSV4RRFFQ69G5FAV'],
    ['maximum 64 chars', 'ep_' + 'a'.repeat(64)],
    ['mixed case and digits', 'ep_aB3dE6fG9h'],
  ])('accepts %s', (_label, id) => {
    expect(ENTRY_POINT_ID_RE.test(id)).toBe(true);
  });

  it.each([
    ['7 chars (below minimum)', 'ep_ABCDEF1'],
    ['65 chars (above maximum)', 'ep_' + 'a'.repeat(65)],
    ['missing ep_ prefix', '01ARZ3NDEKTSV4RRFFQ69G5FAV'],
    ['wrong prefix case', 'EP_ABCDEF12'],
    ['hyphen', 'ep_ABCDEF-12'],
    ['underscore in suffix', 'ep_ABCDEF_12'],
    ['empty suffix', 'ep_'],
    ['leading whitespace', ' ep_ABCDEF12'],
    ['trailing newline (anchors must hold)', 'ep_ABCDEF12\n'],
  ])('rejects %s', (_label, id) => {
    expect(ENTRY_POINT_ID_RE.test(id)).toBe(false);
  });
});

describe('getUrlParam', () => {
  it('reads a param from the current page URL', () => {
    setSearch('?utm_source=newsletter');
    expect(getUrlParam('utm_source')).toBe('newsletter');
  });

  it('returns null for an absent param', () => {
    setSearch('?utm_source=newsletter');
    expect(getUrlParam('utm_medium')).toBeNull();
  });

  it('returns null when there is no query string at all', () => {
    setSearch('');
    expect(getUrlParam('utm_source')).toBeNull();
  });

  it('decodes percent-encoded values', () => {
    setSearch('?utm_campaign=' + encodeURIComponent('spring appeal & gala'));
    expect(getUrlParam('utm_campaign')).toBe('spring appeal & gala');
  });
});

describe('getGAClientId', () => {
  it('extracts the client id from a well-formed _ga cookie', () => {
    document.cookie = '_ga=GA1.2.123456789.1702900000';
    expect(getGAClientId()).toBe('123456789.1702900000');
  });

  it('returns null when no _ga cookie is present', () => {
    expect(getGAClientId()).toBeNull();
  });

  it('returns null for a malformed _ga cookie with too few parts', () => {
    document.cookie = '_ga=GA1.2';
    expect(getGAClientId()).toBeNull();
  });

  it('is not confused by other cookies sharing a prefix', () => {
    document.cookie = '_gat=1';
    document.cookie = '_gid=GA1.2.999.888';
    expect(getGAClientId()).toBeNull();
  });
});

describe('getEntryPointId (C2 capture)', () => {
  it('returns a valid ?ep=', () => {
    setSearch('?ep=ep_01ARZ3NDEKTSV4RRFFQ69G5FAV');
    expect(getEntryPointId()).toBe('ep_01ARZ3NDEKTSV4RRFFQ69G5FAV');
  });

  it('returns null when ?ep= is absent', () => {
    setSearch('?utm_source=google');
    expect(getEntryPointId()).toBeNull();
  });

  it.each([
    ['too short', 'ep_short'],
    ['no prefix', '01ARZ3NDEKTSV4RRFFQ69G5FAV'],
    ['illegal characters', 'ep_not-valid!!'],
  ])('nulls a malformed ep (%s) rather than forwarding junk downstream', (_label, bad) => {
    setSearch('?ep=' + encodeURIComponent(bad));
    expect(getEntryPointId()).toBeNull();
  });
});

describe('captureAttribution', () => {
  it('captures the full attribution shape', () => {
    document.cookie = '_ga=GA1.2.123456789.1702900000';
    setReferrer('https://facebook.com/somepage');
    setSearch(
      '?ep=ep_01ARZ3NDEKTSV4RRFFQ69G5FAV&utm_source=fb&utm_medium=social' +
        '&utm_campaign=spring&utm_term=mentor&utm_content=hero&gclid=g1&fbclid=f1'
    );

    expect(captureAttribution()).toEqual({
      ga_client_id: '123456789.1702900000',
      utm_source: 'fb',
      utm_medium: 'social',
      utm_campaign: 'spring',
      utm_term: 'mentor',
      utm_content: 'hero',
      gclid: 'g1',
      fbclid: 'f1',
      entry_point_id: 'ep_01ARZ3NDEKTSV4RRFFQ69G5FAV',
      referrer: 'https://facebook.com/somepage',
      landing_page: '/programs',
      captured_at: expect.any(String),
    });
  });

  it('nulls every optional field on a bare direct visit', () => {
    const a = captureAttribution();

    expect(a.ga_client_id).toBeNull();
    expect(a.utm_source).toBeNull();
    expect(a.entry_point_id).toBeNull();
    expect(a.referrer).toBeNull();
    expect(a.gclid).toBeNull();
    // landing_page is always present — it comes from the URL, not a param.
    expect(a.landing_page).toBe('/programs');
  });

  it('emits an ISO-8601 captured_at', () => {
    const { captured_at } = captureAttribution();
    expect(captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(Date.parse(captured_at))).toBe(false);
  });

  it('throws on an unparseable referrer — documented, NOT reachable in practice', () => {
    // The debug-log branch runs `new URL(attribution.referrer).hostname`,
    // which throws on a non-absolute URL. Deliberately NOT guarded:
    //
    //  - document.referrer is set by the browser and is always either '' or a
    //    valid absolute URL, so this input cannot occur in production. Only a
    //    test (or a page monkey-patching document.referrer) can produce it.
    //  - This module was extracted verbatim from widget-host.js and that
    //    extraction is deliberately behavior-neutral: hardening here would
    //    change what every tenant's widget does, inside a refactor whose whole
    //    claim is that it changes nothing.
    //
    // Pinned so the behavior is a decision rather than a surprise. If
    // document.referrer ever becomes untrusted input, this is the line to fix.
    setReferrer('not-a-url');
    expect(() => captureAttribution()).toThrow('Invalid URL');
  });
});

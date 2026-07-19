/**
 * Tests for mis-embed (sandboxed iframe) detection — embedContext.js.
 * The Wix "Embed HTML" element case (Atlanta Angels, 2026-07-18): the embed
 * snippet runs inside a sandboxed filesusr.com iframe, so position:fixed pins
 * to that box instead of the browser viewport.
 */
import { isFramedEmbed, buildMisEmbedReport, reportMisEmbed } from '../embedContext.js';

const topLevelWin = () => {
  const win = {};
  win.self = win;
  win.top = win;
  return win;
};

const framedWin = (overrides = {}) => {
  const win = {
    location: { hostname: 'www-atlantaangels-org.filesusr.com' },
    document: { referrer: 'https://www.atlantaangels.org/' },
    ...overrides
  };
  win.self = win;
  win.top = {}; // different object = framed
  return win;
};

describe('isFramedEmbed', () => {
  test('false when running in the top-level page', () => {
    expect(isFramedEmbed(topLevelWin())).toBe(false);
  });

  test('true when self !== top (sandboxed builder iframe)', () => {
    expect(isFramedEmbed(framedWin())).toBe(true);
  });

  test('true when touching top throws (cross-origin)', () => {
    const win = {};
    win.self = win;
    Object.defineProperty(win, 'top', {
      get() {
        throw new Error('cross-origin');
      }
    });
    expect(isFramedEmbed(win)).toBe(true);
  });
});

describe('buildMisEmbedReport', () => {
  test('carries hostnames only, lowercased', () => {
    const report = buildMisEmbedReport(
      framedWin({ location: { hostname: 'WWW-Atlantaangels-Org.Filesusr.Com' } })
    );
    expect(report).toEqual({
      type: 'embed_sandboxed_frame',
      frame_host: 'www-atlantaangels-org.filesusr.com',
      page_host: 'www.atlantaangels.org'
    });
  });

  test('empty referrer → empty page_host, never the raw string', () => {
    const report = buildMisEmbedReport(framedWin({ document: { referrer: '' } }));
    expect(report.page_host).toBe('');
  });

  test('hostname failing the allowlist is dropped', () => {
    const report = buildMisEmbedReport(
      framedWin({ location: { hostname: 'evil\nhost=spoofed' } })
    );
    expect(report.frame_host).toBe('');
  });

  test('unreadable location (opaque sandbox) → empty frame_host', () => {
    const win = framedWin();
    Object.defineProperty(win, 'location', {
      get() {
        throw new Error('opaque');
      }
    });
    expect(buildMisEmbedReport(win).frame_host).toBe('');
  });
});

describe('reportMisEmbed', () => {
  const ENDPOINT = 'https://staging.chat.myrecruiter.ai/Master_Function?action=log_error';

  const storageStub = (initial = {}) => {
    const store = { ...initial };
    return {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = v;
      }
    };
  };

  test('sends one beacon with tenant hash on the URL, then latches', () => {
    const beacon = jest.fn(() => true);
    const win = framedWin({ navigator: { sendBeacon: beacon }, sessionStorage: storageStub() });

    expect(reportMisEmbed(ENDPOINT, 'at807c3896fbd2', win)).toBe(true);
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, payload] = beacon.mock.calls[0];
    expect(url).toBe(`${ENDPOINT}&t=at807c3896fbd2`);
    expect(JSON.parse(payload)).toEqual({
      type: 'embed_sandboxed_frame',
      frame_host: 'www-atlantaangels-org.filesusr.com',
      page_host: 'www.atlantaangels.org'
    });

    // Second call in the same session: latched, no second beacon.
    expect(reportMisEmbed(ENDPOINT, 'at807c3896fbd2', win)).toBe(false);
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  test('falls back to fetch when sendBeacon refuses the payload', () => {
    const beacon = jest.fn(() => false);
    const fetchMock = jest.fn(() => Promise.resolve());
    const win = framedWin({ navigator: { sendBeacon: beacon }, fetch: fetchMock, sessionStorage: storageStub() });

    expect(reportMisEmbed(ENDPOINT, 'at807c3896fbd2', win)).toBe(true);
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('falls back to no-cors keepalive fetch when sendBeacon is missing', () => {
    const fetchMock = jest.fn(() => Promise.resolve());
    const win = framedWin({ navigator: {}, fetch: fetchMock, sessionStorage: storageStub() });

    expect(reportMisEmbed(ENDPOINT, 'at807c3896fbd2', win)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', mode: 'no-cors', keepalive: true });
  });

  test('still reports when sessionStorage is sandbox-blocked', () => {
    const beacon = jest.fn(() => true);
    const win = framedWin({ navigator: { sendBeacon: beacon } });
    Object.defineProperty(win, 'sessionStorage', {
      get() {
        throw new Error('sandbox');
      }
    });
    expect(reportMisEmbed(ENDPOINT, 'at807c3896fbd2', win)).toBe(true);
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  test('no endpoint → no send', () => {
    const beacon = jest.fn(() => true);
    const win = framedWin({ navigator: { sendBeacon: beacon }, sessionStorage: storageStub() });
    expect(reportMisEmbed('', 'at807c3896fbd2', win)).toBe(false);
    expect(beacon).not.toHaveBeenCalled();
  });
});

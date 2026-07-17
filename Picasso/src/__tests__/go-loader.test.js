/**
 * @jest-environment-options {"url": "https://chat.myrecruiter.ai/go/"}
 */

/**
 * Tests for the /go/ fullpage launcher (public/go/loader.js).
 *
 * The bug these lock down: loader.js built the iframe URL and its PICASSO_INIT
 * postMessage WITHOUT attribution, so `/go/?t=…&ep=ep_…` — the URL every QR
 * code and social link points at — silently lost its entry-point id. Every
 * such conversation was miscredited to the `website` channel (the aggregator's
 * default for "no ep").
 *
 * loader.js is not a module: it is an IIFE copied verbatim into dist/<env>/go/
 * (esbuild.config.mjs) and cannot be imported. So we read the real shipped
 * file and evaluate it against a jsdom document, asserting on what it posts
 * to the iframe.
 *
 * This test lives in src/__tests__/ rather than next to loader.js ON PURPOSE:
 * esbuild copies public/go/ into dist/<env>/go/ RECURSIVELY and unfiltered
 * (esbuild.config.mjs ~227), so anything under public/go/ ships to S3 and is
 * publicly fetchable. A __tests__ directory there would have been deployed to
 * chat.myrecruiter.ai/go/__tests__/. Do not move this back.
 */

const fs = require('fs');
const path = require('path');

// Reads the REAL shipped artifact, not a copy of it.
const LOADER_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'go', 'loader.js'),
  'utf8'
);

// C2 contract — must match src/widget-host.js getEntryPointId()
const VALID_EP = 'ep_01HQZX9KJ4MNPQRSTUVWXYZ234';

/**
 * Boot loader.js against a fresh jsdom page at the given URL.
 * Returns the fake iframe plus the messages it received.
 */
function runLoader(search, { cookie = '', referrer = '' } = {}) {
  document.body.innerHTML = `
    <div id="loading-container"></div>
    <div id="error-container"></div>
  `;

  // Set the page URL via history rather than replacing window.location — a fake
  // location object breaks jsdom's teardown (Window.close walks it).
  // Origin comes from the @jest-environment-options url above.
  window.history.replaceState({}, '', '/go/' + search);

  if (cookie) document.cookie = cookie;
  Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });

  const messages = [];
  const targetOrigins = [];
  const fakeContentWindow = {
    postMessage: (msg, targetOrigin) => {
      messages.push(msg);
      targetOrigins.push(targetOrigin);
    },
    // The iframe is appended to the document, so jsdom registers it as a frame
    // and calls contentWindow.close() during teardown. Without this, the whole
    // suite dies in Window.close rather than in any test.
    close: () => {},
  };

  // Capture the iframe the loader creates, and stub its contentWindow —
  // jsdom would otherwise try to actually load the src.
  const realCreate = document.createElement.bind(document);
  let iframe = null;
  jest.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = realCreate(tag);
    if (tag === 'iframe') {
      Object.defineProperty(el, 'contentWindow', { value: fakeContentWindow });
      iframe = el;
    }
    return el;
  });

  // eslint-disable-next-line no-new-func
  new Function(LOADER_SRC)();

  document.createElement.mockRestore();

  // jsdom never actually loads the iframe src, so onload never fires on its
  // own — and onload is where the loader posts. Fire it by hand.
  // (No iframe at all is the legitimate no-tenant path.)
  if (iframe && typeof iframe.onload === 'function') {
    iframe.onload();
  }

  return { iframe, messages, targetOrigins };
}

const initMessage = (messages) => messages.find((m) => m.type === 'PICASSO_INIT');

afterEach(() => {
  jest.restoreAllMocks();
  // Cookies persist across tests in jsdom — clear so ga_client_id cases stay isolated.
  document.cookie = '_ga=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('/go/ loader — attribution forwarding (the regression)', () => {
  it('forwards a valid ?ep= entry point id in PICASSO_INIT', () => {
    const { messages } = runLoader(`?t=my87674d777bf9&ep=${VALID_EP}`);
    const init = initMessage(messages);

    // This is the assertion that fails against the pre-fix loader.
    expect(init.attribution).toBeDefined();
    expect(init.attribution.entry_point_id).toBe(VALID_EP);
  });

  it('forwards UTM parameters', () => {
    const { messages } = runLoader(
      '?t=my87674d777bf9&utm_source=newsletter&utm_medium=email' +
        '&utm_campaign=spring-appeal&utm_term=mentor&utm_content=hero'
    );
    const { attribution } = initMessage(messages);

    expect(attribution.utm_source).toBe('newsletter');
    expect(attribution.utm_medium).toBe('email');
    expect(attribution.utm_campaign).toBe('spring-appeal');
    expect(attribution.utm_term).toBe('mentor');
    expect(attribution.utm_content).toBe('hero');
  });

  it('forwards ad-platform click ids', () => {
    const { messages } = runLoader('?t=my87674d777bf9&gclid=abc123&fbclid=xyz789');
    const { attribution } = initMessage(messages);

    expect(attribution.gclid).toBe('abc123');
    expect(attribution.fbclid).toBe('xyz789');
  });

  it('still sends the tenant hash and fullpage mode alongside attribution', () => {
    const { messages } = runLoader(`?t=my87674d777bf9&ep=${VALID_EP}`);
    const init = initMessage(messages);

    expect(init.tenantHash).toBe('my87674d777bf9');
    expect(init.config).toEqual({ mode: 'fullpage' });
  });

  it('sends OPEN_CHAT before PICASSO_INIT (unchanged ordering)', () => {
    const { messages } = runLoader('?t=my87674d777bf9');

    expect(messages.map((m) => m.type)).toEqual(['PICASSO_COMMAND', 'PICASSO_INIT']);
    expect(messages[0].action).toBe('OPEN_CHAT');
  });
});

describe('/go/ loader — C2 entry-point validation', () => {
  it.each([
    ['too short', 'ep_short'],
    ['missing ep_ prefix', '01HQZX9KJ4MNPQRSTUVWXYZ234'],
    ['illegal characters', 'ep_not-a-valid-id!!'],
    ['empty', ''],
  ])('nulls a malformed ep (%s) rather than forwarding junk', (_label, badEp) => {
    const { messages } = runLoader(`?t=my87674d777bf9&ep=${encodeURIComponent(badEp)}`);
    expect(initMessage(messages).attribution.entry_point_id).toBeNull();
  });

  it('nulls entry_point_id when ?ep= is absent entirely', () => {
    const { messages } = runLoader('?t=my87674d777bf9');
    expect(initMessage(messages).attribution.entry_point_id).toBeNull();
  });

  it('accepts an ep at the 64-char upper bound and rejects 65', () => {
    const at64 = 'ep_' + 'a'.repeat(64);
    const at65 = 'ep_' + 'a'.repeat(65);

    expect(initMessage(runLoader(`?t=x&ep=${at64}`).messages).attribution.entry_point_id).toBe(at64);
    expect(initMessage(runLoader(`?t=x&ep=${at65}`).messages).attribution.entry_point_id).toBeNull();
  });
});

describe('/go/ loader — attribution shape parity with widget-host', () => {
  it('emits every key the embedded widget emits', () => {
    const { messages } = runLoader('?t=my87674d777bf9');

    // Mirrors captureAttribution() in src/widget-host.js:104-146.
    // If widget-host gains a field, this fails until /go/ matches it.
    expect(Object.keys(initMessage(messages).attribution).sort()).toEqual(
      [
        'captured_at',
        'entry_point_id',
        'fbclid',
        'ga_client_id',
        'gclid',
        'landing_page',
        'referrer',
        'utm_campaign',
        'utm_content',
        'utm_medium',
        'utm_source',
        'utm_term',
      ].sort()
    );
  });

  it('extracts the GA client id from the _ga cookie', () => {
    const { messages } = runLoader('?t=my87674d777bf9', {
      cookie: '_ga=GA1.2.123456789.1702900000',
    });
    expect(initMessage(messages).attribution.ga_client_id).toBe('123456789.1702900000');
  });

  it('nulls ga_client_id when no _ga cookie is present', () => {
    const { messages } = runLoader('?t=my87674d777bf9');
    expect(initMessage(messages).attribution.ga_client_id).toBeNull();
  });

  it('captures referrer, and nulls it on a direct hit', () => {
    const withRef = runLoader('?t=x', { referrer: 'https://facebook.com/somepage' });
    expect(initMessage(withRef.messages).attribution.referrer).toBe('https://facebook.com/somepage');

    const direct = runLoader('?t=x', { referrer: '' });
    expect(initMessage(direct.messages).attribution.referrer).toBeNull();
  });
});

describe('/go/ loader — postMessage targeting', () => {
  it('targets the iframe origin explicitly, never a wildcard', () => {
    const { targetOrigins } = runLoader(`?t=my87674d777bf9&ep=${VALID_EP}`);

    // Attribution (ep id, UTM, referrer) rides these messages. '*' delivers
    // regardless of the frame's actual origin; the iframe is same-origin by
    // construction, so there is no reason to accept that.
    expect(targetOrigins).not.toContain('*');
    expect(targetOrigins).toEqual([
      'https://chat.myrecruiter.ai',
      'https://chat.myrecruiter.ai',
    ]);
  });

  it('targets the same origin the iframe src was built from', () => {
    const { iframe, targetOrigins } = runLoader('?t=my87674d777bf9');

    // If these ever diverge, postMessage silently drops the message and the
    // chat never initializes — so pin them to each other, not to a literal.
    targetOrigins.forEach((origin) => expect(iframe.src.startsWith(origin)).toBe(true));
  });
});

describe('/go/ loader — PICASSO_LOADED title listener (hardening)', () => {
  const SAME_ORIGIN = 'https://chat.myrecruiter.ai';

  function boot() {
    // A tenant is required for the listener to be registered at all.
    runLoader('?t=my87674d777bf9');
    document.title = 'baseline';
  }

  function post(data, origin = SAME_ORIGIN) {
    window.dispatchEvent(new MessageEvent('message', { data, origin }));
  }

  it('sets document.title from a same-origin PICASSO_LOADED', () => {
    boot();
    post({ type: 'PICASSO_LOADED', config: { chat_title: 'BrightPath Chat' } });
    expect(document.title).toBe('BrightPath Chat');
  });

  it('falls back to branding.chat_title', () => {
    boot();
    post({ type: 'PICASSO_LOADED', config: { branding: { chat_title: 'Branded' } } });
    expect(document.title).toBe('Branded');
  });

  it('ignores a PICASSO_LOADED from a foreign origin (no title spoofing)', () => {
    boot();
    post({ type: 'PICASSO_LOADED', config: { chat_title: 'evil.example' } }, 'https://evil.example');
    expect(document.title).toBe('baseline');
  });

  it('does not throw on a null-data message and leaves the title intact', () => {
    boot();
    // A page can postMessage(null); reading .type on it would throw.
    expect(() => post(null)).not.toThrow();
    expect(document.title).toBe('baseline');
  });

  it('ignores unrelated same-origin message types', () => {
    boot();
    post({ type: 'SOMETHING_ELSE', config: { chat_title: 'nope' } });
    expect(document.title).toBe('baseline');
  });
});

describe('/go/ loader — unchanged behavior', () => {
  it('shows the error container and posts nothing when no tenant is given', () => {
    const { messages } = runLoader('');

    expect(messages).toHaveLength(0);
    expect(document.getElementById('error-container').style.display).toBe('flex');
    expect(document.getElementById('loading-container').style.display).toBe('none');
  });

  it('accepts ?tenant= as an alias for ?t=', () => {
    const { messages } = runLoader('?tenant=my87674d777bf9');
    expect(initMessage(messages).tenantHash).toBe('my87674d777bf9');
  });

  it('builds the iframe src same-origin with fullpage mode, and does not leak ep into it', () => {
    const { iframe } = runLoader(`?t=my87674d777bf9&ep=${VALID_EP}`);

    expect(iframe.src).toBe('https://chat.myrecruiter.ai/iframe.html?t=my87674d777bf9&mode=fullpage');
    // Attribution travels via postMessage, not the URL — deliberate, and the
    // reason the iframe src is intentionally left alone by this fix.
    expect(iframe.src).not.toContain('ep=');
  });
});

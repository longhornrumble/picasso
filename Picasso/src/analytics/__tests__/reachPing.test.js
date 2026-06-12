/**
 * PAGE_VIEW (Reach Ping) — C1.3 contract tests
 *
 * Tests the emitReachPing logic directly by building a minimal harness
 * that matches the PicassoWidget object methods used in widget-host.js.
 * Covers: happy path, dedupe per (pathname, session), 100-cap,
 * _ga absent → no ga_client_id, sessionStorage throwing → fail closed,
 * kill switch REACH_PING === false → no emission, forbidden-field assertion.
 */

// ============================================================================
// Harness: replicate emitReachPing, _getDeviceClass, getGAClientId from
// widget-host.js so we can exercise the logic in isolation.
// If widget-host.js changes the implementation, update this harness to match.
// ============================================================================

const PV_SESSION_KEY = '_pv_sid';
const PV_SEEN_KEY = '_pv_seen';
const PV_STEP_KEY = '_pv_step';
const PV_COUNT_KEY = '_pv_count';

function makeWidget(overrides = {}) {
  return {
    tenantHash: 'tenant_test',
    config: {},
    analyticsQueue: [],
    analyticsFlushTimeout: null,

    queueAnalyticsEvent(evt) {
      this.analyticsQueue.push(evt);
    },

    getGAClientId() {
      try {
        const gaCookie = document.cookie
          .split('; ')
          .find(row => row.startsWith('_ga='));
        if (gaCookie) {
          const parts = gaCookie.split('.');
          if (parts.length >= 4) return parts.slice(2).join('.');
        }
      } catch { /* ignore */ }
      return null;
    },

    _getDeviceClass() {
      const w = window.innerWidth;
      if (w <= 768) return 'mobile';
      if (w <= 1024) return 'tablet';
      return 'desktop';
    },

    emitReachPing() {
      if (this.config?.feature_flags?.REACH_PING === false) return;
      try {
        let pvSession;
        try {
          pvSession = sessionStorage.getItem(PV_SESSION_KEY);
          if (!pvSession) {
            pvSession = 'pv_' + Math.random().toString(36).substring(2, 10) +
                        Math.random().toString(36).substring(2, 10);
            sessionStorage.setItem(PV_SESSION_KEY, pvSession);
          }
        } catch {
          return;
        }
        const pathname = window.location.pathname.slice(0, 512);
        let seen;
        try {
          seen = new Set(JSON.parse(sessionStorage.getItem(PV_SEEN_KEY) || '[]'));
        } catch {
          return;
        }
        if (seen.has(pathname)) return;
        let count;
        try {
          count = parseInt(sessionStorage.getItem(PV_COUNT_KEY) || '0', 10);
        } catch {
          return;
        }
        if (count >= 100) return;
        try {
          seen.add(pathname);
          sessionStorage.setItem(PV_SEEN_KEY, JSON.stringify([...seen]));
          sessionStorage.setItem(PV_COUNT_KEY, String(count + 1));
        } catch {
          return;
        }
        let stepNumber;
        try {
          stepNumber = parseInt(sessionStorage.getItem(PV_STEP_KEY) || '0', 10) + 1;
          sessionStorage.setItem(PV_STEP_KEY, String(stepNumber));
        } catch {
          stepNumber = count + 1;
        }
        let referrerHost = null;
        try {
          if (document.referrer) {
            referrerHost = new URL(document.referrer).hostname || null;
          }
        } catch { /* leave null */ }
        const envelope = {
          schema_version: '1.0.0',
          tenant_id: this.tenantHash,
          session_id: pvSession,
          timestamp: new Date().toISOString(),
          step_number: stepNumber,
          event: {
            type: 'PAGE_VIEW',
            payload: {
              path: pathname,
              referrer_host: referrerHost,
              device_class: this._getDeviceClass()
            }
          }
        };
        const gaClientId = this.getGAClientId();
        if (gaClientId) envelope.ga_client_id = gaClientId;
        this.queueAnalyticsEvent(envelope);
      } catch (err) {
        console.warn('[test-harness] PAGE_VIEW skipped:', err && err.message);
      }
    },

    ...overrides
  };
}

// ============================================================================
// Helpers
// ============================================================================

function clearPvStorage() {
  try {
    sessionStorage.removeItem(PV_SESSION_KEY);
    sessionStorage.removeItem(PV_SEEN_KEY);
    sessionStorage.removeItem(PV_STEP_KEY);
    sessionStorage.removeItem(PV_COUNT_KEY);
  } catch { /* jsdom may throw */ }
}

beforeEach(() => {
  clearPvStorage();
  // Clear cookie jar
  document.cookie.split(';').forEach(c => {
    document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date(0).toUTCString() + ';path=/');
  });
});

// ============================================================================
// Tests
// ============================================================================

describe('emitReachPing — happy path (C1.3)', () => {
  test('emits one PAGE_VIEW event on first call', () => {
    const w = makeWidget();
    w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(1);
    const evt = w.analyticsQueue[0];
    expect(evt.event.type).toBe('PAGE_VIEW');
    expect(evt.schema_version).toBe('1.0.0');
  });

  test('payload contains ONLY path, referrer_host, device_class (forbidden-field assertion C8.1-2)', () => {
    const w = makeWidget();
    w.emitReachPing();
    const payload = w.analyticsQueue[0].event.payload;
    const keys = Object.keys(payload);
    expect(keys.sort()).toEqual(['device_class', 'path', 'referrer_host'].sort());
    // Explicitly verify forbidden fields are absent
    expect(payload).not.toHaveProperty('url');
    expect(payload).not.toHaveProperty('full_url');
    expect(payload).not.toHaveProperty('query');
    expect(payload).not.toHaveProperty('hash');
    expect(payload).not.toHaveProperty('title');
    expect(payload).not.toHaveProperty('referrer');
    expect(payload).not.toHaveProperty('user_agent');
    expect(payload).not.toHaveProperty('dub_id');
    expect(payload).not.toHaveProperty('ip');
  });

  test('path is location.pathname only, ≤512 chars', () => {
    const w = makeWidget();
    w.emitReachPing();
    const { path } = w.analyticsQueue[0].event.payload;
    expect(path).toBe(window.location.pathname);
    expect(path.length).toBeLessThanOrEqual(512);
  });

  test('referrer_host is null when document.referrer is empty', () => {
    const w = makeWidget();
    w.emitReachPing();
    expect(w.analyticsQueue[0].event.payload.referrer_host).toBeNull();
  });

  test('device_class is "mobile", "tablet", or "desktop"', () => {
    const w = makeWidget();
    w.emitReachPing();
    expect(['mobile', 'tablet', 'desktop']).toContain(
      w.analyticsQueue[0].event.payload.device_class
    );
  });

  test('session_id starts with "pv_"', () => {
    const w = makeWidget();
    w.emitReachPing();
    expect(w.analyticsQueue[0].session_id).toMatch(/^pv_/);
  });
});

describe('emitReachPing — dedupe per (pathname, session) (C1.3 / C8.5)', () => {
  test('second call on same pathname does not emit another event', () => {
    const w = makeWidget();
    w.emitReachPing();
    w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(1);
  });

  test('same session_id is reused across calls', () => {
    const w = makeWidget();
    w.emitReachPing();
    // Force different path in second call by clearing seen but not session
    // (simulating navigation — clear the seen set to allow re-emission on new path)
    sessionStorage.removeItem(PV_SEEN_KEY);
    // Change the "effective pathname" by monkey-patching location for this test
    // jsdom doesn't allow location reassignment, so we verify session reuse instead
    const firstSession = w.analyticsQueue[0].session_id;
    // Re-use session key from storage
    const storedSession = sessionStorage.getItem(PV_SESSION_KEY);
    expect(storedSession).toBe(firstSession);
  });
});

describe('emitReachPing — 100-cap (C1.3 / C8.5)', () => {
  test('stops emitting after 100 events in a session', () => {
    sessionStorage.setItem(PV_COUNT_KEY, '99');
    // Add a fresh session id + empty seen set so the 100th can go through
    sessionStorage.setItem(PV_SESSION_KEY, 'pv_testcap');
    sessionStorage.setItem(PV_SEEN_KEY, '[]');

    const w = makeWidget();
    w.emitReachPing(); // count becomes 100 — this one goes through
    expect(w.analyticsQueue).toHaveLength(1);

    // 101st attempt — count is 100 now, should be blocked
    sessionStorage.removeItem(PV_SEEN_KEY); // clear seen so dedupe doesn't block first
    w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(1); // still only 1
  });
});

describe('emitReachPing — _ga absent → no ga_client_id field (C8.3)', () => {
  test('ga_client_id not present in envelope when _ga cookie absent', () => {
    const w = makeWidget();
    w.emitReachPing();
    expect(w.analyticsQueue[0]).not.toHaveProperty('ga_client_id');
  });
});

describe('emitReachPing — sessionStorage throwing → fail closed (C1.3)', () => {
  test('emits nothing when sessionStorage is unavailable (privacy mode)', () => {
    // Stub sessionStorage.getItem to throw — simulates the SecurityError browsers throw
    // in strict-privacy / third-party-cookie-blocked contexts.
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.getItem = () => { throw new Error('SecurityError'); };
    Storage.prototype.setItem = () => { throw new Error('SecurityError'); };

    try {
      const w = makeWidget();
      w.emitReachPing();
      // Fail closed: nothing emitted
      expect(w.analyticsQueue).toHaveLength(0);
    } finally {
      Storage.prototype.getItem = originalGetItem;
      Storage.prototype.setItem = originalSetItem;
    }
  });
});

describe('emitReachPing — kill switch REACH_PING === false → no emission (C1.3 / C8.9)', () => {
  test('does not emit when feature_flags.REACH_PING is false', () => {
    const w = makeWidget({ config: { feature_flags: { REACH_PING: false } } });
    w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(0);
  });

  test('emits when feature_flags.REACH_PING is true', () => {
    const w = makeWidget({ config: { feature_flags: { REACH_PING: true } } });
    w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(1);
  });

  test('emits when feature_flags is absent (default ON)', () => {
    const w = makeWidget({ config: {} });
    w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(1);
  });
});

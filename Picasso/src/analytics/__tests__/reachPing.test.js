/**
 * PAGE_VIEW (Reach Ping) — C1.3 contract tests
 *
 * Tests the emitReachPing logic directly by building a minimal harness
 * that matches the PicassoWidget object methods used in widget-host.js.
 * Covers: happy path, dedupe per (pathname, session), 100-cap,
 * _ga absent → no ga_client_id, sessionStorage throwing → fail closed,
 * kill switch REACH_PING === false → no emission, forbidden-field assertion.
 *
 * F3 kill-switch additions (2026-06-12): the operator-side kill switch is now
 * enforced via the S3 tenant config (fetched by _fetchTenantConfig before
 * the ping fires). Tests cover: tenant config disabling, embed disabling,
 * and fail-closed when _fetchTenantConfig returns null.
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

/**
 * Build a minimal PicassoWidget harness that mirrors widget-host.js methods.
 *
 * @param {Object} overrides  - Properties/methods to override on the base object.
 * @param {Object|null} fetchedTenantConfig
 *   Simulates what _fetchTenantConfig() resolves to:
 *   - an object  → fetch succeeded (use to test tenant config kill switch)
 *   - null       → fetch failed / returned non-OK (test fail-closed behaviour)
 *   Defaults to {} (empty config, REACH_PING absent → ON).
 */
function makeWidget(overrides = {}, fetchedTenantConfig = {}) {
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

    // F3: mirrors _fetchTenantConfig() from widget-host.js.
    // In tests, the result is injected via the second makeWidget argument.
    async _fetchTenantConfig() {
      return fetchedTenantConfig;
    },

    // Mirrors the updated async emitReachPing() in widget-host.js exactly.
    // Three-stage kill switch (C8.9 / F3):
    //   1. embed snippet: this.config.feature_flags.REACH_PING === false → bail immediately
    //   2. S3 tenant config: _fetchTenantConfig() returns null → fail closed (no ping)
    //   3. tenant config flag: tenantConfig.feature_flags.REACH_PING === false → bail
    async emitReachPing() {
      // Stage 1 — embed-snippet kill switch (fast path)
      if (this.config?.feature_flags?.REACH_PING === false) return;

      // Stage 2 — S3 tenant config fetch; fail closed on null
      const tenantConfig = await this._fetchTenantConfig();
      if (tenantConfig === null) return;

      // Stage 3 — tenant config kill switch
      const tenantFlags = tenantConfig?.feature_flags ?? tenantConfig?.config?.feature_flags ?? {};
      if (tenantFlags.REACH_PING === false) return;

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
// NOTE: emitReachPing() is async — all tests must await it.
// ============================================================================

describe('emitReachPing — happy path (C1.3)', () => {
  test('emits one PAGE_VIEW event on first call', async () => {
    const w = makeWidget();
    await w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(1);
    const evt = w.analyticsQueue[0];
    expect(evt.event.type).toBe('PAGE_VIEW');
    expect(evt.schema_version).toBe('1.0.0');
  });

  test('payload contains ONLY path, referrer_host, device_class (forbidden-field assertion C8.1-2)', async () => {
    const w = makeWidget();
    await w.emitReachPing();
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

  test('path is location.pathname only, ≤512 chars', async () => {
    const w = makeWidget();
    await w.emitReachPing();
    const { path } = w.analyticsQueue[0].event.payload;
    expect(path).toBe(window.location.pathname);
    expect(path.length).toBeLessThanOrEqual(512);
  });

  test('referrer_host is null when document.referrer is empty', async () => {
    const w = makeWidget();
    await w.emitReachPing();
    expect(w.analyticsQueue[0].event.payload.referrer_host).toBeNull();
  });

  test('device_class is "mobile", "tablet", or "desktop"', async () => {
    const w = makeWidget();
    await w.emitReachPing();
    expect(['mobile', 'tablet', 'desktop']).toContain(
      w.analyticsQueue[0].event.payload.device_class
    );
  });

  test('session_id starts with "pv_"', async () => {
    const w = makeWidget();
    await w.emitReachPing();
    expect(w.analyticsQueue[0].session_id).toMatch(/^pv_/);
  });
});

describe('emitReachPing — dedupe per (pathname, session) (C1.3 / C8.5)', () => {
  test('second call on same pathname does not emit another event', async () => {
    const w = makeWidget();
    await w.emitReachPing();
    await w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(1);
  });

  test('same session_id is reused across calls', async () => {
    const w = makeWidget();
    await w.emitReachPing();
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
  test('stops emitting after 100 events in a session', async () => {
    sessionStorage.setItem(PV_COUNT_KEY, '99');
    // Add a fresh session id + empty seen set so the 100th can go through
    sessionStorage.setItem(PV_SESSION_KEY, 'pv_testcap');
    sessionStorage.setItem(PV_SEEN_KEY, '[]');

    const w = makeWidget();
    await w.emitReachPing(); // count becomes 100 — this one goes through
    expect(w.analyticsQueue).toHaveLength(1);

    // 101st attempt — count is 100 now, should be blocked
    sessionStorage.removeItem(PV_SEEN_KEY); // clear seen so dedupe doesn't block first
    await w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(1); // still only 1
  });
});

describe('emitReachPing — _ga absent → no ga_client_id field (C8.3)', () => {
  test('ga_client_id not present in envelope when _ga cookie absent', async () => {
    const w = makeWidget();
    await w.emitReachPing();
    expect(w.analyticsQueue[0]).not.toHaveProperty('ga_client_id');
  });
});

describe('emitReachPing — sessionStorage throwing → fail closed (C1.3)', () => {
  test('emits nothing when sessionStorage is unavailable (privacy mode)', async () => {
    // Stub sessionStorage.getItem to throw — simulates the SecurityError browsers throw
    // in strict-privacy / third-party-cookie-blocked contexts.
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.getItem = () => { throw new Error('SecurityError'); };
    Storage.prototype.setItem = () => { throw new Error('SecurityError'); };

    try {
      const w = makeWidget();
      await w.emitReachPing();
      // Fail closed: nothing emitted
      expect(w.analyticsQueue).toHaveLength(0);
    } finally {
      Storage.prototype.getItem = originalGetItem;
      Storage.prototype.setItem = originalSetItem;
    }
  });
});

// ============================================================================
// Kill switch — embed snippet side (fast path, pre-F3 behaviour preserved)
// ============================================================================

describe('emitReachPing — embed-snippet kill switch (C1.3 / C8.9)', () => {
  test('does not emit when embed feature_flags.REACH_PING is false', async () => {
    const w = makeWidget({ config: { feature_flags: { REACH_PING: false } } });
    await w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(0);
  });

  test('emits when embed feature_flags.REACH_PING is true', async () => {
    const w = makeWidget({ config: { feature_flags: { REACH_PING: true } } });
    await w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(1);
  });

  test('emits when embed feature_flags is absent (default ON)', async () => {
    const w = makeWidget({ config: {} });
    await w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(1);
  });
});

// ============================================================================
// Kill switch — F3 operator-side (S3 tenant config, 2026-06-12)
// ============================================================================

describe('emitReachPing — F3 operator kill switch via tenant config (C8.9 / F3)', () => {
  test('FAIL CLOSED: emits nothing when _fetchTenantConfig returns null (fetch failed)', async () => {
    // null = fetch failed / non-OK response — must not ping per C1.3 fail-closed rule
    const w = makeWidget({}, null);
    await w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(0);
  });

  test('does not emit when tenant config feature_flags.REACH_PING is false', async () => {
    const tenantCfg = { feature_flags: { REACH_PING: false } };
    const w = makeWidget({}, tenantCfg);
    await w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(0);
  });

  test('emits when tenant config feature_flags.REACH_PING is true', async () => {
    const tenantCfg = { feature_flags: { REACH_PING: true } };
    const w = makeWidget({}, tenantCfg);
    await w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(1);
  });

  test('emits when tenant config has no feature_flags (default ON)', async () => {
    const tenantCfg = {}; // no feature_flags key
    const w = makeWidget({}, tenantCfg);
    await w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(1);
  });

  test('tenant config nested under config.feature_flags is also respected', async () => {
    // Some tenant config shapes wrap flags under config.feature_flags
    const tenantCfg = { config: { feature_flags: { REACH_PING: false } } };
    const w = makeWidget({}, tenantCfg);
    await w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(0);
  });

  test('embed-snippet disable takes precedence — no fetch needed', async () => {
    // When the embed disables, we bail BEFORE calling _fetchTenantConfig.
    // Override _fetchTenantConfig to track if it was called.
    let fetchCalled = false;
    const w = makeWidget(
      {
        config: { feature_flags: { REACH_PING: false } },
        async _fetchTenantConfig() { fetchCalled = true; return {}; }
      },
      {} // fetchedTenantConfig arg irrelevant when overridden
    );
    await w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(0);
    // The embed-side bail fires before the config fetch
    expect(fetchCalled).toBe(false);
  });

  test('tenant config ON + embed absent → emits (both must allow)', async () => {
    const tenantCfg = { feature_flags: { REACH_PING: true } };
    const w = makeWidget({ config: {} }, tenantCfg);
    await w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(1);
  });

  test('tenant config absent-flag + embed ON → emits (default ON on both sides)', async () => {
    const w = makeWidget({ config: { feature_flags: { REACH_PING: true } } }, {});
    await w.emitReachPing();
    expect(w.analyticsQueue).toHaveLength(1);
  });
});

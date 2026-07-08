/**
 * C1 P3 prerequisite — the state-token cache lifetime is decoupled from CACHE_DURATION.
 *
 * SECURITY_REVIEW_2026-07-02 §C1 / C1_CONVERSATION_HIJACK_REMEDIATION.md P3:
 * P3 retires the insecure raw-session_id resume path. That can only happen once the
 * C1_COMPAT_RAW_SESSION_RESUME counter reaches ~0 — i.e. once migrated widgets present
 * their signed token on (nearly) every resume. The token previously shared the 15-minute
 * CACHE_DURATION, so any visitor returning after >15 min idle had already dropped the token
 * client-side and fell back to the raw path (keeping the counter above zero, and — post-P3 —
 * losing their conversation). This pins the fix:
 *   - saveStateToken writes a 24h horizon (STATE_TOKEN_TTL), matching the server's
 *     STATE_TOKEN_EXPIRY_HOURS (24h) and recent-messages TTL (24h);
 *   - loadStateToken retains a token still within that window (would have been dropped at 15 min);
 *   - expiry is still enforced — a token past 24h is dropped;
 *   - the session-storage message-buffer window is UNCHANGED (still 15 min) — the decoupling
 *     is surgical: it moved the token, not the buffer.
 */

// In-memory store so save/load round-trips. (Jest lets factory-referenced vars be `mock`-prefixed.)
const mockStore = new Map();
jest.mock('../../context/shared/messageHelpers', () => ({
  _storeGet: jest.fn((k) => (mockStore.has(k) ? mockStore.get(k) : null)),
  _storeSet: jest.fn((k, v) => mockStore.set(k, String(v))),
  _storeRemove: jest.fn((k) => mockStore.delete(k)),
}));

// Gate the constructor's auto-init off (endpoint "unavailable" → initializeWithServer early-returns).
jest.mock('../../config/environment', () => ({
  config: {
    CONVERSATION_ENDPOINT_AVAILABLE: false,
    CONVERSATION_ENDPOINT: 'https://stg.example/Master_Function?action=conversation',
    CHAT_ENDPOINT: 'https://stg.example/Master_Function?action=chat',
  },
}));

import { ConversationManager } from '../conversationManager';

const TOKEN_KEY = 'picasso_conversation_token';
const SESSION_KEY = 'picasso_current_conversation';
const FIFTEEN_MIN = 15 * 60 * 1000;
const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;

function freshManager() {
  return new ConversationManager('tenanthash123', 'session_abc');
}

describe('C1 P3 prerequisite — token cache decoupled from CACHE_DURATION', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  test('saveStateToken writes a ~24h horizon, not the 15-minute CACHE_DURATION', () => {
    const cm = freshManager();
    cm.stateToken = 'owner-token';

    cm.saveStateToken();

    const stored = JSON.parse(mockStore.get(TOKEN_KEY));
    const ttlMs = new Date(stored.expires).getTime() - new Date(stored.created).getTime();
    // created is stamped just before expires, so the delta is 24h + a sub-ms sliver.
    expect(ttlMs).toBeGreaterThanOrEqual(TWENTY_FOUR_H);
    expect(ttlMs).toBeLessThan(TWENTY_FOUR_H + 1000);
    // The whole point: strictly beyond the old 15-minute window.
    expect(ttlMs).toBeGreaterThan(FIFTEEN_MIN);
  });

  test('loadStateToken retains a 30-minute-old token (old 15-min TTL would have dropped it)', () => {
    const cm = freshManager();
    const savedAt = Date.now() - 30 * 60 * 1000; // 30 min ago — past the old drop window
    mockStore.set(TOKEN_KEY, JSON.stringify({
      token: 'still-valid',
      created: new Date(savedAt).toISOString(),
      expires: new Date(savedAt + TWENTY_FOUR_H).toISOString(), // ~23.5h remaining
    }));
    cm.stateToken = null;

    cm.loadStateToken();

    expect(cm.stateToken).toBe('still-valid');
  });

  test('loadStateToken still enforces expiry — a token past 24h is dropped and cleared', () => {
    const cm = freshManager();
    const now = Date.now();
    mockStore.set(TOKEN_KEY, JSON.stringify({
      token: 'long-idle',
      created: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
      expires: new Date(now - 60 * 60 * 1000).toISOString(), // expired 1h ago
    }));
    cm.stateToken = 'long-idle';

    cm.loadStateToken();

    expect(cm.stateToken).toBeNull();
    expect(mockStore.has(TOKEN_KEY)).toBe(false); // clearStateToken removed the stale entry
  });

  test('round-trip: save then load keeps the token (the resume path a returning visitor takes)', () => {
    const cm = freshManager();
    cm.stateToken = 'owner-token';
    cm.saveStateToken();

    cm.stateToken = null;
    cm.loadStateToken();

    expect(cm.stateToken).toBe('owner-token');
  });

  test('surgical boundary: the session-storage message buffer is UNCHANGED at 15 minutes', () => {
    const cm = freshManager();
    const base = {
      conversationId: 'c1', messages: [], metadata: {}, turn: 0,
      tenantHash: 'tenanthash123', sessionId: 'session_abc',
    };

    // 16 min old → past CACHE_DURATION → not restored (the token TTL change must not leak here).
    mockStore.set(SESSION_KEY, JSON.stringify({ ...base, savedAt: Date.now() - 16 * 60 * 1000 }));
    expect(cm.loadFromSessionStorage()).toBeNull();

    // 10 min old → within CACHE_DURATION → restored.
    mockStore.set(SESSION_KEY, JSON.stringify({ ...base, savedAt: Date.now() - 10 * 60 * 1000 }));
    expect(cm.loadFromSessionStorage()).not.toBeNull();
  });
});

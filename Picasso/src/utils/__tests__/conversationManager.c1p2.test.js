/**
 * C1 P2 — widget presents the stored signed state token to init_session on resume.
 *
 * SECURITY_REVIEW_2026-07-02 §C1 / C1_CONVERSATION_HIJACK_REMEDIATION.md P2:
 * resuming a conversation must PROVE ownership by presenting the previously-issued
 * signed token (only the original client has it), not a raw session_id. The server
 * (C1 P1) authenticates the resume off that token. This pins the widget side:
 *   - a stored token is sent in the body AND the Authorization header;
 *   - genuinely-new sessions send no token (mint as before);
 *   - a server 401 on a presented token re-mints (drop token, retry without it).
 */

// Controllable env config (mutated per-test to gate the constructor's auto-init).
jest.mock('../../config/environment', () => ({
  config: {
    CONVERSATION_ENDPOINT_AVAILABLE: true,
    CONVERSATION_ENDPOINT: 'https://stg.example/Master_Function?action=conversation',
    CHAT_ENDPOINT: 'https://stg.example/Master_Function?action=chat',
  },
}));

// Avoid real sessionStorage in the test env.
jest.mock('../../context/shared/messageHelpers', () => ({
  _storeGet: jest.fn(() => null),
  _storeSet: jest.fn(),
  _storeRemove: jest.fn(),
}));

import { config } from '../../config/environment';
import { ConversationManager } from '../conversationManager';

const INIT_OK = () => ({
  ok: true,
  status: 200,
  json: async () => ({ state_token: 'fresh-rotated-token', session_id: 'session_abc', turn: 0 }),
});

// Build a manager with the constructor's auto-init suppressed (endpoint "unavailable"
// during construction → initializeWithServer early-returns, no fetch), then enable
// the endpoint + a fresh fetch mock so each test drives initializeWithServer directly.
async function freshManager() {
  config.CONVERSATION_ENDPOINT_AVAILABLE = false;
  const cm = new ConversationManager('tenanthash123', 'session_abc');
  await Promise.resolve(); // flush the (no-op) constructor init
  config.CONVERSATION_ENDPOINT_AVAILABLE = true;
  global.fetch = jest.fn();
  return cm;
}

describe('C1 P2 — ownership-proven resume (widget side)', () => {
  afterEach(() => {
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('resume: a stored token is presented in body + Authorization header', async () => {
    const cm = await freshManager();
    cm.stateToken = 'stored-owner-token';
    global.fetch.mockResolvedValue(INIT_OK());

    await cm.initializeWithServer();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, opts] = global.fetch.mock.calls[0];
    expect(JSON.parse(opts.body).state_token).toBe('stored-owner-token');
    expect(opts.headers.Authorization).toBe('Bearer stored-owner-token');
  });

  test('new session: no token → no state_token and no Authorization header', async () => {
    const cm = await freshManager();
    cm.stateToken = null;
    global.fetch.mockResolvedValue(INIT_OK());

    await cm.initializeWithServer();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, opts] = global.fetch.mock.calls[0];
    expect(JSON.parse(opts.body).state_token).toBeUndefined();
    expect(opts.headers.Authorization).toBeUndefined();
  });

  test("string 'undefined'/'null' tokens are treated as no token", async () => {
    const cm = await freshManager();
    cm.stateToken = 'undefined';
    global.fetch.mockResolvedValue(INIT_OK());

    await cm.initializeWithServer();

    const [, opts] = global.fetch.mock.calls[0];
    expect(JSON.parse(opts.body).state_token).toBeUndefined();
    expect(opts.headers.Authorization).toBeUndefined();
  });

  test('server 401 on a presented token → clears it and re-mints without it', async () => {
    const cm = await freshManager();
    cm.stateToken = 'stale-token';
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'TOKEN_EXPIRED' }) })
      .mockResolvedValueOnce(INIT_OK());

    const result = await cm.initializeWithServer();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    // First attempt presented the stale token...
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).state_token).toBe('stale-token');
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer stale-token');
    // ...the retry dropped it (re-mint) and succeeded.
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).state_token).toBeUndefined();
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBeUndefined();
    expect(result.success).toBe(true);
  });

  test('valid token accepted first try → no re-mint retry', async () => {
    const cm = await freshManager();
    cm.stateToken = 'good-token';
    global.fetch.mockResolvedValue(INIT_OK());

    await cm.initializeWithServer();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

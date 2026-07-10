/**
 * streamChat onError contract (operator ruling 2026-07-10 — HTTP is a real
 * fallback):
 * - onError is AWAITED. If it resolves, the fallback delivered the reply and
 *   streamChat resolves too (the caller's catch — which would overwrite the
 *   placeholder with an error bubble — must not run).
 * - If onError throws, both transports failed and streamChat rejects.
 * - With no onError, the original error propagates.
 */

import { streamChat } from '../StreamingChatProvider.jsx';

const baseArgs = () => ({
  url: 'https://example.invalid/stream',
  headers: { 'Content-Type': 'application/json' },
  body: { user_input: 'hi' },
  streamingMessageId: 'msg_test',
  abortControllersRef: { current: new Map() },
  method: 'POST',
});

describe('streamChat — fallback delivery contract', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // jsdom exposes no fetch global — install a rejecting mock directly
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('resolves when onError (the fallback) succeeds — error must not propagate', async () => {
    const onError = jest.fn().mockResolvedValue(undefined);
    await expect(streamChat({ ...baseArgs(), onError })).resolves.toBeDefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('rejects with the fallback error when onError also fails', async () => {
    const fallbackErr = new Error('fallback also down');
    const onError = jest.fn().mockRejectedValue(fallbackErr);
    await expect(streamChat({ ...baseArgs(), onError })).rejects.toBe(fallbackErr);
  });

  it('rejects with the original error when no onError handler is given', async () => {
    await expect(streamChat(baseArgs())).rejects.toThrow('network down');
  });

  it('cleans up the abort-controller registry either way', async () => {
    const abortControllersRef = { current: new Map() };
    const onError = jest.fn().mockResolvedValue(undefined);
    await streamChat({ ...baseArgs(), abortControllersRef, onError });
    expect(abortControllersRef.current.size).toBe(0);
  });
});

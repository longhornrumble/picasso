/**
 * schedulingGateway tests — the thin client for the deterministic gateway. Verifies the
 * request shape (action + params) and error mapping (non-2xx → throws with code/status).
 */

import { proposeTimes, mutateBooking } from '../schedulingGateway';

describe('schedulingGateway', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  afterEach(() => {
    delete global.fetch;
  });

  test('proposeTimes POSTs action=propose with t/session/date', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ outcome: 'ok', slots: [] }) });
    const r = await proposeTimes({ tenantHash: 'h', session: 's', date: '2026-06-18' });
    expect(r.outcome).toBe('ok');
    const [, opts] = global.fetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({ action: 'propose', t: 'h', session: 's', date: '2026-06-18' });
  });

  test('proposeTimes omits date when not given', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await proposeTimes({ tenantHash: 'h', session: 's' });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ action: 'propose', t: 'h', session: 's' });
  });

  test('mutateBooking POSTs action=mutate with mutation + newSlot', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ outcome: 'success' }) });
    await mutateBooking({ tenantHash: 'h', session: 's', mutation: 'reschedule', newSlot: { start: 'a', end: 'b' } });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      action: 'mutate', t: 'h', session: 's', mutation: 'reschedule', newSlot: { start: 'a', end: 'b' },
    });
  });

  test('non-2xx → throws with code + status', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'session_expired' }) });
    await expect(proposeTimes({ tenantHash: 'h', session: 's' })).rejects.toMatchObject({
      code: 'session_expired',
      status: 401,
    });
  });
});

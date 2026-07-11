/**
 * FS5 — computeSubmissionToken characterization.
 * The token must be: stable for identical inputs (that's the dedup),
 * different when the content changes (an edited resubmit is a NEW
 * submission), 64-hex shaped (matches the servers' IDEM_TOKEN_SHAPE),
 * and fail-open (null) when crypto.subtle is unavailable.
 */

import { computeSubmissionToken } from '../submissionToken';

// jest-environment-jsdom exposes neither WebCrypto (crypto.subtle) nor
// TextEncoder — in real browsers both always exist on secure contexts.
// Polyfill from Node so the tests exercise the real digest path; the
// fail-open test below then removes crypto again to prove the null fallback.
const { webcrypto } = require('crypto');
const { TextEncoder: NodeTextEncoder } = require('util');
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  if (typeof globalThis.TextEncoder === 'undefined') {
    globalThis.TextEncoder = NodeTextEncoder;
  }
});

describe('computeSubmissionToken (FS5)', () => {
  const session = 'sess_abc123';
  const formId = 'volunteer_apply';
  const data = { first_name: 'John', email: 'john@example.com' };

  it('is deterministic: same inputs → same 64-hex token', async () => {
    const a = await computeSubmissionToken(session, formId, data);
    const b = await computeSubmissionToken(session, formId, { ...data });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
  });

  it('changes when the content changes (edited resubmit = new submission)', async () => {
    const a = await computeSubmissionToken(session, formId, data);
    const b = await computeSubmissionToken(session, formId, { ...data, email: 'other@example.com' });
    expect(a).not.toBe(b);
  });

  it('changes across sessions and forms', async () => {
    const a = await computeSubmissionToken(session, formId, data);
    expect(await computeSubmissionToken('sess_other', formId, data)).not.toBe(a);
    expect(await computeSubmissionToken(session, 'contact_us', data)).not.toBe(a);
  });

  it('fails open (null) when crypto.subtle is unavailable', async () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    try {
      expect(await computeSubmissionToken(session, formId, data)).toBeNull();
    } finally {
      if (saved) Object.defineProperty(globalThis, 'crypto', saved);
    }
  });

  it('tolerates null/undefined inputs without throwing', async () => {
    const t = await computeSubmissionToken(null, undefined, null);
    expect(t === null || /^[0-9a-f]{64}$/.test(t)).toBe(true);
  });
});

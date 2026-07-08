/**
 * Tests for utils/parentOrigin.js — the SR-1/SR-2 hardening
 * (RESCHEDULE_WIDGET_REMEDIATION_2026-07-08).
 */

import { resolveParentTargetOrigin, getAllowedParentOrigins } from '../parentOrigin';

describe('resolveParentTargetOrigin — SR-1 (no wildcard, fail closed)', () => {
  const locationOrigin = 'https://staging.chat.myrecruiter.ai';

  test('standalone schedule mode → same-origin (our own origin)', () => {
    expect(
      resolveParentTargetOrigin({ mode: 'schedule', referrer: '', locationOrigin })
    ).toBe(locationOrigin);
  });

  test('standalone fullpage mode → same-origin', () => {
    expect(
      resolveParentTargetOrigin({ mode: 'fullpage', referrer: 'https://ignored.example', locationOrigin })
    ).toBe(locationOrigin);
  });

  test('embedded with a referrer → the referrer origin (not the path)', () => {
    expect(
      resolveParentTargetOrigin({ mode: null, referrer: 'https://client.example/page?x=1', locationOrigin })
    ).toBe('https://client.example');
  });

  test('embedded with NO referrer → null (fail closed, never "*")', () => {
    const out = resolveParentTargetOrigin({ mode: null, referrer: '', locationOrigin });
    expect(out).toBeNull();
    expect(out).not.toBe('*');
  });

  test('embedded with an unparseable referrer → null', () => {
    expect(
      resolveParentTargetOrigin({ mode: undefined, referrer: 'not a url', locationOrigin })
    ).toBeNull();
  });
});

describe('getAllowedParentOrigins — SR-2 (same-origin hosts added, referrer echo kept)', () => {
  test('includes the embedding page (referrer) origin — embed-anywhere echo retained', () => {
    const out = getAllowedParentOrigins({ isDev: false, referrer: 'https://client.example/embed' });
    expect(out).toContain('https://client.example');
  });

  test('always includes the same-origin widget hosts (chat / staging.chat)', () => {
    const out = getAllowedParentOrigins({ isDev: false, referrer: '' });
    expect(out).toContain('https://chat.myrecruiter.ai');
    expect(out).toContain('https://staging.chat.myrecruiter.ai');
  });

  test('includes localhost origins only in dev', () => {
    const dev = getAllowedParentOrigins({ isDev: true, referrer: '' });
    expect(dev).toContain('http://localhost:8000');
    const prod = getAllowedParentOrigins({ isDev: false, referrer: '' });
    expect(prod).not.toContain('http://localhost:8000');
  });

  test('never includes the "*" wildcard', () => {
    expect(getAllowedParentOrigins({ isDev: true, referrer: 'https://a.example' })).not.toContain('*');
  });

  test('an unparseable referrer is ignored, not thrown', () => {
    expect(() => getAllowedParentOrigins({ isDev: false, referrer: 'garbage' })).not.toThrow();
    expect(getAllowedParentOrigins({ isDev: false, referrer: 'garbage' })).not.toContain('garbage');
  });
});

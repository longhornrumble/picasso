import { describe, it, expect } from '@jest/globals';
import { getBindingSessionId } from '../bindingSession';

describe('getBindingSessionId', () => {
  it('returns the opaque ?session= value when present', () => {
    expect(getBindingSessionId('?session=abc')).toBe('abc');
  });

  it('extracts session alongside other params (e.g. ?t=)', () => {
    expect(getBindingSessionId('?t=Rm9zNDAy&session=abc')).toBe('abc');
  });

  it('returns the value verbatim without parsing/validation (opaque)', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(getBindingSessionId(`?session=${uuid}`)).toBe(uuid);
  });

  it('returns null when ?session= is absent (normal chat unchanged)', () => {
    expect(getBindingSessionId('?t=Rm9zNDAy')).toBe(null);
  });

  it('returns null for an empty query string', () => {
    expect(getBindingSessionId('')).toBe(null);
  });

  // Mirrors how the request body / iframe URL conditionally include the value:
  // present -> forwarded; absent -> omitted entirely.
  it('drives the conditional body spread: present forwards { session }', () => {
    const id = getBindingSessionId('?session=abc');
    const body = { tenant_hash: 'h', ...(id && { session: id }) };
    expect(body).toEqual({ tenant_hash: 'h', session: 'abc' });
  });

  it('drives the conditional body spread: absent omits session', () => {
    const id = getBindingSessionId('?t=Rm9zNDAy');
    const body = { tenant_hash: 'h', ...(id && { session: id }) };
    expect(body).toEqual({ tenant_hash: 'h' });
  });
});

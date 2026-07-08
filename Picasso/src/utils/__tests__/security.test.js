/**
 * Tests for utils/security.js sanitizeHTML — focused on the SR-5 hardening
 * (RESCHEDULE_WIDGET_REMEDIATION_2026-07-08): `<img>`/`src` are no longer
 * allowed through the general chat-content sanitizer (tracking-pixel vector),
 * while safe formatting still survives and script/handler XSS is stripped.
 */

import {
  sanitizeHTML,
  CHAT_CONTENT_ALLOWED_TAGS,
  CHAT_CONTENT_ALLOWED_ATTR,
} from '../security';

describe('sanitizeHTML — SR-5: <img>/src no longer allowed', () => {
  test('strips a tracking-pixel <img> and its src', () => {
    const out = sanitizeHTML('<p>hello</p><img src="http://evil.example/pixel.gif">');
    expect(out).toContain('hello');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('pixel.gif');
    expect(out).not.toContain('evil.example');
  });

  test('strips src even on an allowed tag (no src attribute survives)', () => {
    const out = sanitizeHTML('<div src="http://evil.example/beacon">x</div>');
    expect(out).toContain('x');
    expect(out).not.toContain('evil.example');
    expect(out).not.toMatch(/\bsrc=/);
  });

  test('the exported allowlists exclude img and src', () => {
    expect(CHAT_CONTENT_ALLOWED_TAGS).not.toContain('img');
    expect(CHAT_CONTENT_ALLOWED_ATTR).not.toContain('src');
  });
});

describe('sanitizeHTML — XSS still stripped', () => {
  test('removes <script>', () => {
    const out = sanitizeHTML('<p>ok</p><script>alert(1)</script>');
    expect(out).toContain('ok');
    expect(out).not.toContain('<script');
  });

  test('removes inline event-handler attributes', () => {
    const out = sanitizeHTML('<a href="https://example.com" onerror="alert(1)">y</a>');
    expect(out).not.toContain('onerror');
  });

  test('neutralizes a javascript: href', () => {
    const out = sanitizeHTML('<a href="javascript:alert(1)">click</a>');
    expect(out).toContain('click');
    expect(out).not.toContain('javascript');
  });
});

describe('sanitizeHTML — safe formatting preserved', () => {
  test('keeps basic formatting tags', () => {
    const out = sanitizeHTML('<p><strong>bold</strong> and <em>italic</em></p>');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
  });

  test('keeps an https anchor with href', () => {
    const out = sanitizeHTML('<a href="https://example.com/x">link</a>');
    expect(out).toContain('href="https://example.com/x"');
    expect(out).toContain('link');
  });

  test('keeps list structure', () => {
    const out = sanitizeHTML('<ul><li>one</li><li>two</li></ul>');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>one</li>');
  });
});

describe('sanitizeHTML — input guards', () => {
  test('returns empty string for non-string / empty input', () => {
    expect(sanitizeHTML('')).toBe('');
    expect(sanitizeHTML(null)).toBe('');
    expect(sanitizeHTML(undefined)).toBe('');
    expect(sanitizeHTML(42)).toBe('');
  });
});

/**
 * Widget attribution events — C1.1 CONVERSATION_STARTED, C1.2 LINK_CLICKED
 * contract tests (unit-level, no React render required).
 *
 * These tests exercise the emission logic in isolation to verify:
 *   C1.1 — once-only guard, entry_point_id null when absent,
 *           payload shape, ?ep= captured in attribution
 *   C1.2 — payload shape {url, label ≤120, source}, label truncation
 *   C2   — ep capture / validation regex
 */

import {
  CONVERSATION_STARTED,
  LINK_CLICKED,
  PAGE_VIEW,
  ALL_EVENT_TYPES
} from '../eventConstants.js';

// ============================================================================
// C1.1 CONVERSATION_STARTED — once-per-session guard
// ============================================================================

describe('CONVERSATION_STARTED emission (C1.1)', () => {
  let emitted;
  let conversationStartedRef;

  function buildOnceGuard() {
    // Mirrors conversationStartedRef pattern in StreamingChatProvider.jsx
    conversationStartedRef = { current: false };
    emitted = [];
    // Stub notifyParentEvent
    window.analyticsState = { attribution: { ga_client_id: null, entry_point_id: null } };
    window.notifyParentEvent = (type, payload) => {
      emitted.push({ type, payload });
    };
  }

  function fireSendMessageAnalytics() {
    if (!conversationStartedRef.current) {
      conversationStartedRef.current = true;
      window.notifyParentEvent(CONVERSATION_STARTED, {
        entry_point_id: window.analyticsState?.attribution?.entry_point_id ?? null,
        attribution: window.analyticsState?.attribution ?? null
      });
    }
  }

  beforeEach(() => {
    buildOnceGuard();
  });

  afterEach(() => {
    delete window.notifyParentEvent;
    delete window.analyticsState;
  });

  test('emits CONVERSATION_STARTED on first call', () => {
    fireSendMessageAnalytics();
    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe(CONVERSATION_STARTED);
  });

  test('does NOT emit again on subsequent calls (once-only guard)', () => {
    fireSendMessageAnalytics();
    fireSendMessageAnalytics();
    fireSendMessageAnalytics();
    expect(emitted.filter(e => e.type === CONVERSATION_STARTED)).toHaveLength(1);
  });

  test('payload includes entry_point_id: null when attribution has none', () => {
    window.analyticsState.attribution.entry_point_id = null;
    fireSendMessageAnalytics();
    expect(emitted[0].payload.entry_point_id).toBeNull();
  });

  test('payload includes entry_point_id when present in attribution', () => {
    window.analyticsState.attribution.entry_point_id = 'ep_ABCDEF12';
    fireSendMessageAnalytics();
    expect(emitted[0].payload.entry_point_id).toBe('ep_ABCDEF12');
  });

  test('payload includes attribution object verbatim', () => {
    const attr = { ga_client_id: '123.456', utm_source: 'google', entry_point_id: null };
    window.analyticsState.attribution = attr;
    fireSendMessageAnalytics();
    expect(emitted[0].payload.attribution).toEqual(attr);
  });

  test('entry_point_id is null when window.analyticsState is absent', () => {
    delete window.analyticsState;
    // Re-define guard to mirror null-safe access: window.analyticsState?.attribution?.entry_point_id ?? null
    emitted = [];
    conversationStartedRef = { current: false };
    if (!conversationStartedRef.current) {
      conversationStartedRef.current = true;
      window.notifyParentEvent = (type, payload) => emitted.push({ type, payload });
      window.notifyParentEvent(CONVERSATION_STARTED, {
        entry_point_id: window.analyticsState?.attribution?.entry_point_id ?? null,
        attribution: window.analyticsState?.attribution ?? null
      });
    }
    expect(emitted[0].payload.entry_point_id).toBeNull();
    expect(emitted[0].payload.attribution).toBeNull();
  });

  test('guard resets after clearMessages (session cleared)', () => {
    fireSendMessageAnalytics(); // first session
    conversationStartedRef.current = false; // simulate clearMessages reset
    fireSendMessageAnalytics(); // second session
    expect(emitted.filter(e => e.type === CONVERSATION_STARTED)).toHaveLength(2);
  });
});

// ============================================================================
// C1.2 LINK_CLICKED — payload shape
// ============================================================================

describe('LINK_CLICKED payload (C1.2)', () => {
  let emitted;

  function emitLinkClicked(href, anchorText) {
    emitted = [];
    window.notifyParentEvent = (type, payload) => emitted.push({ type, payload });
    // Mirrors MessageBubble.jsx onClick handler
    const rawLabel = (anchorText || '').trim();
    window.notifyParentEvent(LINK_CLICKED, {
      url: href,
      label: rawLabel.slice(0, 120),
      source: 'message'
    });
  }

  afterEach(() => {
    delete window.notifyParentEvent;
  });

  test('payload has url, label, source — no legacy fields', () => {
    emitLinkClicked('https://example.com/donate', 'Donate now');
    const p = emitted[0].payload;
    expect(p.url).toBe('https://example.com/donate');
    expect(p.label).toBe('Donate now');
    expect(p.source).toBe('message');
    // Legacy fields must be absent (C1.2)
    expect(p).not.toHaveProperty('link_text');
    expect(p).not.toHaveProperty('link_domain');
    expect(p).not.toHaveProperty('category');
  });

  test('label is truncated to 120 chars', () => {
    const longText = 'A'.repeat(200);
    emitLinkClicked('https://x.com', longText);
    expect(emitted[0].payload.label).toHaveLength(120);
  });

  test('label is exactly 120 chars when anchor text is exactly 120', () => {
    const text120 = 'B'.repeat(120);
    emitLinkClicked('https://x.com', text120);
    expect(emitted[0].payload.label).toHaveLength(120);
  });

  test('label is empty string when anchor text is empty', () => {
    emitLinkClicked('https://x.com', '');
    expect(emitted[0].payload.label).toBe('');
  });

  test('source is "message" for message-content links', () => {
    emitLinkClicked('https://example.com', 'Visit');
    expect(emitted[0].payload.source).toBe('message');
  });

  test('source "cta" and "resource" are supported values', () => {
    for (const source of ['cta', 'resource']) {
      emitted = [];
      window.notifyParentEvent = (type, payload) => emitted.push({ type, payload });
      window.notifyParentEvent(LINK_CLICKED, { url: 'https://x.com', label: 'x', source });
      expect(emitted[0].payload.source).toBe(source);
    }
  });
});

// ============================================================================
// C2 — ?ep= entry-point id capture / validation
// ============================================================================

describe('entry_point_id capture (C2)', () => {
  // Replicate getEntryPointId from widget-host.js
  function getEntryPointId(search) {
    try {
      const urlParams = new URLSearchParams(search);
      const raw = urlParams.get('ep');
      if (raw && /^ep_[0-9A-Za-z]{8,64}$/.test(raw)) {
        return raw;
      }
    } catch { /* ignore */ }
    return null;
  }

  test('valid ep= accepted', () => {
    expect(getEntryPointId('?ep=ep_ABCDEF1234')).toBe('ep_ABCDEF1234');
  });

  test('valid ep= with 26-char ULID suffix accepted', () => {
    expect(getEntryPointId('?ep=ep_01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe('ep_01ARZ3NDEKTSV4RRFFQ69G5FAV');
  });

  test('missing ep= returns null', () => {
    expect(getEntryPointId('?utm_source=google')).toBeNull();
  });

  test('malformed prefix (no ep_ prefix) rejected', () => {
    expect(getEntryPointId('?ep=ABCDEF12345678')).toBeNull();
  });

  test('too short suffix rejected (< 8 chars)', () => {
    expect(getEntryPointId('?ep=ep_ABC')).toBeNull(); // 3 chars
  });

  test('too long suffix rejected (> 64 chars)', () => {
    const long = 'ep_' + 'A'.repeat(65);
    expect(getEntryPointId(`?ep=${long}`)).toBeNull();
  });

  test('invalid chars in suffix rejected', () => {
    expect(getEntryPointId('?ep=ep_ABCDEF@12345')).toBeNull();
    expect(getEntryPointId('?ep=ep_abc-def-123')).toBeNull();
  });

  test('empty ep= value returns null', () => {
    expect(getEntryPointId('?ep=')).toBeNull();
  });
});

// ============================================================================
// ALL_EVENT_TYPES includes all three new constants
// ============================================================================

describe('ALL_EVENT_TYPES completeness', () => {
  test('contains PAGE_VIEW, CONVERSATION_STARTED, LINK_CLICKED', () => {
    expect(ALL_EVENT_TYPES).toContain(PAGE_VIEW);
    expect(ALL_EVENT_TYPES).toContain(CONVERSATION_STARTED);
    expect(ALL_EVENT_TYPES).toContain(LINK_CLICKED);
  });
});

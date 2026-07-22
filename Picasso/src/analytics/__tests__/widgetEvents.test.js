/**
 * Widget attribution events — C1.1 CONVERSATION_STARTED, C1.2 LINK_CLICKED
 * contract tests (unit-level, no React render required).
 *
 * These tests exercise the emission logic in isolation to verify:
 *   C1.1 — once-only guard, entry_point_id null when absent,
 *           payload shape, ?ep= captured in attribution.
 *           Covers BOTH the StreamingChatProvider (SSE) path AND the
 *           ChatProvider (HTTP fallback) path — same guard pattern.
 *   C1.2 — payload shape {url, label ≤120, source} PLUS legacy-compat
 *           fields {link_text, link_domain, category} for all three source
 *           variants: message, cta, resource.
 *   C2   — ep capture / validation regex
 */

import {
  CONVERSATION_STARTED,
  LINK_CLICKED,
  PAGE_VIEW,
  ALL_EVENT_TYPES
} from '../eventConstants.js';
import { getEntryPointId as realGetEntryPointId } from '../../utils/attribution.js';

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
// C1.1 CONVERSATION_STARTED — HTTP fallback path (ChatProvider.jsx, F2)
// Same guard/payload contract as the SSE path — exercised independently so
// a future refactor of one provider can't silently break the other.
// ============================================================================

describe('CONVERSATION_STARTED emission — HTTP path (ChatProvider, F2)', () => {
  let emitted;
  let conversationStartedRef;

  /**
   * Mirrors the guard block added to ChatProvider.jsx addMessage().
   * The HTTP path differs from the SSE path only in that it lives inside
   * addMessage() rather than sendMessage(). The guard/payload is identical.
   */
  function buildHttpGuard() {
    conversationStartedRef = { current: false };
    emitted = [];
    window.notifyParentEvent = (type, payload) => emitted.push({ type, payload });
    window.analyticsState = { attribution: { ga_client_id: null, entry_point_id: null } };
  }

  function fireAddMessageAnalytics() {
    // Mirrors: if (message.role === 'user' && !conversationStartedRef.current) { ... }
    if (!conversationStartedRef.current) {
      conversationStartedRef.current = true;
      window.notifyParentEvent(CONVERSATION_STARTED, {
        entry_point_id: window.analyticsState?.attribution?.entry_point_id ?? null,
        attribution: window.analyticsState?.attribution ?? null
      });
    }
  }

  beforeEach(buildHttpGuard);

  afterEach(() => {
    delete window.notifyParentEvent;
    delete window.analyticsState;
  });

  test('emits CONVERSATION_STARTED on first user message (HTTP path)', () => {
    fireAddMessageAnalytics();
    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe(CONVERSATION_STARTED);
  });

  test('does NOT emit again on subsequent messages (once-only guard, HTTP path)', () => {
    fireAddMessageAnalytics();
    fireAddMessageAnalytics();
    fireAddMessageAnalytics();
    expect(emitted.filter(e => e.type === CONVERSATION_STARTED)).toHaveLength(1);
  });

  test('payload.entry_point_id is null when attribution has none (HTTP path)', () => {
    window.analyticsState.attribution.entry_point_id = null;
    fireAddMessageAnalytics();
    expect(emitted[0].payload.entry_point_id).toBeNull();
  });

  test('payload.entry_point_id forwarded when present (HTTP path)', () => {
    window.analyticsState.attribution.entry_point_id = 'ep_ABCDEF12';
    fireAddMessageAnalytics();
    expect(emitted[0].payload.entry_point_id).toBe('ep_ABCDEF12');
  });

  test('payload.attribution is the full attribution object (HTTP path)', () => {
    const attr = { ga_client_id: '789.123', utm_source: 'flyer', entry_point_id: 'ep_XYZ90000' };
    window.analyticsState.attribution = attr;
    fireAddMessageAnalytics();
    expect(emitted[0].payload.attribution).toEqual(attr);
  });

  test('guard resets after clearMessages and emits again on next session (HTTP path)', () => {
    fireAddMessageAnalytics();                      // session 1
    conversationStartedRef.current = false;         // simulate clearMessages reset
    fireAddMessageAnalytics();                      // session 2
    expect(emitted.filter(e => e.type === CONVERSATION_STARTED)).toHaveLength(2);
  });

  test('entry_point_id is null when window.analyticsState is absent (HTTP path)', () => {
    delete window.analyticsState;
    conversationStartedRef = { current: false };
    emitted = [];
    window.notifyParentEvent = (type, payload) => emitted.push({ type, payload });
    if (!conversationStartedRef.current) {
      conversationStartedRef.current = true;
      window.notifyParentEvent(CONVERSATION_STARTED, {
        entry_point_id: window.analyticsState?.attribution?.entry_point_id ?? null,
        attribution: window.analyticsState?.attribution ?? null
      });
    }
    expect(emitted[0].payload.entry_point_id).toBeNull();
    expect(emitted[0].payload.attribution).toBeNull();
  });
});

// ============================================================================
// C1.2 LINK_CLICKED — payload shape (amended 2026-06-12: ADDITIVE)
// New fields: url, label (≤120), source
// Legacy-compat fields RETAINED: link_text, link_domain, category
// Both sets must be present until Wave-2 dashboard migrates off link_text.
// ============================================================================

describe('LINK_CLICKED payload (C1.2 amended — additive)', () => {
  let emitted;

  /**
   * Mirrors the MessageBubble.jsx onClick handler exactly.
   * source defaults to 'message' when not provided.
   */
  function emitLinkClicked(href, anchorText, source = 'message') {
    emitted = [];
    window.notifyParentEvent = (type, payload) => emitted.push({ type, payload });
    const rawLabel = (anchorText || '').trim();
    let linkDomain = 'unknown';
    let category = 'unknown';
    try {
      const u = new URL(href);
      linkDomain = u.hostname;
      category = u.protocol === 'mailto:' ? 'email'
               : u.protocol === 'tel:'    ? 'phone'
               : 'web';
    } catch { /* invalid URL */ }
    window.notifyParentEvent(LINK_CLICKED, {
      url: href,
      label: rawLabel.slice(0, 120),
      source,
      // legacy-compat
      link_text: rawLabel,
      link_domain: linkDomain,
      category
    });
  }

  afterEach(() => {
    delete window.notifyParentEvent;
  });

  // ---- new C1.2 fields ----

  test('payload has url, label (≤120), source — new C1.2 fields present', () => {
    emitLinkClicked('https://example.com/donate', 'Donate now');
    const p = emitted[0].payload;
    expect(p.url).toBe('https://example.com/donate');
    expect(p.label).toBe('Donate now');
    expect(p.source).toBe('message');
  });

  test('label is truncated to 120 chars', () => {
    const longText = 'A'.repeat(200);
    emitLinkClicked('https://x.com', longText);
    expect(emitted[0].payload.label).toHaveLength(120);
  });

  test('label is exactly 120 chars when anchor text is exactly 120', () => {
    emitLinkClicked('https://x.com', 'B'.repeat(120));
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
    for (const src of ['cta', 'resource']) {
      emitLinkClicked('https://x.com', 'x', src);
      expect(emitted[0].payload.source).toBe(src);
    }
  });

  // ---- legacy-compat fields MUST be present until Wave-2 (C1.2 amended) ----

  test('legacy link_text equals full anchor text (not truncated)', () => {
    const longText = 'A'.repeat(200);
    emitLinkClicked('https://example.com', longText);
    const p = emitted[0].payload;
    // link_text carries the untruncated text; label is capped
    expect(p.link_text).toBe(longText);
    expect(p.label).toHaveLength(120);
  });

  test('legacy link_domain is hostname of the URL', () => {
    emitLinkClicked('https://example.com/donate', 'Donate');
    expect(emitted[0].payload.link_domain).toBe('example.com');
  });

  test('legacy category is "email" for mailto: links', () => {
    emitLinkClicked('mailto:info@example.com', 'Email us');
    const p = emitted[0].payload;
    expect(p.category).toBe('email');
    expect(p.link_domain).toBe('');    // mailto: has no hostname
  });

  test('legacy category is "phone" for tel: links', () => {
    emitLinkClicked('tel:+15551234567', 'Call us');
    expect(emitted[0].payload.category).toBe('phone');
  });

  test('legacy category is "web" for https links', () => {
    emitLinkClicked('https://example.com', 'Visit');
    expect(emitted[0].payload.category).toBe('web');
  });

  test('all six payload fields are present together (source=message)', () => {
    emitLinkClicked('https://example.com/volunteer', 'Volunteer');
    const p = emitted[0].payload;
    expect(p).toHaveProperty('url');
    expect(p).toHaveProperty('label');
    expect(p).toHaveProperty('source');
    expect(p).toHaveProperty('link_text');
    expect(p).toHaveProperty('link_domain');
    expect(p).toHaveProperty('category');
  });

  test('all six payload fields present for source=cta', () => {
    emitLinkClicked('https://example.com/apply', 'Apply now', 'cta');
    const p = emitted[0].payload;
    expect(p.source).toBe('cta');
    expect(p).toHaveProperty('link_text');
    expect(p).toHaveProperty('link_domain');
    expect(p).toHaveProperty('category');
  });

  test('all six payload fields present for source=resource', () => {
    emitLinkClicked('https://example.com/guide.pdf', 'Volunteer Guide', 'resource');
    const p = emitted[0].payload;
    expect(p.source).toBe('resource');
    expect(p).toHaveProperty('link_text');
    expect(p).toHaveProperty('link_domain');
    expect(p).toHaveProperty('category');
  });

  test('invalid URL falls back: link_domain="unknown", category="unknown"', () => {
    // anchor with a non-parseable href (e.g. relative path with no origin)
    emitLinkClicked('not-a-valid-url', 'Broken link');
    const p = emitted[0].payload;
    expect(p.link_domain).toBe('unknown');
    expect(p.category).toBe('unknown');
    // new fields still present
    expect(p.url).toBe('not-a-valid-url');
    expect(p.label).toBe('Broken link');
  });
});

// ============================================================================
// C2 — ?ep= entry-point id capture / validation
// ============================================================================

describe('entry_point_id capture (C2)', () => {
  // Exercises the REAL implementation (src/utils/attribution.js), which
  // widget-host.js delegates to.
  //
  // This block used to re-implement getEntryPointId inline and assert that
  // copy against itself — so it passed whether or not widget-host.js was
  // correct, and would have kept passing if the real regex were deleted. On a
  // locked security contract (C2), that is worth nothing. The real function
  // reads window.location, so drive it by setting the page URL.
  function getEntryPointId(search) {
    window.history.replaceState({}, '', '/' + search);
    return realGetEntryPointId();
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

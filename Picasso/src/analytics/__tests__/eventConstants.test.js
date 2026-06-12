/**
 * eventConstants.js — C1.1 / C1.2 / C1.3 contract tests
 *
 * Verifies: PAGE_VIEW constant exists, is in ALL_EVENT_TYPES, and that
 * createAnalyticsEvent produces the correct envelope shape for all three
 * new attribution events.
 */

import {
  PAGE_VIEW,
  CONVERSATION_STARTED,
  LINK_CLICKED,
  ALL_EVENT_TYPES,
  EVENT_CATEGORIES,
  createAnalyticsEvent
} from '../eventConstants.js';

describe('PAGE_VIEW constant (C1.3)', () => {
  test('PAGE_VIEW constant is the string "PAGE_VIEW"', () => {
    expect(PAGE_VIEW).toBe('PAGE_VIEW');
  });

  test('PAGE_VIEW is in ALL_EVENT_TYPES', () => {
    expect(ALL_EVENT_TYPES).toContain('PAGE_VIEW');
  });

  test('PAGE_VIEW is in EVENT_CATEGORIES.LIFECYCLE', () => {
    expect(EVENT_CATEGORIES.LIFECYCLE).toContain('PAGE_VIEW');
  });
});

describe('CONVERSATION_STARTED constant (C1.1)', () => {
  test('constant value is "CONVERSATION_STARTED"', () => {
    expect(CONVERSATION_STARTED).toBe('CONVERSATION_STARTED');
  });

  test('is in ALL_EVENT_TYPES', () => {
    expect(ALL_EVENT_TYPES).toContain('CONVERSATION_STARTED');
  });
});

describe('LINK_CLICKED constant (C1.2)', () => {
  test('constant value is "LINK_CLICKED"', () => {
    expect(LINK_CLICKED).toBe('LINK_CLICKED');
  });

  test('is in ALL_EVENT_TYPES', () => {
    expect(ALL_EVENT_TYPES).toContain('LINK_CLICKED');
  });
});

describe('createAnalyticsEvent envelope (C1.0)', () => {
  const base = {
    sessionId: 'sess_abc_123',
    tenantHash: 'tenant_xyz',
    stepNumber: 1
  };

  test('PAGE_VIEW envelope has correct shape with exhaustive payload', () => {
    const event = createAnalyticsEvent({
      ...base,
      eventType: PAGE_VIEW,
      payload: { path: '/about', referrer_host: 'google.com', device_class: 'desktop' }
    });
    expect(event.schema_version).toBe('1.0.0');
    expect(event.event.type).toBe('PAGE_VIEW');
    expect(event.event.payload.path).toBe('/about');
    expect(event.event.payload.referrer_host).toBe('google.com');
    expect(event.event.payload.device_class).toBe('desktop');
    // Forbidden fields must not be present (C8.1-2)
    expect(event.event.payload).not.toHaveProperty('url');
    expect(event.event.payload).not.toHaveProperty('full_url');
    expect(event.event.payload).not.toHaveProperty('query');
    expect(event.event.payload).not.toHaveProperty('title');
    expect(event.event.payload).not.toHaveProperty('referrer');
    expect(event.event.payload).not.toHaveProperty('dub_id');
  });

  test('CONVERSATION_STARTED envelope includes entry_point_id and attribution', () => {
    const event = createAnalyticsEvent({
      ...base,
      eventType: CONVERSATION_STARTED,
      payload: {
        entry_point_id: 'ep_ABCD1234',
        attribution: { ga_client_id: '123.456', utm_source: null }
      }
    });
    expect(event.event.type).toBe('CONVERSATION_STARTED');
    expect(event.event.payload.entry_point_id).toBe('ep_ABCD1234');
    expect(event.event.payload.attribution).toBeDefined();
  });

  test('CONVERSATION_STARTED with null entry_point_id (no ep) is valid', () => {
    const event = createAnalyticsEvent({
      ...base,
      eventType: CONVERSATION_STARTED,
      payload: { entry_point_id: null, attribution: null }
    });
    expect(event.event.payload.entry_point_id).toBeNull();
  });

  test('LINK_CLICKED envelope has C1.2 payload shape', () => {
    const event = createAnalyticsEvent({
      ...base,
      eventType: LINK_CLICKED,
      payload: { url: 'https://example.com', label: 'Click here', source: 'message' }
    });
    expect(event.event.payload.url).toBe('https://example.com');
    expect(event.event.payload.label).toBe('Click here');
    expect(event.event.payload.source).toBe('message');
    // Old fields must NOT be present
    expect(event.event.payload).not.toHaveProperty('link_text');
    expect(event.event.payload).not.toHaveProperty('link_domain');
    expect(event.event.payload).not.toHaveProperty('category');
  });

  test('LINK_CLICKED source "cta" and "resource" are both valid values', () => {
    for (const source of ['cta', 'resource']) {
      const event = createAnalyticsEvent({
        ...base,
        eventType: LINK_CLICKED,
        payload: { url: 'https://x.com', label: 'x', source }
      });
      expect(event.event.payload.source).toBe(source);
    }
  });

  test('ga_client_id is added to envelope when provided', () => {
    const event = createAnalyticsEvent({
      ...base,
      eventType: PAGE_VIEW,
      payload: { path: '/', referrer_host: null, device_class: 'mobile' },
      gaClientId: '999.888'
    });
    expect(event.ga_client_id).toBe('999.888');
  });

  test('ga_client_id absent from envelope when not provided', () => {
    const event = createAnalyticsEvent({
      ...base,
      eventType: PAGE_VIEW,
      payload: { path: '/', referrer_host: null, device_class: 'mobile' }
    });
    expect(event).not.toHaveProperty('ga_client_id');
  });
});

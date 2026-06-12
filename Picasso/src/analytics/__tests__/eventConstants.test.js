/**
 * eventConstants.js — C1.1 / C1.2 / C1.3 contract tests
 *
 * Verifies: PAGE_VIEW constant exists, is in ALL_EVENT_TYPES, and that
 * createAnalyticsEvent produces the correct envelope shape for all three
 * new attribution events.
 *
 * Extended for §B18d WS-OP-FE (2026-06-12):
 *  - Four scheduling analytics event constants present + in ALL_EVENT_TYPES
 *    + in EVENT_CATEGORIES.SCHEDULING
 *  - Payload builder contract tests (key-allowlist, type, no-PII)
 */

import {
  PAGE_VIEW,
  CONVERSATION_STARTED,
  LINK_CLICKED,
  ALL_EVENT_TYPES,
  EVENT_CATEGORIES,
  createAnalyticsEvent,
  SCHEDULING_CHIP_CLICKED,
  SCHEDULING_DAY_STRIP_ENGAGED,
  SCHEDULING_TYPED_REFINEMENT,
  SCHEDULING_TIME_TO_BOOKED
} from '../eventConstants.js';

// ─── §B18d scheduling event constants ────────────────────────────────────────

describe('§B18d scheduling analytics event constants', () => {
  const SCHEDULING_EVENTS = [
    ['SCHEDULING_CHIP_CLICKED', SCHEDULING_CHIP_CLICKED],
    ['SCHEDULING_DAY_STRIP_ENGAGED', SCHEDULING_DAY_STRIP_ENGAGED],
    ['SCHEDULING_TYPED_REFINEMENT', SCHEDULING_TYPED_REFINEMENT],
    ['SCHEDULING_TIME_TO_BOOKED', SCHEDULING_TIME_TO_BOOKED]
  ];

  test.each(SCHEDULING_EVENTS)('%s constant has the correct string value', (name, value) => {
    expect(value).toBe(name);
  });

  test.each(SCHEDULING_EVENTS)('%s is in ALL_EVENT_TYPES', (name, value) => {
    expect(ALL_EVENT_TYPES).toContain(value);
  });

  test.each(SCHEDULING_EVENTS)('%s is in EVENT_CATEGORIES.SCHEDULING', (name, value) => {
    expect(EVENT_CATEGORIES.SCHEDULING).toContain(value);
  });

  test('EVENT_CATEGORIES.SCHEDULING contains exactly 4 events', () => {
    expect(EVENT_CATEGORIES.SCHEDULING).toHaveLength(4);
  });
});

// ─── §B18d payload builders — contract / PII gate ────────────────────────────
// These tests import the builders from the component files (the ONLY enforcement point).

import { buildChipClickedPayload } from '../../components/chat/SchedulingSlots.jsx';
import { buildDayStripPayload } from '../../components/chat/SchedulingDayPicker.jsx';

describe('buildChipClickedPayload (§B18d — SCHEDULING_CHIP_CLICKED)', () => {
  const SLOT_ID = 'slot#2026-06-15T14:00:00Z-res1';

  test('returns EXACTLY the contracted keys', () => {
    expect(Object.keys(buildChipClickedPayload(SLOT_ID, 0, 3)).sort()).toEqual(
      ['position', 'slot_count', 'slot_id']
    );
  });

  test('slot_id matches full ISO-datetime prefix ^slot#\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}', () => {
    const { slot_id } = buildChipClickedPayload(SLOT_ID, 0, 3);
    expect(slot_id).toMatch(/^slot#\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('position is a number', () => {
    expect(typeof buildChipClickedPayload(SLOT_ID, 1, 3).position).toBe('number');
  });

  test('slot_count is a number', () => {
    expect(typeof buildChipClickedPayload(SLOT_ID, 0, 5).slot_count).toBe('number');
  });

  test('JSON.stringify contains no @ (no-PII substring-forbid)', () => {
    expect(JSON.stringify(buildChipClickedPayload(SLOT_ID, 0, 3))).not.toContain('@');
  });
});

describe('buildDayStripPayload (§B18d — SCHEDULING_DAY_STRIP_ENGAGED)', () => {
  test('returns EXACTLY the contracted keys', () => {
    expect(Object.keys(buildDayStripPayload('2026-06-15', 0)).sort()).toEqual(['day', 'position']);
  });

  test('day matches \\d{4}-\\d{2}-\\d{2}$ pattern', () => {
    const { day } = buildDayStripPayload('2026-06-15', 0);
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('position is a number', () => {
    expect(typeof buildDayStripPayload('2026-06-15', 2).position).toBe('number');
  });

  test('JSON.stringify contains no @ (no-PII substring-forbid)', () => {
    expect(JSON.stringify(buildDayStripPayload('2026-06-15', 0))).not.toContain('@');
  });
});

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

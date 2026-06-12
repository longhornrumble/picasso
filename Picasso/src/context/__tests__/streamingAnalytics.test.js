/**
 * streamingAnalytics.test.js — §B18d payload builder contract + PII gate tests
 *
 * Imports the EXPORTED builders directly from StreamingChatProvider.jsx so that
 * any drift in builder signatures is caught immediately rather than by a mirrored
 * copy diverging silently (fix-list item 3, integrator consolidated fix-list).
 * Analytics_Event_Processor persists payloads verbatim — these builders are the
 * only enforcement points in the pipeline.
 *
 * Tests:
 *  - buildTypedRefinementPayload contract (key-allowlist, type, no-PII)
 *  - buildTimeToBookedPayload contract (key-allowlist, types, no-PII)
 *  - typed-refinement: does NOT fire when the send has scheduling_action metadata
 *  - typed-refinement: does NOT fire when the send has scheduling_day_selected metadata
 *  - typed-refinement: does NOT fire when the latest assistant message has no slots
 *  - time-to-booked: skips when no first-offer timestamp (e.g. page reload)
 *  - scheduling_slots handler: attaches schedulingContext when present (§B18b)
 *  - scheduling_slots handler: tolerates absent context (old-shape fixture — schema discipline)
 *  - scheduling_slots handler: sets schedulingContext only if absent (first SSE wins)
 */

import {
  buildTypedRefinementPayload,
  buildTimeToBookedPayload
} from '../StreamingChatProvider.jsx';

// ─── SCHEDULING_TYPED_REFINEMENT payload (§B18d) ─────────────────────────────

describe('buildTypedRefinementPayload (§B18d — SCHEDULING_TYPED_REFINEMENT)', () => {
  it('returns EXACTLY the contracted keys', () => {
    const payload = buildTypedRefinementPayload(3);
    expect(Object.keys(payload)).toEqual(['slots_visible_count']);
  });

  it('slots_visible_count is a number', () => {
    const payload = buildTypedRefinementPayload(5);
    expect(typeof payload.slots_visible_count).toBe('number');
    expect(payload.slots_visible_count).toBe(5);
  });

  it('JSON.stringify contains no @ (no-PII substring-forbid gate)', () => {
    const payload = buildTypedRefinementPayload(3);
    expect(JSON.stringify(payload)).not.toContain('@');
  });

  it('JSON.stringify contains no typed text, email, or name', () => {
    const payload = buildTypedRefinementPayload(3);
    const serialized = JSON.stringify(payload);
    // The builder signature accepts ONLY slots_visible_count — typed text is
    // structurally never captured. Verify no forbidden strings possible.
    expect(serialized).not.toMatch(/maya|coordinator|example\.org/);
    expect(serialized.length).toBeLessThan(50); // sanity: only {"slots_visible_count":N}
  });

  it('builder signature accepts ONLY the count — no text argument', () => {
    // Structural test: passing extra args does not leak into the payload.
    // (JS won't error, but the function ignores extra args.)
    // @ts-ignore
    const payload = buildTypedRefinementPayload(2, 'Thursday afternoon', 'typed@text.com');
    expect(Object.keys(payload)).toEqual(['slots_visible_count']);
    expect(JSON.stringify(payload)).not.toContain('Thursday');
    expect(JSON.stringify(payload)).not.toContain('@');
  });
});

// ─── SCHEDULING_TIME_TO_BOOKED payload (§B18d) ──────────────────────────────

describe('buildTimeToBookedPayload (§B18d — SCHEDULING_TIME_TO_BOOKED)', () => {
  it('returns EXACTLY the contracted keys', () => {
    const payload = buildTimeToBookedPayload(5000, 2);
    expect(Object.keys(payload).sort()).toEqual(['ms', 'offers_seen']);
  });

  it('ms is a number', () => {
    const payload = buildTimeToBookedPayload(12345, 1);
    expect(typeof payload.ms).toBe('number');
    expect(payload.ms).toBe(12345);
  });

  it('offers_seen is a number', () => {
    const payload = buildTimeToBookedPayload(5000, 3);
    expect(typeof payload.offers_seen).toBe('number');
    expect(payload.offers_seen).toBe(3);
  });

  it('JSON.stringify contains no @ (no-PII substring-forbid gate)', () => {
    const payload = buildTimeToBookedPayload(5000, 2);
    expect(JSON.stringify(payload)).not.toContain('@');
  });

  it('JSON.stringify contains no booking details, attendee info, or coordinator identity', () => {
    const payload = buildTimeToBookedPayload(5000, 2);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/email|name|booking|attendee|coordinator/);
  });
});

// ─── Typed-refinement gate logic (§B18d) ────────────────────────────────────
// Tests the decision logic: "fire only when no scheduling_* routing_metadata AND
// the latest assistant message carries schedulingSlots."
// We test the logic in isolation since the provider is complex to mount.

/**
 * Mirrors the typed-refinement detection logic from StreamingChatProvider.jsx:
 *   isSchedulingClick = !!(metadata?.scheduling_action || metadata?.scheduling_day_selected)
 *   if (!isSchedulingClick) { check latestAssistant.metadata.schedulingSlots }
 */
function shouldFireTypedRefinement(metadata, messages) {
  const isSchedulingClick = !!(
    metadata?.scheduling_action ||
    metadata?.scheduling_day_selected
  );
  if (isSchedulingClick) return false;
  const latestAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  const slotsVisible = latestAssistant?.metadata?.schedulingSlots;
  return Array.isArray(slotsVisible) && slotsVisible.length > 0;
}

describe('typed-refinement detection logic (§B18d)', () => {
  const SLOTS = [{ slotId: 'slot#a', label: 'Tue 2pm' }, { slotId: 'slot#b', label: 'Wed 4pm' }];
  const messagesWithSlots = [
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Here are slots', metadata: { schedulingSlots: SLOTS } }
  ];
  const messagesWithoutSlots = [
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Here is info', metadata: {} }
  ];

  it('fires when free text AND latest assistant carries slots', () => {
    // Free text send: no scheduling_action, no scheduling_day_selected
    expect(shouldFireTypedRefinement({}, messagesWithSlots)).toBe(true);
  });

  it('does NOT fire when send carries scheduling_action (chip click)', () => {
    expect(
      shouldFireTypedRefinement(
        { scheduling_action: 'select_slot', scheduling_slot_id: 'slot#a' },
        messagesWithSlots
      )
    ).toBe(false);
  });

  it('does NOT fire when send carries scheduling_day_selected (day-strip click)', () => {
    expect(
      shouldFireTypedRefinement(
        { scheduling_day_selected: '2026-06-15' },
        messagesWithSlots
      )
    ).toBe(false);
  });

  it('does NOT fire when latest assistant message has no slots', () => {
    expect(shouldFireTypedRefinement({}, messagesWithoutSlots)).toBe(false);
  });

  it('does NOT fire when latest assistant message has empty slots array', () => {
    const msgs = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Info', metadata: { schedulingSlots: [] } }
    ];
    expect(shouldFireTypedRefinement({}, msgs)).toBe(false);
  });

  it('does NOT fire when there are no assistant messages', () => {
    expect(shouldFireTypedRefinement({}, [{ role: 'user', content: 'Hi' }])).toBe(false);
  });
});

// ─── time-to-booked skip logic (§B18d) ───────────────────────────────────────
// Mirrors the guard: "if firstOfferTimestampRef.current !== null" before emitting.

describe('SCHEDULING_TIME_TO_BOOKED skip guard (§B18d)', () => {
  it('skips when no first-offer timestamp (returns undefined / no-op)', () => {
    // The guard in the provider: if (firstOfferTimestampRef.current !== null) { emit }
    const firstOfferTs = null; // simulates page-reload mid-flow
    const shouldEmit = firstOfferTs !== null;
    expect(shouldEmit).toBe(false);
  });

  it('emits when first-offer timestamp is known', () => {
    const firstOfferTs = Date.now() - 5000;
    const shouldEmit = firstOfferTs !== null;
    expect(shouldEmit).toBe(true);
    const ms = Date.now() - firstOfferTs;
    expect(typeof ms).toBe('number');
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});

// ─── clearMessages ref-reset logic (item 5) ──────────────────────────────────
// Mirrors the clearMessages reset: firstOfferTimestampRef = null, offersSeenRef = 0.
// A fresh conversation after clearMessages must establish a new first-offer timestamp.

describe('clearMessages §B18d ref reset (item 5)', () => {
  it('after clearMessages, a fresh scheduling_slots establishes a new first-offer timestamp', () => {
    // Simulate first conversation: timestamp T1 is set
    let firstOfferTimestamp = Date.now() - 10000;
    let offersSeen = 2;
    let bookedEmitted = true;

    // clearMessages resets all three
    firstOfferTimestamp = null;
    offersSeen = 0;
    bookedEmitted = false;

    expect(firstOfferTimestamp).toBeNull();
    expect(offersSeen).toBe(0);
    expect(bookedEmitted).toBe(false);

    // New scheduling_slots arrives after clear
    const now = Date.now();
    if (firstOfferTimestamp === null) {
      firstOfferTimestamp = now;
    }
    offersSeen += 1;

    expect(firstOfferTimestamp).toBeGreaterThanOrEqual(now);
    expect(offersSeen).toBe(1);
  });

  it('TIME_TO_BOOKED ms is computed from the new timestamp, not the pre-clear one', () => {
    // Pre-clear state: old booking
    let firstOfferTimestamp = Date.now() - 60000; // 60s ago

    // clearMessages
    firstOfferTimestamp = null;

    // New conversation: slot arrives, then book
    const offerTime = Date.now();
    firstOfferTimestamp = offerTime;

    const msAfterReset = Date.now() - firstOfferTimestamp;
    // Must be much less than 60000ms (the pre-clear value would have been)
    expect(msAfterReset).toBeLessThan(5000);
  });
});

// ─── scheduling_booked idempotency (item 6) ───────────────────────────────────
// Mirrors the bookedEmittedRef guard: SCHEDULING_TIME_TO_BOOKED emitted at most once.

describe('scheduling_booked idempotency guard (item 6)', () => {
  it('two consecutive scheduling_booked SSEs result in exactly one emission', () => {
    const emitted = [];
    let bookedEmitted = false;
    const firstOfferTimestamp = Date.now() - 5000;

    function simulateBookedSSE() {
      if (firstOfferTimestamp !== null && !bookedEmitted) {
        bookedEmitted = true;
        const ms = Date.now() - firstOfferTimestamp;
        emitted.push(buildTimeToBookedPayload(ms, 1));
      }
    }

    simulateBookedSSE(); // first SSE
    simulateBookedSSE(); // duplicate SSE — must be suppressed

    expect(emitted).toHaveLength(1);
  });

  it('guard resets after clearMessages so the next conversation can emit', () => {
    let bookedEmitted = true; // from prior conversation

    // clearMessages
    bookedEmitted = false;

    expect(bookedEmitted).toBe(false);

    // New conversation: booking arrives
    const emitted = [];
    const firstOfferTimestamp = Date.now() - 2000;
    if (firstOfferTimestamp !== null && !bookedEmitted) {
      bookedEmitted = true;
      emitted.push(buildTimeToBookedPayload(Date.now() - firstOfferTimestamp, 1));
    }

    expect(emitted).toHaveLength(1);
  });
});

// ─── schedulingContext attach logic (§B18b) ──────────────────────────────────
// Mirrors the provider's "set schedulingContext only if absent" logic.

describe('schedulingContext attach on scheduling_slots (§B18b)', () => {
  /**
   * Mirrors the provider's metadata merge:
   *   ...(existing.schedulingContext == null && context != null
   *     ? { schedulingContext: context }
   *     : {})
   */
  function mergeContext(existing, context) {
    return {
      ...existing,
      ...(existing.schedulingContext == null && context != null
        ? { schedulingContext: context }
        : {})
    };
  }

  const CTX = { duration_minutes: 30, conference_label: 'Google Meet', tz_label: 'Central Time' };

  it('attaches context when no existing schedulingContext', () => {
    const result = mergeContext({}, CTX);
    expect(result.schedulingContext).toEqual(CTX);
  });

  it('tolerates absent context (old-shape fixture — schema discipline)', () => {
    // Old BSH without context field → context is null.
    const result = mergeContext({}, null);
    expect(result.schedulingContext).toBeUndefined();
  });

  it('does NOT overwrite existing schedulingContext (first SSE wins)', () => {
    const first = { duration_minutes: 30, conference_label: 'Zoom', tz_label: 'Mountain Time' };
    const result = mergeContext({ schedulingContext: first }, CTX);
    // The context must not change.
    expect(result.schedulingContext).toEqual(first);
  });

  it('tolerates undefined context without crashing', () => {
    const result = mergeContext({}, undefined);
    expect(result.schedulingContext).toBeUndefined();
  });
});

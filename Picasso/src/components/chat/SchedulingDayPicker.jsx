/**
 * SchedulingDayPicker — Surface-4 day-picker strip (WS-T3-DAYPICK-FE, §B16e).
 *
 * Renders the backend's `scheduling_day_picker` SSE event as a horizontally
 * scrollable 7-day strip. The user taps a day, and the widget sends the next
 * turn with the deterministic `scheduling_day_selected: 'YYYY-MM-DD'` signal in
 * routing_metadata — exactly mirroring how C12 sends `scheduling_slot_id`.
 *
 * Contract (§B16e — FROZEN):
 *   SSE message: { type: 'scheduling_day_picker',
 *                  days: [{ date: 'YYYY-MM-DD', label: '<str ≤28 chars>' }],
 *                  user_time_zone: '<IANA tz>' }
 *   Widget signal (routing_metadata on next turn):
 *                  { scheduling_day_selected: 'YYYY-MM-DD' }
 *
 * Rendering constraints (UI plan §Surface-4):
 *  - 7-day strip; swipe-able / scrollable at ≤375px
 *  - Intl.DateTimeFormat labels in user_time_zone (NO tz lib — uses the label
 *    the backend provides, which the backend already formatted with Intl)
 *  - CSS logical properties (inline-size, padding-inline, etc.)
 *  - chip label ≤28 chars (clamped in render for safety)
 *  - WCAG 2.1 AA: focus order, aria-labels, contrast via shared tokens
 *
 * Schema discipline: unknown / malformed entries in `days` are skipped silently
 * (missing `date` or `label`) — old-shape data must never crash this reader.
 *
 * Styling reuses `.suggested-chip` / shared token classes (theme.css) so the
 * strip inherits per-tenant branding without a new stylesheet.
 *
 * NOTE (A8b gap — mirrors SchedulingSlots): user-facing copy is centralized in
 * DAY_PICKER_STRINGS for a trivial swap once A8b lands.
 */

import React, { useState } from 'react';
import { useChat } from '../../hooks/useChat';

// ─── User-facing copy ────────────────────────────────────────────────────────
// Swap to t() once A8b lands (see header note / SchedulingSlots pattern).
export const DAY_PICKER_STRINGS = {
  // aria-label for the scroll container
  stripAriaLabel: 'Select a day',
  // aria-label template for each chip — receives the day label
  chipAriaLabel: (label) => `Select ${label}`,
  // Shown after a day is selected (status role)
  selectedAnnouncement: (label) => `${label} selected`,
};

// Maximum label length we render (§B16e chip label ≤28 chars).
const MAX_LABEL_LENGTH = 28;

/**
 * Validate a raw day entry from the SSE payload.
 * Returns false for anything missing `date` or `label` (schema discipline).
 *
 * @param {*} day
 * @returns {boolean}
 */
function isValidDay(day) {
  return (
    day !== null &&
    typeof day === 'object' &&
    typeof day.date === 'string' &&
    day.date.length > 0 &&
    typeof day.label === 'string' &&
    day.label.length > 0
  );
}

/**
 * Day-picker strip renderer.
 *
 * @param {object} props
 * @param {Array<{date:string, label:string}>} props.days  - next 7 candidate days
 * @param {string} [props.user_time_zone]                  - IANA tz (informational;
 *        the label is pre-formatted by the backend — no client-side tz math needed)
 */
export default function SchedulingDayPicker({ days = [], user_time_zone: _tz }) {
  const { sendMessage, isTyping } = useChat();
  const [selectedDate, setSelectedDate] = useState(null);

  // Schema discipline: silently skip malformed entries.
  const validDays = Array.isArray(days) ? days.filter(isValidDay) : [];

  if (validDays.length === 0) return null;

  const handleSelect = (day) => {
    if (isTyping || selectedDate || !day || !sendMessage) return;
    setSelectedDate(day.date);
    // §B16e: deterministic signal — mirrors how C12 sends scheduling_slot_id.
    // The visible user turn is the day label (natural transcript line);
    // scheduling_day_selected rides in routing_metadata as the deterministic hint.
    sendMessage(day.label, {
      scheduling_day_selected: day.date,
    });
  };

  const selectedDay = validDays.find((d) => d.date === selectedDate);

  return (
    <div className="scheduling-day-picker" data-testid="scheduling-day-picker">
      {!selectedDate ? (
        /* Scrollable strip — CSS logical properties; overflow-x scroll for ≤375px */
        <div
          className="scheduling-day-strip"
          role="group"
          aria-label={DAY_PICKER_STRINGS.stripAriaLabel}
          // CSS logical: inline direction scroll
          style={{ overflowX: 'auto', display: 'flex', gap: '0.5rem', paddingInline: '0.25rem' }}
        >
          {validDays.map((day) => {
            // Clamp label to 28 chars for safety (backend should already comply).
            const displayLabel = day.label.length > MAX_LABEL_LENGTH
              ? day.label.slice(0, MAX_LABEL_LENGTH)
              : day.label;
            return (
              <button
                key={day.date}
                type="button"
                className="suggested-chip scheduling-day-chip"
                disabled={isTyping}
                aria-label={DAY_PICKER_STRINGS.chipAriaLabel(displayLabel)}
                // P1-7 fix: the strip is a NON-wrapping flex row, and
                // .suggested-chip's `overflow: hidden` zeroes the flex
                // automatic minimum size — so default flex-shrink:1 squeezed
                // all 7 chips into the container width, clipping each label
                // to a circle. `flex: 0 0 auto` keeps the chip at its natural
                // label width (the strip scrolls instead, as designed), and
                // the 16px radius pins the same pill shape SchedulingSlots
                // chips get from .suggested-chip.
                style={{ flex: '0 0 auto', borderRadius: '16px' }}
                onClick={() => handleSelect(day)}
              >
                {displayLabel}
              </button>
            );
          })}
        </div>
      ) : (
        /* Post-selection: show the chosen day label as a static affordance */
        <div
          className="scheduling-day-selected-display"
          role="status"
          aria-live="polite"
          data-testid="scheduling-day-selected-display"
        >
          {selectedDay
            ? DAY_PICKER_STRINGS.selectedAnnouncement(
                selectedDay.label.length > MAX_LABEL_LENGTH
                  ? selectedDay.label.slice(0, MAX_LABEL_LENGTH)
                  : selectedDay.label
              )
            : null}
        </div>
      )}
    </div>
  );
}

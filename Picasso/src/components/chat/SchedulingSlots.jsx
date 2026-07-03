/**
 * SchedulingSlots — generic slot-chip renderer + confirm affirmative for the
 * in-chat scheduling flow (scheduling v1 sub-phase C, WS-C12).
 *
 * Renders the backend's `scheduling_slots` SSE event as GENERIC, tappable chips.
 * Serves BOTH halves of the booking story that emit this event:
 *   • the recovery loop (reschedule slot offers — `schedulingFlow.js`), and
 *   • new-booking (`proposing` step — §B16a).
 *
 * §B18b — context line: when `metadata.schedulingContext` is present on the
 * enclosing message, a single line is rendered ABOVE the chips showing the
 * non-null parts of [duration_minutes, conference_label, tz_label] joined with
 * ' · ' (e.g. "30 min · Google Meet · Central Time"). Absent → no line.
 * Old-shape fixture tests REQUIRED (CLAUDE.md schema discipline).
 *
 * §B18c — microcopy close: under EVERY rendered slot-chip set, renders EXACTLY:
 *   "If none of these work, just tell me what does — like 'Thursday afternoon.'"
 * NO "More times" chip (operator decision 2026-06-12).
 *
 * §B18d — analytics: chip click → SCHEDULING_CHIP_CLICKED { slot_id, position,
 * slot_count } via the existing emitAnalyticsEvent / notifyParentEvent path.
 * PII gate: payload builder accepts SCALAR args; NEVER a slot object.
 *
 * §10.4 PII boundary (load-bearing): a chip shows the slot's `label` ONLY. The
 * coordinator identity is NEVER rendered here — it is revealed only at the
 * `confirming` step, by the backend's streamed LLM prose (ordinary chat text the
 * existing MessageBubble renders). This component renders no coordinator name and
 * holds no attendee/coordinator PII.
 *
 * Dispatch (FROZEN_CONTRACTS §B16b as amended, §B14): tapping a chip / the confirm
 * button REUSES the existing message dispatch (`sendMessage`) — it does NOT invent a
 * new transport and does NOT add a new `cta.action`. The backend consumes the
 * `scheduling_action` (+ `scheduling_slot_id`) signal DETERMINISTICALLY (§B16b
 * amendment); the LLM detector remains the fallback for typed text only.
 *
 * The confirm affordance is SERVER-driven: the backend's `scheduling_confirm` SSE
 * (slot staged + identity resolved) renders <SchedulingConfirmCard>. The slot list
 * itself no longer shows a local confirm button — selection sends the signal and the
 * server decides whether to ask for an email first or arm the confirm.
 *
 * Styling (Hairline W4.2): this is an UNMOCKED surface (Turn 10 has no
 * scheduling screen) — per HAIRLINE_REDESIGN_MAPPING.md §0 case 2 / §4 item 2,
 * the appearance below is a fresh Hairline treatment extrapolated from the
 * vocabulary already established on merged, MOCKED-adjacent surfaces: slot
 * rows use menu-row anatomy (mirrors src/components/forms/FormFieldPrompt.jsx's
 * `.hairline-form-menu`/`.hairline-form-menu-row`, itself a W4.1 unmocked-
 * surface precedent), and the "Yes, book it" commit action uses pill-button
 * anatomy (mirrors hairline-views.css's `.hairline-pill-button--danger`, the
 * Settings destructive-confirm pill, as this action's positive-commit twin).
 * NOT a restyle of the old `.suggested-chip`/`.cta-button` pill look — theme.css
 * still owns those classes for other surfaces, but this component no longer
 * references them. Rules live in the "W4.2 IN-CHAT SCHEDULING" section
 * appended to the end of hairline-thread.css.
 *
 * NOTE (A8b gap — flagged for integrator): the plan calls for static strings to go
 * through a `t()` indirection (A8b). No such helper exists on `staging` yet, so the
 * user-facing copy below is centralized in SCHEDULING_STRINGS for a trivial later
 * swap. See the PR report-back.
 */

import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, Info } from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import {
  SCHEDULING_CHIP_CLICKED
} from '../../analytics/eventConstants';

// ─── Analytics helpers ────────────────────────────────────────────────────────

/**
 * Emit analytics event via global notifyParentEvent (same pattern as
 * MessageBubble.jsx / StreamingChatProvider.jsx).
 * @param {string} eventType
 * @param {Object} payload
 */
function emitAnalyticsEvent(eventType, payload) {
  if (typeof window !== 'undefined' && window.notifyParentEvent) {
    window.notifyParentEvent(eventType, payload);
  } else {
    console.warn('[SchedulingSlots] notifyParentEvent not available for:', eventType);
  }
}

/**
 * §B18d payload builder — SCHEDULING_CHIP_CLICKED.
 * Accepts SCALAR args only. NEVER the slot object (PII gate).
 *
 * @param {string} slotId     - slot.slotId (string, not the slot object)
 * @param {number} position   - 0-based index in the rendered chip list
 * @param {number} slotCount  - total chips rendered (= slots.length)
 * @returns {{ slot_id: string, position: number, slot_count: number }}
 */
export function buildChipClickedPayload(slotId, position, slotCount) {
  return {
    slot_id: slotId,
    position,
    slot_count: slotCount
  };
}

// ─── Centralized user-facing copy ────────────────────────────────────────────
// Swap to `t()` once A8b lands (see header note).
export const SCHEDULING_STRINGS = {
  confirmAffirmative: 'Yes, book it',
  // §B18c — EXACT microcopy close (LOCKED 2026-06-12; do not alter).
  microcopyClose: "If none of these work, just tell me what does — like 'Thursday afternoon.'",
  // Friendly inline copy for each known `scheduling_notice` code. Unknown codes
  // fall back to a generic reassurance (forward-compatible per schema discipline).
  notices: {
    request_received_email_followup:
      "Thanks — we've got your request and will confirm the details by email shortly.",
  },
  noticeFallback: "Thanks — we've got your request and will follow up shortly.",
};

// ─── Context line helper ──────────────────────────────────────────────────────

/**
 * §B18b: build the display string for the context line above chips.
 * Joins the non-null parts of [duration_minutes, conference_label, tz_label]
 * with ' · '. Returns null if no parts present (no context or all null).
 *
 * @param {{ duration_minutes?: number|null, conference_label?: string|null, tz_label?: string|null }|null|undefined} ctx
 * @returns {string|null}
 */
export function buildContextLine(ctx) {
  if (!ctx || typeof ctx !== 'object') return null;
  const parts = [
    ctx.duration_minutes != null && ctx.duration_minutes > 0 ? `${ctx.duration_minutes} min` : null,
    ctx.conference_label || null,
    ctx.tz_label || null
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Slot-chip renderer with context line (§B18b), microcopy close (§B18c),
 * and analytics emission (§B18d).
 *
 * @param {object}   props
 * @param {Array<{slotId:string,start:string,end:string,label:string}>} props.slots
 *        generic slots from the `scheduling_slots` event (label-only display).
 * @param {object}   [props.schedulingContext]
 *        optional context from metadata.schedulingContext (§B18b; absent → no line).
 */
// Scroll the scheduling affordance into view when it mounts — the chips/card arrive
// AFTER the streamed text and previously rendered below the fold (QA 2026-06-12 P1-6).
function useRevealOnMount() {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && typeof ref.current.scrollIntoView === 'function') {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, []);
  return ref;
}

export default function SchedulingSlots({ slots = [], schedulingContext }) {
  const { sendMessage, isTyping } = useChat();
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const ref = useRevealOnMount();

  if (!Array.isArray(slots) || slots.length === 0) return null;

  const handleSelect = (slot, position) => {
    if (isTyping || selectedSlotId || !slot || !sendMessage) return;
    setSelectedSlotId(slot.slotId);

    // §B18d analytics: emit SCHEDULING_CHIP_CLICKED with scalar args only (PII gate).
    // Emitted ALONGSIDE the existing sendMessage dispatch — does not replace or alter it.
    // try/catch: analytics MUST NEVER prevent the deterministic sendMessage call below.
    try {
      emitAnalyticsEvent(
        SCHEDULING_CHIP_CLICKED,
        buildChipClickedPayload(slot.slotId, position, slots.length)
      );
    } catch (e) {
      console.warn('[SchedulingSlots] emitAnalyticsEvent threw (swallowed):', e);
    }

    // §B16b (amended): elicit `select_slot`. The visible user turn is the slot label
    // (a natural transcript line); the slotId is the DETERMINISTIC backend signal.
    sendMessage(slot.label, {
      scheduling_action: 'select_slot',
      scheduling_slot_id: slot.slotId,
    });
  };

  const selectedSlot = slots.find((s) => s.slotId === selectedSlotId);

  // §B18b: build context line (null when context absent or all fields null).
  const contextLine = buildContextLine(schedulingContext);

  return (
    <div className="scheduling-slots" data-testid="scheduling-slots" ref={ref}>
      {/* §B18b context line — rendered only when non-null */}
      {contextLine && (
        <div
          className="scheduling-context-line"
          data-testid="scheduling-context-line"
          aria-label={contextLine}
        >
          {contextLine}
        </div>
      )}
      {!selectedSlotId ? (
        <div className="hairline-scheduling-card" role="group" aria-label="Available times">
          {slots.map((slot, index) => (
            <button
              key={slot.slotId}
              type="button"
              className="hairline-scheduling-row"
              disabled={isTyping}
              onClick={() => handleSelect(slot, index)}
            >
              <span className="hairline-scheduling-row-label">{slot.label}</span>
              <ChevronRight className="hairline-scheduling-row-arrow" size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : (
        selectedSlot && (
          <span className="scheduling-slot-selected">{selectedSlot.label}</span>
        )
      )}
      {/* §B18c microcopy close — rendered under EVERY slot-chip set, EXACT string.
          NO "More times" chip (operator decision 2026-06-12). */}
      {!selectedSlotId && (
        <p
          className="scheduling-microcopy-close"
          data-testid="scheduling-microcopy-close"
        >
          {SCHEDULING_STRINGS.microcopyClose}
        </p>
      )}
    </div>
  );
}

/**
 * Server-driven confirm card — renders the backend's `scheduling_confirm` SSE
 * (slot staged, identity resolved). Tapping sends the deterministic `confirm_book`
 * signal; the backend commits only from `confirming` with a persisted slot (§B14).
 * One-shot per card: the server re-arms by emitting a fresh event when needed.
 *
 * @param {object} props
 * @param {{slot:{slotId:string,label:string}, attendee_email?:string}} props.confirm
 */
export function SchedulingConfirmCard({ confirm }) {
  const { sendMessage, isTyping } = useChat();
  const [confirmed, setConfirmed] = useState(false);
  const ref = useRevealOnMount();

  if (!confirm || !confirm.slot) return null;

  const handleConfirm = () => {
    if (isTyping || confirmed || !sendMessage) return;
    setConfirmed(true);
    // §B16b (amended): elicit `confirm_book` deterministically — carries no PII.
    sendMessage(SCHEDULING_STRINGS.confirmAffirmative, {
      scheduling_action: 'confirm_book',
    });
  };

  return (
    <div className="scheduling-slots scheduling-confirm-card" data-testid="scheduling-confirm" ref={ref}>
      <div className="hairline-scheduling-card hairline-scheduling-confirm-card">
        <div className="hairline-scheduling-confirm-row">
          <span className="scheduling-slot-selected">{confirm.slot.label}</span>
        </div>
        {confirm.attendee_email && (
          <div className="hairline-scheduling-confirm-row">
            <span className="scheduling-confirm-email">{confirm.attendee_email}</span>
          </div>
        )}
      </div>
      <button
        type="button"
        className="hairline-scheduling-confirm-button"
        disabled={isTyping || confirmed}
        onClick={handleConfirm}
      >
        {SCHEDULING_STRINGS.confirmAffirmative}
      </button>
    </div>
  );
}

/**
 * Friendly inline notice for the backend's `scheduling_notice` event (e.g. the
 * "we'll confirm by email" fallback). Maps the notice CODE to display copy;
 * tolerates unknown/absent codes (schema discipline).
 *
 * @param {object} props
 * @param {string} props.notice - the notice code (e.g. 'request_received_email_followup')
 */
export function SchedulingNotice({ notice }) {
  if (!notice) return null;
  const text =
    SCHEDULING_STRINGS.notices[notice] || SCHEDULING_STRINGS.noticeFallback;
  return (
    <div className="scheduling-notice" role="status" data-testid="scheduling-notice">
      <Info size={15} strokeWidth={2} aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

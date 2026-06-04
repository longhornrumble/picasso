/**
 * SchedulingSlots — generic slot-chip renderer + confirm affirmative for the
 * in-chat scheduling flow (scheduling v1 sub-phase C, WS-C12).
 *
 * Renders the backend's `scheduling_slots` SSE event as GENERIC, tappable chips.
 * Serves BOTH halves of the booking story that emit this event:
 *   • the recovery loop (reschedule slot offers — `schedulingFlow.js`), and
 *   • new-booking (`proposing` step — §B16a).
 *
 * §10.4 PII boundary (load-bearing): a chip shows the slot's `label` ONLY. The
 * coordinator identity is NEVER rendered here — it is revealed only at the
 * `confirming` step, by the backend's streamed LLM prose (ordinary chat text the
 * existing MessageBubble renders). This component renders no coordinator name and
 * holds no attendee/coordinator PII.
 *
 * Dispatch (FROZEN_CONTRACTS §B16b, §B14): tapping a chip / the confirm button
 * REUSES the existing message dispatch (`sendMessage`) — it does NOT invent a new
 * transport and does NOT add a new `cta.action`. The backend's focused post-stream
 * detector reads the resulting user turn as `select_slot` / `confirm_book`; the
 * `slotId` rides along in routing_metadata as a deterministic hint.
 *
 * Styling reuses the global `.suggested-chip` / `.cta-button` token classes
 * (theme.css) so affordances inherit per-tenant branding without a new stylesheet.
 *
 * NOTE (A8b gap — flagged for integrator): the plan calls for static strings to go
 * through a `t()` indirection (A8b). No such helper exists on `staging` yet, so the
 * user-facing copy below is centralized in SCHEDULING_STRINGS for a trivial later
 * swap. See the PR report-back.
 */

import React, { useState } from 'react';
import { useChat } from '../../hooks/useChat';

// Centralized user-facing copy. Swap to `t()` once A8b lands (see header note).
export const SCHEDULING_STRINGS = {
  confirmAffirmative: 'Yes, book it',
  // Friendly inline copy for each known `scheduling_notice` code. Unknown codes
  // fall back to a generic reassurance (forward-compatible per schema discipline).
  notices: {
    request_received_email_followup:
      "Thanks — we've got your request and will confirm the details by email shortly.",
  },
  noticeFallback: "Thanks — we've got your request and will follow up shortly.",
};

/**
 * Slot-chip renderer with an inline confirm affirmative.
 *
 * @param {object}   props
 * @param {Array<{slotId:string,start:string,end:string,label:string}>} props.slots
 *        generic slots from the `scheduling_slots` event (label-only display).
 */
export default function SchedulingSlots({ slots = [] }) {
  const { sendMessage, isTyping } = useChat();
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  if (!Array.isArray(slots) || slots.length === 0) return null;

  const handleSelect = (slot) => {
    if (isTyping || selectedSlotId || !slot || !sendMessage) return;
    setSelectedSlotId(slot.slotId);
    // §B16b: elicit `select_slot`. The visible user turn is the slot label (a
    // natural transcript line); the slotId is a deterministic backend hint.
    sendMessage(slot.label, {
      scheduling_action: 'select_slot',
      scheduling_slot_id: slot.slotId,
    });
  };

  const handleConfirm = () => {
    if (isTyping || confirmed || !sendMessage) return;
    setConfirmed(true);
    // §B16b: elicit `confirm_book`. Generic affirmative — carries no PII.
    sendMessage(SCHEDULING_STRINGS.confirmAffirmative, {
      scheduling_action: 'confirm_book',
    });
  };

  const selectedSlot = slots.find((s) => s.slotId === selectedSlotId);

  return (
    <div className="scheduling-slots" data-testid="scheduling-slots">
      <div className="suggested-chips">
        {!selectedSlotId ? (
          slots.map((slot) => (
            <button
              key={slot.slotId}
              type="button"
              className="suggested-chip scheduling-slot-chip"
              disabled={isTyping}
              onClick={() => handleSelect(slot)}
            >
              {slot.label}
            </button>
          ))
        ) : (
          <>
            {selectedSlot && (
              <span className="scheduling-slot-selected">{selectedSlot.label}</span>
            )}
            <button
              type="button"
              className="cta-button cta-primary scheduling-confirm-button"
              disabled={isTyping || confirmed}
              onClick={handleConfirm}
            >
              {SCHEDULING_STRINGS.confirmAffirmative}
            </button>
          </>
        )}
      </div>
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
      {text}
    </div>
  );
}

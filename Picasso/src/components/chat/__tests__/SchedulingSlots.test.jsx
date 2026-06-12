/**
 * SchedulingSlots tests (scheduling v1 sub-phase C, WS-C12; extended §B18 WS-OP-FE).
 *
 * Covers the done-bar:
 *  - chips render `label` ONLY (snapshot asserts NO coordinator name — §10.4 boundary)
 *  - tapping a chip dispatches a `select_slot`-eliciting turn (reuses sendMessage)
 *  - the confirm affirmative dispatches a `confirm_book`-eliciting turn
 *  - SchedulingNotice renders friendly inline copy (forward-compatible on unknown codes)
 *
 * Extended for §B18 WS-OP-FE:
 *  - §B18b context line: renders joined parts; null parts dropped; absent context → no line
 *    (old-shape fixture test — schema discipline)
 *  - §B18c microcopy: exact string rendered under chip set
 *  - §B18d SCHEDULING_CHIP_CLICKED: exact payload keys, value types, no-PII assertion
 *  - buildContextLine helper: all combinations
 *  - buildChipClickedPayload helper: key allowlist + type assertions
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SchedulingSlots, {
  SchedulingNotice,
  SchedulingConfirmCard,
  SCHEDULING_STRINGS,
  buildContextLine,
  buildChipClickedPayload
} from '../SchedulingSlots';
import { ChatContext } from '../../../context/shared/ChatContext';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeChatContext = (overrides = {}) => ({
  messages: [],
  isTyping: false,
  sendMessage: jest.fn(),
  addMessage: jest.fn(),
  clearMessages: jest.fn(),
  retryMessage: jest.fn(),
  ...overrides,
});

const renderWithChat = (component, ctx = makeChatContext()) => {
  const result = render(
    <ChatContext.Provider value={ctx}>{component}</ChatContext.Provider>
  );
  return { ...result, ctx };
};

// Mock window.notifyParentEvent for analytics assertions
const mockNotify = jest.fn();
beforeEach(() => {
  mockNotify.mockClear();
  Object.defineProperty(window, 'notifyParentEvent', {
    value: mockNotify,
    configurable: true,
    writable: true
  });
});
afterEach(() => {
  delete window.notifyParentEvent;
});

// Generic slots as the backend emits them. The coordinator-identifying fields
// (resourceId / coordinator_email) are intentionally present to prove they are
// NEVER rendered on a chip (the §10.4 PII boundary).
const SLOTS = [
  {
    slotId: 'slot#2026-06-03T14:00:00Z-maya',
    start: '2026-06-03T14:00:00Z',
    end: '2026-06-03T14:30:00Z',
    label: 'Tue, Jun 3 · 2:00 PM',
    resourceId: 'maya@example.org',
    coordinator_email: 'maya@example.org',
  },
  {
    slotId: 'slot#2026-06-04T16:00:00Z-maya',
    start: '2026-06-04T16:00:00Z',
    end: '2026-06-04T16:30:00Z',
    label: 'Wed, Jun 4 · 4:00 PM',
    resourceId: 'maya@example.org',
  },
];

// ─── buildContextLine helper ──────────────────────────────────────────────────

describe('buildContextLine helper (§B18b)', () => {
  it('joins all non-null parts with · separator', () => {
    expect(buildContextLine({
      duration_minutes: 30,
      conference_label: 'Google Meet',
      tz_label: 'Central Time'
    })).toBe('30 min · Google Meet · Central Time');
  });

  it('drops null conference_label', () => {
    expect(buildContextLine({
      duration_minutes: 30,
      conference_label: null,
      tz_label: 'Central Time'
    })).toBe('30 min · Central Time');
  });

  it('drops null tz_label', () => {
    expect(buildContextLine({
      duration_minutes: 45,
      conference_label: 'Zoom',
      tz_label: null
    })).toBe('45 min · Zoom');
  });

  it('returns null when all fields are null', () => {
    expect(buildContextLine({
      duration_minutes: null,
      conference_label: null,
      tz_label: null
    })).toBeNull();
  });

  it('returns null when context is null (old-shape fixture — schema discipline)', () => {
    // This is the required old-shape fixture test per CLAUDE.md schema discipline.
    expect(buildContextLine(null)).toBeNull();
  });

  it('returns null when context is undefined', () => {
    expect(buildContextLine(undefined)).toBeNull();
  });

  it('returns null when context is absent (forward-compat)', () => {
    // Simulates a consumer receiving a message with no schedulingContext key at all.
    expect(buildContextLine(undefined)).toBeNull();
  });

  it('handles only duration_minutes', () => {
    expect(buildContextLine({ duration_minutes: 60 })).toBe('60 min');
  });

  it('handles only conference_label', () => {
    expect(buildContextLine({ conference_label: 'Phone call' })).toBe('Phone call');
  });
});

// ─── Context line rendering (§B18b) ──────────────────────────────────────────

describe('SchedulingSlots — §B18b context line', () => {
  it('renders context line above chips when schedulingContext is present', () => {
    renderWithChat(
      <SchedulingSlots
        slots={SLOTS}
        schedulingContext={{ duration_minutes: 30, conference_label: 'Google Meet', tz_label: 'Central Time' }}
      />
    );
    expect(screen.getByTestId('scheduling-context-line')).toBeInTheDocument();
    expect(screen.getByTestId('scheduling-context-line').textContent).toBe(
      '30 min · Google Meet · Central Time'
    );
  });

  it('drops null parts from context line (partial context)', () => {
    renderWithChat(
      <SchedulingSlots
        slots={SLOTS}
        schedulingContext={{ duration_minutes: 30, conference_label: null, tz_label: 'Mountain Time' }}
      />
    );
    expect(screen.getByTestId('scheduling-context-line').textContent).toBe(
      '30 min · Mountain Time'
    );
  });

  it('renders NO context line when schedulingContext is absent (old-shape fixture — schema discipline)', () => {
    // Old-shape message: no schedulingContext at all. Must not crash.
    renderWithChat(<SchedulingSlots slots={SLOTS} />);
    expect(screen.queryByTestId('scheduling-context-line')).not.toBeInTheDocument();
  });

  it('renders NO context line when all schedulingContext fields are null', () => {
    renderWithChat(
      <SchedulingSlots
        slots={SLOTS}
        schedulingContext={{ duration_minutes: null, conference_label: null, tz_label: null }}
      />
    );
    expect(screen.queryByTestId('scheduling-context-line')).not.toBeInTheDocument();
  });

  it('renders context line ABOVE chips (DOM order)', () => {
    const { container } = renderWithChat(
      <SchedulingSlots
        slots={SLOTS}
        schedulingContext={{ duration_minutes: 30, conference_label: 'Zoom', tz_label: 'Eastern Time' }}
      />
    );
    const slotEl = container.querySelector('.scheduling-slots');
    const contextEl = container.querySelector('[data-testid="scheduling-context-line"]');
    const chipsEl = container.querySelector('.suggested-chips');
    // Context line must come before chips in document order.
    expect(slotEl.children[0]).toBe(contextEl);
    expect(slotEl.children[1]).toBe(chipsEl);
  });
});

// ─── Microcopy close (§B18c) ──────────────────────────────────────────────────

describe('SchedulingSlots — §B18c microcopy close', () => {
  it('renders EXACT microcopy string under every chip set', () => {
    renderWithChat(<SchedulingSlots slots={SLOTS} />);
    expect(
      screen.getByText(SCHEDULING_STRINGS.microcopyClose)
    ).toBeInTheDocument();
  });

  it('microcopy string matches the LOCKED §B18c value exactly', () => {
    expect(SCHEDULING_STRINGS.microcopyClose).toBe(
      "If none of these work, just tell me what does — like 'Thursday afternoon.'"
    );
  });

  it('microcopy is NOT rendered when a chip is selected (chips collapsed)', () => {
    renderWithChat(<SchedulingSlots slots={SLOTS} />);
    fireEvent.click(screen.getByText('Tue, Jun 3 · 2:00 PM'));
    // After selection, microcopy disappears with the chips.
    expect(
      screen.queryByText(SCHEDULING_STRINGS.microcopyClose)
    ).not.toBeInTheDocument();
  });

  it('does NOT render a "More times" chip (operator decision 2026-06-12)', () => {
    renderWithChat(<SchedulingSlots slots={SLOTS} />);
    // No chip with text "More times" or similar exists.
    expect(screen.queryByText(/more times/i)).not.toBeInTheDocument();
  });
});

// ─── Analytics — §B18d SCHEDULING_CHIP_CLICKED ───────────────────────────────

describe('buildChipClickedPayload (§B18d PII gate)', () => {
  it('returns EXACTLY the contracted keys', () => {
    const payload = buildChipClickedPayload('slot#2026-06-03T14:00:00Z', 0, 3);
    expect(Object.keys(payload).sort()).toEqual(['position', 'slot_count', 'slot_id']);
  });

  it('slot_id matches ^slot# pattern', () => {
    const payload = buildChipClickedPayload('slot#2026-06-03T14:00:00Z', 0, 3);
    expect(payload.slot_id).toMatch(/^slot#/);
  });

  it('position and slot_count are numbers', () => {
    const payload = buildChipClickedPayload('slot#abc', 1, 2);
    expect(typeof payload.position).toBe('number');
    expect(typeof payload.slot_count).toBe('number');
  });

  it('JSON.stringify contains no @ character (no-PII assertion)', () => {
    const payload = buildChipClickedPayload('slot#2026-06-03T14:00:00Z', 0, 3);
    expect(JSON.stringify(payload)).not.toContain('@');
  });

  it('JSON.stringify contains no email, name, or message text (no-PII assertion)', () => {
    const payload = buildChipClickedPayload('slot#2026-06-03T14:00:00Z', 0, 3);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/maya|example\.org|@/);
  });
});

describe('SchedulingSlots — §B18d SCHEDULING_CHIP_CLICKED emission', () => {
  it('emits SCHEDULING_CHIP_CLICKED with contracted payload when chip is clicked', () => {
    renderWithChat(<SchedulingSlots slots={SLOTS} />);
    fireEvent.click(screen.getByText('Tue, Jun 3 · 2:00 PM'));

    expect(mockNotify).toHaveBeenCalledWith(
      'SCHEDULING_CHIP_CLICKED',
      expect.objectContaining({
        slot_id: SLOTS[0].slotId,
        position: 0,
        slot_count: 2
      })
    );
  });

  it('emits with correct position for second chip', () => {
    renderWithChat(<SchedulingSlots slots={SLOTS} />);
    fireEvent.click(screen.getByText('Wed, Jun 4 · 4:00 PM'));

    expect(mockNotify).toHaveBeenCalledWith(
      'SCHEDULING_CHIP_CLICKED',
      expect.objectContaining({ position: 1 })
    );
  });

  it('emitted payload has EXACTLY the contracted keys (key-allowlist gate)', () => {
    renderWithChat(<SchedulingSlots slots={SLOTS} />);
    fireEvent.click(screen.getByText('Tue, Jun 3 · 2:00 PM'));

    const [, payload] = mockNotify.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(['position', 'slot_count', 'slot_id']);
  });

  it('emitted payload contains no @ (no-PII / substring-forbid gate)', () => {
    renderWithChat(<SchedulingSlots slots={SLOTS} />);
    fireEvent.click(screen.getByText('Tue, Jun 3 · 2:00 PM'));

    const [, payload] = mockNotify.mock.calls[0];
    expect(JSON.stringify(payload)).not.toContain('@');
  });

  it('does NOT emit when isTyping is true', () => {
    const ctx = makeChatContext({ isTyping: true });
    renderWithChat(<SchedulingSlots slots={SLOTS} />, ctx);
    fireEvent.click(screen.getByText('Tue, Jun 3 · 2:00 PM'));
    // notifyParentEvent should NOT have been called with SCHEDULING_CHIP_CLICKED
    const schedulingCalls = mockNotify.mock.calls.filter(c => c[0] === 'SCHEDULING_CHIP_CLICKED');
    expect(schedulingCalls).toHaveLength(0);
  });
});

// ─── Existing suite (preserved) ──────────────────────────────────────────────

describe('SchedulingSlots — generic chips', () => {
  it('renders one chip per slot showing the label only', () => {
    renderWithChat(<SchedulingSlots slots={SLOTS} />);
    expect(screen.getByText('Tue, Jun 3 · 2:00 PM')).toBeInTheDocument();
    expect(screen.getByText('Wed, Jun 4 · 4:00 PM')).toBeInTheDocument();
  });

  it('NEVER renders coordinator identity on a chip (§10.4 boundary)', () => {
    const { container } = renderWithChat(<SchedulingSlots slots={SLOTS} />);
    // No coordinator email / name leaks into the rendered chips.
    expect(container.textContent).not.toMatch(/maya/i);
    expect(container.textContent).not.toContain('@example.org');
  });

  it('snapshot: chip markup contains the label and no coordinator field', () => {
    const { container } = renderWithChat(<SchedulingSlots slots={[SLOTS[0]]} />);
    expect(container.querySelector('.scheduling-slots')).toMatchSnapshot();
  });

  it('renders nothing for empty / non-array slots', () => {
    const { container: c1 } = renderWithChat(<SchedulingSlots slots={[]} />);
    expect(c1.querySelector('.scheduling-slots')).toBeNull();
    const { container: c2 } = renderWithChat(<SchedulingSlots slots={undefined} />);
    expect(c2.querySelector('.scheduling-slots')).toBeNull();
  });
});

describe('SchedulingSlots — select_slot dispatch (§B16b)', () => {
  it('tapping a chip sends the label as the turn with select_slot + slotId metadata', () => {
    const { ctx } = renderWithChat(<SchedulingSlots slots={SLOTS} />);
    fireEvent.click(screen.getByText('Tue, Jun 3 · 2:00 PM'));
    expect(ctx.sendMessage).toHaveBeenCalledTimes(1);
    expect(ctx.sendMessage).toHaveBeenCalledWith('Tue, Jun 3 · 2:00 PM', {
      scheduling_action: 'select_slot',
      scheduling_slot_id: SLOTS[0].slotId,
    });
  });

  it('after selecting, chips collapse to the selected label — confirm is SERVER-driven (no local button)', () => {
    renderWithChat(<SchedulingSlots slots={SLOTS} />);
    fireEvent.click(screen.getByText('Tue, Jun 3 · 2:00 PM'));
    // The other chip is gone; the selected label remains; NO local confirm button —
    // the backend's scheduling_confirm event renders <SchedulingConfirmCard> instead.
    expect(screen.queryByText('Wed, Jun 4 · 4:00 PM')).not.toBeInTheDocument();
    expect(screen.getByText('Tue, Jun 3 · 2:00 PM')).toBeInTheDocument();
    expect(
      screen.queryByText(SCHEDULING_STRINGS.confirmAffirmative)
    ).not.toBeInTheDocument();
  });

  it('does not dispatch when typing is in progress', () => {
    const ctx = makeChatContext({ isTyping: true });
    renderWithChat(<SchedulingSlots slots={SLOTS} />, ctx);
    fireEvent.click(screen.getByText('Tue, Jun 3 · 2:00 PM'));
    expect(ctx.sendMessage).not.toHaveBeenCalled();
  });
});

describe('SchedulingConfirmCard — confirm_book dispatch (§B16b amended, server-driven)', () => {
  const CONFIRM = { slot: { slotId: 's1', label: 'Tue, Jun 3 · 2:00 PM' }, attendee_email: 'vol@example.com' };

  it('renders slot label + attendee email + the confirm button', () => {
    renderWithChat(<SchedulingConfirmCard confirm={CONFIRM} />);
    expect(screen.getByText('Tue, Jun 3 · 2:00 PM')).toBeInTheDocument();
    expect(screen.getByText('vol@example.com')).toBeInTheDocument();
    expect(screen.getByText(SCHEDULING_STRINGS.confirmAffirmative)).toBeInTheDocument();
  });

  it('tapping confirm sends a confirm_book-eliciting turn (no PII), one-shot', () => {
    const { ctx } = renderWithChat(<SchedulingConfirmCard confirm={CONFIRM} />);
    fireEvent.click(screen.getByText(SCHEDULING_STRINGS.confirmAffirmative));
    fireEvent.click(screen.getByText(SCHEDULING_STRINGS.confirmAffirmative)); // double-tap guarded

    expect(ctx.sendMessage).toHaveBeenCalledTimes(1);
    expect(ctx.sendMessage).toHaveBeenLastCalledWith(
      SCHEDULING_STRINGS.confirmAffirmative,
      { scheduling_action: 'confirm_book' }
    );
    // The affirmative carries no coordinator identity.
    const [text] = ctx.sendMessage.mock.calls[0];
    expect(text).not.toMatch(/maya/i);
  });

  it('renders nothing without a staged slot (schema discipline)', () => {
    const { container } = renderWithChat(<SchedulingConfirmCard confirm={null} />);
    expect(container.querySelector('[data-testid="scheduling-confirm"]')).toBeNull();
  });
});

describe('SchedulingNotice', () => {
  it('renders friendly copy for a known notice code', () => {
    render(<SchedulingNotice notice="request_received_email_followup" />);
    expect(
      screen.getByText(SCHEDULING_STRINGS.notices.request_received_email_followup)
    ).toBeInTheDocument();
  });

  it('falls back to generic copy for an unknown code (schema discipline)', () => {
    render(<SchedulingNotice notice="some_future_code" />);
    expect(screen.getByText(SCHEDULING_STRINGS.noticeFallback)).toBeInTheDocument();
  });

  it('renders nothing when no notice is provided', () => {
    const { container } = render(<SchedulingNotice notice={undefined} />);
    expect(container.querySelector('.scheduling-notice')).toBeNull();
  });
});

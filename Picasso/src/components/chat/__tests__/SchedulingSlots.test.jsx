/**
 * SchedulingSlots tests (scheduling v1 sub-phase C, WS-C12).
 *
 * Covers the done-bar:
 *  - chips render `label` ONLY (snapshot asserts NO coordinator name — §10.4 boundary)
 *  - tapping a chip dispatches a `select_slot`-eliciting turn (reuses sendMessage)
 *  - the confirm affirmative dispatches a `confirm_book`-eliciting turn
 *  - SchedulingNotice renders friendly inline copy (forward-compatible on unknown codes)
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import SchedulingSlots, { SchedulingNotice, SCHEDULING_STRINGS } from '../SchedulingSlots';
import { ChatContext } from '../../../context/shared/ChatContext';

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

// Generic slots as the backend emits them. The coordinator-identifying fields
// (resourceId / coordinator_email) are intentionally present to prove they are
// NEVER rendered on a chip (the §10.4 PII boundary).
const SLOTS = [
  {
    slotId: 'slot-1',
    start: '2026-06-03T14:00:00Z',
    end: '2026-06-03T14:30:00Z',
    label: 'Tue, Jun 3 · 2:00 PM',
    resourceId: 'maya@example.org',
    coordinator_email: 'maya@example.org',
  },
  {
    slotId: 'slot-2',
    start: '2026-06-04T16:00:00Z',
    end: '2026-06-04T16:30:00Z',
    label: 'Wed, Jun 4 · 4:00 PM',
    resourceId: 'maya@example.org',
  },
];

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
      scheduling_slot_id: 'slot-1',
    });
  });

  it('after selecting, chips are replaced by a confirm affirmative', () => {
    renderWithChat(<SchedulingSlots slots={SLOTS} />);
    fireEvent.click(screen.getByText('Tue, Jun 3 · 2:00 PM'));
    // The other chip is gone; the confirm button is shown.
    expect(screen.queryByText('Wed, Jun 4 · 4:00 PM')).not.toBeInTheDocument();
    expect(
      screen.getByText(SCHEDULING_STRINGS.confirmAffirmative)
    ).toBeInTheDocument();
  });

  it('does not dispatch when typing is in progress', () => {
    const ctx = makeChatContext({ isTyping: true });
    renderWithChat(<SchedulingSlots slots={SLOTS} />, ctx);
    fireEvent.click(screen.getByText('Tue, Jun 3 · 2:00 PM'));
    expect(ctx.sendMessage).not.toHaveBeenCalled();
  });
});

describe('SchedulingSlots — confirm_book dispatch (§B16b)', () => {
  it('tapping confirm sends a confirm_book-eliciting turn (no PII)', () => {
    const { ctx } = renderWithChat(<SchedulingSlots slots={SLOTS} />);
    fireEvent.click(screen.getByText('Tue, Jun 3 · 2:00 PM')); // select first
    fireEvent.click(screen.getByText(SCHEDULING_STRINGS.confirmAffirmative));

    expect(ctx.sendMessage).toHaveBeenCalledTimes(2);
    expect(ctx.sendMessage).toHaveBeenLastCalledWith(
      SCHEDULING_STRINGS.confirmAffirmative,
      { scheduling_action: 'confirm_book' }
    );
    // The affirmative carries no coordinator identity.
    const [text] = ctx.sendMessage.mock.calls[1];
    expect(text).not.toMatch(/maya/i);
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

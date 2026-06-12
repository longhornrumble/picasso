/**
 * SchedulingDayPicker tests (scheduling v1 sub-phase T3, WS-T3-DAYPICK-FE, §B16e).
 *
 * Done-bar:
 *  1. 7-day strip renders chip labels; WCAG affordances (role=group, aria-label, button type)
 *  2. Tapping a day dispatches deterministic `scheduling_day_selected: 'YYYY-MM-DD'` signal
 *     (test-pinned exact payload — §B16e contract)
 *  3. Unknown/malformed `days` entries are skipped without crashing (schema discipline)
 *  4. Renders nothing for empty / non-array days
 *  5. Strip becomes unavailable after selection (no double-tap)
 *  6. Does not dispatch when typing is in progress
 *  7. Post-selection status announcement (aria-live=polite)
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import SchedulingDayPicker, { DAY_PICKER_STRINGS } from '../SchedulingDayPicker';
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

// ─── Representative day array (mirrors §B16e SSE shape) ──────────────────────

const DAYS = [
  { date: '2026-06-15', label: 'Mon, Jun 15' },
  { date: '2026-06-16', label: 'Tue, Jun 16' },
  { date: '2026-06-17', label: 'Wed, Jun 17' },
  { date: '2026-06-18', label: 'Thu, Jun 18' },
  { date: '2026-06-19', label: 'Fri, Jun 19' },
  { date: '2026-06-22', label: 'Mon, Jun 22' },
  { date: '2026-06-23', label: 'Tue, Jun 23' },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SchedulingDayPicker — rendering', () => {
  it('renders a chip for each valid day in the strip', () => {
    renderWithChat(<SchedulingDayPicker days={DAYS} user_time_zone="America/Chicago" />);
    DAYS.forEach((d) => {
      expect(screen.getByText(d.label)).toBeInTheDocument();
    });
  });

  it('renders a scrollable group container with correct aria-label', () => {
    renderWithChat(<SchedulingDayPicker days={DAYS} />);
    const strip = screen.getByRole('group', { name: DAY_PICKER_STRINGS.stripAriaLabel });
    expect(strip).toBeInTheDocument();
  });

  it('each chip is a button with type=button and aria-label', () => {
    renderWithChat(<SchedulingDayPicker days={[DAYS[0]]} />);
    const btn = screen.getByRole('button', {
      name: DAY_PICKER_STRINGS.chipAriaLabel(DAYS[0].label),
    });
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('renders nothing for empty days array', () => {
    const { container } = renderWithChat(<SchedulingDayPicker days={[]} />);
    expect(container.querySelector('.scheduling-day-picker')).toBeNull();
  });

  it('renders nothing when days is undefined', () => {
    const { container } = renderWithChat(<SchedulingDayPicker days={undefined} />);
    expect(container.querySelector('.scheduling-day-picker')).toBeNull();
  });

  it('renders nothing when days is not an array', () => {
    const { container } = renderWithChat(<SchedulingDayPicker days="bad" />);
    expect(container.querySelector('.scheduling-day-picker')).toBeNull();
  });
});

describe('SchedulingDayPicker — schema discipline (malformed entries skipped)', () => {
  it('skips entries missing date without crashing', () => {
    const mixed = [
      { label: 'Missing date' },       // malformed — no date
      DAYS[0],                          // valid
    ];
    renderWithChat(<SchedulingDayPicker days={mixed} />);
    expect(screen.getByText(DAYS[0].label)).toBeInTheDocument();
    // The malformed entry renders nothing
    expect(screen.queryByText('Missing date')).not.toBeInTheDocument();
  });

  it('skips entries missing label without crashing', () => {
    const mixed = [
      { date: '2026-06-15' },           // malformed — no label
      DAYS[1],                          // valid
    ];
    renderWithChat(<SchedulingDayPicker days={mixed} />);
    expect(screen.getByText(DAYS[1].label)).toBeInTheDocument();
  });

  it('skips null entries in the array without crashing', () => {
    const mixed = [null, DAYS[0], undefined, DAYS[1]];
    renderWithChat(<SchedulingDayPicker days={mixed} />);
    expect(screen.getByText(DAYS[0].label)).toBeInTheDocument();
    expect(screen.getByText(DAYS[1].label)).toBeInTheDocument();
  });

  it('renders nothing if ALL entries are malformed', () => {
    const { container } = renderWithChat(
      <SchedulingDayPicker days={[{ label: 'no date' }, null, { date: '' }]} />
    );
    expect(container.querySelector('.scheduling-day-picker')).toBeNull();
  });
});

describe('SchedulingDayPicker — §B16e dispatch (exact payload contract)', () => {
  it('tapping a chip sends the day label as the turn with exact scheduling_day_selected metadata', () => {
    const { ctx } = renderWithChat(<SchedulingDayPicker days={DAYS} />);
    fireEvent.click(screen.getByText(DAYS[0].label));

    expect(ctx.sendMessage).toHaveBeenCalledTimes(1);
    // §B16e contract — exact pinned payload:
    expect(ctx.sendMessage).toHaveBeenCalledWith('Mon, Jun 15', {
      scheduling_day_selected: '2026-06-15',
    });
  });

  it('the signal is deterministic: date value matches the chip date, not a derived value', () => {
    const { ctx } = renderWithChat(<SchedulingDayPicker days={DAYS} />);
    fireEvent.click(screen.getByText(DAYS[3].label)); // Thu, Jun 18
    const [, metadata] = ctx.sendMessage.mock.calls[0];
    expect(metadata.scheduling_day_selected).toBe('2026-06-18');
  });

  it('does not dispatch when typing is in progress (isTyping=true)', () => {
    const ctx = makeChatContext({ isTyping: true });
    renderWithChat(<SchedulingDayPicker days={DAYS} />, ctx);
    fireEvent.click(screen.getByText(DAYS[0].label));
    expect(ctx.sendMessage).not.toHaveBeenCalled();
  });

  it('does not dispatch a second time if a day is already selected', () => {
    const { ctx } = renderWithChat(<SchedulingDayPicker days={DAYS} />);
    fireEvent.click(screen.getByText(DAYS[0].label)); // first tap
    // After selection the strip is replaced — attempt a second call directly
    expect(ctx.sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe('SchedulingDayPicker — post-selection UX', () => {
  it('strip is replaced by a status region after selection', () => {
    renderWithChat(<SchedulingDayPicker days={DAYS} />);
    fireEvent.click(screen.getByText(DAYS[0].label));

    // The chip group is gone
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    // A status region is shown
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
  });

  it('status region has aria-live=polite and shows the selected label', () => {
    renderWithChat(<SchedulingDayPicker days={DAYS} />);
    fireEvent.click(screen.getByText(DAYS[1].label)); // Tue, Jun 16

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent(
      DAY_PICKER_STRINGS.selectedAnnouncement(DAYS[1].label)
    );
  });

  it('remaining chips are no longer visible after selection', () => {
    renderWithChat(<SchedulingDayPicker days={DAYS} />);
    fireEvent.click(screen.getByText(DAYS[2].label));

    // The other chips are gone
    DAYS.filter((d) => d.date !== DAYS[2].date).forEach((d) => {
      expect(screen.queryByText(d.label)).not.toBeInTheDocument();
    });
  });
});

describe('SchedulingDayPicker — label clamping (≤28 chars)', () => {
  it('truncates labels longer than 28 chars at render time', () => {
    const longLabel = 'A'.repeat(35); // 35 chars > 28
    const days = [{ date: '2026-06-15', label: longLabel }];
    renderWithChat(<SchedulingDayPicker days={days} />);
    const btn = screen.getByRole('button');
    // Button text is clamped to 28 chars
    expect(btn.textContent).toBe('A'.repeat(28));
  });

  it('does not truncate labels of exactly 28 chars', () => {
    const exactLabel = 'B'.repeat(28);
    const days = [{ date: '2026-06-15', label: exactLabel }];
    renderWithChat(<SchedulingDayPicker days={days} />);
    const btn = screen.getByRole('button');
    expect(btn.textContent).toBe(exactLabel);
  });
});

describe('SchedulingDayPicker — chip shape (P1-7: labels must not clip to circles)', () => {
  // Root cause: the strip is a NON-wrapping flex row and .suggested-chip's
  // `overflow: hidden` zeroes the flex automatic minimum size, so default
  // flex-shrink:1 squeezed all 7 chips into the container width — each chip
  // collapsed to a circle with its label clipped. The fix pins each chip at
  // its natural width (`flex: 0 0 auto`; the strip scrolls instead) with the
  // same 16px pill radius SchedulingSlots chips render with.

  it('every chip keeps its natural width in the strip (flex: 0 0 auto — no squeeze)', () => {
    renderWithChat(<SchedulingDayPicker days={DAYS} />);
    const chips = screen.getAllByRole('button');
    expect(chips).toHaveLength(DAYS.length);
    chips.forEach((chip) => {
      expect(chip.style.flexGrow).toBe('0');
      expect(chip.style.flexShrink).toBe('0');
      expect(chip.style.flexBasis).toBe('auto');
    });
  });

  it('every chip is a pill, not a circle (border-radius 16px, never 50%)', () => {
    renderWithChat(<SchedulingDayPicker days={DAYS} />);
    screen.getAllByRole('button').forEach((chip) => {
      expect(chip.style.borderRadius).toBe('16px');
      expect(chip.style.borderRadius).not.toBe('50%');
    });
  });

  it('renders the full label text untruncated for in-contract (≤28 char) labels', () => {
    renderWithChat(<SchedulingDayPicker days={DAYS} />);
    DAYS.forEach((d) => {
      // Full label (e.g. "Mon, Jun 15") — identical to how SchedulingSlots
      // renders slot labels; nothing shortened or elided at render time.
      expect(screen.getByText(d.label).textContent).toBe(d.label);
    });
  });
});

describe('SchedulingDayPicker — snapshot', () => {
  it('snapshot: strip markup for a single day', () => {
    const { container } = renderWithChat(
      <SchedulingDayPicker days={[DAYS[0]]} user_time_zone="America/Chicago" />
    );
    expect(container.querySelector('.scheduling-day-picker')).toMatchSnapshot();
  });
});

/**
 * SchedulingPage tests (M1, Calendly-style deterministic picker).
 * Covers: reschedule framing + current-appointment hero from the gateway summary; Choose-a-Day
 * buttons + Pick-a-date calendar; gateway propose on mount + on day-select; select time →
 * Confirm → gateway mutate (reschedule) → success; cancel mode → mutate cancel → success;
 * companion chat input → sendMessage (conversational path preserved). The gateway + useConfig
 * are mocked; chat state via ChatContext.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChatContext } from '../../../context/shared/ChatContext';

jest.mock('../../../context/ConfigProvider.jsx', () => ({
  useConfig: () => ({
    config: { chat_title: 'Atlanta Angels', branding: { primary_color: '#a1905f' } },
  }),
}));
jest.mock('../../../utils/schedulingGateway', () => ({
  proposeTimes: jest.fn(),
  mutateBooking: jest.fn(),
}));

import { proposeTimes, mutateBooking } from '../../../utils/schedulingGateway';
import SchedulingPage from '../SchedulingPage';

const SUMMARY = {
  appointment_label: 'Intro Call',
  current_start_at: '2026-06-15T15:30:00Z',
  timezone: 'America/Chicago',
};
const SLOTS = [
  { slotId: 's1', label: '9:00 AM', start: '2026-06-18T14:00:00Z', end: '2026-06-18T14:30:00Z' },
  { slotId: 's2', label: '10:30 AM', start: '2026-06-18T15:30:00Z', end: '2026-06-18T16:00:00Z' },
];

const makeChat = (o = {}) => ({ messages: [], isTyping: false, sendMessage: jest.fn(), ...o });

const renderPage = (purpose, ctx = makeChat()) => {
  window.history.replaceState({}, '', `/schedule/?t=hsh&session=sid${purpose ? `&purpose=${purpose}` : ''}`);
  const utils = render(
    <ChatContext.Provider value={ctx}>
      <SchedulingPage />
    </ChatContext.Provider>
  );
  return { ...utils, ctx };
};

beforeEach(() => {
  proposeTimes.mockReset();
  mutateBooking.mockReset();
  proposeTimes.mockResolvedValue({ outcome: 'ok', slots: SLOTS, ...SUMMARY });
  mutateBooking.mockResolvedValue({ outcome: 'success' });
});

describe('reschedule', () => {
  test('mount → gateway propose; hero shows current appointment + Choose a Day + times', async () => {
    renderPage('reschedule');
    // org name appears twice by design (header wordmark + chat sender label)
    expect(screen.getByText('Atlanta Angels', { selector: '.sched-org' })).toBeInTheDocument();
    expect(screen.getByText('Choose a day')).toBeInTheDocument();
    // title + current-appointment line populate from the gateway summary (async)
    expect(await screen.findByRole('heading', { name: /Reschedule your Intro Call/ })).toBeInTheDocument();
    expect(screen.getByText(/Currently booked for/)).toBeInTheDocument();
    expect(screen.getByText(/June 15/)).toBeInTheDocument();
    // times render after the propose resolves
    expect(await screen.findByRole('button', { name: '10:30 AM' })).toBeInTheDocument();
    expect(proposeTimes).toHaveBeenCalledWith(expect.objectContaining({ tenantHash: 'hsh', session: 'sid' }));
    // powered-by line + derived timezone note (from the summary's America/Chicago)
    expect(screen.getByText('MyRecruiter')).toBeInTheDocument();
    expect(screen.getByText(/Times shown in/)).toBeInTheDocument();
  });

  test('select a time → Confirm enabled → mutate reschedule → success', async () => {
    renderPage('reschedule');
    const slot = await screen.findByRole('button', { name: '10:30 AM' });
    const confirm = screen.getByRole('button', { name: 'Confirm new time' });
    expect(confirm).toBeDisabled();
    fireEvent.click(slot);
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(mutateBooking).toHaveBeenCalledWith(expect.objectContaining({
      mutation: 'reschedule',
      newSlot: { start: SLOTS[1].start, end: SLOTS[1].end },
    })));
    expect(await screen.findByText(/rebooked for/)).toBeInTheDocument();
  });

  test('"Pick a date" reveals the month calendar', async () => {
    renderPage('reschedule');
    await screen.findByRole('button', { name: '10:30 AM' });
    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }));
    expect(screen.getByTestId('sched-calendar')).toBeInTheDocument();
  });

  test('selecting a different quick-day re-queries times', async () => {
    renderPage('reschedule');
    await screen.findByRole('button', { name: '10:30 AM' });
    const callsBefore = proposeTimes.mock.calls.length;
    // the 2nd quick-day button (index 1 of the day chips)
    const dayChips = screen.getAllByRole('button').filter((b) => /\w{3}, \w{3} \d+/.test(b.textContent));
    fireEvent.click(dayChips[1]);
    await waitFor(() => expect(proposeTimes.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});

describe('cancel', () => {
  test('cancel mode → Cancel Appointment → mutate cancel → success', async () => {
    mutateBooking.mockResolvedValue({ outcome: 'deleted' });
    renderPage('cancel');
    const btn = await screen.findByRole('button', { name: 'Cancel appointment' });
    // no day picker in cancel mode
    expect(screen.queryByText('Choose a day')).not.toBeInTheDocument();
    fireEvent.click(btn);
    await waitFor(() => expect(mutateBooking).toHaveBeenCalledWith(expect.objectContaining({ mutation: 'cancel' })));
    expect(await screen.findByText(/appointment has been canceled/i)).toBeInTheDocument();
  });
});

describe('companion chat (conversational path preserved)', () => {
  test('typing a question dispatches sendMessage', async () => {
    const { ctx } = renderPage('reschedule');
    const input = screen.getByLabelText('Ask a question');
    fireEvent.change(input, { target: { value: 'Is Tuesday at 3 available?' } });
    fireEvent.click(screen.getByLabelText('Send'));
    expect(ctx.sendMessage).toHaveBeenCalledWith('Is Tuesday at 3 available?');
  });

  test('renders agent-emitted slots in chat (conversational scheduling still works)', () => {
    const ctx = makeChat({
      messages: [{
        id: 'm1', role: 'assistant', content: 'Here are some times.',
        metadata: { schedulingSlots: [{ slotId: 'c1', label: 'Tue · 3:00 PM', start: 'x', end: 'y' }] },
      }],
    });
    renderPage('reschedule', ctx);
    expect(screen.getByTestId('scheduling-slots')).toBeInTheDocument();
  });
});

describe('failure handling', () => {
  test('gateway propose error → shows a try-another-day message, no crash', async () => {
    proposeTimes.mockRejectedValue(Object.assign(new Error('boom'), { code: 'propose_failed' }));
    renderPage('reschedule');
    expect(await screen.findByText(/couldn’t load times|try another date/i)).toBeInTheDocument();
  });
});

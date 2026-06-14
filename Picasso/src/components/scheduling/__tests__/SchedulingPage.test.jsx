/**
 * SchedulingPage tests (M1a).
 * Covers: purpose framing (reschedule vs cancel), daypart chip → sendMessage (NL text),
 * companion-chat input → sendMessage, reused §B18 slot rows render from message metadata,
 * and the forward-compatible hero (schedulingBookingSummary → current-appointment line;
 * absent → no crash). useConfig is mocked; chat state comes via ChatContext.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChatContext } from '../../../context/shared/ChatContext';

// Mock the tenant config hook (branding/title drive the header + framing).
jest.mock('../../../context/ConfigProvider.jsx', () => ({
  useConfig: () => ({
    config: { chat_title: 'Atlanta Angels', branding: { primary_color: '#1f9d6b' } },
  }),
}));

import SchedulingPage from '../SchedulingPage';

const makeChat = (overrides = {}) => ({
  messages: [],
  isTyping: false,
  sendMessage: jest.fn(),
  addMessage: jest.fn(),
  ...overrides,
});

const renderPage = (purpose, ctx = makeChat()) => {
  window.history.replaceState({}, '', `/schedule/?t=hsh-test&session=sid-1${purpose ? `&purpose=${purpose}` : ''}`);
  const utils = render(
    <ChatContext.Provider value={ctx}>
      <SchedulingPage />
    </ChatContext.Provider>
  );
  return { ...utils, ctx };
};

describe('SchedulingPage', () => {
  test('reschedule framing: title + daypart chips + branded org name', () => {
    renderPage('reschedule');
    expect(screen.getByText('Atlanta Angels')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Reschedule/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mornings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick a specific date' })).toBeInTheDocument();
  });

  test('cancel framing: shows Cancel Appointment button, NOT daypart chips', () => {
    renderPage('cancel');
    expect(screen.getByRole('button', { name: 'Cancel Appointment' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mornings' })).not.toBeInTheDocument();
  });

  test('daypart chip dispatches a natural-language refinement via sendMessage', () => {
    const { ctx } = renderPage('reschedule');
    fireEvent.click(screen.getByRole('button', { name: 'Afternoons' }));
    expect(ctx.sendMessage).toHaveBeenCalledTimes(1);
    expect(ctx.sendMessage).toHaveBeenCalledWith(expect.stringMatching(/afternoon/i));
  });

  test('cancel button dispatches a cancellation confirmation', () => {
    const { ctx } = renderPage('cancel');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Appointment' }));
    expect(ctx.sendMessage).toHaveBeenCalledTimes(1);
    expect(ctx.sendMessage.mock.calls[0][0]).toMatch(/cancel/i);
  });

  test('companion chat input dispatches the typed question', () => {
    const { ctx } = renderPage('reschedule');
    const input = screen.getByLabelText('Ask a question');
    fireEvent.change(input, { target: { value: 'Where is the meeting?' } });
    fireEvent.click(screen.getByLabelText('Send'));
    expect(ctx.sendMessage).toHaveBeenCalledWith('Where is the meeting?');
  });

  test('renders reused §B18 slot rows from message metadata', () => {
    const ctx = makeChat({
      messages: [
        {
          id: 'm1',
          role: 'assistant',
          content: 'Here are some times.',
          metadata: {
            schedulingSlots: [
              { slotId: 's1', label: 'Thu, Jun 18 · 1:00 PM', start: '2026-06-18T18:00:00Z', end: '2026-06-18T18:30:00Z' },
              { slotId: 's2', label: 'Thu, Jun 18 · 2:30 PM', start: '2026-06-18T19:30:00Z', end: '2026-06-18T20:00:00Z' },
            ],
          },
        },
      ],
    });
    renderPage('reschedule', ctx);
    expect(screen.getByTestId('scheduling-slots')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thu, Jun 18 · 1:00 PM' })).toBeInTheDocument();
  });

  test('forward-compatible hero: schedulingBookingSummary populates the current-appointment line', () => {
    const ctx = makeChat({
      messages: [
        {
          id: 'm1',
          role: 'assistant',
          content: '',
          metadata: {
            schedulingBookingSummary: {
              appointment_label: 'your Intro Call',
              current_start_label: 'Sunday, June 15 · 10:30 AM CDT',
            },
          },
        },
      ],
    });
    renderPage('reschedule', ctx);
    expect(screen.getByRole('heading', { name: /Reschedule your Intro Call/ })).toBeInTheDocument();
    expect(screen.getByText(/Sunday, June 15/)).toBeInTheDocument();
  });

  test('absent booking summary → no crash, generic title', () => {
    renderPage('reschedule');
    expect(screen.getByRole('heading', { name: /Reschedule your appointment/i })).toBeInTheDocument();
  });
});

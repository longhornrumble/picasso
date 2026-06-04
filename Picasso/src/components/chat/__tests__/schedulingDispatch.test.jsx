/**
 * MessageBubble scheduling dispatch (scheduling v1 sub-phase C, WS-C12).
 *
 * Done-bar: the `scheduling_intent: 'new_booking'` signal (§B16d) is sent on a
 * `start_scheduling` CTA and is ABSENT on every other CTA. The signal reuses the
 * existing CTA dispatch path (no new transport, no new `cta.action` — CI-3a stays
 * green).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageBubble from '../MessageBubble';
import { ConfigProvider } from '../../../context/ConfigProvider';
import FormModeContext from '../../../context/FormModeContext';
import { ChatContext } from '../../../context/shared/ChatContext';

jest.mock('../../../utils/streamingRegistry', () => ({
  streamingRegistry: {
    subscribe: jest.fn(),
    isActive: jest.fn(() => false),
    getAccumulated: jest.fn(() => ''),
  },
}));

jest.mock('dompurify', () => ({
  sanitize: jest.fn((html) => html),
  __esModule: true,
  default: { sanitize: jest.fn((html) => html) },
}));

jest.mock('marked', () => ({
  marked: { parse: jest.fn((text) => text), setOptions: jest.fn() },
}));

const mockFormModeContext = {
  isFormMode: false,
  isSuspended: false,
  currentFormId: null,
  formConfig: null,
  startFormWithConfig: jest.fn(),
  resumeForm: jest.fn(),
  cancelForm: jest.fn(),
};

const makeChatContext = (overrides = {}) => ({
  messages: [],
  isTyping: false,
  sendMessage: jest.fn(),
  addMessage: jest.fn(),
  clearMessages: jest.fn(),
  retryMessage: jest.fn(),
  ...overrides,
});

const renderBubble = (ctaButtons, ctx = makeChatContext()) => {
  render(
    <ConfigProvider>
      <FormModeContext.Provider value={mockFormModeContext}>
        <ChatContext.Provider value={ctx}>
          <MessageBubble
            role="assistant"
            content="How can I help?"
            ctaButtons={ctaButtons}
            renderMode="static"
          />
        </ChatContext.Provider>
      </FormModeContext.Provider>
    </ConfigProvider>
  );
  return ctx;
};

describe('WS-C12: start_scheduling new-booking signal (§B16d)', () => {
  it('sends scheduling_intent:"new_booking" when start_scheduling is clicked', () => {
    const ctx = renderBubble([
      {
        id: 'sched_cta',
        label: 'Schedule a time',
        action: 'start_scheduling',
        value: "I'd like to schedule a time",
      },
    ]);

    fireEvent.click(screen.getByText('Schedule a time'));

    expect(ctx.sendMessage).toHaveBeenCalledTimes(1);
    const [text, metadata] = ctx.sendMessage.mock.calls[0];
    expect(text).toBe("I'd like to schedule a time");
    expect(metadata).toMatchObject({ scheduling_intent: 'new_booking' });
  });

  it('does NOT send scheduling_intent on a non-scheduling CTA (send_query)', () => {
    const ctx = renderBubble([
      {
        id: 'q_cta',
        label: 'Tell me about volunteering',
        action: 'send_query',
        query: 'Tell me about volunteering',
      },
    ]);

    fireEvent.click(screen.getByText('Tell me about volunteering'));

    expect(ctx.sendMessage).toHaveBeenCalledTimes(1);
    const [, metadata] = ctx.sendMessage.mock.calls[0];
    expect(metadata).not.toHaveProperty('scheduling_intent');
  });

  it('falls back to the CTA label as the turn text when no value/query is set', () => {
    const ctx = renderBubble([
      { id: 'sched_cta2', label: 'Book a call', action: 'start_scheduling' },
    ]);

    fireEvent.click(screen.getByText('Book a call'));

    const [text, metadata] = ctx.sendMessage.mock.calls[0];
    expect(text).toBe('Book a call');
    expect(metadata.scheduling_intent).toBe('new_booking');
  });
});

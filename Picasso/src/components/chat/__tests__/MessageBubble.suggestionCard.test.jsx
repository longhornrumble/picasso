/**
 * MessageBubble — Suggestion card latest-bot-message gate (W2.7)
 *
 * DESIGN_SPEC.md screen 3 "In-flight conversation": "suggestions render
 * only under the latest bot message and disappear once used." The
 * "disappear once used" half lives inside CTAButtonGroup itself
 * (CTAButton.test.jsx). This file covers the other half — CTAButtonGroup
 * has no visibility into sibling messages, so MessageBubble computes
 * `isLatestBotMessage` from the full `messages` list (exposed by both chat
 * providers via useChat()) and uses it to gate the render. Frozen dispatch
 * (handleCtaClick/_position) is covered elsewhere (ctaActionContract.test.jsx,
 * MessageBubble.test.jsx) and is untouched by this addition.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageBubble from '../MessageBubble';
import FormModeContext from '../../../context/FormModeContext';
import { ChatContext } from '../../../context/shared/ChatContext';

const mockUseConfig = jest.fn();
jest.mock('../../../hooks/useConfig', () => ({
  useConfig: (...args) => mockUseConfig(...args),
}));

function setConfig(config) {
  mockUseConfig.mockReturnValue({ config });
}

const mockFormModeContext = {
  isFormMode: false,
  isSuspended: false,
  currentFormId: null,
  formConfig: null,
  startFormWithConfig: jest.fn(),
  resumeForm: jest.fn(),
  cancelForm: jest.fn(),
};

function renderBubble(props, chatContextOverrides = {}) {
  const chatContext = {
    messages: [],
    isTyping: false,
    sendMessage: jest.fn(),
    addMessage: jest.fn(),
    clearMessages: jest.fn(),
    retryMessage: jest.fn(),
    ...chatContextOverrides,
  };

  return render(
    <FormModeContext.Provider value={mockFormModeContext}>
      <ChatContext.Provider value={chatContext}>
        <MessageBubble {...props} />
      </ChatContext.Provider>
    </FormModeContext.Provider>
  );
}

const ctaButtons = [
  { id: 'learn_more', label: 'Learn about the volunteer process', action: 'navigate' },
];

describe('MessageBubble — suggestion card latest-bot-message gate (W2.7)', () => {
  beforeEach(() => {
    mockUseConfig.mockReset();
    setConfig({ branding: { chat_title: 'Atlanta Angels' } });
  });

  test('renders the suggestion card when this message is the latest bot message', () => {
    renderBubble(
      { id: 'bot-2', role: 'assistant', content: 'reply', ctaButtons, renderMode: 'static' },
      {
        messages: [
          { id: 'user-1', role: 'user', content: 'hi' },
          { id: 'bot-2', role: 'assistant', content: 'reply', ctaButtons },
        ],
      }
    );

    expect(screen.getByRole('button', { name: /learn about the volunteer process/i })).toBeInTheDocument();
  });

  test('does NOT render the suggestion card for an older bot message once a newer bot message exists', () => {
    renderBubble(
      { id: 'bot-1', role: 'assistant', content: 'first reply', ctaButtons, renderMode: 'static' },
      {
        messages: [
          { id: 'bot-1', role: 'assistant', content: 'first reply', ctaButtons },
          { id: 'user-2', role: 'user', content: 'follow-up' },
          { id: 'bot-3', role: 'assistant', content: 'second reply' },
        ],
      }
    );

    expect(
      screen.queryByRole('button', { name: /learn about the volunteer process/i })
    ).not.toBeInTheDocument();
  });

  test('falls back to rendering when the messages list does not resolve a bot entry (defensive default)', () => {
    renderBubble(
      { id: 'bot-1', role: 'assistant', content: 'reply', ctaButtons, renderMode: 'static' },
      { messages: [] }
    );

    expect(screen.getByRole('button', { name: /learn about the volunteer process/i })).toBeInTheDocument();
  });

  test('falls back to rendering when `messages` is entirely absent from the chat context', () => {
    // Distinct from the empty-array case above: this exercises the
    // `!Array.isArray(messages)` disjunct directly, not just `.length === 0`.
    const chatContextWithoutMessages = {
      isTyping: false,
      sendMessage: jest.fn(),
      addMessage: jest.fn(),
      clearMessages: jest.fn(),
      retryMessage: jest.fn(),
    };

    render(
      <FormModeContext.Provider value={mockFormModeContext}>
        <ChatContext.Provider value={chatContextWithoutMessages}>
          <MessageBubble
            id="bot-1"
            role="assistant"
            content="reply"
            ctaButtons={ctaButtons}
            renderMode="static"
          />
        </ChatContext.Provider>
      </FormModeContext.Provider>
    );

    expect(screen.getByRole('button', { name: /learn about the volunteer process/i })).toBeInTheDocument();
  });
});

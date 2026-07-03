/**
 * MessageBubble — Hairline thread restyle tests (W2.2)
 *
 * DESIGN_SPEC.md screen 3 "In-flight conversation": user messages get a
 * caps "YOU" label + tinted card (max 85%); bot messages get a caps
 * wordmark label (chat_title) + plain body text — no bubble/card, no
 * avatar anywhere. These tests assert the restyled markup/classNames.
 *
 * FROZEN behavior this file does NOT re-test (already covered elsewhere,
 * untouched by this restyle): CTA/action dispatch (ctaActionContract.test.jsx,
 * MessageBubble.test.jsx's scheduling/dispatch-hardening suites), showcase
 * card rendering (MessageBubble.test.jsx). This file is additive —
 * `dompurify`/`marked`/`streamingRegistry` are intentionally NOT mocked here
 * (unlike MessageBubble.test.jsx) so the streaming test below exercises the
 * real imperative writer end-to-end against the new markup.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageBubble from '../MessageBubble';
import FormModeContext from '../../../context/FormModeContext';
import { ChatContext } from '../../../context/shared/ChatContext';
import { streamingRegistry } from '../../../utils/streamingRegistry';

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

const mockChatContext = {
  messages: [],
  isTyping: false,
  sendMessage: jest.fn(),
  addMessage: jest.fn(),
  clearMessages: jest.fn(),
  retryMessage: jest.fn(),
};

function renderBubble(props) {
  return render(
    <FormModeContext.Provider value={mockFormModeContext}>
      <ChatContext.Provider value={mockChatContext}>
        <MessageBubble {...props} />
      </ChatContext.Provider>
    </FormModeContext.Provider>
  );
}

describe('MessageBubble — Hairline thread (W2.2)', () => {
  beforeEach(() => {
    mockUseConfig.mockReset();
  });

  test('bot message: wordmark sender label (chat_title), plain text, no card, no avatar', () => {
    setConfig({ branding: { chat_title: 'Atlanta Angels' } });
    const { container } = renderBubble({
      role: 'assistant',
      content: '<p>Hello there</p>',
      renderMode: 'static',
    });

    const wrapper = container.querySelector('.hairline-message');
    expect(wrapper).toHaveClass('hairline-message--bot');

    const label = screen.getByText('Atlanta Angels');
    expect(label).toHaveClass('hairline-sender-label--bot');

    // No bubble/card around the bot's text, and no avatar anywhere.
    expect(container.querySelector('.hairline-message-card')).not.toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('.message-avatar')).not.toBeInTheDocument();
    expect(container.querySelector('.message-header')).not.toBeInTheDocument();

    const textEl = container.querySelector('.message-text');
    expect(textEl).not.toHaveClass('streaming');
    expect(textEl.innerHTML).toContain('Hello there');
  });

  test('bot sender label falls back to "Chat" on an old-shape config (no chat_title)', () => {
    setConfig({});
    renderBubble({ role: 'assistant', content: 'hi', renderMode: 'static' });
    expect(screen.getByText('Chat')).toHaveClass('hairline-sender-label--bot');
  });

  test('bot sender label falls back to "Chat" when config itself is null (pre-fetch state)', () => {
    // Same forward-compatible-read guard as ChatHeader.test.jsx's equivalent
    // case: the optional-chaining read must tolerate a null config, not just
    // an old-shape one (CLAUDE.md "Schema Discipline").
    setConfig(null);
    renderBubble({ role: 'assistant', content: 'hi', renderMode: 'static' });
    expect(screen.getByText('Chat')).toHaveClass('hairline-sender-label--bot');
  });

  test('user message: "You" sender label + tinted card, no avatar', () => {
    setConfig({ branding: { chat_title: 'Atlanta Angels' } });
    const { container } = renderBubble({
      role: 'user',
      content: 'Hi there',
      renderMode: 'static',
    });

    const wrapper = container.querySelector('.hairline-message');
    expect(wrapper).toHaveClass('hairline-message--user');

    // Stored sentence-case per strings.js convention; caps rendering is CSS
    // text-transform, not baked into the string/DOM text.
    const label = screen.getByText('You');
    expect(label).toHaveClass('hairline-sender-label--user');

    const card = container.querySelector('.hairline-message-card');
    expect(card).toBeInTheDocument();
    expect(card.querySelector('.message-text')).toHaveTextContent('Hi there');
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  test('data-message-id stays on an ancestor of .message-text (streaming rebind contract)', () => {
    setConfig({ branding: { chat_title: 'Atlanta Angels' } });
    const { container } = renderBubble({
      role: 'assistant',
      content: 'hi',
      id: 'msg-42',
      renderMode: 'static',
    });

    const ancestor = container.querySelector('.message-text').closest('[data-message-id]');
    expect(ancestor).toHaveAttribute('data-message-id', 'msg-42');
    expect(ancestor).toHaveClass('hairline-message');
  });

  describe('streaming (real streamingRegistry, not mocked)', () => {
    afterEach(() => {
      streamingRegistry.endStream('w22-stream-test');
    });

    test('the imperative writer still targets the plain-text bot container', () => {
      setConfig({ branding: { chat_title: 'Atlanta Angels' } });
      const { container } = renderBubble({
        role: 'assistant',
        id: 'w22-stream-test',
        isStreaming: true,
        renderMode: 'streaming',
      });

      const streamEl = container.querySelector(
        '.message-text.streaming[data-stream-id="w22-stream-test"]'
      );
      expect(streamEl).toBeInTheDocument();
      // No card/bubble around bot text mid-stream either.
      expect(container.querySelector('.hairline-message-card')).not.toBeInTheDocument();
      expect(container.querySelector('.hairline-message')).toHaveClass('hairline-message--bot');

      act(() => {
        streamingRegistry.startStream('w22-stream-test');
        streamingRegistry.append('w22-stream-test', 'Hello **world**');
      });

      expect(streamEl.textContent).toContain('Hello');
      expect(streamEl.querySelector('strong')).toHaveTextContent('world');
      expect(streamEl.querySelector('.streaming-formatted')).toBeInTheDocument();
    });
  });
});

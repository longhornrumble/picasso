/**
 * MessageBubble — ResponseActions mount (W2.6)
 *
 * DESIGN_SPEC.md screen 3 "In-flight conversation": the copy/thumbs row
 * renders under every completed (non-streaming) bot reply — never on user
 * messages, never while a message is still streaming. This file asserts
 * only the mount condition; ResponseActions' own copy/thumbs behavior is
 * covered by ResponseActions.test.jsx. Frozen dispatch/streaming behavior
 * is covered elsewhere (ctaActionContract.test.jsx, MessageBubble.test.jsx,
 * MessageBubble.hairlineThread.test.jsx) and is untouched by this addition.
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

describe('MessageBubble — ResponseActions mount (W2.6)', () => {
  beforeEach(() => {
    mockUseConfig.mockReset();
    setConfig({ branding: { chat_title: 'Atlanta Angels' } });
  });

  test('renders response actions under a completed (non-streaming) bot reply', () => {
    const { container } = renderBubble({
      role: 'assistant',
      content: '<p>Hello there</p>',
      renderMode: 'static',
    });

    expect(container.querySelector('.hairline-response-actions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy response' })).toBeInTheDocument();
  });

  test('does NOT render response actions on a user message', () => {
    const { container } = renderBubble({
      role: 'user',
      content: 'Hi there',
      renderMode: 'static',
    });

    expect(container.querySelector('.hairline-response-actions')).not.toBeInTheDocument();
  });

  test('does NOT render response actions while a bot message is still streaming', () => {
    const { container } = renderBubble({
      role: 'assistant',
      id: 'w26-stream-test',
      isStreaming: true,
      renderMode: 'streaming',
    });

    expect(container.querySelector('.hairline-response-actions')).not.toBeInTheDocument();

    act(() => {
      streamingRegistry.endStream('w26-stream-test');
    });
  });

  test('does NOT render response actions for a bot message with no content yet (e.g. CTA-only)', () => {
    const { container } = renderBubble({
      role: 'assistant',
      content: '',
      renderMode: 'static',
    });

    expect(container.querySelector('.hairline-response-actions')).not.toBeInTheDocument();
  });
});

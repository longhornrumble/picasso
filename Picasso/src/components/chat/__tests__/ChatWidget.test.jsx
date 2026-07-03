/**
 * ChatWidget Component Tests — Hairline welcome/thread view-state (W3.1)
 *
 * DESIGN_SPEC.md's state model: activeView = welcome | thread | ... .
 * ChatWidget.jsx derives welcome-vs-thread from `messages` (see its header
 * comment) rather than tracking separate state, so these tests exercise
 * that derivation directly: first open, mid-conversation restore, first
 * send, and "Clear all messages" (clearMessages() resets `messages` back to
 * the same welcome-only/empty shape) are all the SAME code path from
 * ChatWidget's point of view.
 *
 * All child components are shallow-stubbed so this file only exercises
 * ChatWidget's own branching logic — WelcomeView's own rendering/dispatch
 * behavior is covered by WelcomeView.test.jsx and
 * welcomeMenuChipDispatchParity.test.jsx.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatWidget from '../ChatWidget';
import { useChat } from '../../../hooks/useChat';
import { useConfig } from '../../../hooks/useConfig';
import { useFormMode } from '../../../context/FormModeContext';

jest.mock('../../../hooks/useChat', () => ({ useChat: jest.fn() }));
jest.mock('../../../hooks/useConfig', () => ({ useConfig: jest.fn() }));
jest.mock('../../../context/FormModeContext', () => ({ useFormMode: jest.fn() }));
jest.mock('../useCSSVariables', () => ({ useCSSVariables: jest.fn() }));

jest.mock('../ChatHeader', () => ({
  __esModule: true,
  default: ({ onOpenSettings }) => (
    <div data-testid="chat-header">
      <button onClick={onOpenSettings}>open-settings</button>
    </div>
  ),
}));
jest.mock('../InputBar', () => ({ __esModule: true, default: () => <div data-testid="input-bar" /> }));
jest.mock('../ChatFooter', () => ({ __esModule: true, default: () => <div data-testid="chat-footer" /> }));
jest.mock('../AttachmentMenu', () => ({ __esModule: true, default: () => null }));
jest.mock('../MessageBubble', () => ({
  __esModule: true,
  default: ({ id, content }) => (
    <div data-testid="message-bubble" data-msg-id={id}>
      {content}
    </div>
  ),
}));
jest.mock('../TypingIndicator', () => ({ __esModule: true, default: () => <div data-testid="typing-indicator" /> }));
jest.mock('../SettingsView', () => ({
  __esModule: true,
  default: ({ onBack, onOpenPrivacy }) => (
    <div data-testid="settings-view">
      <button onClick={onBack}>back</button>
      <button onClick={onOpenPrivacy}>open-privacy</button>
    </div>
  ),
}));
jest.mock('../PrivacyView', () => ({
  __esModule: true,
  default: ({ onBack, onClose }) => (
    <div data-testid="privacy-view">
      <button onClick={onBack}>back-to-settings</button>
      <button onClick={onClose}>close-privacy</button>
    </div>
  ),
}));
jest.mock('../WelcomeView', () => ({
  __esModule: true,
  default: ({ onOpenQuestions }) => (
    <div data-testid="welcome-view">
      <button onClick={onOpenQuestions}>open-questions</button>
    </div>
  ),
}));
jest.mock('../QuestionsOverlay', () => ({
  __esModule: true,
  default: ({ onClose }) => (
    <div data-testid="questions-overlay">
      <button onClick={onClose}>close-questions</button>
    </div>
  ),
}));
jest.mock('../../forms/FormFieldPrompt', () => ({ __esModule: true, default: () => null }));
jest.mock('../../forms/FormCompletionCard', () => ({ __esModule: true, default: () => null }));

const OPEN_CONFIG = { widget_behavior: { start_open: true } };

function setChat(messages, overrides = {}) {
  useChat.mockReturnValue({
    messages,
    isTyping: false,
    renderMode: 'static',
    recordFormCompletion: jest.fn(),
    ...overrides,
  });
}

function setFormMode(overrides = {}) {
  useFormMode.mockReturnValue({
    isFormMode: false,
    isSuspended: false,
    cancelForm: jest.fn(),
    isFormComplete: false,
    completedFormData: null,
    completedFormConfig: null,
    currentFormId: null,
    clearCompletionState: jest.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  useChat.mockReset();
  useConfig.mockReset();
  useFormMode.mockReset();
  setFormMode();
  useConfig.mockReturnValue({ config: OPEN_CONFIG });
});

describe('ChatWidget — welcome vs. thread view derivation', () => {
  it('shows WelcomeView (not the thread) on a fresh session with the seeded welcome sentinel', () => {
    setChat([{ id: 'welcome', role: 'assistant', content: 'Hi!' }]);
    render(<ChatWidget />);

    expect(screen.getByTestId('welcome-view')).toBeInTheDocument();
    expect(screen.queryByTestId('message-bubble')).not.toBeInTheDocument();
    expect(document.querySelector('.chat-window')).not.toBeInTheDocument();
  });

  it('shows WelcomeView on a fresh session with NO welcome_message configured (empty messages)', () => {
    setChat([]);
    render(<ChatWidget />);

    expect(screen.getByTestId('welcome-view')).toBeInTheDocument();
    expect(screen.queryByTestId('message-bubble')).not.toBeInTheDocument();
  });

  it('shows the thread (not WelcomeView) once a real message exists alongside the sentinel', () => {
    setChat([
      { id: 'welcome', role: 'assistant', content: 'Hi!' },
      { id: 'user_1', role: 'user', content: 'Tell me about mentoring' },
    ]);
    render(<ChatWidget />);

    expect(screen.queryByTestId('welcome-view')).not.toBeInTheDocument();
    expect(document.querySelector('.chat-window')).toBeInTheDocument();
  });

  it('filters the sentinel welcome message out of the rendered thread (no duplicate greeting bubble)', () => {
    setChat([
      { id: 'welcome', role: 'assistant', content: 'Hi!' },
      { id: 'user_1', role: 'user', content: 'Tell me about mentoring' },
      { id: 'bot_1', role: 'assistant', content: 'Sure — ...' },
    ]);
    render(<ChatWidget />);

    const bubbles = screen.getAllByTestId('message-bubble');
    expect(bubbles).toHaveLength(2);
    expect(bubbles.map((b) => b.dataset.msgId)).toEqual(['user_1', 'bot_1']);
    expect(screen.queryByText('Hi!')).not.toBeInTheDocument();
  });

  it('returning to a restored mid-conversation session shows the thread, not welcome', () => {
    // Simulates a page-reload restore where the provider kept real messages
    // (no sentinel present at all — e.g. StreamingChatProvider's restore
    // path strips it once other assistant messages exist).
    setChat([
      { id: 'user_1', role: 'user', content: 'Hi' },
      { id: 'bot_1', role: 'assistant', content: 'Hello again' },
    ]);
    render(<ChatWidget />);

    expect(screen.queryByTestId('welcome-view')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('message-bubble')).toHaveLength(2);
  });

  it('"Clear all messages" returning `messages` to the welcome-only shape flips back to WelcomeView', () => {
    // ChatWidget's activeView is purely derived from `messages` (see its
    // header comment) — clearMessages() (frozen, unchanged by this item)
    // already resets every provider's messages to `[{id:'welcome',...}]` or
    // `[]`. Modeled here as a re-render with the post-clear message shape,
    // which is exactly what happens when the real clearMessages() call
    // updates provider state.
    setChat([
      { id: 'user_1', role: 'user', content: 'Hi' },
      { id: 'bot_1', role: 'assistant', content: 'Hello' },
    ]);
    const { rerender } = render(<ChatWidget />);
    expect(screen.queryByTestId('welcome-view')).not.toBeInTheDocument();

    setChat([{ id: 'welcome', role: 'assistant', content: 'Hi!' }]);
    rerender(<ChatWidget />);

    expect(screen.getByTestId('welcome-view')).toBeInTheDocument();
    expect(screen.queryByTestId('message-bubble')).not.toBeInTheDocument();
  });
});

describe('ChatWidget — Settings takeover is independent of welcome/thread', () => {
  it('Settings overlay can render regardless of activeView (welcome underneath)', () => {
    setChat([{ id: 'welcome', role: 'assistant', content: 'Hi!' }]);
    render(<ChatWidget />);

    expect(screen.queryByTestId('settings-view')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('open-settings'));
    expect(screen.getByTestId('settings-view')).toBeInTheDocument();
    // The header/composer stay mounted underneath (W3.3's "back preserves
    // scroll" contract) regardless of which content view is active.
    expect(screen.getByTestId('chat-header')).toBeInTheDocument();
    expect(screen.getByTestId('input-bar')).toBeInTheDocument();
  });
});

describe('ChatWidget — Privacy takeover wiring (W3.4)', () => {
  it('is closed by default, and opens (replacing SettingsView) when its "Privacy & compliance" row fires onOpenPrivacy', () => {
    setChat([{ id: 'welcome', role: 'assistant', content: 'Hi!' }]);
    render(<ChatWidget />);

    fireEvent.click(screen.getByText('open-settings'));
    expect(screen.getByTestId('settings-view')).toBeInTheDocument();
    expect(screen.queryByTestId('privacy-view')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('open-privacy'));

    expect(screen.getByTestId('privacy-view')).toBeInTheDocument();
    // Mutually exclusive at render time (ChatWidget.jsx's render comment) —
    // SettingsView unmounts while PrivacyView is showing.
    expect(screen.queryByTestId('settings-view')).not.toBeInTheDocument();
  });

  it('back from Privacy returns to Settings, not the thread', () => {
    setChat([{ id: 'welcome', role: 'assistant', content: 'Hi!' }]);
    render(<ChatWidget />);

    fireEvent.click(screen.getByText('open-settings'));
    fireEvent.click(screen.getByText('open-privacy'));
    expect(screen.getByTestId('privacy-view')).toBeInTheDocument();

    fireEvent.click(screen.getByText('back-to-settings'));

    expect(screen.queryByTestId('privacy-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-view')).toBeInTheDocument();
  });

  it('Privacy\'s close (X) closes the whole takeover, same as Settings\' own close', () => {
    setChat([{ id: 'welcome', role: 'assistant', content: 'Hi!' }]);
    render(<ChatWidget />);

    fireEvent.click(screen.getByText('open-settings'));
    fireEvent.click(screen.getByText('open-privacy'));

    fireEvent.click(screen.getByText('close-privacy'));

    expect(screen.queryByTestId('privacy-view')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-view')).not.toBeInTheDocument();
  });

  it('the header/composer stay mounted underneath Privacy', () => {
    setChat([{ id: 'welcome', role: 'assistant', content: 'Hi!' }]);
    render(<ChatWidget />);

    fireEvent.click(screen.getByText('open-settings'));
    fireEvent.click(screen.getByText('open-privacy'));

    expect(screen.getByTestId('chat-header')).toBeInTheDocument();
    expect(screen.getByTestId('input-bar')).toBeInTheDocument();
  });
});

describe('ChatWidget — Common questions overlay wiring (W3.2)', () => {
  it('is closed by default, and opens when WelcomeView\'s "Common questions" row fires onOpenQuestions', () => {
    setChat([{ id: 'welcome', role: 'assistant', content: 'Hi!' }]);
    render(<ChatWidget />);

    expect(screen.queryByTestId('questions-overlay')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('open-questions'));
    expect(screen.getByTestId('questions-overlay')).toBeInTheDocument();
  });

  it('closes when QuestionsOverlay calls onClose', () => {
    setChat([{ id: 'welcome', role: 'assistant', content: 'Hi!' }]);
    render(<ChatWidget />);

    fireEvent.click(screen.getByText('open-questions'));
    expect(screen.getByTestId('questions-overlay')).toBeInTheDocument();

    fireEvent.click(screen.getByText('close-questions'));
    expect(screen.queryByTestId('questions-overlay')).not.toBeInTheDocument();
  });

  it('the header/composer stay mounted underneath the overlay', () => {
    setChat([{ id: 'welcome', role: 'assistant', content: 'Hi!' }]);
    render(<ChatWidget />);

    fireEvent.click(screen.getByText('open-questions'));
    expect(screen.getByTestId('chat-header')).toBeInTheDocument();
    expect(screen.getByTestId('input-bar')).toBeInTheDocument();
  });
});

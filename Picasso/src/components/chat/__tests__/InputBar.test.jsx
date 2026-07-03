/**
 * InputBar Component Tests — Hairline composer (W2.4)
 *
 * Covers the restyled idle pill + expanded rect markup/classes AND the
 * frozen behavioral contract that must survive the re-skin: send handler,
 * Enter/Shift+Enter semantics, empty-disabled send, form-mode placeholder
 * swap + interruption flow, attach-menu trigger wiring, and the inert
 * (D4-gated) mic button.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import InputBar from '../InputBar';
import { useChat } from '../../../hooks/useChat';
import { useConfig } from '../../../hooks/useConfig';
import { useFormMode } from '../../../context/FormModeContext';

jest.mock('../../../hooks/useChat', () => ({
  useChat: jest.fn(),
}));

jest.mock('../../../hooks/useConfig', () => ({
  useConfig: jest.fn(),
}));

jest.mock('../../../context/FormModeContext', () => ({
  useFormMode: jest.fn(),
}));

jest.mock('../AttachmentMenu', () => {
  return function MockAttachmentMenu({ onClose }) {
    return (
      <div data-testid="attachment-menu">
        <button onClick={onClose}>close-attachment-menu</button>
      </div>
    );
  };
});

const baseChat = () => ({ addMessage: jest.fn(), isTyping: false });
const baseFormMode = () => ({ isFormMode: false, suspendForm: jest.fn() });
const configWithFeatures = (features = {}) => ({ config: { features } });

const getTextarea = () => screen.getByPlaceholderText('Ask a question…');

describe('InputBar — Hairline composer', () => {
  beforeEach(() => {
    useChat.mockReturnValue(baseChat());
    useConfig.mockReturnValue(configWithFeatures());
    useFormMode.mockReturnValue(baseFormMode());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('idle pill', () => {
    test('renders the spec placeholder text', () => {
      render(<InputBar />);
      expect(getTextarea()).toBeInTheDocument();
    });

    test('idle empty composer is never in the expanded layout', () => {
      // Regression: on the real widget the composer mounted stuck in the
      // tall .is-expanded layout because a mount-time scrollHeight mis-read
      // flipped isExpanded true (Chris report, 2026-07-02). An empty composer
      // must always be the single-line pill.
      const { container } = render(<InputBar />);
      const pill = container.querySelector('.hairline-composer-pill');
      expect(pill).toBeInTheDocument();
      expect(pill).not.toHaveClass('is-expanded');
    });

    test('composer returns to the single-line pill after content is cleared', () => {
      const { container } = render(<InputBar />);
      const pill = container.querySelector('.hairline-composer-pill');
      fireEvent.change(getTextarea(), { target: { value: 'some typed text' } });
      fireEvent.change(getTextarea(), { target: { value: '' } });
      expect(pill).not.toHaveClass('is-expanded');
    });

    test('expansion latches: a one-line measurement in the expanded layout does not collapse the pill', () => {
      // Regression: the expanded rect gives the textarea full pill width, so
      // text that wrapped at idle width can measure one line once expanded.
      // Re-deriving isExpanded downward from that wider measurement collapsed
      // the pill and oscillated on every keystroke (Chris report, 2026-07-03).
      // Once tripped, expansion must persist until the composer is emptied.
      const { container } = render(<InputBar />);
      const pill = container.querySelector('.hairline-composer-pill');
      const textarea = getTextarea();

      // Wrapped at idle width → trips expansion.
      Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 60 });
      fireEvent.change(textarea, { target: { value: "Tell me about mentoring, I've always wanted to" } });
      expect(pill).toHaveClass('is-expanded');

      // Same text measures a single line at expanded width → must stay latched.
      Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 20 });
      fireEvent.change(textarea, { target: { value: "Tell me about mentoring, I've always wanted to h" } });
      expect(pill).toHaveClass('is-expanded');

      // Emptying the composer is the only reset back to the idle pill.
      fireEvent.change(textarea, { target: { value: '' } });
      expect(pill).not.toHaveClass('is-expanded');
    });

    test('renders the send button, unfilled (disabled) when empty', () => {
      render(<InputBar />);
      const sendButton = screen.getByRole('button', { name: 'Send' });
      expect(sendButton).toBeDisabled();
      expect(sendButton).toHaveClass('is-idle');
      expect(sendButton).not.toHaveClass('is-active');
    });

    test('send button fills (enables) once there is text content', () => {
      render(<InputBar />);
      fireEvent.change(getTextarea(), { target: { value: 'Hello there' } });

      const sendButton = screen.getByRole('button', { name: 'Send' });
      expect(sendButton).not.toBeDisabled();
      expect(sendButton).toHaveClass('is-active');
      expect(sendButton).not.toHaveClass('is-idle');
    });

    test('whitespace-only input keeps send disabled', () => {
      render(<InputBar />);
      fireEvent.change(getTextarea(), { target: { value: '   ' } });

      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    });

    test('does not render the attach button when uploads/photo_uploads are both disabled', () => {
      render(<InputBar />);
      expect(screen.queryByRole('button', { name: 'Add Attachment' })).not.toBeInTheDocument();
    });

    test('renders the attach button when uploads is enabled, and toggles the attachment menu', () => {
      useConfig.mockReturnValue(configWithFeatures({ uploads: true }));
      render(<InputBar />);

      const attachButton = screen.getByRole('button', { name: 'Add Attachment' });
      expect(attachButton).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByTestId('attachment-menu')).not.toBeInTheDocument();

      fireEvent.click(attachButton);
      expect(attachButton).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('attachment-menu')).toBeInTheDocument();

      fireEvent.click(attachButton);
      expect(screen.queryByTestId('attachment-menu')).not.toBeInTheDocument();
    });

    test('renders the attach button when only photo_uploads is enabled', () => {
      useConfig.mockReturnValue(configWithFeatures({ photo_uploads: true }));
      render(<InputBar />);
      expect(screen.getByRole('button', { name: 'Add Attachment' })).toBeInTheDocument();
    });

    test('does not render the mic button by default (D4: hidden at flip)', () => {
      render(<InputBar />);
      expect(screen.queryByRole('button', { name: 'Voice input' })).not.toBeInTheDocument();
    });

    test('renders the mic button behind features.voice_input, but it is inert (no-op click)', () => {
      const chat = baseChat();
      useChat.mockReturnValue(chat);
      useConfig.mockReturnValue(configWithFeatures({ voice_input: true }));
      render(<InputBar />);

      const micButton = screen.getByRole('button', { name: 'Voice input' });
      expect(micButton).toBeInTheDocument();
      expect(() => fireEvent.click(micButton)).not.toThrow();
      expect(chat.addMessage).not.toHaveBeenCalled();
    });
  });

  describe('send path (frozen behavior)', () => {
    test('clicking Send adds the trimmed message and clears the input', () => {
      const chat = baseChat();
      useChat.mockReturnValue(chat);
      render(<InputBar />);

      fireEvent.change(getTextarea(), { target: { value: '  Hello world  ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));

      expect(chat.addMessage).toHaveBeenCalledTimes(1);
      expect(chat.addMessage).toHaveBeenCalledWith({ role: 'user', content: 'Hello world' });
      expect(getTextarea()).toHaveValue('');
    });

    test('Enter (no shift) submits the message', () => {
      const chat = baseChat();
      useChat.mockReturnValue(chat);
      render(<InputBar />);

      fireEvent.change(getTextarea(), { target: { value: 'Submit via enter' } });
      fireEvent.keyDown(getTextarea(), { key: 'Enter', shiftKey: false });

      expect(chat.addMessage).toHaveBeenCalledWith({ role: 'user', content: 'Submit via enter' });
    });

    test('Shift+Enter does NOT submit the message', () => {
      const chat = baseChat();
      useChat.mockReturnValue(chat);
      render(<InputBar />);

      fireEvent.change(getTextarea(), { target: { value: 'Line one' } });
      fireEvent.keyDown(getTextarea(), { key: 'Enter', shiftKey: true });

      expect(chat.addMessage).not.toHaveBeenCalled();
    });

    test('does not submit when input is empty', () => {
      const chat = baseChat();
      useChat.mockReturnValue(chat);
      render(<InputBar />);

      fireEvent.keyDown(getTextarea(), { key: 'Enter', shiftKey: false });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));

      expect(chat.addMessage).not.toHaveBeenCalled();
    });

    test('does not submit while isTyping is true, even with content', () => {
      const chat = { addMessage: jest.fn(), isTyping: true };
      useChat.mockReturnValue(chat);
      render(<InputBar />);

      fireEvent.change(getTextarea(), { target: { value: 'Hello' } });
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

      fireEvent.keyDown(getTextarea(), { key: 'Enter', shiftKey: false });
      expect(chat.addMessage).not.toHaveBeenCalled();
    });
  });

  describe('form mode (frozen behavior)', () => {
    test('shows the form-mode placeholder', () => {
      useFormMode.mockReturnValue({ isFormMode: true, suspendForm: jest.fn() });
      render(<InputBar />);

      expect(
        screen.getByPlaceholderText('Ask me a question (form will pause)...')
      ).toBeInTheDocument();
    });

    test('submitting during form mode suspends the form before adding the message', () => {
      const chat = baseChat();
      const formMode = { isFormMode: true, suspendForm: jest.fn() };
      useChat.mockReturnValue(chat);
      useFormMode.mockReturnValue(formMode);
      render(<InputBar />);

      const textarea = screen.getByPlaceholderText('Ask me a question (form will pause)...');
      fireEvent.change(textarea, { target: { value: 'Wait, a question' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));

      expect(formMode.suspendForm).toHaveBeenCalledWith('user_question');
      expect(chat.addMessage).toHaveBeenCalledWith({ role: 'user', content: 'Wait, a question' });
    });
  });

  describe('controlled input props', () => {
    test('uses the input/setInput props when provided instead of internal state', () => {
      const setInput = jest.fn();
      render(<InputBar input="preset text" setInput={setInput} />);

      const textarea = screen.getByPlaceholderText('Ask a question…');
      expect(textarea).toHaveValue('preset text');

      fireEvent.change(textarea, { target: { value: 'preset text more' } });
      expect(setInput).toHaveBeenCalledWith('preset text more');
    });
  });
});

/**
 * QuestionsOverlay Component Tests — Hairline common questions overlay (W3.2)
 *
 * DESIGN_SPEC.md "2. Common questions": dimmed/blurred underlay, overlay
 * card with rows from quick_help.prompts, ✕/outside-tap/ESC dismiss.
 *
 * The row-selection payload assertions are the FROZEN-behavior half of the
 * re-skin contract (HAIRLINE_WORKPLAN.md ground rule #2 + W3.2 guardrails):
 * selecting a row must dispatch the EXACT SAME `addMessage` payload
 * FollowUpPromptBar.jsx's `handleClick` did — `{ role: 'user', content: prompt }`,
 * gated on `!isTyping`, with no extra fields.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import QuestionsOverlay from '../QuestionsOverlay';

const mockUseConfig = jest.fn();
jest.mock('../../../hooks/useConfig', () => ({
  useConfig: (...args) => mockUseConfig(...args),
}));

const mockUseChat = jest.fn();
jest.mock('../../../hooks/useChat', () => ({
  useChat: (...args) => mockUseChat(...args),
}));

function setConfig(config) {
  mockUseConfig.mockReturnValue({ config });
}

function setChat(overrides = {}) {
  mockUseChat.mockReturnValue({
    addMessage: jest.fn(),
    isTyping: false,
    ...overrides,
  });
}

beforeEach(() => {
  mockUseConfig.mockReset();
  mockUseChat.mockReset();
});

describe('QuestionsOverlay — header + rows (DESIGN_SPEC.md screen 2)', () => {
  it('renders the FIXED "Common questions" title regardless of quick_help.title', () => {
    setConfig({ quick_help: { enabled: true, title: 'Custom Title', prompts: ['Q1?'] } });
    setChat();
    render(<QuestionsOverlay onClose={jest.fn()} />);

    expect(screen.getByText('Common questions')).toBeInTheDocument();
    expect(screen.queryByText('Custom Title')).not.toBeInTheDocument();
  });

  it('renders quick_help.prompts as rows, in order', () => {
    setConfig({ quick_help: { enabled: true, prompts: ['Who do you help?', 'What areas do you serve?'] } });
    setChat();
    render(<QuestionsOverlay onClose={jest.fn()} />);

    const rows = screen.getAllByRole('button').filter((el) => el.textContent !== '');
    const rowLabels = rows.map((el) => el.textContent);
    expect(rowLabels).toEqual(['Who do you help?', 'What areas do you serve?']);
  });

  it('falls back to the legacy default prompts when quick_help.prompts is missing (no content regression)', () => {
    setConfig({ quick_help: { enabled: true } });
    setChat();
    render(<QuestionsOverlay onClose={jest.fn()} />);

    expect(screen.getByText('Tell me about volunteering')).toBeInTheDocument();
    expect(screen.getByText('Where does my donation go?')).toBeInTheDocument();
  });

  it('falls back to the legacy default prompts when quick_help.prompts is an empty array', () => {
    setConfig({ quick_help: { enabled: true, prompts: [] } });
    setChat();
    render(<QuestionsOverlay onClose={jest.fn()} />);

    expect(screen.getByText('Tell me about volunteering')).toBeInTheDocument();
  });

  it('tolerates config being null (pre-fetch state)', () => {
    setConfig(null);
    setChat();
    expect(() => render(<QuestionsOverlay onClose={jest.fn()} />)).not.toThrow();
    expect(screen.getByText('Common questions')).toBeInTheDocument();
  });

  it('has dialog ARIA semantics', () => {
    setConfig({ quick_help: { prompts: ['Q1?'] } });
    setChat();
    render(<QuestionsOverlay onClose={jest.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Common questions' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});

describe('QuestionsOverlay — row selection (FROZEN send payload, byte-identical to FollowUpPromptBar)', () => {
  it('selecting a row sends {role: "user", content: prompt} with no extra fields, and closes', () => {
    const addMessage = jest.fn();
    const onClose = jest.fn();
    setConfig({ quick_help: { prompts: ['Who do you help?'] } });
    setChat({ addMessage, isTyping: false });
    render(<QuestionsOverlay onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Who do you help?' }));

    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(addMessage).toHaveBeenCalledWith({ role: 'user', content: 'Who do you help?' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does nothing while isTyping is true (matches FollowUpPromptBar\'s guard) — rows are disabled', () => {
    const addMessage = jest.fn();
    const onClose = jest.fn();
    setConfig({ quick_help: { prompts: ['Who do you help?'] } });
    setChat({ addMessage, isTyping: true });
    render(<QuestionsOverlay onClose={onClose} />);

    const row = screen.getByRole('button', { name: 'Who do you help?' });
    expect(row).toBeDisabled();
    fireEvent.click(row);

    expect(addMessage).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('QuestionsOverlay — dismissal (new-overlay a11y requirement)', () => {
  beforeEach(() => {
    setConfig({ quick_help: { prompts: ['Q1?'] } });
    setChat();
  });

  it('the ✕ button dismisses the overlay', () => {
    const onClose = jest.fn();
    render(<QuestionsOverlay onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close common questions' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape dismisses the overlay', () => {
    const onClose = jest.fn();
    render(<QuestionsOverlay onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a tap outside the card (on the dimmed underlay) dismisses it', () => {
    const onClose = jest.fn();
    render(<QuestionsOverlay onClose={onClose} />);

    fireEvent.mouseDown(screen.getByRole('dialog').parentElement.querySelector('.hairline-questions-underlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a tap inside the card does not dismiss it', () => {
    const onClose = jest.fn();
    render(<QuestionsOverlay onClose={onClose} />);

    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves focus to the close button on mount', () => {
    render(<QuestionsOverlay onClose={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Close common questions' })).toHaveFocus();
  });
});

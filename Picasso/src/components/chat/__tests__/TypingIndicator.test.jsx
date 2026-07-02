/**
 * TypingIndicator — Hairline redesign tests (W2.2)
 *
 * DESIGN_SPEC.md "Loading" interaction note: three-dot pulse under the
 * wordmark sender label, quiet palette, no avatar (not mocked as its own
 * screen — this re-expresses it in the same `.hairline-message*` vocabulary
 * MessageBubble.jsx's bot messages use).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TypingIndicator from '../TypingIndicator';

const mockUseConfig = jest.fn();
jest.mock('../../../hooks/useConfig', () => ({
  useConfig: (...args) => mockUseConfig(...args),
}));

function setConfig(config) {
  mockUseConfig.mockReturnValue({ config });
}

describe('TypingIndicator — Hairline (W2.2)', () => {
  beforeEach(() => {
    mockUseConfig.mockReset();
  });

  test('renders as a bot message group: wordmark label + three dots, no avatar', () => {
    setConfig({ branding: { chat_title: 'Atlanta Angels' } });
    const { container } = render(<TypingIndicator />);

    const wrapper = container.querySelector('.hairline-message');
    expect(wrapper).toHaveClass('hairline-message--bot');
    expect(wrapper).toHaveClass('hairline-typing');

    const label = screen.getByText('Atlanta Angels');
    expect(label).toHaveClass('hairline-sender-label--bot');

    expect(container.querySelectorAll('.hairline-typing-dot')).toHaveLength(3);
    container.querySelectorAll('.hairline-typing-dot').forEach((dot) => {
      expect(dot).toHaveAttribute('aria-hidden', 'true');
    });

    // No avatar anywhere.
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('.bot-avatar')).not.toBeInTheDocument();
  });

  test('falls back to "Chat" when chat_title is absent (old-shape config)', () => {
    setConfig({});
    render(<TypingIndicator />);
    expect(screen.getByText('Chat')).toHaveClass('hairline-sender-label--bot');
  });

  test('falls back to "Chat" when config itself is null (pre-fetch state)', () => {
    setConfig(null);
    render(<TypingIndicator />);
    expect(screen.getByText('Chat')).toHaveClass('hairline-sender-label--bot');
  });

  test('announces "typing" for assistive tech via a live region', () => {
    setConfig({ branding: { chat_title: 'Atlanta Angels' } });
    const { container } = render(<TypingIndicator />);

    const dotsRow = container.querySelector('.hairline-typing-dots');
    expect(dotsRow).toHaveAttribute('role', 'status');
    expect(dotsRow).toHaveAttribute('aria-live', 'polite');
    expect(container.querySelector('.visually-hidden')).toHaveTextContent(
      'Atlanta Angels is typing'
    );
  });
});

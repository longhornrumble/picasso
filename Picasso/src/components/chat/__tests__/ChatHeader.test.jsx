/**
 * ChatHeader Component Tests — Hairline redesign (W2.1)
 *
 * Restyled from the pre-Hairline header (logo + title + subtitle + gear +
 * close) to wordmark + sliders + close per DESIGN_SPEC.md "Widget Shell"
 * header. Behavioral assertions (settings/close handlers firing,
 * icon-button aria-labels) are the frozen contract carried over from the
 * pre-Hairline header; className/markup assertions below are new
 * (restyle-only, per HAIRLINE_WORKPLAN.md ground rule #6).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatHeader from '../ChatHeader';

const mockUseConfig = jest.fn();
jest.mock('../../../hooks/useConfig', () => ({
  useConfig: (...args) => mockUseConfig(...args),
}));

function setConfig(config) {
  mockUseConfig.mockReturnValue({ config });
}

describe('ChatHeader — Hairline shell + header (W2.1)', () => {
  beforeEach(() => {
    mockUseConfig.mockReset();
  });

  test('renders the wordmark from config.branding.chat_title', () => {
    setConfig({ branding: { chat_title: 'Atlanta Angels' } });
    render(<ChatHeader onClose={() => {}} onOpenSettings={() => {}} />);

    // Text content stays in the config's natural case — caps rendering is a
    // CSS text-transform (hairline-shell.css), not a JS .toUpperCase(), so
    // the accessible name/DOM text is exactly the config value.
    expect(screen.getByText('Atlanta Angels')).toHaveClass('hairline-wordmark');
  });

  test('falls back to "Chat" when chat_title is absent (old-shape config)', () => {
    setConfig({});
    render(<ChatHeader onClose={() => {}} onOpenSettings={() => {}} />);
    expect(screen.getByText('Chat')).toHaveClass('hairline-wordmark');
  });

  test('falls back to "Chat" when config itself is null (pre-fetch state)', () => {
    // ChatWidget.jsx never mounts ChatHeader before config resolves (it
    // early-returns a loading state), but ChatHeader is a unit under test on
    // its own here — the optional-chaining read must tolerate a null config
    // regardless of that upstream guard (CLAUDE.md "Schema Discipline").
    setConfig(null);
    render(<ChatHeader onClose={() => {}} onOpenSettings={() => {}} />);
    expect(screen.getByText('Chat')).toHaveClass('hairline-wordmark');
  });

  test('renders no subtitle, no avatar/logo, and only the two header icons', () => {
    setConfig({
      branding: {
        chat_title: 'Atlanta Angels',
        chat_subtitle: 'How can we help you today?',
      },
    });
    const { container } = render(
      <ChatHeader onClose={() => {}} onOpenSettings={() => {}} />
    );

    expect(screen.queryByText('How can we help you today?')).not.toBeInTheDocument();
    expect(container.querySelector('.chat-header-logo')).not.toBeInTheDocument();
    expect(container.querySelector('.chat-subtitle')).not.toBeInTheDocument();
    // Settings + close only — no third (help) icon.
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  test('header markup uses the Hairline shell classes', () => {
    setConfig({ branding: { chat_title: 'Atlanta Angels' } });
    const { container } = render(
      <ChatHeader onClose={() => {}} onOpenSettings={() => {}} />
    );

    expect(container.querySelector('.hairline-header')).toBeInTheDocument();
    expect(container.querySelector('.hairline-header-icons')).toBeInTheDocument();
    expect(container.querySelectorAll('.hairline-icon-button')).toHaveLength(2);
  });

  test('settings icon-button fires onOpenSettings and keeps its aria-label', () => {
    setConfig({ branding: { chat_title: 'Atlanta Angels' } });
    const onOpenSettings = jest.fn();
    render(<ChatHeader onClose={() => {}} onOpenSettings={onOpenSettings} />);

    const settingsButton = screen.getByRole('button', { name: /open chat settings/i });
    expect(settingsButton).toHaveClass('hairline-icon-button');

    fireEvent.click(settingsButton);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  test('close icon-button fires onClose and keeps its aria-label', () => {
    setConfig({ branding: { chat_title: 'Atlanta Angels' } });
    const onClose = jest.fn();
    render(<ChatHeader onClose={onClose} onOpenSettings={() => {}} />);

    const closeButton = screen.getByRole('button', { name: /close chat/i });
    expect(closeButton).toHaveClass('hairline-icon-button');

    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('omits the settings button entirely when onOpenSettings is not provided', () => {
    setConfig({ branding: { chat_title: 'Atlanta Angels' } });
    render(<ChatHeader onClose={() => {}} />);

    expect(screen.queryByRole('button', { name: /open chat settings/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close chat/i })).toBeInTheDocument();
  });

  test('wordmark stress test: "BIG BROTHERS BIG SISTERS" renders fully, icons unaffected', () => {
    // DESIGN_SPEC.md "Header name stress test" — the long name must clear
    // the header icons by wrapping (flex-shrink + min-width:0 in
    // hairline-shell.css), not by truncating the string. jsdom doesn't lay
    // out text, so this asserts the DOM contract that layout depends on:
    // the full string is present as one text node inside the wordmark
    // element, and both icon-buttons remain intact, distinct DOM nodes.
    setConfig({ branding: { chat_title: 'Big Brothers Big Sisters' } });
    render(<ChatHeader onClose={() => {}} onOpenSettings={() => {}} />);

    const wordmark = screen.getByText('Big Brothers Big Sisters');
    expect(wordmark).toHaveClass('hairline-wordmark');
    expect(screen.getByRole('button', { name: /open chat settings/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close chat/i })).toBeInTheDocument();
  });
});

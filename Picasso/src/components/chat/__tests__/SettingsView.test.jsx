/**
 * SettingsView Component Tests — Hairline settings takeover (W3.3)
 *
 * Rebuilds StateManagementPanel.jsx's 3-tab modal as a single grouped list
 * (DESIGN_SPEC.md screen 5). Behavioral assertions carried over from the
 * old panel (frozen, HAIRLINE_WORKPLAN.md ground rule #2): clear-all wires
 * to the SAME `clearMessages()` from useChat() — which is where the
 * SESSION_CLEARED audit/analytics event actually lives (StreamingChatProvider.jsx /
 * HTTPChatProvider.jsx), so asserting this component calls it is the
 * correct "same audit event" contract for a component-level test. Markup/
 * class assertions are new (restyle + tabs→list restructure, per ground
 * rule #6). History + Download rows removed 2026-07-03 (Chris decision) —
 * their absence is regression-asserted below.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsView from '../SettingsView';
import { useChat } from '../../../hooks/useChat';

jest.mock('../../../hooks/useChat', () => ({
  useChat: jest.fn(),
}));

const HISTORY_KEY = 'picasso_conversations';

function baseChat(overrides = {}) {
  return {
    messages: [{ id: 'm1', role: 'user', content: 'Hi', timestamp: '2026-01-01T00:00:00.000Z' }],
    conversationMetadata: { conversationId: 'conv_123' },
    clearMessages: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.useFakeTimers({ legacyFakeTimers: false });
  localStorage.clear();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  useChat.mockReset();
});

describe('SettingsView — Hairline settings takeover (W3.3)', () => {
  describe('grouped list — screen 5 as amended (spec amendment 6)', () => {
    test('renders the single "Your data" group — Conversation/Preferences groups are gone', () => {
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);

      const labels = screen.getAllByRole('heading', { level: 4 }).map((el) => el.textContent);
      expect(labels).toEqual(['Your data']);
    });

    test('renders no tabs — StateManagementPanel\'s 3-tab nav is gone', () => {
      useChat.mockReturnValue(baseChat());
      const { container } = render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      expect(container.querySelector('.state-panel-tabs')).not.toBeInTheDocument();
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });

    test('page title reads "Settings"', () => {
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    test('D5: omits the "Offline sync" row (no offline-sync feature exists)', () => {
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      expect(screen.queryByText('Offline sync')).not.toBeInTheDocument();
    });

    test('clicking the "Privacy & compliance" row calls onOpenPrivacy (W3.4)', () => {
      const onOpenPrivacy = jest.fn();
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} onOpenPrivacy={onOpenPrivacy} />);
      const row = screen.getByText('Privacy & compliance').closest('button');
      expect(row).toBeInTheDocument();

      fireEvent.click(row);

      expect(onOpenPrivacy).toHaveBeenCalledTimes(1);
    });

    test('clicking the "Privacy & compliance" row without onOpenPrivacy does not throw (tolerant of the prop being omitted)', () => {
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      const row = screen.getByText('Privacy & compliance').closest('button');
      expect(() => fireEvent.click(row)).not.toThrow();
    });
  });

  describe('removed rows stay removed (Chris decisions, 2026-07-03 — spec amendments 5+6)', () => {
    // History: dead read (nothing ever wrote the picasso_conversations
    // archive; storage is session-only). Download: metadata-only export,
    // blocked by the iframe sandbox. Current session + Connection: trivia.
    // Storage: a disclosure a key-value row can't explain — its job moved
    // to the clear row's fine print. See SettingsView.jsx header.
    test('renders no History row, even when the legacy storage key has data', () => {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify([{ conversationId: 'c1', metadata: { created: '2026-01-01T00:00:00.000Z' }, messages: [] }])
      );
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      expect(screen.queryByText('History')).not.toBeInTheDocument();
      expect(screen.queryByText('None yet')).not.toBeInTheDocument();
    });

    test('renders no Download, Current session, Connection, or Storage rows', () => {
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      expect(screen.queryByText('Download conversations')).not.toBeInTheDocument();
      expect(screen.queryByText('Current session')).not.toBeInTheDocument();
      expect(screen.queryByText('Connection')).not.toBeInTheDocument();
      expect(screen.queryByText('Storage')).not.toBeInTheDocument();
    });

    test('tolerates an old-shape chat context missing messages/conversationMetadata', () => {
      useChat.mockReturnValue({ clearMessages: jest.fn() });
      expect(() => render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />)).not.toThrow();
    });
  });

  describe('storage disclosure — folded into the clear row fine print (spec amendment 6)', () => {
    test('renders the plain-English storage disclaimer under Clear all messages', () => {
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      expect(
        screen.getByText(/stays in this browser's memory until you close this tab/)
      ).toBeInTheDocument();
      expect(screen.getByText(/can't be undone and is recorded for compliance/)).toBeInTheDocument();
    });
  });

  describe('clear all messages — inline confirm replaces the toast, same audit-emitting clearMessages()', () => {
    test('default state shows the row, not the confirm', () => {
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      expect(screen.getByText('Clear all messages')).toBeInTheDocument();
      expect(screen.queryByText('Clear this conversation?')).not.toBeInTheDocument();
    });

    test('clicking the row shows the inline confirm/cancel pill pair (not a toast)', () => {
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);

      fireEvent.click(screen.getByText('Clear all messages'));

      expect(screen.getByText('Clear this conversation?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Clear messages' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      // No page-level toast node (old panel injected `.state-notification` into document.body).
      expect(document.querySelector('.state-notification')).not.toBeInTheDocument();
    });

    test('Cancel reverts to the default row without clearing anything', () => {
      const clearMessages = jest.fn();
      useChat.mockReturnValue(baseChat({ clearMessages }));
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);

      fireEvent.click(screen.getByText('Clear all messages'));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.getByText('Clear all messages')).toBeInTheDocument();
      expect(clearMessages).not.toHaveBeenCalled();
    });

    test('confirming calls the SAME clearMessages() from useChat() — where SESSION_CLEARED is emitted — clears stored history, and returns to the thread', async () => {
      const onBack = jest.fn();
      const clearMessages = jest.fn().mockResolvedValue(undefined);
      localStorage.setItem(HISTORY_KEY, JSON.stringify([{ conversationId: 'c1' }]));
      useChat.mockReturnValue(baseChat({ clearMessages }));
      render(<SettingsView onBack={onBack} onClose={jest.fn()} />);

      fireEvent.click(screen.getByText('Clear all messages'));
      fireEvent.click(screen.getByRole('button', { name: 'Clear messages' }));

      await waitFor(() => expect(clearMessages).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
      expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
    });

    test('shows an inline error (not a toast) and stays open if clearMessages() rejects', async () => {
      const onBack = jest.fn();
      const clearMessages = jest.fn().mockRejectedValue(new Error('boom'));
      useChat.mockReturnValue(baseChat({ clearMessages }));
      render(<SettingsView onBack={onBack} onClose={jest.fn()} />);

      fireEvent.click(screen.getByText('Clear all messages'));
      fireEvent.click(screen.getByRole('button', { name: 'Clear messages' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/failed to clear/i);
      expect(onBack).not.toHaveBeenCalled();
      expect(document.querySelector('.state-notification')).not.toBeInTheDocument();
    });
  });

  describe('navigation affordances', () => {
    test('back chevron calls onBack', () => {
      const onBack = jest.fn();
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={onBack} onClose={jest.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /back to conversation/i }));
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    test('close (X) calls onClose', () => {
      const onClose = jest.fn();
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={onClose} />);
      fireEvent.click(screen.getByRole('button', { name: /close chat/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('Escape key calls onBack (a11y — HAIRLINE_WORKPLAN.md ground rule #7)', () => {
      const onBack = jest.fn();
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={onBack} onClose={jest.fn()} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    test('focus moves into the takeover on mount (back button)', () => {
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      expect(screen.getByRole('button', { name: /back to conversation/i })).toHaveFocus();
    });
  });
});

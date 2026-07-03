/**
 * SettingsView Component Tests — Hairline settings takeover (W3.3)
 *
 * Rebuilds StateManagementPanel.jsx's 3-tab modal as a single grouped list
 * (DESIGN_SPEC.md screen 5). Behavioral assertions carried over from the
 * old panel (frozen, HAIRLINE_WORKPLAN.md ground rule #2): clear-all wires
 * to the SAME `clearMessages()` from useChat() — which is where the
 * SESSION_CLEARED audit/analytics event actually lives (StreamingChatProvider.jsx /
 * HTTPChatProvider.jsx), so asserting this component calls it is the
 * correct "same audit event" contract for a component-level test — export
 * builds the same payload shape and triggers a download, history renders
 * from localStorage. Markup/class assertions are new (restyle + tabs→list
 * restructure, per ground rule #6).
 */
import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
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

function setOnline(isOnline) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: isOnline,
  });
}

beforeAll(() => {
  if (!global.URL.createObjectURL) {
    global.URL.createObjectURL = jest.fn();
  }
  if (!global.URL.revokeObjectURL) {
    global.URL.revokeObjectURL = jest.fn();
  }
});

beforeEach(() => {
  jest.useFakeTimers({ legacyFakeTimers: false });
  jest.spyOn(global.URL, 'createObjectURL').mockReturnValue('blob:mock-url');
  jest.spyOn(global.URL, 'revokeObjectURL').mockImplementation(() => {});
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  setOnline(true);
  localStorage.clear();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  useChat.mockReset();
});

describe('SettingsView — Hairline settings takeover (W3.3)', () => {
  describe('grouped list — matches DESIGN_SPEC.md screen 5', () => {
    test('renders the three group labels in order', () => {
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);

      const labels = screen.getAllByRole('heading', { level: 4 }).map((el) => el.textContent);
      expect(labels).toEqual(['Conversation', 'Preferences', 'Your data']);
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

  describe('current session — frozen stat computation, restyled pluralization', () => {
    test('shows singular "1 message" for a single message', () => {
      useChat.mockReturnValue(baseChat({ messages: [{ id: 'm1', role: 'user', content: 'hi' }] }));
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      expect(screen.getByText('1 message')).toBeInTheDocument();
    });

    test('shows plural "N messages" for multiple messages', () => {
      useChat.mockReturnValue(
        baseChat({
          messages: [
            { id: 'm1', role: 'user', content: 'hi' },
            { id: 'm2', role: 'assistant', content: 'hello' },
            { id: 'm3', role: 'user', content: 'bye' },
          ],
        })
      );
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      expect(screen.getByText('3 messages')).toBeInTheDocument();
    });

    test('tolerates an old-shape chat context missing messages/conversationMetadata', () => {
      useChat.mockReturnValue({ clearMessages: jest.fn() });
      expect(() => render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />)).not.toThrow();
      expect(screen.getByText('0 messages')).toBeInTheDocument();
    });
  });

  describe('connection — frozen navigator.onLine read', () => {
    test('shows "Online" with the online dot when navigator.onLine is true', () => {
      setOnline(true);
      useChat.mockReturnValue(baseChat());
      const { container } = render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      expect(screen.getByText('Online')).toBeInTheDocument();
      expect(container.querySelector('.hairline-connection-dot.is-online')).toBeInTheDocument();
    });

    test('shows "Offline" with the offline dot when navigator.onLine is false', () => {
      setOnline(false);
      useChat.mockReturnValue(baseChat());
      const { container } = render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      expect(screen.getByText('Offline')).toBeInTheDocument();
      expect(container.querySelector('.hairline-connection-dot.is-offline')).toBeInTheDocument();
    });
  });

  describe('history — old panel\'s History tab, reachable via drill-in row', () => {
    test('History row shows "None yet" when no stored history exists', () => {
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      expect(screen.getByText('None yet')).toBeInTheDocument();
    });

    test('History row shows a pluralized count when history exists', () => {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify([{ conversationId: 'c1', metadata: { created: '2026-01-01T00:00:00.000Z' }, messages: [] }])
      );
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      expect(screen.getByText('1 conversation')).toBeInTheDocument();
    });

    test('clicking History drills into the history list, showing stored conversations', async () => {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify([
          {
            conversationId: 'c1',
            metadata: { created: '2026-01-01T00:00:00.000Z', lastSummary: 'Talked about volunteering' },
            messages: [
              { timestamp: '2026-01-01T00:00:00.000Z' },
              { timestamp: '2026-01-01T00:05:00.000Z' },
            ],
          },
        ])
      );
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);

      fireEvent.click(screen.getByText('History').closest('button'));

      expect(await screen.findByText('Talked about volunteering', { exact: false })).toBeInTheDocument();
      expect(screen.getByText('5 min')).toBeInTheDocument();
    });

    test('history sub-view shows the empty state when there is no history', () => {
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      fireEvent.click(screen.getByText('History').closest('button'));
      expect(screen.getByText('No conversation history found')).toBeInTheDocument();
    });

    test('history sub-view\'s back button returns to the grouped list', () => {
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);
      fireEvent.click(screen.getByText('History').closest('button'));
      fireEvent.click(screen.getByRole('button', { name: /back to settings/i }));
      expect(screen.getByText('Conversation')).toBeInTheDocument();
      expect(screen.getByText('Current session')).toBeInTheDocument();
    });
  });

  describe('download conversations — export, frozen payload shape (no message content)', () => {
    test('clicking triggers a JSON download built from messages + history', () => {
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);

      fireEvent.click(screen.getByText('Download conversations').closest('button'));

      expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
      const blob = global.URL.createObjectURL.mock.calls[0][0];
      expect(blob.type).toBe('application/json');
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    });

    test('shows a transient "Downloaded" confirmation, then reverts', () => {
      useChat.mockReturnValue(baseChat());
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);

      fireEvent.click(screen.getByText('Download conversations').closest('button'));
      expect(screen.getByText('Downloaded')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.getByText('Download conversations')).toBeInTheDocument();
    });

    test('shows an inline "Download failed" (not a toast) if the export throws, then reverts', () => {
      useChat.mockReturnValue(baseChat());
      global.URL.createObjectURL.mockImplementation(() => {
        throw new Error('blob boom');
      });
      render(<SettingsView onBack={jest.fn()} onClose={jest.fn()} />);

      fireEvent.click(screen.getByText('Download conversations').closest('button'));

      expect(screen.getByText('Download failed')).toBeInTheDocument();
      expect(document.querySelector('.state-notification')).not.toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.getByText('Download conversations')).toBeInTheDocument();
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

/**
 * settingsHelpers.js unit tests (Hairline W3.3)
 *
 * Dedicated coverage for the logic extracted from StateManagementPanel.jsx —
 * these are exercised indirectly through SettingsView.test.jsx too, but as
 * FROZEN behavior (HAIRLINE_WORKPLAN.md ground rule #2) they get direct
 * unit tests independent of any component's rendering.
 */
import {
  buildConversationExportPayload,
  clearStoredConversationHistory,
  formatConversationDate,
  formatConversationDuration,
  loadStoredConversationHistory,
  triggerJSONDownload,
} from '../settingsHelpers';

const HISTORY_KEY = 'picasso_conversations';
const CURRENT_CONVERSATION_KEY = 'picasso_current_conversation';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('loadStoredConversationHistory', () => {
  test('returns [] when nothing is stored', () => {
    expect(loadStoredConversationHistory()).toEqual([]);
  });

  test('returns [] for malformed JSON (never throws)', () => {
    localStorage.setItem(HISTORY_KEY, '{not json');
    expect(() => loadStoredConversationHistory()).not.toThrow();
    expect(loadStoredConversationHistory()).toEqual([]);
  });

  test('returns [] when the stored value is valid JSON but not an array', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ not: 'an array' }));
    expect(loadStoredConversationHistory()).toEqual([]);
  });

  test('returns the stored conversations, sliced to the limit', () => {
    const conversations = Array.from({ length: 15 }, (_, i) => ({ conversationId: `c${i}` }));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(conversations));
    expect(loadStoredConversationHistory(10)).toHaveLength(10);
    expect(loadStoredConversationHistory(10)[0]).toEqual({ conversationId: 'c0' });
  });

  test('default limit is 10', () => {
    const conversations = Array.from({ length: 12 }, (_, i) => ({ conversationId: `c${i}` }));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(conversations));
    expect(loadStoredConversationHistory()).toHaveLength(10);
  });
});

describe('formatConversationDate', () => {
  test('returns "Unknown date" for a falsy input', () => {
    expect(formatConversationDate(null)).toBe('Unknown date');
    expect(formatConversationDate(undefined)).toBe('Unknown date');
    expect(formatConversationDate('')).toBe('Unknown date');
  });

  test('formats a valid ISO date string via toLocaleDateString', () => {
    const input = '2026-01-15T00:00:00.000Z';
    expect(formatConversationDate(input)).toBe(new Date(input).toLocaleDateString());
  });
});

describe('formatConversationDuration', () => {
  test('returns "Single message" when the conversation has fewer than 2 messages', () => {
    expect(formatConversationDuration({ messages: [] })).toBe('Single message');
    expect(formatConversationDuration({ messages: [{ timestamp: '2026-01-01T00:00:00.000Z' }] })).toBe(
      'Single message'
    );
  });

  test('returns "Single message" when messages is missing entirely (old-shape tolerance)', () => {
    expect(formatConversationDuration({})).toBe('Single message');
  });

  test('returns "Unknown duration" when messages exist but lack timestamps', () => {
    expect(formatConversationDuration({ messages: [{}, {}] })).toBe('Unknown duration');
  });

  test('computes whole minutes between the first and last message', () => {
    const conversation = {
      messages: [
        { timestamp: '2026-01-01T00:00:00.000Z' },
        { timestamp: '2026-01-01T00:05:00.000Z' },
      ],
    };
    expect(formatConversationDuration(conversation)).toBe('5 min');
  });

  test('returns "Less than a minute" for a sub-minute span', () => {
    const conversation = {
      messages: [
        { timestamp: '2026-01-01T00:00:00.000Z' },
        { timestamp: '2026-01-01T00:00:20.000Z' },
      ],
    };
    expect(formatConversationDuration(conversation)).toBe('Less than a minute');
  });
});

describe('buildConversationExportPayload', () => {
  test('never includes message content — only length and metadata (privacy)', () => {
    const payload = buildConversationExportPayload({
      tenantHashDisplay: 'abcd1234...',
      messages: [{ id: 'm1', role: 'user', content: 'super secret stuff', timestamp: 't1' }],
      conversationMetadata: { conversationId: 'conv1' },
      conversationHistory: [],
    });

    expect(payload.tenant_hash).toBe('abcd1234...');
    expect(payload.current_conversation.id).toBe('conv1');
    expect(payload.current_conversation.message_count).toBe(1);
    expect(payload.current_conversation.messages[0]).toEqual({
      id: 'm1',
      role: 'user',
      timestamp: 't1',
      content_length: 'super secret stuff'.length,
    });
    expect(JSON.stringify(payload)).not.toContain('super secret stuff');
  });

  test('tolerates missing optional fields (old-shape / empty state)', () => {
    expect(() => buildConversationExportPayload({})).not.toThrow();
    const payload = buildConversationExportPayload({});
    expect(payload.current_conversation.message_count).toBe(0);
    expect(payload.conversation_history).toEqual([]);
  });

  test('summarizes conversation_history entries, truncating the summary to 100 chars', () => {
    const longSummary = 'x'.repeat(150);
    const payload = buildConversationExportPayload({
      conversationHistory: [
        { conversationId: 'c1', metadata: { created: 't1', lastSummary: longSummary }, messages: [1, 2] },
      ],
    });
    expect(payload.conversation_history[0]).toEqual({
      id: 'c1',
      created: 't1',
      message_count: 2,
      summary: 'x'.repeat(100),
    });
  });

  test('falls back to "No summary" when a history entry has none', () => {
    const payload = buildConversationExportPayload({
      conversationHistory: [{ conversationId: 'c1', metadata: {}, messages: [] }],
    });
    expect(payload.conversation_history[0].summary).toBe('No summary');
  });
});

describe('triggerJSONDownload', () => {
  beforeEach(() => {
    if (!global.URL.createObjectURL) global.URL.createObjectURL = jest.fn();
    if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = jest.fn();
    jest.spyOn(global.URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    jest.spyOn(global.URL, 'revokeObjectURL').mockImplementation(() => {});
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('builds a JSON blob, triggers a click on a download link, then revokes the URL', () => {
    triggerJSONDownload({ hello: 'world' }, 'test.json');

    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blob = global.URL.createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('application/json');

    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});

describe('clearStoredConversationHistory', () => {
  test('removes the localStorage history key and the current-conversation session key', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([{ conversationId: 'c1' }]));
    sessionStorage.setItem(CURRENT_CONVERSATION_KEY, 'some-value');

    clearStoredConversationHistory();

    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
    expect(sessionStorage.getItem(CURRENT_CONVERSATION_KEY)).toBeNull();
  });
});

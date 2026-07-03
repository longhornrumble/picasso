/**
 * settingsHelpers.js unit tests (Hairline W3.3)
 *
 * Dedicated coverage for the logic extracted from StateManagementPanel.jsx —
 * exercised indirectly through SettingsView.test.jsx too, but as FROZEN
 * behavior (HAIRLINE_WORKPLAN.md ground rule #2) it gets direct unit tests
 * independent of any component's rendering.
 *
 * Slimmed 2026-07-03 with the module (Chris decision — Settings History +
 * Download rows removed): tests for the deleted history/export helpers went
 * with them; clear-all is the only surviving helper.
 */
import { clearStoredConversationHistory } from '../settingsHelpers';

const HISTORY_KEY = 'picasso_conversations';
const CURRENT_CONVERSATION_KEY = 'picasso_current_conversation';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
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

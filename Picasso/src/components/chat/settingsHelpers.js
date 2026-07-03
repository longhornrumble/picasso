/**
 * settingsHelpers.js — shared logic for the Settings surface (Hairline W3.3).
 *
 * Extracted from StateManagementPanel.jsx's inline closures so the same
 * behavior is reusable without duplicating it. StateManagementPanel.jsx
 * itself is left otherwise untouched — HAIRLINE_WORKPLAN.md W3.3 retires
 * only its *rendering* (see ChatWidget.jsx), not the file; full deletion of
 * the now-orphaned component is W6.2. SettingsView.jsx is the only current
 * consumer of this module.
 *
 * Slimmed 2026-07-03 (Chris decision — Settings History + Download rows
 * removed; see SettingsView.jsx header): the history readers/formatters and
 * the export/download helpers were deleted with their only consumer. Only
 * the clear-all helper remains. HISTORY_STORAGE_KEY is retained so clear-all
 * keeps purging anything old builds may have written under it.
 */

import { _storeRemove } from '../../context/shared/messageHelpers';

const HISTORY_STORAGE_KEY = 'picasso_conversations';
const CURRENT_CONVERSATION_KEY = 'picasso_current_conversation';

/**
 * Clears locally-stored conversation history. Does NOT touch the active
 * conversation's messages — that's the ChatProvider's clearMessages(),
 * called separately (and which already emits the SESSION_CLEARED
 * analytics/audit event — see StreamingChatProvider.jsx / HTTPChatProvider.jsx).
 */
export function clearStoredConversationHistory() {
  localStorage.removeItem(HISTORY_STORAGE_KEY);
  _storeRemove(CURRENT_CONVERSATION_KEY);
}

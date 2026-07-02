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
 * FROZEN (HAIRLINE_WORKPLAN.md ground rule #2): every function below
 * reproduces its StateManagementPanel.jsx predecessor's exact computation,
 * including the pre-existing `tenantHashDisplay` quirk callers pass in (see
 * SettingsView.jsx) — this file only relocates logic, it doesn't change it.
 * Pure/near-pure functions only — no React, no hooks; callers pass in
 * whatever state (messages, conversationMetadata, etc.) each function needs.
 */

import { _storeRemove } from '../../context/shared/messageHelpers';

const HISTORY_STORAGE_KEY = 'picasso_conversations';
const CURRENT_CONVERSATION_KEY = 'picasso_current_conversation';

/**
 * Reads up to `limit` past conversations from localStorage. Returns []
 * on missing/invalid data (never throws) — same tolerance as the
 * pre-Hairline panel's loadConversationHistory.
 */
export function loadStoredConversationHistory(limit = 10) {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!stored) return [];
    const conversations = JSON.parse(stored);
    if (!Array.isArray(conversations)) return [];
    return conversations.slice(0, limit);
  } catch {
    return [];
  }
}

/** Same date formatting as the pre-Hairline panel's formatDate. */
export function formatConversationDate(dateString) {
  if (!dateString) return 'Unknown date';
  try {
    return new Date(dateString).toLocaleDateString();
  } catch {
    return 'Invalid date';
  }
}

/** Same duration formatting as the pre-Hairline panel's formatDuration. */
export function formatConversationDuration(conversation) {
  if (!conversation?.messages || conversation.messages.length < 2) {
    return 'Single message';
  }

  const first = conversation.messages[0];
  const last = conversation.messages[conversation.messages.length - 1];

  if (first.timestamp && last.timestamp) {
    const duration = new Date(last.timestamp) - new Date(first.timestamp);
    const minutes = Math.round(duration / 60000);
    return minutes > 0 ? `${minutes} min` : 'Less than a minute';
  }

  return 'Unknown duration';
}

/**
 * Builds the same export payload shape StateManagementPanel.jsx has always
 * produced — conversation metadata + stats only, message content is never
 * included (privacy: see docs/roadmap/PII-Project). `tenantHashDisplay` is
 * a pre-formatted string the caller computes exactly as the old panel did
 * (environmentConfig.getTenantHashFromURL()?.slice(0, 8) + '...') — kept as
 * an opaque param here so this module doesn't need to know about that
 * call's pre-existing quirk (it resolves to the literal string
 * "undefined..." when the tenant loads via `data-tenant` rather than a URL
 * param, which is the common case — a pre-existing latent bug, not
 * something introduced or fixed by this extraction).
 */
export function buildConversationExportPayload({
  tenantHashDisplay,
  messages = [],
  conversationMetadata = {},
  conversationHistory = [],
}) {
  return {
    tenant_hash: tenantHashDisplay,
    export_date: new Date().toISOString(),
    current_conversation: {
      id: conversationMetadata.conversationId,
      message_count: messages.length,
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        timestamp: msg.timestamp,
        content_length: msg.content ? msg.content.length : 0,
        // Note: Not exporting actual content for privacy
      })),
    },
    conversation_history: conversationHistory.map((conv) => ({
      id: conv.conversationId,
      created: conv.metadata?.created,
      message_count: conv.messages?.length || 0,
      summary: conv.metadata?.lastSummary?.slice(0, 100) || 'No summary',
    })),
  };
}

/**
 * Triggers a client-side JSON file download. Side-effecting DOM helper,
 * factored out so it's mockable in tests (URL.createObjectURL).
 */
export function triggerJSONDownload(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

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

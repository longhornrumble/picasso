/**
 * Shared Message Helpers
 * 
 * Common utilities used by both HTTP and Streaming providers
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked for consistent markdown processing
marked.setOptions({
  gfm: true,
  breaks: true,
  mangle: false,
  headerIds: false,
  pedantic: false,
  smartypants: false,
  sanitize: false
});

/**
 * Generate a unique message ID
 */
export const generateMessageId = (prefix = 'msg') => {
  return `${prefix}_${Date.now()}_${Math.random()}`;
};

/**
 * Sanitize and process markdown content
 * Used by both HTTP and Streaming providers to ensure consistent output
 */
export const processMessageContent = (rawContent) => {
  if (!rawContent) return '';
  
  try {
    // Convert markdown to HTML
    const html = marked.parse(rawContent);
    
    // Sanitize the HTML
    const safeHtml = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'strike', 'del', 's',
        'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
      ],
      ALLOWED_ATTR: [
        'href', 'title', 'target', 'rel', 'alt', 'src',
        'width', 'height', 'class', 'start'
      ],
      ADD_ATTR: ['target', 'rel'],
      ALLOW_DATA_ATTR: false
    });
    
    // Use target="_top" to break out of iframe and open in parent page
    const finalHtml = safeHtml.replace(
      /<a\s+([^>]*href=["'](?:https?:|mailto:|tel:)[^"']+["'][^>]*)>/gi,
      (match, attrs) => {
        // Remove existing target and add target="_top" for iframe breakout
        const cleanedAttrs = attrs.replace(/\s*target=["'][^"']*["']\s*/gi, '');
        // Add target="_top" and rel for security
        if (!/rel=/i.test(cleanedAttrs)) {
          return `<a ${cleanedAttrs} target="_top" rel="noopener noreferrer">`;
        }
        return `<a ${cleanedAttrs} target="_top">`;
      }
    );
    
    // IMPORTANT: Wrap in streaming-formatted div for consistent CSS
    // This ensures both HTTP and Streaming paths get the same styling
    return `<div class="streaming-formatted">${finalHtml}</div>`;
    
  } catch (error) {
    console.error('Error processing message content:', error);
    // Fallback: sanitize as plain text
    const escaped = DOMPurify.sanitize(rawContent, { 
      ALLOWED_TAGS: [], 
      ALLOWED_ATTR: [], 
      KEEP_CONTENT: true 
    });
    return `<div class="streaming-formatted"><p>${escaped}</p></div>`;
  }
};

/**
 * Create a user message object
 */
export const createUserMessage = (content) => ({
  id: generateMessageId('user'),
  role: 'user',
  content: processMessageContent(content),
  timestamp: Date.now(),
  metadata: {},
  ctaButtons: [], // Always initialize CTA buttons array
  cards: [] // Always initialize cards array
});

/**
 * Create an assistant message object
 */
export const createAssistantMessage = (content, metadata = {}) => {
  const message = {
    id: metadata.id || generateMessageId('bot'),
    role: 'assistant',
    content: processMessageContent(content),
    timestamp: Date.now(),
    metadata: { ...metadata },
    ctaButtons: [], // Always initialize CTA buttons array
    cards: [] // Always initialize cards array
  };

  // Add actions if provided
  if (metadata.actions && metadata.actions.length > 0) {
    message.actions = metadata.actions;
    delete message.metadata.actions; // Don't duplicate in metadata
  }

  // Add CTAs if provided
  if (metadata.ctaButtons && metadata.ctaButtons.length > 0) {
    message.ctaButtons = metadata.ctaButtons;
    delete message.metadata.ctaButtons; // Don't duplicate in metadata
  }

  // Add cards if provided
  if (metadata.cards && metadata.cards.length > 0) {
    message.cards = metadata.cards;
    delete message.metadata.cards; // Don't duplicate in metadata
  }

  return message;
};

/**
 * Create an error message object
 */
export const createErrorMessage = (error, canRetry = true) => ({
  id: generateMessageId('error'),
  role: 'error',
  content: `<div class="streaming-formatted error-message">${error}</div>`,
  timestamp: Date.now(),
  metadata: {
    error: true,
    canRetry
  }
});

/**
 * Extract tenant hash from various sources
 */
export const getTenantHash = () => {
  // Priority 1: URL parameter (check both 't' and 'tenant')
  const urlParams = new URLSearchParams(window.location.search);
  const urlTenant = urlParams.get('t') || urlParams.get('tenant');
  if (urlTenant) return urlTenant;

  // Priority 2: Script tag data attribute
  const scriptTag = document.querySelector('script[data-tenant]');
  if (scriptTag) return scriptTag.getAttribute('data-tenant');

  // Priority 3: Window config
  if (window.PicassoConfig?.tenantHash) return window.PicassoConfig.tenantHash;

  // Priority 4: Environment default
  return process.env.REACT_APP_DEFAULT_TENANT_HASH || 'my87674d777bf9';
};

/**
 * Session storage helpers with expiration.
 * Falls back to an in-memory Map when sessionStorage is unavailable
 * (e.g. inside a sandboxed iframe without allow-same-origin).
 */
const SESSION_EXPIRY = 30 * 60 * 1000; // 30 minutes

// In-memory fallback when sessionStorage is inaccessible
const _memoryStore = new Map();

const _hasSessionStorage = (() => {
  try {
    const key = '__picasso_ss_test__';
    sessionStorage.setItem(key, '1');
    sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
})();

const _storeGet = (key) => {
  if (_hasSessionStorage) return sessionStorage.getItem(key);
  return _memoryStore.get(key) ?? null;
};

const _storeSet = (key, value) => {
  if (_hasSessionStorage) { sessionStorage.setItem(key, value); return; }
  _memoryStore.set(key, value);
};

const _storeRemove = (key) => {
  if (_hasSessionStorage) { sessionStorage.removeItem(key); return; }
  _memoryStore.delete(key);
};

const _storeKeys = () => {
  if (_hasSessionStorage) return Object.keys(sessionStorage);
  return Array.from(_memoryStore.keys());
};

export const saveToSession = (key, value) => {
  try {
    const data = {
      value,
      timestamp: Date.now()
    };
    _storeSet(key, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to save to session storage:', error);
  }
};

export const getFromSession = (key) => {
  try {
    const item = _storeGet(key);
    if (!item) return null;

    const data = JSON.parse(item);

    // Validate that we have the expected structure
    if (typeof data !== 'object' || !data.hasOwnProperty('timestamp') || !data.hasOwnProperty('value')) {
      // Invalid structure - clean up and return null
      console.warn(`[getFromSession] Invalid data structure for key "${key}" - cleaning up`);
      _storeRemove(key);
      return null;
    }

    // Debug logging for messages specifically
    if (key === 'picasso_messages' && data.value) {
      console.log('[getFromSession] Retrieved messages:', {
        messageCount: data.value.length,
        lastMessage: data.value[data.value.length - 1],
        lastMessageCtas: data.value[data.value.length - 1]?.ctaButtons,
        lastMessageCtasLength: data.value[data.value.length - 1]?.ctaButtons?.length
      });
    }

    const age = Date.now() - data.timestamp;

    if (age > SESSION_EXPIRY) {
      _storeRemove(key);
      return null;
    }

    return data.value;
  } catch (error) {
    // JSON parse error or other issue - clean up the corrupted data
    console.warn(`[getFromSession] Failed to read from session storage for key "${key}":`, error.message);
    try {
      _storeRemove(key);
    } catch (removeError) {
      // Silently fail if we can't remove
    }
    return null;
  }
};

export const clearSession = () => {
  try {
    const keysToKeep = ['picasso_config_cache']; // Keep config cache
    const allKeys = _storeKeys();

    allKeys.forEach(key => {
      if (key.startsWith('picasso_') && !keysToKeep.includes(key)) {
        _storeRemove(key);
      }
    });
  } catch (error) {
    console.warn('Failed to clear session storage:', error);
  }
};

/**
 * Trim conversation history for the request payload sent to the backend.
 *
 * Keeps every user message (these carry conversation memory — name, intent,
 * facts) but only the last `maxAssistant` assistant responses. This mirrors the
 * backend prompt builders (BSH prompt_v4.js + Master_Function), which already
 * keep all user turns and only the last ~2 assistant turns, so answer quality is
 * unchanged while the POST body stays under the 8KB WAF SizeRestrictions_BODY
 * limit. The on-screen transcript (picasso_messages) is independent and unaffected.
 *
 * Order is preserved. Non-user/non-assistant entries are dropped.
 */
export const trimHistoryForSend = (messages, { maxUserTurns = 20, maxAssistant = 2 } = {}) => {
  if (!Array.isArray(messages) || messages.length === 0) return messages || [];
  const keepAssistant = new Set();
  for (let i = messages.length - 1, n = 0; i >= 0 && n < maxAssistant; i--) {
    if (messages[i]?.role === 'assistant') { keepAssistant.add(i); n++; }
  }
  const userIdx = messages.map((m, i) => (m?.role === 'user' ? i : -1)).filter(i => i >= 0);
  const keepUser = new Set(userIdx.slice(-maxUserTurns));
  return messages.filter((_, i) => keepUser.has(i) || keepAssistant.has(i));
};

/**
 * Merge incoming scheduling slots into a message's existing schedulingSlots.
 *
 * Multi-day fix (companion to lambda fix/agent-multiday-slots): an agent turn
 * emits one `scheduling_slots` SSE event PER dated lookup ("Monday or Tuesday?"
 * → two events on the same streaming message). Replacing metadata.schedulingSlots
 * left only the LAST event's chips rendered. Merge instead: append new slots
 * after the existing ones (order preserved — mirrors the backend's §B16b union
 * order), dedupe by slotId (first occurrence wins), cap at 10 (the backend
 * persists the same cap, so every rendered chip stays stageable).
 *
 * @param {Array} existing - the message's current metadata.schedulingSlots (may be absent)
 * @param {Array} incoming - slots from the new scheduling_slots event
 * @returns {Array} merged slots (≤ 10)
 */
export const mergeSchedulingSlots = (existing, incoming) => {
  const base = Array.isArray(existing) ? existing : [];
  const seen = new Set(base.map(s => s?.slotId));
  const merged = [...base];
  for (const s of (Array.isArray(incoming) ? incoming : [])) {
    if (!s?.slotId || seen.has(s.slotId)) continue;
    seen.add(s.slotId);
    merged.push(s);
  }
  return merged.slice(0, 10);
};

// Export storage helpers for direct callers that bypass saveToSession/getFromSession
export { _storeGet, _storeSet, _storeRemove, _storeKeys };
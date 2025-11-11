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
    
    // Add target="_blank" to links
    const finalHtml = safeHtml.replace(
      /<a\s+([^>]*href=["'](?:https?:|mailto:|tel:)[^"']+["'][^>]*)>/gi,
      (match, attrs) => {
        if (!/target=/i.test(attrs)) {
          return `<a ${attrs} target="_blank" rel="noopener noreferrer">`;
        }
        return match;
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
 * Session storage helpers with expiration
 */
const SESSION_EXPIRY = 30 * 60 * 1000; // 30 minutes

export const saveToSession = (key, value) => {
  try {
    const data = {
      value,
      timestamp: Date.now()
    };
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to save to session storage:', error);
  }
};

export const getFromSession = (key) => {
  try {
    const item = sessionStorage.getItem(key);
    if (!item) return null;

    const data = JSON.parse(item);

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
      sessionStorage.removeItem(key);
      return null;
    }

    return data.value;
  } catch (error) {
    console.warn('Failed to read from session storage:', error);
    return null;
  }
};

export const clearSession = () => {
  try {
    const keysToKeep = ['picasso_config_cache']; // Keep config cache
    const allKeys = Object.keys(sessionStorage);
    
    allKeys.forEach(key => {
      if (key.startsWith('picasso_') && !keysToKeep.includes(key)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('Failed to clear session storage:', error);
  }
};
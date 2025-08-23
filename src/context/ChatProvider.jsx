import React, { createContext, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useConfig } from "../hooks/useConfig";
import { config as environmentConfig } from '../config/environment';
import PropTypes from "prop-types";
import { 
  errorLogger, 
  performanceMonitor, 
  classifyError, 
  shouldRetry, 
  getBackoffDelay, 
  getUserFriendlyMessage,
  ERROR_TYPES 
} from "../utils/errorHandling";
import { createConversationManager } from "../utils/conversationManager";
import { initializeMobileCompatibility } from "../utils/mobileCompatibility";
import { createLogger } from "../utils/logger";
import { marked } from 'marked';
import DOMPurify from 'dompurify';
// --- Compact Marked renderer to prevent blocky reflow on post-render ---
// Create a proper marked.Renderer instance for v14 compatibility
const compactRenderer = new marked.Renderer();

// Override paragraph rendering - in v14, receives token object
compactRenderer.paragraph = function(token) {
  // Extract the text from the token
  const text = typeof token === 'string' ? token : (token?.text || '');
  // Don't add any custom classes - let theme.css handle it
  return `<p>${text}</p>`;
};

// Override list rendering - receives token object in v14
compactRenderer.list = function(token) {
  // Extract properties from the token
  if (typeof token === 'string') {
    // Fallback for string input
    return `<ul>${token}</ul>`;
  }
  
  const ordered = token.ordered || false;
  const start = token.start || 1;
  const items = token.items || [];
  
  // Render each list item by recursively parsing its tokens
  const renderedItems = items.map(item => {
    // Each item has tokens that need to be rendered recursively
    // Use marked's parser to render the item's tokens
    let itemContent = '';
    if (item.tokens && Array.isArray(item.tokens)) {
      // Parse the tokens within this list item
      itemContent = marked.parser(item.tokens);
      // Remove wrapping <p> tags if present (for tight lists)
      itemContent = itemContent.replace(/^<p[^>]*>|<\/p>$/g, '');
    } else {
      // Fallback to text
      itemContent = item.text || item.raw || '';
    }
    // Trim whitespace
    itemContent = itemContent.trim();
    return `<li>${itemContent}</li>`;
  }).join('');
  
  const tag = ordered ? 'ol' : 'ul';
  const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
  return `<${tag}${startAttr}>${renderedItems}</${tag}>`;
};

// Override list item rendering - receives token object
compactRenderer.listitem = function(token) {
  // Extract the text from the token
  const text = typeof token === 'string' ? token : (token?.text || token?.raw || '');
  // Collapse internal newlines to prevent phantom spacing
  const collapsed = String(text).replace(/\s*\n+\s*/g, ' ').trim();
  return `<li>${collapsed}</li>`;
};

// Override heading rendering - receives token object
compactRenderer.heading = function(token) {
  // Extract text and level from token
  if (typeof token === 'string') {
    // Fallback for string with level as second parameter
    return `<h1>${token}</h1>`;
  }
  const text = token.text || token.raw || '';
  const level = token.depth || 1;
  return `<h${level}>${text}</h${level}>`;
};

// Configure marked globally with the renderer instance
marked.setOptions({
  gfm: true,              // GitHub Flavored Markdown (tables, strikethrough, etc.)
  breaks: false,          // IMPORTANT: avoid automatic <br> that inflate spacing
  smartLists: true,       // Use proper list indentation
  sanitize: false,        // We sanitize with DOMPurify separately
  mangle: false,          // Don't obfuscate email addresses
  renderer: compactRenderer
});

// Utility: tighten HTML emitted by marked before sanitization
function tightenHtml(html) {
  return html
    // remove totally empty paragraphs
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/<p>(?:\s*<br\s*\/?>(\s|&nbsp;)*)*<\/p>/gi, '')
    // collapse stacks of <br> to a single break
    .replace(/(?:<br\s*\/?>(\s|&nbsp;)*){2,}/gi, '<br/>')
    // trim whitespace around list boundaries to avoid extra line boxes
    .replace(/\s*(<\/?:?li>|<\/?ul>|<\/?ol>)\s*/gi, '$1');
}
import { streamingRegistry } from '../utils/streamingRegistry';

/**
 * Streaming function that handles both SSE and NDJSON formats
 * Supports both GET (for true SSE) and POST (recommended for Lambda)
 * Includes abort controller support for cancellation
 * 
 * BACKEND REQUIREMENTS FOR PROPER STREAMING:
 * 1. Response headers must include:
 *    - Transfer-Encoding: chunked (or proper SSE headers)
 *    - Cache-Control: no-cache, no-store
 *    - Content-Type: text/event-stream (for SSE)
 *    - X-Accel-Buffering: no (for nginx)
 * 2. Backend must flush after each chunk (not buffer until complete)
 * 3. For Lambda: Use response streaming with iterative writes
 * 4. Service Worker must bypass streaming routes (no caching/cloning)
 * 5. CDN/Proxy must not buffer (CloudFront: response timeout > 30s)
 * 
 * CLIENT-SIDE OPTIMIZATIONS (already implemented):
 * - Cache-Control: no-store in request headers
 * - Service Worker bypass for streaming URLs
 * - Imperative DOM updates via StreamingRegistry
 * - TextDecoder with streaming flag for proper UTF-8 handling
 */
async function streamChat({
  url,
  headers,
  body,
  streamingMessageId,
  onStart,
  onChunk,
  onDone,
  onError,
  abortControllersRef,
  method = 'POST',
}) {
  console.log('🚀 streamChat called with:', {
    url,
    method,
    body,
    streamingMessageId
  });

  // Function-scoped trackers to coordinate error handling and finalization
  let watchdogId = null;
  let gotFirstEmitGlobal = false;
  let totalTextGlobal = '';
  
  // Always start the UI streaming immediately
  onStart?.();

  const controller = new AbortController();
  if (abortControllersRef && streamingMessageId) {
    abortControllersRef.current.set(streamingMessageId, controller);
  }

  // Set a 25-second timeout for the entire streaming operation
  const streamTimeout = setTimeout(() => {
    console.log('⏱️ Streaming timeout (25s) - aborting');
    controller.abort();
  }, 25000);

  try {
    const fetchOptions = {
      method,
      headers: { ...headers },
      signal: controller.signal,
    };

    let fetchUrl = url;
    if (method === 'POST') {
      fetchOptions.body = JSON.stringify({ ...body, stream: true });
    } else {
      // GET: append minimal params and stream flag
      const u = new URL(url, window.location.origin);
      if (body?.tenant_hash) u.searchParams.set('t', body.tenant_hash);
      if (body?.session_id) u.searchParams.set('session_id', body.session_id);
      if (body?.user_input) u.searchParams.set('message', body.user_input);
      if (body?.messageId) u.searchParams.set('message_id', body.messageId);
      u.searchParams.set('stream', 'true');
      fetchUrl = u.toString();
    }

    const res = await fetch(fetchUrl, fetchOptions);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText} ${txt || ''}`.trim());
    }

    // Decide streaming mode by headers ONLY to avoid blocking the stream.
    const contentType = (res.headers.get('content-type') || '').toLowerCase();

    console.log('🌊 Streaming response received:', {
      url: fetchUrl,
      status: res.status,
      contentType,
      headers: Object.fromEntries(res.headers.entries())
    });

    // If Lambda returned JSON, treat as buffered (SSE-in-JSON) and unwrap once.
    if (contentType.includes('application/json')) {
      let jsonResponse = null;
      try {
        jsonResponse = await res.json();
      } catch (e) {
        throw new Error('Expected JSON from streaming endpoint but could not parse it.');
      }

      // Function URL "buffered SSE" case: { statusCode, headers, body: "data: {...}\n..." }
      if (jsonResponse && jsonResponse.body) {
        const sseContent = jsonResponse.body;
        console.log('📝 Processing buffered SSE content (JSON-wrapped):', {
          contentLength: sseContent.length,
          preview: sseContent.substring(0, 100)
        });

        const lines = sseContent.split('\n');
        let totalText = '';
        totalTextGlobal = '';
        gotFirstEmitGlobal = false;

        for (const line of lines) {
          if (!line) continue;
          if (line.startsWith(':')) continue; // SSE comment
          if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim();
            if (!dataStr || dataStr === '[DONE]') continue;

            // Try JSON payloads first, then fall back to raw text.
            let piece = '';
            try {
              const obj = JSON.parse(dataStr);
              // Prefer common streaming fields
              piece = obj.content ?? obj.text ?? obj.delta ?? '';
              // If delta is an object, extract its text/content
              if (typeof piece === 'object' && piece !== null) {
                piece = piece.content ?? piece.text ?? '';
              }
              // OpenAI/Claude style chunk: choices[0].delta.content
              if (!piece && obj?.choices?.[0]?.delta?.content) {
                piece = obj.choices[0].delta.content;
              }
              // Some providers use `message` for the text
              if (!piece && typeof obj.message === 'string') {
                piece = obj.message;
              }
              // Fallback to stringifying only if still not a string
              if (typeof piece !== 'string') {
                piece = '';
              }
            } catch {
              piece = dataStr;
            }

            if (piece) {
              totalText += piece;
              totalTextGlobal = totalText;
              if (!gotFirstEmitGlobal) gotFirstEmitGlobal = true;
              onChunk?.(piece, totalText);
            }
          }
        }

        if (watchdogId) clearTimeout(watchdogId);
        clearTimeout(streamTimeout);
        onDone?.(totalText || 'I apologize, but I did not receive a proper response.');
        return totalText;
      }

      // Plain JSON fallback (non-SSE)
      const plain = jsonResponse?.content || jsonResponse?.message || '';
      if (plain) {
        totalTextGlobal = plain;
        gotFirstEmitGlobal = true;
        onChunk?.(plain, plain);
        onDone?.(plain);
        return plain;
      }

      throw new Error('Unexpected JSON shape from streaming endpoint.');
    }

    if (!res.body || typeof res.body.getReader !== 'function') {
      throw new Error('No readable stream on response');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let buffer = '';
    // Use the function-scoped tally so catch/finally can act on it
    totalTextGlobal = '';
    gotFirstEmitGlobal = false;

    // Watchdog: if no real emission within 7500ms, abort so caller can fallback
    // Increased from 1500ms to account for Lambda cold starts and network latency
    watchdogId = setTimeout(() => {
      if (!gotFirstEmitGlobal) {
        console.log('⏱️ No first chunk received within 7.5s - aborting stream');
        controller.abort();
      }
    }, 7500);

    // Helper: emit text (handles SSE `data:` or raw lines)
    const emitLines = (str) => {
      const lines = str.split('\n');
      for (let raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith(':')) continue; // SSE comment
        let payload = line;
        if (line.startsWith('data:')) payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let text = '';
        try {
          const obj = JSON.parse(payload);
          // Prefer common streaming fields first
          text = obj.content ?? obj.text ?? obj.delta ?? '';
          // If delta is an object, drill into it
          if (typeof text === 'object' && text !== null) {
            text = text.content ?? text.text ?? '';
          }
          // OpenAI/Claude chunk support
          if (!text && obj?.choices?.[0]?.delta?.content) {
            text = obj.choices[0].delta.content;
          }
          // Some providers use `message`
          if (!text && typeof obj.message === 'string') {
            text = obj.message;
          }
          if (typeof text !== 'string') {
            text = '';
          }
        } catch {
          text = payload;
        }
        if (text) {
          totalTextGlobal += text;
          if (!gotFirstEmitGlobal) { gotFirstEmitGlobal = true; if (watchdogId) clearTimeout(watchdogId); }
          onChunk?.(text, totalTextGlobal);
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines to minimize DOM churn
      const lastNL = buffer.lastIndexOf('\n');
      if (lastNL >= 0) {
        const complete = buffer.slice(0, lastNL + 1);
        buffer = buffer.slice(lastNL + 1);
        emitLines(complete);
      }
    }

    // Flush remainder
    buffer += decoder.decode();
    if (buffer) emitLines(buffer);

    if (watchdogId) clearTimeout(watchdogId);
    clearTimeout(streamTimeout);
    onDone?.(totalTextGlobal);
    return totalTextGlobal;
  } catch (error) {
    clearTimeout(streamTimeout);
    if (watchdogId) clearTimeout(watchdogId);
    // If we already emitted at least one chunk, finalize with what we have instead of throwing
    if (gotFirstEmitGlobal && totalTextGlobal) {
      try { onDone?.(totalTextGlobal); } catch {}
      return totalTextGlobal;
    }
    onError?.(error);
    throw error; // Let caller decide fallback (only before first chunk)
  } finally {
    clearTimeout(streamTimeout);
    if (watchdogId) clearTimeout(watchdogId);
    if (abortControllersRef && streamingMessageId) {
      abortControllersRef.current.delete(streamingMessageId);
    }
  }
}

const logger = createLogger('ChatProvider');

// marked configuration is set above with compactRenderer

// Custom extension to auto-link URLs and emails
marked.use({
  extensions: [{
    name: 'autolink',
    level: 'inline',
    start(src) {
      const match = src.match(/https?:\/\/|www\.|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      return match ? match.index : -1;
    },
    tokenizer(src) {
      const urlRegex = /^(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/;
      const wwwRegex = /^(www\.[^\s<]+[^<.,:;"')\]\s])/;
      const emailRegex = /^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
      
      let match;
      if (match = urlRegex.exec(src)) {
        return {
          type: 'autolink',
          raw: match[0],
          href: match[1],
          text: match[1]
        };
      } else if (match = wwwRegex.exec(src)) {
        return {
          type: 'autolink', 
          raw: match[0],
          href: 'http://' + match[1],
          text: match[1]
        };
      } else if (match = emailRegex.exec(src)) {
        return {
          type: 'autolink',
          raw: match[0], 
          href: 'mailto:' + match[1],
          text: match[1]
        };
      }
      return false;
    },
    renderer(token) {
      // Check if URL is external
      const isExternal = (() => {
        if (!token.href) return false;
        if (token.href.startsWith('mailto:')) return true;
        
        try {
          const linkUrl = new URL(token.href, window.location.href);
          const currentUrl = new URL(window.location.href);
          return linkUrl.origin !== currentUrl.origin;
        } catch (e) {
          return true; // Treat as external if parsing fails
        }
      })();
      
      const targetAttr = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${token.href}"${targetAttr}>${token.text}</a>`;
    }
  }]
});

// Streaming utilities are now imported statically at the top for esbuild compatibility
// They will only be used when streaming is enabled


async function sanitizeMessage(content) {
  if (!content || typeof content !== 'string') {
    return '';
  }

  logger.debug('sanitizeMessage - Input content:', content);

  try {
    // marked and DOMPurify are now statically imported at the top
    const rawHtml = marked.parse(content);
    logger.debug('After marked.parse:', rawHtml);

    const tightened = tightenHtml(rawHtml);

    const cleanHtml = DOMPurify.sanitize(tightened, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'strike', 'del', 's',
        'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
      ],
      ALLOWED_ATTR: [
        'href', 'title', 'target', 'rel', 'alt', 'src',
        'width', 'height', 'class'  // Removed 'style' attribute for security
      ],
      // Additional security: Only allow safe CSS properties if we re-enable style later
      ALLOWED_STYLE_PROPS: [],  // Empty = no inline styles allowed
      // Prevent data: URIs except for images (and even then, be careful)
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      // Don't force attributes - we'll handle them properly below
      // ADD_ATTR: ['target', 'rel'], // Removed to avoid duplicates
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
      FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button'],
      KEEP_CONTENT: true,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      RETURN_TRUSTED_TYPE: false
    });

    // Process links to add target="_blank" only for external URLs (if not already present)
    const finalHtml = cleanHtml.replace(
      /<a\s+([^>]*href="([^"]+)"[^>]*)>/gi,
      (match, attrs, url) => {
        // Skip if already has target attribute
        if (attrs.includes('target=')) {
          return match;
        }

        // Check if URL is external
        const isExternal = (() => {
          if (!url) return false;
          if (url.startsWith('mailto:')) return true;

          try {
            const linkUrl = new URL(url, window.location.href);
            const currentUrl = new URL(window.location.href);
            return linkUrl.origin !== currentUrl.origin;
          } catch (e) {
            return true; // Treat as external if parsing fails
          }
        })();

        if (isExternal) {
          // Add target and rel only if not present
          const hasRel = attrs.includes('rel=');
          const relAttr = hasRel ? '' : ' rel="noopener noreferrer"';
          return `<a ${attrs} target="_blank"${relAttr}>`;
        }
        return match;
      }
    );

    logger.debug('After DOMPurify.sanitize:', finalHtml);
    return finalHtml;
  } catch (error) {
    // In case of a markdown parsing error, fall back to basic sanitization.
    // This ensures we never return raw, potentially unsafe content.
    // DOMPurify is now statically imported at the top
    errorLogger.logError(error, { context: 'sanitizeMessage' });
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false
    });
  }
}

// --- ADD NEAR OTHER UTILS ---
// Cache the streaming decision for the session to prevent flipping
let streamingEnabledForSession = null;

const shouldUseStreaming = (tenantConfig, _tenantHash) => {
  // If we've already decided for this session, stick with it
  if (streamingEnabledForSession !== null) {
    return streamingEnabledForSession;
  }
  
  // Simple and direct: Check streaming_enabled flag
  if (tenantConfig?.features?.streaming_enabled === true) {
    streamingEnabledForSession = true;
    return true;
  }
  
  // If streaming_enabled is explicitly false, respect that
  if (tenantConfig?.features?.streaming_enabled === false) {
    streamingEnabledForSession = false;
    return false;
  }
  
  // Default to true if streaming_enabled is not set
  streamingEnabledForSession = true;
  return true;
};

const ChatContext = createContext();

export const getChatContext = () => ChatContext;

const ChatProvider = ({ children }) => {
  const { config: tenantConfig } = useConfig();
  
  // Session persistence constants
  const STORAGE_KEYS = {
    MESSAGES: 'picasso_messages',
    SESSION_ID: 'picasso_session_id',
    LAST_ACTIVITY: 'picasso_last_activity'
  };
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  
  // Initialize refs early to avoid "before initialization" errors
  const conversationManagerRef = useRef(null);
  
  // 🔧 FIX: Enhanced session validation and memory purge
  const validateAndPurgeSession = () => {
    const stored = sessionStorage.getItem(STORAGE_KEYS.SESSION_ID);
    const lastActivity = sessionStorage.getItem(STORAGE_KEYS.LAST_ACTIVITY);
    
    // Check if session is still valid (within timeout)
    if (stored && lastActivity) {
      const timeSinceActivity = Date.now() - parseInt(lastActivity);
      if (timeSinceActivity < SESSION_TIMEOUT) {
        // Session is valid, update activity and continue using it
        sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());
        // Session is valid - log less frequently to reduce console spam
        return stored;
      } else {
        // Session expired, perform memory purge
        logger.debug('Session validation: Session expired, performing memory purge');
        performMemoryPurge();
      }
    }
    
    // Create new session after purge or if no session exists
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    sessionStorage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId);
    sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());
    logger.debug('Session validation: Created new session', newSessionId.slice(0, 12) + '...');
    return newSessionId;
  };

  // Memory purge mechanism for expired sessions
  const performMemoryPurge = () => {
    logger.debug('Performing comprehensive memory purge for new session');
    
    try {
      // Clear all session storage related to conversation state
      const keysToRemove = [
        STORAGE_KEYS.SESSION_ID,
        STORAGE_KEYS.MESSAGES, 
        STORAGE_KEYS.LAST_ACTIVITY,
        'picasso_conversation_id',
        'picasso_state_token',
        'picasso_chat_state',
        'picasso_last_read_index',
        'picasso_scroll_position'
      ];
      
      keysToRemove.forEach(key => {
        if (sessionStorage.getItem(key)) {
          sessionStorage.removeItem(key);
          logger.debug(`Purged session storage key: ${key}`);
        }
      });

      // Clear any conversation manager references (check if ref exists first)
      if (typeof conversationManagerRef !== 'undefined' && conversationManagerRef?.current) {
        logger.debug('Clearing existing conversation manager during purge');
        try {
          conversationManagerRef.current.clearStateToken();
          conversationManagerRef.current = null;
        } catch (error) {
          logger.warn('🧹 Error clearing conversation manager during purge:', error);
          conversationManagerRef.current = null; // Force clear
        }
      }
      
      errorLogger.logInfo('✅ Memory purge completed successfully');
    } catch (error) {
      errorLogger.logError(error, {
        context: 'memory_purge',
        action: 'session_validation'
      });
    }
  };

  // Initialize or retrieve session ID with validation
  const getOrCreateSessionId = () => {
    return validateAndPurgeSession();
  };
  
  const sessionIdRef = useRef(getOrCreateSessionId());
  
  // 🔧 FIX: Session validation on page refresh/reload
  useEffect(() => {
    // Validate session on component mount (page refresh)
    const currentSessionId = sessionIdRef.current;
    const storedSessionId = sessionStorage.getItem(STORAGE_KEYS.SESSION_ID);
    
    if (currentSessionId !== storedSessionId) {
      logger.debug('Session mismatch detected on mount, performing validation');
      const validSessionId = validateAndPurgeSession();
      sessionIdRef.current = validSessionId;
    } else {
      // Update activity timestamp for valid session
      sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());
      logger.debug('Session validated on mount:', currentSessionId.slice(0, 12) + '...');
    }
  }, []); // Run once on mount
  
  // Phase 3.2: Conversation Manager Integration
  // conversationManagerRef is now declared at the top to avoid initialization errors
  const [conversationMetadata, setConversationMetadata] = useState({
    conversationId: null,
    messageCount: 0,
    hasBeenSummarized: false,
    canLoadHistory: false
  });

  // Phase 3.3: Mobile Compatibility & PWA Support
  const mobileCompatibilityRef = useRef(null);
  const [mobileFeatures, setMobileFeatures] = useState({
    isInitialized: false,
    isPWAInstallable: false,
    isOfflineCapable: false,
    isMobileSafari: false
  });
  
  // Load persisted messages
  const loadPersistedMessages = () => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEYS.MESSAGES);
      const lastActivity = sessionStorage.getItem(STORAGE_KEYS.LAST_ACTIVITY);
      
      if (stored && lastActivity) {
        const timeSinceActivity = Date.now() - parseInt(lastActivity);
        if (timeSinceActivity < SESSION_TIMEOUT) {
          const messages = JSON.parse(stored);
          errorLogger.logInfo('📂 Restored conversation from previous page', {
            messageCount: messages.length,
            sessionId: sessionIdRef.current
          });
          return messages;
        }
      }
    } catch (error) {
      errorLogger.logError(error, { context: 'loadPersistedMessages' });
    }
    return [];
  };
  
  // PERFORMANCE: Use lazy initial state to avoid repeated function calls
  const [messages, setMessages] = useState(() => loadPersistedMessages());
  const [isTyping, setIsTyping] = useState(false);
  const [hasInitializedMessages, setHasInitializedMessages] = useState(false);
  
  // Set global flag when messages exist for ConfigProvider to check
  useEffect(() => {
    // Only count user/assistant messages, not system messages or welcome messages
    const hasConversationMessages = messages.some(msg => 
      (msg.role === 'user' || msg.role === 'assistant') && 
      msg.id !== 'welcome' && 
      msg.content && 
      msg.content.trim() !== ''
    );
    window.picassoChatHasMessages = hasConversationMessages;
  }, [messages]);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingRetries, setPendingRetries] = useState(() => new Map());
  
  // HTTP-only chat (streaming removed)
  
  // EventSource code removed - HTTP only
  
  const abortControllersRef = useRef(new Map());
  const retryTimeoutsRef = useRef(new Map());
  // Throttle per-message partial updates to ~1 frame
  const partialUpdateRafRef = useRef(new Map()); // id -> { handle: number|null, latest: string }

  // PERFORMANCE: Debounced message persistence to avoid excessive storage writes
  const debouncedPersistMessages = useRef(
    debounce((messages, hasInitializedMessages) => {
      try {
        // Skip persistence while streaming is active to avoid jank and extra writes
        const streamingActive = Array.isArray(messages) && messages.some(m => m && m.isStreaming === true);
        if (streamingActive) {
          // Lightweight trace; keep this quiet in production if needed
          errorLogger.logInfo('⏸️ Skipping persist — streaming active');
          return;
        }

        if (Array.isArray(messages) && messages.length > 0 && hasInitializedMessages) {
          sessionStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
          sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());
          errorLogger.logInfo('💾 Persisted conversation state', {
            messageCount: messages.length,
            sessionId: sessionIdRef.current
          });
        }
      } catch (error) {
        errorLogger.logError(error, { context: 'persistMessages' });
      }
    }, 1000) // Debounce for 1 second
  ).current;
  
  // Persist messages whenever they change (debounced)
  useEffect(() => {
    debouncedPersistMessages(messages, hasInitializedMessages);
  }, [messages, hasInitializedMessages, debouncedPersistMessages]);
  
  // PERFORMANCE: Simple debounce utility
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // SIMPLIFIED INITIALIZATION - HTTP only
  const [isConversationManagerInitialized, setIsConversationManagerInitialized] = useState(false);
  const [isChatProviderReady, setIsChatProviderReady] = useState(false);
  
  // Debug logging for state changes
  useEffect(() => {
    console.log('🔍 isConversationManagerInitialized changed:', isConversationManagerInitialized);
  }, [isConversationManagerInitialized]);
  
  // Streaming debug logs removed
  
  useEffect(() => {
    console.log('🔍 tenantConfig changed:', { hasTenantConfig: !!tenantConfig, configType: typeof tenantConfig });
  }, [tenantConfig]);
  const initializationLockRef = useRef({
    isInitializing: false,
    initializationPromise: null
  });

  // Phase 3.2: Initialize conversation manager
  useEffect(() => {
    logger.debug('🔍 Conversation manager useEffect triggered:', {
      hasTenantHash: !!tenantConfig?.tenant_hash,
      isConversationManagerInitialized,
      hasExistingManager: !!conversationManagerRef.current
    });
    
    if (!tenantConfig?.tenant_hash) {
      logger.debug('❌ No tenant hash, skipping conversation manager initialization');
      return;
    }
    
    // Check if we already have a valid conversation manager for this session
    if (conversationManagerRef.current) {
      const currentSessionId = sessionIdRef.current;
      const managerSessionId = conversationManagerRef.current.sessionId;
      
      if (managerSessionId === currentSessionId) {
        logger.debug('✅ Valid conversation manager already exists for this session');
        return;
      }
    }
    
    if (isConversationManagerInitialized) {
      logger.debug('❌ Already initialized, skipping conversation manager initialization');
      return; // Prevent re-initialization
    }
    
    const initializeConversationManager = async () => {
      // RACE CONDITION FIX: Check if already initializing
      if (initializationLockRef.current.isInitializing) {
        logger.debug('🔒 Chat initialization already in progress, waiting...');
        return await initializationLockRef.current.initializationPromise;
      }
      
      // Set initialization lock
      initializationLockRef.current.isInitializing = true;
      const initPromise = (async () => {
        try {
          const tenantHash = tenantConfig.tenant_hash;
          const sessionId = sessionIdRef.current;
        
          // 🔧 FIXED: Enhanced duplicate prevention with session validation
          if (conversationManagerRef.current) {
            // Check if existing manager is for the same session
            const existingSession = conversationManagerRef.current.sessionId;
            if (existingSession === sessionId) {
              logger.debug('🔍 Conversation manager already exists for current session, skipping creation');
              return;
            } else {
              logger.debug('🧹 Session mismatch detected, clearing old conversation manager');
              try {
                conversationManagerRef.current.clearStateToken();
                conversationManagerRef.current = null;
              } catch (error) {
                logger.warn('🧹 Error clearing old conversation manager:', error);
                conversationManagerRef.current = null; // Force clear
              }
            }
          }
          
          // 🔧 FIX: Final session validation before creating conversation manager
          const currentStoredSession = sessionStorage.getItem(STORAGE_KEYS.SESSION_ID);
          if (sessionId !== currentStoredSession) {
            logger.debug('🚨 Session ID mismatch during initialization, re-validating');
            const validSessionId = validateAndPurgeSession();
            sessionIdRef.current = validSessionId;
            return; // Exit and let the effect re-run with correct session
          }
          
          // 🔧 FIX: Force clear any existing conversation state that might cause conflicts
          logger.debug('🧹 Performing pre-initialization conversation cleanup');
          try {
            sessionStorage.removeItem('picasso_conversation_id');
            sessionStorage.removeItem('picasso_state_token');
          } catch (e) {
            logger.warn('🧹 Error during conversation cleanup:', e);
          }

          // Create conversation manager
          logger.debug('🔍 Creating conversation manager with:', {
            tenantHash: tenantHash.slice(0, 8) + '...',
            sessionId,
            conversationEndpointAvailable: environmentConfig.CONVERSATION_ENDPOINT_AVAILABLE
          });
          
          conversationManagerRef.current = createConversationManager(tenantHash, sessionId);
          
          logger.debug('🔍 Conversation manager created (initialization happens automatically in constructor)');
          
          // Wait a moment for automatic initialization to complete
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Update conversation metadata
          const metadata = conversationManagerRef.current.getMetadata();
          setConversationMetadata({
            conversationId: conversationManagerRef.current.conversationId,
            messageCount: metadata.messageCount,
            hasBeenSummarized: metadata.hasBeenSummarized,
            canLoadHistory: true
          });
          
          errorLogger.logInfo('✅ Conversation manager initialized', {
            conversationId: conversationManagerRef.current.conversationId,
            tenantHash: tenantHash.slice(0, 8) + '...',
            isInitialized: conversationManagerRef.current.isInitialized,
            hasStateToken: !!conversationManagerRef.current.stateToken
          });

          // Phase 3.3: Initialize mobile compatibility features SEQUENTIALLY
          const mobileCompat = await initializeMobileCompatibility(conversationManagerRef.current);
          if (mobileCompat) {
            mobileCompatibilityRef.current = mobileCompat;
            setMobileFeatures({
              isInitialized: true,
              isPWAInstallable: mobileCompat.pwaInstaller?.deferredPrompt !== null,
              isOfflineCapable: 'serviceWorker' in navigator,
              isMobileSafari: /iPad|iPhone|iPod/.test(navigator.userAgent) && /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
            });
            
            errorLogger.logInfo('✅ Mobile compatibility features initialized', {
              serviceWorker: 'serviceWorker' in navigator,
              pwaInstallable: mobileCompat.pwaInstaller?.deferredPrompt !== null,
              isMobileSafari: /iPad|iPhone|iPod/.test(navigator.userAgent)
            });
          }
          
          // Mark conversation manager initialization as complete
          setIsConversationManagerInitialized(true);
          errorLogger.logInfo('🎉 Conversation Manager initialization completed successfully', {
            tenantHash: tenantHash.slice(0, 8) + '...',
            sessionId: sessionId
          });
          
        } catch (error) {
          errorLogger.logError(error, {
            context: 'conversation_manager_init',
            tenantHash: tenantConfig?.tenant_hash?.slice(0, 8) + '...'
          });
        } finally {
          // Release initialization lock
          initializationLockRef.current.isInitializing = false;
          initializationLockRef.current.initializationPromise = null;
        }
      })();
      
      // Store the promise for concurrent calls
      initializationLockRef.current.initializationPromise = initPromise;
      return await initPromise;
    };
    
    initializeConversationManager();
  }, [tenantConfig?.tenant_hash, isConversationManagerInitialized]);

  // 🔧 FIX: Cleanup conversation manager on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      logger.debug('🧹 ChatProvider unmounting, cleaning up conversation manager');
      if (conversationManagerRef.current) {
        try {
          conversationManagerRef.current.clearStateToken();
          conversationManagerRef.current = null;
        } catch (error) {
          logger.warn('🧹 Error during unmount cleanup:', error);
        }
      }
      
      // Clear initialization lock
      initializationLockRef.current = {
        isInitializing: false,
        initializationPromise: null
      };
    };
  }, []);

  // Network connectivity monitoring
  useEffect(() => {
    const handleOnline = () => {
      errorLogger.logInfo('🌐 Network connection restored');
      setIsOnline(true);
      
      // Retry any pending requests when back online
      pendingRetries.forEach((retryData, messageId) => {
        if (retryData.errorClassification?.type === ERROR_TYPES.NETWORK_ERROR) {
          errorLogger.logInfo(`🔄 Auto-retrying message ${messageId} after network restoration`);
          retryMessage(messageId);
        }
      });
    };
    
    const handleOffline = () => {
      errorLogger.logWarning('📡 Network connection lost');
      setIsOnline(false);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [pendingRetries]);

  // Cleanup on unmount - PERFORMANCE: Also clear token cache
  useEffect(() => {
    return () => {
      // Abort all ongoing requests
      abortControllersRef.current.forEach(controller => {
        controller.abort();
      });
      
      // Clear all retry timeouts
      retryTimeoutsRef.current.forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
      
      abortControllersRef.current.clear();
      retryTimeoutsRef.current.clear();
      
      // PERFORMANCE: Clear all caches to prevent memory leaks
      
      // Clear memory config cache
      if (window._configMemoryCache) {
        delete window._configMemoryCache;
      }
    };
  }, []);

  // PERFORMANCE: Memoize welcome actions to prevent unnecessary recalculation
  const generateWelcomeActions = useMemo(() => {
    return (config) => {
      if (!config) return [];
      
      const actionChipsConfig = config.action_chips || {};
      
      if (!actionChipsConfig.enabled || !actionChipsConfig.show_on_welcome) {
        return [];
      }
      
      const chips = actionChipsConfig.default_chips || [];
      const maxDisplay = actionChipsConfig.max_display || 3;
      
      return chips.slice(0, maxDisplay);
    };
  }, []);

  useEffect(() => {
    // RACE CONDITION FIX: Wait for initialization before setting up messages
    if (tenantConfig && !hasInitializedMessages && isChatProviderReady) {
      // Check if we have persisted messages
      if (messages.length > 0) {
        errorLogger.logInfo('🔄 Continuing previous conversation', {
          messageCount: messages.length,
          sessionId: sessionIdRef.current
        });
        setHasInitializedMessages(true);
      } else {
        errorLogger.logInfo('🎬 Setting initial welcome message');
        const welcomeActions = generateWelcomeActions(tenantConfig);

        // Sanitize welcome message async and wrap with streaming-formatted
        sanitizeMessage(tenantConfig.welcome_message || "Hello! How can I help you today?")
          .then(sanitizedContent => {
            const wrappedContent = sanitizedContent ? `<div class="streaming-formatted">${sanitizedContent}</div>` : sanitizedContent;
            setMessages([{
              id: "welcome",
              role: "assistant",
              content: wrappedContent,
              actions: welcomeActions
            }]);
            setHasInitializedMessages(true);
          });
      }
    }
  }, [tenantConfig, generateWelcomeActions, hasInitializedMessages, isChatProviderReady]);

  const getTenantHash = () => {
    return tenantConfig?.tenant_hash || 
           tenantConfig?.metadata?.tenantHash || 
           window.PicassoConfig?.tenant ||
           environmentConfig.getDefaultTenantHash();
  };

  // Streaming availability check removed - HTTP only


  // Streaming initialization removed - HTTP only

  // Determine overall chat provider readiness - HTTP only
  useEffect(() => {
    console.log('🔍 Chat provider readiness check:', { 
      conversationManager: isConversationManagerInitialized
    });
    setIsChatProviderReady(isConversationManagerInitialized);
  }, [isConversationManagerInitialized]);


  const makeAPIRequest = async (url, options, retries = 3) => {
    const messageId = options.body ? JSON.parse(options.body).messageId : null;
    
    return performanceMonitor.measure('api_request', async () => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // Reduced to 30 seconds for better UX
          
          if (messageId) {
            abortControllersRef.current.set(messageId, controller);
          }
          
          errorLogger.logInfo(`🚀 API Request Attempt ${attempt}/${retries}`, { messageId, url });
          
          const response = await fetch(url, {
            ...options,
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (messageId) {
            abortControllersRef.current.delete(messageId);
          }
          
          if (!response.ok) {
            const errorClassification = classifyError(null, response);
            
            if (shouldRetry(errorClassification, attempt)) {
              const delay = getBackoffDelay(errorClassification, attempt);
              errorLogger.logWarning(`${errorClassification.type} error, retrying in ${delay}ms (attempt ${attempt})`, {
                messageId,
                status: response.status,
                errorClassification
              });
              
              if (messageId) {
                setPendingRetries(prev => new Map(prev.set(messageId, {
                  errorClassification,
                  attempt,
                  retries,
                  url,
                  options
                })));
              }
              
              await new Promise(resolve => {
                const timeoutId = setTimeout(resolve, delay);
                if (messageId) {
                  retryTimeoutsRef.current.set(messageId, timeoutId);
                }
              });
              
              if (messageId) {
                retryTimeoutsRef.current.delete(messageId);
              }
              
              continue; // Retry the loop
            } else {
              // Non-retryable error, throw immediately
              const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
              errorLogger.logError(error, {
                messageId,
                attempt,
                response: { status: response.status, statusText: response.statusText },
                errorClassification
              });
              throw error; // This will be caught by the outer catch block
            }
          }
          
          const rawText = await response.text();
          errorLogger.logInfo('📥 RAW CHAT RESPONSE received', { messageId, responseLength: rawText.length });
          
          let data;
          try {
            data = JSON.parse(rawText);
            errorLogger.logInfo('📥 PARSED CHAT RESPONSE', { messageId, hasContent: !!data.content });
          } catch (e) {
            const parseError = new Error('Invalid JSON response from server');
            errorLogger.logError(parseError, {
              messageId,
              attempt,
              rawText: rawText.substring(0, 200) + '...',
              originalError: e
            });
            throw parseError;
          }
          
          // Clear any pending retries for this message
          if (messageId) {
            setPendingRetries(prev => {
              const newMap = new Map(prev);
              newMap.delete(messageId);
              return newMap;
            });
          }
          
          return data;
          
        } catch (error) {
          const errorClassification = classifyError(error, null);
          
          // Check for timeout specifically
          const isTimeout = error.name === 'AbortError' || error.message?.includes('aborted');
          if (isTimeout) {
            errorLogger.logWarning('Request timeout detected', {
              messageId,
              attempt,
              url
            });
          }
          
          errorLogger.logError(error, {
            messageId,
            attempt,
            url,
            errorClassification,
            tenantHash: getTenantHash(),
            isTimeout
          });
          
          if (shouldRetry(errorClassification, attempt)) {
            const delay = getBackoffDelay(errorClassification, attempt);
            errorLogger.logWarning(`${errorClassification.type} error, retrying in ${delay}ms (attempt ${attempt})`, {
              messageId,
              errorClassification,
              delay
            });
            
            if (messageId) {
              setPendingRetries(prev => new Map(prev.set(messageId, {
                errorClassification,
                attempt,
                retries,
                url,
                options
              })));
            }
            
            await new Promise(resolve => {
              const timeoutId = setTimeout(resolve, delay);
              if (messageId) {
                retryTimeoutsRef.current.set(messageId, timeoutId);
              }
            });
            
            if (messageId) {
              retryTimeoutsRef.current.delete(messageId);
            }
            
            continue; // Retry the loop
          } else {
            // Final failure - throw error with user-friendly message
            let userMessage = getUserFriendlyMessage(errorClassification, attempt);
            
            // Override with specific timeout message if it's a timeout
            if (isTimeout) {
              userMessage = 'Request timed out. Please try again.';
            }
            
            const userError = new Error(userMessage);
            errorLogger.logError(userError, {
              messageId,
              attempt,
              originalError: error,
              errorClassification,
              finalAttempt: true,
              isTimeout
            });
            throw userError;
          }
        }
      }
      
      // If the loop completes without returning, it means we've exceeded retries
      const maxRetriesError = new Error('Maximum retry attempts exceeded');
      errorLogger.logError(maxRetriesError, {
        messageId,
        maxRetries: retries,
        finalAttempt: true
      });
      throw maxRetriesError;
    });
  };

  const retryMessage = useCallback(async (messageId) => {
    const retryData = pendingRetries.get(messageId);
    if (!retryData) {
      errorLogger.logWarning('No retry data found for message', { messageId });
      return;
    }
    
    errorLogger.logInfo(`🔄 Manual retry for message ${messageId}`);
    
    try {
      // The last attempt failed, so we start from the next attempt number.
      // We pass the *remaining* retries to makeAPIRequest.
      const data = await makeAPIRequest(retryData.url, retryData.options, retryData.retries);
      
      // Process successful response
      let botContent = "I apologize, but I'm having trouble processing that request right now.";
      let botActions = [];
      
      try {
        if (data.content) {
          botContent = await sanitizeMessage(data.content);
          
          if (data.actions && Array.isArray(data.actions)) {
            botActions = data.actions;
          }
        }
        else if (data.messages && data.messages[0] && data.messages[0].content) {
          const messageContent = JSON.parse(data.messages[0].content);
          botContent = await sanitizeMessage(messageContent.message || messageContent.content || botContent);
          
          if (messageContent.actions && Array.isArray(messageContent.actions)) {
            botActions = messageContent.actions;
          }
        }
        else if (data.body) {
          const bodyData = JSON.parse(data.body);
          botContent = await sanitizeMessage(bodyData.content || bodyData.message || botContent);
          
          if (bodyData.actions && Array.isArray(bodyData.actions)) {
            botActions = bodyData.actions;
          }
        }
        else if (data.response) {
          botContent = await sanitizeMessage(data.response);
        }
        
        if (data.fallback_message) {
          botContent = await sanitizeMessage(data.fallback_message);
        }
        
        if (data.file_acknowledgment) {
          const sanitizedAck = await sanitizeMessage(data.file_acknowledgment);
          botContent += "\n\n" + sanitizedAck;
        }
        
      } catch (parseError) {
        errorLogger.logError(parseError, {
          messageId,
          context: 'retry_response_parsing',
          data: typeof data === 'string' ? data.substring(0, 200) + '...' : JSON.stringify(data).substring(0, 200) + '...'
        });
        
        // As a fallback, try to sanitize the raw response if it's a string
        if (typeof data === 'string') {
          botContent = await sanitizeMessage(data);
        }
      }
      
      // Replace error message with successful response
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? {
          ...msg,
          role: "assistant",
          content: botContent,
          actions: botActions,
          timestamp: new Date().toISOString(),
          metadata: {
            session_id: data.session_id,
            api_version: data.api_version || 'actions-complete',
            retry_success: true
          }
        } : msg
      ));
      
      errorLogger.logInfo('✅ Retry successful for message', { messageId });
      
    } catch (error) {
      errorLogger.logError(error, {
        messageId,
        context: 'retry_failed',
        retryData: {
          attempt: retryData.attempt,
          errorClassification: retryData.errorClassification
        }
      });
      
      // Update error message with retry failure
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? {
          ...msg,
          content: error.message, // Use the user-friendly message from the thrown error
          metadata: {
            ...msg.metadata,
            retry_failed: true,
            final_error: error.message
          }
        } : msg
      ));
    }
  }, [pendingRetries]);

  const addMessage = useCallback(async (message) => {
    // RACE CONDITION FIX: Prevent API calls until initialization is complete
    if (message.role === "user" && !isChatProviderReady) {
      errorLogger.logWarning('⚠️ Blocking message send - chat not yet initialized', {
        messageContent: message.content?.substring(0, 50) + '...',
        isChatProviderReady
      });
      return;
    }
    
    // Track time to first message
    if (message.role === "user" && messages.filter(m => m.role === "user").length === 0) {
      performanceMonitor.measure('time_to_first_message', () => {
        const loadTime = window.performanceMetrics?.iframeStartTime || 0;
        const firstMessageTime = performance.now() - loadTime;
        
        if (firstMessageTime > 1000) {
          errorLogger.logWarning('Slow time to first message', {
            firstMessageTime,
            threshold: 1000,
            tenantHash: getTenantHash()
          });
        }
        
        errorLogger.logInfo(`⏱️ Time to first message: ${firstMessageTime.toFixed(2)}ms`);
      });
    }
    
    // Sanitize user message content immediately for security.
    const sanitizedUserContent = await sanitizeMessage(message.content);

    const messageWithId = {
      id: message.id || `msg_${Date.now()}_${Math.random()}`,
      timestamp: new Date().toISOString(),
      ...message,
      content: sanitizedUserContent
    };
    
    setMessages(prev => {
      if (message.replaceId) {
        return prev.map(msg => 
          msg.id === message.replaceId ? messageWithId : msg
        );
      }
      return [...prev, messageWithId];
    });
    
    // Add message to conversation manager for persistence
    try {
      if (conversationManagerRef.current) {
        const success = conversationManagerRef.current.addMessage(messageWithId);
        if (!success) {
          errorLogger.logWarning('Failed to add message to conversation manager', {
            messageId: messageWithId.id,
            messageRole: messageWithId.role
          });
        }
      }
    } catch (error) {
      errorLogger.logError(error, {
        context: 'conversation_manager_integration',
        messageId: messageWithId.id
      });
    }
    
    if (message.role === "user" && window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'PICASSO_EVENT',
        event: 'MESSAGE_SENT',
        payload: {
          content: sanitizedUserContent,
          files: message.files || [],
          messageId: messageWithId.id
        }
      }, '*');
    }
    
    if (message.role === "user" && !message.skipBotResponse && !message.uploadState) {
      // INSIDE addMessage, where you currently define makeHTTPAPICall()
      // Replace that whole function with a small dispatcher:

      const makeChatCall = async () => {
        const tenantHash = getTenantHash();
        setIsTyping(true);

        // Abort any in-flight streams before starting new one
        abortControllersRef.current.forEach(c => c.abort());
        abortControllersRef.current.clear();
        try {
          if (streamingRegistry && typeof streamingRegistry.endAll === 'function') {
            streamingRegistry.endAll();
          }
        } catch {}

        const streamingMessageId = `bot_${Date.now()}_${Math.random()}`;
        // Add a single placeholder assistant message with all canonical stream id fields and metadata for consumers
        setMessages(prev => [
          ...prev,
          {
            id: streamingMessageId,                // stable React key and message identity
            messageId: streamingMessageId,         // some code paths read messageId
            streamId: streamingMessageId,          // preferred stream id
            dataStreamId: streamingMessageId,      // top-level copy for easy access
            sseStreamId: streamingMessageId,       // alias to avoid guessing field names
            role: "assistant",
            content: "",                          // keep empty so streaming branch is chosen
            timestamp: new Date().toISOString(),
            isStreaming: true,                     // explicit streaming flag
            streaming: true,                       // secondary flag for older checks
            metadata: {
              partialText: "",
              dataStreamId: streamingMessageId,    // metadata copy (current consumers)
              streamId: streamingMessageId,        // metadata alias
              isStreaming: true
            }
          }
        ]);
        console.log('[ChatProvider] 🧪 placeholder created', { id: streamingMessageId });

        // Proactively register the stream so listeners can bind immediately (idempotent if onStart also calls it)
        try { if (streamingRegistry && typeof streamingRegistry.startStream === 'function') {
          streamingRegistry.startStream(streamingMessageId);
        } } catch {}

        const sessionId = sessionIdRef.current;
        const conversationManager = conversationManagerRef.current;

        if (conversationManager?.waitForReady) {
          logger.debug('⏳ Waiting for ConversationManager to be ready with state token...');
          await conversationManager.waitForReady();
        }
        const conversationContext = conversationManager?.getConversationContext?.() || null;
        const stateToken = conversationManager?.stateToken;

        const headers = {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/x-ndjson, application/json'
        };
        
        // Cache-Control header disabled - causes CORS issues with Lambda
        // The Lambda doesn't allow this header in Access-Control-Allow-Headers
        // Streaming should work without it since we're using SSE format
        // if (environmentConfig.ENVIRONMENT !== 'development') {
        //   headers['Cache-Control'] = 'no-store'; // Prevent intermediaries from buffering streaming responses
        // }
        if (stateToken && stateToken !== 'undefined' && stateToken !== 'null') {
          headers['Authorization'] = `Bearer ${stateToken}`;
        }

        // Build a single request body you can reuse for both paths
        const requestBody = {
          tenant_hash: tenantHash,
          user_input: message.content, // Send raw text to backend, not HTML
          session_id: sessionId,
          files: message.files || [],
          messageId: messageWithId.id,
          streaming_message_id: streamingMessageId, // <- ensure the server echoes this for SSE tagging
          conversation_context: conversationContext,
          conversation_id: conversationManager?.conversationId,
          turn: conversationManager?.turn,
          stream: shouldUseStreaming(tenantConfig, tenantHash) // Add stream flag
        };

        try {
          const streamingEnabled = shouldUseStreaming(tenantConfig, tenantHash);
          console.log('🎯 STREAMING CHECK:', {
            enabled: streamingEnabled,
            streaming_enabled_flag: tenantConfig?.features?.streaming_enabled,
            streaming_flag: tenantConfig?.features?.streaming,
            endpoint: environmentConfig.STREAMING_ENDPOINT
          });
          
          if (streamingEnabled) {
            console.log('✅ TAKING STREAMING PATH!');
            // ---- REAL STREAMING PATH ----
            // Use dedicated Bedrock streaming endpoint (Node.js with SSE support)
            let streamingUrl = environmentConfig.getStreamingUrl(tenantHash);
            const streamingMethod = tenantConfig?.streaming?.method || environmentConfig.STREAMING_METHOD || 'POST';
            
            console.log('🌊 Using streaming path:', {
              url: streamingUrl,
              method: streamingMethod,
              requestBody
            });

            // Fallback HTTP helper (verbatim from HTTP path)
            const httpFallback = async () => {
              const chatUrl = environmentConfig.getChatUrl(tenantHash);
              const data = await makeAPIRequest(
                chatUrl,
                { method: 'POST', headers, body: JSON.stringify(requestBody) },
                3
              );

              let botContent = "I apologize, but I'm having trouble processing that request right now.";
              let botActions = [];

              try {
                if (data.content) {
                  botContent = await sanitizeMessage(data.content);
                  if (data.actions && Array.isArray(data.actions)) {
                    botActions = data.actions;
                  }
                }
                else if (data.messages && data.messages[0] && data.messages[0].content) {
                  const messageContent = JSON.parse(data.messages[0].content);
                  botContent = await sanitizeMessage(messageContent.message || messageContent.content || botContent);
                  if (messageContent.actions && Array.isArray(messageContent.actions)) {
                    botActions = messageContent.actions;
                  }
                }
                else if (data.body) {
                  let bodyData = JSON.parse(data.body);
                  if (bodyData.statusCode && bodyData.body && typeof bodyData.body === 'string') {
                    try {
                      const innerBodyData = JSON.parse(bodyData.body);
                      botContent = await sanitizeMessage(innerBodyData.content || innerBodyData.message || botContent);
                      if (innerBodyData.actions && Array.isArray(innerBodyData.actions)) {
                        botActions = innerBodyData.actions;
                      }
                    } catch (nestedParseError) {
                      botContent = await sanitizeMessage(bodyData.content || bodyData.message || botContent);
                      if (bodyData.actions && Array.isArray(bodyData.actions)) {
                        botActions = bodyData.actions;
                      }
                    }
                  } else {
                    botContent = await sanitizeMessage(bodyData.content || bodyData.message || botContent);
                    if (bodyData.actions && Array.isArray(bodyData.actions)) {
                      botActions = bodyData.actions;
                    }
                  }
                }
                else if (data.response) {
                  botContent = await sanitizeMessage(data.response);
                }

                if (data.fallback_message) {
                  botContent = await sanitizeMessage(data.fallback_message);
                }

                if (data.file_acknowledgment) {
                  const sanitizedAck = await sanitizeMessage(data.file_acknowledgment);
                  botContent += "\n\n" + sanitizedAck;
                }
              } catch (parseError) {
                errorLogger.logError(parseError, {
                  messageId: messageWithId.id,
                  context: 'response_parsing'
                });
                if (typeof data === 'string') {
                  botContent = await sanitizeMessage(data);
                }
              }

              // finalize once - wrap with streaming-formatted for consistent styling
              const wrappedBotContent = botContent ? `<div class="streaming-formatted">${botContent}</div>` : botContent;
              setMessages(prev => prev.map(msg =>
                msg.id === streamingMessageId
                  ? { ...msg, content: wrappedBotContent, isStreaming: false, streaming: false, status: 'final', actions: botActions }
                  : msg
              ));

              // preserve ConversationManager integration
              try {
                if (conversationManager) {
                  await conversationManager.updateFromChatResponse(
                    data,
                    messageWithId,
                    {
                      id: streamingMessageId,
                      type: 'bot',
                      content: botContent,
                      actions: botActions,
                      timestamp: new Date().toISOString(),
                      metadata: { stream_completed: false, fallback: true }
                    }
                  );

                  const metadata = conversationManager.getMetadata();
                  setConversationMetadata({
                    conversationId: conversationManager.conversationId,
                    messageCount: metadata.messageCount,
                    hasBeenSummarized: metadata.hasBeenSummarized,
                    canLoadHistory: true
                  });
                }
              } catch (error) {
                errorLogger.logError(error, {
                  context: 'conversation_manager_update_from_chat_response',
                  messageId: streamingMessageId
                });
              }
            };

            try {
              await streamChat({
                url: streamingUrl,
                headers,
                body: requestBody,
                streamingMessageId,
                abortControllersRef,
                method: streamingMethod,
                onStart: () => {
                  streamingRegistry.startStream(streamingMessageId);
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === streamingMessageId
                        ? {
                            ...m,
                            isStreaming: true,
                            streaming: true,
                            status: 'streaming',
                            metadata: { ...(m.metadata || {}), isStreaming: true, streaming: true, status: 'streaming' }
                          }
                        : m
                    )
                  );
                  console.log('[ChatProvider] 🚦 onStart -> streaming asserted', { id: streamingMessageId });
                },
                onChunk: (delta, total) => {
                  streamingRegistry.appendChunk(streamingMessageId, delta, total);
                },
                onDone: async (fullText) => {
                  streamingRegistry.endStream(streamingMessageId);
                  const isCanceled = fullText === '[Message canceled]';
                  const safe = isCanceled ? fullText : await sanitizeMessage(fullText);
                  
                  console.log('[ChatProvider] 📝 Streaming complete, updating message with final content:', {
                    id: streamingMessageId,
                    fullText: fullText?.substring(0, 100) + '...',
                    fullTextLen: fullText?.length,
                    sanitizedContent: safe?.substring(0, 100) + '...',
                    sanitizedLen: safe?.length
                  });
                  
                  // First, directly update the DOM with the markdown content
                  // This preserves the content in the same container
                  try {
                    const streamingElement = document.querySelector(`[data-stream-id="${streamingMessageId}"]`);
                    if (streamingElement && safe) {
                      streamingElement.innerHTML = safe;
                      console.log('[ChatProvider] ✅ DOM updated directly with markdown', { id: streamingMessageId });
                    }
                  } catch (e) {
                    console.error('[ChatProvider] Failed to update DOM directly:', e);
                  }
                  
                  // Then update the React state
                  // Keep isStreaming false but mark as streamCompleted
                  // Wrap content with streaming-formatted class for theme.css styling
                  const wrappedContent = safe ? `<div class="streaming-formatted">${safe}</div>` : safe;
                  
                  setMessages(prev => {
                    const updated = prev.map(msg =>
                      msg.id === streamingMessageId
                        ? { 
                            ...msg, 
                            content: wrappedContent, // Wrapped with streaming-formatted class
                            isStreaming: false, 
                            streaming: false, 
                            status: 'final', 
                            metadata: { 
                              ...(msg.metadata || {}), 
                              canceled: isCanceled, 
                              isStreaming: false, 
                              streaming: false, 
                              status: 'final',
                              streamCompleted: true
                            } 
                          }
                        : msg
                    );
                    console.log('[ChatProvider] Message state updated:', {
                      id: streamingMessageId,
                      hasContent: !!updated.find(m => m.id === streamingMessageId)?.content,
                      wrapped: true
                    });
                    return updated;
                  });
                  console.log('[ChatProvider] ✅ finalized', { id: streamingMessageId, len: fullText?.length });

                  try {
                    if (conversationManager) {
                      await conversationManager.updateFromChatResponse(
                        {
                          content: fullText,
                          session_id: sessionId,
                          actions: [],
                          conversation_id: conversationManager.conversationId,
                          turn: conversationManager.turn,
                          metadata: { stream_completed: true, canceled: isCanceled, timestamp: new Date().toISOString() },
                          api_version: 'streaming-1.0'
                        },
                        messageWithId,
                        { id: streamingMessageId, type: 'bot', content: fullText, actions: [], timestamp: new Date().toISOString(), metadata: { stream_completed: true, canceled: isCanceled } }
                      );
                      const metadata = conversationManager.getMetadata();
                      setConversationMetadata({ conversationId: conversationManager.conversationId, messageCount: metadata.messageCount, hasBeenSummarized: metadata.hasBeenSummarized, canLoadHistory: true });
                    }
                  } catch (err) {
                    errorLogger.logError(err, { context: 'conversation_manager_update_from_stream' });
                  }
                },
                onError: (err) => {
                  // allow catch block to trigger fallback
                  throw err;
                }
              });
            } catch (e) {
              // streamChat throws ONLY when no first chunk was emitted.
              // If at least one chunk was emitted, streamChat resolves after calling onDone.
              console.error('❌ STREAMING FAILED', e);
              try { streamingRegistry.endStream(streamingMessageId); } catch {}
              console.error('➡️ Using HTTP fallback (no first chunk)');
              await httpFallback();
              return; // prevent outer catch from treating it as an error
            }
          } else {
            // ---- EXISTING HTTP (non-stream) PATH (UNCHANGED) ----
            // keep your current makeAPIRequest(...) block exactly as-is,
            // but use streamingMessageId when you write the final assistant message.
            // (Remove the "fake streaming" word-by-word simulation.)
            const chatUrl = environmentConfig.getChatUrl(tenantHash);
            const data = await makeAPIRequest(
              chatUrl,
              { method: 'POST', headers, body: JSON.stringify(requestBody) },
              3
            );

            // Parse response
            let botContent = "I apologize, but I'm having trouble processing that request right now.";
            let botActions = [];
            
            try {
              if (data.content) {
                botContent = await sanitizeMessage(data.content);
                if (data.actions && Array.isArray(data.actions)) {
                  botActions = data.actions;
                }
              }
              else if (data.messages && data.messages[0] && data.messages[0].content) {
                const messageContent = JSON.parse(data.messages[0].content);
                botContent = await sanitizeMessage(messageContent.message || messageContent.content || botContent);
                if (messageContent.actions && Array.isArray(messageContent.actions)) {
                  botActions = messageContent.actions;
                }
              }
              else if (data.body) {
                let bodyData = JSON.parse(data.body);
                if (bodyData.statusCode && bodyData.body && typeof bodyData.body === 'string') {
                  try {
                    const innerBodyData = JSON.parse(bodyData.body);
                    botContent = await sanitizeMessage(innerBodyData.content || innerBodyData.message || botContent);
                    if (innerBodyData.actions && Array.isArray(innerBodyData.actions)) {
                      botActions = innerBodyData.actions;
                    }
                  } catch (nestedParseError) {
                    botContent = await sanitizeMessage(bodyData.content || bodyData.message || botContent);
                    if (bodyData.actions && Array.isArray(bodyData.actions)) {
                      botActions = bodyData.actions;
                    }
                  }
                } else {
                  botContent = await sanitizeMessage(bodyData.content || bodyData.message || botContent);
                  if (bodyData.actions && Array.isArray(bodyData.actions)) {
                    botActions = bodyData.actions;
                  }
                }
              }
              else if (data.response) {
                botContent = await sanitizeMessage(data.response);
              }
              
              if (data.fallback_message) {
                botContent = await sanitizeMessage(data.fallback_message);
              }
              
              if (data.file_acknowledgment) {
                const sanitizedAck = await sanitizeMessage(data.file_acknowledgment);
                botContent += "\n\n" + sanitizedAck;
              }
            } catch (parseError) {
              errorLogger.logError(parseError, {
                messageId: messageWithId.id,
                context: 'response_parsing'
              });
              if (typeof data === 'string') {
                botContent = await sanitizeMessage(data);
              }
            }

            // finally commit once - wrap with streaming-formatted for consistent styling
            const wrappedBotContent = botContent ? `<div class="streaming-formatted">${botContent}</div>` : botContent;
            setMessages(prev => prev.map(msg =>
              msg.id === streamingMessageId
                ? { ...msg, content: wrappedBotContent, isStreaming: false, actions: botActions }
                : msg
            ));

            // Update conversation manager
            try {
              if (conversationManager) {
                await conversationManager.updateFromChatResponse(
                  data,
                  messageWithId,
                  {
                    id: streamingMessageId,
                    type: 'bot',
                    content: botContent,
                    actions: botActions,
                    timestamp: new Date().toISOString()
                  }
                );
              }
            } catch (error) {
              errorLogger.logError(error, {
                context: 'conversation_manager_update_from_chat_response',
                messageId: streamingMessageId
              });
            }
          }
        } catch (error) {
          errorLogger.logError(error, { context: 'chat_api_error', messageId: messageWithId.id });
          
          // ALWAYS end the streaming registry on error to prevent stuck bubbles
          // This handles errors that occur before onError callback (e.g., CORS, network failures)
          if (shouldUseStreaming(tenantConfig, tenantHash)) {
            streamingRegistry.endStream(streamingMessageId);
          }
          
          setMessages(prev => prev.map(msg =>
            msg.id === streamingMessageId
              ? {
                  ...msg,  // Keep the same ID and other properties
                  role: "assistant",
                  content: error.message,
                  timestamp: new Date().toISOString(),
                  isStreaming: false,
                  metadata: {
                    ...msg.metadata,
                    error: error.message,
                    api_type: shouldUseStreaming(tenantConfig, tenantHash) ? 'streaming' : 'http',
                    can_retry: true,
                    messageId: messageWithId.id
                  }
                }
              : msg
          ));
        } finally {
          setIsTyping(false);
        }
      };

      // Call the new dispatcher
      makeChatCall();
    }
  }, [tenantConfig, retryMessage, isChatProviderReady]);

  const updateMessage = useCallback((messageId, updates) => {
    setMessages(prev => 
      prev.map(msg => 
        msg.id === messageId ? { ...msg, ...updates } : msg
      )
    );
  }, []);

  const clearMessages = useCallback(() => {
    errorLogger.logInfo('🗑️ Manually clearing messages and conversation state');
    setMessages([]);
    setHasInitializedMessages(false);
    
    // Clear conversation manager state and tokens
    try {
      if (conversationManagerRef.current) {
        logger.debug('🧹 Clearing conversation manager state and tokens');
        conversationManagerRef.current.clearStateToken();
        conversationManagerRef.current.reset();
        
        // Reset conversation metadata
        setConversationMetadata({
          conversationId: null,
          messageCount: 0,
          hasBeenSummarized: false,
          canLoadHistory: false
        });
      }
    } catch (error) {
      errorLogger.logError(error, {
        context: 'clear_conversation_manager',
        action: 'clearMessages'
      });
    }
    
    // Clear session storage to prevent message restoration
    sessionStorage.removeItem(STORAGE_KEYS.MESSAGES);
    
    // Abort any in-flight requests
    abortControllersRef.current.forEach(controller => {
      controller.abort();
    });
    abortControllersRef.current.clear();
    // Best-effort: stop any active streaming writers (if registry supports it)
    try {
      if (streamingRegistry && typeof streamingRegistry.endAll === 'function') {
        streamingRegistry.endAll();
        errorLogger.logInfo('🧹 Stopped all streaming writers via registry');
      }
    } catch (e) {
      logger.debug('Streaming registry endAll not available or failed gracefully');
    }
    
    // Clear any pending retries
    setPendingRetries(new Map());
    retryTimeoutsRef.current.forEach(timeoutId => {
      clearTimeout(timeoutId);
    });
    retryTimeoutsRef.current.clear();
  }, []);

  const loadConversationHistory = useCallback(async () => {
    if (!conversationManagerRef.current || !conversationMetadata.canLoadHistory) {
      errorLogger.logWarning('Cannot load conversation history', {
        hasManager: !!conversationManagerRef.current,
        canLoad: conversationMetadata.canLoadHistory
      });
      return false;
    }
    
    try {
      setIsTyping(true);
      const history = await conversationManagerRef.current.loadConversationHistory();
      
      if (history && history.messages && history.messages.length > 0) {
        // Convert conversation history to chat messages
        const historicalMessages = history.messages.map(msg => ({
          id: msg.id || `historical_${Date.now()}_${Math.random()}`,
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content,
          timestamp: msg.timestamp || new Date().toISOString(),
          metadata: {
            ...msg.metadata,
            historical: true
          }
        }));
        
        // Prepend historical messages to current conversation
        setMessages(prev => [...historicalMessages, ...prev]);
        
        // Update metadata
        setConversationMetadata(prev => ({
          ...prev,
          hasLoadedHistory: true,
          canLoadHistory: false // Prevent loading history multiple times
        }));
        
        errorLogger.logInfo('📚 Loaded conversation history', {
          messageCount: historicalMessages.length,
          conversationId: conversationManagerRef.current.conversationId
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      errorLogger.logError(error, {
        context: 'load_conversation_history',
        conversationId: conversationManagerRef.current?.conversationId
      });
      return false;
    } finally {
      setIsTyping(false);
    }
  }, [conversationMetadata.canLoadHistory]);

  const installPWA = useCallback(async () => {
    if (!mobileCompatibilityRef.current?.pwaInstaller) {
      errorLogger.logWarning('PWA installer not available');
      return false;
    }
    
    try {
      const result = await mobileCompatibilityRef.current.pwaInstaller.promptInstall();
      
      if (result) {
        errorLogger.logInfo('✅ PWA installed successfully');
        setMobileFeatures(prev => ({
          ...prev,
          isPWAInstallable: false // Hide install button after successful install
        }));
      }
      
      return result;
    } catch (error) {
      errorLogger.logError(error, {
        context: 'pwa_install',
        userAgent: navigator.userAgent
      });
      return false;
    }
  }, []);

  // Public API for widget integration
  const value = {
    messages,
    isTyping,
    isOnline,
    conversationMetadata,
    mobileFeatures,
    addMessage,
    updateMessage,
    clearMessages,
    retryMessage,
    loadConversationHistory,
    installPWA,
    // Internal helpers
    sessionId: sessionIdRef.current,
    getTenantHash,
    isChatProviderReady
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};

ChatProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export default ChatProvider;
export { ChatProvider }; // Named export for backward compatibility

// Hook for consuming chat context
export const useChat = () => {
  const context = React.useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

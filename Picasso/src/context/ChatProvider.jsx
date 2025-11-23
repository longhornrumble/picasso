import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useConfig } from "../hooks/useConfig";
import { config as environmentConfig } from '../config/environment';
import { ChatContext } from './shared/ChatContext';
import { useFormMode } from './FormModeContext';
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
// Configure marked with default settings for proper markdown rendering
marked.setOptions({
  gfm: true,              // GitHub Flavored Markdown (tables, strikethrough, etc.)
  breaks: true,           // Convert line breaks to <br> tags for proper formatting
  smartLists: true,       // Use proper list indentation
  sanitize: false,        // We sanitize with DOMPurify separately
  mangle: false,          // Don't obfuscate email addresses
  // Use default renderer for standard markdown output
  pedantic: false,        // Don't be strict about markdown syntax
  smartypants: false      // Don't use smart quotes
});


// Removed tightenHtml function - we want to preserve markdown's natural spacing

// --- Linkification helpers (URLs + emails) ---
const URL_REGEX = /(?:(?:https?:\/\/)|(?:www\.))[\w\-._~:/?#%\[\]@!$&'()*+,;=]+/gi;
const EMAIL_REGEX = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

function linkifyPlaintext(input) {
  if (!input) return '';
  let text = String(input);
  // Convert emails first so local-parts containing 'www.' don't confuse URL pass
  text = text.replace(EMAIL_REGEX, (m) => `[${m}](mailto:${m})`);
  text = text.replace(URL_REGEX, (m) => {
    // If already markdown-linked (e.g., [label](url)), leave it alone
    // We only see the raw token here, so just return if it already includes a scheme wrapper
    const href = m.startsWith('www.') ? `https://${m}` : m;
    return `[${m}](${href})`;
  });
  return text;
}

let __sanitizeHookInstalled = false;
import { streamingRegistry } from '../utils/streamingRegistry';
import { isStreamingEnabled as checkStreamingEnabled } from '../config/streaming-config';

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
  // Normalize to string (avoid [object Object] and null/undefined)
  const raw = (content == null) ? '' : String(content);
  logger.debug('sanitizeMessage - Input content:', raw);

  try {
    // Pre-process to fix any malformed markdown patterns
    let preprocessed = raw;

    // Fix double-bracketed links that might be malformed
    preprocessed = preprocessed.replace(/\[([^\]]+)\]\]\(([^)]+)\)\)/g, '[$1]($2)');


    // 1) Skip linkifyPlaintext - let marked handle URLs naturally
    // This prevents double-processing that was breaking markdown links
    // const withLinks = linkifyPlaintext(preprocessed);

    // 2) Parse with marked using default renderer (not the compact one)
    // The compact renderer might be breaking standard markdown processing
    let html = marked.parse(preprocessed, {
      gfm: true,
      breaks: true,  // Need this for Bedrock KB markdown
      pedantic: false,
      smartypants: false,
      mangle: false,
      headerIds: false,
      renderer: new marked.Renderer() // Use default renderer instead of compactRenderer
    });
    logger.debug('After marked.parse:', html);

    // 3) Use the HTML as-is from marked (no tightening needed)

    // 4) One-time DOMPurify hook to enforce safe anchors + new-tab behavior
    if (!__sanitizeHookInstalled && typeof DOMPurify?.addHook === 'function') {
      DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName && node.tagName.toLowerCase() === 'a') {
          const href = node.getAttribute('href') || '';
          // Allow only http(s), mailto, tel
          if (!/^https?:/i.test(href) && !/^mailto:/i.test(href) && !/^tel:/i.test(href)) {
            node.removeAttribute('href');
          }
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
      });
      __sanitizeHookInstalled = true;
    }

    // 5) Sanitize. Explicitly allow target/rel on links.
    const cleanHtml = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p','br','strong','b','em','i','u','strike','del','s',
        'ul','ol','li','blockquote','code','pre','hr',
        'h1','h2','h3','h4','h5','h6',
        'a','img','table','thead','tbody','tr','th','td'
      ],
      ALLOWED_ATTR: [
        'href','title','target','rel','alt','src',
        'width','height','class',
        'start'
      ],
      ADD_ATTR: ['target','rel'],
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
      FORBID_ATTR: ['onerror','onload','onclick','onmouseover'],
      FORBID_TAGS: ['script','object','embed','form','input','button'],
      KEEP_CONTENT: true
    });

    logger.debug('After DOMPurify.sanitize:', cleanHtml);
    return cleanHtml;
  } catch (e) {
    errorLogger.logError(e, { context: 'sanitizeMessage' });
    const escaped = DOMPurify.sanitize(raw, { ALLOWED_TAGS: [], ALLOWED_ATTR: [], KEEP_CONTENT: true });
    return `<p>${escaped}</p>`;
  }
}

// --- ADD NEAR OTHER UTILS ---
// Cache the streaming decision for the session to prevent flipping
let streamingEnabledForSession = null;

/**
 * Determines whether to use streaming for this session.
 * Uses the centralized streaming configuration as the single source of truth.
 */
const shouldUseStreaming = (tenantConfig, _tenantHash) => {
  // If we've already decided for this session, stick with it to prevent flipping
  if (streamingEnabledForSession !== null) {
    return streamingEnabledForSession;
  }
  
  // Use centralized configuration (single source of truth)
  const enabled = checkStreamingEnabled(tenantConfig);
  streamingEnabledForSession = enabled;
  
  console.log(`📡 ChatProvider: Streaming ${enabled ? 'ENABLED' : 'DISABLED'} (from streaming-config.js)`);
  return enabled;
};

// Using shared ChatContext from ./shared/ChatContext
export const getChatContext = () => ChatContext;

const ChatProvider = ({ children }) => {
  const { config: tenantConfig } = useConfig();
  const { clearCompletionState, cancelForm } = useFormMode();

  // Session persistence constants
  const STORAGE_KEYS = {
    MESSAGES: 'picasso_messages',
    SESSION_ID: 'picasso_session_id',
    LAST_ACTIVITY: 'picasso_last_activity'
  };
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  
  // Initialize refs early to avoid "before initialization" errors
  const conversationManagerRef = useRef(null);
  
  // 🔧 FIX: Session validation - ALWAYS reuse for widget persistence
  const validateAndPurgeSession = () => {
    const stored = sessionStorage.getItem(STORAGE_KEYS.SESSION_ID);

    // ALWAYS reuse existing session for widget persistence
    // Session should only expire on browser tab close, not widget close
    if (stored) {
      // Update activity timestamp
      sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());
      logger.debug('Session validation: Reusing existing session for widget persistence', stored);
      return stored;
    }

    // Only create new session if none exists (first time)
    // Use consistent format with ConversationManager: session_TIMESTAMP
    const newSessionId = `session_${Date.now()}`;
    sessionStorage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId);
    sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());
    logger.debug('Session validation: Created new session (first time)', newSessionId);
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
  
  // Initialize with null - let useEffect handle session creation/retrieval
  const sessionIdRef = useRef(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [hasInitializedMessages, setHasInitializedMessages] = useState(false);

  // 🔧 FIX: Session validation on page refresh/reload
  useEffect(() => {
    console.log('🟢 WIDGET OPENING - ChatProvider mounting');

    // DEBUG: Show ALL sessionStorage keys
    try {
      const allKeys = Object.keys(sessionStorage);
      console.log('📦 ALL SessionStorage keys:', allKeys.length, 'keys');
      allKeys.forEach(key => {
        if (key.startsWith('picasso')) {
          const value = sessionStorage.getItem(key);
          console.log(`📦 ${key}:`, value ? value.slice(0, 100) : 'null');
        }
      });
    } catch (e) {
      console.log('📦 Error reading sessionStorage:', e);
    }

    // Check for existing session first, create new one only if needed
    const storedSessionId = sessionStorage.getItem(STORAGE_KEYS.SESSION_ID);
    const storedMessages = sessionStorage.getItem(STORAGE_KEYS.MESSAGES);
    const lastActivity = sessionStorage.getItem(STORAGE_KEYS.LAST_ACTIVITY);

    console.log('🟢 SessionStorage on mount:', {
      sessionId: storedSessionId?.slice(0, 12),
      messagesExist: !!storedMessages,
      messageCount: storedMessages ? JSON.parse(storedMessages).length : 0,
      lastActivity
    });

    if (storedSessionId) {
      // ALWAYS reuse existing session for widget close/reopen persistence
      // Session should only expire when browser tab closes, not widget close
      console.log('🟢 REUSING existing session for widget persistence:', storedSessionId.slice(0, 12) + '...');
      sessionIdRef.current = storedSessionId;
      sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());

      // Note: We're NOT checking SESSION_TIMEOUT here because:
      // 1. Widget close/reopen should maintain session (user expectation)
      // 2. Session should persist as long as browser tab is open
      // 3. Only clear session on explicit "Clear All" or browser tab close
    } else {
      // No existing session, create new one
      console.log('🟢 CREATING new session (no existing session found)');
      const newSessionId = `session_${Date.now()}`;
      sessionIdRef.current = newSessionId;
      sessionStorage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId);
      sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());
    }

    // Signal that session is ready
    setSessionReady(true);
  }, []); // Run once on mount

  // Load messages AFTER session ID is set
  useEffect(() => {
    console.log('🟢 Message loading effect - conditions:', {
      sessionReady,
      hasSessionId: !!sessionIdRef.current,
      sessionId: sessionIdRef.current?.slice(0, 12),
      hasInitializedMessages,
      shouldLoad: sessionReady && sessionIdRef.current && !hasInitializedMessages
    });

    if (sessionReady && sessionIdRef.current && !hasInitializedMessages) {
      console.log('🟢 Session ready, loading persisted messages');
      const restoredMessages = loadPersistedMessages();
      console.log('🟢 loadPersistedMessages returned:', restoredMessages?.length || 0, 'messages');

      if (restoredMessages && restoredMessages.length > 0) {
        console.log('🟢 Setting restored messages:', restoredMessages.length);
        console.log('🟢 First restored message:', restoredMessages[0]);
        setMessages(restoredMessages);
        setHasInitializedMessages(true);
      } else {
        console.log('🟢 No messages to restore');
        // Don't set hasInitializedMessages here - let the welcome message effect handle it
        // This allows the welcome message to be added when conversation manager is ready
        // setHasInitializedMessages(true);  // REMOVED - this was blocking welcome message
      }
    }
  }, [sessionReady, hasInitializedMessages]);
  
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
    console.log('🔵 loadPersistedMessages called');
    try {
      const stored = sessionStorage.getItem(STORAGE_KEYS.MESSAGES);
      const lastActivity = sessionStorage.getItem(STORAGE_KEYS.LAST_ACTIVITY);
      const storedSessionId = sessionStorage.getItem(STORAGE_KEYS.SESSION_ID);
      const currentSessionId = sessionIdRef.current;

      console.log('🔵 Persisted message check:', {
        hasStored: !!stored,
        storedCount: stored ? JSON.parse(stored).length : 0,
        storedSessionId: storedSessionId,  // Show full ID for debugging
        currentSessionId: currentSessionId,  // Show full ID for debugging
        sessionsMatch: storedSessionId === currentSessionId,
        lastActivity
      });

      // DEBUG: Show exact comparison
      console.log('🔵 Session comparison:', {
        stored: `"${storedSessionId}"`,
        current: `"${currentSessionId}"`,
        areEqual: storedSessionId === currentSessionId,
        typeOfStored: typeof storedSessionId,
        typeOfCurrent: typeof currentSessionId
      });

      // CRITICAL: Only load messages if they belong to the current session
      if (stored && storedSessionId === currentSessionId) {
        // Don't check SESSION_TIMEOUT - widget persistence should work regardless
        // Messages should persist as long as browser tab is open
        const storedMessages = JSON.parse(stored);
        console.log('🔵 LOADING MESSAGES FROM STORAGE:', storedMessages.length, 'messages');
        console.log('🔵 First message in storage:', storedMessages[0]);

        // Fix bot messages that might have content in metadata instead of content field
        // This handles legacy messages before the fix
        const messages = storedMessages.map(msg => {
          if (msg.role === 'assistant') {
            console.log('🔵 Processing bot message on load:', {
              id: msg.id,
              hasContent: !!msg.content,
              contentLength: msg.content?.length,
              hasMetadata: !!msg.metadata,
              hasSanitized: !!msg.metadata?.sanitizedContent,
              hasRaw: !!msg.metadata?.rawContent
            });

            // Check if content needs to be extracted from metadata (for legacy messages)
            if (!msg.content || msg.content === "") {
              // Prefer sanitized HTML over raw markdown
              const extractedContent = msg.metadata?.sanitizedContent || "";

              if (extractedContent) {
                console.log('🔵 Extracting sanitized content from metadata:', {
                  id: msg.id,
                  extractedLength: extractedContent.length,
                  extractedPreview: extractedContent.substring(0, 50)
                });
                return {
                  ...msg,
                  content: extractedContent
                };
              } else if (msg.metadata?.rawContent) {
                // Fallback: if only raw markdown exists, we need to parse it
                console.log('🔵 Found only raw content, needs parsing:', {
                  id: msg.id,
                  rawLength: msg.metadata.rawContent.length
                });
                // Note: This is async, but we can't await here
                // For now, return empty and let the message re-render when loaded
                return {
                  ...msg,
                  content: msg.metadata.rawContent // Will show raw markdown temporarily
                };
              }
            }
          }
          return msg;
        });

        // Debug bot messages specifically
        const botMessages = messages.filter(m => m.role === 'assistant');
        console.log('🔵 Bot messages after extraction:', botMessages.length);
        botMessages.forEach(msg => {
          console.log('🔵 Bot message check:', {
            id: msg.id,
            hasContent: !!msg.content,
            contentLength: msg.content?.length,
            contentPreview: msg.content?.substring(0, 100)
          });
        });
        errorLogger.logInfo('📂 Restored conversation from widget reopen', {
          messageCount: messages.length,
          sessionId: currentSessionId
        });
        return messages;
      } else if (storedSessionId !== currentSessionId) {
        console.log('🔵 SESSION MISMATCH - not loading messages', {
          storedSession: storedSessionId?.slice(0, 12),
          currentSession: currentSessionId?.slice(0, 12)
        });
        logger.debug('🔄 Session mismatch, not loading old messages', {
          storedSession: storedSessionId?.slice(0, 12),
          currentSession: currentSessionId?.slice(0, 12)
        });
        // Clear old session data
        sessionStorage.removeItem(STORAGE_KEYS.MESSAGES);
      } else {
        console.log('🔵 NO MESSAGES TO LOAD:', {
          hasStored: !!stored,
          hasLastActivity: !!lastActivity,
          hasStoredSessionId: !!storedSessionId,
          hasCurrentSessionId: !!currentSessionId
        });
      }
    } catch (error) {
      console.log('🔵 ERROR loading messages:', error);
      errorLogger.logError(error, { context: 'loadPersistedMessages' });
    }
    console.log('🔵 RETURNING EMPTY MESSAGES ARRAY');
    return [];
  };
  
  // Don't use lazy initial state - we need to wait for session ID to be set
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  
  // Set global flag when messages exist for ConfigProvider to check
  useEffect(() => {
    console.log('[ChatProvider] Messages array changed:', messages.length, messages);
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
          // Fix bot messages that have content in metadata.rawContent or metadata.sanitizedContent
          const messagesToPersist = messages.map(msg => {
            if (msg.role === 'assistant') {
              console.log('💾 Saving bot message:', {
                id: msg.id,
                hasContent: !!msg.content,
                contentLength: msg.content?.length,
                hasMetadata: !!msg.metadata,
                hasSanitized: !!msg.metadata?.sanitizedContent,
                hasRaw: !!msg.metadata?.rawContent,
                isStreaming: msg.isStreaming,
                status: msg.status
              });

              // Ensure content is in the main content field for persistence
              // For messages that might have content only in metadata
              if (!msg.content || msg.content === "") {
                const extractedContent = msg.metadata?.sanitizedContent ||
                                         msg.metadata?.rawContent ||
                                         msg.content ||
                                         "";

                if (extractedContent && extractedContent !== msg.content) {
                  console.log('💾 Extracting for save:', {
                    id: msg.id,
                    extractedLength: extractedContent.length
                  });
                  return {
                    ...msg,
                    content: extractedContent
                  };
                }
              }
            }
            return msg;
          });
          sessionStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messagesToPersist));
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
  }, [messages, hasInitializedMessages]);

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
    
    console.log('[ChatProvider] Checking tenant_hash:', {
      tenantConfig_exists: !!tenantConfig,
      tenant_hash: tenantConfig?.tenant_hash,
      all_keys: tenantConfig ? Object.keys(tenantConfig) : []
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
          
          // 🔧 FIX: Only clear conversation state if session is new or expired
          // Don't clear for existing valid sessions as this prevents conversation recall
          const isNewSession = !sessionStorage.getItem('picasso_conversation_id');
          if (isNewSession) {
            logger.debug('🧹 New session detected, clearing any stale conversation state');
            try {
              sessionStorage.removeItem('picasso_conversation_id');
              sessionStorage.removeItem('picasso_state_token');
            } catch (e) {
              logger.warn('🧹 Error during conversation cleanup:', e);
            }
          } else {
            logger.debug('♻️ Existing session detected, preserving conversation state for recall');
          }

          // Create conversation manager
          logger.debug('🔍 Creating conversation manager with:', {
            tenantHash: tenantHash.slice(0, 8) + '...',
            sessionId,
            conversationEndpointAvailable: environmentConfig.CONVERSATION_ENDPOINT_AVAILABLE
          });
          
          conversationManagerRef.current = createConversationManager(tenantHash, sessionId);

          logger.debug('🔍 Conversation manager created, waiting for initialization...');

          // Wait for the initialization promise to complete
          let initResult = null;
          if (conversationManagerRef.current.initializationPromise) {
            initResult = await conversationManagerRef.current.initializationPromise;
            logger.debug('✅ Conversation manager initialization complete', {
              success: initResult?.success,
              restored: initResult?.restored,
              messageCount: initResult?.messageCount
            });
          }

          // Check if conversation manager loaded messages from server
          // Use the getMessages() method to properly access the message buffer
          if (conversationManagerRef.current && conversationManagerRef.current.getMessages) {
            const loadedMessages = conversationManagerRef.current.getMessages();

            if (loadedMessages && loadedMessages.length > 0) {
              const restoredMessages = loadedMessages.map(msg => ({
              id: msg.id || `restored_${Date.now()}_${Math.random()}`,
              role: msg.role,
              // CRITICAL FIX: Extract content from multiple possible locations
              // Lambda returns 'text' field, metadata may have rawContent/sanitizedContent
              content: msg.content || msg.text || msg.metadata?.sanitizedContent || msg.metadata?.rawContent || "",
              timestamp: msg.timestamp || new Date().toISOString(),
              metadata: {
                ...msg.metadata,
                restored: true
              }
            }));

            logger.debug('📚 Restoring messages from server to UI', {
              messageCount: restoredMessages.length,
              sessionId: conversationManagerRef.current.conversationId,
              firstMessage: restoredMessages[0]?.content?.substring(0, 50)
            });

              // Always replace UI messages with server messages for session consistency
              setMessages(restoredMessages);

              // Update sessionStorage to match server state
              sessionStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(restoredMessages));
              sessionStorage.setItem(STORAGE_KEYS.SESSION_ID, conversationManagerRef.current.conversationId);

              errorLogger.logInfo('✅ Synchronized UI with server messages', {
                sessionId: conversationManagerRef.current.conversationId,
                messageCount: restoredMessages.length
              });
            }
          } else {
            // No messages from server - ensure we're not showing stale messages
            const currentSessionId = conversationManagerRef.current?.conversationId || sessionIdRef.current;
            const storedSessionId = sessionStorage.getItem(STORAGE_KEYS.SESSION_ID);

            if (storedSessionId && storedSessionId !== currentSessionId) {
              logger.debug('🧹 Clearing stale messages from different session', {
                storedSession: storedSessionId?.slice(0, 12),
                currentSession: currentSessionId?.slice(0, 12)
              });
              setMessages([]);
              sessionStorage.removeItem(STORAGE_KEYS.MESSAGES);
            }
          }

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
    
    // Only initialize if we have a session ID ready
    if (sessionReady && sessionIdRef.current) {
      initializeConversationManager();
    } else {
      logger.debug('⏳ Waiting for session ID before initializing ConversationManager');
    }
  }, [tenantConfig?.tenant_hash, isConversationManagerInitialized, sessionReady]);

  // 🔧 FIX: DON'T clear conversation manager on unmount - preserve state for widget reopen
  useEffect(() => {
    return () => {
      console.log('🔴 WIDGET CLOSING - ChatProvider unmounting');
      console.log('🔴 Current messages in state:', messages.length);
      console.log('🔴 SessionStorage contents:', {
        sessionId: sessionStorage.getItem(STORAGE_KEYS.SESSION_ID),
        messagesExist: !!sessionStorage.getItem(STORAGE_KEYS.MESSAGES),
        messageCount: JSON.parse(sessionStorage.getItem(STORAGE_KEYS.MESSAGES) || '[]').length
      });
      console.log('🔴 ConversationManager state:', {
        exists: !!conversationManagerRef.current,
        messageBufferLength: conversationManagerRef.current?.messageBuffer?.length,
        stateToken: conversationManagerRef.current?.stateToken ? 'exists' : 'missing'
      });

      logger.debug('📌 ChatProvider unmounting, preserving conversation state for potential reopen');
      // Don't clear the conversation manager or state token!
      // We want to preserve conversation state when the widget is just closed and reopened
      // The state will be cleared on actual page unload/refresh

      // Only clear the initialization lock to allow re-initialization if needed
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
    console.log('[ChatProvider] Welcome message effect triggered:', {
      tenantConfig: !!tenantConfig,
      hasInitializedMessages,
      messagesLength: messages.length,
      messages: messages,
      isConversationManagerInitialized
    });

    // Set up welcome message when config loads AND conversation manager is ready
    // This ensures proper initialization order
    if (tenantConfig && isConversationManagerInitialized) {
      console.log('[ChatProvider] Welcome message effect - config loaded:', {
        has_tenant_hash: !!tenantConfig.tenant_hash,
        tenant_hash: tenantConfig.tenant_hash,
        hasInitializedMessages,
        messagesLength: messages.length
      });

      // Check if we already have real conversation messages (not just welcome)
      const hasRealMessages = messages.some(msg =>
        msg.role === 'user' || (msg.role === 'assistant' && msg.id !== 'welcome')
      );

      // If we don't have any real messages and haven't initialized, show welcome
      if (!hasRealMessages && !hasInitializedMessages) {
        errorLogger.logInfo('🎬 Setting initial welcome message');
        console.log('[ChatProvider] Setting welcome with config:', {
          welcome_message: tenantConfig.welcome_message,
          action_chips: tenantConfig.action_chips,
          tenantConfig: tenantConfig
        });
        const welcomeActions = generateWelcomeActions(tenantConfig);
        console.log('[ChatProvider] Generated welcome actions:', welcomeActions);

        // Sanitize welcome message async
        sanitizeMessage(tenantConfig.welcome_message || "Hello! How can I help you today?")
          .then(sanitizedContent => {
            // Don't wrap content here - MessageBubble handles the streaming-formatted wrapper
            const welcomeMsg = {
              id: "welcome",
              role: "assistant",
              content: sanitizedContent,
              actions: welcomeActions
            };
            console.log('[ChatProvider] Setting welcome message:', welcomeMsg);
            console.log('[ChatProvider] Current messages before set:', messages);
            setMessages(prevMessages => {
              console.log('[ChatProvider] setMessages callback - prev:', prevMessages);
              const newMessages = [welcomeMsg];
              console.log('[ChatProvider] setMessages callback - new:', newMessages);
              return newMessages;
            });
            setHasInitializedMessages(true);
          })
          .catch(error => {
            console.error('[ChatProvider] Error setting welcome message:', error);
            // Set a fallback message even if sanitization fails
            setMessages([{
              id: "welcome",
              role: "assistant",
              content: "Welcome! How can I help you today?",
              actions: welcomeActions
            }]);
            setHasInitializedMessages(true);
          });
      } else if (hasRealMessages && !hasInitializedMessages) {
        // We have persisted messages, just mark as initialized
        errorLogger.logInfo('🔄 Continuing previous conversation', {
          messageCount: messages.length,
          sessionId: sessionIdRef.current
        });
        setHasInitializedMessages(true);
      } else if (messages.length === 0 && !hasInitializedMessages) {
        // No messages at all, ensure we show welcome
        errorLogger.logInfo('🎬 No messages found, setting welcome message');
        const welcomeActions = generateWelcomeActions(tenantConfig);
        sanitizeMessage(tenantConfig.welcome_message || "Hello! How can I help you today?")
          .then(sanitizedContent => {
            // Don't wrap here - MessageBubble handles the streaming-formatted wrapper
            const welcomeMsg = {
              id: "welcome",
              role: "assistant",
              content: sanitizedContent,
              actions: welcomeActions
            };
            console.log('[ChatProvider] Setting welcome message (no msgs case):', welcomeMsg);
            console.log('[ChatProvider] Current messages before set (no msgs):', messages);
            setMessages(prevMessages => {
              console.log('[ChatProvider] setMessages callback (no msgs) - prev:', prevMessages);
              const newMessages = [welcomeMsg];
              console.log('[ChatProvider] setMessages callback (no msgs) - new:', newMessages);
              return newMessages;
            });
            setHasInitializedMessages(true);
          });
      }
    }
  }, [tenantConfig, generateWelcomeActions, hasInitializedMessages, messages, isConversationManagerInitialized]);

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
        
        // Check if streaming is actually enabled
        const actuallyUseStreaming = shouldUseStreaming(tenantConfig, tenantHash);
        console.log('🔍 actuallyUseStreaming value:', actuallyUseStreaming);
        console.log('🔍 shouldUseStreaming returned:', shouldUseStreaming(tenantConfig, tenantHash));
        
        if (actuallyUseStreaming) {
          // STREAMING PATH: Add placeholder for streaming
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
          console.log('[ChatProvider] 🧪 STREAMING: placeholder created', { id: streamingMessageId });

          // Proactively register the stream so listeners can bind immediately
          try { if (streamingRegistry && typeof streamingRegistry.startStream === 'function') {
            streamingRegistry.startStream(streamingMessageId);
          } } catch {}
        } else {
          // HTTP PATH: No placeholder needed - will add complete message after response
          console.log('[ChatProvider] 🌐 HTTP MODE: Skipping placeholder creation');
        }

        const sessionId = sessionIdRef.current;
        const conversationManager = conversationManagerRef.current;

        if (conversationManager?.waitForReady) {
          logger.debug('⏳ Waiting for ConversationManager to be ready with state token...');
          await conversationManager.waitForReady();
        }
        const conversationContext = conversationManager?.getConversationContext?.() || null;
        const stateToken = conversationManager?.stateToken;
        
        // Debug ConversationManager state
        console.log('🧠 CONVERSATION MANAGER STATE:', {
          hasManager: !!conversationManager,
          hasGetContext: !!conversationManager?.getConversationContext,
          contextResult: conversationContext,
          stateToken: stateToken ? 'Present' : 'Missing',
          messageBufferLength: conversationManager?.messageBuffer?.length || 0,
          turn: conversationManager?.turn || 0
        });

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

        // The streaming Lambda now properly handles conversation history and role instructions
        // No need for the workaround anymore - just send the raw user input
        
        // Build a single request body you can reuse for both paths
        const requestBody = {
          tenant_hash: tenantHash,
          user_input: message.content, // Send raw user input - Lambda handles context
          session_id: sessionId,
          files: message.files || [],
          messageId: messageWithId.id,
          streaming_message_id: streamingMessageId, // <- ensure the server echoes this for SSE tagging
          conversation_context: conversationContext,
          conversation_id: conversationManager?.conversationId,
          turn: conversationManager?.turn,
          stream: actuallyUseStreaming, // Use the same decision we made above
          // Still include these for when the Lambda is updated
          conversation_history: conversationContext?.recentMessages || [],
          original_user_input: message.content // Keep original for logging
        };
        
        // Debug logging for conversation context
        console.log('🔍 REQUEST BODY CONVERSATION CONTEXT:', {
          hasContext: !!conversationContext,
          contextKeys: conversationContext ? Object.keys(conversationContext) : [],
          recentMessagesCount: conversationContext?.recentMessages?.length || 0,
          recentMessages: conversationContext?.recentMessages || [],
          turn: conversationManager?.turn,
          conversationId: conversationManager?.conversationId
        });

        try {
          // DUAL-PATH ARCHITECTURE:
          // 1. STREAMING PATH (default): Real-time character-by-character updates
          // 2. HTTP PATH: Complete response at once (fallback or explicit choice)
          // 
          // The decision is made by shouldUseStreaming() which checks:
          // - Config file setting (features.streaming_enabled)
          // - Defaults to true if not configured
          //
          // This is the SINGLE POINT where the path decision is made
          
          console.log('🎯 STREAMING DECISION:', {
            enabled: actuallyUseStreaming,
            config_setting: tenantConfig?.features?.streaming_enabled,
            reason: actuallyUseStreaming ? 
              (tenantConfig?.features?.streaming_enabled === false ? 'Config disabled' : 'Default/Config enabled') :
              'Config explicitly disabled',
            endpoint: actuallyUseStreaming ? environmentConfig.STREAMING_ENDPOINT : environmentConfig.getChatUrl(tenantHash)
          });
          
          if (actuallyUseStreaming) {
            console.log('✅ TAKING STREAMING PATH (with HTTP fallback on failure)');
            // ---- STREAMING PATH WITH HTTP FALLBACK ----
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

              // finalize once - MessageBubble handles the streaming-formatted wrapper
              setMessages(prev => prev.map(msg =>
                msg.id === streamingMessageId
                  ? { ...msg, content: botContent, isStreaming: false, streaming: false, status: 'final', actions: botActions }
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

                  console.log('[ChatProvider] 📝 Streaming complete:', {
                    id: streamingMessageId,
                    fullTextLen: fullText?.length,
                    isCanceled
                  });

                  // Sanitize the content for persistence
                  const sanitizedContent = await sanitizeMessage(fullText);

                  // Update the message with sanitized content and flags
                  setMessages(prev => {
                    const updated = prev.map(msg =>
                      msg.id === streamingMessageId
                        ? {
                            ...msg,
                            // Store the sanitized content for persistence
                            content: sanitizedContent,
                            isStreaming: false,
                            streaming: false,
                            status: 'final',
                            metadata: {
                              ...(msg.metadata || {}),
                              canceled: isCanceled,
                              isStreaming: false,
                              streaming: false,
                              status: 'final',
                              streamCompleted: true,
                              rawContent: fullText, // Keep raw for reference
                              sanitizedContent: sanitizedContent // Also store sanitized version
                            }
                          }
                        : msg
                    );
                    console.log('[ChatProvider] Streaming complete with content:', {
                      id: streamingMessageId,
                      contentLength: sanitizedContent?.length
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
            // ---- HTTP PATH (CHOSEN BY CONFIG) ----
            // This path is taken when features.streaming_enabled = false in config
            // Complete response delivered at once, no incremental updates
            console.log('🌐 HTTP PATH CHOSEN (config disabled streaming)');
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

            // finally commit once - MessageBubble handles the streaming-formatted wrapper
            
            if (!actuallyUseStreaming) {
              // HTTP MODE: Add complete message directly (no placeholder exists)
              console.log('🌐 HTTP: Adding complete message directly');
              setMessages(prev => [...prev, {
                id: streamingMessageId,
                role: "assistant",
                content: botContent,
                timestamp: new Date().toISOString(),
                isStreaming: false,
                streaming: false,
                status: 'final',
                actions: botActions,
                metadata: {
                  httpMode: true,
                  streamCompleted: false
                }
              }]);
            } else {
              // STREAMING MODE: Update existing placeholder (shouldn't reach here when streaming disabled)
              setMessages(prev => prev.map(msg =>
                msg.id === streamingMessageId
                  ? { ...msg, content: botContent, isStreaming: false, actions: botActions }
                  : msg
              ));
            }

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

    // Clear form state to remove FormCompletionCard and any active forms
    try {
      // Clear form completion state (removes FormCompletionCard)
      if (clearCompletionState && typeof clearCompletionState === 'function') {
        clearCompletionState();
        logger.debug('🧹 Cleared form completion state');
      }

      // Cancel any active form (clears all form-related state and session storage)
      if (cancelForm && typeof cancelForm === 'function') {
        cancelForm();
        logger.debug('🧹 Cancelled active form state');
      }
    } catch (error) {
      errorLogger.logError(error, {
        context: 'clear_form_state',
        action: 'clearMessages'
      });
    }
  }, [clearCompletionState, cancelForm]);

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
          // FIX: Extract content from all possible locations
          content: msg.content || msg.text || msg.metadata?.sanitizedContent || msg.metadata?.rawContent || "",
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

  // Debug: Log messages being provided
  console.log('[ChatProvider] Providing context with messages:', messages.length, messages);

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
    renderMode: 'streaming', // Enable streaming display
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

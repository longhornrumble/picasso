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

const logger = createLogger('ChatProvider');

// Streaming functionality imports (lazy loaded for performance)
let streamingUtils = null;

async function getStreamingUtils() {
  if (streamingUtils) return streamingUtils;
  
  try {
    const [{ useStreaming }, { quickStreamingHealthCheck }] = await Promise.all([
      import('../hooks/useStreaming'),
      import('../utils/streamingValidator')
    ]);
    
    streamingUtils = { useStreaming, quickStreamingHealthCheck };
    errorLogger.logInfo('✅ Streaming utilities loaded on demand');
    return streamingUtils;
  } catch (error) {
    errorLogger.logError(error, { context: 'streaming_utils_load_error' });
    return null;
  }
}

let markdownParser = null;

async function getMarkdownParser() {
  if (markdownParser) return markdownParser;

  performanceMonitor.startTimer('markdown_load');
  const [{ marked }, { default: DOMPurify }] = await Promise.all([
    import('marked'),
    import('dompurify')
  ]);

  marked.setOptions({
    breaks: true,
    gfm: true,
    sanitize: false,
    smartLists: true,
    smartypants: false,
    xhtml: false,
    mangle: false  // Don't mangle email addresses
  });

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

  // Don't use custom renderer - it causes [object Object] issues

  // Comment out custom renderer to test
  // const renderer = new marked.Renderer();
  
  // renderer.link = (href, title, text) => {
  //   logger.debug('Link renderer - href:', href, 'title:', title, 'text:', text);
  //   // Don't use DOMPurify on URLs - just ensure it's a string
  //   const cleanHref = String(href || '');
  //   const cleanTitle = title ? DOMPurify.sanitize(title) : '';
  //   const cleanText = DOMPurify.sanitize(text);
    
  //   return `<a href="${cleanHref}" ${cleanTitle ? `title="${cleanTitle}"` : ''} target="_blank" rel="noopener noreferrer">${cleanText}</a>`;
  // };

  // renderer.image = (href, title, text) => {
  //   // Don't use DOMPurify on URLs - just ensure it's a string
  //   const cleanHref = String(href || '');
  //   const cleanTitle = title ? DOMPurify.sanitize(title) : '';
  //   const cleanText = DOMPurify.sanitize(text);
    
  //   return `<img src="${cleanHref}" alt="${cleanText}" ${cleanTitle ? `title="${cleanTitle}"` : ''} style="max-width: 100%; height: auto;" loading="lazy" />`;
  // };

  // marked.use({ renderer });

  markdownParser = { marked, DOMPurify };
  performanceMonitor.endTimer('markdown_load');
  errorLogger.logInfo('✅ Markdown parser loaded on demand');

  return markdownParser;
}

async function sanitizeMessage(content) {
  if (!content || typeof content !== 'string') {
    return '';
  }

  logger.debug('sanitizeMessage - Input content:', content);

  try {
    const { marked, DOMPurify } = await getMarkdownParser();
    const html = marked.parse(content);
    logger.debug('After marked.parse:', html);
    
    const cleanHtml = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'strike', 'del', 's',
        'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
      ],
      ALLOWED_ATTR: [
        'href', 'title', 'target', 'rel', 'alt', 'src', 
        'width', 'height', 'style', 'class'
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
      FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button'],
      KEEP_CONTENT: true,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      RETURN_TRUSTED_TYPE: false
    });

    // Process links to add target="_blank" only for external URLs
    const finalHtml = cleanHtml.replace(
      /<a\s+href="([^"]+)"/gi,
      (match, url) => {
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
          return `<a target="_blank" rel="noopener noreferrer" href="${url}"`;
        }
        return `<a href="${url}"`;
      }
    );

    logger.debug('After DOMPurify.sanitize:', finalHtml);
    return finalHtml;
  } catch (error) {
    // In case of a markdown parsing error, fall back to basic sanitization.
    // This ensures we never return raw, potentially unsafe content.
    // We assume DOMPurify is available because it's part of the same dynamic import.
    // If it's not, the outer catch will handle it.
    const { DOMPurify } = await getMarkdownParser();
    errorLogger.logError(error, { context: 'sanitizeMessage' });
    return DOMPurify.sanitize(content, { ALLOWED_TAGS: [], KEEP_CONTENT: true });
  }
}

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
        logger.debug('Session validation: Using existing valid session', stored.slice(0, 12) + '...');
        return stored;
      } else {
        // Session expired, perform memory purge
        logger.debug('Session validation: Session expired, performing memory purge');
        performMemoryPurge();
      }
    }
    
    // Create new session after purge or if no session exists
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
        'picasso_jwt_token',
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
    window.picassoChatHasMessages = messages.length > 0;
  }, [messages]);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingRetries, setPendingRetries] = useState(() => new Map());
  
  // Streaming-related state
  const [streamingAvailable, setStreamingAvailable] = useState(false);
  const [streamingEnabled, setStreamingEnabled] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState(null);
  const streamingHookRef = useRef(null);
  
  const abortControllersRef = useRef(new Map());
  const retryTimeoutsRef = useRef(new Map());

  // PERFORMANCE: Debounced message persistence to avoid excessive storage writes
  const debouncedPersistMessages = useRef(
    debounce((messages, hasInitializedMessages) => {
      if (messages.length > 0 && hasInitializedMessages) {
        try {
          sessionStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
          sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());
          errorLogger.logInfo('💾 Persisted conversation state', {
            messageCount: messages.length,
            sessionId: sessionIdRef.current
          });
        } catch (error) {
          errorLogger.logError(error, { context: 'persistMessages' });
        }
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

  // RACE CONDITION FIX: Add initialization state tracking
  const [isInitialized, setIsInitialized] = useState(false);
  const initializationLockRef = useRef({
    isInitializing: false,
    initializationPromise: null
  });

  // Phase 3.2: Initialize conversation manager
  useEffect(() => {
    logger.debug('🔍 Conversation manager useEffect triggered:', {
      hasTenantHash: !!tenantConfig?.tenant_hash,
      isInitialized,
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
    
    if (isInitialized) {
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
            sessionStorage.removeItem('picasso_jwt_token');
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
          
          // Mark initialization as complete
          setIsInitialized(true);
          errorLogger.logInfo('🎉 Chat initialization completed successfully', {
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
  }, [tenantConfig?.tenant_hash, isInitialized]);

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
      tokenCacheRef.current.clear();
      requestCacheRef.current.clear();
      
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
    if (tenantConfig && !hasInitializedMessages && isInitialized) {
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

        // Sanitize welcome message async
        sanitizeMessage(tenantConfig.welcome_message || "Hello! How can I help you today?")
          .then(sanitizedContent => {
            setMessages([{
              id: "welcome",
              role: "assistant",
              content: sanitizedContent,
              actions: welcomeActions
            }]);
            setHasInitializedMessages(true);
          });
      }
    }
  }, [tenantConfig, generateWelcomeActions, hasInitializedMessages, isInitialized]);

  const getTenantHash = () => {
    return tenantConfig?.tenant_hash || 
           tenantConfig?.metadata?.tenantHash || 
           window.PicassoConfig?.tenant ||
           environmentConfig.getDefaultTenantHash();
  };

  // Check if streaming is available and enabled
  const checkStreamingAvailability = useCallback(async () => {
    if (!tenantConfig) return;
    
    try {
      const tenantHash = getTenantHash();
      const streamingEndpoint = environmentConfig.getStreamingUrl(tenantHash);
      
      // Check if streaming is enabled via centralized feature flag logic
      const isStreamingFeatureEnabled = environmentConfig.isStreamingEnabled(tenantConfig);

      // Only proceed if feature flag is enabled
      if (!isStreamingFeatureEnabled) {
        errorLogger.logInfo('🔒 Streaming disabled by feature flag', {
          tenantHash: tenantHash.slice(0, 8) + '...',
          environment: environmentConfig.ENVIRONMENT,
          tenantFeatures: tenantConfig?.features || {},
          globalOverrides: {
            disabled: typeof window !== 'undefined' ? window.PICASSO_DISABLE_STREAMING : undefined,
            forced: typeof window !== 'undefined' ? window.PICASSO_FORCE_STREAMING : undefined
          }
        });
        return;
      }

      const streamingUtils = await getStreamingUtils();
      if (!streamingUtils) {
        errorLogger.logWarning('⚠️ Streaming utilities failed to load');
        return;
      }

      // Quick health check for streaming endpoint
      const isHealthy = await streamingUtils.quickStreamingHealthCheck(tenantHash);
      
      if (isHealthy) {
        setStreamingAvailable(true);
        setStreamingEnabled(true);
        
        errorLogger.logInfo('✅ Streaming capability detected and enabled', {
          endpoint: streamingEndpoint,
          tenantHash: tenantHash.slice(0, 8) + '...',
          environment: environmentConfig.ENVIRONMENT
        });
      } else {
        errorLogger.logWarning('⚠️ Streaming endpoint health check failed - using HTTP fallback', {
          endpoint: streamingEndpoint,
          tenantHash: tenantHash.slice(0, 8) + '...'
        });
      }
    } catch (error) {
      errorLogger.logError(error, {
        context: 'streaming_availability_check',
        tenantHash: getTenantHash()?.slice(0, 8) + '...'
      });
    }
  }, [tenantConfig]);

  // Store streaming configuration for dynamic initialization
  const streamingConfigRef = useRef({
    onMessage: (content) => {
      if (currentStreamingMessage) {
        setMessages(prev => prev.map(msg => 
          msg.id === currentStreamingMessage.id 
            ? { ...msg, content: (msg.content || '') + content }
            : msg
        ));
      }
    },
    onComplete: () => {
      setIsTyping(false);
      setCurrentStreamingMessage(null);
      errorLogger.logInfo('🏁 Streaming response completed');
    },
    onError: (error) => {
      errorLogger.logWarning('⚠️ Streaming failed - falling back to HTTP', {
        error: error.message,
        messageId: currentStreamingMessage?.id
      });
      
      setIsTyping(false);
      setCurrentStreamingMessage(null);
      
      // Auto-fallback to HTTP for this message
      if (currentStreamingMessage?.fallbackToHttp) {
        currentStreamingMessage.fallbackToHttp();
      }
    }
  });
  
  // Update streaming config when currentStreamingMessage changes
  useEffect(() => {
    streamingConfigRef.current.onMessage = (content) => {
      if (currentStreamingMessage) {
        setMessages(prev => prev.map(msg => 
          msg.id === currentStreamingMessage.id 
            ? { ...msg, content: (msg.content || '') + content }
            : msg
        ));
      }
    };
    
    streamingConfigRef.current.onError = (error) => {
      errorLogger.logWarning('⚠️ Streaming failed - falling back to HTTP', {
        error: error.message,
        messageId: currentStreamingMessage?.id
      });
      
      setIsTyping(false);
      setCurrentStreamingMessage(null);
      
      // Auto-fallback to HTTP for this message
      if (currentStreamingMessage?.fallbackToHttp) {
        currentStreamingMessage.fallbackToHttp();
      }
    };
  }, [currentStreamingMessage]);

  // Check streaming availability when tenant config loads and initialization is complete
  useEffect(() => {
    if (tenantConfig && !hasInitializedMessages && isInitialized) {
      checkStreamingAvailability();
    }
  }, [tenantConfig, hasInitializedMessages, isInitialized, checkStreamingAvailability]);

  // JWT/Function URL integration methods - PERFORMANCE OPTIMIZED
  // Token cache to avoid regenerating tokens for same session
  const tokenCacheRef = useRef(new Map());
  const TOKEN_CACHE_DURATION = 300000; // 5 minutes
  
  const generateStreamingToken = async (userInput, sessionId) => {
    const startTime = performance.now();
    
    try {
      const tenantHash = getTenantHash();
      
      // PERFORMANCE: Check cache first to avoid API call
      const cacheKey = `${tenantHash}_${sessionId}`;
      const cached = tokenCacheRef.current.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < TOKEN_CACHE_DURATION) {
        const cacheTime = performance.now() - startTime;
        errorLogger.logInfo('⚡ JWT token retrieved from cache', {
          cacheTime: cacheTime.toFixed(2) + 'ms',
          sessionId
        });
        return {
          jwt: cached.jwt,
          streamingUrl: cached.streamingUrl
        };
      }
      
      const tokenEndpoint = environmentConfig.getChatUrl(tenantHash);
      
      errorLogger.logInfo('🔐 Generating streaming JWT token', {
        tenantHash: tenantHash.slice(0, 8) + '...',
        sessionId,
        endpoint: tokenEndpoint
      });
      
      // PERFORMANCE: Use AbortController with shorter timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout instead of default
      
      const response = await fetch(`${tokenEndpoint}&action=generate_stream_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          session_id: sessionId,
          user_input: userInput,
          tenant_hash: tenantHash
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Token generation failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.jwt || !data.streaming_url) {
        throw new Error('Invalid token response: missing jwt or streaming_url');
      }
      
      // PERFORMANCE: Cache the token for reuse
      tokenCacheRef.current.set(cacheKey, {
        jwt: data.jwt,
        streamingUrl: data.streaming_url,
        timestamp: Date.now()
      });
      
      // Clean up old cache entries to prevent memory leaks
      if (tokenCacheRef.current.size > 10) {
        const oldestKey = tokenCacheRef.current.keys().next().value;
        tokenCacheRef.current.delete(oldestKey);
      }
      
      const totalTime = performance.now() - startTime;
      errorLogger.logInfo('✅ Streaming JWT token generated successfully', {
        generationTime: totalTime.toFixed(2) + 'ms',
        hasJWT: !!data.jwt,
        hasStreamingURL: !!data.streaming_url,
        sessionId,
        targetMet: totalTime < 200 ? '✅' : '⚠️ (PRD target: <200ms)'
      });
      
      return {
        jwt: data.jwt,
        streamingUrl: data.streaming_url
      };
      
    } catch (error) {
      const totalTime = performance.now() - startTime;
      errorLogger.logError(error, {
        context: 'jwt_token_generation',
        generationTime: totalTime.toFixed(2) + 'ms',
        sessionId,
        userInput: userInput.substring(0, 50) + '...'
      });
      throw error;
    }
  };

  const makeAPIRequest = async (url, options, retries = 3) => {
    const messageId = options.body ? JSON.parse(options.body).messageId : null;
    
    return performanceMonitor.measure('api_request', async () => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 25000); // 25-second timeout (Master_Function Lambda has 30s limit)
          
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
    if (message.role === "user" && !isInitialized) {
      errorLogger.logWarning('⚠️ Blocking message send - chat not yet initialized', {
        messageContent: message.content?.substring(0, 50) + '...',
        isInitialized
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
      const tenantHash = getTenantHash();
      
      // Define HTTP API call function first to avoid hoisting issues
      const makeHTTPAPICall = async () => {
        errorLogger.logInfo('✅ Making HTTP chat request via actions API');
        setIsTyping(true);
        try {
          const tenantHash = getTenantHash();
          errorLogger.logInfo('🚀 Making chat API call', { 
            tenantHash: tenantHash.slice(0, 8) + '...',
            messageId: messageWithId.id 
          });
          
          const sessionId = sessionIdRef.current;
          
          // Get conversation context and state token for memory persistence
          const conversationManager = conversationManagerRef.current;
          
          // CRITICAL: Wait for ConversationManager to have state token before proceeding
          if (conversationManager && conversationManager.waitForReady) {
            logger.debug('⏳ Waiting for ConversationManager to be ready with state token...');
            await conversationManager.waitForReady();
          }
          
          const conversationContext = conversationManager ? 
            conversationManager.getConversationContext() : 
            null;
          
          // Get state token for authorization
          const stateToken = conversationManager?.stateToken;
          
          // Enhanced debugging to understand state token issue
          logger.debug('🔍 Detailed state token debug:', {
            hasManager: !!conversationManager,
            managerIsInitialized: conversationManager?.isInitialized,
            rawStateToken: conversationManager?.stateToken,
            stateTokenValue: stateToken ? 'exists' : 'missing',
            stateTokenType: typeof stateToken,
            stateTokenLength: stateToken ? stateToken.length : 0,
            stateTokenTruthy: !!stateToken,
            stateTokenContent: stateToken ? stateToken.substring(0, 20) + '...' : 'none',
            conversationId: conversationManager?.conversationId,
            turn: conversationManager?.turn
          });
          
          const requestBody = {
            tenant_hash: tenantHash,
            user_input: sanitizedUserContent, // Send sanitized content
            session_id: sessionId,
            files: message.files || [],
            messageId: messageWithId.id,
            
            // Add conversation context for server-side memory
            conversation_context: conversationContext,
            
            // Include conversation ID and turn for state tracking
            conversation_id: conversationManager?.conversationId,
            turn: conversationManager?.turn
          };
          
          // Build headers with state token if available
          const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          };
          
          logger.debug('🔍 Pre-header check:', {
            stateTokenExists: !!stateToken,
            stateTokenValue: stateToken,
            willAddAuth: !!stateToken && stateToken !== 'undefined' && stateToken !== 'null'
          });
          
          if (stateToken && stateToken !== 'undefined' && stateToken !== 'null') {
            headers['Authorization'] = `Bearer ${stateToken}`;
            logger.debug('✅ Authorization header added:', {
              headerValue: headers['Authorization'].substring(0, 30) + '...',
              conversationId: conversationManager?.conversationId,
              turn: conversationManager?.turn
            });
            errorLogger.logInfo('🔑 Including state token in chat request', {
              hasToken: true,
              conversationId: conversationManager?.conversationId,
              turn: conversationManager?.turn
            });
          } else {
            logger.debug('⚠️ No Authorization header added:', {
              reason: !stateToken ? 'no token' : 
                     stateToken === 'undefined' ? 'token is string "undefined"' :
                     stateToken === 'null' ? 'token is string "null"' : 'unknown',
              tokenValue: stateToken
            });
          }
          
          // Use the environment configuration for proper endpoint URL with tenant hash
          const chatUrl = environmentConfig.getChatUrl(tenantHash);
          
          logger.debug('🚀 Sending request with headers:', {
            url: chatUrl,
            hasAuthHeader: !!headers['Authorization'],
            authHeaderPreview: headers['Authorization'] ? headers['Authorization'].substring(0, 30) + '...' : 'none',
            allHeaders: Object.keys(headers)
          });
          
          const data = await makeAPIRequest(
            chatUrl,
            {
              method: 'POST',
              headers,
              body: JSON.stringify(requestBody)
            },
            3 // Number of retries
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
              messageId: messageWithId.id,
              context: 'response_parsing',
              data: typeof data === 'string' ? data.substring(0, 200) + '...' : JSON.stringify(data).substring(0, 200) + '...'
            });
            
            // As a fallback, try to sanitize the raw response if it's a string
            if (typeof data === 'string') {
              botContent = await sanitizeMessage(data);
            }
          }
          
          const botMessage = {
            id: `bot_${Date.now()}_${Math.random()}`,
            role: "assistant", 
            content: botContent,
            actions: botActions,
            timestamp: new Date().toISOString(),
            metadata: {
              session_id: data.session_id,
              api_version: data.api_version || 'actions-complete'
            }
          };
          
          setMessages(prev => [...prev, botMessage]);
          
          // Update conversation manager with complete conversation state
          try {
            if (conversationManagerRef.current) {
              logger.debug('🔍 About to update conversation manager with:', {
                hasConversationManager: !!conversationManagerRef.current,
                conversationId: conversationManagerRef.current.conversationId,
                hasStateToken: !!conversationManagerRef.current.stateToken,
                isInitialized: conversationManagerRef.current.isInitialized,
                userMessageId: messageWithId.id,
                botMessageId: botMessage.id
              });
              
              // Use the new updateFromChatResponse method for comprehensive state management
              await conversationManagerRef.current.updateFromChatResponse(
                data, // Full chat response
                messageWithId, // User message
                botMessage // Bot response
              );
              
              logger.debug('🔍 Conversation manager update completed');
              
              // Update conversation metadata
              const metadata = conversationManagerRef.current.getMetadata();
              setConversationMetadata({
                conversationId: conversationManagerRef.current.conversationId,
                messageCount: metadata.messageCount,
                hasBeenSummarized: metadata.hasBeenSummarized,
                canLoadHistory: true
              });
              
              errorLogger.logInfo('🔄 Conversation state updated from chat response', {
                conversationId: conversationManagerRef.current.conversationId,
                totalMessages: metadata.messageCount,
                sessionId: data.session_id
              });
            } else {
              logger.debug('⚠️ No conversation manager available for state update');
            }
          } catch (error) {
            errorLogger.logError(error, {
              context: 'conversation_manager_update_from_chat_response',
              messageId: botMessage.id
            });
          }
          
          errorLogger.logInfo('✅ Chat response processed successfully', {
            messageId: messageWithId.id,
            hasContent: !!botContent,
            hasActions: botActions.length > 0,
            sessionId: data.session_id
          });
          
        } catch (error) {
          errorLogger.logError(error, {
            messageId: messageWithId.id,
            context: 'chat_api_error',
            tenantHash: getTenantHash()
          });
          
          const errorMessage = {
            id: `error_${Date.now()}_${Math.random()}`,
            role: "assistant",
            content: error.message, // This will be the user-friendly message
            timestamp: new Date().toISOString(),
            metadata: {
              error: error.message,
              api_type: 'actions-chat',
              can_retry: true,
              messageId: messageWithId.id
            }
          };
          
          setMessages(prev => [...prev, errorMessage]);
          
          // Add error message to conversation manager for persistence
          try {
            if (conversationManagerRef.current) {
              conversationManagerRef.current.addMessage(errorMessage);
            }
          } catch (convError) {
            errorLogger.logError(convError, {
              context: 'conversation_manager_error_message',
              messageId: errorMessage.id
            });
          }
        } finally {
          setIsTyping(false);
        }
      };
      
      // Try streaming first if available, fallback to HTTP
      if (streamingEnabled) {
        errorLogger.logInfo('🌊 Attempting streaming response', {
          messageId: messageWithId.id,
          tenantHash: tenantHash.slice(0, 8) + '...'
        });
        
        const attemptStreaming = async () => {
          try {
            const streamingUtils = await getStreamingUtils();
            if (!streamingUtils) {
              throw new Error('Streaming utilities not available');
            }

            // Step 1: Generate JWT token for streaming
            errorLogger.logInfo('🔐 Starting JWT/Function URL streaming flow', {
              messageId: messageWithId.id,
              tenantHash: tenantHash.slice(0, 8) + '...'
            });
            
            let tokenData;
            try {
              tokenData = await generateStreamingToken(sanitizedUserContent, sessionIdRef.current);
            } catch (tokenError) {
              errorLogger.logWarning('🔐 JWT token generation failed - falling back to HTTP', {
                error: tokenError.message,
                messageId: messageWithId.id
              });
              makeHTTPAPICall();
              return;
            }
            
            setIsTyping(true);
            
            // Create placeholder message for streaming
            const streamingMessageId = `streaming_${Date.now()}_${Math.random()}`;
            const streamingMessage = {
              id: streamingMessageId,
              role: "assistant",
              content: "",
              timestamp: new Date().toISOString(),
              metadata: {
                streaming: true,
                messageId: messageWithId.id,
                jwtAuth: true
              }
            };
            
            // Add streaming message to UI
            setMessages(prev => [...prev, streamingMessage]);
            setCurrentStreamingMessage({
              ...streamingMessage,
              fallbackToHttp: () => {
                // Remove streaming message and try HTTP
                setMessages(prev => prev.filter(msg => msg.id !== streamingMessageId));
                setCurrentStreamingMessage(null);
                makeHTTPAPICall();
              }
            });
            
            // Step 2: Initialize streaming hook with JWT authentication
            const streamingHook = streamingUtils.useStreaming({
              streamingEndpoint: tokenData.streamingUrl, // Use Function URL from token response
              tenantHash,
              jwt: tokenData.jwt, // Pass JWT for authentication
              onMessage: streamingConfigRef.current.onMessage,
              onComplete: streamingConfigRef.current.onComplete,
              onError: streamingConfigRef.current.onError
            });
            
            // Step 3: Start streaming with JWT authentication
            await streamingHook.startStreaming({
              userInput: sanitizedUserContent,
              sessionId: sessionIdRef.current,
              jwt: tokenData.jwt // Include JWT in streaming parameters
            });
            
            streamingHookRef.current = streamingHook;
            
          } catch (error) {
            errorLogger.logWarning('🔄 JWT/Function URL streaming failed - falling back to HTTP', {
              error: error.message,
              messageId: messageWithId.id
            });
            
            // Clean up and fallback
            setCurrentStreamingMessage(null);
            setIsTyping(false);
            makeHTTPAPICall();
          }
        };
        
        attemptStreaming();
      } else {
        // Use HTTP directly if streaming is not available
        errorLogger.logInfo('📡 Using HTTP response (streaming not available)', {
          streamingEnabled,
          streamingHookAvailable: !!streamingHookRef.current,
          messageId: messageWithId.id
        });
        
        makeHTTPAPICall();
      }
    }
  }, [tenantConfig, retryMessage, isInitialized]);

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
        
        // Clear server-side conversation state
        conversationManagerRef.current.clearConversation();
        
        // Clear local tokens and session storage
        conversationManagerRef.current.clearStateToken();
        
        // Reset conversation metadata
        setConversationMetadata({
          conversationId: null,
          messageCount: 0,
          hasBeenSummarized: false,
          canLoadHistory: false
        });
        
        errorLogger.logInfo('✅ Conversation state cleared successfully');
      }
      
      // 🔧 FIX: Also perform memory purge when clearing messages
      logger.debug('🧹 Performing memory purge as part of clear messages');
      performMemoryPurge();
      
      // Force a new session ID to prevent conflicts
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId);
      sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());
      sessionIdRef.current = newSessionId;
      
      logger.debug('🔍 New session created after clear:', newSessionId.slice(0, 12) + '...');
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'clear_conversation_state',
        action: 'clearMessages'
      });
    }
  }, []);

  const value = {
    messages,
    isTyping,
    tenantConfig,
    isOnline,
    pendingRetries,
    addMessage,
    updateMessage,
    clearMessages,
    retryMessage,
    // Streaming-related state
    streamingAvailable,
    streamingEnabled,
    currentStreamingMessage,
    // JWT/Function URL methods
    generateStreamingToken,
    // Phase 3.2: Conversation persistence
    conversationMetadata,
    // Phase 3.3: Mobile compatibility and PWA features
    mobileFeatures,
    _debug: {
      tenantHash: getTenantHash(),
      apiType: streamingEnabled ? 'streaming-with-http-fallback' : 'actions-only',
      configLoaded: !!tenantConfig,
      chatEndpoint: environmentConfig.getChatUrl(getTenantHash()),
      streamingEndpoint: streamingEnabled ? environmentConfig.getStreamingUrl(getTenantHash()) : null,
      environment: environmentConfig.ENVIRONMENT,
      networkStatus: isOnline ? 'online' : 'offline',
      pendingRetryCount: pendingRetries.size,
      streamingStatus: {
        available: streamingAvailable,
        enabled: streamingEnabled,
        hookInitialized: !!streamingHookRef.current,
        currentMessage: currentStreamingMessage?.id || null,
        jwtAuthEnabled: true,
        authFlow: 'jwt-function-url'
      }
    }
  };

  return React.createElement(
    ChatContext.Provider,
    { value },
    children
  );
};

// PropTypes for ChatProvider
ChatProvider.propTypes = {
  children: PropTypes.node.isRequired
};

ChatProvider.defaultProps = {
  // No default props needed
};

// --- Test Utilities ---
// These are for development and debugging purposes.
// They will not be included in the production build if tree-shaking is configured correctly.
if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
  if (typeof window !== 'undefined') {
    window.testChatAPI = async (message, tenantHash) => {
      const hash = tenantHash || environmentConfig.getDefaultTenantHash();
      errorLogger.logInfo('🧪 Testing chat API...', { message, tenantHash: hash });
      
      try {
        const sessionId = `test_${Date.now()}`;
        const response = await fetch(environmentConfig.getChatUrl(hash), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tenant_hash: hash,
            user_input: message || "Hello, this is a test message",
            session_id: sessionId
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          errorLogger.logInfo('✅ Chat API Test Response', { 
            hasContent: !!data.content,
            hasActions: data.actions?.length > 0,
            sessionId: data.session_id
          });
          
          if (data.content) {
            errorLogger.logInfo('📝 Bot response', { content: data.content.substring(0, 100) + '...' });
          }
          
          if (data.actions && data.actions.length > 0) {
            errorLogger.logInfo('🎯 Available actions', { 
              actionCount: data.actions.length,
              actionLabels: data.actions.map(a => a.label)
            });
          }
          
          return data;
        } else {
          const errorText = await response.text();
          const error = new Error(`Chat API Test Failed: ${response.status} ${errorText}`);
          errorLogger.logError(error, { 
            context: 'chat_api_test',
            status: response.status,
            responseText: errorText
          });
          return null;
        }
      } catch (error) {
        errorLogger.logError(error, { context: 'chat_api_test_error' });
        return null;
      }
    };

    window.testVolunteer = () => window.testChatAPI("I want to volunteer");
    window.testDonate = () => window.testChatAPI("How can I donate?");
    window.testContact = () => window.testChatAPI("How do I contact you?");
    window.testServices = () => window.testChatAPI("What services do you offer?");

    errorLogger.logInfo('🛠️ Chat API test commands available', {
      commands: ['testChatAPI', 'testVolunteer', 'testDonate', 'testContact', 'testServices']
    });
  }
}

export { ChatProvider };
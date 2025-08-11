import React, { createContext, useState, useCallback, useEffect, useRef } from "react";
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
  //   console.log('🔗 Link renderer - href:', href, 'title:', title, 'text:', text);
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

  console.log('🔍 sanitizeMessage - Input content:', content);

  try {
    const { marked, DOMPurify } = await getMarkdownParser();
    const html = marked.parse(content);
    console.log('🔍 After marked.parse:', html);
    
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

    console.log('🔍 After DOMPurify.sanitize:', finalHtml);
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
  
  // Initialize or retrieve session ID
  const getOrCreateSessionId = () => {
    const stored = sessionStorage.getItem(STORAGE_KEYS.SESSION_ID);
    const lastActivity = sessionStorage.getItem(STORAGE_KEYS.LAST_ACTIVITY);
    
    // Check if session is still valid (within timeout)
    if (stored && lastActivity) {
      const timeSinceActivity = Date.now() - parseInt(lastActivity);
      if (timeSinceActivity < SESSION_TIMEOUT) {
        return stored;
      }
    }
    
    // Create new session
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId);
    sessionStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());
    return newSessionId;
  };
  
  const sessionIdRef = useRef(getOrCreateSessionId());
  
  // Phase 3.2: Conversation Manager Integration
  const conversationManagerRef = useRef(null);
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
  
  const [messages, setMessages] = useState(loadPersistedMessages);
  const [isTyping, setIsTyping] = useState(false);
  const [hasInitializedMessages, setHasInitializedMessages] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingRetries, setPendingRetries] = useState(new Map());
  
  // Streaming-related state
  const [streamingAvailable, setStreamingAvailable] = useState(false);
  const [streamingEnabled, setStreamingEnabled] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState(null);
  const streamingHookRef = useRef(null);
  
  const abortControllersRef = useRef(new Map());
  const retryTimeoutsRef = useRef(new Map());

  // Persist messages whenever they change
  useEffect(() => {
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
  }, [messages, hasInitializedMessages, STORAGE_KEYS]);

  // Phase 3.2: Initialize conversation manager
  useEffect(() => {
    if (!tenantConfig?.tenant_hash) return;
    
    const initializeConversationManager = async () => {
      try {
        const tenantHash = tenantConfig.tenant_hash;
        const sessionId = sessionIdRef.current;
        
        // Create conversation manager
        conversationManagerRef.current = createConversationManager(tenantHash, sessionId);
        
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
          tenantHash: tenantHash.slice(0, 8) + '...'
        });

        // Phase 3.3: Initialize mobile compatibility features
        initializeMobileCompatibility(conversationManagerRef.current)
          .then((mobileCompat) => {
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
          })
          .catch((error) => {
            errorLogger.logError(error, {
              context: 'mobile_compatibility_init',
              tenantHash: tenantHash.slice(0, 8) + '...'
            });
          });
        
      } catch (error) {
        errorLogger.logError(error, {
          context: 'conversation_manager_init',
          tenantHash: tenantConfig?.tenant_hash?.slice(0, 8) + '...'
        });
      }
    };
    
    initializeConversationManager();
  }, [tenantConfig]);

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

  // Cleanup on unmount
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
    };
  }, []);

  const generateWelcomeActions = useCallback((config) => {
    if (!config) return [];
    
    const actionChipsConfig = config.action_chips || {};
    
    if (!actionChipsConfig.enabled || !actionChipsConfig.show_on_welcome) {
      return [];
    }
    
    const chips = actionChipsConfig.default_chips || [];
    const maxDisplay = actionChipsConfig.max_display || 3;
    
    return chips.slice(0, maxDisplay);
  }, []);

  useEffect(() => {
    if (tenantConfig && !hasInitializedMessages) {
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
  }, [tenantConfig, generateWelcomeActions, hasInitializedMessages]);

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

  // Check streaming availability when tenant config loads
  useEffect(() => {
    if (tenantConfig && !hasInitializedMessages) {
      checkStreamingAvailability();
    }
  }, [tenantConfig, hasInitializedMessages, checkStreamingAvailability]);

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

            const streamingEndpoint = environmentConfig.getStreamingUrl(tenantHash);
            
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
                messageId: messageWithId.id
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
            
            // Initialize streaming hook dynamically
            const streamingHook = streamingUtils.useStreaming({
              streamingEndpoint,
              tenantHash,
              onMessage: streamingConfigRef.current.onMessage,
              onComplete: streamingConfigRef.current.onComplete,
              onError: streamingConfigRef.current.onError
            });
            
            // Start streaming
            await streamingHook.startStreaming({
              userInput: sanitizedUserContent,
              sessionId: sessionIdRef.current
            });
            
            streamingHookRef.current = streamingHook;
            
          } catch (error) {
            errorLogger.logWarning('🔄 Streaming failed - falling back to HTTP', {
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
          const requestBody = {
            tenant_hash: tenantHash,
            user_input: sanitizedUserContent, // Send sanitized content
            session_id: sessionId,
            files: message.files || [],
            messageId: messageWithId.id
          };
          
          // Use the environment configuration for proper endpoint URL with tenant hash
          const chatUrl = environmentConfig.getChatUrl(tenantHash);
          
          const data = await makeAPIRequest(
            chatUrl,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
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
          
          // Add bot message to conversation manager for persistence
          try {
            if (conversationManagerRef.current) {
              const success = conversationManagerRef.current.addMessage(botMessage);
              if (!success) {
                errorLogger.logWarning('Failed to add bot message to conversation manager', {
                  messageId: botMessage.id,
                  sessionId: data.session_id
                });
              }
            }
          } catch (error) {
            errorLogger.logError(error, {
              context: 'conversation_manager_bot_message',
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
    }
  }, [tenantConfig, retryMessage]);

  const updateMessage = useCallback((messageId, updates) => {
    setMessages(prev => 
      prev.map(msg => 
        msg.id === messageId ? { ...msg, ...updates } : msg
      )
    );
  }, []);

  const clearMessages = useCallback(() => {
    errorLogger.logInfo('🗑️ Manually clearing messages');
    setMessages([]);
    setHasInitializedMessages(false);
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
        currentMessage: currentStreamingMessage?.id || null
      }
    }
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
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
if (import.meta.env.DEV) {
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
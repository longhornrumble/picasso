import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
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
    xhtml: false
  });

  const renderer = new marked.Renderer();
  
  renderer.link = (href, title, text) => {
    const cleanHref = DOMPurify.sanitize(href);
    const cleanTitle = title ? DOMPurify.sanitize(title) : '';
    const cleanText = DOMPurify.sanitize(text);
    
    return `<a href="${cleanHref}" ${cleanTitle ? `title="${cleanTitle}"` : ''} target="_blank" rel="noopener noreferrer">${cleanText}</a>`;
  };

  renderer.image = (href, title, text) => {
    const cleanHref = DOMPurify.sanitize(href);
    const cleanTitle = title ? DOMPurify.sanitize(title) : '';
    const cleanText = DOMPurify.sanitize(text);
    
    return `<img src="${cleanHref}" alt="${cleanText}" ${cleanTitle ? `title="${cleanTitle}"` : ''} style="max-width: 100%; height: auto;" loading="lazy" />`;
  };

  marked.use({ renderer });

  markdownParser = { marked, DOMPurify };
  performanceMonitor.endTimer('markdown_load');
  errorLogger.logInfo('✅ Markdown parser loaded on demand');

  return markdownParser;
}

async function sanitizeMessage(content) {
  if (!content || typeof content !== 'string') {
    return '';
  }

  try {
    const { marked, DOMPurify } = await getMarkdownParser();
    const html = marked.parse(content);
    
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
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
      FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button'],
      KEEP_CONTENT: true,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      RETURN_TRUSTED_TYPE: false
    });

    return cleanHtml;
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
  
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [hasInitializedMessages, setHasInitializedMessages] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingRetries, setPendingRetries] = useState(new Map());
  
  const abortControllersRef = useRef(new Map());
  const retryTimeoutsRef = useRef(new Map());

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
  }, [tenantConfig, generateWelcomeActions, hasInitializedMessages]);

  const getTenantHash = () => {
    return tenantConfig?.tenant_hash || 
           tenantConfig?.metadata?.tenantHash || 
           window.PicassoConfig?.tenant ||
           'fo85e6a06dcdf4';
  };

  const makeAPIRequest = async (url, options, retries = 3) => {
    const messageId = options.body ? JSON.parse(options.body).messageId : null;
    
    return performanceMonitor.measure('api_request', async () => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout
          
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
          
          errorLogger.logError(error, {
            messageId,
            attempt,
            url,
            errorClassification,
            tenantHash: getTenantHash()
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
            const userMessage = getUserFriendlyMessage(errorClassification, attempt);
            const userError = new Error(userMessage);
            errorLogger.logError(userError, {
              messageId,
              attempt,
              originalError: error,
              errorClassification,
              finalAttempt: true
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
      errorLogger.logInfo('✅ Making chat request via actions API');
      setIsTyping(true);
      
      const makeAPICall = async () => {
        try {
          const tenantHash = getTenantHash();
          errorLogger.logInfo('🚀 Making chat API call', { 
            tenantHash: tenantHash.slice(0, 8) + '...',
            messageId: messageWithId.id 
          });
          
          const requestBody = {
            tenant_hash: tenantHash,
            user_input: sanitizedUserContent, // Send sanitized content
            session_id: `session_${Date.now()}`,
            files: message.files || [],
            messageId: messageWithId.id
          };
          
          const data = await makeAPIRequest(
            environmentConfig.getChatUrl(tenantHash),
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
          
          setMessages(prev => [...prev, {
            id: `bot_${Date.now()}_${Math.random()}`,
            role: "assistant", 
            content: botContent,
            actions: botActions,
            timestamp: new Date().toISOString(),
            metadata: {
              session_id: data.session_id,
              api_version: data.api_version || 'actions-complete'
            }
          }]);
          
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
          
          setMessages(prev => [...prev, {
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
          }]);
        } finally {
          setIsTyping(false);
        }
      };
      
      makeAPICall();
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
    _debug: {
      tenantHash: getTenantHash(),
      apiType: 'actions-only',
      configLoaded: !!tenantConfig,
      chatEndpoint: environmentConfig.getChatUrl(getTenantHash()),
      environment: environmentConfig.ENVIRONMENT,
      networkStatus: isOnline ? 'online' : 'offline',
      pendingRetryCount: pendingRetries.size
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
      const hash = tenantHash || 'fo85e6a06dcdf4';
      errorLogger.logInfo('🧪 Testing chat API...', { message, tenantHash: hash });
      
      try {
        const response = await fetch(environmentConfig.getChatUrl(hash), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tenant_hash: hash,
            user_input: message || "Hello, this is a test message",
            session_id: `test_${Date.now()}`
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
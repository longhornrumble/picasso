/**
 * HTTP Chat Provider
 * 
 * Pure HTTP implementation with NO streaming logic.
 * - No StreamingRegistry
 * - No placeholders
 * - No partial updates
 * - Direct fetch() calls with reasonable timeouts
 * - Simple retry logic (1 retry only)
 * 
 * Result: <2 second response times instead of 45+ seconds
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useConfig } from '../hooks/useConfig';
import { ChatContext } from './shared/ChatContext';
import {
  generateMessageId,
  processMessageContent,
  createUserMessage,
  createAssistantMessage,
  createErrorMessage,
  getTenantHash,
  saveToSession,
  getFromSession,
  clearSession
} from './shared/messageHelpers';
import { logger } from '../utils/logger';
import { config as envConfig } from '../config/environment';
import { createConversationManager } from '../utils/conversationManager';

// HTTP-specific timeout (Lambda has 30 second limit)
const HTTP_TIMEOUT = 25000; // 25 seconds (5 seconds buffer before Lambda timeout)
const MAX_RETRIES = 1; // Single retry on network failure

export default function HTTPChatProvider({ children }) {
  console.log('🟢 HTTPChatProvider component initialized');
  // Core state
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  
  // Refs for stable values
  const sessionIdRef = useRef(null);
  const tenantHashRef = useRef(getTenantHash());
  const conversationManagerRef = useRef(null);
  
  // Get config
  const { config: tenantConfig } = useConfig();
  
  // Initialize session
  useEffect(() => {
    const initSession = async () => {
      try {
        // Check for existing session
        const existingSession = getFromSession('picasso_session_id');
        if (existingSession) {
          sessionIdRef.current = existingSession;
          const savedMessages = getFromSession('picasso_messages') || [];
          setMessages(savedMessages);
          logger.info('HTTP Provider: Restored existing session', { 
            sessionId: existingSession,
            messageCount: savedMessages.length 
          });
        } else {
          // Generate new session
          sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
          saveToSession('picasso_session_id', sessionIdRef.current);
          
          // Add welcome message if configured
          if (tenantConfig?.welcome_message) {
            // Generate welcome action chips if configured
            const welcomeActions = [];
            if (tenantConfig?.action_chips?.enabled && tenantConfig?.action_chips?.show_on_welcome) {
              const chips = tenantConfig.action_chips.default_chips || [];
              const maxDisplay = tenantConfig.action_chips.max_display || 3;
              welcomeActions.push(...chips.slice(0, maxDisplay));
            }
            
            const welcomeMessage = createAssistantMessage(tenantConfig.welcome_message, {
              id: 'welcome',
              isWelcome: true,
              actions: welcomeActions
            });
            setMessages([welcomeMessage]);
            saveToSession('picasso_messages', [welcomeMessage]);
          }
          
          logger.info('HTTP Provider: Created new session', { 
            sessionId: sessionIdRef.current 
          });
        }
        
        // Initialize conversation manager
        try {
          if (!conversationManagerRef.current) {
            conversationManagerRef.current = createConversationManager(
              tenantHashRef.current,
              sessionIdRef.current
            );
            logger.info('HTTP Provider: Conversation manager initialized', {
              tenantHash: tenantHashRef.current.slice(0, 8) + '...'
            });
          }
        } catch (cmErr) {
          logger.warn('HTTP Provider: Conversation manager initialization failed (non-critical)', cmErr);
        }
        
      } catch (err) {
        logger.error('HTTP Provider: Failed to initialize session', err);
        setError('Failed to initialize chat session');
      } finally {
        setIsInitializing(false);
      }
    };
    
    if (tenantConfig) {
      initSession();
    }
  }, [tenantConfig]);
  
  /**
   * Make HTTP request with timeout and simple retry
   */
  const makeHTTPRequest = async (url, body, retryCount = 0) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
    
    try {
      logger.info(`HTTP Request (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`, { url });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      let data = await response.json();
      
      // Handle double-wrapped Lambda response (outer wrapper)
      if (data.body && typeof data.body === 'string') {
        try {
          data = JSON.parse(data.body);
        } catch (e) {
          logger.warn('Failed to parse outer nested body', e);
        }
      }
      
      // Handle triple-wrapped Lambda response (inner wrapper)
      if (data.body && typeof data.body === 'string') {
        try {
          data = JSON.parse(data.body);
        } catch (e) {
          logger.warn('Failed to parse inner nested body', e);
        }
      }
      
      return data;
      
    } catch (err) {
      clearTimeout(timeoutId);
      
      // Check if it's a timeout
      if (err.name === 'AbortError') {
        logger.error('HTTP Request timeout', { timeout: HTTP_TIMEOUT });
        
        // Retry once on timeout if we haven't exceeded retries
        if (retryCount < MAX_RETRIES) {
          logger.info('Retrying after timeout...');
          return makeHTTPRequest(url, body, retryCount + 1);
        }
        
        throw new Error('Request timed out. Please try again.');
      }
      
      // Network error - retry once
      if (retryCount < MAX_RETRIES && !navigator.onLine) {
        logger.info('Network error, retrying...');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        return makeHTTPRequest(url, body, retryCount + 1);
      }
      
      throw err;
    }
  };
  
  /**
   * Send a message - HTTP implementation
   */
  const sendMessage = useCallback(async (userInput) => {
    console.log('🔵 HTTPChatProvider.sendMessage called with:', userInput);
    if (!userInput?.trim() || isTyping) {
      console.log('🔴 Blocked: empty input or already typing');
      return;
    }
    
    // Add user message immediately
    const userMessage = createUserMessage(userInput);
    setMessages(prev => {
      const updated = [...prev, userMessage];
      saveToSession('picasso_messages', updated);
      return updated;
    });
    
    setIsTyping(true);
    setError(null);
    
    try {
      // Get conversation context from conversation manager (like original ChatProvider)
      const conversationContext = conversationManagerRef.current?.getConversationContext?.() || null;
      const stateToken = conversationManagerRef.current?.stateToken;
      
      logger.info('🧠 Conversation Manager State:', {
        hasManager: !!conversationManagerRef.current,
        hasContext: !!conversationContext,
        stateToken: stateToken ? 'Present' : 'Missing',
        turn: conversationManagerRef.current?.turn || 0
      });
      
      // Prepare request body - matching original ChatProvider structure
      const requestBody = {
        tenant_hash: tenantHashRef.current,
        user_input: userInput,
        session_id: sessionIdRef.current,
        conversation_context: conversationContext,
        conversation_id: conversationManagerRef.current?.conversationId,
        turn: conversationManagerRef.current?.turn,
        // Include these for compatibility
        conversation_history: conversationContext?.recentMessages || [],
        original_user_input: userInput
      };
      
      // Include state token if available (matching original)
      if (stateToken && stateToken !== 'undefined' && stateToken !== 'null') {
        requestBody.state_token = stateToken;
        logger.info('Including state token in HTTP request');
      }
      
      console.log('🔴 Sending request body:', JSON.stringify(requestBody, null, 2));
      
      // Make HTTP request - ensure tenant hash is in URL
      const endpoint = envConfig.CHAT_ENDPOINT || 
        `${envConfig.API_BASE_URL}?action=chat`;
      
      // Add tenant hash to URL if not already there
      const finalEndpoint = endpoint.includes('t=') 
        ? endpoint 
        : `${endpoint}&t=${tenantHashRef.current}`;
      
      console.log('🔵 Final endpoint:', finalEndpoint);
      
      const startTime = Date.now();
      const response = await makeHTTPRequest(finalEndpoint, requestBody);
      const responseTime = Date.now() - startTime;
      
      logger.info(`HTTP Response received in ${responseTime}ms`);
      console.log('🟣 Raw response from Lambda:', response);
      
      // Extract response content
      let assistantContent = response.content || response.message || response.response || 
        'I apologize, but I couldn\'t process your request.';
      console.log('🟣 Extracted content:', assistantContent);
      
      // Handle structured response
      if (typeof assistantContent === 'object') {
        assistantContent = assistantContent.text || JSON.stringify(assistantContent);
      }
      
      // Create assistant message
      const assistantMessage = createAssistantMessage(assistantContent, {
        sessionId: response.session_id,
        responseTime,
        sources: response.sources
      });
      
      // Add assistant message
      setMessages(prev => {
        const updated = [...prev, assistantMessage];
        saveToSession('picasso_messages', updated);
        return updated;
      });
      
      // Update conversation manager
      try {
        if (conversationManagerRef.current) {
          await conversationManagerRef.current.addMessage(userMessage);
          await conversationManagerRef.current.addMessage(assistantMessage);
        }
      } catch (cmErr) {
        logger.warn('Failed to update conversation manager (non-critical)', cmErr);
      }
      
    } catch (err) {
      logger.error('HTTP Provider: Failed to send message', err);
      
      // Add error message
      const errorMessage = createErrorMessage(
        err.message || 'Failed to send message. Please try again.',
        true // canRetry
      );
      
      setMessages(prev => {
        const updated = [...prev, errorMessage];
        saveToSession('picasso_messages', updated);
        return updated;
      });
      
      setError(err.message);
      
    } finally {
      setIsTyping(false);
    }
  }, [messages, isTyping]);
  
  /**
   * Clear all messages
   */
  const clearMessages = useCallback(() => {
    // Clear session
    clearSession();
    
    // Reset session
    sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    saveToSession('picasso_session_id', sessionIdRef.current);
    
    // Restore welcome message and action cards
    const newMessages = [];
    if (tenantConfig?.welcome_message) {
      // Generate welcome action chips if configured
      const welcomeActions = [];
      if (tenantConfig?.action_chips?.enabled && tenantConfig?.action_chips?.show_on_welcome) {
        const chips = tenantConfig.action_chips.default_chips || [];
        const maxDisplay = tenantConfig.action_chips.max_display || 3;
        welcomeActions.push(...chips.slice(0, maxDisplay));
      }
      
      const welcomeMessage = createAssistantMessage(tenantConfig.welcome_message, {
        id: 'welcome',
        isWelcome: true,
        actions: welcomeActions
      });
      newMessages.push(welcomeMessage);
    }
    
    setMessages(newMessages);
    saveToSession('picasso_messages', newMessages);
    
    // Reset conversation manager
    if (conversationManagerRef.current) {
      conversationManagerRef.current.reset();
    }
    
    logger.info('HTTP Provider: Messages cleared and reset to welcome state');
  }, [tenantConfig]);
  
  /**
   * Retry a failed message
   */
  const retryMessage = useCallback(async (messageId) => {
    // Find the user message before the error
    const errorIndex = messages.findIndex(m => m.id === messageId);
    if (errorIndex <= 0) return;
    
    const userMessage = messages[errorIndex - 1];
    if (userMessage.role !== 'user') return;
    
    // Remove error message
    setMessages(prev => prev.filter(m => m.id !== messageId));
    
    // Resend the user message
    await sendMessage(userMessage.content.replace(/<[^>]*>/g, '')); // Strip HTML
  }, [messages, sendMessage]);
  
  /**
   * Update a message
   */
  const updateMessage = useCallback((messageId, updates) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, ...updates } : msg
    ));
  }, []);
  
  /**
   * Add a message (for action chips and user input)
   */
  const addMessage = useCallback(async (message) => {
    console.log('🟡 HTTPChatProvider.addMessage called with:', message);
    // If it's a user message with just content, send it
    if (message.role === 'user' && message.content) {
      console.log('🟡 Calling sendMessage with content:', message.content);
      await sendMessage(message.content);
    } else {
      console.log('🔴 Not a user message or no content:', message);
    }
  }, [sendMessage]);
  
  // Build context value
  const contextValue = {
    // Core state
    messages,
    isTyping,
    sessionId: sessionIdRef.current,
    
    // Core actions
    sendMessage,
    addMessage,
    clearMessages,
    retryMessage,
    updateMessage,
    
    // Metadata
    conversationMetadata: {
      canLoadHistory: false, // HTTP provider doesn't support history loading
      hasMoreHistory: false,
      isLoadingHistory: false
    },
    
    // Loading states
    isInitializing,
    isChatProviderReady: !isInitializing && !!tenantConfig,
    
    // Error state
    error,
    
    // Tenant info
    tenantHash: tenantHashRef.current,
    
    // Render mode for MessageBubble components
    renderMode: 'static',
    
    // Features from config
    features: {
      fileUpload: tenantConfig?.features?.file_upload || false,
      voiceInput: tenantConfig?.features?.voice_input || false,
      actionChips: tenantConfig?.features?.action_chips !== false
    },
    
    // Mobile features (required by StateManagementPanel)
    mobileFeatures: {
      isInitialized: true,
      isPWAInstallable: false,
      isOfflineCapable: 'serviceWorker' in navigator,
      isMobileSafari: /iPad|iPhone|iPod/.test(navigator.userAgent) && /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    }
  };
  
  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
}

// Export for testing
export { HTTPChatProvider };
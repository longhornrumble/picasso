/**
 * Streaming Chat Provider
 * 
 * Pure SSE/EventSource implementation with real-time streaming.
 * - Uses StreamingRegistry for DOM updates
 * - Implements partial message rendering
 * - Supports both SSE and NDJSON formats
 * - Has HTTP fallback if streaming fails
 * 
 * Result: Real-time character-by-character updates
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
import { streamingRegistry } from '../utils/streamingRegistry';
import { createConversationManager } from '../utils/conversationManager';
import { useFormMode } from './FormModeContext';

// Streaming timeout constants
const STREAMING_TIMEOUT = 25000; // 25 seconds (Lambda has 30s limit)
const FIRST_CHUNK_TIMEOUT = 7500; // 7.5 seconds to receive first chunk

/**
 * Core streaming function that handles SSE and NDJSON
 */
async function streamChat({
  url,
  headers,
  body,
  streamingMessageId,
  onStart,
  onChunk,
  onCards, // New callback for handling smart response cards
  onCtaButtons, // New callback for handling CTA buttons
  onDone,
  onError,
  abortControllersRef,
  method = 'POST',
}) {
  logger.info('🚀 Starting streaming request', {
    url,
    method,
    streamingMessageId
  });

  let watchdogId = null;
  let gotFirstChunk = false;
  let totalText = '';
  
  onStart?.();

  const controller = new AbortController();
  if (abortControllersRef && streamingMessageId) {
    abortControllersRef.current.set(streamingMessageId, controller);
  }

  const streamTimeout = setTimeout(() => {
    logger.warn('⏱️ Streaming timeout - aborting');
    controller.abort();
  }, STREAMING_TIMEOUT);

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
      // GET: append params
      const u = new URL(url, window.location.origin);
      if (body?.tenant_hash) u.searchParams.set('t', body.tenant_hash);
      if (body?.session_id) u.searchParams.set('session_id', body.session_id);
      if (body?.user_input) u.searchParams.set('message', body.user_input);
      u.searchParams.set('stream', 'true');
      fetchUrl = u.toString();
    }

    const res = await fetch(fetchUrl, fetchOptions);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    logger.info('🌊 Streaming response received', {
      status: res.status,
      contentType
    });

    // Handle JSON-wrapped SSE (Lambda Function URL response)
    if (contentType.includes('application/json')) {
      const jsonResponse = await res.json();
      
      if (jsonResponse?.body) {
        const sseContent = jsonResponse.body;
        const lines = sseContent.split('\n');
        
        for (const line of lines) {
          if (!line || line.startsWith(':')) continue;
          if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim();
            if (!dataStr || dataStr === '[DONE]') continue;

            let piece = '';
            try {
              const obj = JSON.parse(dataStr);
              piece = obj.content ?? obj.text ?? obj.delta ?? '';
              if (typeof piece === 'object' && piece !== null) {
                piece = piece.content ?? piece.text ?? '';
              }
            } catch {
              piece = dataStr;
            }

            if (piece) {
              totalText += piece;
              if (!gotFirstChunk) gotFirstChunk = true;
              onChunk?.(piece, totalText);
            }
          }
        }

        clearTimeout(streamTimeout);
        onDone?.(totalText || 'I apologize, but I did not receive a proper response.');
        return totalText;
      }
      
      // Plain JSON fallback
      const plain = jsonResponse?.content || jsonResponse?.message || '';
      if (plain) {
        onChunk?.(plain, plain);
        onDone?.(plain);
        return plain;
      }
      
      throw new Error('Unexpected JSON response from streaming endpoint');
    }

    // Handle real streaming response
    if (!res.body || typeof res.body.getReader !== 'function') {
      throw new Error('No readable stream on response');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    // First chunk watchdog
    watchdogId = setTimeout(() => {
      if (!gotFirstChunk) {
        logger.warn('⏱️ No first chunk received - aborting');
        controller.abort();
      }
    }, FIRST_CHUNK_TIMEOUT);

    const emitLines = (str) => {
      const lines = str.split('\n');
      for (let raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith(':')) continue;

        let payload = line;
        if (line.startsWith('data:')) payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const obj = JSON.parse(payload);

          // Debug log all parsed events
          console.log('[StreamingChatProvider] Parsed SSE event:', {
            type: obj.type,
            hasCtaButtons: !!obj.ctaButtons,
            hasCards: !!obj.cards,
            hasContent: !!(obj.content || obj.text || obj.delta)
          });

          // Check if this is a cards event
          if (obj.type === 'cards' && obj.cards) {
            // Handle cards separately
            onCards?.(obj.cards, obj.metadata);
            continue;
          }

          // Check if this is a CTA buttons event
          if (obj.type === 'cta_buttons' && obj.ctaButtons) {
            // Handle CTA buttons separately
            onCtaButtons?.(obj.ctaButtons, obj.metadata);
            continue;
          }

          // Handle regular text content
          let text = obj.content ?? obj.text ?? obj.delta ?? '';
          if (typeof text === 'object' && text !== null) {
            text = text.content ?? text.text ?? '';
          }

          if (text) {
            totalText += text;
            if (!gotFirstChunk) {
              gotFirstChunk = true;
              if (watchdogId) clearTimeout(watchdogId);
            }
            onChunk?.(text, totalText);
          }
        } catch {
          // Plain text fallback
          if (payload) {
            totalText += payload;
            if (!gotFirstChunk) {
              gotFirstChunk = true;
              if (watchdogId) clearTimeout(watchdogId);
            }
            onChunk?.(payload, totalText);
          }
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete lines
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

    clearTimeout(streamTimeout);
    if (watchdogId) clearTimeout(watchdogId);
    onDone?.(totalText);
    return totalText;

  } catch (error) {
    clearTimeout(streamTimeout);
    if (watchdogId) clearTimeout(watchdogId);
    
    // If we got at least one chunk, finalize with what we have
    if (gotFirstChunk && totalText) {
      try { onDone?.(totalText); } catch {}
      return totalText;
    }
    
    onError?.(error);
    throw error;
  } finally {
    clearTimeout(streamTimeout);
    if (watchdogId) clearTimeout(watchdogId);
    if (abortControllersRef && streamingMessageId) {
      abortControllersRef.current.delete(streamingMessageId);
    }
  }
}

export default function StreamingChatProvider({ children }) {
  // Core state
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Session context tracking for forms
  const [sessionContext, setSessionContext] = useState({
    completed_forms: [],
    form_submissions: {}
  });

  // Refs for stable values
  const sessionIdRef = useRef(null);
  const tenantHashRef = useRef(getTenantHash());
  const conversationManagerRef = useRef(null);
  const abortControllersRef = useRef(new Map());
  const pendingCtasRef = useRef(null); // Fix: Use ref instead of closure variable

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
          let savedMessages = getFromSession('picasso_messages') || [];

          // CRITICAL FIX: Always remove welcome message if we have ANY other assistant messages
          // The welcome message persists and interferes with CTA display
          const hasOtherAssistantMessages = savedMessages.some(m =>
            m.role === 'assistant' &&
            m.id !== 'welcome'
          );

          if (hasOtherAssistantMessages) {
            // Remove welcome message to prevent interference
            console.log('[StreamingChatProvider] Filtering out welcome message - have other assistant messages');
            const beforeFilter = savedMessages.length;
            savedMessages = savedMessages.filter(m => m.id !== 'welcome');
            const afterFilter = savedMessages.length;
            console.log('[StreamingChatProvider] Filtered messages:', {
              before: beforeFilter,
              after: afterFilter,
              removed: beforeFilter - afterFilter
            });
          }

          // Debug: Log restored messages and their CTAs
          console.log('[StreamingChatProvider] Restored messages from session:', {
            messageCount: savedMessages.length,
            messagesWithCTAs: savedMessages.filter(m => m.ctaButtons && m.ctaButtons.length > 0).length,
            hadWelcomeFiltered: hasOtherAssistantMessages,
            messages: savedMessages.map(m => ({
              id: m.id,
              role: m.role,
              ctaButtons: m.ctaButtons,
              ctaButtonsLength: m.ctaButtons?.length,
              isWelcome: m.id === 'welcome'
            }))
          });

          // Check raw sessionStorage to see what's actually stored
          const rawStoredItem = sessionStorage.getItem('picasso_messages');
          if (rawStoredItem) {
            try {
              const parsedRaw = JSON.parse(rawStoredItem);
              console.log('[StreamingChatProvider] Raw stored data check on restore:', {
                hasValue: !!parsedRaw.value,
                valueIsArray: Array.isArray(parsedRaw.value),
                messageCount: parsedRaw.value?.length,
                lastMessageHasCtas: !!parsedRaw.value?.[parsedRaw.value.length - 1]?.ctaButtons,
                stringIncludes: rawStoredItem.includes('"ctaButtons"')
              });
            } catch (e) {
              console.error('[StreamingChatProvider] Failed to parse raw storage:', e);
            }
          }

          setMessages(savedMessages);
          logger.info('Streaming Provider: Restored existing session', {
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
          
          logger.info('Streaming Provider: Created new session', { 
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
            logger.info('Streaming Provider: Conversation manager initialized', {
              tenantHash: tenantHashRef.current.slice(0, 8) + '...'
            });
          }
        } catch (cmErr) {
          logger.warn('Streaming Provider: Conversation manager initialization failed (non-critical)', cmErr);
        }
        
      } catch (err) {
        logger.error('Streaming Provider: Failed to initialize session', err);
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
   * HTTP fallback for when streaming fails
   */
  const makeHTTPFallback = async (url, body) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      logger.info('HTTP Fallback: Making request', { url });
      
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
      
      const data = await response.json();
      return data;
      
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  };
  
  /**
   * Send a message - Streaming implementation
   */
  const sendMessage = useCallback(async (userInput) => {
    if (!userInput?.trim() || isTyping) return;

    // Add user message immediately
    const userMessage = createUserMessage(userInput);
    setMessages(prev => {
      const updated = [...prev, userMessage];
      saveToSession('picasso_messages', updated);
      return updated;
    });

    setIsTyping(true);
    setError(null);

    // Create placeholder for streaming
    const streamingMessageId = generateMessageId('bot');
    const placeholder = {
      id: streamingMessageId,
      role: 'assistant',
      content: '', // Empty for streaming
      timestamp: Date.now(),
      isStreaming: true,
      ctaButtons: [], // Initialize empty array for CTAs
      cards: [], // Initialize empty array for cards
      metadata: {
        streamId: streamingMessageId,
        isStreaming: true
      }
    };

    // CTAs will be staged in pendingCtasRef

    setMessages(prev => {
      const updated = [...prev, placeholder];
      saveToSession('picasso_messages', updated);
      return updated;
    });
    
    // Start streaming registry
    streamingRegistry.startStream(streamingMessageId);
    
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
        streaming_message_id: streamingMessageId,
        conversation_context: conversationContext,
        conversation_id: conversationManagerRef.current?.conversationId,
        turn: conversationManagerRef.current?.turn,
        stream: true,
        // Include these for compatibility
        conversation_history: conversationContext?.recentMessages || [],
        original_user_input: userInput,
        // Include session context for form tracking
        session_context: sessionContext
      };
      
      // Include state token if available (matching original)
      if (stateToken && stateToken !== 'undefined' && stateToken !== 'null') {
        requestBody.state_token = stateToken;
        logger.info('Including state token in streaming request');
      }
      
      // Streaming endpoint
      const endpoint = envConfig.STREAMING_ENDPOINT || 
        `${envConfig.API_BASE_URL}?action=stream&t=${tenantHashRef.current}`;
      
      const startTime = Date.now();
      
      // Try streaming first
      await streamChat({
        url: endpoint,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/x-ndjson, application/json'
        },
        body: requestBody,
        streamingMessageId,
        abortControllersRef,
        method: 'POST',
        onStart: () => {
          logger.info('Streaming started', { streamingMessageId });
        },
        onChunk: (delta, total) => {
          // Update via StreamingRegistry for DOM updates
          streamingRegistry.appendChunk(streamingMessageId, delta, total);
        },
        onCards: (cards, metadata) => {
          // Handle smart response cards
          logger.info('Received cards', { count: cards.length, metadata });

          // Update the message with cards (preserving any existing ctaButtons)
          setMessages(prev => {
            const updated = prev.map(msg =>
              msg.id === streamingMessageId
                ? {
                    ...msg,
                    cards: cards,
                    ctaButtons: msg.ctaButtons || [], // Preserve existing ctaButtons
                    metadata: {
                      ...msg.metadata,
                      ...metadata
                    }
                  }
                : msg
            );
            saveToSession('picasso_messages', updated);
            return updated;
          });
        },
        onCtaButtons: (ctaButtons, metadata) => {
          // Stage CTAs for inclusion in onDone - no immediate state update
          logger.info('Received CTA buttons', { count: ctaButtons.length, metadata });

          // Store CTAs in ref for onDone to include in final state update
          pendingCtasRef.current = { ctaButtons, metadata };

          // Debug: Check if pendingCtasRef is actually set
          console.log('[StreamingChatProvider] pendingCtasRef.current after assignment:', pendingCtasRef.current);
        },
        onDone: async (fullText) => {
          const responseTime = Date.now() - startTime;
          logger.info(`Streaming completed in ${responseTime}ms`);

          // Debug: Check if pendingCtasRef survived until onDone
          console.log('[StreamingChatProvider] onDone called, pendingCtasRef state:', {
            hasPendingCtas: !!pendingCtasRef.current,
            pendingCtas: pendingCtasRef.current,
            streamingMessageId: streamingMessageId
          });

          // End streaming
          streamingRegistry.endStream(streamingMessageId);

          // Process final content
          const finalContent = processMessageContent(fullText);

          // SIMPLIFIED: Direct state update with explicit CTA preservation
          setMessages(prev => {
            const updated = prev.map(msg => {
              if (msg.id !== streamingMessageId) return msg;

              // Simple, direct update preserving all fields
              return {
                ...msg,
                content: finalContent,
                isStreaming: false,
                ctaButtons: pendingCtasRef.current?.ctaButtons || [], // Direct reference from ref
                metadata: {
                  ...msg.metadata,
                  ...pendingCtasRef.current?.metadata,
                  isStreaming: false,
                  streamCompleted: true,
                  responseTime,
                  hasCtas: (pendingCtasRef.current?.ctaButtons || []).length > 0,
                  ctaCount: (pendingCtasRef.current?.ctaButtons || []).length
                }
              };
            });


            // Save to session
            saveToSession('picasso_messages', updated);

            // Verify save
            const savedMessages = getFromSession('picasso_messages');
            console.log('[StreamingChatProvider] Messages after save:', {
              savedLength: savedMessages?.length,
              lastSaved: savedMessages?.[savedMessages.length - 1],
              lastSavedCtas: savedMessages?.[savedMessages.length - 1]?.ctaButtons,
              ctasPreserved: savedMessages?.[savedMessages.length - 1]?.ctaButtons?.length > 0
            });

            return updated;
          });

          // REMOVED: Double state update was causing race condition
          // The initial setMessages above is sufficient and atomic

          // Update conversation manager with both user and assistant messages
          try {
            if (conversationManagerRef.current) {
              // Add the user message first
              await conversationManagerRef.current.addMessage(userMessage);

              // Debug: Log what we're about to send to conversation manager
              console.log('[StreamingChatProvider] About to add to conversation manager:', {
                hasPendingCtas: !!pendingCtasRef.current,
                ctaButtonsLength: pendingCtasRef.current?.ctaButtons?.length,
                ctaButtons: pendingCtasRef.current?.ctaButtons
              });

              // Then add the assistant message with CTAs (pendingCtasRef should still be available)
              await conversationManagerRef.current.addMessage({
                ...placeholder,
                content: finalContent,
                isStreaming: false,
                ctaButtons: pendingCtasRef.current?.ctaButtons || [],
                metadata: {
                  ...placeholder.metadata,
                  ...pendingCtasRef.current?.metadata
                }
              });

              logger.info('Added both messages to conversation manager with CTAs:', {
                ctaCount: pendingCtasRef.current?.ctaButtons?.length || 0
              });
            }
          } catch (cmErr) {
            logger.warn('Failed to update conversation manager (non-critical)', cmErr);
          }

          // NOW clear pendingCtasRef after all usage is complete
          pendingCtasRef.current = null;
        },
        onError: async (err) => {
          logger.error('Streaming failed, trying HTTP fallback', err);
          streamingRegistry.endStream(streamingMessageId);
          
          // Try HTTP fallback
          try {
            const httpEndpoint = envConfig.CHAT_ENDPOINT || 
              `${envConfig.API_BASE_URL}?action=chat&t=${tenantHashRef.current}`;
            
            const response = await makeHTTPFallback(httpEndpoint, requestBody);
            const content = response.content || response.message || response.response || 
              'I apologize, but I couldn\'t process your request.';
            
            const finalContent = processMessageContent(content);
            
            // Update with fallback response
            setMessages(prev => {
              const updated = prev.map(msg => 
                msg.id === streamingMessageId 
                  ? {
                      ...msg,
                      content: finalContent,
                      isStreaming: false,
                      metadata: {
                        ...msg.metadata,
                        isStreaming: false,
                        httpFallback: true
                      }
                    }
                  : msg
              );
              saveToSession('picasso_messages', updated);
              return updated;
            });
            
          } catch (fallbackErr) {
            logger.error('HTTP fallback also failed', fallbackErr);
            throw fallbackErr;
          }
        }
      });
      
    } catch (err) {
      logger.error('Streaming Provider: Failed to send message', err);
      streamingRegistry.endStream(streamingMessageId);
      
      // Update placeholder with error
      const errorMessage = createErrorMessage(
        err.message || 'Failed to send message. Please try again.',
        true // canRetry
      );
      
      setMessages(prev => {
        const updated = prev.map(msg => 
          msg.id === streamingMessageId ? errorMessage : msg
        );
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
    // Stop all active streams first
    streamingRegistry.endAll();
    
    // Abort all ongoing requests
    abortControllersRef.current.forEach(controller => {
      controller.abort();
    });
    abortControllersRef.current.clear();
    
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
    
    logger.info('Streaming Provider: Messages cleared and reset to welcome state');
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
    // If it's a user message with just content, send it
    if (message.role === 'user' && message.content) {
      await sendMessage(message.content);
    }
  }, [sendMessage]);

  /**
   * Record form completion in session context
   */
  const recordFormCompletion = useCallback((formId, formData) => {
    logger.info('Recording form completion', { formId, formData });
    setSessionContext(prev => ({
      ...prev,
      completed_forms: [...prev.completed_forms, formId],
      form_submissions: {
        ...prev.form_submissions,
        [formId]: {
          data: formData,
          timestamp: Date.now()
        }
      }
    }));
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop all active streams
      streamingRegistry.endAll();
      
      // Abort all ongoing requests
      abortControllersRef.current.forEach(controller => {
        controller.abort();
      });
      abortControllersRef.current.clear();
    };
  }, []);
  
  // Debug: Log messages state whenever it changes
  useEffect(() => {
    console.log('[StreamingChatProvider] Messages state updated:', {
      messageCount: messages.length,
      messagesWithCTAs: messages.filter(m => m.ctaButtons?.length > 0).map(m => ({
        id: m.id,
        role: m.role,
        ctaButtonsLength: m.ctaButtons.length,
        ctaButtons: m.ctaButtons
      })),
      lastMessage: messages[messages.length - 1],
      lastMessageCtas: messages[messages.length - 1]?.ctaButtons,
      allMessages: messages.map(m => ({
        id: m.id,
        role: m.role,
        hasCtaButtons: !!m.ctaButtons,
        ctaButtonsLength: m.ctaButtons?.length,
        ctaButtonsType: typeof m.ctaButtons,
        ctaButtonsValue: m.ctaButtons
      }))
    });
  }, [messages]);

  // Build context value - using useMemo to control when it changes
  const contextValue = React.useMemo(() => {
    // Debug: Log what we're about to pass in context
    console.log('[StreamingChatProvider] Building context value with messages:', {
      count: messages.length,
      messagesWithCTAs: messages.filter(m => m.ctaButtons?.length > 0).map(m => ({
        id: m.id,
        ctaButtonsLength: m.ctaButtons.length
      })),
      allMessages: messages.map(m => ({
        id: m.id,
        role: m.role,
        hasCTAs: !!m.ctaButtons?.length
      }))
    });

    return {
      // Core state
      messages,
      isTyping,
      sessionId: sessionIdRef.current,
      sessionContext,

      // Core actions
      sendMessage,
      addMessage,
      clearMessages,
      retryMessage,
      updateMessage,
      recordFormCompletion,

    // Metadata
    conversationMetadata: {
      canLoadHistory: false,
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
    renderMode: 'streaming',

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
  }, [messages, isTyping, isInitializing, error, tenantConfig, sessionContext, sendMessage, addMessage, clearMessages, retryMessage, updateMessage, recordFormCompletion]);

  
  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
}

// Export for testing
export { StreamingChatProvider };
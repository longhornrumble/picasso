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
import { useFormMode } from './FormModeContext';
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
            hasShowcaseCard: !!obj.showcaseCard,
            hasContent: !!(obj.content || obj.text || obj.delta)
          });

          // Check if this is a cards event
          if (obj.type === 'cards' && obj.cards) {
            // Handle cards separately
            onCards?.(obj.cards, obj.metadata);
            continue;
          }

          // Check if this is a showcase card event
          if (obj.type === 'showcase_card' && obj.showcaseCard) {
            // Handle showcase card separately
            logger.info('Received showcase card', { showcaseCard: obj.showcaseCard, metadata: obj.metadata });

            // Store showcase card in ref for onDone to include in final state update
            pendingShowcaseCardRef.current = { showcaseCard: obj.showcaseCard, metadata: obj.metadata };

            console.log('[StreamingChatProvider] pendingShowcaseCardRef.current after assignment:', pendingShowcaseCardRef.current);
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

  // Form mode context - get full context for interruption handling
  const formMode = useFormMode();
  const { suspendedForms, getSuspendedForm, resumeForm, cancelForm, clearCompletionState, isFormMode, isSuspended, currentFormId, formConfig } = formMode;

  // Use ref to always have latest form state
  const formModeRef = useRef(formMode);
  useEffect(() => {
    formModeRef.current = formMode;
  }, [formMode]);

  // Session context tracking for forms - load from sessionStorage if available
  const [sessionContext, setSessionContext] = useState(() => {
    console.log('🔍🔍🔍 [StreamingChatProvider] INITIALIZING SESSION CONTEXT 🔍🔍🔍');
    const saved = getFromSession('picasso_session_context');
    console.log('🔍🔍🔍 [StreamingChatProvider] Raw sessionStorage value:', saved);
    if (saved) {
      console.log('🔍🔍🔍 [StreamingChatProvider] ✅ Restored session context from storage:', {
        completed_forms: saved.completed_forms,
        form_count: saved.completed_forms?.length || 0,
        full_data: saved
      });
      return saved;
    }
    console.log('🔍🔍🔍 [StreamingChatProvider] ❌ No saved session context, using empty state');
    return {
      completed_forms: [],
      form_submissions: {}
    };
  });

  // Refs for stable values
  const sessionIdRef = useRef(null);
  const tenantHashRef = useRef(getTenantHash());
  const conversationManagerRef = useRef(null);
  const abortControllersRef = useRef(new Map());
  const pendingCtasRef = useRef(null); // Fix: Use ref instead of closure variable
  const pendingShowcaseCardRef = useRef(null); // Ref for staging showcase card

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
              // Handle both array (legacy) and dictionary (v1.4.1) formats
              const rawChips = tenantConfig.action_chips.default_chips || {};
              const chips = Array.isArray(rawChips) ? rawChips : Object.values(rawChips);
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
   * @param {string} userInput - The user's message text
   * @param {object} metadata - Optional metadata (e.g., CTA tracking)
   */
  const sendMessage = useCallback(async (userInput, metadata = {}) => {
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
      showcaseCard: null, // Initialize null for showcase card
      metadata: {
        streamId: streamingMessageId,
        isStreaming: true
      }
    };

    // CTAs and showcase card will be staged in pendingCtasRef

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
        // Include session context for form tracking - read from sessionStorage to get latest value
        session_context: getFromSession('picasso_session_context') || sessionContext,
        // Include CTA metadata for explicit routing - must be wrapped in routing_metadata object
        routing_metadata: metadata || {}
      };

      // Debug: Log session context and CTA metadata being sent
      const actualSessionContext = getFromSession('picasso_session_context') || sessionContext;
      console.log('[StreamingChatProvider] 📤 Sending request with session_context:', {
        completed_forms: actualSessionContext.completed_forms,
        form_count: actualSessionContext.completed_forms?.length || 0,
        full_context: actualSessionContext
      });

      // Debug: Log CTA metadata if present
      if (metadata.cta_triggered) {
        console.log('[StreamingChatProvider] 🎯 CTA metadata included:', {
          cta_triggered: metadata.cta_triggered,
          cta_id: metadata.cta_id,
          cta_action: metadata.cta_action
        });
      }
      
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

          // Debug: Check if pendingCtasRef and pendingShowcaseCardRef survived until onDone
          console.log('[StreamingChatProvider] onDone called, pending refs state:', {
            hasPendingCtas: !!pendingCtasRef.current,
            pendingCtas: pendingCtasRef.current,
            hasPendingShowcaseCard: !!pendingShowcaseCardRef.current,
            pendingShowcaseCard: pendingShowcaseCardRef.current,
            streamingMessageId: streamingMessageId
          });

          // End streaming
          streamingRegistry.endStream(streamingMessageId);

          // Process final content
          const finalContent = processMessageContent(fullText);

          // FORM INTERRUPTION: Filter CTAs and create CTA buttons if form is suspended
          const rawCtaButtons = pendingCtasRef.current?.ctaButtons || [];
          const rawShowcaseCard = pendingShowcaseCardRef.current?.showcaseCard || null;
          const { isFormMode: formActive, isSuspended: formSuspended, currentFormId: activeFormId, formConfig: activeFormConfig } = formModeRef.current || {};

          console.log('[StreamingChatProvider] 🔍 Form state at CTA finalization:', { formActive, formSuspended, activeFormId, ctaCount: rawCtaButtons.length, hasShowcaseCard: !!rawShowcaseCard });

          let finalCtaButtons = rawCtaButtons;

          if (formActive && formSuspended) {
            // Form is suspended - remove CTAs from Bedrock message
            // The separate resume prompt (lines 841-873) will show interruption buttons
            console.log('[StreamingChatProvider] ⏸️ Form is suspended - removing CTAs from Bedrock message');
            finalCtaButtons = [];
          } else if (formActive && !formSuspended) {
            // Form is active but not suspended - filter out all CTAs
            console.log('[StreamingChatProvider] 📝 Form is active - filtering out all CTAs');
            finalCtaButtons = [];
          }

          // SIMPLIFIED: Direct state update with explicit CTA and showcase card preservation
          setMessages(prev => {
            const updated = prev.map(msg => {
              if (msg.id !== streamingMessageId) return msg;

              // Simple, direct update preserving all fields
              const updatedMsg = {
                ...msg,
                content: finalContent,
                isStreaming: false,
                ctaButtons: finalCtaButtons, // Use filtered CTAs (including interruption buttons)
                showcaseCard: rawShowcaseCard, // Include showcase card if present
                metadata: {
                  ...msg.metadata,
                  ...pendingCtasRef.current?.metadata,
                  ...pendingShowcaseCardRef.current?.metadata,
                  isStreaming: false,
                  streamCompleted: true,
                  responseTime,
                  hasCtas: finalCtaButtons.length > 0,
                  ctaCount: finalCtaButtons.length,
                  hasShowcaseCard: !!rawShowcaseCard
                }
              };

              return updatedMsg;
            });


            // Save to session
            saveToSession('picasso_messages', updated);

            // Verify save
            const savedMessages = getFromSession('picasso_messages');
            console.log('[StreamingChatProvider] Messages after save:', {
              savedLength: savedMessages?.length,
              lastSaved: savedMessages?.[savedMessages.length - 1],
              lastSavedCtas: savedMessages?.[savedMessages.length - 1]?.ctaButtons,
              ctasPreserved: savedMessages?.[savedMessages.length - 1]?.ctaButtons?.length > 0,
              lastSavedShowcaseCard: savedMessages?.[savedMessages.length - 1]?.showcaseCard,
              showcaseCardPreserved: !!savedMessages?.[savedMessages.length - 1]?.showcaseCard
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

              // Then add the assistant message with CTAs and showcase card (use finalCtaButtons with form interruption logic applied)
              await conversationManagerRef.current.addMessage({
                ...placeholder,
                content: finalContent,
                isStreaming: false,
                ctaButtons: finalCtaButtons, // Use filtered CTAs (same as main state update)
                showcaseCard: rawShowcaseCard, // Include showcase card
                metadata: {
                  ...placeholder.metadata,
                  ...pendingCtasRef.current?.metadata,
                  ...pendingShowcaseCardRef.current?.metadata
                }
              });

              logger.info('Added both messages to conversation manager with CTAs and showcase card:', {
                ctaCount: finalCtaButtons.length,
                hasShowcaseCard: !!rawShowcaseCard
              });
            }
          } catch (cmErr) {
            logger.warn('Failed to update conversation manager (non-critical)', cmErr);
          }

          // NOW clear pendingCtasRef and pendingShowcaseCardRef after all usage is complete
          pendingCtasRef.current = null;
          pendingShowcaseCardRef.current = null;

          // CHECK FOR SUSPENDED FORM - Add resume prompt if needed
          // Capture rawCtaButtons before they're cleared (for program switch detection)
          const capturedRawCtas = [...rawCtaButtons];

          setTimeout(() => {
            // Check sessionStorage for suspended forms
            const suspendedFormKeys = [];
            for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i);
              if (key && key.startsWith('picasso_form_')) {
                suspendedFormKeys.push(key);
              }
            }

            console.log('[StreamingChatProvider] Checking for suspended forms after response:', {
              suspendedFormKeys,
              count: suspendedFormKeys.length,
              rawCtasAvailable: capturedRawCtas.length
            });

            if (suspendedFormKeys.length > 0) {
              // Get the first suspended form
              const formStateStr = sessionStorage.getItem(suspendedFormKeys[0]);
              if (formStateStr) {
                const formState = JSON.parse(formStateStr);
                const formId = formState.formId;
                const formTitle = formState.formTitle || 'your application';

                console.log('[StreamingChatProvider] Found suspended form, checking for program switch:', {
                  formId,
                  formState,
                  capturedCtas: capturedRawCtas
                });

                const currentFieldLabel = formState.formConfig?.fields?.[formState.currentFieldIndex]?.label || 'information';

                // Check if there's a CTA for a different program (program switch detection)
                const ctaWithDifferentProgram = capturedRawCtas.find(cta =>
                  cta.formId && cta.formId !== formId && cta.formId !== 'volunteer_apply'
                );

                let resumePromptMessage;

                if (ctaWithDifferentProgram) {
                  // Program switch detected - offer 3 buttons like HTTP
                  // Extract program name from CTA - try multiple patterns
                  let newProgramName = 'this program';

                  if (ctaWithDifferentProgram.text) {
                    // Try "Apply for X" pattern
                    if (ctaWithDifferentProgram.text.startsWith('Apply for ')) {
                      newProgramName = ctaWithDifferentProgram.text.replace('Apply for ', '');
                    }
                    // Try "Would you like to apply to become a X" pattern
                    else if (ctaWithDifferentProgram.text.includes('become a ')) {
                      const match = ctaWithDifferentProgram.text.match(/become a (.+?)\?/);
                      if (match) newProgramName = match[1];
                    }
                    // Fallback to full text
                    else {
                      newProgramName = ctaWithDifferentProgram.text;
                    }
                  } else if (ctaWithDifferentProgram.label) {
                    newProgramName = ctaWithDifferentProgram.label;
                  }

                  // If we got a long sentence, try to get just the program name from formId
                  if (newProgramName.length > 50 || newProgramName.includes('?')) {
                    // Map formId to program name
                    const formIdToName = {
                      'dd_apply': 'Dare to Dream',
                      'lb_apply': 'Love Box',
                      'daretodream_application': 'Dare to Dream',
                      'lovebox_application': 'Love Box'
                    };
                    newProgramName = formIdToName[ctaWithDifferentProgram.formId] || newProgramName;
                  }

                  console.log('[StreamingChatProvider] 🔀 Program switch detected:', {
                    currentForm: formId,
                    newProgram: ctaWithDifferentProgram.formId,
                    newProgramName
                  });

                  resumePromptMessage = {
                    id: generateMessageId('system'),
                    role: 'assistant',
                    content: `I've answered your question about ${newProgramName}. Would you like to apply to ${newProgramName} instead, or continue with your ${formTitle}?`,
                    timestamp: Date.now(),
                    isSystemMessage: true,
                    ctaButtons: [
                      {
                        id: 'switch_form',
                        label: `Apply to ${newProgramName}`,
                        action: 'switch_form',
                        formId: ctaWithDifferentProgram.formId,
                        cancelPreviousForm: formId,
                        style: 'primary'
                      },
                      {
                        id: 'resume_form',
                        label: `Continue ${formTitle}`,
                        action: 'resume_form',
                        formId: formId,
                        style: 'secondary'
                      },
                      {
                        id: 'cancel_form',
                        label: 'Cancel Application',
                        action: 'cancel_form',
                        formId: formId,
                        style: 'secondary'
                      }
                    ],
                    metadata: {
                      isResumePrompt: true,
                      isProgramSwitch: true,
                      formId: formId,
                      newFormId: ctaWithDifferentProgram.formId
                    }
                  };
                } else {
                  // No program switch - standard 2-button resume prompt
                  resumePromptMessage = {
                    id: generateMessageId('system'),
                    role: 'assistant',
                    content: `I've answered your question. Would you like to resume ${formTitle}? We were collecting ${currentFieldLabel}.`,
                    timestamp: Date.now(),
                    isSystemMessage: true,
                    ctaButtons: [
                      {
                        id: 'resume_form',
                        label: `Resume ${formTitle}`,
                        action: 'resume_form',
                        formId: formId,
                        style: 'primary'
                      },
                      {
                        id: 'cancel_form',
                        label: 'Cancel Application',
                        action: 'cancel_form',
                        formId: formId,
                        style: 'secondary'
                      }
                    ],
                    metadata: {
                      isResumePrompt: true,
                      formId: formId
                    }
                  };
                }

                setMessages(prev => {
                  // Remove any existing resume prompts before adding new one
                  const withoutOldPrompts = prev.filter(msg => !msg.metadata?.isResumePrompt);

                  const hasResumePrompt = prev.some(msg => msg.metadata?.isResumePrompt);
                  if (hasResumePrompt) {
                    console.log('[StreamingChatProvider] Removing old resume prompt before adding new one');
                  }

                  const updated = [...withoutOldPrompts, resumePromptMessage];
                  saveToSession('picasso_messages', updated);
                  return updated;
                });
              }
            }
          }, 500); // Small delay to ensure response is fully rendered
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

    // Cancel any active forms and clear form completion state
    if (cancelForm) {
      cancelForm();
    }
    if (clearCompletionState) {
      clearCompletionState();
    }

    // Reset session
    sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    saveToSession('picasso_session_id', sessionIdRef.current);

    // Restore welcome message and action cards
    const newMessages = [];
    if (tenantConfig?.welcome_message) {
      // Generate welcome action chips if configured
      const welcomeActions = [];
      if (tenantConfig?.action_chips?.enabled && tenantConfig?.action_chips?.show_on_welcome) {
        // Handle both array (legacy) and dictionary (v1.4.1) formats
        const rawChips = tenantConfig.action_chips.default_chips || {};
        const chips = Array.isArray(rawChips) ? rawChips : Object.values(rawChips);
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
    if (conversationManagerRef.current && typeof conversationManagerRef.current.resetLocalState === 'function') {
      conversationManagerRef.current.resetLocalState();
    }

    logger.info('Streaming Provider: Messages cleared and reset to welcome state');
  }, [tenantConfig, cancelForm, clearCompletionState]);
  
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
    console.log('[StreamingChatProvider] addMessage called with:', message);

    // If it's an assistant message, add it locally without sending to server
    if (message.role === 'assistant' && message.content) {
      console.log('[StreamingChatProvider] Adding assistant message locally');
      const newMessage = {
        id: `bot_${Date.now()}_${Math.random()}`,
        role: 'assistant',
        content: message.content,
        timestamp: new Date().toISOString(),
        metadata: message.metadata || {},
        // Preserve optional properties for cards and CTA buttons
        ...(message.showcaseCard && { showcaseCard: message.showcaseCard }),
        ...(message.cards && { cards: message.cards }),
        ...(message.ctaButtons && { ctaButtons: message.ctaButtons }),
        ...(message.actions && { actions: message.actions })
      };

      console.log('[StreamingChatProvider] New message object:', newMessage);
      setMessages(prev => {
        const updated = [...prev, newMessage];
        console.log('[StreamingChatProvider] Updated messages array:', updated.length);
        return updated;
      });
      saveToSession([...messages, newMessage]);
      console.log('[StreamingChatProvider] Assistant message added successfully');
      return;
    }

    // If it's a user message with just content, send it
    if (message.role === 'user' && message.content) {
      console.log('[StreamingChatProvider] Sending user message to server');
      await sendMessage(message.content, message.metadata || {});
    }
  }, [sendMessage, messages]);

  /**
   * Submit form data to Lambda for persistence and fulfillment
   * Sends to the streaming endpoint with form_mode: true
   */
  const submitFormToLambda = useCallback(async (formId, formData) => {
    const endpoint = envConfig.STREAMING_ENDPOINT ||
      `${envConfig.API_BASE_URL}?action=stream&t=${tenantHashRef.current}`;

    const requestBody = {
      tenant_hash: tenantHashRef.current,
      form_mode: true,
      action: 'submit_form',
      form_id: formId,
      form_data: formData,
      session_id: sessionIdRef.current,
      conversation_id: sessionIdRef.current // Same as session_id
    };

    logger.info('📤 Submitting form to Lambda', { formId, endpoint });
    console.log('[StreamingChatProvider] 📤 Form submission payload:', requestBody);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[StreamingChatProvider] ❌ Form submission failed:', response.status, errorText);
        throw new Error(`Form submission failed: ${response.status}`);
      }

      // Parse response - handle both streaming and JSON responses
      const contentType = response.headers.get('content-type');
      let result;

      if (contentType?.includes('text/event-stream') || contentType?.includes('application/x-ndjson')) {
        // Handle SSE/streaming response - read until we get the form_complete event
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Look for form_complete in the SSE data
          const lines = buffer.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'form_complete' || data.type === 'form_response') {
                  result = data;
                  console.log('[StreamingChatProvider] ✅ Form submission result:', result);
                }
              } catch (e) {
                // Not JSON, continue
              }
            }
          }
        }
      } else {
        // Standard JSON response
        result = await response.json();
      }

      console.log('[StreamingChatProvider] ✅ Form submitted successfully:', result);
      return result;

    } catch (error) {
      console.error('[StreamingChatProvider] ❌ Form submission error:', error);
      // Don't throw - we still want to update local state even if Lambda fails
      return { status: 'error', error: error.message };
    }
  }, [envConfig]);

  /**
   * Record form completion in session context
   * Extracts program from formData (e.g., "lovebox", "daretodream") for backend filtering
   * Also submits form data to Lambda for persistence and fulfillment
   */
  const recordFormCompletion = useCallback(async (formId, formData) => {
    logger.info('Recording form completion', { formId, formData });

    // Extract program identifier from form data
    // Priority: program_interest field > formId mapping
    let programId = formId; // Default to formId

    if (formData.program_interest) {
      // User selected program from dropdown (e.g., "lovebox", "daretodream", "both", "unsure")
      programId = formData.program_interest;
      console.log('[StreamingChatProvider] 📋 Extracted program from form data:', programId);
    } else if (formId === 'lb_apply') {
      // Love Box specific form
      programId = 'lovebox';
    } else if (formId === 'dd_apply') {
      // Dare to Dream specific form
      programId = 'daretodream';
    }

    // Submit to Lambda for persistence (DynamoDB) and fulfillment (Bubble, email, etc.)
    // This is fire-and-forget - we don't block the UI on Lambda response
    submitFormToLambda(formId, formData).then(result => {
      console.log('[StreamingChatProvider] 📬 Lambda form submission completed:', result);
    }).catch(error => {
      console.error('[StreamingChatProvider] ⚠️ Lambda form submission failed (non-blocking):', error);
    });

    setSessionContext(prev => {
      const updated = {
        ...prev,
        completed_forms: [...prev.completed_forms, programId], // Store program, not formId
        form_submissions: {
          ...prev.form_submissions,
          [formId]: {
            data: formData,
            program: programId, // Track the program for reference
            timestamp: Date.now()
          }
        }
      };
      console.log('[StreamingChatProvider] ✅ Updated session context with program:', {
        formId,
        programId,
        completed_forms: updated.completed_forms,
        total_submissions: Object.keys(updated.form_submissions).length
      });

      // CRITICAL: Persist to sessionStorage so it survives re-renders
      saveToSession('picasso_session_context', updated);
      console.log('🚨🚨🚨 SESSION CONTEXT SAVED TO STORAGE 🚨🚨🚨', updated);

      return updated;
    });
  }, [submitFormToLambda]);
  
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
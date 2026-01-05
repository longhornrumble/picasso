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
import { createConversationManager } from '../utils/conversationManager';
import { MESSAGE_SENT, MESSAGE_RECEIVED } from '../analytics/eventConstants';

/**
 * Emit analytics event via global notifyParentEvent
 * @param {string} eventType - Event type from eventConstants.js
 * @param {Object} payload - Event payload
 */
function emitAnalyticsEvent(eventType, payload) {
  if (typeof window !== 'undefined' && window.notifyParentEvent) {
    window.notifyParentEvent(eventType, payload);
  } else {
    console.warn('[HTTPChatProvider] notifyParentEvent not available for:', eventType);
  }
}

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

  // Form mode context for clearing forms on session timeout
  const { cancelForm } = useFormMode();

  // PHASE 1B: Session context for form completion tracking
  const [sessionContext, setSessionContext] = useState(() => {
    // Try to restore from sessionStorage
    const saved = getFromSession('picasso_session_context');
    return saved || {
      completed_forms: [],
      form_submissions: {}
    };
  });

  // CRITICAL: Use a ref to always have the latest session context value
  // This prevents stale closures in sendMessage
  const sessionContextRef = useRef(sessionContext);
  useEffect(() => {
    sessionContextRef.current = sessionContext;
  }, [sessionContext]);

  // Refs for stable values
  const sessionIdRef = useRef(null);
  const tenantHashRef = useRef(getTenantHash());
  const conversationManagerRef = useRef(null);

  // Get config
  const { config: tenantConfig } = useConfig();

  // PHASE 1B: Persist session context when it changes AND filter CTAs from existing messages
  useEffect(() => {
    saveToSession('picasso_session_context', sessionContext);

    // When completed_forms changes, retroactively filter CTAs from all messages
    const completedPrograms = sessionContext.completed_forms || [];
    if (completedPrograms.length > 0) {
      console.log('[HTTPChatProvider] 🔄 Session context updated. Filtering CTAs from current messages.');

      setMessages(prevMessages => {
        const updatedMessages = prevMessages.map(msg => {
          if (msg.role === 'assistant' && msg.ctaButtons && msg.ctaButtons.length > 0) {
            const originalCTACount = msg.ctaButtons.length;

            const filteredCTAs = msg.ctaButtons.filter(cta => {
              // SPECIAL CASE: volunteer_apply is a multi-program form
              // If user has completed ANY program, hide the generic volunteer_apply CTA
              if (cta.formId === 'volunteer_apply' && completedPrograms.length > 0) {
                console.log(`[HTTPChatProvider] 🚫 Retroactively filtering volunteer_apply CTA because user completed: ${completedPrograms.join(', ')}`, cta);
                return false;
              }

              // Extract program ID from CTA
              let program = cta.program;

              // If no explicit program, try to infer from formId or action
              if (!program) {
                if (cta.formId) {
                  if (cta.formId === 'lovebox_application' || cta.formId === 'lb_apply') {
                    program = 'lovebox';
                  } else if (cta.formId === 'daretodream_application' || cta.formId === 'dd_apply') {
                    program = 'daretodream';
                  } else {
                    program = cta.formId;
                  }
                }
              }

              const shouldKeep = !completedPrograms.includes(program);

              if (!shouldKeep) {
                console.log(`[HTTPChatProvider] 🚫 Retroactively filtering CTA for completed program: ${program}`, cta);
              }

              return shouldKeep;
            });

            if (filteredCTAs.length !== originalCTACount) {
              console.log(`[HTTPChatProvider] ✂️ Updated message CTAs: ${originalCTACount} → ${filteredCTAs.length}`);
              return { ...msg, ctaButtons: filteredCTAs };
            }
          }
          return msg;
        });

        // CRITICAL: Save filtered messages back to sessionStorage
        saveToSession('picasso_messages', updatedMessages);
        return updatedMessages;
      });
    }
  }, [sessionContext]);
  
  // Initialize session
  useEffect(() => {
    const initSession = async () => {
      try {
        // Check for existing session
        const existingSession = getFromSession('picasso_session_id');
        if (existingSession) {
          const savedMessages = getFromSession('picasso_messages') || [];

          // Check if the last message is an error - if so, clear the stale session
          const lastMessage = savedMessages[savedMessages.length - 1];
          const hasErrorMessage = lastMessage && lastMessage.role === 'error';

          // Check session age - clear if older than 1 hour
          const sessionTimestamp = getFromSession('picasso_session_timestamp');
          const sessionAge = sessionTimestamp ? Date.now() - sessionTimestamp : Infinity;
          const isStale = sessionAge > 3600000; // 1 hour

          if (hasErrorMessage || isStale) {
            console.log('[HTTPChatProvider] 🧹 Clearing stale session:', {
              hasError: hasErrorMessage,
              isStale,
              sessionAge: Math.round(sessionAge / 1000) + 's'
            });

            // Clear stale session
            sessionStorage.removeItem('picasso_session_id');
            sessionStorage.removeItem('picasso_messages');
            sessionStorage.removeItem('picasso_session_context');
            sessionStorage.removeItem('picasso_session_timestamp');

            // Start fresh
            sessionIdRef.current = generateSessionId();
            saveToSession('picasso_session_id', sessionIdRef.current);
            saveToSession('picasso_session_timestamp', Date.now());
            setMessages([createWelcomeMessage()]);

            logger.info('HTTP Provider: Started fresh session after clearing stale data', {
              sessionId: sessionIdRef.current.substring(0, 20) + '...'
            });

            return;
          }

          sessionIdRef.current = existingSession;

          // PHASE 1B: Filter CTAs from old messages based on completed_forms
          const sessionCtx = getFromSession('picasso_session_context') || { completed_forms: [] };
          const completedPrograms = sessionCtx.completed_forms || [];

          console.log('[HTTPChatProvider] 🔄 Filtering old messages. Completed programs:', completedPrograms);

          const filteredMessages = savedMessages.map(msg => {
            if (msg.role === 'assistant' && msg.ctaButtons && msg.ctaButtons.length > 0) {
              const originalCTACount = msg.ctaButtons.length;

              const filteredCTAs = msg.ctaButtons.filter(cta => {
                // SPECIAL CASE: volunteer_apply is a multi-program form
                // If user has completed ANY program, hide the generic volunteer_apply CTA
                if (cta.formId === 'volunteer_apply' && completedPrograms.length > 0) {
                  console.log(`[HTTPChatProvider] 🚫 Filtering volunteer_apply CTA because user completed: ${completedPrograms.join(', ')}`, cta);
                  return false;
                }

                // Extract program ID from CTA
                let program = cta.program;

                // If no explicit program, try to infer from formId or action
                if (!program) {
                  if (cta.formId) {
                    if (cta.formId === 'lovebox_application' || cta.formId === 'lb_apply') {
                      program = 'lovebox';
                    } else if (cta.formId === 'daretodream_application' || cta.formId === 'dd_apply') {
                      program = 'daretodream';
                    } else {
                      // Default: use formId as program
                      program = cta.formId;
                    }
                  }
                }

                const shouldKeep = !completedPrograms.includes(program);

                if (!shouldKeep) {
                  console.log(`[HTTPChatProvider] 🚫 Filtering CTA for completed program: ${program}`, cta);
                }

                return shouldKeep;
              });

              if (filteredCTAs.length !== originalCTACount) {
                console.log(`[HTTPChatProvider] ✂️ Filtered message CTAs: ${originalCTACount} → ${filteredCTAs.length}`);
                return { ...msg, ctaButtons: filteredCTAs };
              }
            }
            return msg;
          });

          setMessages(filteredMessages);

          // CRITICAL: Save the filtered messages back to sessionStorage
          saveToSession('picasso_messages', filteredMessages);

          logger.info('HTTP Provider: Restored existing session', {
            sessionId: existingSession,
            messageCount: filteredMessages.length,
            completedPrograms: completedPrograms.length
          });
        } else {
          // Use analytics session ID if available (for form → conversation linking)
          // Fall back to generating a new session ID if analytics not initialized
          sessionIdRef.current = window.analyticsState?.sessionId ||
            `sess_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
          saveToSession('picasso_session_id', sessionIdRef.current);
          saveToSession('picasso_session_timestamp', Date.now());
          
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
      console.log('🔵🔵🔵 RAW data from Lambda:', data);
      console.log('🔵 data.body type:', typeof data.body);
      console.log('🔵 data.body preview:', typeof data.body === 'string' ? data.body.substring(0, 200) : data.body);

      // Handle double-wrapped Lambda response (outer wrapper)
      if (data.body && typeof data.body === 'string') {
        try {
          data = JSON.parse(data.body);
          console.log('🟡 After first unwrap:', Object.keys(data));
        } catch (e) {
          logger.warn('Failed to parse outer nested body', e);
        }
      }

      // Handle triple-wrapped Lambda response (inner wrapper)
      if (data.body && typeof data.body === 'string') {
        try {
          data = JSON.parse(data.body);
          console.log('🟢 After second unwrap:', Object.keys(data));
        } catch (e) {
          logger.warn('Failed to parse inner nested body', e);
        }
      }

      console.log('🟣 Final data keys:', Object.keys(data));
      console.log('🟣 Final data.ctaButtons:', data.ctaButtons);
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
   * @param {string} userInput - The user's message text
   * @param {object} metadata - Optional metadata (e.g., CTA tracking)
   */
  const sendMessage = useCallback(async (userInput, metadata = {}) => {
    console.log('🔵 HTTPChatProvider.sendMessage called with:', userInput);
    if (!userInput?.trim() || isTyping) {
      console.log('🔴 Blocked: empty input or already typing');
      return;
    }
    
    // Add user message immediately
    const userMessage = createUserMessage(userInput);
    const messageStartTime = Date.now();
    const stepNumber = messages.length + 1; // Current step in conversation

    setMessages(prev => {
      const updated = [...prev, userMessage];
      saveToSession('picasso_messages', updated);
      return updated;
    });

    // Emit MESSAGE_SENT analytics event
    emitAnalyticsEvent(MESSAGE_SENT, {
      content_preview: userInput.substring(0, 500),
      content_length: userInput.length,
      step_number: stepNumber
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

      // PHASE 1B: Check for suspended forms before sending request
      const suspendedForms = [];
      let suspendedProgramInterest = null; // Track program_interest from volunteer form

      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('picasso_form_')) {
          try {
            const formState = JSON.parse(sessionStorage.getItem(key));
            if (formState && formState.formId) {
              suspendedForms.push(formState.formId);

              // If this is the volunteer form and user has selected a program_interest, capture it
              if (formState.formData && formState.formData.program_interest) {
                suspendedProgramInterest = formState.formData.program_interest;
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }

      // Build enhanced session context with suspended forms
      const enhancedSessionContext = {
        ...sessionContextRef.current,
        suspended_forms: suspendedForms,
        program_interest: suspendedProgramInterest // Send the program they selected
      };

      logger.info('[HTTPProvider] Session context with suspended forms', {
        completed_forms: enhancedSessionContext.completed_forms || [],
        suspended_forms: enhancedSessionContext.suspended_forms || []
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
        original_user_input: userInput,
        // PHASE 1B: Include session context for form tracking (with suspended forms)
        session_context: enhancedSessionContext,
        // Include CTA metadata for explicit routing
        ...metadata
      };
      
      // Include state token if available (matching original)
      if (stateToken && stateToken !== 'undefined' && stateToken !== 'null') {
        requestBody.state_token = stateToken;
        logger.info('Including state token in HTTP request');
      }

      // Debug: Log CTA metadata if present
      if (metadata.cta_triggered) {
        console.log('[HTTPChatProvider] 🎯 CTA metadata included:', {
          cta_triggered: metadata.cta_triggered,
          cta_id: metadata.cta_id,
          cta_action: metadata.cta_action
        });
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

      // Extract content early for analytics (before processing)
      const rawContent = response.content || response.message || response.response || '';

      // Emit MESSAGE_RECEIVED analytics event
      emitAnalyticsEvent(MESSAGE_RECEIVED, {
        content_preview: (typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent)).substring(0, 500),
        content_length: typeof rawContent === 'string' ? rawContent.length : JSON.stringify(rawContent).length,
        response_time_ms: responseTime,
        step_number: stepNumber
      });
      console.log('🟣🟣🟣 Raw response from Lambda:', response);
      console.log('🟣 Response keys:', Object.keys(response));
      console.log('🟣 response.ctaButtons:', response.ctaButtons);
      console.log('🟣 response.cta_buttons:', response.cta_buttons);
      console.log('🟣 response.cards:', response.cards);

      // Extract response content
      let assistantContent = response.content || response.message || response.response ||
        'I apologize, but I couldn\'t process your request.';
      console.log('🟣 Extracted content:', assistantContent);

      // Handle structured response
      if (typeof assistantContent === 'object') {
        assistantContent = assistantContent.text || JSON.stringify(assistantContent);
      }

      // PHASE 1B FIX: If content is already wrapped in HTML (from backend), extract the raw markdown
      // The frontend's processMessageContent() expects raw markdown, not HTML with markdown inside
      if (typeof assistantContent === 'string' && assistantContent.includes('<div class="streaming-formatted">')) {
        // Remove the HTML wrapper to get raw markdown
        assistantContent = assistantContent
          .replace(/<div class="streaming-formatted">/g, '')
          .replace(/<\/div>/g, '')
          .replace(/<p>/g, '\n')
          .replace(/<\/p>/g, '\n')
          .trim();
        console.log('🟣 Unwrapped HTML to get raw markdown');
      }

      // PHASE 1B: Extract CTAs/cards from response (prioritize ctaButtons for parity with streaming)
      const ctaButtons = response.ctaButtons || response.cta_buttons || response.cards || [];
      console.log('🟣🟣🟣 Extracted CTAs/cards:', ctaButtons);
      console.log('🟣 CTA count:', ctaButtons.length);
      console.log('🟣 User asked:', userInput);

      // Create assistant message
      const assistantMessage = createAssistantMessage(assistantContent, {
        sessionId: response.session_id,
        responseTime: responseTime,  // Explicit syntax to avoid potential ESBuild minification issues
        sources: response.sources,
        ctaButtons: ctaButtons  // PHASE 1B: Include CTAs
      });
      
      // Add assistant message
      setMessages(prev => {
        const updated = [...prev, assistantMessage];
        saveToSession('picasso_messages', updated);
        saveToSession('picasso_session_timestamp', Date.now()); // Update session timestamp on successful message
        return updated;
      });

      // PHASE 1B: Check for suspended forms and add resume prompt (with intelligent program switching)
      setTimeout(() => {
        // Check if backend detected a program switch opportunity
        const metadata = response.metadata || {};
        const programSwitchDetected = metadata.program_switch_detected;

        // Check sessionStorage for suspended forms
        const suspendedFormKeys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith('picasso_form_')) {
            suspendedFormKeys.push(key);
          }
        }

        logger.info('[HTTPProvider] Checking for suspended forms after response', {
          suspendedFormKeys,
          count: suspendedFormKeys.length,
          programSwitchDetected
        });

        if (suspendedFormKeys.length > 0) {
          // Get the first suspended form
          const formStateStr = sessionStorage.getItem(suspendedFormKeys[0]);
          if (formStateStr) {
            try {
              const formState = JSON.parse(formStateStr);
              const formId = formState.formId;

              logger.info('[HTTPProvider] Found suspended form, adding resume prompt', {
                formId,
                formState,
                programSwitchDetected
              });

              const currentFieldLabel = formState.formConfig?.fields?.[formState.currentFieldIndex]?.label || 'information';
              const formTitle = formState.formTitle || 'your application';

              // PHASE 1B: Smart form switching - offer to switch programs if detected
              if (programSwitchDetected && metadata.new_form_of_interest) {
                const newFormInfo = metadata.new_form_of_interest;
                const suspendedFormInfo = metadata.suspended_form;

                logger.info('[HTTPProvider] 🔀 Program switch detected, showing enhanced options', {
                  newProgram: newFormInfo.program_name,
                  suspendedProgram: suspendedFormInfo.program_name
                });

                // Create enhanced resume prompt with switch option
                const resumeMessage = createAssistantMessage(
                  `I've answered your question about ${newFormInfo.program_name}. Would you like to apply to ${newFormInfo.program_name} instead, or continue with your ${suspendedFormInfo.program_name} application?`,
                  {
                    id: `resume_prompt_${Date.now()}`,
                    ctaButtons: [
                      {
                        label: newFormInfo.cta_text,
                        action: 'switch_form',
                        formId: newFormInfo.form_id,
                        fields: newFormInfo.fields,
                        cancelPreviousForm: formId,  // Will cancel suspended form
                        style: 'primary'
                      },
                      {
                        label: `Continue ${suspendedFormInfo.program_name}`,
                        action: 'resume_form',
                        formId: formId,
                        style: 'secondary'
                      },
                      {
                        label: 'Cancel Application',
                        action: 'cancel_form',
                        formId: formId,
                        style: 'secondary'
                      }
                    ]
                  }
                );

                setMessages(prev => {
                  const updated = [...prev, resumeMessage];
                  saveToSession('picasso_messages', updated);
                  return updated;
                });
              } else {
                // No program switch - show standard resume prompt
                const resumeMessage = createAssistantMessage(
                  `I've answered your question. Would you like to resume ${formTitle}? We were collecting ${currentFieldLabel}.`,
                  {
                    id: `resume_prompt_${Date.now()}`,
                    ctaButtons: [
                      {
                        label: `Resume ${formTitle}`,
                        action: 'resume_form',
                        formId: formId,
                        style: 'primary'
                      },
                      {
                        label: 'Cancel Application',
                        action: 'cancel_form',
                        formId: formId,
                        style: 'secondary'
                      }
                    ]
                  }
                );

                setMessages(prev => {
                  const updated = [...prev, resumeMessage];
                  saveToSession('picasso_messages', updated);
                  return updated;
                });
              }
            } catch (parseErr) {
              logger.error('[HTTPProvider] Failed to parse suspended form state', parseErr);
            }
          }
        }
      }, 500);

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

    // Cancel any active forms
    if (cancelForm) {
      cancelForm();
    }

    // Reset session - generate new analytics-compatible session ID
    // Use same format as analytics (sess_<timestamp36>_<random>) for form→conversation linking
    sessionIdRef.current = `sess_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
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
    if (conversationManagerRef.current) {
      conversationManagerRef.current.reset();
    }

    logger.info('HTTP Provider: Messages cleared and reset to welcome state');
  }, [tenantConfig, cancelForm]);
  
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

  /**
   * Submit form data to Lambda for persistence and fulfillment
   * Sends to the API endpoint with form_mode: true
   */
  const submitFormToLambda = useCallback(async (formId, formData) => {
    const endpoint = envConfig.CHAT_ENDPOINT ||
      `${envConfig.API_BASE_URL}?action=chat&t=${tenantHashRef.current}`;

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
    console.log('[HTTPChatProvider] 📤 Form submission payload:', requestBody);

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
        console.error('[HTTPChatProvider] ❌ Form submission failed:', response.status, errorText);
        throw new Error(`Form submission failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('[HTTPChatProvider] ✅ Form submitted successfully:', result);
      return result;

    } catch (error) {
      console.error('[HTTPChatProvider] ❌ Form submission error:', error);
      // Don't throw - we still want to update local state even if Lambda fails
      return { status: 'error', error: error.message };
    }
  }, []);

  /**
   * PHASE 1B: Record form completion in session context
   * Extracts program from formData (e.g., "lovebox", "daretodream") for backend filtering
   * Also submits form data to Lambda for persistence and fulfillment
   */
  const recordFormCompletion = useCallback(async (formId, formData) => {
    console.log('[HTTPChatProvider] 🎯 recordFormCompletion called:', { formId, formData });
    console.log('[HTTPChatProvider] 🔍 formData.program_interest:', formData.program_interest);
    logger.info('Recording form completion', { formId, formData });

    // Extract program identifier from form data
    // Priority: program_interest field > formId mapping
    let programId = formId; // Default to formId

    if (formData.program_interest) {
      programId = formData.program_interest.toLowerCase().replace(/\s+/g, '');
      console.log('[HTTPChatProvider] ✅ Using program_interest from form:', programId);
    } else if (formId === 'lovebox_application' || formId === 'lb_apply') {
      programId = 'lovebox';
      console.log('[HTTPChatProvider] ✅ Mapped lb_apply to lovebox');
    } else if (formId === 'daretodream_application' || formId === 'dd_apply') {
      programId = 'daretodream';
      console.log('[HTTPChatProvider] ✅ Mapped dd_apply to daretodream');
    } else {
      console.log('[HTTPChatProvider] ⚠️ No mapping found, using formId as program:', programId);
    }

    console.log('[HTTPChatProvider] 📝 Final extracted program ID:', programId);

    // Submit to Lambda for persistence (DynamoDB) and fulfillment (Bubble, email, etc.)
    // This is fire-and-forget - we don't block the UI on Lambda response
    submitFormToLambda(formId, formData).then(result => {
      console.log('[HTTPChatProvider] 📬 Lambda form submission completed:', result);
    }).catch(error => {
      console.error('[HTTPChatProvider] ⚠️ Lambda form submission failed (non-blocking):', error);
    });

    setSessionContext(prev => {
      console.log('[HTTPChatProvider] 📊 Previous session context:', prev);

      // Check if this program is already in completed_forms to avoid duplicates
      const existingForms = prev.completed_forms || [];
      const isAlreadyCompleted = existingForms.includes(programId);

      if (isAlreadyCompleted) {
        console.log('[HTTPChatProvider] ⚠️ Program already marked as completed, skipping duplicate:', programId);
        return prev; // Don't update if already completed
      }

      const updated = {
        ...prev,
        completed_forms: [...existingForms, programId], // Store program, not formId
        form_submissions: {
          ...(prev.form_submissions || {}),
          [formId]: {
            data: formData,
            program: programId, // Track the program for reference
            timestamp: Date.now()
          }
        }
      };
      console.log('[HTTPChatProvider] ✅ Updated session context with program:', {
        formId,
        programId,
        completed_forms: updated.completed_forms,
        total_submissions: Object.keys(updated.form_submissions).length
      });

      // CRITICAL: Persist to sessionStorage so it survives re-renders
      saveToSession('picasso_session_context', updated);
      console.log('[HTTPChatProvider] 💾 Persisted session context to sessionStorage:', updated);

      // Verify it was saved
      const verified = getFromSession('picasso_session_context');
      console.log('[HTTPChatProvider] ✅ Verified sessionStorage contains:', verified);

      return updated;
    });
  }, [submitFormToLambda, setSessionContext]);

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
    recordFormCompletion, // PHASE 1B: Form completion tracking
    
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
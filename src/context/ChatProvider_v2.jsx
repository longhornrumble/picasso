import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { ConfigContext } from './ConfigProvider';
import StreamingRegistry from '../utils/StreamingRegistry';
import { generateUniqueId } from '../utils/helpers';
import { markdownToHTML } from '../utils/markdownToHTML';
import DOMPurify from 'dompurify';
import environmentConfig from '../config/environment';

const ChatContext = createContext();

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

export const ChatProvider = ({ children }) => {
  const { config, tenantHash } = useContext(ConfigContext);
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [messageMetadata, setMessageMetadata] = useState({});
  const streamingStateRef = useRef({});
  const eventSourceRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Session initialization
  useEffect(() => {
    const storedSessionId = sessionStorage.getItem('picasso_session_id');
    const storedMessages = sessionStorage.getItem('picasso_messages');
    const sessionTimestamp = sessionStorage.getItem('picasso_session_timestamp');
    
    const now = Date.now();
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    
    if (storedSessionId && sessionTimestamp && (now - parseInt(sessionTimestamp)) < SESSION_TIMEOUT) {
      setSessionId(storedSessionId);
      if (storedMessages) {
        try {
          const parsedMessages = JSON.parse(storedMessages);
          setMessages(parsedMessages);
        } catch (e) {
          console.error('Failed to parse stored messages:', e);
        }
      }
    } else {
      const newSessionId = generateUniqueId();
      setSessionId(newSessionId);
      sessionStorage.setItem('picasso_session_id', newSessionId);
      sessionStorage.setItem('picasso_session_timestamp', now.toString());
    }
  }, []);

  // Save messages to session storage
  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem('picasso_messages', JSON.stringify(messages));
      sessionStorage.setItem('picasso_session_timestamp', Date.now().toString());
    }
  }, [messages]);

  /**
   * Try streaming first with EventSource, fallback to HTTP if needed
   */
  const streamChat = useCallback(async (userInput) => {
    const messageId = generateUniqueId();
    const streamId = generateUniqueId();
    const startTime = Date.now();
    
    // Telemetry tracking
    const telemetry = {
      firstChunkMs: null,
      totalChunks: 0,
      fellBack: false,
      startTime
    };

    // Add user message
    const userMessage = {
      id: generateUniqueId(),
      type: 'user',
      content: userInput,
      timestamp: new Date().toISOString()
    };

    // Add assistant placeholder with streaming metadata
    const assistantMessage = {
      id: messageId,
      type: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
      streamId,
      metadata: { dataStreamId: streamId }
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsTyping(true);

    // Initialize streaming state
    streamingStateRef.current[streamId] = {
      content: '',
      isActive: true
    };
    StreamingRegistry.createStream(streamId);

    // Prepare request data
    const requestData = {
      tenant_hash: tenantHash,
      session_id: sessionId,
      user_input: userInput,
      conversation_context: {
        recentMessages: messages.slice(-10).map(msg => ({
          type: msg.type,
          content: msg.content?.substring(0, 500)
        }))
      }
    };

    // Feature flag for streaming (default on)
    const streamingEnabled = config?.features?.streaming !== false;
    
    if (!streamingEnabled) {
      console.log('⚠️ Streaming disabled by config, using HTTP fallback');
      return fallbackToHttp(requestData, messageId, streamId, telemetry);
    }

    // Try streaming with EventSource
    try {
      const streamingUrl = environmentConfig.getStreamingUrl(tenantHash);
      const queryParams = new URLSearchParams({
        tenant_hash: tenantHash,
        session_id: sessionId
      });
      
      console.log('🚀 Attempting SSE streaming via EventSource');
      
      // Set up TTFB guard - abort if no data within 500ms
      const ttfbTimeout = setTimeout(() => {
        console.log('⏱️ TTFB timeout - falling back to HTTP');
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }
        telemetry.fellBack = true;
        fallbackToHttp(requestData, messageId, streamId, telemetry);
      }, 500);

      // Create EventSource for SSE
      eventSourceRef.current = new EventSource(`${streamingUrl}?${queryParams}`);
      
      // Send the actual message via POST (EventSource is GET-only)
      // We need to coordinate this with the server
      fetch(streamingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(requestData)
      }).catch(err => {
        console.error('Failed to send POST with message:', err);
      });

      let hasReceivedData = false;

      eventSourceRef.current.onmessage = (event) => {
        // Clear TTFB guard on first data
        if (!hasReceivedData) {
          clearTimeout(ttfbTimeout);
          hasReceivedData = true;
          telemetry.firstChunkMs = Date.now() - startTime;
          console.log(`⚡ First chunk received in ${telemetry.firstChunkMs}ms`);
        }

        if (event.data === '[DONE]') {
          // Stream complete - finalize message
          console.log('✅ Stream complete');
          finalizeStream(messageId, streamId, telemetry);
          eventSourceRef.current.close();
          return;
        }

        try {
          const data = JSON.parse(event.data);
          if (data.type === 'text' && data.content) {
            telemetry.totalChunks++;
            
            // Append to streaming registry (triggers DOM update)
            StreamingRegistry.append(streamId, data.content);
            
            // Track accumulated content
            if (streamingStateRef.current[streamId]) {
              streamingStateRef.current[streamId].content += data.content;
            }
          } else if (data.type === 'error') {
            console.error('Stream error:', data.error);
            throw new Error(data.error);
          }
        } catch (e) {
          console.error('Failed to parse SSE data:', e);
        }
      };

      eventSourceRef.current.onerror = (error) => {
        clearTimeout(ttfbTimeout);
        console.error('EventSource error:', error);
        eventSourceRef.current.close();
        
        if (!hasReceivedData) {
          // Never got any data - fallback to HTTP
          telemetry.fellBack = true;
          fallbackToHttp(requestData, messageId, streamId, telemetry);
        } else {
          // Got some data but stream failed - finalize what we have
          finalizeStream(messageId, streamId, telemetry);
        }
      };

      // Also listen for performance comments from server
      eventSourceRef.current.addEventListener('comment', (event) => {
        if (event.data?.startsWith('x-first-token-ms=')) {
          const ms = parseInt(event.data.split('=')[1]);
          console.log(`📊 Server first token: ${ms}ms`);
        }
      });

    } catch (error) {
      console.error('Streaming setup failed:', error);
      telemetry.fellBack = true;
      return fallbackToHttp(requestData, messageId, streamId, telemetry);
    }
  }, [config, tenantHash, sessionId, messages]);

  /**
   * Fallback to regular HTTP chat endpoint
   */
  const fallbackToHttp = useCallback(async (requestData, messageId, streamId, telemetry) => {
    console.log('📡 Using HTTP fallback');
    
    try {
      const chatUrl = environmentConfig.getChatUrl(tenantHash);
      
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
        signal: AbortSignal.timeout(25000) // 25 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Process the complete response
      const fullContent = data.response || data.message || '';
      const sanitizedHTML = markdownToHTML(fullContent);
      
      // Update message with complete content
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? {
              ...msg,
              content: fullContent,
              html: sanitizedHTML,
              isStreaming: false,
              metadata: {
                ...msg.metadata,
                fallbackUsed: true,
                telemetry
              }
            }
          : msg
      ));

      // Clean up streaming state
      if (streamingStateRef.current[streamId]) {
        delete streamingStateRef.current[streamId];
      }
      StreamingRegistry.complete(streamId);
      
    } catch (error) {
      console.error('HTTP fallback failed:', error);
      
      // Update message with error
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? {
              ...msg,
              content: 'Sorry, I encountered an error processing your request. Please try again.',
              isStreaming: false,
              error: true
            }
          : msg
      ));
    } finally {
      setIsTyping(false);
    }
  }, [tenantHash]);

  /**
   * Finalize a streaming message
   */
  const finalizeStream = useCallback((messageId, streamId, telemetry) => {
    const streamState = streamingStateRef.current[streamId];
    if (!streamState) return;

    const fullContent = streamState.content;
    const sanitizedHTML = markdownToHTML(fullContent);
    
    // Update message to finalized state
    setMessages(prev => prev.map(msg => 
      msg.id === messageId 
        ? {
            ...msg,
            content: fullContent,
            html: sanitizedHTML,
            isStreaming: false,
            metadata: {
              ...msg.metadata,
              telemetry
            }
          }
        : msg
    ));

    // Clean up
    delete streamingStateRef.current[streamId];
    StreamingRegistry.complete(streamId);
    setIsTyping(false);

    // Log telemetry
    console.log('📊 Streaming telemetry:', {
      firstChunkMs: telemetry.firstChunkMs,
      totalChunks: telemetry.totalChunks,
      fellBack: telemetry.fellBack,
      totalTime: Date.now() - telemetry.startTime
    });
  }, []);

  /**
   * Regular HTTP chat (non-streaming)
   */
  const sendMessage = useCallback(async (userInput) => {
    // If streaming is available and not explicitly disabled, use streamChat
    if (config?.features?.streaming !== false) {
      return streamChat(userInput);
    }

    // Otherwise use regular HTTP
    const messageId = generateUniqueId();
    
    const userMessage = {
      id: generateUniqueId(),
      type: 'user',
      content: userInput,
      timestamp: new Date().toISOString()
    };

    const assistantMessage = {
      id: messageId,
      type: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isLoading: true
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsTyping(true);

    try {
      const chatUrl = environmentConfig.getChatUrl(tenantHash);
      
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tenant_hash: tenantHash,
          session_id: sessionId,
          user_input: userInput
        }),
        signal: AbortSignal.timeout(25000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const fullContent = data.response || data.message || '';
      const sanitizedHTML = markdownToHTML(fullContent);
      
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? {
              ...msg,
              content: fullContent,
              html: sanitizedHTML,
              isLoading: false
            }
          : msg
      ));
      
    } catch (error) {
      console.error('Chat error:', error);
      
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? {
              ...msg,
              content: 'Sorry, I encountered an error. Please try again.',
              isLoading: false,
              error: true
            }
          : msg
      ));
    } finally {
      setIsTyping(false);
    }
  }, [config, tenantHash, sessionId, streamChat]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const value = {
    messages,
    setMessages,
    sendMessage,
    isTyping,
    sessionId,
    messageMetadata,
    setMessageMetadata
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export default ChatProvider;
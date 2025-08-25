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
   * Stream chat with proper SSE using fetch + reader (POST support)
   */
  const streamChat = useCallback(async (userInput) => {
    const messageId = generateUniqueId();
    const streamId = generateUniqueId();
    const startTime = Date.now();
    
    // Telemetry
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

    // Feature flag for streaming
    const streamingEnabled = config?.features?.streaming !== false;
    
    if (!streamingEnabled) {
      console.log('⚠️ Streaming disabled by config');
      return fallbackToHttp(requestData, messageId, streamId, telemetry);
    }

    // Try streaming with fetch + reader (supports POST)
    try {
      const streamingUrl = environmentConfig.getStreamingUrl(tenantHash);
      console.log('🚀 Starting SSE streaming to:', streamingUrl);
      
      // Create abort controller with timeout
      const controller = new AbortController();
      abortControllerRef.current = controller;
      
      // TTFB guard - 500ms timeout
      const ttfbTimeout = setTimeout(() => {
        console.log('⏱️ TTFB timeout (500ms) - falling back to HTTP');
        controller.abort();
        telemetry.fellBack = true;
        fallbackToHttp(requestData, messageId, streamId, telemetry);
      }, 500);

      // Make the streaming request
      const response = await fetch(streamingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(requestData),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check content type
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('text/event-stream')) {
        console.warn('⚠️ Response is not SSE, falling back');
        throw new Error('Not an SSE response');
      }

      // Get the reader for streaming
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let hasReceivedData = false;

      // Process the stream
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('✅ Stream complete');
          break;
        }

        // Clear TTFB timeout on first data
        if (!hasReceivedData) {
          clearTimeout(ttfbTimeout);
          hasReceivedData = true;
          telemetry.firstChunkMs = Date.now() - startTime;
          console.log(`⚡ First chunk in ${telemetry.firstChunkMs}ms`);
        }

        // Decode chunk
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            
            if (data === '[DONE]') {
              console.log('✅ Received [DONE] marker');
              finalizeStream(messageId, streamId, telemetry);
              continue;
            }
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'text' && parsed.content) {
                telemetry.totalChunks++;
                
                // Append to streaming registry (triggers DOM update)
                StreamingRegistry.append(streamId, parsed.content);
                
                // Track accumulated content
                if (streamingStateRef.current[streamId]) {
                  streamingStateRef.current[streamId].content += parsed.content;
                }
              } else if (parsed.type === 'error') {
                console.error('Stream error:', parsed.error);
                throw new Error(parsed.error);
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e, data);
            }
          } else if (line.startsWith(': x-first-token-ms=')) {
            const ms = parseInt(line.substring(19));
            console.log(`📊 Server first token: ${ms}ms`);
          } else if (line.startsWith(': x-total-tokens=')) {
            const tokens = parseInt(line.substring(17));
            console.log(`📊 Total tokens: ${tokens}`);
          } else if (line === ':ok' || line === ':hb') {
            console.log(`💓 Received: ${line}`);
          }
        }
      }

    } catch (error) {
      console.error('Streaming error:', error);
      
      if (!telemetry.fellBack) {
        telemetry.fellBack = true;
        return fallbackToHttp(requestData, messageId, streamId, telemetry);
      }
    } finally {
      if (abortControllerRef.current) {
        abortControllerRef.current = null;
      }
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
   * Send message - always uses streaming if available
   */
  const sendMessage = useCallback(async (userInput) => {
    return streamChat(userInput);
  }, [streamChat]);

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
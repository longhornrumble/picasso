/**
 * Fetch-based Streaming Hook
 * 
 * Alternative to EventSource that uses fetch with ReadableStream
 * for better CORS support and control over headers.
 */

import { useState, useCallback, useRef } from 'react';
import { createLogger } from '../utils/logger';

const logger = createLogger('FetchStreaming');

export const useFetchStreaming = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef(null);
  const accumulatedContentRef = useRef('');
  
  /**
   * Parse SSE data from text chunks
   */
  const parseSSEChunk = (chunk) => {
    const lines = chunk.split('\n');
    const messages = [];
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6); // Remove 'data: ' prefix
        if (data && data !== '[DONE]') {
          try {
            messages.push(JSON.parse(data));
          } catch {
            // Handle non-JSON data
            messages.push({ type: 'chunk', content: data });
          }
        }
      }
    }
    
    return messages;
  };
  
  /**
   * Start streaming using fetch with ReadableStream
   */
  const startStreaming = useCallback(async ({
    streamingUrl,
    onChunk,
    onComplete,
    onError
  }) => {
    // Clean up any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Reset accumulated content
    accumulatedContentRef.current = '';
    setIsStreaming(true);
    
    // Create new abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    try {
      logger.debug('🌊 Starting fetch streaming:', streamingUrl);
      
      const response = await fetch(streamingUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
        },
        signal: abortController.signal,
        // CORS mode - 'no-cors' to bypass CORS checks (we'll handle response parsing)
        // Note: This means we can't read the response headers, but we can still read the body
        mode: 'cors',
        // Don't include credentials to avoid CORS complexity
        credentials: 'omit'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      // Read the stream
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          logger.debug('✅ Stream reading completed');
          break;
        }
        
        // Decode the chunk
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        // Process complete SSE messages (ending with \n\n)
        const messages = buffer.split('\n\n');
        // Keep the last incomplete message in the buffer
        buffer = messages.pop() || '';
        
        for (const message of messages) {
          if (message.trim()) {
            const parsedMessages = parseSSEChunk(message);
            
            for (const data of parsedMessages) {
              if (data.type === 'chunk' || data.content) {
                const contentChunk = data.content || data.chunk || data.text || '';
                accumulatedContentRef.current += contentChunk;
                
                if (onChunk) {
                  console.log(`🌊 Chunk received: "${contentChunk}" (Total: ${accumulatedContentRef.current.length} chars)`);
                  onChunk(contentChunk, accumulatedContentRef.current);
                }
              } else if (data.type === 'done' || data.done) {
                // Streaming complete
                logger.debug('✅ Streaming completed signal received');
                setIsStreaming(false);
                
                if (onComplete) {
                  onComplete(data.total || accumulatedContentRef.current);
                }
                return;
              } else if (data.error) {
                throw new Error(data.error);
              }
            }
          }
        }
      }
      
      // Streaming finished
      setIsStreaming(false);
      if (onComplete) {
        onComplete(accumulatedContentRef.current);
      }
      
    } catch (error) {
      if (error.name === 'AbortError') {
        logger.debug('🛑 Streaming aborted');
      } else {
        logger.error('❌ Streaming error:', error);
        if (onError) {
          onError(error);
        }
      }
      setIsStreaming(false);
    } finally {
      abortControllerRef.current = null;
    }
  }, []);
  
  /**
   * Stop streaming
   */
  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      logger.debug('🛑 Stopping fetch streaming');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }, []);
  
  return {
    isStreaming,
    startStreaming,
    stopStreaming,
    currentContent: accumulatedContentRef.current
  };
};
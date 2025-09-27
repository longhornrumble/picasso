/**
 * Minimal EventSource Streaming Hook
 * 
 * Provides real-time streaming from Lambda using Server-Sent Events (SSE).
 * This is a clean, simple implementation without the over-engineering
 * of the previous 2,600-line streaming provider.
 */

import { useState, useCallback, useRef } from 'react';
import { createLogger } from '../utils/logger';

const logger = createLogger('EventSourceStreaming');

export const useEventSourceStreaming = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef(null);
  const accumulatedContentRef = useRef('');
  
  /**
   * Start streaming from Lambda endpoint
   */
  const startStreaming = useCallback(({
    streamingUrl,
    onChunk,
    onComplete,
    onError
  }) => {
    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // Reset accumulated content
    accumulatedContentRef.current = '';
    setIsStreaming(true);
    
    try {
      logger.debug('🌊 Starting EventSource streaming:', streamingUrl);
      
      // Create new EventSource connection with CORS credentials if needed
      // Note: EventSource has limited CORS support, withCredentials might not work
      const eventSource = new EventSource(streamingUrl, { 
        withCredentials: false // EventSource doesn't support credentials well with CORS
      });
      eventSourceRef.current = eventSource;
      
      // Handle incoming chunks
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle different message types from Lambda
          if (data.type === 'chunk' || data.content) {
            const chunk = data.content || data.chunk || data.text || '';
            accumulatedContentRef.current += chunk;
            
            // Send chunk to callback
            if (onChunk) {
              onChunk(chunk, accumulatedContentRef.current);
            }
          } else if (data.type === 'done' || data.done) {
            // Streaming complete
            logger.debug('✅ Streaming completed');
            eventSource.close();
            eventSourceRef.current = null;
            setIsStreaming(false);
            
            if (onComplete) {
              onComplete(accumulatedContentRef.current);
            }
          } else if (data.error) {
            // Handle error from Lambda
            throw new Error(data.error);
          }
        } catch (parseError) {
          // Handle non-JSON data (raw text chunks)
          if (event.data && event.data !== '[DONE]') {
            accumulatedContentRef.current += event.data;
            if (onChunk) {
              onChunk(event.data, accumulatedContentRef.current);
            }
          } else if (event.data === '[DONE]') {
            // Alternative done signal
            eventSource.close();
            eventSourceRef.current = null;
            setIsStreaming(false);
            if (onComplete) {
              onComplete(accumulatedContentRef.current);
            }
          }
        }
      };
      
      // Handle connection open
      eventSource.onopen = () => {
        logger.debug('✅ EventSource connection opened');
      };
      
      // Handle errors
      eventSource.onerror = (error) => {
        logger.error('❌ EventSource error:', error);
        eventSource.close();
        eventSourceRef.current = null;
        setIsStreaming(false);
        
        if (onError) {
          onError(new Error('Streaming connection failed'));
        }
      };
      
    } catch (error) {
      logger.error('❌ Failed to start streaming:', error);
      setIsStreaming(false);
      if (onError) {
        onError(error);
      }
    }
  }, []);
  
  /**
   * Stop streaming
   */
  const stopStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      logger.debug('🛑 Stopping EventSource streaming');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
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
import { useState, useRef, useCallback } from 'react';
import { errorLogger } from '../utils/errorHandling';

/**
 * Hook for handling streaming chat responses using EventSource API
 * @param {Object} config - Configuration object
 * @param {string} config.streamingEndpoint - The streaming endpoint URL
 * @param {string} config.tenantHash - The tenant hash
 * @param {Function} config.onMessage - Callback for each streamed message chunk
 * @param {Function} config.onComplete - Callback when streaming completes
 * @param {Function} config.onError - Callback for errors
 */
export const useStreaming = ({ 
  streamingEndpoint, 
  tenantHash, 
  onMessage, 
  onComplete, 
  onError 
}) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamMetrics, setStreamMetrics] = useState({
    startTime: null,
    firstTokenTime: null,
    endTime: null,
    tokenCount: 0
  });
  
  const eventSourceRef = useRef(null);
  const abortControllerRef = useRef(null);
  
  const startStreaming = useCallback(async ({ 
    userInput, 
    sessionId 
  }) => {
    // Validation: Check if streaming endpoint is available
    if (!streamingEndpoint) {
      const error = new Error('Streaming endpoint not configured');
      errorLogger.logError(error, {
        context: 'streaming_validation_error',
        tenantHash: tenantHash?.slice(0, 8) + '...'
      });
      onError?.(error);
      return;
    }
    
    if (!tenantHash) {
      const error = new Error('Tenant hash required for streaming');
      errorLogger.logError(error, {
        context: 'streaming_validation_error'
      });
      onError?.(error);
      return;
    }
    
    // Cleanup any existing connection
    if (eventSourceRef.current) {
      errorLogger.logInfo('🧹 Cleaning up existing streaming connection');
      eventSourceRef.current.close();
    }
    
    setIsStreaming(true);
    const startTime = Date.now();
    setStreamMetrics({
      startTime,
      firstTokenTime: null,
      endTime: null,
      tokenCount: 0
    });
    
    try {
      // Build query parameters (message_id removed for Lambda compatibility)
      const params = new URLSearchParams({
        tenant_hash: tenantHash,
        user_input: userInput,
        session_id: sessionId
      });
      
      const url = `${streamingEndpoint}?${params.toString()}`;
      
      errorLogger.logInfo('🚀 Starting streaming connection', {
        endpoint: streamingEndpoint,
        tenantHash: tenantHash.slice(0, 8) + '...',
        url: url.replace(tenantHash, tenantHash.slice(0, 8) + '...'),
        timestamp: new Date().toISOString()
      });
      
      // Create EventSource connection
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;
      
      // Create abort controller for timeout
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      
      // Set 25-second timeout (Lambda has 30s limit)
      let timeoutId = setTimeout(() => {
        errorLogger.logWarning('⏱️ Streaming timeout reached');
        stopStreaming();
        onError?.(new Error('Streaming response timeout'));
      }, 25000);
      
      eventSource.onopen = () => {
        const connectionTime = Date.now() - startTime;
        errorLogger.logInfo('✅ Streaming connection opened', { 
          connectionTime: connectionTime + 'ms',
          readyState: eventSource.readyState,
          url: streamingEndpoint
        });
        
        // Update timeout to longer duration once connected (reset to handle slow first response)
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            errorLogger.logWarning('⏱️ Streaming response timeout after connection');
            stopStreaming();
            onError?.(new Error('Streaming response timeout'));
          }, 30000); // 30 seconds after connection
        }
      };
      
      eventSource.onmessage = (event) => {
        // Clear timeout on first message
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        // Update metrics
        const now = Date.now();
        setStreamMetrics(prev => {
          const firstToken = prev.firstTokenTime || now;
          return {
            ...prev,
            firstTokenTime: firstToken,
            tokenCount: prev.tokenCount + 1
          };
        });
        
        if (event.data === '[DONE]') {
          errorLogger.logInfo('✅ Streaming completed', {
            duration: now - streamMetrics.startTime,
            tokenCount: streamMetrics.tokenCount
          });
          
          setStreamMetrics(prev => ({ ...prev, endTime: now }));
          stopStreaming();
          onComplete?.();
        } else {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'text' && data.content) {
              onMessage?.(data.content);
            } else if (data.type === 'error') {
              throw new Error(data.message);
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              // Not JSON, treat as plain text
              onMessage?.(event.data);
            } else {
              throw e;
            }
          }
        }
      };
      
      eventSource.onerror = (error) => {
        const readyState = eventSource.readyState;
        let errorMessage = 'Streaming connection error';
        let errorContext = 'streaming_connection_error';
        
        // Enhanced error classification
        switch (readyState) {
          case EventSource.CONNECTING:
            errorMessage = 'Failed to connect to streaming endpoint';
            errorContext = 'streaming_connection_failed';
            break;
          case EventSource.OPEN:
            errorMessage = 'Streaming connection interrupted';
            errorContext = 'streaming_connection_interrupted';
            break;
          case EventSource.CLOSED:
            errorMessage = 'Streaming connection was closed by server';
            errorContext = 'streaming_connection_closed';
            break;
          default:
            errorMessage = 'Unknown streaming connection error';
            errorContext = 'streaming_unknown_error';
        }
        
        errorLogger.logError(error, {
          context: errorContext,
          readyState,
          errorMessage,
          streamingEndpoint
        });
        
        clearTimeout(timeoutId);
        stopStreaming();
        onError?.(new Error(errorMessage));
      };
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'streaming_setup_error'
      });
      
      setIsStreaming(false);
      onError?.(error);
    }
  }, [streamingEndpoint, tenantHash, onMessage, onComplete, onError]);
  
  const stopStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    setIsStreaming(false);
    
    // Calculate final metrics
    setStreamMetrics(prev => ({
      ...prev,
      endTime: prev.endTime || Date.now()
    }));
  }, []);
  
  const getMetrics = useCallback(() => {
    const { startTime, firstTokenTime, endTime, tokenCount } = streamMetrics;
    
    if (!startTime) return null;
    
    return {
      timeToFirstToken: firstTokenTime ? firstTokenTime - startTime : null,
      totalTime: endTime ? endTime - startTime : null,
      tokenCount,
      tokensPerSecond: endTime && tokenCount > 0 
        ? (tokenCount / ((endTime - startTime) / 1000)).toFixed(2)
        : null
    };
  }, [streamMetrics]);
  
  return {
    isStreaming,
    startStreaming,
    stopStreaming,
    getMetrics
  };
};
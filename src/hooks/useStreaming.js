import { useState, useRef, useCallback, useEffect } from 'react';
import { errorLogger } from '../utils/errorHandling';
import { 
  isSafari, 
  isMobileSafari, 
  safariSSEBehaviors, 
  getOptimalSSEConfig 
} from '../utils/safariDetection';
import { 
  SSEConnectionManager, 
  SSE_CONNECTION_STATES, 
  SSE_EVENT_TYPES 
} from '../utils/sseConnectionManager';

/**
 * Hook for handling streaming chat responses using EventSource API
 * Enhanced with Safari-specific reconnection logic, mobile compatibility, and JWT authentication
 * PERFORMANCE OPTIMIZED: Reduced connection overhead, improved caching, and faster first token
 * @param {Object} config - Configuration object
 * @param {string} config.streamingEndpoint - The streaming endpoint URL (can be Function URL with JWT)
 * @param {string} config.tenantHash - The tenant hash
 * @param {string} config.jwt - JWT token for authentication (optional, enables JWT/Function URL flow)
 * @param {Function} config.onMessage - Callback for each streamed message chunk
 * @param {Function} config.onComplete - Callback when streaming completes
 * @param {Function} config.onError - Callback for errors
 * @param {boolean} config.enableSafariOptimizations - Enable Safari-specific optimizations
 */
export const useStreaming = ({ 
  streamingEndpoint, 
  tenantHash, 
  jwt,
  onMessage, 
  onComplete, 
  onError,
  enableSafariOptimizations = true
}) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [connectionState, setConnectionState] = useState(SSE_CONNECTION_STATES.DISCONNECTED);
  const [streamMetrics, setStreamMetrics] = useState({
    startTime: null,
    firstTokenTime: null,
    endTime: null,
    tokenCount: 0,
    reconnectionAttempts: 0,
    backgroundDisconnections: 0,
    authMethod: jwt ? 'jwt' : 'legacy'
  });
  
  // Safari detection - Cached for performance
  const [isSafariDetected] = useState(() => isSafari());
  const [isMobileSafariDetected] = useState(() => isMobileSafari());
  
  // Connection management
  const eventSourceRef = useRef(null);
  const abortControllerRef = useRef(null);
  const sseConnectionManagerRef = useRef(null);
  const isBackgroundTabRef = useRef(false);
  const streamingSessionRef = useRef(null);
  
  /**
   * Initialize Safari-optimized SSE connection manager
   * PERFORMANCE: Reuse existing manager when possible, reduce initialization overhead
   */
  const initializeSafariSSEManager = useCallback(() => {
    if (!enableSafariOptimizations || !isSafariDetected) {
      return null;
    }
    
    // PERFORMANCE: Reuse existing manager if configuration hasn't changed
    if (sseConnectionManagerRef.current && 
        sseConnectionManagerRef.current.config.url === streamingEndpoint) {
      return sseConnectionManagerRef.current;
    }
    
    if (sseConnectionManagerRef.current) {
      sseConnectionManagerRef.current.destroy();
    }
    
    const config = getOptimalSSEConfig();
    config.url = streamingEndpoint;
    config.enableKeepAlive = true;
    config.enableBackgroundHandling = true;
    // PERFORMANCE: Reduce keep-alive interval for faster response
    config.keepAliveInterval = 20000; // 20s instead of 30s
    
    const manager = new SSEConnectionManager(config);
    sseConnectionManagerRef.current = manager;
    
    // Setup Safari-specific event handlers
    manager.addEventListener(SSE_EVENT_TYPES.CONNECTION_OPEN, (data) => {
      setConnectionState(SSE_CONNECTION_STATES.CONNECTED);
      errorLogger.logInfo('Safari SSE streaming connection opened', {
        context: 'safari_streaming_connected',
        connectionTime: data.connectionTime,
        isMobileSafari: isMobileSafariDetected
      });
    });
    
    manager.addEventListener(SSE_EVENT_TYPES.CONNECTION_CLOSE, () => {
      setConnectionState(SSE_CONNECTION_STATES.DISCONNECTED);
    });
    
    manager.addEventListener(SSE_EVENT_TYPES.CONNECTION_ERROR, (data) => {
      setStreamMetrics(prev => ({
        ...prev,
        reconnectionAttempts: prev.reconnectionAttempts + 1
      }));
      
      errorLogger.logError(data.reason, {
        context: 'safari_streaming_error',
        isMobileSafari: isMobileSafariDetected,
        reconnectionAttempts: data.reconnectionAttempts
      });
    });
    
    manager.addEventListener(SSE_EVENT_TYPES.BACKGROUND_TAB, () => {
      isBackgroundTabRef.current = true;
      setStreamMetrics(prev => ({
        ...prev,
        backgroundDisconnections: prev.backgroundDisconnections + 1
      }));
    });
    
    manager.addEventListener(SSE_EVENT_TYPES.FOREGROUND_TAB, () => {
      isBackgroundTabRef.current = false;
    });
    
    manager.addEventListener(SSE_EVENT_TYPES.RECONNECTING, (data) => {
      setConnectionState(SSE_CONNECTION_STATES.RECONNECTING);
      errorLogger.logInfo('Safari SSE reconnecting', {
        context: 'safari_streaming_reconnecting',
        attempt: data.attempt,
        delay: data.delay
      });
    });
    
    return manager;
  }, [streamingEndpoint, enableSafariOptimizations, isSafariDetected, isMobileSafariDetected]);

  const startStreaming = useCallback(async ({ 
    userInput, 
    sessionId,
    jwt: streamingJWT
  }) => {
    // Use JWT from parameters or initial config
    const authToken = streamingJWT || jwt;
    // PERFORMANCE: Fast-fail validation with minimal logging overhead
    if (!streamingEndpoint || !tenantHash) {
      const error = new Error(!streamingEndpoint ? 'Streaming endpoint not configured' : 'Tenant hash required for streaming');
      errorLogger.logError(error, {
        context: 'streaming_validation_error',
        tenantHash: tenantHash?.slice(0, 8) + '...',
        hasEndpoint: !!streamingEndpoint
      });
      onError?.(error);
      return;
    }
    
    // Cleanup any existing connection
    if (eventSourceRef.current) {
      errorLogger.logInfo('🧹 Cleaning up existing streaming connection');
      eventSourceRef.current.close();
    }
    
    if (sseConnectionManagerRef.current) {
      sseConnectionManagerRef.current.disconnect();
    }
    
    setIsStreaming(true);
    setConnectionState(SSE_CONNECTION_STATES.CONNECTING);
    const startTime = Date.now();
    
    setStreamMetrics(prev => ({
      ...prev,
      startTime,
      firstTokenTime: null,
      endTime: null,
      tokenCount: 0
    }));
    
    // Store streaming session info
    streamingSessionRef.current = {
      userInput,
      sessionId,
      startTime,
      jwt: authToken
    };
    
    try {
      // Use Safari-optimized SSE manager if available
      if (enableSafariOptimizations && isSafariDetected) {
        const manager = initializeSafariSSEManager();
        if (manager) {
          // Setup Safari-specific message handling
          manager.addEventListener(SSE_EVENT_TYPES.MESSAGE_RECEIVED, (data) => {
            if (data.type === 'stream_complete' || data.data === '[DONE]') {
              const now = Date.now();
              setStreamMetrics(prev => ({ ...prev, endTime: now }));
              stopStreaming();
              onComplete?.();
            } else {
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
              
              // Handle message content
              if (data.content) {
                onMessage?.(data.content);
              } else if (data.raw && data.raw !== '[DONE]') {
                try {
                  const parsed = JSON.parse(data.raw);
                  if (parsed.type === 'text' && parsed.content) {
                    onMessage?.(parsed.content);
                  }
                } catch (e) {
                  // Not JSON, treat as plain text
                  onMessage?.(data.raw);
                }
              }
            }
          });
          
          // Build Safari-optimized streaming URL with JWT authentication
          let url;
          if (authToken) {
            // JWT/Function URL flow - include JWT in URL parameters
            const params = new URLSearchParams({
              jwt: authToken,
              user_input: userInput,
              session_id: sessionId,
              safari: '1',
              mobile: isMobileSafariDetected ? '1' : '0'
            });
            url = `${streamingEndpoint}?${params.toString()}`;
          } else {
            // Legacy flow with tenant hash
            const params = new URLSearchParams({
              t: tenantHash,
              user_input: userInput,
              session_id: sessionId,
              safari: '1',
              mobile: isMobileSafariDetected ? '1' : '0'
            });
            url = `${streamingEndpoint}?${params.toString()}`;
          }
          
          errorLogger.logInfo('🚀 Starting Safari-optimized streaming connection', {
            endpoint: streamingEndpoint,
            tenantHash: tenantHash ? tenantHash.slice(0, 8) + '...' : 'none',
            hasJWT: !!authToken,
            authMethod: authToken ? 'jwt' : 'legacy',
            isMobileSafari: isMobileSafariDetected,
            timestamp: new Date().toISOString()
          });
          
          await manager.connect(url);
          return;
        }
      }
      
      // Fallback to standard EventSource for non-Safari browsers
      let url;
      if (authToken) {
        // JWT/Function URL flow - include JWT in URL parameters
        const params = new URLSearchParams({
          jwt: authToken,
          user_input: userInput,
          session_id: sessionId
        });
        url = `${streamingEndpoint}?${params.toString()}`;
      } else {
        // Legacy flow with tenant hash
        const params = new URLSearchParams({
          t: tenantHash,
          user_input: userInput,
          session_id: sessionId
        });
        url = `${streamingEndpoint}?${params.toString()}`;
      }
      
      errorLogger.logInfo('🚀 Starting standard streaming connection', {
        endpoint: streamingEndpoint,
        tenantHash: tenantHash ? tenantHash.slice(0, 8) + '...' : 'none',
        hasJWT: !!authToken,
        authMethod: authToken ? 'jwt' : 'legacy',
        url: authToken ? '[REDACTED - JWT URL]' : url.replace(tenantHash || '', (tenantHash || '').slice(0, 8) + '...'),
        timestamp: new Date().toISOString()
      });
      
      // Create EventSource connection
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;
      
      // Create abort controller for timeout
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      
      // PERFORMANCE: Aggressive timeout for faster failure detection
      const timeoutDuration = isSafariDetected ? 15000 : 20000; // Reduced from 25s/30s
      let timeoutId = setTimeout(() => {
        errorLogger.logWarning('⏱️ Streaming timeout reached (optimized for performance)');
        stopStreaming();
        onError?.(new Error('Streaming response timeout'));
      }, timeoutDuration);
      
      eventSource.onopen = () => {
        const connectionTime = Date.now() - startTime;
        setConnectionState(SSE_CONNECTION_STATES.CONNECTED);
        
        errorLogger.logInfo('✅ Streaming connection opened', { 
          connectionTime: connectionTime + 'ms',
          readyState: eventSource.readyState,
          url: streamingEndpoint,
          isSafari: isSafariDetected
        });
        
        // PERFORMANCE: Once connected, use shorter timeout for faster token delivery
        if (timeoutId) {
          clearTimeout(timeoutId);
          const extendedTimeout = isSafariDetected ? 20000 : 25000; // Reduced from 30s/35s
          timeoutId = setTimeout(() => {
            errorLogger.logWarning('⏱️ Streaming response timeout after connection (performance optimized)');
            stopStreaming();
            onError?.(new Error('Streaming response timeout'));
          }, extendedTimeout);
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
            tokenCount: streamMetrics.tokenCount,
            isSafari: isSafariDetected
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
        
        // Enhanced error classification with Safari considerations and JWT handling
        switch (readyState) {
          case EventSource.CONNECTING:
            errorMessage = authToken ? 'Failed to connect to streaming endpoint (JWT auth)' : 'Failed to connect to streaming endpoint';
            errorContext = authToken ? 'streaming_jwt_connection_failed' : 'streaming_connection_failed';
            break;
          case EventSource.OPEN:
            errorMessage = 'Streaming connection interrupted';
            errorContext = 'streaming_connection_interrupted';
            break;
          case EventSource.CLOSED:
            errorMessage = authToken ? 'JWT authenticated streaming connection was closed by server' : 'Streaming connection was closed by server';
            errorContext = authToken ? 'streaming_jwt_connection_closed' : 'streaming_connection_closed';
            break;
          default:
            errorMessage = 'Unknown streaming connection error';
            errorContext = 'streaming_unknown_error';
        }
        
        errorLogger.logError(error, {
          context: errorContext,
          readyState,
          errorMessage,
          streamingEndpoint,
          hasJWT: !!authToken,
          authMethod: authToken ? 'jwt' : 'legacy',
          isSafari: isSafariDetected,
          isMobileSafari: isMobileSafariDetected,
          isBackgroundTab: isBackgroundTabRef.current
        });
        
        clearTimeout(timeoutId);
        
        // Safari-specific error handling
        if (isSafariDetected && isBackgroundTabRef.current) {
          errorLogger.logInfo('Safari background tab detected, scheduling reconnection');
          // Don't immediately error, let the background tab handler manage reconnection
          return;
        }
        
        stopStreaming();
        onError?.(new Error(errorMessage));
      };
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'streaming_setup_error',
        isSafari: isSafariDetected
      });
      
      setIsStreaming(false);
      setConnectionState(SSE_CONNECTION_STATES.FAILED);
      onError?.(error);
    }
  }, [streamingEndpoint, tenantHash, jwt, onMessage, onComplete, onError, enableSafariOptimizations, isSafariDetected, isMobileSafariDetected, initializeSafariSSEManager]);
  
  const stopStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    if (sseConnectionManagerRef.current) {
      sseConnectionManagerRef.current.disconnect();
    }
    
    setIsStreaming(false);
    setConnectionState(SSE_CONNECTION_STATES.DISCONNECTED);
    
    // Calculate final metrics
    setStreamMetrics(prev => ({
      ...prev,
      endTime: prev.endTime || Date.now()
    }));
    
    // Clear streaming session
    streamingSessionRef.current = null;
    
    errorLogger.logInfo('Streaming stopped', {
      context: 'streaming_stopped',
      isSafari: isSafariDetected,
      finalMetrics: streamMetrics
    });
  }, [isSafariDetected, streamMetrics]);
  
  const getMetrics = useCallback(() => {
    const { 
      startTime, 
      firstTokenTime, 
      endTime, 
      tokenCount, 
      reconnectionAttempts, 
      backgroundDisconnections 
    } = streamMetrics;
    
    if (!startTime) return null;
    
    return {
      timeToFirstToken: firstTokenTime ? firstTokenTime - startTime : null,
      totalTime: endTime ? endTime - startTime : null,
      tokenCount,
      tokensPerSecond: endTime && tokenCount > 0 
        ? (tokenCount / ((endTime - startTime) / 1000)).toFixed(2)
        : null,
      reconnectionAttempts,
      backgroundDisconnections,
      safariOptimizationsUsed: enableSafariOptimizations && isSafariDetected,
      isMobileSafari: isMobileSafariDetected,
      connectionState,
      authMethod: jwt ? 'jwt' : 'legacy',
      hasJWT: !!jwt
    };
  }, [streamMetrics, enableSafariOptimizations, isSafariDetected, isMobileSafariDetected, connectionState]);
  
  /**
   * Get Safari-specific connection information
   */
  const getSafariInfo = useCallback(() => {
    return {
      isSafari: isSafariDetected,
      isMobileSafari: isMobileSafariDetected,
      safariOptimizationsEnabled: enableSafariOptimizations,
      connectionManagerActive: !!sseConnectionManagerRef.current,
      backgroundTabActive: isBackgroundTabRef.current,
      safariSSEBehaviors: isSafariDetected ? safariSSEBehaviors : null
    };
  }, [isSafariDetected, isMobileSafariDetected, enableSafariOptimizations]);
  
  /**
   * Manually trigger reconnection (useful for Safari background tab scenarios)
   */
  const reconnect = useCallback(() => {
    if (streamingSessionRef.current) {
      const { userInput, sessionId, jwt: sessionJWT } = streamingSessionRef.current;
      
      errorLogger.logInfo('Manual reconnection triggered', {
        context: 'streaming_manual_reconnect',
        isSafari: isSafariDetected,
        session: sessionId,
        hasJWT: !!sessionJWT,
        authMethod: sessionJWT ? 'jwt' : 'legacy'
      });
      
      stopStreaming();
      
      // Brief delay before reconnecting
      setTimeout(() => {
        startStreaming({ userInput, sessionId, jwt: sessionJWT });
      }, 1000);
    }
  }, [startStreaming, stopStreaming, isSafariDetected]);
  
  /**
   * Setup background tab visibility handling for Safari
   */
  useEffect(() => {
    if (!isSafariDetected || typeof document === 'undefined') return;
    
    const handleVisibilityChange = () => {
      const wasBackground = isBackgroundTabRef.current;
      isBackgroundTabRef.current = document.hidden;
      
      if (document.hidden && !wasBackground) {
        errorLogger.logInfo('Safari tab went to background during streaming', {
          context: 'streaming_background_tab',
          isStreaming,
          connectionState
        });
      } else if (!document.hidden && wasBackground) {
        errorLogger.logInfo('Safari tab returned to foreground during streaming', {
          context: 'streaming_foreground_tab',
          isStreaming,
          connectionState
        });
        
        // Check if reconnection is needed
        if (isStreaming && connectionState === SSE_CONNECTION_STATES.DISCONNECTED) {
          reconnect();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isSafariDetected, isStreaming, connectionState, reconnect]);
  
  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (sseConnectionManagerRef.current) {
        sseConnectionManagerRef.current.destroy();
        sseConnectionManagerRef.current = null;
      }
    };
  }, []);
  
  return {
    // Streaming state
    isStreaming,
    connectionState,
    isConnected: connectionState === SSE_CONNECTION_STATES.CONNECTED,
    isReconnecting: connectionState === SSE_CONNECTION_STATES.RECONNECTING,
    
    // Streaming methods
    startStreaming,
    stopStreaming,
    reconnect,
    
    // Metrics and information
    getMetrics,
    getSafariInfo,
    
    // Safari-specific state
    isSafari: isSafariDetected,
    isMobileSafari: isMobileSafariDetected,
    safariOptimizationsEnabled: enableSafariOptimizations,
    isBackgroundTab: isBackgroundTabRef.current,
    
    // Advanced access
    connectionManager: sseConnectionManagerRef.current,
    
    // JWT/Function URL authentication info
    hasJWT: !!jwt,
    authMethod: jwt ? 'jwt' : 'legacy'
  };
};
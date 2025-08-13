/**
 * Mobile SSE Hook
 * React hook for mobile SSE connections with background tab detection,
 * connection state management, and error recovery mechanisms
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  SSEConnectionManager, 
  SSE_CONNECTION_STATES, 
  SSE_EVENT_TYPES 
} from '../utils/sseConnectionManager';
import { isMobileSafari, isSafari, getOptimalSSEConfig } from '../utils/safariDetection';
import { errorLogger } from '../utils/errorHandling';

/**
 * Mobile SSE Hook
 * @param {Object} options - Configuration options
 * @param {string} options.url - SSE endpoint URL
 * @param {boolean} options.autoConnect - Whether to auto-connect on mount
 * @param {Function} options.onMessage - Message handler function
 * @param {Function} options.onError - Error handler function
 * @param {Function} options.onConnect - Connection handler function
 * @param {Function} options.onDisconnect - Disconnection handler function
 * @param {Object} options.config - Additional SSE configuration
 * @returns {Object} Hook return object with connection state and methods
 */
export const useMobileSSE = ({
  url,
  autoConnect = false,
  onMessage = null,
  onError = null,
  onConnect = null,
  onDisconnect = null,
  config = {}
} = {}) => {
  // Connection state
  const [connectionState, setConnectionState] = useState(SSE_CONNECTION_STATES.DISCONNECTED);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  
  // Background tab state
  const [isBackgroundTab, setIsBackgroundTab] = useState(false);
  const [backgroundDuration, setBackgroundDuration] = useState(0);
  
  // Managers and timers
  const connectionManagerRef = useRef(null);
  const backgroundTimerRef = useRef(null);
  const backgroundStartTimeRef = useRef(null);
  
  // Mobile Safari specific state
  const [isMobile] = useState(isMobileSafari());
  const [needsSafariHandling] = useState(isSafari());
  
  /**
   * Initialize connection manager
   */
  const initializeConnectionManager = useCallback(() => {
    if (connectionManagerRef.current) {
      connectionManagerRef.current.destroy();
    }
    
    const optimalConfig = getOptimalSSEConfig();
    const managerConfig = {
      url,
      ...optimalConfig,
      ...config
    };
    
    connectionManagerRef.current = new SSEConnectionManager(managerConfig);
    
    // Setup event listeners
    connectionManagerRef.current.addEventListener(SSE_EVENT_TYPES.CONNECTION_OPEN, (data) => {
      setConnectionState(SSE_CONNECTION_STATES.CONNECTED);
      setIsConnecting(false);
      setError(null);
      setMetrics(connectionManagerRef.current.getMetrics());
      
      errorLogger.logInfo('Mobile SSE connected', {
        context: 'mobile_sse_connected',
        isMobile,
        connectionTime: data.connectionTime
      });
      
      onConnect?.(data);
    });
    
    connectionManagerRef.current.addEventListener(SSE_EVENT_TYPES.CONNECTION_CLOSE, (data) => {
      setConnectionState(SSE_CONNECTION_STATES.DISCONNECTED);
      setIsConnecting(false);
      setMetrics(connectionManagerRef.current.getMetrics());
      
      errorLogger.logInfo('Mobile SSE disconnected', {
        context: 'mobile_sse_disconnected',
        isMobile
      });
      
      onDisconnect?.(data);
    });
    
    connectionManagerRef.current.addEventListener(SSE_EVENT_TYPES.CONNECTION_ERROR, (data) => {
      setError(data.reason);
      setIsConnecting(false);
      
      if (connectionManagerRef.current.getState() === SSE_CONNECTION_STATES.FAILED) {
        setConnectionState(SSE_CONNECTION_STATES.FAILED);
      } else {
        setConnectionState(SSE_CONNECTION_STATES.RECONNECTING);
      }
      
      errorLogger.logError(data.reason, {
        context: 'mobile_sse_error',
        isMobile,
        ...data
      });
      
      onError?.(data);
    });
    
    connectionManagerRef.current.addEventListener(SSE_EVENT_TYPES.RECONNECTING, (data) => {
      setConnectionState(SSE_CONNECTION_STATES.RECONNECTING);
      setIsConnecting(true);
      
      errorLogger.logInfo('Mobile SSE reconnecting', {
        context: 'mobile_sse_reconnecting',
        isMobile,
        attempt: data.attempt,
        delay: data.delay
      });
    });
    
    connectionManagerRef.current.addEventListener(SSE_EVENT_TYPES.MESSAGE_RECEIVED, (data) => {
      setMetrics(connectionManagerRef.current.getMetrics());
      
      // Handle stream completion
      if (data.type === 'stream_complete') {
        errorLogger.logInfo('Mobile SSE stream completed', {
          context: 'mobile_sse_stream_complete',
          isMobile
        });
      }
      
      onMessage?.(data);
    });
    
    connectionManagerRef.current.addEventListener(SSE_EVENT_TYPES.BACKGROUND_TAB, (data) => {
      setIsBackgroundTab(true);
      backgroundStartTimeRef.current = Date.now();
      
      // Start background duration timer
      backgroundTimerRef.current = setInterval(() => {
        if (backgroundStartTimeRef.current) {
          setBackgroundDuration(Date.now() - backgroundStartTimeRef.current);
        }
      }, 1000);
      
      errorLogger.logInfo('Mobile SSE tab backgrounded', {
        context: 'mobile_sse_background',
        isMobile
      });
    });
    
    connectionManagerRef.current.addEventListener(SSE_EVENT_TYPES.FOREGROUND_TAB, (data) => {
      setIsBackgroundTab(false);
      setBackgroundDuration(0);
      backgroundStartTimeRef.current = null;
      
      if (backgroundTimerRef.current) {
        clearInterval(backgroundTimerRef.current);
        backgroundTimerRef.current = null;
      }
      
      errorLogger.logInfo('Mobile SSE tab foregrounded', {
        context: 'mobile_sse_foreground',
        isMobile
      });
    });
    
    connectionManagerRef.current.addEventListener(SSE_EVENT_TYPES.KEEP_ALIVE, (data) => {
      errorLogger.logInfo('Mobile SSE keep-alive', {
        context: 'mobile_sse_keepalive',
        isMobile,
        serverTime: data.serverTime,
        clientTime: data.clientTime,
        latency: data.clientTime - data.serverTime
      });
    });
    
  }, [url, config, onMessage, onError, onConnect, onDisconnect, isMobile]);
  
  /**
   * Connect to SSE endpoint
   */
  const connect = useCallback(async (connectUrl = null) => {
    if (!connectionManagerRef.current) {
      initializeConnectionManager();
    }
    
    try {
      setIsConnecting(true);
      setError(null);
      setConnectionState(SSE_CONNECTION_STATES.CONNECTING);
      
      await connectionManagerRef.current.connect(connectUrl);
      
    } catch (error) {
      setError(error.message);
      setIsConnecting(false);
      setConnectionState(SSE_CONNECTION_STATES.FAILED);
      
      errorLogger.logError(error, {
        context: 'mobile_sse_connect_error',
        isMobile,
        url: connectUrl || url
      });
      
      onError?.({ reason: error.message, error });
    }
  }, [initializeConnectionManager, url, onError, isMobile]);
  
  /**
   * Disconnect from SSE endpoint
   */
  const disconnect = useCallback(() => {
    if (connectionManagerRef.current) {
      connectionManagerRef.current.disconnect();
    }
    
    setConnectionState(SSE_CONNECTION_STATES.DISCONNECTED);
    setIsConnecting(false);
    setError(null);
  }, []);
  
  /**
   * Manually trigger reconnection
   */
  const reconnect = useCallback(async () => {
    disconnect();
    
    // Brief delay before reconnecting
    setTimeout(() => {
      connect();
    }, 100);
  }, [connect, disconnect]);
  
  /**
   * Get current connection metrics
   */
  const getConnectionMetrics = useCallback(() => {
    return connectionManagerRef.current?.getMetrics() || null;
  }, []);
  
  /**
   * Check if connection is healthy
   */
  const isConnectionHealthy = useCallback(() => {
    if (!connectionManagerRef.current) return false;
    
    const currentMetrics = connectionManagerRef.current.getMetrics();
    const timeSinceLastActivity = Date.now() - currentMetrics.lastActivity;
    
    // Consider connection unhealthy if no activity for more than 2 minutes
    return connectionState === SSE_CONNECTION_STATES.CONNECTED && 
           timeSinceLastActivity < 120000;
  }, [connectionState]);
  
  /**
   * Auto-connect on mount if enabled
   */
  useEffect(() => {
    if (autoConnect && url) {
      initializeConnectionManager();
      connect();
    }
    
    return () => {
      if (connectionManagerRef.current) {
        connectionManagerRef.current.destroy();
        connectionManagerRef.current = null;
      }
      
      if (backgroundTimerRef.current) {
        clearInterval(backgroundTimerRef.current);
        backgroundTimerRef.current = null;
      }
    };
  }, [autoConnect, url, connect, initializeConnectionManager]);
  
  /**
   * Update metrics periodically when connected
   */
  useEffect(() => {
    if (connectionState === SSE_CONNECTION_STATES.CONNECTED && connectionManagerRef.current) {
      const metricsInterval = setInterval(() => {
        setMetrics(connectionManagerRef.current.getMetrics());
      }, 5000); // Update every 5 seconds
      
      return () => clearInterval(metricsInterval);
    }
  }, [connectionState]);
  
  /**
   * Health check for mobile Safari
   */
  useEffect(() => {
    if (needsSafariHandling && connectionState === SSE_CONNECTION_STATES.CONNECTED) {
      const healthCheckInterval = setInterval(() => {
        if (!isConnectionHealthy()) {
          errorLogger.logWarning('Mobile SSE connection appears unhealthy, attempting reconnect', {
            context: 'mobile_sse_health_check',
            isMobile,
            metrics: getConnectionMetrics()
          });
          
          reconnect();
        }
      }, 60000); // Check every minute
      
      return () => clearInterval(healthCheckInterval);
    }
  }, [needsSafariHandling, connectionState, isConnectionHealthy, reconnect, getConnectionMetrics, isMobile]);
  
  return {
    // Connection state
    connectionState,
    isConnected: connectionState === SSE_CONNECTION_STATES.CONNECTED,
    isConnecting,
    isReconnecting: connectionState === SSE_CONNECTION_STATES.RECONNECTING,
    error,
    
    // Background tab state
    isBackgroundTab,
    backgroundDuration,
    
    // Mobile Safari specific
    isMobileSafari: isMobile,
    needsSafariHandling,
    
    // Connection methods
    connect,
    disconnect,
    reconnect,
    
    // Metrics and health
    metrics,
    getConnectionMetrics,
    isConnectionHealthy,
    
    // Connection manager (for advanced usage)
    connectionManager: connectionManagerRef.current
  };
};

/**
 * Hook for simplified mobile SSE usage with automatic message handling
 * @param {Object} options - Configuration options
 * @returns {Object} Simplified hook return object
 */
export const useMobileSSESimple = ({
  url,
  autoConnect = true,
  onMessage = null,
  onError = null
} = {}) => {
  const [messages, setMessages] = useState([]);
  const [lastMessage, setLastMessage] = useState(null);
  
  const handleMessage = useCallback((data) => {
    const message = {
      id: Date.now() + Math.random(),
      timestamp: Date.now(),
      ...data
    };
    
    setLastMessage(message);
    setMessages(prev => [...prev, message]);
    onMessage?.(message);
  }, [onMessage]);
  
  const sseHook = useMobileSSE({
    url,
    autoConnect,
    onMessage: handleMessage,
    onError
  });
  
  const clearMessages = useCallback(() => {
    setMessages([]);
    setLastMessage(null);
  }, []);
  
  return {
    ...sseHook,
    messages,
    lastMessage,
    clearMessages,
    messageCount: messages.length
  };
};

export default useMobileSSE;
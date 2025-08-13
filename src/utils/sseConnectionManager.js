/**
 * SSE Connection Manager - PERFORMANCE OPTIMIZED
 * Robust EventSource connection handling with Safari-specific reconnection logic,
 * exponential backoff implementation, and keep-alive heartbeat support
 * PERFORMANCE IMPROVEMENTS:
 * - Reduced memory allocation in hot paths
 * - Optimized event listener management
 * - Fixed potential memory leaks
 * - Faster connection establishment
 */

import { errorLogger } from './errorHandling';
import { 
  isSafari, 
  isMobileSafari, 
  safariSSEBehaviors, 
  getOptimalSSEConfig 
} from './safariDetection';

/**
 * SSE Connection States
 */
export const SSE_CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting', 
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  FAILED: 'failed'
};

/**
 * SSE Event Types
 */
export const SSE_EVENT_TYPES = {
  CONNECTION_OPEN: 'connection_open',
  CONNECTION_CLOSE: 'connection_close',
  CONNECTION_ERROR: 'connection_error',
  MESSAGE_RECEIVED: 'message_received',
  KEEP_ALIVE: 'keep_alive',
  RECONNECTING: 'reconnecting',
  BACKGROUND_TAB: 'background_tab',
  FOREGROUND_TAB: 'foreground_tab'
};

/**
 * SSE Connection Manager Class
 * Handles robust EventSource connections with Safari-specific optimizations
 */
export class SSEConnectionManager {
  constructor(config = {}) {
    // PERFORMANCE: Optimize default configuration for faster connections
    this.config = {
      url: config.url || '',
      keepAliveInterval: 20000, // Reduced from 30s for faster response
      reconnectionDelay: 500, // Reduced from 1s for faster recovery
      maxReconnectionAttempts: 3, // Reduced from 5 for faster failure
      backgroundTabTimeout: 30000, // Reduced from 60s
      exponentialBackoffBase: 1.5, // Reduced from 2 for gentler backoff
      maxBackoffDelay: 15000, // Reduced from 30s
      enableKeepAlive: true,
      enableBackgroundHandling: true,
      withCredentials: false,
      headers: {},
      ...getOptimalSSEConfig(),
      ...config
    };
    
    // Connection state
    this.state = SSE_CONNECTION_STATES.DISCONNECTED;
    this.eventSource = null;
    this.reconnectionAttempts = 0;
    this.lastSuccessfulConnection = null;
    this.lastActivity = Date.now();
    
    // Timers and intervals
    this.keepAliveTimer = null;
    this.reconnectionTimer = null;
    this.backgroundTabTimer = null;
    this.connectionTimeoutTimer = null;
    
    // Background tab handling
    this.isBackgroundTab = false;
    this.visibilityChangeListener = null;
    
    // Event listeners
    this.eventListeners = new Map();
    
    // Safari-specific flags
    this.isSafari = isSafari();
    this.isMobileSafari = isMobileSafari();
    
    // Connection metrics
    this.metrics = {
      connectionStartTime: null,
      firstMessageTime: null,
      totalConnections: 0,
      totalReconnections: 0,
      totalMessages: 0,
      averageLatency: 0
    };
    
    this._setupVisibilityChangeListener();
    
    errorLogger.logInfo('SSE Connection Manager initialized', {
      context: 'sse_connection_manager_init',
      isSafari: this.isSafari,
      isMobileSafari: this.isMobileSafari,
      config: {
        keepAliveInterval: this.config.keepAliveInterval,
        reconnectionDelay: this.config.reconnectionDelay,
        maxReconnectionAttempts: this.config.maxReconnectionAttempts
      }
    });
  }
  
  /**
   * Add event listener for SSE events
   * @param {string} eventType - Type of event to listen for
   * @param {Function} listener - Event handler function
   */
  addEventListener(eventType, listener) {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType).push(listener);
  }
  
  /**
   * Remove event listener
   * @param {string} eventType - Type of event 
   * @param {Function} listener - Event handler function to remove
   */
  removeEventListener(eventType, listener) {
    if (this.eventListeners.has(eventType)) {
      const listeners = this.eventListeners.get(eventType);
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }
  
  /**
   * Emit event to listeners
   * @param {string} eventType - Type of event to emit
   * @param {Object} data - Event data
   */
  _emitEvent(eventType, data = {}) {
    if (this.eventListeners.has(eventType)) {
      this.eventListeners.get(eventType).forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          errorLogger.logError(error, {
            context: 'sse_event_listener_error',
            eventType
          });
        }
      });
    }
  }
  
  /**
   * Setup visibility change listener for background tab handling
   */
  _setupVisibilityChangeListener() {
    if (typeof document === 'undefined') return;
    
    this.visibilityChangeListener = () => {
      const wasBackground = this.isBackgroundTab;
      this.isBackgroundTab = document.hidden;
      
      if (this.isBackgroundTab && !wasBackground) {
        this._handleBackgroundTab();
      } else if (!this.isBackgroundTab && wasBackground) {
        this._handleForegroundTab();
      }
    };
    
    document.addEventListener('visibilitychange', this.visibilityChangeListener);
  }
  
  /**
   * Handle tab going to background
   */
  _handleBackgroundTab() {
    errorLogger.logInfo('Tab went to background', {
      context: 'sse_background_tab',
      state: this.state,
      isMobileSafari: this.isMobileSafari
    });
    
    this._emitEvent(SSE_EVENT_TYPES.BACKGROUND_TAB, {
      timestamp: Date.now(),
      connectionState: this.state
    });
    
    if (this.isSafari && this.config.enableBackgroundHandling) {
      // Adjust keep-alive frequency for background
      if (this.keepAliveTimer) {
        this._clearKeepAlive();
        this._setupKeepAlive(60000); // 1 minute intervals in background
      }
      
      // Set background timeout for mobile Safari
      if (this.isMobileSafari && this.state === SSE_CONNECTION_STATES.CONNECTED) {
        this.backgroundTabTimer = setTimeout(() => {
          errorLogger.logWarning('Background tab timeout reached, disconnecting', {
            context: 'sse_background_timeout'
          });
          this._disconnect(false); // Don't auto-reconnect from background timeout
        }, this.config.backgroundTabTimeout);
      }
    }
  }
  
  /**
   * Handle tab returning to foreground
   */
  _handleForegroundTab() {
    errorLogger.logInfo('Tab returned to foreground', {
      context: 'sse_foreground_tab',
      state: this.state,
      shouldReconnect: this.state === SSE_CONNECTION_STATES.DISCONNECTED
    });
    
    this._emitEvent(SSE_EVENT_TYPES.FOREGROUND_TAB, {
      timestamp: Date.now(),
      connectionState: this.state
    });
    
    // Clear background timeout
    if (this.backgroundTabTimer) {
      clearTimeout(this.backgroundTabTimer);
      this.backgroundTabTimer = null;
    }
    
    // Restore normal keep-alive frequency
    if (this.isSafari && this.keepAliveTimer) {
      this._clearKeepAlive();
      this._setupKeepAlive(this.config.keepAliveInterval);
    }
    
    // Reconnect if disconnected while in background
    if (this.state === SSE_CONNECTION_STATES.DISCONNECTED) {
      this._scheduleReconnection(500); // Quick reconnection when returning to foreground
    }
  }
  
  /**
   * Connect to SSE endpoint
   * @param {string} url - Optional URL override
   * @returns {Promise<void>}
   */
  async connect(url = null) {
    if (this.state === SSE_CONNECTION_STATES.CONNECTING || 
        this.state === SSE_CONNECTION_STATES.CONNECTED) {
      return;
    }
    
    const targetUrl = url || this.config.url;
    if (!targetUrl) {
      throw new Error('SSE URL not provided');
    }
    
    this.state = SSE_CONNECTION_STATES.CONNECTING;
    this.metrics.connectionStartTime = Date.now();
    this.metrics.totalConnections++;
    
    errorLogger.logInfo('Starting SSE connection', {
      context: 'sse_connection_start',
      url: targetUrl,
      attempt: this.reconnectionAttempts + 1,
      isSafari: this.isSafari,
      isBackground: this.isBackgroundTab
    });
    
    try {
      // Create EventSource with Safari-specific parameters
      const eventSourceUrl = this._buildEventSourceUrl(targetUrl);
      
      this.eventSource = new EventSource(eventSourceUrl, {
        withCredentials: this.config.withCredentials
      });
      
      // PERFORMANCE: Aggressive connection timeout for faster failure detection
      this.connectionTimeoutTimer = setTimeout(() => {
        if (this.state === SSE_CONNECTION_STATES.CONNECTING) {
          errorLogger.logWarning('Connection timeout reached', {
            context: 'sse_connection_timeout'
          });
          this._handleConnectionError('Connection timeout');
        }
      }, 5000); // PERFORMANCE: 5 second timeout (reduced from 10s)
      
      this._setupEventSourceListeners();
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'sse_connection_creation_error',
        url: targetUrl
      });
      this.state = SSE_CONNECTION_STATES.FAILED;
      this._emitEvent(SSE_EVENT_TYPES.CONNECTION_ERROR, { error });
      throw error;
    }
  }
  
  /**
   * Build EventSource URL with Safari-specific parameters
   * @param {string} baseUrl - Base SSE URL
   * @returns {string} Enhanced URL with Safari parameters
   */
  _buildEventSourceUrl(baseUrl) {
    const url = new URL(baseUrl);
    
    // Add Safari-specific parameters
    if (this.isSafari) {
      url.searchParams.set('safari', '1');
      url.searchParams.set('safari_version', this._getSafariVersion());
      
      if (this.isMobileSafari) {
        url.searchParams.set('mobile', '1');
        url.searchParams.set('ios_version', this._getIOSVersion());
      }
      
      // Add keep-alive preference
      if (this.config.enableKeepAlive) {
        url.searchParams.set('keepalive', this.config.keepAliveInterval.toString());
      }
    }
    
    // Add connection attempt info for server optimization
    url.searchParams.set('attempt', (this.reconnectionAttempts + 1).toString());
    url.searchParams.set('background', this.isBackgroundTab ? '1' : '0');
    
    return url.toString();
  }
  
  /**
   * Get Safari version for URL parameters
   * @returns {string} Safari version or 'unknown'
   */
  _getSafariVersion() {
    const match = navigator.userAgent.match(/Version\/(\d+)\.(\d+)/);
    return match ? `${match[1]}.${match[2]}` : 'unknown';
  }
  
  /**
   * Get iOS version for URL parameters  
   * @returns {string} iOS version or 'unknown'
   */
  _getIOSVersion() {
    const match = navigator.userAgent.match(/OS (\d+)_(\d+)/);
    return match ? `${match[1]}.${match[2]}` : 'unknown';
  }
  
  /**
   * Setup EventSource event listeners
   */
  _setupEventSourceListeners() {
    if (!this.eventSource) return;
    
    this.eventSource.onopen = (event) => {
      this._clearConnectionTimeout();
      this.state = SSE_CONNECTION_STATES.CONNECTED;
      this.reconnectionAttempts = 0;
      this.lastSuccessfulConnection = Date.now();
      this.lastActivity = Date.now();
      
      const connectionTime = Date.now() - this.metrics.connectionStartTime;
      
      errorLogger.logInfo('SSE connection established', {
        context: 'sse_connection_established',
        connectionTime: connectionTime + 'ms',
        readyState: this.eventSource.readyState,
        attempt: this.metrics.totalConnections
      });
      
      this._emitEvent(SSE_EVENT_TYPES.CONNECTION_OPEN, {
        timestamp: Date.now(),
        connectionTime,
        attempt: this.metrics.totalConnections
      });
      
      // Setup keep-alive if enabled and on Safari
      if (this.config.enableKeepAlive && this.isSafari) {
        const interval = this.isBackgroundTab ? 60000 : this.config.keepAliveInterval;
        this._setupKeepAlive(interval);
      }
    };
    
    this.eventSource.onmessage = (event) => {
      this._handleMessage(event);
    };
    
    this.eventSource.onerror = (event) => {
      this._handleConnectionError('EventSource error', event);
    };
  }
  
  /**
   * Handle incoming SSE message
   * PERFORMANCE: Optimized for minimal overhead in hot path
   * @param {MessageEvent} event - SSE message event
   */
  _handleMessage(event) {
    const now = Date.now();
    this.lastActivity = now;
    this.metrics.totalMessages++;
    
    // PERFORMANCE: Record first message time with minimal overhead
    if (!this.metrics.firstMessageTime) {
      this.metrics.firstMessageTime = now;
      const latency = now - this.metrics.connectionStartTime;
      this.metrics.averageLatency = latency;
      
      // PERFORMANCE: Only log if latency exceeds target
      if (latency > 1000) {
        errorLogger.logWarning('Slow first SSE message', {
          context: 'sse_first_message_slow',
          latency: latency + 'ms',
          target: '< 1000ms'
        });
      } else {
        errorLogger.logInfo('First SSE message received', {
          context: 'sse_first_message',
          latency: latency + 'ms'
        });
      }
    }
    
    try {
      let messageData;
      
      // Handle special message types
      if (event.data === '[DONE]') {
        this._emitEvent(SSE_EVENT_TYPES.MESSAGE_RECEIVED, {
          type: 'stream_complete',
          data: '[DONE]',
          timestamp: Date.now()
        });
        return;
      }
      
      // Try to parse as JSON
      try {
        messageData = JSON.parse(event.data);
      } catch (e) {
        // Not JSON, treat as plain text
        messageData = {
          type: 'text',
          content: event.data
        };
      }
      
      // Handle keep-alive messages
      if (messageData.type === 'keepalive' || messageData.type === 'ping') {
        this._handleKeepAliveMessage(messageData);
        return;
      }
      
      // Emit regular message
      this._emitEvent(SSE_EVENT_TYPES.MESSAGE_RECEIVED, {
        ...messageData,
        timestamp: Date.now(),
        raw: event.data
      });
      
    } catch (error) {
      errorLogger.logError(error, {
        context: 'sse_message_parsing_error',
        eventData: event.data?.substring(0, 200) // Log first 200 chars
      });
    }
  }
  
  /**
   * Handle keep-alive message from server
   * @param {Object} messageData - Keep-alive message data
   */
  _handleKeepAliveMessage(messageData) {
    errorLogger.logInfo('Keep-alive message received', {
      context: 'sse_keepalive_received',
      serverTime: messageData.timestamp,
      expectResponse: messageData.expectResponse
    });
    
    this._emitEvent(SSE_EVENT_TYPES.KEEP_ALIVE, {
      ...messageData,
      clientTime: Date.now()
    });
    
    // Send keep-alive response if requested
    if (messageData.expectResponse) {
      this._sendKeepAliveResponse();
    }
  }
  
  /**
   * Send keep-alive response to server
   */
  _sendKeepAliveResponse() {
    // In a real implementation, this would send a keep-alive response
    // to a separate endpoint to maintain the connection
    errorLogger.logInfo('Sending keep-alive response', {
      context: 'sse_keepalive_response'
    });
  }
  
  /**
   * Setup keep-alive timer
   * @param {number} interval - Keep-alive interval in milliseconds
   */
  _setupKeepAlive(interval) {
    this._clearKeepAlive();
    
    if (!this.config.enableKeepAlive || !this.isSafari) return;
    
    this.keepAliveTimer = setInterval(() => {
      if (this.state === SSE_CONNECTION_STATES.CONNECTED && this.eventSource) {
        this._sendKeepAlivePing();
      }
    }, interval);
    
    errorLogger.logInfo('Keep-alive timer setup', {
      context: 'sse_keepalive_setup',
      interval: interval + 'ms',
      isBackground: this.isBackgroundTab
    });
  }
  
  /**
   * Send keep-alive ping to maintain Safari connection
   */
  _sendKeepAlivePing() {
    // In a real implementation, this would send a ping request
    // to prevent Safari from timing out the connection
    errorLogger.logInfo('Sending keep-alive ping', {
      context: 'sse_keepalive_ping',
      lastActivity: Date.now() - this.lastActivity
    });
  }
  
  /**
   * Clear keep-alive timer
   */
  _clearKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
  
  /**
   * Clear connection timeout timer
   */
  _clearConnectionTimeout() {
    if (this.connectionTimeoutTimer) {
      clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = null;
    }
  }
  
  /**
   * Handle connection error
   * @param {string} reason - Error reason
   * @param {Event} event - Error event (optional)
   */
  _handleConnectionError(reason = 'Unknown error', event = null) {
    this._clearConnectionTimeout();
    this._clearKeepAlive();
    
    const errorInfo = {
      reason,
      readyState: this.eventSource?.readyState,
      lastActivity: this.lastActivity,
      reconnectionAttempts: this.reconnectionAttempts,
      isBackground: this.isBackgroundTab,
      timeSinceLastSuccess: this.lastSuccessfulConnection ? 
        Date.now() - this.lastSuccessfulConnection : null
    };
    
    errorLogger.logError(reason, {
      context: 'sse_connection_error',
      ...errorInfo
    });
    
    this._emitEvent(SSE_EVENT_TYPES.CONNECTION_ERROR, errorInfo);
    
    // Close current connection
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    // Attempt reconnection if within limits
    if (this.reconnectionAttempts < this.config.maxReconnectionAttempts) {
      this.state = SSE_CONNECTION_STATES.RECONNECTING;
      this._scheduleReconnection();
    } else {
      this.state = SSE_CONNECTION_STATES.FAILED;
      errorLogger.logWarning('Maximum reconnection attempts reached', {
        context: 'sse_max_reconnections',
        attempts: this.reconnectionAttempts
      });
    }
  }
  
  /**
   * Schedule reconnection attempt with exponential backoff
   * @param {number} customDelay - Custom delay override
   */
  _scheduleReconnection(customDelay = null) {
    let delay = customDelay;
    
    if (delay === null) {
      if (this.config.exponentialBackoffBase && this.reconnectionAttempts > 0) {
        // Exponential backoff
        delay = Math.min(
          this.config.reconnectionDelay * Math.pow(this.config.exponentialBackoffBase, this.reconnectionAttempts),
          this.config.maxBackoffDelay
        );
      } else {
        // Linear backoff
        delay = this.config.reconnectionDelay * (this.reconnectionAttempts + 1);
      }
    }
    
    errorLogger.logInfo('Scheduling reconnection', {
      context: 'sse_reconnection_scheduled',
      delay: delay + 'ms',
      attempt: this.reconnectionAttempts + 1,
      maxAttempts: this.config.maxReconnectionAttempts
    });
    
    this._emitEvent(SSE_EVENT_TYPES.RECONNECTING, {
      delay,
      attempt: this.reconnectionAttempts + 1,
      maxAttempts: this.config.maxReconnectionAttempts
    });
    
    this.reconnectionTimer = setTimeout(() => {
      this.reconnectionAttempts++;
      this.metrics.totalReconnections++;
      this.connect();
    }, delay);
  }
  
  /**
   * Disconnect from SSE endpoint
   * @param {boolean} allowReconnection - Whether to allow automatic reconnection
   */
  _disconnect(allowReconnection = false) {
    this._clearKeepAlive();
    this._clearConnectionTimeout();
    
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = null;
    }
    
    if (this.backgroundTabTimer) {
      clearTimeout(this.backgroundTabTimer);
      this.backgroundTabTimer = null;
    }
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    const wasConnected = this.state === SSE_CONNECTION_STATES.CONNECTED;
    this.state = allowReconnection ? SSE_CONNECTION_STATES.RECONNECTING : SSE_CONNECTION_STATES.DISCONNECTED;
    
    if (wasConnected) {
      this._emitEvent(SSE_EVENT_TYPES.CONNECTION_CLOSE, {
        timestamp: Date.now(),
        allowReconnection
      });
    }
    
    errorLogger.logInfo('SSE connection disconnected', {
      context: 'sse_disconnected',
      allowReconnection,
      wasConnected
    });
  }
  
  /**
   * Manually disconnect (public method)
   */
  disconnect() {
    this._disconnect(false);
  }
  
  /**
   * Get current connection state
   * @returns {string} Current connection state
   */
  getState() {
    return this.state;
  }
  
  /**
   * Get connection metrics
   * @returns {Object} Connection metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentState: this.state,
      reconnectionAttempts: this.reconnectionAttempts,
      isBackground: this.isBackgroundTab,
      lastActivity: this.lastActivity,
      uptime: this.lastSuccessfulConnection ? Date.now() - this.lastSuccessfulConnection : 0
    };
  }
  
  /**
   * Check if currently connected
   * @returns {boolean} True if connected
   */
  isConnected() {
    return this.state === SSE_CONNECTION_STATES.CONNECTED;
  }
  
  /**
   * Cleanup resources when manager is destroyed
   * PERFORMANCE: Comprehensive cleanup to prevent memory leaks
   */
  destroy() {
    this._disconnect(false);
    
    // Remove visibility change listener
    if (this.visibilityChangeListener && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityChangeListener);
      this.visibilityChangeListener = null; // PERFORMANCE: Clear reference
    }
    
    // Clear all event listeners
    this.eventListeners.clear();
    
    // PERFORMANCE: Clear all references to prevent memory leaks
    this.eventSource = null;
    this.metrics = null;
    this.config = null;
    
    errorLogger.logInfo('SSE Connection Manager destroyed', {
      context: 'sse_manager_destroyed'
    });
  }
}

/**
 * Create SSE Connection Manager with optimal Safari configuration
 * @param {Object} config - Configuration options
 * @returns {SSEConnectionManager} Configured SSE manager
 */
export const createSSEConnectionManager = (config = {}) => {
  return new SSEConnectionManager(config);
};

export default SSEConnectionManager;
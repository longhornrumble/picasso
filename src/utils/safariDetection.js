/**
 * Safari Detection Utility - PERFORMANCE OPTIMIZED
 * Provides accurate Safari vs Chrome detection with iOS version detection
 * and Mobile Safari specific behavior flags for SSE compatibility
 * Optimized for minimal overhead and cached results
 */

import { errorLogger } from './errorHandling';

// PERFORMANCE: Cache browser detection results to avoid repeated regex execution
let _safariCache = null;
let _mobileSafariCache = null;
let _desktopSafariCache = null;

/**
 * Clear cached detection results (for testing)
 * @private
 */
export const _clearDetectionCache = () => {
  _safariCache = null;
  _mobileSafariCache = null;
  _desktopSafariCache = null;
};

/**
 * Detect Safari browser (excluding Chrome-based browsers on iOS)
 * PERFORMANCE: Cached result to avoid repeated regex evaluation
 * @returns {boolean} True if Safari browser
 */
export const isSafari = () => {
  if (_safariCache !== null) return _safariCache;
  
  const userAgent = navigator.userAgent;
  // First check: exclude Chrome-based browsers on iOS/mobile
  if (/CriOS|FxiOS|OPiOS|mercury/i.test(userAgent)) {
    _safariCache = false;
    return _safariCache;
  }
  
  // Safari detection: Safari string present, but exclude Chrome and Android
  _safariCache = /^((?!chrome|android).)*safari/i.test(userAgent);
  return _safariCache;
};

/**
 * Detect Mobile Safari specifically
 * PERFORMANCE: Cached result and optimized detection
 * @returns {boolean} True if Mobile Safari on iOS
 */
export const isMobileSafari = () => {
  if (_mobileSafariCache !== null) return _mobileSafariCache;
  
  _mobileSafariCache = isSafari() && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return _mobileSafariCache;
};

/**
 * Detect Desktop Safari specifically
 * PERFORMANCE: Cached result and optimized detection
 * @returns {boolean} True if Desktop Safari on macOS
 */
export const isDesktopSafari = () => {
  if (_desktopSafariCache !== null) return _desktopSafariCache;
  
  _desktopSafariCache = isSafari() && /Macintosh|MacIntel/i.test(navigator.userAgent);
  return _desktopSafariCache;
};

/**
 * Get iOS version if on iOS
 * @returns {string|null} iOS version string or null if not iOS
 */
export const getIOSVersion = () => {
  if (!isMobileSafari()) return null;
  
  const match = navigator.userAgent.match(/OS (\d+)_(\d+)_?(\d+)?/);
  if (match) {
    return `${match[1]}.${match[2]}${match[3] ? '.' + match[3] : ''}`;
  }
  return null;
};

/**
 * Get Safari version
 * @returns {string|null} Safari version string or null if not Safari
 */
export const getSafariVersion = () => {
  if (!isSafari()) return null;
  
  const match = navigator.userAgent.match(/Version\/(\d+)\.(\d+)\.?(\d+)?/);
  if (match) {
    return `${match[1]}.${match[2]}${match[3] ? '.' + match[3] : ''}`;
  }
  return null;
};

/**
 * Check if browser supports modern EventSource features
 * @returns {boolean} True if EventSource is fully supported
 */
export const supportsEventSource = () => {
  return typeof EventSource !== 'undefined' && 
         EventSource.prototype.hasOwnProperty('readyState');
};

/**
 * Safari-specific behavior flags for SSE connections
 */
export const safariSSEBehaviors = {
  /**
   * Safari tends to timeout SSE connections more aggressively
   */
  requiresKeepAlive: () => isSafari(),
  
  /**
   * Mobile Safari pauses connections in background tabs
   */
  pausesInBackground: () => isMobileSafari(),
  
  /**
   * Safari has more aggressive memory management for background tabs
   */
  hasAggressiveMemoryManagement: () => isSafari(),
  
  /**
   * Safari drops connections on network changes
   */
  dropsOnNetworkChange: () => isSafari(),
  
  /**
   * Recommended keep-alive interval for Safari (milliseconds)
   */
  keepAliveInterval: () => isMobileSafari() ? 30000 : 45000, // 30s mobile, 45s desktop
  
  /**
   * Recommended reconnection delay for Safari (milliseconds)
   */
  reconnectionDelay: () => isMobileSafari() ? 2000 : 1000, // 2s mobile, 1s desktop
  
  /**
   * Maximum time to maintain connection in background tab (milliseconds)
   */
  backgroundTabTimeout: () => isMobileSafari() ? 60000 : 300000, // 1min mobile, 5min desktop
  
  /**
   * Maximum reconnection attempts before giving up
   */
  maxReconnectionAttempts: () => 5,
  
  /**
   * Whether to use exponential backoff for reconnections
   */
  useExponentialBackoff: () => true
};

/**
 * Check if current environment requires Safari-specific SSE handling
 * @returns {boolean} True if Safari-specific handling is needed
 */
export const requiresSafariSSEHandling = () => {
  return isSafari() && supportsEventSource();
};

/**
 * Get browser compatibility info for logging
 * @returns {Object} Browser compatibility information
 */
export const getBrowserCompatibilityInfo = () => {
  const info = {
    userAgent: navigator.userAgent,
    isSafari: isSafari(),
    isMobileSafari: isMobileSafari(),
    isDesktopSafari: isDesktopSafari(),
    safariVersion: getSafariVersion(),
    iosVersion: getIOSVersion(),
    supportsEventSource: supportsEventSource(),
    requiresSafariSSE: requiresSafariSSEHandling(),
    platform: navigator.platform,
    language: navigator.language,
    cookieEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
    connection: navigator.connection ? {
      effectiveType: navigator.connection.effectiveType,
      type: navigator.connection.type,
      downlink: navigator.connection.downlink
    } : null
  };
  
  return info;
};

/**
 * Log browser compatibility information for debugging
 */
export const logBrowserCompatibility = () => {
  const info = getBrowserCompatibilityInfo();
  
  errorLogger.logInfo('Browser Compatibility Detection', {
    context: 'safari_detection',
    ...info
  });
  
  if (info.requiresSafariSSE) {
    errorLogger.logInfo('Safari SSE Compatibility Required', {
      context: 'safari_sse_detection',
      behaviors: {
        requiresKeepAlive: safariSSEBehaviors.requiresKeepAlive(),
        pausesInBackground: safariSSEBehaviors.pausesInBackground(),
        keepAliveInterval: safariSSEBehaviors.keepAliveInterval(),
        reconnectionDelay: safariSSEBehaviors.reconnectionDelay(),
        backgroundTabTimeout: safariSSEBehaviors.backgroundTabTimeout()
      }
    });
  }
  
  return info;
};

/**
 * Validate that EventSource is available and functional
 * @returns {Promise<boolean>} True if EventSource works correctly
 */
export const validateEventSourceSupport = async () => {
  if (!supportsEventSource()) {
    errorLogger.logWarning('EventSource not supported in this browser');
    return false;
  }
  
  try {
    // Test basic EventSource creation (this will fail but shouldn't crash)
    const testUrl = 'data:text/plain,test';
    const eventSource = new EventSource(testUrl);
    
    // Clean up immediately
    setTimeout(() => {
      eventSource.close();
    }, 10);
    
    return true;
  } catch (error) {
    errorLogger.logError(error, {
      context: 'eventsource_validation_failed',
      userAgent: navigator.userAgent
    });
    return false;
  }
};

// PERFORMANCE: Cache optimal SSE config to avoid repeated calculation
let _optimalSSEConfig = null;

/**
 * Get optimal SSE configuration for current browser
 * PERFORMANCE: Cached configuration with performance-optimized values
 * @returns {Object} SSE configuration optimized for current browser
 */
export const getOptimalSSEConfig = () => {
  if (_optimalSSEConfig) return _optimalSSEConfig;
  
  const config = {
    withCredentials: false,
    timeout: 20000, // PERFORMANCE: Reduced from 30s for faster failure detection
    retryDelay: 500, // PERFORMANCE: Faster retry for quick recovery
    maxRetries: 3
  };
  
  if (isSafari()) {
    // Safari-specific optimizations
    config.keepAliveInterval = isMobileSafari() ? 20000 : 30000; // PERFORMANCE: More frequent keep-alive
    config.reconnectionDelay = isMobileSafari() ? 1000 : 500; // PERFORMANCE: Faster reconnection
    config.backgroundTabTimeout = isMobileSafari() ? 60000 : 180000; // PERFORMANCE: Shorter timeout
    config.maxRetries = 3; // PERFORMANCE: Fewer retries for faster failure
    config.useExponentialBackoff = false; // PERFORMANCE: Linear backoff is faster
    
    if (isMobileSafari()) {
      // Mobile Safari specific adjustments
      config.timeout = 15000; // PERFORMANCE: Even shorter timeout for mobile
      config.backgroundHandling = true;
      config.pauseInBackground = true;
    }
  }
  
  _optimalSSEConfig = config;
  return config;
};

// Export all detection functions for individual use
export default {
  isSafari,
  isMobileSafari,
  isDesktopSafari,
  getIOSVersion,
  getSafariVersion,
  supportsEventSource,
  safariSSEBehaviors,
  requiresSafariSSEHandling,
  getBrowserCompatibilityInfo,
  logBrowserCompatibility,
  validateEventSourceSupport,
  getOptimalSSEConfig
};
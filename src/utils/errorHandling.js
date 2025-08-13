/**
 * Error Handling and Logging Infrastructure for Picasso Chat Widget
 * 
 * Centralized error handling, logging, and monitoring system for production use.
 * Provides structured error reporting, retry logic, and user-friendly error messages.
 */

import { sanitizeError } from './security';
import { config as environmentConfig } from '../config/environment';

// Error severity levels
export const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Error categories for better organization
export const ERROR_CATEGORY = {
  NETWORK: 'network',
  API: 'api',
  UI: 'ui',
  AUTHENTICATION: 'authentication',
  VALIDATION: 'validation',
  RENDERING: 'rendering',
  CONFIGURATION: 'configuration',
  UNKNOWN: 'unknown'
};

// Error types for classification
export const ERROR_TYPES = {
  NETWORK_ERROR: 'network_error',
  TIMEOUT_ERROR: 'timeout_error',
  RATE_LIMIT_ERROR: 'rate_limit_error',
  CLIENT_ERROR: 'client_error',
  SERVER_ERROR: 'server_error',
  VALIDATION_ERROR: 'validation_error',
  RENDER_ERROR: 'render_error',
  CONFIG_ERROR: 'config_error',
  JWT_ERROR: 'jwt_error',
  JWT_EXPIRED_ERROR: 'jwt_expired_error',
  JWT_VALIDATION_ERROR: 'jwt_validation_error',
  FUNCTION_URL_ERROR: 'function_url_error',
  UNKNOWN_ERROR: 'unknown_error'
};

/**
 * Enhanced error classifier with more detailed categorization
 */
export const classifyError = (error, response = null) => {
  // Network and fetch errors
  if (error.name === 'AbortError' || error.message.includes('timeout')) {
    return {
      type: ERROR_TYPES.TIMEOUT_ERROR,
      category: ERROR_CATEGORY.NETWORK,
      severity: ERROR_SEVERITY.MEDIUM,
      retryable: true
    };
  }
  
  if (error.message.includes('Failed to fetch') || 
      error.message.includes('NetworkError') ||
      error.message.includes('ERR_NETWORK')) {
    return {
      type: ERROR_TYPES.NETWORK_ERROR,
      category: ERROR_CATEGORY.NETWORK,
      severity: ERROR_SEVERITY.MEDIUM,
      retryable: true
    };
  }
  
  // HTTP status-based errors
  if (response) {
    if (response.status === 429) {
      return {
        type: ERROR_TYPES.RATE_LIMIT_ERROR,
        category: ERROR_CATEGORY.API,
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: true
      };
    }
    
    if (response.status === 401 || response.status === 403) {
      return {
        type: ERROR_TYPES.CLIENT_ERROR,
        category: ERROR_CATEGORY.AUTHENTICATION,
        severity: ERROR_SEVERITY.HIGH,
        retryable: false
      };
    }
    
    if (response.status >= 400 && response.status < 500) {
      return {
        type: ERROR_TYPES.CLIENT_ERROR,
        category: ERROR_CATEGORY.VALIDATION,
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: false
      };
    }
    
    if (response.status >= 500) {
      return {
        type: ERROR_TYPES.SERVER_ERROR,
        category: ERROR_CATEGORY.API,
        severity: ERROR_SEVERITY.HIGH,
        retryable: true
      };
    }
  }
  
  // React and rendering errors
  if (error.message.includes('React') || error.message.includes('render')) {
    return {
      type: ERROR_TYPES.RENDER_ERROR,
      category: ERROR_CATEGORY.RENDERING,
      severity: ERROR_SEVERITY.HIGH,
      retryable: false
    };
  }
  
  // Configuration errors
  if (error.message.includes('config') || error.message.includes('configuration')) {
    return {
      type: ERROR_TYPES.CONFIG_ERROR,
      category: ERROR_CATEGORY.CONFIGURATION,
      severity: ERROR_SEVERITY.CRITICAL,
      retryable: false
    };
  }
  
  // JWT and authentication errors
  if (error.message.includes('JWT') || error.message.includes('jwt')) {
    if (error.message.includes('expired') || error.message.includes('expir')) {
      return {
        type: ERROR_TYPES.JWT_EXPIRED_ERROR,
        category: ERROR_CATEGORY.AUTHENTICATION,
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: true // Can retry with new token
      };
    }
    
    if (error.message.includes('invalid') || error.message.includes('validation')) {
      return {
        type: ERROR_TYPES.JWT_VALIDATION_ERROR,
        category: ERROR_CATEGORY.AUTHENTICATION,
        severity: ERROR_SEVERITY.HIGH,
        retryable: false
      };
    }
    
    if (error.message.includes('Token generation failed')) {
      return {
        type: ERROR_TYPES.JWT_ERROR,
        category: ERROR_CATEGORY.AUTHENTICATION,
        severity: ERROR_SEVERITY.HIGH,
        retryable: true
      };
    }
    
    return {
      type: ERROR_TYPES.JWT_ERROR,
      category: ERROR_CATEGORY.AUTHENTICATION,
      severity: ERROR_SEVERITY.HIGH,
      retryable: false
    };
  }
  
  // Function URL errors
  if (error.message.includes('Function URL') || error.message.includes('function_url')) {
    return {
      type: ERROR_TYPES.FUNCTION_URL_ERROR,
      category: ERROR_CATEGORY.API,
      severity: ERROR_SEVERITY.HIGH,
      retryable: true
    };
  }
  
  // Default unknown error
  return {
    type: ERROR_TYPES.UNKNOWN_ERROR,
    category: ERROR_CATEGORY.UNKNOWN,
    severity: ERROR_SEVERITY.MEDIUM,
    retryable: true
  };
};

/**
 * Enhanced retry logic with exponential backoff
 */
export const shouldRetry = (errorClassification, attempt, _maxRetries = 3) => {
  if (!errorClassification.retryable) {
    return false;
  }
  
  const retryLimits = {
    [ERROR_TYPES.NETWORK_ERROR]: 3,
    [ERROR_TYPES.TIMEOUT_ERROR]: 3,
    [ERROR_TYPES.RATE_LIMIT_ERROR]: 2,
    [ERROR_TYPES.SERVER_ERROR]: 3,
    [ERROR_TYPES.JWT_ERROR]: 2,
    [ERROR_TYPES.JWT_EXPIRED_ERROR]: 1, // Only retry once for expired tokens
    [ERROR_TYPES.JWT_VALIDATION_ERROR]: 0, // Never retry validation errors
    [ERROR_TYPES.FUNCTION_URL_ERROR]: 2,
    [ERROR_TYPES.UNKNOWN_ERROR]: 1
  };
  
  const limit = retryLimits[errorClassification.type] || 1;
  return attempt < limit;
};

/**
 * Calculate backoff delay with jitter
 */
export const getBackoffDelay = (errorClassification, attempt, baseDelay = 1000) => {
  const delays = {
    [ERROR_TYPES.NETWORK_ERROR]: 1000,
    [ERROR_TYPES.TIMEOUT_ERROR]: 2000,
    [ERROR_TYPES.RATE_LIMIT_ERROR]: 5000,
    [ERROR_TYPES.SERVER_ERROR]: 2000,
    [ERROR_TYPES.JWT_ERROR]: 1500,
    [ERROR_TYPES.JWT_EXPIRED_ERROR]: 500, // Quick retry for expired tokens
    [ERROR_TYPES.JWT_VALIDATION_ERROR]: 0, // No retry delay
    [ERROR_TYPES.FUNCTION_URL_ERROR]: 2000,
    [ERROR_TYPES.UNKNOWN_ERROR]: 1000
  };
  
  const delay = delays[errorClassification.type] || baseDelay;
  const exponentialDelay = delay * Math.pow(2, attempt - 1);
  
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.1 * exponentialDelay;
  
  return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
};

/**
 * Get user-friendly error messages
 */
export const getUserFriendlyMessage = (errorClassification, attempt = 1) => {
  const messages = {
    [ERROR_TYPES.NETWORK_ERROR]: "You appear to be offline. Please check your connection and try again.",
    [ERROR_TYPES.TIMEOUT_ERROR]: "The request is taking longer than expected. Please try again.",
    [ERROR_TYPES.RATE_LIMIT_ERROR]: "I'm receiving a lot of messages right now. Please wait a moment before trying again.",
    [ERROR_TYPES.SERVER_ERROR]: "Our chat service is temporarily unavailable. Please try again in a few moments.",
    [ERROR_TYPES.CLIENT_ERROR]: "I'm having trouble processing that request. Please check your input and try again.",
    [ERROR_TYPES.VALIDATION_ERROR]: "The information provided is invalid. Please check and try again.",
    [ERROR_TYPES.RENDER_ERROR]: "There was a problem displaying the chat. Please refresh the page.",
    [ERROR_TYPES.CONFIG_ERROR]: "There's a configuration issue. Please contact support.",
    [ERROR_TYPES.JWT_ERROR]: "Authentication failed. Please try again.",
    [ERROR_TYPES.JWT_EXPIRED_ERROR]: "Your session has expired. Please try again.",
    [ERROR_TYPES.JWT_VALIDATION_ERROR]: "Authentication validation failed. Please refresh and try again.",
    [ERROR_TYPES.FUNCTION_URL_ERROR]: "Chat service connection failed. Please try again.",
    [ERROR_TYPES.UNKNOWN_ERROR]: "Something unexpected happened. Please try again."
  };
  
  const baseMessage = messages[errorClassification.type] || messages[ERROR_TYPES.UNKNOWN_ERROR];
  
  if (attempt > 1) {
    return `${baseMessage} (Attempt ${attempt})`;
  }
  
  return baseMessage;
};

/**
 * Structured error logger with different levels
 */
class ErrorLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 100;
    this.enabled = environmentConfig.ENABLE_DEBUG_LOGGING || false;
  }
  
  /**
   * Log an error with structured data
   */
  logError(error, context = {}) {
    const errorClassification = context.classification || classifyError(error, context.response);
    const sanitizedError = sanitizeError(error);
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      errorId: this.generateErrorId(),
      message: sanitizedError.message,
      stack: sanitizedError.stack,
      classification: errorClassification,
      context: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        tenantHash: context.tenantHash || 'unknown',
        messageId: context.messageId,
        attempt: context.attempt,
        ...context
      },
      environment: environmentConfig.ENVIRONMENT,
      version: window.PICASSO_VERSION || 'unknown'
    };
    
    // Add to local logs
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    // Console logging based on environment
    if (this.enabled) {
      console.error('🚨 Picasso Error:', logEntry);
    } else {
      console.error('🚨 Picasso Error:', sanitizedError.message);
    }
    
    // Report to external service in production
    // TODO: Enable when Lambda endpoint supports action=log_error
    if (environmentConfig.ENVIRONMENT === 'production' && false) {
      this.reportToExternalService(logEntry);
    }
    
    // Notify parent window if in iframe
    this.notifyParentWindow(logEntry);
    
    return logEntry;
  }
  
  /**
   * Log a warning
   */
  logWarning(message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'warning',
      message,
      context,
      environment: environmentConfig.ENVIRONMENT
    };
    
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    if (this.enabled) {
      console.warn('⚠️ Picasso Warning:', logEntry);
    }
  }
  
  /**
   * Log informational messages
   */
  logInfo(message, context = {}) {
    if (!this.enabled) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      context,
      environment: environmentConfig.ENVIRONMENT
    };
    
    console.log('ℹ️ Picasso Info:', logEntry);
  }
  
  /**
   * Generate unique error ID
   */
  generateErrorId() {
    return `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Report error to external service
   */
  reportToExternalService(logEntry) {
    try {
      // Use environment-specific error reporting endpoint
      const errorEndpoint = environmentConfig.ERROR_REPORTING_ENDPOINT || 
                           window.PicassoConfig?.error_reporting_endpoint;
      
      if (errorEndpoint && environmentConfig.ERROR_REPORTING !== false) {
        const tenantHash = window.PicassoConfig?.tenant || 
                          window.PicassoConfig?.tenant_id || 
                          'unknown';
        
        fetch(errorEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': tenantHash
          },
          body: JSON.stringify({
            ...logEntry,
            source: 'picasso-widget',
            iframeMode: document.body.getAttribute('data-iframe') === 'true'
          }),
          credentials: 'omit'
        }).catch(err => {
          console.warn('Failed to report error to external service:', err);
        });
      }
    } catch (error) {
      console.warn('Error reporting failed:', error);
    }
  }
  
  /**
   * Notify parent window of errors (for iframe scenarios)
   */
  notifyParentWindow(logEntry) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'PICASSO_ERROR',
          error: {
            id: logEntry.errorId,
            message: logEntry.message,
            classification: logEntry.classification,
            timestamp: logEntry.timestamp
          }
        }, '*');
      }
    } catch (error) {
      console.warn('Failed to notify parent window:', error);
    }
  }
  
  /**
   * Get all logs (for debugging)
   */
  getLogs() {
    return [...this.logs];
  }
  
  /**
   * Clear logs
   */
  clearLogs() {
    this.logs = [];
  }
  
  /**
   * Export logs for debugging
   */
  exportLogs() {
    return {
      logs: this.logs,
      summary: {
        total: this.logs.length,
        bySeverity: this.logs.reduce((acc, log) => {
          const severity = log.classification?.severity || 'unknown';
          acc[severity] = (acc[severity] || 0) + 1;
          return acc;
        }, {}),
        byCategory: this.logs.reduce((acc, log) => {
          const category = log.classification?.category || 'unknown';
          acc[category] = (acc[category] || 0) + 1;
          return acc;
        }, {})
      }
    };
  }
}

// Create singleton instance
export const errorLogger = new ErrorLogger();

/**
 * Global error handler for unhandled errors
 */
export const setupGlobalErrorHandling = () => {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    errorLogger.logError(new Error(event.reason), {
      type: 'unhandledrejection',
      promise: event.promise
    });
  });
  
  // Handle global errors
  window.addEventListener('error', (event) => {
    event.preventDefault();
    errorLogger.logError(event.error || new Error(event.message), {
      type: 'global',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });
  
  // Handle console errors
  const originalConsoleError = console.error;
  console.error = (...args) => {
    originalConsoleError.apply(console, args);
    
    // Don't log our own error logging
    if (args[0] && typeof args[0] === 'string' && args[0].includes('🚨 Picasso Error')) {
      return;
    }
    
    errorLogger.logError(new Error(args.join(' ')), {
      type: 'console_error',
      originalArgs: args
    });
  };
};

/**
 * Performance monitoring
 */
export const performanceMonitor = {
  marks: new Map(),
  
  startTimer(name) {
    this.marks.set(name, performance.now());
  },
  
  endTimer(name) {
    const startTime = this.marks.get(name);
    if (startTime) {
      const duration = performance.now() - startTime;
      this.marks.delete(name);
      
      if (environmentConfig.ENABLE_DEBUG_LOGGING) {
        console.log(`⏱️ ${name}: ${duration.toFixed(2)}ms`);
      }
      
      return duration;
    }
    return null;
  },
  
  measure(name, fn) {
    this.startTimer(name);
    try {
      return fn();
    } finally {
      this.endTimer(name);
    }
  }
};

export default {
  ERROR_SEVERITY,
  ERROR_CATEGORY,
  ERROR_TYPES,
  classifyError,
  shouldRetry,
  getBackoffDelay,
  getUserFriendlyMessage,
  errorLogger,
  setupGlobalErrorHandling,
  performanceMonitor
}; 
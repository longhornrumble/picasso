/**
 * Error Handling and Logging Infrastructure for Picasso Chat Widget
 * 
 * Centralized error handling, logging, and monitoring system for production use.
 * Provides structured error reporting, retry logic, and user-friendly error messages.
 */

import { sanitizeError } from './security';
import { config as environmentConfig } from '../config/environment';

// Safe string helpers to prevent undefined.startsWith() errors
const s = v => (typeof v === 'string' ? v : '');
const starts = (v, p) => {
  const str = s(v);
  return str && typeof str.startsWith === 'function' ? str.startsWith(p) : false;
};
const has = (v, sub) => {
  const str = s(v);
  return str && typeof str.includes === 'function' ? str.includes(sub) : false;
};

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
  try {
    // Normalize once at the top
    const msg = typeof error?.message === 'string' ? error.message : '';
    const name = typeof error?.name === 'string' ? error.name : '';
  
  // Network and fetch errors
  if (name === 'AbortError' || has(msg, 'timeout')) {
    return {
      type: ERROR_TYPES.TIMEOUT_ERROR,
      category: ERROR_CATEGORY.NETWORK,
      severity: ERROR_SEVERITY.MEDIUM,
      retryable: true
    };
  }
  
  if (has(msg, 'Failed to fetch') || 
      has(msg, 'NetworkError') ||
      has(msg, 'ERR_NETWORK')) {
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
  if (has(msg, 'React') || has(msg, 'render')) {
    return {
      type: ERROR_TYPES.RENDER_ERROR,
      category: ERROR_CATEGORY.RENDERING,
      severity: ERROR_SEVERITY.HIGH,
      retryable: false
    };
  }
  
  // Configuration errors
  if (has(msg, 'config') || has(msg, 'configuration')) {
    return {
      type: ERROR_TYPES.CONFIG_ERROR,
      category: ERROR_CATEGORY.CONFIGURATION,
      severity: ERROR_SEVERITY.CRITICAL,
      retryable: false
    };
  }
  
  // JWT and authentication errors
  if (has(msg, 'JWT') || has(msg, 'jwt')) {
    if (has(msg, 'expired') || has(msg, 'expir')) {
      return {
        type: ERROR_TYPES.JWT_EXPIRED_ERROR,
        category: ERROR_CATEGORY.AUTHENTICATION,
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: true // Can retry with new token
      };
    }
    
    if (has(msg, 'invalid') || has(msg, 'validation')) {
      return {
        type: ERROR_TYPES.JWT_VALIDATION_ERROR,
        category: ERROR_CATEGORY.AUTHENTICATION,
        severity: ERROR_SEVERITY.HIGH,
        retryable: false
      };
    }
    
    if (has(msg, 'Token generation failed')) {
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
  if (has(msg, 'Function URL') || has(msg, 'function_url')) {
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
  } catch (e) {
    // If error classification itself fails, return safe default
    console.warn('Error classifier failed:', e);
    return {
      type: ERROR_TYPES.UNKNOWN_ERROR,
      category: ERROR_CATEGORY.UNKNOWN,
      severity: ERROR_SEVERITY.MEDIUM,
      retryable: true
    };
  }
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
    // Extra defensive: catch any error in the error logger itself
    try {
      // Ensure error is an object with safe properties
      const safeError = error || {};
      if (!safeError.message) {
        safeError.message = String(error) || 'Unknown error';
      }
      if (!safeError.name) {
        safeError.name = 'Error';
      }
      
      const errorClassification = context.classification || classifyError(safeError, context.response);
      const sanitizedError = sanitizeError(safeError);
    
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
    
    return logEntry;
    } catch (loggerError) {
      // If the logger itself fails, just log to console
      console.error('Error logger failed:', loggerError, 'Original error:', error);
      return null;
    }
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
    if (args[0] && typeof args[0] === 'string' && has(args[0], '🚨 Picasso Error')) {
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
  errorLogger,
  setupGlobalErrorHandling,
  performanceMonitor
}; 
/**
 * Production-safe logger utility
 * Only logs in development mode, silent in production
 */

const isDevelopment = process.env.NODE_ENV === 'development' || 
                      window.location.hostname === 'localhost' ||
                      window.location.hostname === '127.0.0.1';

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

// Set log level based on environment
const currentLogLevel = isDevelopment ? LOG_LEVELS.DEBUG : LOG_LEVELS.ERROR;

class Logger {
  constructor(context) {
    this.context = context;
  }

  debug(...args) {
    if (currentLogLevel <= LOG_LEVELS.DEBUG) {
      console.log(`[${this.context}]`, ...args);
    }
  }

  info(...args) {
    if (currentLogLevel <= LOG_LEVELS.INFO) {
      console.info(`[${this.context}]`, ...args);
    }
  }

  warn(...args) {
    if (currentLogLevel <= LOG_LEVELS.WARN) {
      console.warn(`[${this.context}]`, ...args);
    }
  }

  error(...args) {
    if (currentLogLevel <= LOG_LEVELS.ERROR) {
      // Always log errors, but sanitize sensitive data
      const sanitizedArgs = args.map(arg => this.sanitize(arg));
      console.error(`[${this.context}]`, ...sanitizedArgs);
      
      // In production, also send to error tracking service
      if (!isDevelopment && window.PicassoErrorReporter) {
        window.PicassoErrorReporter.captureError(new Error(sanitizedArgs.join(' ')), {
          context: this.context,
          level: 'error'
        });
      }
    }
  }

  sanitize(data) {
    if (typeof data === 'string') {
      // Remove potential sensitive data patterns
      return data
        .replace(/Bearer\s+[A-Za-z0-9\-._~+\/]+=*/g, 'Bearer [REDACTED]')
        .replace(/([a-zA-Z0-9_-]{20,})/g, '[TOKEN]')
        .replace(/session[_-]?id["\s:=]+["']?([^"'\s,}]+)/gi, 'session_id: [REDACTED]')
        .replace(/conversation[_-]?id["\s:=]+["']?([^"'\s,}]+)/gi, 'conversation_id: [REDACTED]');
    }
    
    if (typeof data === 'object' && data !== null) {
      const cloned = { ...data };
      const sensitiveKeys = ['token', 'session_id', 'conversation_id', 'state_token', 'authorization'];
      
      for (const key of Object.keys(cloned)) {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          cloned[key] = '[REDACTED]';
        } else if (typeof cloned[key] === 'object') {
          cloned[key] = this.sanitize(cloned[key]);
        }
      }
      
      return cloned;
    }
    
    return data;
  }

  // Performance timing helper
  time(label) {
    if (isDevelopment) {
      console.time(`[${this.context}] ${label}`);
    }
  }

  timeEnd(label) {
    if (isDevelopment) {
      console.timeEnd(`[${this.context}] ${label}`);
    }
  }
}

// Factory function to create loggers
export function createLogger(context) {
  return new Logger(context);
}

// Default logger instance
export const logger = new Logger('Picasso');

export default logger;
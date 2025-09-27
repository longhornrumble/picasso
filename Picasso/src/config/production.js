/**
 * Production Configuration
 * Secure settings for production environment
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isStaging = window.location.hostname.includes('staging') || 
                  window.location.hostname.includes('stg');
const isProduction = !isDevelopment && !isStaging;

export const productionConfig = {
  // Environment detection
  environment: isProduction ? 'production' : isStaging ? 'staging' : 'development',
  
  // API Configuration
  api: {
    baseUrl: isProduction 
      ? 'https://chat.myrecruiter.ai'
      : isStaging 
        ? 'https://staging.chat.myrecruiter.ai'
        : 'http://localhost:8000',
    
    timeout: isProduction ? 25000 : 30000, // 25s in prod (Lambda has 30s limit)
    retryAttempts: isProduction ? 3 : 2,
    retryDelay: 1000, // Base delay for exponential backoff
  },
  
  // Security Configuration
  security: {
    enforceHTTPS: isProduction,
    allowedOrigins: isProduction 
      ? ['https://chat.myrecruiter.ai', 'https://myrecruiter.ai']
      : ['*'], // More permissive in dev/staging
    
    // Content Security Policy
    csp: isProduction ? {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'", 'https://chat.myrecruiter.ai'],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'", 'https://chat.myrecruiter.ai', 'wss://chat.myrecruiter.ai'],
      'font-src': ["'self'", 'data:'],
      'frame-ancestors': ["'self'", 'https://*.myrecruiter.ai']
    } : null,
  },
  
  // Rate Limiting
  rateLimiting: {
    enabled: isProduction,
    maxRequestsPerMinute: 30,
    maxMessagesPerSession: 100,
    cooldownPeriod: 60000, // 1 minute
  },
  
  // Logging Configuration
  logging: {
    level: isProduction ? 'error' : 'debug',
    sendToServer: isProduction,
    includeStackTraces: !isProduction,
    sanitizeSensitiveData: true,
  },
  
  // Performance Configuration
  performance: {
    enableMonitoring: isProduction,
    sampleRate: isProduction ? 0.1 : 1.0, // Sample 10% in prod, 100% in dev
    reportThreshold: 3000, // Report if operation takes > 3s
  },
  
  // Session Configuration
  session: {
    timeout: 30 * 60 * 1000, // 30 minutes
    warningTime: 25 * 60 * 1000, // Warn at 25 minutes
    extendOnActivity: true,
  },
  
  // Feature Flags
  features: {
    streaming: false, // Disabled until fully tested
    fileUpload: isProduction ? false : true, // Disabled in prod for now
    voiceInput: false, // Disabled until implemented
    analytics: isProduction,
  },
  
  // Build Optimizations
  build: {
    minify: isProduction,
    sourceMaps: !isProduction,
    dropConsole: isProduction,
    treeshake: true,
    splitChunks: isProduction,
  },
  
  // Error Reporting
  errorReporting: {
    enabled: isProduction,
    endpoint: 'https://chat.myrecruiter.ai/Master_Function?action=log_error',
    includeUserAgent: true,
    includeTimestamp: true,
    maxErrorsPerSession: 10,
  },
  
  // Cache Configuration
  cache: {
    configTTL: isProduction ? 5 * 60 * 1000 : 60 * 1000, // 5 min prod, 1 min dev
    messageTTL: 30 * 60 * 1000, // 30 minutes
    enableServiceWorker: isProduction,
  }
};

// Validate production configuration
export function validateProductionConfig() {
  const errors = [];
  
  if (isProduction) {
    // Ensure HTTPS
    if (window.location.protocol !== 'https:') {
      errors.push('Production must use HTTPS');
    }
    
    // Ensure proper API endpoint
    if (!productionConfig.api.baseUrl.startsWith('https://')) {
      errors.push('Production API must use HTTPS');
    }
    
    // Ensure rate limiting is enabled
    if (!productionConfig.rateLimiting.enabled) {
      errors.push('Rate limiting must be enabled in production');
    }
    
    // Ensure error reporting is configured
    if (!productionConfig.errorReporting.enabled) {
      errors.push('Error reporting must be enabled in production');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Apply security headers
export function applySecurityHeaders() {
  if (!isProduction) return;
  
  // Set CSP meta tag
  const csp = productionConfig.security.csp;
  if (csp) {
    const cspString = Object.entries(csp)
      .map(([key, values]) => `${key} ${values.join(' ')}`)
      .join('; ');
    
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = cspString;
    document.head.appendChild(meta);
  }
  
  // Prevent clickjacking
  if (window.self !== window.top) {
    const allowedFrameAncestors = ['https://myrecruiter.ai', 'https://www.myrecruiter.ai'];
    const parentOrigin = document.referrer ? new URL(document.referrer).origin : '';
    
    if (!allowedFrameAncestors.some(allowed => parentOrigin.includes(allowed))) {
      console.error('Blocked: Widget loaded in unauthorized frame');
      document.body.innerHTML = '';
      throw new Error('Unauthorized frame embedding');
    }
  }
}

// Rate limiter implementation
class RateLimiter {
  constructor() {
    this.requests = [];
    this.messageCount = 0;
    this.lastReset = Date.now();
  }
  
  canMakeRequest() {
    if (!productionConfig.rateLimiting.enabled) return true;
    
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Clean old requests
    this.requests = this.requests.filter(time => time > oneMinuteAgo);
    
    // Check rate limit
    if (this.requests.length >= productionConfig.rateLimiting.maxRequestsPerMinute) {
      return false;
    }
    
    // Check message limit
    if (this.messageCount >= productionConfig.rateLimiting.maxMessagesPerSession) {
      return false;
    }
    
    // Add current request
    this.requests.push(now);
    this.messageCount++;
    
    return true;
  }
  
  reset() {
    this.requests = [];
    this.messageCount = 0;
    this.lastReset = Date.now();
  }
}

export const rateLimiter = new RateLimiter();

// Export validation on load
if (isProduction) {
  const validation = validateProductionConfig();
  if (!validation.valid) {
    console.error('Production configuration errors:', validation.errors);
  }
  
  // Apply security headers
  applySecurityHeaders();
}

export default productionConfig;
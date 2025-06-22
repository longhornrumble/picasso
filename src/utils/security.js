/**
 * Security Utilities for Picasso Chat Widget
 * 
 * Comprehensive security functions for input validation, sanitization,
 * and security checks to prevent XSS, injection attacks, and other vulnerabilities.
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content with strict security settings
 * @param {string} html - HTML content to sanitize
 * @param {Object} options - DOMPurify options
 * @returns {string} - Sanitized HTML
 */
export const sanitizeHTML = (html, options = {}) => {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const defaultOptions = {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'mark', 'del', 'ins',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'blockquote', 'pre', 'code', 'kbd', 'samp', 'var',
      'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'div', 'span', 'section', 'article', 'aside', 'header', 'footer',
      'nav', 'main', 'figure', 'figcaption', 'cite', 'q', 'abbr', 'acronym',
      'time', 'data', 'address', 'sub', 'sup', 'small', 'big', 'b', 'i'
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'width', 'height', 'class', 'id',
      'target', 'rel', 'download', 'type', 'cite', 'datetime', 'lang'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset', 'onselect', 'onunload', 'onresize', 'onabort', 'onbeforeunload', 'onerror', 'onhashchange', 'onmessage', 'onoffline', 'ononline', 'onpagehide', 'onpageshow', 'onpopstate', 'onstorage', 'oncontextmenu', 'onkeydown', 'onkeypress', 'onkeyup', 'onmousedown', 'onmousemove', 'onmouseout', 'onmouseup', 'onwheel', 'oncopy', 'oncut', 'onpaste', 'onselectstart', 'onselectionchange'],
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_DOM_IMPORT: false,
    RETURN_TRUSTED_TYPE: false,
    SANITIZE_DOM: true,
    WHOLE_DOCUMENT: false,
    ...options
  };

  try {
    return DOMPurify.sanitize(html, defaultOptions);
  } catch (error) {
    console.error('Error sanitizing HTML:', error);
    return '';
  }
};

/**
 * Validate and sanitize URLs
 * @param {string} url - URL to validate
 * @param {Array} allowedDomains - Array of allowed domains
 * @returns {string|null} - Validated URL or null
 */
export const validateURL = (url, allowedDomains = []) => {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(url);
    
    // Check if URL uses secure protocol in production
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      console.warn('Insecure URL detected in production:', url);
      return null;
    }
    
    // Check against allowed domains if specified
    if (allowedDomains.length > 0) {
      const isAllowed = allowedDomains.some(domain => 
        parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
      );
      if (!isAllowed) {
        console.warn('URL not in allowed domains:', url);
        return null;
      }
    }
    
    return parsed.toString();
  } catch (error) {
    console.error('Invalid URL:', url, error);
    return null;
  }
};

/**
 * Sanitize user input to prevent injection attacks
 * @param {string} input - User input to sanitize
 * @param {string} type - Type of input ('text', 'email', 'url', 'number')
 * @returns {string} - Sanitized input
 */
export const sanitizeInput = (input, type = 'text') => {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Remove null bytes and control characters
  let sanitized = input.replace(/[\x00-\x1F\x7F]/g, '').trim();

  switch (type) {
    case 'email':
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(sanitized) ? sanitized.toLowerCase() : '';
    
    case 'url':
      return validateURL(sanitized) || '';
    
    case 'number':
      // Only allow digits, decimal point, and minus sign
      const numberRegex = /^-?\d*\.?\d+$/;
      return numberRegex.test(sanitized) ? sanitized : '';
    
    case 'text':
    default:
      // Remove potentially dangerous characters and HTML tags
      return sanitized.replace(/[<>]/g, '').replace(/<[^>]*>/g, '');
  }
};

/**
 * Validate tenant hash format
 * @param {string} tenantHash - Tenant hash to validate
 * @returns {boolean} - Whether the hash is valid
 */
export const validateTenantHash = (tenantHash) => {
  if (!tenantHash || typeof tenantHash !== 'string') {
    return false;
  }
  
  // Allow alphanumeric, hyphens, and underscores, 3-64 characters
  const hashRegex = /^[a-zA-Z0-9_-]{3,64}$/;
  return hashRegex.test(tenantHash);
};

/**
 * Sanitize file path to prevent directory traversal
 * @param {string} path - File path to sanitize
 * @returns {string} - Sanitized path
 */
export const sanitizeFilePath = (path) => {
  if (!path || typeof path !== 'string') {
    return '';
  }
  
  // Remove directory traversal attempts
  let sanitized = path.replace(/\.\./g, '');
  
  // Remove multiple slashes
  sanitized = sanitized.replace(/\/+/g, '/');
  
  // Remove leading/trailing slashes
  sanitized = sanitized.replace(/^\/+|\/+$/g, '');
  
  // Only allow safe characters (including backslashes for Windows paths)
  sanitized = sanitized.replace(/[^a-zA-Z0-9\/._\-\\]/g, '');
  
  return sanitized;
};

/**
 * Generate a secure nonce for CSP
 * @returns {string} - Secure nonce
 */
export const generateNonce = () => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Validate environment configuration for security
 * @param {Object} config - Configuration object
 * @returns {boolean} - Whether configuration is secure
 */
export const validateConfigSecurity = (config) => {
  const checks = [];
  
  // Check for insecure URLs in production
  if (config.ENVIRONMENT === 'production') {
    const urlFields = ['API_BASE_URL', 'CHAT_API_URL', 'ASSET_BASE_URL', 'WIDGET_DOMAIN'];
    urlFields.forEach(field => {
      if (config[field] && !config[field].startsWith('https://')) {
        checks.push(`Insecure URL in production: ${field}`);
      }
    });
    
    // Check for debug settings in production
    if (config.DEBUG) {
      checks.push('Debug mode enabled in production');
    }
    
    if (config.ALLOW_INSECURE_REQUESTS) {
      checks.push('Insecure requests allowed in production');
    }
  }
  
  if (checks.length > 0) {
    console.error('Security configuration issues:', checks);
    return false;
  }
  
  return true;
};

/**
 * Sanitize error messages for logging
 * @param {Error|string} error - Error to sanitize
 * @returns {Object} - Sanitized error object
 */
export const sanitizeError = (error) => {
  const sanitized = {
    message: '',
    stack: '',
    timestamp: Date.now()
  };
  
  if (error instanceof Error) {
    sanitized.message = error.message ? error.message.substring(0, 200) : 'Unknown error';
    sanitized.stack = error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : '';
  } else if (typeof error === 'string') {
    sanitized.message = error.substring(0, 200);
  } else {
    sanitized.message = 'Unknown error type';
  }
  
  // Remove potentially sensitive information
  sanitized.message = sanitized.message.replace(/password|secret|key|token/gi, '[REDACTED]');
  
  return sanitized;
};

/**
 * Check if the current environment is secure
 * @returns {boolean} - Whether the environment is secure
 */
export const isSecureEnvironment = () => {
  // Check if we're in a secure context (HTTPS or localhost)
  if (typeof window !== 'undefined') {
    return window.isSecureContext || window.location.hostname === 'localhost';
  }
  return process.env.NODE_ENV === 'production';
};

export default {
  sanitizeHTML,
  validateURL,
  sanitizeInput,
  validateTenantHash,
  sanitizeFilePath,
  generateNonce,
  validateConfigSecurity,
  sanitizeError,
  isSecureEnvironment
}; 
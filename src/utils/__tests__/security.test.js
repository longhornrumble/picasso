import { describe, it, expect } from 'vitest';
import {
  sanitizeHTML,
  validateURL,
  sanitizeInput,
  validateTenantHash,
  sanitizeFilePath,
  generateNonce,
  validateConfigSecurity,
  sanitizeError,
  isSecureEnvironment
} from '../security';

describe('Security Utilities', () => {
  describe('sanitizeHTML', () => {
    it('should sanitize malicious HTML', () => {
      const maliciousHTML = '<script>alert("xss")</script><p>Safe content</p>';
      const result = sanitizeHTML(maliciousHTML);
      
      expect(result).not.toContain('<script>');
      expect(result).toContain('<p>Safe content</p>');
    });

    it('should allow safe HTML tags', () => {
      const safeHTML = '<p><strong>Bold</strong> and <em>italic</em> text</p>';
      const result = sanitizeHTML(safeHTML);
      
      expect(result).toContain('<p>');
      expect(result).toContain('<strong>Bold</strong>');
      expect(result).toContain('<em>italic</em>');
    });

    it('should remove dangerous attributes', () => {
      const dangerousHTML = '<p onclick="alert(\'xss\')" onload="alert(\'xss\')">Content</p>';
      const result = sanitizeHTML(dangerousHTML);
      
      expect(result).not.toContain('onclick');
      expect(result).not.toContain('onload');
      expect(result).toContain('<p>Content</p>');
    });

    it('should handle empty input', () => {
      expect(sanitizeHTML('')).toBe('');
      expect(sanitizeHTML(null)).toBe('');
      expect(sanitizeHTML(undefined)).toBe('');
    });
  });

  describe('validateURL', () => {
    it('should validate correct URLs', () => {
      expect(validateURL('https://example.com')).toBe('https://example.com/');
      expect(validateURL('http://localhost:3000')).toBe('http://localhost:3000/');
    });

    it('should reject invalid URLs', () => {
      expect(validateURL('not-a-url')).toBeNull();
      expect(validateURL('')).toBeNull();
      expect(validateURL(null)).toBeNull();
    });

    it('should check allowed domains', () => {
      const allowedDomains = ['example.com', 'myrecruiter.ai'];
      
      expect(validateURL('https://example.com', allowedDomains)).toBe('https://example.com/');
      expect(validateURL('https://sub.myrecruiter.ai', allowedDomains)).toBe('https://sub.myrecruiter.ai/');
      expect(validateURL('https://malicious.com', allowedDomains)).toBeNull();
    });

    it('should reject insecure URLs in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      expect(validateURL('http://example.com')).toBeNull();
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('sanitizeInput', () => {
    it('should sanitize text input', () => {
      expect(sanitizeInput('Hello <script>alert("xss")</script>', 'text'))
        .toBe('Hello scriptalert("xss")/script');
    });

    it('should validate email input', () => {
      expect(sanitizeInput('test@example.com', 'email')).toBe('test@example.com');
      expect(sanitizeInput('invalid-email', 'email')).toBe('');
      expect(sanitizeInput('TEST@EXAMPLE.COM', 'email')).toBe('test@example.com');
    });

    it('should validate number input', () => {
      expect(sanitizeInput('123.45', 'number')).toBe('123.45');
      expect(sanitizeInput('-123', 'number')).toBe('-123');
      expect(sanitizeInput('abc123', 'number')).toBe('');
    });

    it('should validate URL input', () => {
      expect(sanitizeInput('https://example.com', 'url')).toBe('https://example.com/');
      expect(sanitizeInput('not-a-url', 'url')).toBe('');
    });

    it('should remove control characters', () => {
      expect(sanitizeInput('Hello\x00World\x1F')).toBe('HelloWorld');
    });
  });

  describe('validateTenantHash', () => {
    it('should validate correct tenant hashes', () => {
      expect(validateTenantHash('abc123')).toBe(true);
      expect(validateTenantHash('tenant-hash_123')).toBe(true);
      expect(validateTenantHash('a')).toBe(false); // Too short
      expect(validateTenantHash('a'.repeat(65))).toBe(false); // Too long
    });

    it('should reject invalid tenant hashes', () => {
      expect(validateTenantHash('')).toBe(false);
      expect(validateTenantHash(null)).toBe(false);
      expect(validateTenantHash('tenant@hash')).toBe(false); // Invalid character
      expect(validateTenantHash('tenant hash')).toBe(false); // Space not allowed
    });
  });

  describe('sanitizeFilePath', () => {
    it('should prevent directory traversal', () => {
      expect(sanitizeFilePath('../../../etc/passwd')).toBe('etc/passwd');
      expect(sanitizeFilePath('..\\..\\..\\windows\\system32')).toBe('\\\\\\windows\\system32');
    });

    it('should normalize paths', () => {
      expect(sanitizeFilePath('//path//to//file')).toBe('path/to/file');
      expect(sanitizeFilePath('/path/to/file/')).toBe('path/to/file');
    });

    it('should remove dangerous characters', () => {
      expect(sanitizeFilePath('file<script>.txt')).toBe('filescript.txt');
      expect(sanitizeFilePath('file|with|pipes')).toBe('filewithpipes');
    });

    it('should handle edge cases', () => {
      expect(sanitizeFilePath('')).toBe('');
      expect(sanitizeFilePath(null)).toBe('');
      expect(sanitizeFilePath('just-a-file.txt')).toBe('just-a-file.txt');
    });
  });

  describe('generateNonce', () => {
    it('should generate a nonce', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();
      
      expect(typeof nonce1).toBe('string');
      expect(nonce1.length).toBe(32); // 16 bytes = 32 hex characters
      expect(nonce1).not.toBe(nonce2); // Should be unique
    });
  });

  describe('validateConfigSecurity', () => {
    it('should validate secure production config', () => {
      const secureConfig = {
        ENVIRONMENT: 'production',
        API_BASE_URL: 'https://api.example.com',
        CHAT_API_URL: 'https://chat.example.com',
        ASSET_BASE_URL: 'https://assets.example.com',
        WIDGET_DOMAIN: 'https://widget.example.com',
        DEBUG: false,
        ALLOW_INSECURE_REQUESTS: false
      };
      
      expect(validateConfigSecurity(secureConfig)).toBe(true);
    });

    it('should reject insecure production config', () => {
      const insecureConfig = {
        ENVIRONMENT: 'production',
        API_BASE_URL: 'http://api.example.com', // Insecure
        DEBUG: true, // Debug enabled
        ALLOW_INSECURE_REQUESTS: true // Insecure requests allowed
      };
      
      expect(validateConfigSecurity(insecureConfig)).toBe(false);
    });

    it('should allow development config', () => {
      const devConfig = {
        ENVIRONMENT: 'development',
        API_BASE_URL: 'http://localhost:3000',
        DEBUG: true,
        ALLOW_INSECURE_REQUESTS: true
      };
      
      expect(validateConfigSecurity(devConfig)).toBe(true);
    });
  });

  describe('sanitizeError', () => {
    it('should sanitize Error objects', () => {
      const error = new Error('This is a test error with password: secret123');
      const sanitized = sanitizeError(error);
      
      expect(sanitized.message).toContain('This is a test error with');
      expect(sanitized.message).toContain('[REDACTED]');
      expect(sanitized.message).not.toContain('secret123');
      expect(sanitized.timestamp).toBeDefined();
    });

    it('should sanitize string errors', () => {
      const error = 'Error with token: abc123';
      const sanitized = sanitizeError(error);
      
      expect(sanitized.message).toContain('Error with');
      expect(sanitized.message).toContain('[REDACTED]');
      expect(sanitized.message).toContain('abc123');
    });

    it('should handle unknown error types', () => {
      const sanitized = sanitizeError(null);
      expect(sanitized.message).toBe('Unknown error type');
    });

    it('should limit message length', () => {
      const longMessage = 'a'.repeat(300);
      const sanitized = sanitizeError(longMessage);
      
      expect(sanitized.message.length).toBeLessThanOrEqual(200);
    });
  });

  describe('isSecureEnvironment', () => {
    it('should detect secure contexts', () => {
      // Mock window.isSecureContext
      const originalWindow = global.window;
      global.window = {
        isSecureContext: true,
        location: { hostname: 'example.com' }
      };
      
      expect(isSecureEnvironment()).toBe(true);
      
      global.window = originalWindow;
    });

    it('should allow localhost in development', () => {
      const originalWindow = global.window;
      global.window = {
        isSecureContext: false,
        location: { hostname: 'localhost' }
      };
      
      expect(isSecureEnvironment()).toBe(true);
      
      global.window = originalWindow;
    });

    it('should check NODE_ENV when window is not available', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      expect(isSecureEnvironment()).toBe(true);
      
      process.env.NODE_ENV = originalEnv;
    });
  });
}); 
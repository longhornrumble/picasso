import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
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
} from '../errorHandling';

// Mock environment config
vi.mock('../../config/environment', () => ({
  config: {
    ENVIRONMENT: 'test',
    ENABLE_DEBUG_LOGGING: true
  }
}));

// Mock security utilities
vi.mock('../security', () => ({
  sanitizeError: (error) => ({
    message: error.message,
    stack: error.stack
  }),
  isSecureEnvironment: () => true
}));

describe('Error Handling Infrastructure', () => {
  beforeEach(() => {
    // Clear logs before each test
    errorLogger.clearLogs();
    
    // Mock console methods
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Mock fetch
    global.fetch = vi.fn();
    
    // Mock window.parent
    Object.defineProperty(window, 'parent', {
      value: window,
      writable: true
    });
    
    // Mock postMessage
    window.postMessage = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Error Classification', () => {
    it('should classify network errors correctly', () => {
      const networkError = new Error('Failed to fetch');
      const classification = classifyError(networkError);
      
      expect(classification).toEqual({
        type: ERROR_TYPES.NETWORK_ERROR,
        category: ERROR_CATEGORY.NETWORK,
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: true
      });
    });

    it('should classify timeout errors correctly', () => {
      const timeoutError = new Error('timeout');
      timeoutError.name = 'AbortError';
      const classification = classifyError(timeoutError);
      
      expect(classification).toEqual({
        type: ERROR_TYPES.TIMEOUT_ERROR,
        category: ERROR_CATEGORY.NETWORK,
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: true
      });
    });

    it('should classify rate limit errors correctly', () => {
      const mockResponse = { status: 429 };
      const error = new Error('Rate limited');
      const classification = classifyError(error, mockResponse);
      
      expect(classification).toEqual({
        type: ERROR_TYPES.RATE_LIMIT_ERROR,
        category: ERROR_CATEGORY.API,
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: true
      });
    });

    it('should classify authentication errors correctly', () => {
      const mockResponse = { status: 401 };
      const error = new Error('Unauthorized');
      const classification = classifyError(error, mockResponse);
      
      expect(classification).toEqual({
        type: ERROR_TYPES.CLIENT_ERROR,
        category: ERROR_CATEGORY.AUTHENTICATION,
        severity: ERROR_SEVERITY.HIGH,
        retryable: false
      });
    });

    it('should classify server errors correctly', () => {
      const mockResponse = { status: 500 };
      const error = new Error('Internal Server Error');
      const classification = classifyError(error, mockResponse);
      
      expect(classification).toEqual({
        type: ERROR_TYPES.SERVER_ERROR,
        category: ERROR_CATEGORY.API,
        severity: ERROR_SEVERITY.HIGH,
        retryable: true
      });
    });

    it('should classify render errors correctly', () => {
      const renderError = new Error('React render error');
      const classification = classifyError(renderError);
      
      expect(classification).toEqual({
        type: ERROR_TYPES.RENDER_ERROR,
        category: ERROR_CATEGORY.RENDERING,
        severity: ERROR_SEVERITY.HIGH,
        retryable: false
      });
    });

    it('should classify unknown errors correctly', () => {
      const unknownError = new Error('Some random error');
      const classification = classifyError(unknownError);
      
      expect(classification).toEqual({
        type: ERROR_TYPES.UNKNOWN_ERROR,
        category: ERROR_CATEGORY.UNKNOWN,
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: true
      });
    });
  });

  describe('Retry Logic', () => {
    it('should allow retries for network errors', () => {
      const classification = {
        type: ERROR_TYPES.NETWORK_ERROR,
        retryable: true
      };
      
      expect(shouldRetry(classification, 1)).toBe(true);
      expect(shouldRetry(classification, 2)).toBe(true);
      expect(shouldRetry(classification, 3)).toBe(false);
      expect(shouldRetry(classification, 4)).toBe(false);
    });

    it('should not retry client errors', () => {
      const classification = {
        type: ERROR_TYPES.CLIENT_ERROR,
        retryable: false
      };
      
      expect(shouldRetry(classification, 1)).toBe(false);
    });

    it('should limit retries for rate limit errors', () => {
      const classification = {
        type: ERROR_TYPES.RATE_LIMIT_ERROR,
        retryable: true
      };
      
      expect(shouldRetry(classification, 1)).toBe(true);
      expect(shouldRetry(classification, 2)).toBe(false);
      expect(shouldRetry(classification, 3)).toBe(false);
    });
  });

  describe('Backoff Delay', () => {
    it('should calculate exponential backoff with jitter', () => {
      const classification = {
        type: ERROR_TYPES.NETWORK_ERROR
      };
      
      const delay1 = getBackoffDelay(classification, 1);
      const delay2 = getBackoffDelay(classification, 2);
      const delay3 = getBackoffDelay(classification, 3);
      
      expect(delay1).toBeGreaterThan(900);
      expect(delay1).toBeLessThan(1100);
      expect(delay2).toBeGreaterThan(1800);
      expect(delay2).toBeLessThan(2200);
      expect(delay3).toBeGreaterThan(3600);
      expect(delay3).toBeLessThan(4400);
    });

    it('should cap delay at maximum value', () => {
      const classification = {
        type: ERROR_TYPES.NETWORK_ERROR
      };
      
      const delay = getBackoffDelay(classification, 10);
      expect(delay).toBeLessThanOrEqual(30000);
    });
  });

  describe('User-Friendly Messages', () => {
    it('should return appropriate messages for different error types', () => {
      const networkClassification = { type: ERROR_TYPES.NETWORK_ERROR };
      const serverClassification = { type: ERROR_TYPES.SERVER_ERROR };
      const configClassification = { type: ERROR_TYPES.CONFIG_ERROR };
      
      expect(getUserFriendlyMessage(networkClassification)).toContain('offline');
      expect(getUserFriendlyMessage(serverClassification)).toContain('temporarily unavailable');
      expect(getUserFriendlyMessage(configClassification)).toContain('configuration issue');
    });

    it('should include attempt number for retries', () => {
      const classification = { type: ERROR_TYPES.NETWORK_ERROR };
      
      expect(getUserFriendlyMessage(classification, 1)).not.toContain('Attempt');
      expect(getUserFriendlyMessage(classification, 2)).toContain('Attempt 2');
    });
  });

  describe('Error Logger', () => {
    it('should log errors with structured data', () => {
      const error = new Error('Test error');
      const context = { messageId: 'test-123', tenantHash: 'test-tenant' };
      
      const logEntry = errorLogger.logError(error, context);
      
      expect(logEntry).toMatchObject({
        message: 'Test error',
        errorId: expect.stringMatching(/^ERR_\d+_[a-z0-9]+$/),
        classification: expect.objectContaining({
          type: ERROR_TYPES.UNKNOWN_ERROR
        }),
        context: expect.objectContaining({
          messageId: 'test-123',
          tenantHash: 'test-tenant'
        })
      });
    });

    it('should maintain log size limit', () => {
      // Add more than maxLogs entries
      for (let i = 0; i < 150; i++) {
        errorLogger.logError(new Error(`Error ${i}`));
      }
      
      expect(errorLogger.getLogs().length).toBeLessThanOrEqual(100);
    });

    it('should log warnings', () => {
      errorLogger.logWarning('Test warning', { context: 'test' });
      
      const logs = errorLogger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: 'warning',
        message: 'Test warning'
      });
    });

    it('should log info messages when debug logging is enabled', () => {
      errorLogger.logInfo('Test info', { context: 'test' });
      
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️ Picasso Info:',
        expect.objectContaining({
          level: 'info',
          message: 'Test info'
        })
      );
    });

    it('should generate unique error IDs', () => {
      const id1 = errorLogger.generateErrorId();
      const id2 = errorLogger.generateErrorId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^ERR_\d+_[a-z0-9]+$/);
    });

    it('should export logs with summary', () => {
      // Clear logs first
      errorLogger.clearLogs();
      
      // Log errors with proper classification structure
      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');
      
      errorLogger.logError(error1, { 
        classification: { severity: ERROR_SEVERITY.HIGH, category: ERROR_CATEGORY.NETWORK }
      });
      errorLogger.logError(error2, { 
        classification: { severity: ERROR_SEVERITY.MEDIUM, category: ERROR_CATEGORY.API }
      });
      
      const exportData = errorLogger.exportLogs();
      
      expect(exportData.logs).toHaveLength(2);
      expect(exportData.summary.total).toBe(2);
      expect(exportData.summary.bySeverity.high).toBe(1);
      expect(exportData.summary.bySeverity.medium).toBe(1);
      expect(exportData.summary.byCategory.network).toBe(1);
      expect(exportData.summary.byCategory.api).toBe(1);
    });
  });

  describe('Performance Monitor', () => {
    it('should measure execution time', () => {
      const result = performanceMonitor.measure('test', () => {
        return 'test result';
      });
      
      expect(result).toBe('test result');
    });

    it('should track manual timers', () => {
      performanceMonitor.startTimer('manual');
      
      // Simulate some work
      const start = Date.now();
      while (Date.now() - start < 10) {}
      
      const duration = performanceMonitor.endTimer('manual');
      
      expect(duration).toBeGreaterThan(0);
      expect(typeof duration).toBe('number');
    });

    it('should return null for non-existent timers', () => {
      const duration = performanceMonitor.endTimer('nonexistent');
      expect(duration).toBeNull();
    });
  });

  describe('Global Error Handling', () => {
    it('should set up global error handlers', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      
      setupGlobalErrorHandling();
      
      expect(addEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should handle unhandled promise rejections', () => {
      // Clear logs first
      errorLogger.clearLogs();
      
      setupGlobalErrorHandling();
      
      const event = new Event('unhandledrejection');
      event.reason = 'Promise rejected';
      event.preventDefault = vi.fn();
      
      window.dispatchEvent(event);
      
      expect(event.preventDefault).toHaveBeenCalled();
      const logs = errorLogger.getLogs();
      expect(logs.some(log => log.context && log.context.type === 'unhandledrejection')).toBe(true);
    });

    it('should handle global errors', () => {
      // Clear logs first
      errorLogger.clearLogs();
      
      setupGlobalErrorHandling();
      
      const event = new Event('error');
      event.error = new Error('Global error');
      event.preventDefault = vi.fn();
      
      window.dispatchEvent(event);
      
      expect(event.preventDefault).toHaveBeenCalled();
      const logs = errorLogger.getLogs();
      expect(logs.some(log => log.context && log.context.type === 'global')).toBe(true);
    });
  });
}); 
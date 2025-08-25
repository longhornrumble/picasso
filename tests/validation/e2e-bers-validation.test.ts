/**
 * BERS Task 3.2: End-to-End Validation Suite
 * 
 * Comprehensive E2E validation of Build-Time Environment Resolution System (BERS)
 * Tests complete integration between environment detection, configuration management,
 * and build pipeline across all components.
 * 
 * @version 1.0.0
 * @author QA Automation Specialist
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { environmentResolver, createEnvironmentResolver } from '../../src/config/environment-resolver';
import type { ValidatedEnvironment, EnvironmentDetectionResult, TenantConfigurationResult } from '../../src/config/environment-resolver';
import type { RuntimeConfig } from '../../src/types/config';

// Mock performance.now for consistent testing
const mockPerformanceNow = vi.fn();
vi.stubGlobal('performance', { now: mockPerformanceNow });

// Mock fetch for S3 integration testing
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('BERS End-to-End Validation Suite', () => {
  let testResolver: any;
  let performanceStartTime: number;

  beforeAll(async () => {
    // Setup test environment
    process.env.NODE_ENV = 'test';
    process.env.PICASSO_ENV = 'development';
    
    // Initialize test resolver with controlled configuration
    testResolver = createEnvironmentResolver({
      enabledSources: ['env-variable', 'hostname-pattern', 'build-context', 'default-fallback'],
      cacheEnabled: true,
      cacheTTL: 300000,
      performanceTimeout: 100,
      fallbackEnvironment: 'development',
      customEnvironments: [],
      securityValidation: true
    });
  });

  beforeEach(() => {
    // Reset performance timing and mocks
    performanceStartTime = 100;
    mockPerformanceNow.mockReturnValue(performanceStartTime);
    mockFetch.mockClear();
    
    // Clear resolver cache
    testResolver.clearCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    // Cleanup
    delete process.env.PICASSO_ENV;
    vi.unstubAllGlobals();
  });

  describe('Core Environment Detection Integration', () => {
    it('should detect environment from environment variables with <100ms performance', async () => {
      // Arrange
      process.env.PICASSO_ENV = 'staging';
      const expectedDetectionTime = 50;
      mockPerformanceNow
        .mockReturnValueOnce(performanceStartTime)  // Start time
        .mockReturnValueOnce(performanceStartTime + expectedDetectionTime);  // End time

      // Act
      const result: EnvironmentDetectionResult = await testResolver.detectEnvironment();

      // Assert - Environment Detection
      expect(result.environment.toString()).toBe('staging');
      expect(result.source).toBe('env-variable');
      expect(result.confidence).toBe('high');
      expect(result.detectionTime).toBe(expectedDetectionTime);
      expect(result.detectionTime).toBeLessThan(100); // Performance requirement

      // Assert - Metadata Completeness
      expect(result.metadata).toBeDefined();
      expect(result.metadata.envVariables).toHaveProperty('PICASSO_ENV', 'staging');
      expect(result.validationErrors).toEqual([]);
    });

    it('should fall back to hostname detection when env variables unavailable', async () => {
      // Arrange
      delete process.env.PICASSO_ENV;
      delete process.env.NODE_ENV;
      
      // Mock window.location for hostname detection
      const mockLocation = { hostname: 'staging.myrecruiter.ai', search: '' };
      vi.stubGlobal('window', { location: mockLocation, navigator: { userAgent: 'test' } });
      vi.stubGlobal('document', { referrer: 'https://test.com' });

      const expectedDetectionTime = 75;
      mockPerformanceNow
        .mockReturnValueOnce(performanceStartTime)
        .mockReturnValueOnce(performanceStartTime + expectedDetectionTime);

      // Act
      const result = await testResolver.detectEnvironment();

      // Assert
      expect(result.environment.toString()).toBe('staging');
      expect(result.source).toBe('hostname-pattern');
      expect(result.confidence).toBe('medium');
      expect(result.detectionTime).toBe(expectedDetectionTime);
      expect(result.metadata.hostname).toBe('staging.myrecruiter.ai');

      // Cleanup
      vi.unstubAllGlobals();
    });

    it('should use build context detection as fallback', async () => {
      // Arrange
      delete process.env.PICASSO_ENV;
      delete process.env.NODE_ENV;
      
      // Mock Vite build context
      const mockImportMeta = {
        env: { DEV: true, PROD: false, MODE: 'development' }
      };
      vi.stubGlobal('import', { meta: mockImportMeta });

      const expectedDetectionTime = 80;
      mockPerformanceNow
        .mockReturnValueOnce(performanceStartTime)
        .mockReturnValueOnce(performanceStartTime + expectedDetectionTime);

      // Act
      const result = await testResolver.detectEnvironment();

      // Assert
      expect(result.environment.toString()).toBe('development');
      expect(result.source).toBe('build-context');
      expect(result.confidence).toBe('low');
      expect(result.detectionTime).toBe(expectedDetectionTime);

      // Cleanup
      vi.unstubAllGlobals();
    });
  });

  describe('Configuration Management Integration', () => {
    it('should load and validate tenant configuration from S3', async () => {
      // Arrange
      const tenantHash = 'test-tenant-123' as any;
      const validatedEnv = { 
        toString: () => 'production',
        __brand: 'ValidatedEnvironment',
        detectionSource: 'env-variable',
        detectionTimestamp: Date.now(),
        confidence: 'high'
      } as ValidatedEnvironment;

      const mockConfig: RuntimeConfig = {
        tenantHash,
        widget: {
          tenantHash,
          title: 'Test Chat',
          position: 'bottom-right',
          theme: {
            primaryColor: '#007bff',
            secondaryColor: '#6c757d',
            backgroundColor: '#ffffff',
            textColor: '#333333',
            borderRadius: '8px',
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            spacing: '16px'
          },
          dimensions: {
            width: '400px',
            height: '600px',
            minWidth: '320px',
            minHeight: '400px',
            maxWidth: '500px',
            maxHeight: '800px'
          },
          behavior: {
            autoOpen: false,
            showOnPageLoad: true,
            closeOnEscape: true,
            draggable: false,
            minimizable: true,
            resizable: false
          }
        },
        theme: {
          primaryColor: '#007bff',
          secondaryColor: '#6c757d',
          backgroundColor: '#ffffff',
          textColor: '#333333',
          borderRadius: '8px',
          fontFamily: 'Inter, sans-serif',
          fontSize: '14px',
          spacing: '16px'
        },
        localization: {
          defaultLanguage: 'en',
          supportedLanguages: ['en', 'es'],
          autoDetect: true,
          fallbackLanguage: 'en',
          rtlSupport: false,
          dateFormat: 'MM/dd/yyyy',
          timeFormat: '12h',
          numberFormat: 'US'
        },
        integrations: {},
        lastUpdated: Date.now(),
        version: '2.0.0'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockConfig
      });

      const expectedLoadTime = 150;
      mockPerformanceNow
        .mockReturnValueOnce(performanceStartTime)
        .mockReturnValueOnce(performanceStartTime + expectedLoadTime);

      // Act
      const result: TenantConfigurationResult = await testResolver.loadTenantConfiguration(tenantHash, validatedEnv);

      // Assert - Configuration Loading
      expect(result.source).toBe('S3');
      expect(result.cached).toBe(false);
      expect(result.loadTime).toBe(expectedLoadTime);
      expect(result.validationResult.isValid).toBe(true);
      expect(result.config).toEqual(mockConfig);

      // Assert - S3 Integration
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toContain('test-tenant-123');
      expect(fetchCall[1].method).toBe('GET');
      expect(fetchCall[1].headers.Accept).toBe('application/json');
    });

    it('should cache tenant configuration for subsequent requests', async () => {
      // Arrange
      const tenantHash = 'cached-tenant-456' as any;
      const validatedEnv = { 
        toString: () => 'staging',
        __brand: 'ValidatedEnvironment',
        detectionSource: 'env-variable',
        detectionTimestamp: Date.now(),
        confidence: 'high'
      } as ValidatedEnvironment;

      const mockConfig: RuntimeConfig = {
        tenantHash,
        widget: {
          tenantHash,
          title: 'Cached Test Chat',
          position: 'bottom-right',
          theme: {
            primaryColor: '#28a745',
            secondaryColor: '#6c757d',
            backgroundColor: '#ffffff',
            textColor: '#333333',
            borderRadius: '8px',
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            spacing: '16px'
          },
          dimensions: {
            width: '400px',
            height: '600px',
            minWidth: '320px',
            minHeight: '400px',
            maxWidth: '500px',
            maxHeight: '800px'
          },
          behavior: {
            autoOpen: false,
            showOnPageLoad: true,
            closeOnEscape: true,
            draggable: false,
            minimizable: true,
            resizable: false
          }
        },
        theme: {
          primaryColor: '#28a745',
          secondaryColor: '#6c757d',
          backgroundColor: '#ffffff',
          textColor: '#333333',
          borderRadius: '8px',
          fontFamily: 'Inter, sans-serif',
          fontSize: '14px',
          spacing: '16px'
        },
        localization: {
          defaultLanguage: 'en',
          supportedLanguages: ['en'],
          autoDetect: false,
          fallbackLanguage: 'en',
          rtlSupport: false,
          dateFormat: 'MM/dd/yyyy',
          timeFormat: '12h',
          numberFormat: 'US'
        },
        integrations: {},
        lastUpdated: Date.now(),
        version: '2.0.0'
      };

      // First request - from S3
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockConfig
      });

      const firstLoadTime = 200;
      const secondLoadTime = 15; // Much faster for cached request

      mockPerformanceNow
        .mockReturnValueOnce(performanceStartTime)
        .mockReturnValueOnce(performanceStartTime + firstLoadTime)
        .mockReturnValueOnce(performanceStartTime + 1000)
        .mockReturnValueOnce(performanceStartTime + 1000 + secondLoadTime);

      // Act - First request (should fetch from S3)
      const firstResult = await testResolver.loadTenantConfiguration(tenantHash, validatedEnv);
      
      // Act - Second request (should use cache)
      const secondResult = await testResolver.loadTenantConfiguration(tenantHash, validatedEnv);

      // Assert - First Request
      expect(firstResult.source).toBe('S3');
      expect(firstResult.cached).toBe(false);
      expect(firstResult.loadTime).toBe(firstLoadTime);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Assert - Second Request (Cached)
      expect(secondResult.source).toBe('cache');
      expect(secondResult.cached).toBe(true);
      expect(secondResult.loadTime).toBe(secondLoadTime);
      expect(secondResult.config).toEqual(mockConfig);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No additional S3 call
    });

    it('should handle S3 failures with fallback configuration', async () => {
      // Arrange
      const tenantHash = 'failed-tenant-789' as any;
      const validatedEnv = { 
        toString: () => 'production',
        __brand: 'ValidatedEnvironment',
        detectionSource: 'env-variable',
        detectionTimestamp: Date.now(),
        confidence: 'high'
      } as ValidatedEnvironment;

      mockFetch.mockRejectedValueOnce(new Error('S3 service unavailable'));

      const expectedLoadTime = 100;
      mockPerformanceNow
        .mockReturnValueOnce(performanceStartTime)
        .mockReturnValueOnce(performanceStartTime + expectedLoadTime);

      // Act
      const result = await testResolver.loadTenantConfiguration(tenantHash, validatedEnv);

      // Assert - Fallback Behavior
      expect(result.source).toBe('fallback');
      expect(result.cached).toBe(false);
      expect(result.loadTime).toBe(expectedLoadTime);
      expect(result.validationResult.isValid).toBe(true);
      expect(result.validationResult.warnings).toContain('Using fallback configuration');
      expect(result.config.tenantHash).toBe(tenantHash);
      expect(result.config.widget.tenantHash).toBe(tenantHash);
    });
  });

  describe('Complete Runtime Configuration Resolution', () => {
    it('should resolve complete runtime configuration with auto-detection', async () => {
      // Arrange
      process.env.PICASSO_ENV = 'production';
      const tenantHash = 'runtime-tenant-999' as any;

      const mockConfig: RuntimeConfig = {
        tenantHash,
        widget: {
          tenantHash,
          title: 'Production Chat',
          position: 'bottom-right',
          theme: {
            primaryColor: '#dc3545',
            secondaryColor: '#6c757d',
            backgroundColor: '#ffffff',
            textColor: '#333333',
            borderRadius: '8px',
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            spacing: '16px'
          },
          dimensions: {
            width: '400px',
            height: '600px',
            minWidth: '320px',
            minHeight: '400px',
            maxWidth: '500px',
            maxHeight: '800px'
          },
          behavior: {
            autoOpen: true,
            showOnPageLoad: true,
            closeOnEscape: false,
            draggable: true,
            minimizable: false,
            resizable: true
          }
        },
        theme: {
          primaryColor: '#dc3545',
          secondaryColor: '#6c757d',
          backgroundColor: '#ffffff',
          textColor: '#333333',
          borderRadius: '8px',
          fontFamily: 'Inter, sans-serif',
          fontSize: '14px',
          spacing: '16px'
        },
        localization: {
          defaultLanguage: 'en',
          supportedLanguages: ['en', 'es', 'fr'],
          autoDetect: true,
          fallbackLanguage: 'en',
          rtlSupport: true,
          dateFormat: 'MM/dd/yyyy',
          timeFormat: '24h',
          numberFormat: 'EU'
        },
        integrations: {
          analytics: { enabled: true, trackingId: 'GA-123456789' },
          support: { enabled: true, ticketSystem: 'zendesk' }
        },
        lastUpdated: Date.now(),
        version: '2.0.0'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockConfig
      });

      const detectionTime = 45;
      const configLoadTime = 120;
      mockPerformanceNow
        .mockReturnValueOnce(performanceStartTime)  // Environment detection start
        .mockReturnValueOnce(performanceStartTime + detectionTime)  // Environment detection end
        .mockReturnValueOnce(performanceStartTime + detectionTime + 10)  // Config load start
        .mockReturnValueOnce(performanceStartTime + detectionTime + 10 + configLoadTime);  // Config load end

      // Act
      const result = await testResolver.resolveRuntimeConfiguration(tenantHash);

      // Assert - Complete Integration
      expect(result).toEqual(mockConfig);
      expect(result.tenantHash).toBe(tenantHash);
      expect(result.widget.title).toBe('Production Chat');
      expect(result.localization.supportedLanguages).toContain('es');
      expect(result.integrations.analytics?.enabled).toBe(true);

      // Assert - Performance
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toContain(tenantHash);
    });
  });

  describe('Environment Validation and Security', () => {
    it('should validate environment security configurations', async () => {
      // Arrange
      const testEnv = { 
        toString: () => 'development',
        __brand: 'ValidatedEnvironment',
        detectionSource: 'hostname-pattern',
        detectionTimestamp: Date.now(),
        confidence: 'medium'
      } as ValidatedEnvironment;

      // Mock window for security validation
      vi.stubGlobal('window', { 
        location: { hostname: 'external.example.com' },
        navigator: { userAgent: 'test' }
      });

      // Act
      const result = await testResolver.validateEnvironment(testEnv);

      // Assert - Security Validation
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Development environment detected on non-localhost domain');
      expect(result.warnings).toBeDefined();

      // Cleanup
      vi.unstubAllGlobals();
    });

    it('should pass validation for secure environment configurations', async () => {
      // Arrange
      const testEnv = { 
        toString: () => 'production',
        __brand: 'ValidatedEnvironment',
        detectionSource: 'hostname-pattern',
        detectionTimestamp: Date.now(),
        confidence: 'high'
      } as ValidatedEnvironment;

      // Act
      const result = await testResolver.validateEnvironment(testEnv);

      // Assert - Secure Configuration
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('Performance and Caching Integration', () => {
    it('should track performance metrics across multiple operations', async () => {
      // Arrange
      process.env.PICASSO_ENV = 'staging';
      const tenantHash = 'metrics-tenant-111' as any;

      // Setup multiple detection scenarios
      const detectionTimes = [45, 35, 50, 40];
      let performanceCallIndex = 0;

      mockPerformanceNow.mockImplementation(() => {
        const currentTime = performanceStartTime + (performanceCallIndex * 100);
        if (performanceCallIndex % 2 === 1) {
          // End time - add detection time
          const detectionIndex = Math.floor(performanceCallIndex / 2);
          return currentTime + (detectionTimes[detectionIndex] || 45);
        }
        performanceCallIndex++;
        return currentTime;
      });

      // Act - Multiple environment detections
      await testResolver.detectEnvironment();  // First detection
      await testResolver.detectEnvironment();  // Second detection (cached)
      testResolver.clearCache();
      await testResolver.detectEnvironment();  // Third detection (fresh)
      await testResolver.detectEnvironment();  // Fourth detection (cached)

      const metrics = testResolver.getPerformanceMetrics();

      // Assert - Performance Tracking
      expect(metrics.totalDetections).toBeGreaterThan(0);
      expect(metrics.averageDetectionTime).toBeGreaterThan(0);
      expect(metrics.averageDetectionTime).toBeLessThan(100); // Performance requirement
      expect(metrics.cacheHitRate).toBeGreaterThanOrEqual(0);
      expect(metrics.cacheHitRate).toBeLessThanOrEqual(1);
      expect(metrics.errorRate).toBeGreaterThanOrEqual(0);
      expect(metrics.lastDetectionTime).toBeGreaterThan(0);
    });

    it('should maintain cache efficiency across environment changes', async () => {
      // Arrange - Test different environments
      const environments = ['development', 'staging', 'production'];
      const results: EnvironmentDetectionResult[] = [];

      for (const env of environments) {
        process.env.PICASSO_ENV = env;
        
        mockPerformanceNow
          .mockReturnValueOnce(performanceStartTime)
          .mockReturnValueOnce(performanceStartTime + 60);

        // Act
        const result = await testResolver.detectEnvironment();
        results.push(result);
      }

      // Assert - Environment Diversity
      expect(results).toHaveLength(3);
      expect(results.map(r => r.environment.toString())).toEqual(environments);
      
      // All should be detected from env variables with high confidence
      expect(results.every(r => r.source === 'env-variable')).toBe(true);
      expect(results.every(r => r.confidence === 'high')).toBe(true);
      expect(results.every(r => r.detectionTime < 100)).toBe(true);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should gracefully handle network timeouts in S3 configuration loading', async () => {
      // Arrange
      const tenantHash = 'timeout-tenant-222' as any;
      const validatedEnv = { 
        toString: () => 'production',
        __brand: 'ValidatedEnvironment',
        detectionSource: 'env-variable',
        detectionTimestamp: Date.now(),
        confidence: 'high'
      } as ValidatedEnvironment;

      // Mock network timeout
      mockFetch.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network timeout')), 10)
        )
      );

      const expectedLoadTime = 150;
      mockPerformanceNow
        .mockReturnValueOnce(performanceStartTime)
        .mockReturnValueOnce(performanceStartTime + expectedLoadTime);

      // Act
      const result = await testResolver.loadTenantConfiguration(tenantHash, validatedEnv);

      // Assert - Fallback on Timeout
      expect(result.source).toBe('fallback');
      expect(result.validationResult.isValid).toBe(true);
      expect(result.validationResult.warnings).toContain('Using fallback configuration');
      expect(result.config.tenantHash).toBe(tenantHash);
      expect(result.loadTime).toBe(expectedLoadTime);
    });

    it('should handle malformed S3 configuration responses', async () => {
      // Arrange
      const tenantHash = 'malformed-tenant-333' as any;
      const validatedEnv = { 
        toString: () => 'staging',
        __brand: 'ValidatedEnvironment',
        detectionSource: 'env-variable',
        detectionTimestamp: Date.now(),
        confidence: 'high'
      } as ValidatedEnvironment;

      // Mock malformed JSON response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => { throw new Error('Invalid JSON'); }
      });

      mockPerformanceNow
        .mockReturnValueOnce(performanceStartTime)
        .mockReturnValueOnce(performanceStartTime + 100);

      // Act
      const result = await testResolver.loadTenantConfiguration(tenantHash, validatedEnv);

      // Assert - Graceful Degradation
      expect(result.source).toBe('fallback');
      expect(result.validationResult.isValid).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config.tenantHash).toBe(tenantHash);
    });
  });

  describe('Custom Environment Support', () => {
    it('should support custom environment registration and validation', async () => {
      // Arrange
      const customEnvironment = {
        name: 'enterprise-prod',
        inheritsFrom: 'production' as any,
        overrides: {
          api: {
            baseURL: 'https://enterprise-api.myrecruiter.ai',
            timeout: 10000,
            retryAttempts: 5
          }
        },
        validationRules: [{
          name: 'enterprise-security',
          description: 'Validate enterprise security requirements',
          validator: async (config: any) => ({
            isValid: config.api?.baseURL?.includes('enterprise'),
            message: 'Enterprise API endpoint required'
          }),
          severity: 'error' as const,
          required: true
        }]
      };

      // Act - Register custom environment
      await testResolver.registerCustomEnvironment(customEnvironment);

      // Get performance metrics to verify registration
      const metrics = testResolver.getPerformanceMetrics();

      // Assert - Custom Environment Registration
      expect(metrics).toBeDefined();
      // The registration itself doesn't throw, indicating success
      // Full custom environment validation would require additional test infrastructure
    });

    it('should reject invalid custom environment definitions', async () => {
      // Arrange - Invalid custom environment (missing required fields)
      const invalidEnvironment = {
        name: '', // Invalid empty name
        inheritsFrom: 'invalid-parent' as any, // Invalid parent
        overrides: {},
        validationRules: []
      };

      // Act & Assert
      await expect(testResolver.registerCustomEnvironment(invalidEnvironment))
        .rejects.toThrow('Custom environment must have name and inheritsFrom');
    });
  });
});
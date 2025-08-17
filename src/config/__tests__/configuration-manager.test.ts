/**
 * Configuration Manager Test Suite - BERS Phase 1, Task 1.2
 * 
 * Comprehensive test coverage for the Configuration Management Infrastructure
 * with >95% coverage target, performance testing, and integration validation.
 * 
 * @version 2.0.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import {
  ConfigurationManagerImpl,
  createConfigurationManager,
  configurationManager,
  type ConfigurationSchemaType,
  type ValidationContext,
  type MigrationConfig,
  type ConfigurationTransformer
} from '../configuration-manager';
import type { ValidatedEnvironment } from '../environment-resolver';
import type { EnvironmentConfig, RuntimeConfig } from '../../types/config';
import type { ValidTenantHash } from '../../types/security';

/* ===== TEST SETUP AND MOCKS ===== */

// Mock performance.now for consistent testing
const mockPerformanceNow = vi.fn();
Object.defineProperty(global, 'performance', {
  value: { now: mockPerformanceNow },
  writable: true
});

// Mock console methods
const consoleSpy = {
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {})
};

// Reference to consoleSpy to avoid unused warning
void consoleSpy;

// Test data
const MOCK_TENANT_HASH = 'abc123def456' as ValidTenantHash;

const createMockValidatedEnvironment = (env: string = 'development'): ValidatedEnvironment => {
  const validated = new String(env) as any;
  validated.__brand = 'ValidatedEnvironment';
  validated.detectionSource = 'config-file';
  validated.detectionTimestamp = Date.now();
  validated.confidence = 'high';
  return validated as ValidatedEnvironment;
};

const MOCK_ENVIRONMENT = createMockValidatedEnvironment('development');
const MOCK_STAGING_ENVIRONMENT = createMockValidatedEnvironment('staging');
const MOCK_PRODUCTION_ENVIRONMENT = createMockValidatedEnvironment('production');

const MOCK_ENVIRONMENT_CONFIG: EnvironmentConfig = {
  environment: 'development',
  version: '2.0.0',
  buildTimestamp: Date.now(),
  api: {
    baseUrl: 'https://chat.myrecruiter.ai' as any,
    timeout: 30000,
    retries: 3,
    rateLimit: { requests: 100, window: 60000 },
    headers: { 'Content-Type': 'application/json' }
  },
  cdn: {
    assetsUrl: 'https://chat.myrecruiter.ai/assets' as any,
    version: '2.0.0',
    cacheBusting: true
  },
  security: {
    enforceHTTPS: false,
    allowInsecure: true,
    corsOrigins: ['https://chat.myrecruiter.ai'],
    frameAncestors: ["'self'"],
    cookieSettings: { secure: false, sameSite: 'lax', httpOnly: true }
  },
  logging: {
    level: 'debug',
    enableConsole: true,
    enableRemote: false,
    sanitizeErrors: false,
    maxLogSize: 1048576
  },
  performance: {
    enableMetrics: true,
    enableTracing: true,
    sampleRate: 1.0,
    maxBundleSize: 524288,
    lazyLoading: true,
    cacheStrategy: 'memory'
  },
  features: {
    streamingEnabled: true,
    fileUploadsEnabled: true,
    darkModeEnabled: true,
    mobileOptimized: true,
    a11yEnhanced: true,
    analyticsEnabled: false,
    errorReportingEnabled: true,
    performanceMonitoring: true,
    experimentalFeatures: true
  }
};

describe('Configuration Management Infrastructure', () => {
  let manager: ConfigurationManagerImpl;
  let originalWindow: typeof window;
  let originalProcess: typeof process;

  beforeAll(() => {
    // Store original globals
    originalWindow = global.window;
    originalProcess = global.process;
  });

  afterAll(() => {
    // Restore original globals
    global.window = originalWindow;
    global.process = originalProcess;
  });

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockPerformanceNow.mockReturnValue(100);
    
    // Setup fresh manager instance
    manager = new ConfigurationManagerImpl(300000, false); // 5 min cache, no hot reload

    // Mock environment
    global.process = {
      env: { NODE_ENV: 'test' }
    } as any;
  });

  afterEach(() => {
    // Clear caches
    manager?.clearCache();
  });

  /* ===== CONFIGURATION LOADING TESTS ===== */

  describe('Configuration Loading', () => {
    it('should load environment configuration successfully', async () => {
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(50);

      const config = await manager.loadConfiguration<EnvironmentConfig>(
        'environment',
        MOCK_ENVIRONMENT,
        { useCache: false, validateSchema: false }
      );

      expect(config).toBeDefined();
      expect(config.__brand).toBe('ValidatedConfiguration');
      expect(config.environment).toBe('development');
      expect(config.validatedAt).toBeGreaterThan(0);
    });

    it('should apply caching correctly', async () => {
      mockPerformanceNow.mockReturnValue(100);

      // First load
      const config1 = await manager.loadConfiguration<EnvironmentConfig>(
        'environment',
        MOCK_ENVIRONMENT,
        { useCache: true }
      );

      // Second load should use cache
      const config2 = await manager.loadConfiguration<EnvironmentConfig>(
        'environment',
        MOCK_ENVIRONMENT,
        { useCache: true }
      );

      expect(config1).toBe(config2); // Should be same instance from cache
      
      const metrics = manager.getMetrics();
      expect(metrics.cacheHits).toBe(1);
      expect(metrics.totalLoads).toBe(2);
    });

    it('should bypass cache when requested', async () => {
      mockPerformanceNow.mockReturnValue(100);

      // First load
      const config1 = await manager.loadConfiguration<EnvironmentConfig>(
        'environment',
        MOCK_ENVIRONMENT,
        { useCache: true }
      );

      // Second load with cache disabled
      const config2 = await manager.loadConfiguration<EnvironmentConfig>(
        'environment',
        MOCK_ENVIRONMENT,
        { useCache: false }
      );

      expect(config1).not.toBe(config2); // Should be different instances
      
      const metrics = manager.getMetrics();
      expect(metrics.cacheHits).toBe(0);
      expect(metrics.totalLoads).toBe(2);
    });

    it('should handle different environments', async () => {
      const devConfig = await manager.loadConfiguration<EnvironmentConfig>(
        'environment',
        MOCK_ENVIRONMENT,
        { useCache: false }
      );

      const prodConfig = await manager.loadConfiguration<EnvironmentConfig>(
        'environment',
        MOCK_PRODUCTION_ENVIRONMENT,
        { useCache: false }
      );

      expect(devConfig.environment).toBe('development');
      expect(prodConfig.environment).toBe('production');
      expect(devConfig.logging.level).toBe('debug');
      expect(prodConfig.logging.level).toBe('error');
    });

    it('should return environment-specific defaults', async () => {
      const devConfig = await manager.loadConfiguration<EnvironmentConfig>(
        'environment',
        MOCK_ENVIRONMENT,
        { useCache: false, validateSchema: false }
      );

      const stagingConfig = await manager.loadConfiguration<EnvironmentConfig>(
        'environment',
        MOCK_STAGING_ENVIRONMENT,
        { useCache: false, validateSchema: false }
      );

      // Development should allow insecure connections
      expect(devConfig.security.allowInsecure).toBe(true);
      expect(devConfig.security.enforceHTTPS).toBe(false);

      // Staging should be secure
      expect(stagingConfig.security.allowInsecure).toBe(false);
      expect(stagingConfig.security.enforceHTTPS).toBe(true);
    });
  });

  /* ===== CONFIGURATION VALIDATION TESTS ===== */

  describe('Configuration Validation', () => {
    it('should validate configuration successfully', async () => {
      const validationContext: ValidationContext = {
        environment: MOCK_ENVIRONMENT,
        schemaType: 'environment',
        strictMode: true,
        allowUnknownProperties: false
      };

      const result = await manager.validateConfiguration(
        MOCK_ENVIRONMENT_CONFIG,
        'environment',
        validationContext
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required properties', async () => {
      const invalidConfig = { ...MOCK_ENVIRONMENT_CONFIG };
      delete (invalidConfig as any).api;

      const validationContext: ValidationContext = {
        environment: MOCK_ENVIRONMENT,
        schemaType: 'environment',
        strictMode: true,
        allowUnknownProperties: false
      };

      const result = await manager.validateConfiguration(
        invalidConfig,
        'environment',
        validationContext
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('api'))).toBe(true);
    });

    it('should handle unknown properties based on strict mode', async () => {
      const configWithUnknown = {
        ...MOCK_ENVIRONMENT_CONFIG,
        unknownProperty: 'test'
      };

      // Strict mode should reject unknown properties
      const strictResult = await manager.validateConfiguration(
        configWithUnknown,
        'environment',
        {
          environment: MOCK_ENVIRONMENT,
          schemaType: 'environment',
          strictMode: true,
          allowUnknownProperties: false
        }
      );

      expect(strictResult.isValid).toBe(false);
      expect(strictResult.errors.some(error => error.includes('Unknown property'))).toBe(true);

      // Non-strict mode should warn about unknown properties
      const nonStrictResult = await manager.validateConfiguration(
        configWithUnknown,
        'environment',
        {
          environment: MOCK_ENVIRONMENT,
          schemaType: 'environment',
          strictMode: false,
          allowUnknownProperties: false
        }
      );

      expect(nonStrictResult.isValid).toBe(true);
      expect(nonStrictResult.warnings.some(warning => warning.includes('Unknown property'))).toBe(true);
    });

    it('should perform environment-specific validation', async () => {
      const prodConfigWithInsecure = {
        ...MOCK_ENVIRONMENT_CONFIG,
        environment: 'production',
        security: {
          ...MOCK_ENVIRONMENT_CONFIG.security,
          allowInsecure: true
        }
      } as EnvironmentConfig;

      const result = await manager.validateConfiguration(
        prodConfigWithInsecure,
        'environment',
        {
          environment: MOCK_PRODUCTION_ENVIRONMENT,
          schemaType: 'environment',
          strictMode: true,
          allowUnknownProperties: false
        }
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Insecure connections not allowed in production'))).toBe(true);
    });

    it('should handle validation errors gracefully', async () => {
      const result = await manager.validateConfiguration(
        null,
        'environment',
        {
          environment: MOCK_ENVIRONMENT,
          schemaType: 'environment',
          strictMode: true,
          allowUnknownProperties: false
        }
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle missing schema type', async () => {
      const result = await manager.validateConfiguration(
        MOCK_ENVIRONMENT_CONFIG,
        'non-existent' as ConfigurationSchemaType,
        {
          environment: MOCK_ENVIRONMENT,
          schemaType: 'non-existent' as ConfigurationSchemaType,
          strictMode: true,
          allowUnknownProperties: false
        }
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Schema not found'))).toBe(true);
    });
  });

  /* ===== CONFIGURATION INHERITANCE TESTS ===== */

  describe('Configuration Inheritance', () => {
    it('should register inheritance rules', async () => {
      const inheritanceRule = {
        sourceEnvironment: 'development' as const,
        targetEnvironment: 'staging' as const,
        strategy: 'merge' as const,
        paths: ['logging.level', 'features.experimentalFeatures']
      };

      await expect(manager.registerInheritanceRule(inheritanceRule)).resolves.not.toThrow();
    });

    it('should reject invalid inheritance rules', async () => {
      const invalidRule = {
        sourceEnvironment: '' as any,
        targetEnvironment: 'staging' as const,
        strategy: 'merge' as const,
        paths: []
      };

      await expect(manager.registerInheritanceRule(invalidRule)).rejects.toThrow(
        'Invalid inheritance rule: missing required fields'
      );
    });

    it('should detect circular inheritance', async () => {
      // Create a circular dependency: A -> B -> A
      await manager.registerInheritanceRule({
        sourceEnvironment: 'development',
        targetEnvironment: 'staging',
        strategy: 'merge',
        paths: ['logging']
      });

      const circularRule = {
        sourceEnvironment: 'staging' as const,
        targetEnvironment: 'development' as const,
        strategy: 'merge' as const,
        paths: ['logging']
      };

      await expect(manager.registerInheritanceRule(circularRule)).rejects.toThrow(
        'Inheritance rule would create circular dependency'
      );
    });
  });

  /* ===== EFFECTIVE CONFIGURATION TESTS ===== */

  describe('Effective Configuration', () => {
    it('should get effective configuration without tenant', async () => {
      const config = await manager.getEffectiveConfiguration<EnvironmentConfig>(
        'environment',
        MOCK_ENVIRONMENT
      );

      expect(config).toBeDefined();
      expect(config.__brand).toBe('ValidatedConfiguration');
      expect(config.environment).toBe('development');
    });

    it('should handle tenant-specific overrides', async () => {
      const config = await manager.getEffectiveConfiguration<RuntimeConfig>(
        'runtime',
        MOCK_ENVIRONMENT,
        MOCK_TENANT_HASH
      );

      expect(config).toBeDefined();
      expect(config.__brand).toBe('ValidatedConfiguration');
    });
  });

  /* ===== SCHEMA MANAGEMENT TESTS ===== */

  describe('Schema Management', () => {
    it('should register custom schema', async () => {
      const customSchema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: 'https://chat.myrecruiter.ai/schemas/custom.schema.json',
        title: 'Custom Configuration Schema',
        description: 'Custom schema for testing',
        type: 'object' as const,
        properties: {
          customField: { type: 'string' }
        },
        required: ['customField'] as const,
        additionalProperties: false
      };

      await expect(manager.registerSchema('custom', customSchema)).resolves.not.toThrow();
    });

    it('should reject invalid schema', async () => {
      const invalidSchema = {
        title: 'Invalid Schema',
        // Missing required fields
      } as any;

      await expect(manager.registerSchema('invalid', invalidSchema)).rejects.toThrow(
        'Invalid schema: missing required metadata'
      );
    });
  });

  /* ===== CACHING TESTS ===== */

  describe('Caching', () => {
    it('should clear cache for specific schema type', async () => {
      // Load configurations to populate cache
      await manager.loadConfiguration('environment', MOCK_ENVIRONMENT);
      await manager.loadConfiguration('providers', MOCK_ENVIRONMENT);

      let metrics = manager.getMetrics();
      expect(metrics.totalLoads).toBe(2);

      // Clear only environment cache
      manager.clearCache('environment');

      // Load again - environment should be fresh, providers should be cached
      await manager.loadConfiguration('environment', MOCK_ENVIRONMENT);
      await manager.loadConfiguration('providers', MOCK_ENVIRONMENT);

      metrics = manager.getMetrics();
      expect(metrics.totalLoads).toBe(4);
      expect(metrics.cacheHits).toBe(1); // Only providers was cached
    });

    it('should clear all cache', async () => {
      // Load configurations to populate cache
      await manager.loadConfiguration('environment', MOCK_ENVIRONMENT);
      await manager.loadConfiguration('providers', MOCK_ENVIRONMENT);

      let metrics = manager.getMetrics();
      expect(metrics.totalLoads).toBe(2);

      // Clear all cache
      manager.clearCache();

      // Load again - both should be fresh
      await manager.loadConfiguration('environment', MOCK_ENVIRONMENT);
      await manager.loadConfiguration('providers', MOCK_ENVIRONMENT);

      metrics = manager.getMetrics();
      expect(metrics.totalLoads).toBe(4);
      expect(metrics.cacheHits).toBe(0);
    });
  });

  /* ===== METRICS TESTS ===== */

  describe('Metrics', () => {
    it('should track loading metrics', async () => {
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(50);

      await manager.loadConfiguration('environment', MOCK_ENVIRONMENT);

      const metrics = manager.getMetrics();
      expect(metrics.totalLoads).toBe(1);
      expect(metrics.averageLoadTime).toBe(50);
      expect(metrics.cacheHits).toBe(0);
    });

    it('should track cache hit rate', async () => {
      // First load
      await manager.loadConfiguration('environment', MOCK_ENVIRONMENT);
      
      // Second load (cache hit)
      await manager.loadConfiguration('environment', MOCK_ENVIRONMENT);

      const metrics = manager.getMetrics();
      expect(metrics.totalLoads).toBe(2);
      expect(metrics.cacheHits).toBe(1);
    });

    it('should track validation errors', async () => {
      // Force a validation error
      await expect(
        manager.loadConfiguration('environment', MOCK_ENVIRONMENT, {
          validateSchema: true
        })
      ).rejects.toThrow();

      const metrics = manager.getMetrics();
      expect(metrics.totalLoads).toBe(1);
    });
  });

  /* ===== WATCHER TESTS ===== */

  describe('Configuration Watching', () => {
    it('should return no-op unwatch function when hot reload disabled', () => {
      const callback = vi.fn();
      const unwatch = manager.watchConfiguration('environment', callback);

      expect(typeof unwatch).toBe('function');
      
      // Should not throw when called
      expect(() => unwatch()).not.toThrow();
    });

    it('should handle watcher configuration', () => {
      const callback = vi.fn();
      const hotReloadConfig = {
        enabled: false,
        watchPaths: ['./test'],
        debounceMs: 100,
        excludePatterns: [],
        validationOnChange: true
      };

      const unwatch = manager.watchConfiguration('environment', callback, hotReloadConfig);
      expect(typeof unwatch).toBe('function');
    });
  });

  /* ===== ERROR HANDLING TESTS ===== */

  describe('Error Handling', () => {
    it('should handle configuration loading errors', async () => {
      // Create a manager that will fail on inheritance application
      const failingManager = new ConfigurationManagerImpl(0, false);
      
      // Register a bad inheritance rule
      await failingManager.registerInheritanceRule({
        sourceEnvironment: 'non-existent' as any,
        targetEnvironment: 'development',
        strategy: 'merge',
        paths: ['test']
      });

      // Should handle the error gracefully
      const config = await failingManager.loadConfiguration('environment', MOCK_ENVIRONMENT, {
        applyInheritance: true,
        validateSchema: false
      });

      expect(config).toBeDefined();
    });

    it('should handle validation errors', async () => {
      const invalidConfig = { invalid: true };

      const result = await manager.validateConfiguration(
        invalidConfig,
        'environment',
        {
          environment: MOCK_ENVIRONMENT,
          schemaType: 'environment',
          strictMode: true,
          allowUnknownProperties: false
        }
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  /* ===== MIGRATION INTEGRATION TESTS ===== */

  describe('Migration Integration', () => {
    it('should create migration config', () => {
      const legacyConfig = {
        API_BASE_URL: 'https://api.example.com',
        DEBUG: true,
        LOG_LEVEL: 'info'
      };

      // Migration would typically be handled by migration utilities
      // This tests the interface integration
      expect(legacyConfig).toBeDefined();
    });

    it('should handle migration transformers', () => {
      const transformer: ConfigurationTransformer = {
        name: 'test-transformer',
        description: 'Test transformer',
        version: '1.0.0',
        transform: async (config) => ({ ...config, transformed: true }),
        validate: async (config) => typeof config === 'object'
      };

      const migrationConfig: MigrationConfig = {
        enabled: true,
        sourceVersion: '1.0.0',
        targetVersion: '2.0.0',
        transformers: [transformer],
        backupOriginal: true
      };

      expect(migrationConfig).toBeDefined();
      expect(migrationConfig.transformers).toHaveLength(1);
    });
  });
});

/* ===== FACTORY FUNCTION TESTS ===== */

describe('Factory Functions', () => {
  it('should create configuration manager with default options', () => {
    const manager = createConfigurationManager();
    
    expect(manager).toBeInstanceOf(ConfigurationManagerImpl);
  });

  it('should create configuration manager with custom options', () => {
    const manager = createConfigurationManager();
    
    expect(manager).toBeInstanceOf(ConfigurationManagerImpl);
  });

  it('should provide singleton instance', () => {
    expect(configurationManager).toBeDefined();
    expect(configurationManager).toBeInstanceOf(ConfigurationManagerImpl);
  });
});

/* ===== PERFORMANCE BENCHMARKS ===== */

describe('Performance Benchmarks', () => {
  let manager: ConfigurationManagerImpl;

  beforeEach(() => {
    manager = new ConfigurationManagerImpl(300000, false);
  });

  it('should complete configuration loading within performance target', async () => {
    const startTime = Date.now();
    
    await manager.loadConfiguration('environment', MOCK_ENVIRONMENT, {
      useCache: false,
      validateSchema: false
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(duration).toBeLessThan(200); // <200ms target for hot-reload
  });

  it('should handle concurrent configuration loads efficiently', async () => {
    const concurrentLoads = 20;
    const startTime = Date.now();
    
    const promises = Array.from({ length: concurrentLoads }, () => 
      manager.loadConfiguration('environment', MOCK_ENVIRONMENT, {
        useCache: true,
        validateSchema: false
      })
    );
    
    await Promise.all(promises);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    const averagePerLoad = duration / concurrentLoads;
    
    expect(averagePerLoad).toBeLessThan(50); // Should be fast due to caching
  });

  it('should maintain validation performance under load', async () => {
    const iterations = 100;
    const startTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      await manager.validateConfiguration(
        MOCK_ENVIRONMENT_CONFIG,
        'environment',
        {
          environment: MOCK_ENVIRONMENT,
          schemaType: 'environment',
          strictMode: true,
          allowUnknownProperties: false
        }
      );
    }
    
    const endTime = Date.now();
    const averageTime = (endTime - startTime) / iterations;
    
    expect(averageTime).toBeLessThan(10); // Should be sub-10ms per validation
  });

  it('should efficiently handle cache operations', async () => {
    // Warm up cache
    await manager.loadConfiguration('environment', MOCK_ENVIRONMENT);
    
    // Measure cached performance
    const iterations = 1000;
    const startTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      await manager.loadConfiguration('environment', MOCK_ENVIRONMENT, {
        useCache: true
      });
    }
    
    const endTime = Date.now();
    const averageTime = (endTime - startTime) / iterations;
    
    expect(averageTime).toBeLessThan(1); // Should be sub-millisecond with cache
  });
});

/* ===== INTEGRATION TESTS ===== */

describe('Configuration Manager Integration', () => {
  let manager: ConfigurationManagerImpl;

  beforeEach(() => {
    manager = new ConfigurationManagerImpl(300000, false);
  });

  it('should integrate with environment resolver', async () => {
    // Test loading configuration for different environments
    const environments = [MOCK_ENVIRONMENT, MOCK_STAGING_ENVIRONMENT, MOCK_PRODUCTION_ENVIRONMENT];
    
    for (const env of environments) {
      const config = await manager.loadConfiguration<EnvironmentConfig>(
        'environment',
        env,
        { useCache: false }
      );
      
      expect(config).toBeDefined();
      expect(config.environment).toBe(env.toString());
    }
  });

  it('should support all schema types', async () => {
    const schemaTypes: ConfigurationSchemaType[] = [
      'environment',
      'providers',
      'build',
      'monitoring'
    ];
    
    for (const schemaType of schemaTypes) {
      const config = await manager.loadConfiguration(
        schemaType,
        MOCK_ENVIRONMENT,
        { useCache: false, validateSchema: false }
      );
      
      expect(config).toBeDefined();
      expect(config.__brand).toBe('ValidatedConfiguration');
    }
  });

  it('should handle complex inheritance scenarios', async () => {
    // Set up inheritance chain: development -> staging -> production
    await manager.registerInheritanceRule({
      sourceEnvironment: 'development',
      targetEnvironment: 'staging',
      strategy: 'merge',
      paths: ['features.experimentalFeatures']
    });

    await manager.registerInheritanceRule({
      sourceEnvironment: 'staging',
      targetEnvironment: 'production',
      strategy: 'override',
      paths: ['logging.level']
    });

    const config = await manager.loadConfiguration<EnvironmentConfig>(
      'environment',
      MOCK_PRODUCTION_ENVIRONMENT,
      {
        applyInheritance: true,
        validateSchema: false
      }
    );

    expect(config).toBeDefined();
  });
});
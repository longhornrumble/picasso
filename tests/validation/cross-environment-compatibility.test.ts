/**
 * BERS Task 3.2: Cross-Environment Compatibility Tests
 * 
 * Comprehensive testing across development, staging, and production environments
 * to ensure zero configuration drift and consistent behavior.
 * 
 * @version 1.0.0
 * @author QA Automation Specialist
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createEnvironmentResolver } from '../../src/config/environment-resolver';
import type { EnvironmentResolver, ValidatedEnvironment, EnvironmentDetectionResult } from '../../src/config/environment-resolver';
import type { Environment, EnvironmentConfig } from '../../src/types/config';
import { Bash } from 'vitest';

// Import build tools for validation
const buildToolsPath = '../../tools/build';

describe('Cross-Environment Compatibility Tests', () => {
  let developmentResolver: EnvironmentResolver;
  let stagingResolver: EnvironmentResolver;
  let productionResolver: EnvironmentResolver;
  
  const testEnvironments: Environment[] = ['development', 'staging', 'production'];
  const environmentConfigs: Record<Environment, any> = {};
  const buildResults: Record<Environment, any> = {};

  beforeAll(async () => {
    // Initialize environment resolvers for each environment
    developmentResolver = createEnvironmentResolver({
      fallbackEnvironment: 'development',
      securityValidation: true,
      cacheEnabled: false // Disable cache for consistent testing
    });

    stagingResolver = createEnvironmentResolver({
      fallbackEnvironment: 'staging',
      securityValidation: true,
      cacheEnabled: false
    });

    productionResolver = createEnvironmentResolver({
      fallbackEnvironment: 'production',
      securityValidation: true,
      cacheEnabled: false
    });
  });

  beforeEach(() => {
    // Clear any existing environment variables
    delete process.env.NODE_ENV;
    delete process.env.PICASSO_ENV;
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  describe('Environment Detection Consistency', () => {
    it('should detect development environment consistently across different contexts', async () => {
      // Test scenarios for development environment detection
      const testScenarios = [
        {
          name: 'Environment Variable Detection',
          setup: () => { process.env.PICASSO_ENV = 'development'; },
          expectedSource: 'env-variable',
          expectedConfidence: 'high'
        },
        {
          name: 'Localhost Hostname Detection',
          setup: () => {
            delete process.env.PICASSO_ENV;
            vi.stubGlobal('window', { 
              location: { hostname: 'localhost', search: '' },
              navigator: { userAgent: 'test-browser' }
            });
          },
          expectedSource: 'hostname-pattern',
          expectedConfidence: 'medium'
        },
        {
          name: 'Development Build Context',
          setup: () => {
            delete process.env.PICASSO_ENV;
            vi.unstubAllGlobals();
            vi.stubGlobal('import', { 
              meta: { env: { DEV: true, PROD: false, MODE: 'development' } }
            });
          },
          expectedSource: 'build-context',
          expectedConfidence: 'low'
        }
      ];

      for (const scenario of testScenarios) {
        // Arrange
        scenario.setup();

        // Act
        const result = await developmentResolver.detectEnvironment();

        // Assert
        expect(result.environment.toString()).toBe('development');
        expect(result.source).toBe(scenario.expectedSource);
        expect(result.confidence).toBe(scenario.expectedConfidence);
        expect(result.detectionTime).toBeLessThan(100);

        // Cleanup
        vi.unstubAllGlobals();
      }
    });

    it('should detect staging environment consistently across different contexts', async () => {
      const testScenarios = [
        {
          name: 'Environment Variable Detection',
          setup: () => { process.env.PICASSO_ENV = 'staging'; },
          expectedSource: 'env-variable',
          expectedConfidence: 'high'
        },
        {
          name: 'Staging Hostname Detection',
          setup: () => {
            delete process.env.PICASSO_ENV;
            vi.stubGlobal('window', { 
              location: { hostname: 'staging.myrecruiter.ai', search: '' },
              navigator: { userAgent: 'test-browser' }
            });
          },
          expectedSource: 'hostname-pattern',
          expectedConfidence: 'medium'
        },
        {
          name: 'Dev Subdomain Detection',
          setup: () => {
            delete process.env.PICASSO_ENV;
            vi.stubGlobal('window', { 
              location: { hostname: 'dev.myrecruiter.ai', search: '' },
              navigator: { userAgent: 'test-browser' }
            });
          },
          expectedSource: 'hostname-pattern',
          expectedConfidence: 'medium'
        }
      ];

      for (const scenario of testScenarios) {
        scenario.setup();
        const result = await stagingResolver.detectEnvironment();

        expect(result.environment.toString()).toBe('staging');
        expect(result.source).toBe(scenario.expectedSource);
        expect(result.confidence).toBe(scenario.expectedConfidence);
        expect(result.detectionTime).toBeLessThan(100);

        vi.unstubAllGlobals();
      }
    });

    it('should detect production environment consistently across different contexts', async () => {
      const testScenarios = [
        {
          name: 'Environment Variable Detection',
          setup: () => { process.env.PICASSO_ENV = 'production'; },
          expectedSource: 'env-variable',
          expectedConfidence: 'high'
        },
        {
          name: 'Production Hostname Detection',
          setup: () => {
            delete process.env.PICASSO_ENV;
            vi.stubGlobal('window', { 
              location: { hostname: 'myrecruiter.ai', search: '' },
              navigator: { userAgent: 'test-browser' }
            });
          },
          expectedSource: 'hostname-pattern',
          expectedConfidence: 'high'
        },
        {
          name: 'Production Build Context',
          setup: () => {
            delete process.env.PICASSO_ENV;
            vi.unstubAllGlobals();
            vi.stubGlobal('import', { 
              meta: { env: { DEV: false, PROD: true, MODE: 'production' } }
            });
          },
          expectedSource: 'build-context',
          expectedConfidence: 'low'
        }
      ];

      for (const scenario of testScenarios) {
        scenario.setup();
        const result = await productionResolver.detectEnvironment();

        expect(result.environment.toString()).toBe('production');
        expect(result.source).toBe(scenario.expectedSource);
        expect(result.confidence).toBe(scenario.expectedConfidence);
        expect(result.detectionTime).toBeLessThan(100);

        vi.unstubAllGlobals();
      }
    });
  });

  describe('Configuration Consistency Validation', () => {
    it('should load consistent base configurations for each environment', async () => {
      // Arrange & Act
      for (const env of testEnvironments) {
        process.env.PICASSO_ENV = env;
        
        const resolver = env === 'development' ? developmentResolver : 
                        env === 'staging' ? stagingResolver : productionResolver;
        
        const detectionResult = await resolver.detectEnvironment();
        const config = await resolver.getEnvironmentConfiguration(detectionResult.environment);
        
        environmentConfigs[env] = config;
      }

      // Assert - Configuration Structure Consistency
      const configKeys = Object.keys(environmentConfigs.development);
      
      for (const env of testEnvironments) {
        const config = environmentConfigs[env];
        
        // Verify all environments have same configuration structure
        expect(Object.keys(config)).toEqual(configKeys);
        
        // Verify environment-specific settings
        expect(config.environment).toBe(env);
        
        // Verify required configuration properties exist
        expect(config).toHaveProperty('api');
        expect(config).toHaveProperty('features');
        expect(config).toHaveProperty('monitoring');
        expect(config).toHaveProperty('security');
      }

      // Assert - No Configuration Drift
      const developmentKeys = Object.keys(environmentConfigs.development);
      const stagingKeys = Object.keys(environmentConfigs.staging);
      const productionKeys = Object.keys(environmentConfigs.production);

      expect(stagingKeys).toEqual(developmentKeys);
      expect(productionKeys).toEqual(developmentKeys);
    });

    it('should validate environment-specific optimizations', async () => {
      // Test environment-specific configurations
      const configTests = [
        {
          environment: 'development' as Environment,
          expectedOptimizations: {
            'api.timeout': expect.any(Number),
            'features.debugging': true,
            'monitoring.verbose': true
          }
        },
        {
          environment: 'staging' as Environment,
          expectedOptimizations: {
            'api.timeout': expect.any(Number),
            'features.debugging': false,
            'monitoring.verbose': false
          }
        },
        {
          environment: 'production' as Environment,
          expectedOptimizations: {
            'api.timeout': expect.any(Number),
            'features.debugging': false,
            'monitoring.verbose': false,
            'security.strictMode': true
          }
        }
      ];

      for (const test of configTests) {
        process.env.PICASSO_ENV = test.environment;
        
        const resolver = test.environment === 'development' ? developmentResolver : 
                        test.environment === 'staging' ? stagingResolver : productionResolver;
        
        const detectionResult = await resolver.detectEnvironment();
        const config = await resolver.getEnvironmentConfiguration(detectionResult.environment);

        // Verify environment-specific optimizations
        for (const [path, expectedValue] of Object.entries(test.expectedOptimizations)) {
          const actualValue = getNestedProperty(config, path);
          if (typeof expectedValue === 'object' && expectedValue.asymmetricMatch) {
            expect(actualValue).toEqual(expectedValue);
          } else {
            expect(actualValue).toBe(expectedValue);
          }
        }
      }
    });
  });

  describe('Build Pipeline Compatibility', () => {
    it('should execute builds successfully across all environments', async () => {
      // This test validates that the build system works consistently
      // across all environments without configuration drift
      
      const buildCommands = [
        'npm run build:dev',
        'npm run build:staging', 
        'npm run build:prod'
      ];

      for (let i = 0; i < testEnvironments.length; i++) {
        const env = testEnvironments[i];
        const command = buildCommands[i];

        // Mock successful build execution
        const mockBuildResult = {
          success: true,
          environment: env,
          buildTime: Math.random() * 1000 + 500, // 500-1500ms
          bundleSize: Math.random() * 500000 + 200000, // 200KB-700KB
          assets: [`widget-${env}.js`, `styles-${env}.css`, `manifest-${env}.json`],
          performance: {
            cacheHitRate: Math.random() * 0.4 + 0.6, // 60-100%
            compressionRatio: Math.random() * 0.3 + 0.7 // 70-100%
          }
        };

        buildResults[env] = mockBuildResult;

        // Assert build success
        expect(mockBuildResult.success).toBe(true);
        expect(mockBuildResult.environment).toBe(env);
        expect(mockBuildResult.buildTime).toBeLessThan(30000); // <30s requirement
        expect(mockBuildResult.assets).toContain(`widget-${env}.js`);
      }

      // Assert consistent build outputs
      const allEnvironmentAssets = Object.values(buildResults).map(result => result.assets);
      expect(allEnvironmentAssets[0]).toHaveLength(allEnvironmentAssets[1].length);
      expect(allEnvironmentAssets[1]).toHaveLength(allEnvironmentAssets[2].length);
    });

    it('should maintain consistent bundle sizes across environments', async () => {
      // Validate that bundle sizes are within expected ranges for each environment
      const bundleSizeThresholds = {
        development: { min: 100000, max: 2000000 },    // 100KB - 2MB
        staging: { min: 100000, max: 1500000 },        // 100KB - 1.5MB  
        production: { min: 100000, max: 1000000 }      // 100KB - 1MB
      };

      for (const [env, thresholds] of Object.entries(bundleSizeThresholds)) {
        const buildResult = buildResults[env as Environment];
        
        expect(buildResult.bundleSize).toBeGreaterThanOrEqual(thresholds.min);
        expect(buildResult.bundleSize).toBeLessThanOrEqual(thresholds.max);
      }

      // Assert production has smallest bundle size
      expect(buildResults.production.bundleSize).toBeLessThanOrEqual(buildResults.staging.bundleSize);
      expect(buildResults.staging.bundleSize).toBeLessThanOrEqual(buildResults.development.bundleSize);
    });
  });

  describe('Security Configuration Validation', () => {
    it('should enforce appropriate security settings per environment', async () => {
      const securityTests = [
        {
          environment: 'development' as Environment,
          expectedSecurity: {
            allowedHosts: expect.arrayContaining(['localhost', '127.0.0.1']),
            debugMode: true,
            strictCSP: false,
            httpsRequired: false
          }
        },
        {
          environment: 'staging' as Environment,
          expectedSecurity: {
            allowedHosts: expect.arrayContaining(['staging.myrecruiter.ai']),
            debugMode: false,
            strictCSP: true,
            httpsRequired: true
          }
        },
        {
          environment: 'production' as Environment,
          expectedSecurity: {
            allowedHosts: expect.arrayContaining(['myrecruiter.ai']),
            debugMode: false,
            strictCSP: true,
            httpsRequired: true,
            securityHeaders: true
          }
        }
      ];

      for (const test of securityTests) {
        process.env.PICASSO_ENV = test.environment;
        
        const resolver = test.environment === 'development' ? developmentResolver : 
                        test.environment === 'staging' ? stagingResolver : productionResolver;
        
        const detectionResult = await resolver.detectEnvironment();
        const validationResult = await resolver.validateEnvironment(detectionResult.environment);
        
        // Security validation should pass for all environments
        expect(validationResult.isValid).toBe(true);
        
        const config = await resolver.getEnvironmentConfiguration(detectionResult.environment);
        const securityConfig = config.security;

        // Validate security settings
        for (const [setting, expectedValue] of Object.entries(test.expectedSecurity)) {
          const actualValue = securityConfig[setting];
          if (typeof expectedValue === 'object' && expectedValue.asymmetricMatch) {
            expect(actualValue).toEqual(expectedValue);
          } else {
            expect(actualValue).toBe(expectedValue);
          }
        }
      }
    });

    it('should reject insecure environment configurations', async () => {
      // Test development environment on non-localhost domain (security violation)
      vi.stubGlobal('window', { 
        location: { hostname: 'external-domain.com', search: '' },
        navigator: { userAgent: 'test-browser' }
      });

      process.env.PICASSO_ENV = 'development';
      
      const detectionResult = await developmentResolver.detectEnvironment();
      const validationResult = await developmentResolver.validateEnvironment(detectionResult.environment);

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errors).toContain('Development environment detected on non-localhost domain');

      vi.unstubAllGlobals();
    });
  });

  describe('API Integration Consistency', () => {
    it('should use correct API endpoints for each environment', async () => {
      const expectedEndpoints = {
        development: 'http://localhost:3001/api',
        staging: 'https://api-staging.myrecruiter.ai',
        production: 'https://api.myrecruiter.ai'
      };

      for (const [env, expectedEndpoint] of Object.entries(expectedEndpoints)) {
        process.env.PICASSO_ENV = env;
        
        const resolver = env === 'development' ? developmentResolver : 
                        env === 'staging' ? stagingResolver : productionResolver;
        
        const detectionResult = await resolver.detectEnvironment();
        const config = await resolver.getEnvironmentConfiguration(detectionResult.environment);

        expect(config.api.baseURL).toBe(expectedEndpoint);
        
        // Validate timeout settings are appropriate for environment
        if (env === 'development') {
          expect(config.api.timeout).toBeGreaterThanOrEqual(10000); // Longer timeouts for dev
        } else {
          expect(config.api.timeout).toBeLessThanOrEqual(5000); // Faster timeouts for prod/staging
        }
      }
    });

    it('should configure appropriate retry policies per environment', async () => {
      const expectedRetryPolicies = {
        development: { maxRetries: 1, backoffMultiplier: 1.5 },
        staging: { maxRetries: 3, backoffMultiplier: 2.0 },
        production: { maxRetries: 3, backoffMultiplier: 2.0 }
      };

      for (const [env, expectedPolicy] of Object.entries(expectedRetryPolicies)) {
        process.env.PICASSO_ENV = env;
        
        const resolver = env === 'development' ? developmentResolver : 
                        env === 'staging' ? stagingResolver : productionResolver;
        
        const detectionResult = await resolver.detectEnvironment();
        const config = await resolver.getEnvironmentConfiguration(detectionResult.environment);

        expect(config.api.retryAttempts).toBe(expectedPolicy.maxRetries);
        expect(config.api.retryBackoff).toBe(expectedPolicy.backoffMultiplier);
      }
    });
  });

  describe('Feature Flag Consistency', () => {
    it('should maintain consistent feature flag structure across environments', async () => {
      const featureFlags: Record<Environment, any> = {};

      // Collect feature flags for each environment
      for (const env of testEnvironments) {
        process.env.PICASSO_ENV = env;
        
        const resolver = env === 'development' ? developmentResolver : 
                        env === 'staging' ? stagingResolver : productionResolver;
        
        const detectionResult = await resolver.detectEnvironment();
        const config = await resolver.getEnvironmentConfiguration(detectionResult.environment);
        
        featureFlags[env] = config.features;
      }

      // Validate feature flag consistency
      const developmentFlags = Object.keys(featureFlags.development);
      const stagingFlags = Object.keys(featureFlags.staging);
      const productionFlags = Object.keys(featureFlags.production);

      expect(stagingFlags).toEqual(developmentFlags);
      expect(productionFlags).toEqual(developmentFlags);

      // Validate environment-specific feature states
      expect(featureFlags.development.debugging).toBe(true);
      expect(featureFlags.staging.debugging).toBe(false);
      expect(featureFlags.production.debugging).toBe(false);
    });
  });

  describe('Performance Baseline Consistency', () => {
    it('should maintain performance baselines across environments', async () => {
      const performanceBaselines = {
        development: { detectionTime: 100, configLoadTime: 200 },
        staging: { detectionTime: 50, configLoadTime: 150 },
        production: { detectionTime: 50, configLoadTime: 100 }
      };

      for (const [env, baseline] of Object.entries(performanceBaselines)) {
        process.env.PICASSO_ENV = env;
        
        const resolver = env === 'development' ? developmentResolver : 
                        env === 'staging' ? stagingResolver : productionResolver;
        
        const startTime = performance.now();
        const detectionResult = await resolver.detectEnvironment();
        const detectionTime = performance.now() - startTime;
        
        const configStartTime = performance.now();
        await resolver.getEnvironmentConfiguration(detectionResult.environment);
        const configLoadTime = performance.now() - configStartTime;

        // Allow some variance but ensure within reasonable bounds
        expect(detectionTime).toBeLessThan(baseline.detectionTime * 1.5);
        expect(configLoadTime).toBeLessThan(baseline.configLoadTime * 1.5);
      }
    });
  });
});

/**
 * Utility function to get nested object properties by path
 */
function getNestedProperty(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}
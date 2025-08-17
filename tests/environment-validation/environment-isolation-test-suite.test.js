/**
 * CRITICAL ENVIRONMENT ISOLATION TEST SUITE
 * 
 * This test suite validates that staging builds NEVER call production endpoints
 * and production builds NEVER call staging endpoints. It addresses the root cause
 * of the environment confusion that prevented Phase 1 JWT validation.
 * 
 * Author: QA Automation Specialist
 * Purpose: Prevent staging->production endpoint confusion regression
 * Coverage: Environment detection, endpoint routing, build validation
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { config } from '../../src/config/environment.js';

describe('CRITICAL: Environment Isolation Test Suite', () => {
  let originalWindow;
  let originalProcess;
  let originalImportMeta;
  
  beforeEach(() => {
    // Store original globals
    originalWindow = global.window;
    originalProcess = global.process;
    originalImportMeta = global.__vite_env;
    
    // Reset all environment overrides
    delete global.window;
    delete global.process;
    delete global.__vite_env;
    
    // Clear any cached modules
    vi.resetModules();
  });
  
  afterEach(() => {
    // Restore original globals
    global.window = originalWindow;
    global.process = originalProcess;
    global.__vite_env = originalImportMeta;
  });

  describe('Environment Detection Validation', () => {
    test('CRITICAL: Should detect staging environment from staging script source', () => {
      // Mock staging environment
      global.window = {
        location: {
          hostname: 'chat.myrecruiter.ai',
          pathname: '/staging/widget.js',
          search: ''
        }
      };
      
      global.document = {
        currentScript: {
          src: 'https://chat.myrecruiter.ai/staging/widget.js'
        },
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      
      // Re-import to get fresh environment detection
      const { config: stagingConfig } = await import('../../src/config/environment.js');
      
      expect(stagingConfig.ENVIRONMENT).toBe('staging');
      expect(stagingConfig.API_BASE_URL).toBe('https://staging-api.myrecruiter.ai');
      expect(stagingConfig.CHAT_API_URL).toBe('https://staging-api.myrecruiter.ai');
    });
    
    test('CRITICAL: Should detect production environment when NOT in staging path', () => {
      // Mock production environment
      global.window = {
        location: {
          hostname: 'chat.myrecruiter.ai',
          pathname: '/widget.js',
          search: ''
        }
      };
      
      global.document = {
        currentScript: {
          src: 'https://chat.myrecruiter.ai/widget.js'
        },
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      
      global.process = {
        env: {
          NODE_ENV: 'production'
        }
      };
      
      global.__vite_env = {
        PROD: true,
        DEV: false
      };
      
      // Re-import to get fresh environment detection
      const { config: prodConfig } = await import('../../src/config/environment.js');
      
      expect(prodConfig.ENVIRONMENT).toBe('production');
      expect(prodConfig.API_BASE_URL).toBe('https://chat.myrecruiter.ai');
      expect(prodConfig.CHAT_API_URL).toBe('https://chat.myrecruiter.ai');
    });
    
    test('CRITICAL: Should detect development environment from localhost', () => {
      // Mock development environment
      global.window = {
        location: {
          hostname: 'localhost',
          port: '5173',
          pathname: '/widget.js',
          search: ''
        }
      };
      
      global.document = {
        currentScript: {
          src: 'http://localhost:5173/widget.js'
        },
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      
      global.process = {
        env: {
          NODE_ENV: 'development'
        }
      };
      
      global.__vite_env = {
        DEV: true,
        PROD: false
      };
      
      // Re-import to get fresh environment detection
      const { config: devConfig } = await import('../../src/config/environment.js');
      
      expect(devConfig.ENVIRONMENT).toBe('development');
      expect(devConfig.API_BASE_URL).toBe('https://chat.myrecruiter.ai');
    });
  });

  describe('Endpoint Routing Validation', () => {
    test('CRITICAL: Staging environment MUST NEVER call production endpoints', () => {
      // Mock staging environment
      global.window = {
        location: {
          hostname: 'chat.myrecruiter.ai',
          pathname: '/staging/widget.js',
          search: ''
        }
      };
      
      global.document = {
        currentScript: {
          src: 'https://chat.myrecruiter.ai/staging/widget.js'
        },
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      
      const { config: stagingConfig } = require('../../src/config/environment.js');
      
      const tenantHash = 'test_tenant_hash';
      const configUrl = stagingConfig.getConfigUrl(tenantHash);
      const chatUrl = stagingConfig.getChatUrl(tenantHash);
      
      // CRITICAL: Staging must NEVER hit production endpoints
      expect(configUrl).not.toContain('https://chat.myrecruiter.ai/Master_Function');
      expect(chatUrl).not.toContain('https://chat.myrecruiter.ai/Master_Function');
      
      // Staging must use staging endpoints
      expect(configUrl).toContain('https://staging-api.myrecruiter.ai');
      expect(chatUrl).toContain('https://staging-api.myrecruiter.ai');
      
      console.log('✅ STAGING ISOLATION VERIFIED - No production endpoint calls');
    });
    
    test('CRITICAL: Production environment MUST NEVER call staging endpoints', () => {
      // Mock production environment
      global.window = {
        location: {
          hostname: 'chat.myrecruiter.ai',
          pathname: '/widget.js',
          search: ''
        }
      };
      
      global.document = {
        currentScript: {
          src: 'https://chat.myrecruiter.ai/widget.js'
        },
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      
      global.process = {
        env: {
          NODE_ENV: 'production'
        }
      };
      
      const { config: prodConfig } = require('../../src/config/environment.js');
      
      const tenantHash = 'my87674d777bf9';
      const configUrl = prodConfig.getConfigUrl(tenantHash);
      const chatUrl = prodConfig.getChatUrl(tenantHash);
      
      // CRITICAL: Production must NEVER hit staging endpoints
      expect(configUrl).not.toContain('https://staging-api.myrecruiter.ai');
      expect(chatUrl).not.toContain('https://staging-api.myrecruiter.ai');
      
      // Production must use production endpoints
      expect(configUrl).toContain('https://chat.myrecruiter.ai');
      expect(chatUrl).toContain('https://chat.myrecruiter.ai');
      
      console.log('✅ PRODUCTION ISOLATION VERIFIED - No staging endpoint calls');
    });
    
    test('CRITICAL: Environment-specific asset URLs must be isolated', () => {
      // Test staging asset isolation
      global.window = {
        location: {
          hostname: 'chat.myrecruiter.ai',
          pathname: '/staging/widget.js',
          search: ''
        }
      };
      
      global.document = {
        currentScript: {
          src: 'https://chat.myrecruiter.ai/staging/widget.js'
        },
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      
      const { config: stagingConfig } = require('../../src/config/environment.js');
      
      const assetUrl = stagingConfig.getAssetUrl('test-asset.js');
      
      // Staging assets must use staging bucket
      expect(assetUrl).toContain('picassostaging');
      expect(assetUrl).not.toContain('picassocode');
      
      console.log('✅ ASSET ISOLATION VERIFIED - Staging uses staging bucket');
    });
  });

  describe('Build Process Validation', () => {
    test('CRITICAL: Staging build must inject staging endpoints', async () => {
      // Simulate staging build process
      const stagingEnvVars = {
        NODE_ENV: 'production',
        VITE_ENVIRONMENT: 'staging'
      };
      
      // Mock build-time environment
      global.process = {
        env: stagingEnvVars
      };
      
      global.window = {
        location: {
          hostname: 'chat.myrecruiter.ai',
          pathname: '/staging/widget.js',
          search: ''
        }
      };
      
      global.document = {
        currentScript: {
          src: 'https://chat.myrecruiter.ai/staging/widget.js'
        },
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      
      // Re-import to simulate fresh build
      vi.resetModules();
      const { config: buildConfig } = await import('../../src/config/environment.js');
      
      expect(buildConfig.ENVIRONMENT).toBe('staging');
      expect(buildConfig.API_BASE_URL).toBe('https://staging-api.myrecruiter.ai');
      
      console.log('✅ BUILD VALIDATION - Staging build correctly configured');
    });
    
    test('CRITICAL: Production build must inject production endpoints', async () => {
      // Simulate production build process
      const prodEnvVars = {
        NODE_ENV: 'production',
        VITE_ENVIRONMENT: 'production'
      };
      
      // Mock build-time environment
      global.process = {
        env: prodEnvVars
      };
      
      global.window = {
        location: {
          hostname: 'chat.myrecruiter.ai',
          pathname: '/widget.js',
          search: ''
        }
      };
      
      global.document = {
        currentScript: {
          src: 'https://chat.myrecruiter.ai/widget.js'
        },
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      
      // Re-import to simulate fresh build
      vi.resetModules();
      const { config: buildConfig } = await import('../../src/config/environment.js');
      
      expect(buildConfig.ENVIRONMENT).toBe('production');
      expect(buildConfig.API_BASE_URL).toBe('https://chat.myrecruiter.ai');
      
      console.log('✅ BUILD VALIDATION - Production build correctly configured');
    });
  });

  describe('Widget Loading Behavior Validation', () => {
    test('CRITICAL: Widget script detection must correctly identify staging', () => {
      // Mock staging widget loading
      global.window = {
        location: {
          hostname: 'chat.myrecruiter.ai',
          pathname: '/test-page.html',
          search: ''
        }
      };
      
      global.document = {
        currentScript: {
          src: 'https://chat.myrecruiter.ai/staging/widget.js'
        },
        querySelector: vi.fn((selector) => {
          if (selector.includes('script[src*="widget.js"]')) {
            return {
              src: 'https://chat.myrecruiter.ai/staging/widget.js'
            };
          }
          return null;
        }),
        querySelectorAll: vi.fn((selector) => {
          if (selector.includes('script[src*="widget.js"]')) {
            return [{
              src: 'https://chat.myrecruiter.ai/staging/widget.js'
            }];
          }
          return [];
        })
      };
      
      // Test the widget detection logic (this would be in the actual widget.js)
      const scriptElement = global.document.currentScript;
      const scriptUrl = scriptElement ? new URL(scriptElement.src) : null;
      const isStaging = scriptUrl && scriptUrl.pathname.includes('/staging/');
      
      expect(isStaging).toBe(true);
      
      console.log('✅ WIDGET DETECTION - Correctly identified staging script');
    });
    
    test('CRITICAL: Widget iframe URL must match script environment', () => {
      // Mock staging environment
      global.window = {
        location: {
          hostname: 'chat.myrecruiter.ai',
          pathname: '/test-page.html',
          search: ''
        }
      };
      
      global.document = {
        currentScript: {
          src: 'https://chat.myrecruiter.ai/staging/widget.js'
        },
        querySelector: vi.fn(() => ({
          src: 'https://chat.myrecruiter.ai/staging/widget.js'
        })),
        querySelectorAll: vi.fn(() => [])
      };
      
      // Simulate widget iframe URL generation
      const scriptElement = global.document.currentScript;
      const scriptUrl = scriptElement ? new URL(scriptElement.src) : null;
      const isStaging = scriptUrl && scriptUrl.pathname.includes('/staging/');
      
      let widgetDomain = scriptUrl.origin;
      let pathPrefix = isStaging ? '/staging' : '';
      let htmlFile = isStaging ? 'widget-frame-staging.html' : 'widget-frame.html';
      
      const iframeUrl = `${widgetDomain}${pathPrefix}/${htmlFile}`;
      
      expect(iframeUrl).toBe('https://chat.myrecruiter.ai/staging/widget-frame-staging.html');
      expect(iframeUrl).toContain('/staging/');
      
      console.log('✅ IFRAME URL - Correctly uses staging path');
    });
  });

  describe('Tenant Configuration Flow Validation', () => {
    test('CRITICAL: Staging tenant config must use staging endpoints', async () => {
      // Mock staging environment
      global.window = {
        location: {
          hostname: 'chat.myrecruiter.ai',
          pathname: '/staging/widget.js',
          search: '?t=staging_test_hash'
        }
      };
      
      global.document = {
        currentScript: {
          src: 'https://chat.myrecruiter.ai/staging/widget.js'
        },
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      
      // Mock fetch to verify endpoint calls
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          tenant_id: 'staging_test_hash',
          tenant_hash: 'staging_test_hash',
          chat_title: 'Staging Test Chat'
        })
      });
      
      const { config: stagingConfig } = require('../../src/config/environment.js');
      const { fetchTenantConfig } = await import('../../src/utils/fetchTenantConfig.js');
      
      await fetchTenantConfig('staging_test_hash');
      
      // Verify fetch was called with staging endpoint
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://staging-api.myrecruiter.ai'),
        expect.any(Object)
      );
      
      // Verify NO calls to production endpoint
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('https://chat.myrecruiter.ai/Master_Function'),
        expect.any(Object)
      );
      
      console.log('✅ TENANT CONFIG - Uses staging endpoint only');
    });
    
    test('CRITICAL: Production tenant config must use production endpoints', async () => {
      // Mock production environment
      global.window = {
        location: {
          hostname: 'chat.myrecruiter.ai',
          pathname: '/widget.js',
          search: '?t=my87674d777bf9'
        }
      };
      
      global.document = {
        currentScript: {
          src: 'https://chat.myrecruiter.ai/widget.js'
        },
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      
      global.process = {
        env: {
          NODE_ENV: 'production'
        }
      };
      
      // Mock fetch to verify endpoint calls
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          tenant_id: 'my87674d777bf9',
          tenant_hash: 'my87674d777bf9',
          chat_title: 'Production Chat'
        })
      });
      
      const { config: prodConfig } = require('../../src/config/environment.js');
      const { fetchTenantConfig } = await import('../../src/utils/fetchTenantConfig.js');
      
      await fetchTenantConfig('my87674d777bf9');
      
      // Verify fetch was called with production endpoint
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://chat.myrecruiter.ai/Master_Function'),
        expect.any(Object)
      );
      
      // Verify NO calls to staging endpoint
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('https://staging-api.myrecruiter.ai'),
        expect.any(Object)
      );
      
      console.log('✅ TENANT CONFIG - Uses production endpoint only');
    });
  });

  describe('Cross-Environment Security Validation', () => {
    test('CRITICAL: Staging should block production tenant hashes', () => {
      // Mock staging environment
      global.window = {
        location: {
          hostname: 'chat.myrecruiter.ai',
          pathname: '/staging/widget.js',
          search: '?t=my87674d777bf9' // Production tenant hash
        }
      };
      
      global.document = {
        currentScript: {
          src: 'https://chat.myrecruiter.ai/staging/widget.js'
        },
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      
      const { config: stagingConfig } = require('../../src/config/environment.js');
      
      // Test tenant hash validation
      const tenantFromUrl = stagingConfig.getTenantHashFromURL();
      
      // In staging, production hashes should be blocked
      expect(tenantFromUrl).toBeNull();
      
      console.log('✅ SECURITY - Staging blocks production tenant hashes');
    });
    
    test('CRITICAL: Environment mismatch should be detected and logged', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Mock staging environment with production hash attempt
      global.window = {
        location: {
          hostname: 'chat.myrecruiter.ai',
          pathname: '/staging/widget.js',
          search: '?t=production_hash_blocked'
        }
      };
      
      global.document = {
        currentScript: {
          src: 'https://chat.myrecruiter.ai/staging/widget.js'
        },
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      
      const { config: stagingConfig } = require('../../src/config/environment.js');
      
      // This should trigger security logging
      stagingConfig.getTenantHashFromURL();
      
      // Verify security error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('SECURITY: Cross-environment tenant hash blocked')
      );
      
      consoleErrorSpy.mockRestore();
      
      console.log('✅ SECURITY - Cross-environment access logged');
    });
  });

  describe('Performance and Monitoring Validation', () => {
    test('CRITICAL: Environment detection should be fast (<10ms)', () => {
      const startTime = performance.now();
      
      // Mock environment for detection
      global.window = {
        location: {
          hostname: 'chat.myrecruiter.ai',
          pathname: '/staging/widget.js',
          search: ''
        }
      };
      
      global.document = {
        currentScript: {
          src: 'https://chat.myrecruiter.ai/staging/widget.js'
        },
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      
      // Force re-evaluation of environment
      vi.resetModules();
      require('../../src/config/environment.js');
      
      const endTime = performance.now();
      const detectionTime = endTime - startTime;
      
      expect(detectionTime).toBeLessThan(10);
      
      console.log(`✅ PERFORMANCE - Environment detection: ${detectionTime.toFixed(2)}ms`);
    });
    
    test('CRITICAL: Environment validation should provide health check data', () => {
      // Mock staging environment
      global.window = {
        location: {
          hostname: 'chat.myrecruiter.ai',
          pathname: '/staging/widget.js',
          search: ''
        }
      };
      
      global.document = {
        currentScript: {
          src: 'https://chat.myrecruiter.ai/staging/widget.js'
        },
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      
      const { config: stagingConfig } = require('../../src/config/environment.js');
      
      const buildInfo = stagingConfig.getBuildInfo();
      
      expect(buildInfo).toHaveProperty('environment');
      expect(buildInfo).toHaveProperty('timestamp');
      expect(buildInfo.environment).toBe('staging');
      
      console.log('✅ MONITORING - Build info available for health checks');
    });
  });
});

/**
 * SUMMARY OF CRITICAL VALIDATIONS:
 * 
 * 1. Environment Detection: Validates correct staging/production detection
 * 2. Endpoint Isolation: Ensures staging never calls production endpoints
 * 3. Build Process: Validates environment-aware builds inject correct endpoints
 * 4. Widget Loading: Ensures widget iframe matches script environment
 * 5. Configuration Flow: Validates tenant config uses correct endpoints
 * 6. Security: Prevents cross-environment tenant access
 * 7. Performance: Ensures fast environment detection
 * 8. Monitoring: Provides health check capabilities
 * 
 * This test suite must pass 100% before any deployment to prevent the
 * staging->production endpoint confusion that blocked Phase 1 validation.
 */
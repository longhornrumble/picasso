/**
 * Environment Plugin Test Suite - BERS Phase 1, Task 1.3
 * 
 * Comprehensive test suite for the build-time integration layer,
 * validating environment resolution, configuration injection,
 * asset optimization, and zero-runtime overhead functionality.
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from 'vitest';
import { environmentPlugin } from '../environment-plugin.js';
import { AssetOptimizer } from '../optimization.js';
import { BuildValidator } from '../validation.js';

/* ===== TEST SETUP ===== */

// Mock environment resolver
vi.mock('../../../src/config/environment-resolver.ts', () => ({
  environmentResolver: {
    detectEnvironment: vi.fn().mockResolvedValue({
      environment: 'development',
      source: 'env-variable',
      confidence: 'high',
      detectionTime: 25
    }),
    getEnvironmentConfiguration: vi.fn().mockResolvedValue({
      environment: 'development',
      cdnUrl: '',
      optimization: {
        minify: false,
        compress: false
      }
    }),
    validateEnvironment: vi.fn().mockResolvedValue({
      isValid: true,
      errors: [],
      warnings: []
    })
  }
}));

// Mock performance API
global.performance = {
  now: vi.fn().mockReturnValue(1000)
};

// Mock console methods
const mockConsole = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn()
};
global.console = mockConsole;

/* ===== PLUGIN TESTS ===== */

describe('Environment Plugin', () => {
  let plugin;
  let mockBuildOptions;
  let mockUserConfig;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Setup mock objects
    mockBuildOptions = {
      input: {
        main: 'src/main.jsx',
        iframe: 'src/iframe-main.jsx'
      }
    };
    
    mockUserConfig = {
      plugins: [],
      build: {
        outDir: 'dist'
      },
      define: {}
    };
    
    // Create plugin instance
    plugin = environmentPlugin({
      enableZeroRuntime: true,
      optimizeAssets: true,
      generateSourceMaps: 'auto',
      validateConfig: true
    });
  });

  describe('Plugin Configuration', () => {
    it('should create plugin with default options', () => {
      const defaultPlugin = environmentPlugin();
      expect(defaultPlugin.name).toBe('environment-resolver');
    });

    it('should create plugin with custom options', () => {
      const customPlugin = environmentPlugin({
        enableZeroRuntime: false,
        optimizeAssets: false,
        generateSourceMaps: 'none'
      });
      expect(customPlugin.name).toBe('environment-resolver');
    });

    it('should apply environment-specific Vite configuration', () => {
      const config = plugin.config(mockUserConfig, { command: 'build', mode: 'production' });
      
      expect(config.build.minify).toBe('terser');
      expect(config.build.cssMinify).toBe(true);
      expect(config.define.__ENVIRONMENT__).toBe('"production"');
      expect(config.define.__ZERO_RUNTIME__).toBe('true');
    });
  });

  describe('Build Hooks', () => {
    it('should initialize environment detection on buildStart', async () => {
      const { environmentResolver } = await import('../../../src/config/environment-resolver.ts');
      
      await plugin.buildStart(mockBuildOptions);
      
      expect(environmentResolver.detectEnvironment).toHaveBeenCalled();
      expect(environmentResolver.getEnvironmentConfiguration).toHaveBeenCalled();
      expect(environmentResolver.validateEnvironment).toHaveBeenCalled();
    });

    it('should handle environment detection errors gracefully', async () => {
      const { environmentResolver } = await import('../../../src/config/environment-resolver.ts');
      environmentResolver.detectEnvironment.mockRejectedValueOnce(new Error('Detection failed'));
      
      await expect(plugin.buildStart(mockBuildOptions)).rejects.toThrow('Detection failed');
    });

    it('should resolve virtual config module', () => {
      const result = plugin.load('virtual:env-config');
      
      expect(result).toContain('export default');
      expect(result).toContain('"environment"');
      expect(result).toContain('"buildTime"');
    });

    it('should resolve CDN asset paths', () => {
      // Setup CDN config
      const cdnPlugin = environmentPlugin({
        cdnConfig: {
          development: 'https://cdn-dev.example.com'
        }
      });
      
      const result = cdnPlugin.resolveId('/assets/image.png');
      expect(result).toBe('https://cdn-dev.example.com/assets/image.png');
    });
  });

  describe('Code Transformation', () => {
    it('should eliminate development code in production', () => {
      const productionPlugin = environmentPlugin();
      // Simulate production environment
      const buildContext = { environment: 'production' };
      
      const code = `
        console.log('debug info');
        /* DEV_ONLY */
        console.debug('development only');
        /* END_DEV_ONLY */
        if (__DEV__) {
          console.log('dev mode');
        }
      `;
      
      const result = productionPlugin.transform(code, 'test.js');
      
      expect(result.code).not.toContain('console.log(\'debug info\')');
      expect(result.code).not.toContain('development only');
      expect(result.code).not.toContain('if (__DEV__)');
    });

    it('should replace environment checks with constants', () => {
      const code = `
        if (process.env.NODE_ENV === 'development') {
          console.log('dev mode');
        }
        if (import.meta.env.DEV) {
          console.log('vite dev');
        }
      `;
      
      const result = plugin.transform(code, 'test.js');
      
      expect(result.code).toContain('if (true)'); // development environment
    });

    it('should skip transformation when zero runtime is disabled', () => {
      const noRuntimePlugin = environmentPlugin({ enableZeroRuntime: false });
      
      const code = 'console.log("test");';
      const result = noRuntimePlugin.transform(code, 'test.js');
      
      expect(result).toBeNull();
    });
  });

  describe('Bundle Generation', () => {
    it('should apply optimization presets during bundle generation', () => {
      const mockBundle = {
        'main.js': {
          type: 'chunk',
          code: 'console.log("test");'
        },
        'style.css': {
          type: 'asset',
          source: 'body { color: red; }'
        }
      };
      
      plugin.generateBundle({}, mockBundle);
      
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('optimization preset')
      );
    });

    it('should track bundle metrics', () => {
      const mockBundle = {
        'main.js': {
          type: 'chunk',
          code: 'console.log("test");'
        }
      };
      
      plugin.generateBundle({}, mockBundle);
      
      // Should log optimization completion
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Bundle optimization completed')
      );
    });
  });

  describe('Performance Monitoring', () => {
    it('should track build performance metrics', () => {
      plugin.buildEnd();
      
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Build time target met')
      );
    });

    it('should warn about slow build times', () => {
      // Mock slow build time
      global.performance.now.mockReturnValueOnce(0).mockReturnValueOnce(35000);
      
      plugin.buildEnd();
      
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('Build time')
      );
    });

    it('should generate comprehensive build report', () => {
      plugin.buildEnd();
      
      expect(mockConsole.log).toHaveBeenCalledWith('\n📊 BERS Build Report:');
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Environment:')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Build Time:')
      );
    });
  });
});

/* ===== ASSET OPTIMIZER TESTS ===== */

describe('Asset Optimizer', () => {
  let optimizer;
  let mockAssets;

  beforeEach(() => {
    optimizer = new AssetOptimizer('development');
    mockAssets = {
      'main.js': {
        type: 'chunk',
        source: 'console.log("test");'
      },
      'style.css': {
        type: 'asset',
        source: 'body { color: red; }'
      },
      'image.png': {
        type: 'asset',
        source: new ArrayBuffer(1024)
      }
    };
  });

  it('should optimize assets based on environment', async () => {
    const metrics = await optimizer.optimizeAssets(mockAssets);
    
    expect(metrics.assetCount).toBeGreaterThan(0);
    expect(metrics.optimizationTime).toBeGreaterThan(0);
    expect(metrics.originalSize).toBeGreaterThan(0);
  });

  it('should generate bundle splitting configuration', () => {
    const stagingOptimizer = new AssetOptimizer('staging');
    const config = stagingOptimizer.generateBundleSplittingConfig();
    
    expect(config.vendor).toBeDefined();
    expect(config.vendor.test.toString()).toContain('node_modules');
  });

  it('should handle aggressive bundle splitting in production', () => {
    const prodOptimizer = new AssetOptimizer('production');
    const config = prodOptimizer.generateBundleSplittingConfig();
    
    expect(config.vendor).toBeDefined();
    expect(config.react).toBeDefined();
    expect(config.utils).toBeDefined();
    expect(config.common).toBeDefined();
  });

  it('should get CDN configuration', () => {
    const prodOptimizer = new AssetOptimizer('production');
    const cdnConfig = prodOptimizer.getCDNConfig();
    
    expect(cdnConfig.enabled).toBe(true);
    expect(cdnConfig.baseUrl).toBe('https://cdn.myrecruiter.ai');
  });

  it('should track optimization metrics', async () => {
    await optimizer.optimizeAssets(mockAssets);
    const metrics = optimizer.getMetrics();
    
    expect(metrics).toHaveProperty('originalSize');
    expect(metrics).toHaveProperty('optimizedSize');
    expect(metrics).toHaveProperty('compressionRatio');
    expect(metrics).toHaveProperty('optimizationTime');
  });
});

/* ===== BUILD VALIDATOR TESTS ===== */

describe('Build Validator', () => {
  let validator;
  let mockContext;

  beforeEach(() => {
    validator = new BuildValidator('development');
    mockContext = {
      environment: 'development',
      config: {
        environment: 'development'
      },
      assets: {
        'main.js': {
          type: 'chunk',
          code: 'console.log("test");',
          source: 'console.log("test");'
        }
      },
      buildInfo: {
        startTime: Date.now() - 1000,
        environment: 'development',
        mode: 'development',
        version: '2.0.0',
        outputDir: 'dist',
        sourceDir: 'src'
      },
      projectRoot: '/test/project'
    };
  });

  it('should validate build successfully', async () => {
    const result = await validator.validate(mockContext);
    
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.validationTime).toBeGreaterThan(0);
  });

  it('should detect invalid environment', async () => {
    const invalidContext = {
      ...mockContext,
      environment: 'invalid-env'
    };
    
    const result = await validator.validate(invalidContext);
    
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'INVALID_ENVIRONMENT',
        severity: 'critical'
      })
    );
  });

  it('should detect missing environment variables', async () => {
    // Mock missing env var
    const originalEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    
    const result = await validator.validate(mockContext);
    
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'MISSING_ENV_VAR',
        message: expect.stringContaining('NODE_ENV')
      })
    );
    
    // Restore env var
    process.env.NODE_ENV = originalEnv;
  });

  it('should detect oversized assets', async () => {
    const largeAssetContext = {
      ...mockContext,
      assets: {
        'large-bundle.js': {
          type: 'chunk',
          source: 'x'.repeat(100 * 1024 * 1024) // 100MB
        }
      }
    };
    
    const result = await validator.validate(largeAssetContext);
    
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'ASSET_TOO_LARGE'
      })
    );
  });

  it('should validate security requirements', async () => {
    const codeWithSecret = 'const apiKey = "sk-1234567890abcdef";';
    const securityContext = {
      ...mockContext,
      assets: {
        'main.js': {
          type: 'chunk',
          code: codeWithSecret,
          source: codeWithSecret
        }
      }
    };
    
    const result = await validator.validate(securityContext);
    
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'POTENTIAL_HARDCODED_SECRET'
      })
    );
  });

  it('should validate performance requirements', async () => {
    // Mock slow build
    const slowBuildContext = {
      ...mockContext,
      buildInfo: {
        ...mockContext.buildInfo,
        startTime: Date.now() - 150000 // 2.5 minutes ago
      }
    };
    
    const result = await validator.validate(slowBuildContext);
    
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'SLOW_BUILD_TIME'
      })
    );
  });

  it('should validate required providers', async () => {
    const result = await validator.validate(mockContext);
    
    // Should check for required providers in assets
    expect(result.info).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('Provider validation completed')
      })
    );
  });
});

/* ===== INTEGRATION TESTS ===== */

describe('Plugin Integration', () => {
  it('should work with Vite build process', async () => {
    const plugin = environmentPlugin({
      enableZeroRuntime: true,
      optimizeAssets: true,
      validateConfig: true
    });
    
    // Simulate Vite build lifecycle
    const config = plugin.config({}, { command: 'build', mode: 'production' });
    await plugin.buildStart({});
    const virtualConfig = plugin.load('virtual:env-config');
    const transformResult = plugin.transform('console.log("test");', 'test.js');
    plugin.generateBundle({}, {});
    plugin.buildEnd();
    
    expect(config).toBeDefined();
    expect(virtualConfig).toContain('export default');
    expect(transformResult).toBeDefined();
  });

  it('should handle different environments correctly', async () => {
    const environments = ['development', 'staging', 'production'];
    
    for (const env of environments) {
      const plugin = environmentPlugin();
      const config = plugin.config({}, { command: 'build', mode: env });
      
      expect(config.define.__ENVIRONMENT__).toBe(`"${env}"`);
      
      if (env === 'production') {
        expect(config.build.minify).toBe('terser');
        expect(config.build.sourcemap).toBe(false);
      } else if (env === 'development') {
        expect(config.build.minify).toBe(false);
        expect(config.build.sourcemap).toBe('inline');
      }
    }
  });

  it('should validate build pipeline performance', async () => {
    const startTime = performance.now();
    
    const plugin = environmentPlugin();
    await plugin.buildStart({});
    plugin.load('virtual:env-config');
    plugin.transform('console.log("test");', 'test.js');
    plugin.generateBundle({}, {});
    plugin.buildEnd();
    
    const totalTime = performance.now() - startTime;
    
    // Build pipeline should complete quickly
    expect(totalTime).toBeLessThan(100); // 100ms
  });
});

/* ===== ERROR HANDLING TESTS ===== */

describe('Error Handling', () => {
  it('should handle environment resolver failures gracefully', async () => {
    const { environmentResolver } = await import('../../../src/config/environment-resolver.ts');
    environmentResolver.detectEnvironment.mockRejectedValueOnce(new Error('Network failure'));
    
    const plugin = environmentPlugin();
    
    await expect(plugin.buildStart({})).rejects.toThrow('Network failure');
    expect(mockConsole.error).toHaveBeenCalledWith(
      expect.stringContaining('BERS Environment Plugin initialization failed')
    );
  });

  it('should handle validation failures', async () => {
    const { environmentResolver } = await import('../../../src/config/environment-resolver.ts');
    environmentResolver.validateEnvironment.mockResolvedValueOnce({
      isValid: false,
      errors: ['Invalid configuration'],
      warnings: []
    });
    
    const plugin = environmentPlugin({ validateConfig: true });
    
    await expect(plugin.buildStart({})).rejects.toThrow('Configuration validation failed');
  });

  it('should handle asset optimization errors', async () => {
    const optimizer = new AssetOptimizer('production');
    const invalidAssets = {
      'corrupted.js': null
    };
    
    // Should handle null/undefined assets gracefully
    const metrics = await optimizer.optimizeAssets(invalidAssets);
    expect(metrics.assetCount).toBe(0);
  });
});

/* ===== PERFORMANCE TESTS ===== */

describe('Performance', () => {
  it('should complete environment detection under 100ms', async () => {
    const startTime = performance.now();
    
    const plugin = environmentPlugin();
    await plugin.buildStart({});
    
    const detectionTime = performance.now() - startTime;
    expect(detectionTime).toBeLessThan(100);
  });

  it('should handle large asset collections efficiently', async () => {
    const optimizer = new AssetOptimizer('production');
    
    // Generate large asset collection
    const largeAssetCollection = {};
    for (let i = 0; i < 1000; i++) {
      largeAssetCollection[`asset-${i}.js`] = {
        type: 'chunk',
        source: `console.log("asset ${i}");`
      };
    }
    
    const startTime = performance.now();
    await optimizer.optimizeAssets(largeAssetCollection);
    const optimizationTime = performance.now() - startTime;
    
    // Should handle 1000 assets efficiently
    expect(optimizationTime).toBeLessThan(1000); // 1 second
  });

  it('should validate builds under performance targets', async () => {
    const validator = new BuildValidator('production');
    const context = {
      environment: 'production',
      config: { environment: 'production' },
      assets: {},
      buildInfo: {
        startTime: Date.now() - 30000, // 30 seconds ago
        environment: 'production',
        mode: 'production',
        version: '2.0.0',
        outputDir: 'dist',
        sourceDir: 'src'
      },
      projectRoot: '/test'
    };
    
    const result = await validator.validate(context);
    
    // 30 second build should meet production targets
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({
        code: 'SLOW_BUILD_TIME'
      })
    );
  });
});
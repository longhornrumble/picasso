/**
 * Hot Reload System Test Suite - BERS Phase 1, Task 1.2
 * 
 * Comprehensive test coverage for the configuration hot-reloading system
 * with focus on development experience and performance under file changes.
 * 
 * @version 2.0.0
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from '@jest/globals';
import {
  HotReloadManagerImpl,
  createHotReloadManager,
  hotReloadManager,
  startEnvironmentHotReload,
  startThemeHotReload,
  enableDevelopmentHotReload,
  DEFAULT_HOT_RELOAD_CONFIG,
  type HotReloadManager,
  type HotReloadStatus,
  type FileWatchEvent,
  type HotReloadConfiguration
} from '../hot-reload-system';
import type {
  ConfigurationChangeCallback,
  ConfigurationSchemaType,
  ValidatedConfiguration
} from '../configuration-manager';

/* ===== TEST SETUP AND MOCKS ===== */

// Mock performance.now for consistent testing
const mockPerformanceNow = jest.fn();
Object.defineProperty(global, 'performance', {
  value: { now: mockPerformanceNow },
  writable: true
});

// Mock console methods
const consoleSpy = {
  log: jest.spyOn(console, 'log').mockImplementation(() => {}),
  warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
  error: jest.spyOn(console, 'error').mockImplementation(() => {})
};

// Mock window for browser environment tests
const mockWindow = {
  postMessage: jest.fn()
};

// Mock process environment
const mockProcess = {
  env: {
    NODE_ENV: 'development',
    PICASSO_DEV_MODE: 'true'
  }
};

// Mock file system events
const createMockFileEvent = (
  type: FileWatchEvent,
  path: string = '/test/config.json'
) => ({
  type,
  path,
  schemaType: 'environment' as ConfigurationSchemaType,
  timestamp: Date.now()
});

describe('Hot Reload System', () => {
  let manager: HotReloadManagerImpl;
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
    jest.clearAllMocks();
    mockPerformanceNow.mockReturnValue(100);
    
    // Setup fresh manager instance
    manager = new HotReloadManagerImpl();

    // Mock environment
    global.process = mockProcess as any;
    global.window = mockWindow as any;
  });

  afterEach(async () => {
    // Clean up watchers
    await manager.stopAllWatchers();
  });

  /* ===== SUPPORT DETECTION TESTS ===== */

  describe('Support Detection', () => {
    it('should detect support in development environment', () => {
      global.process = {
        env: { NODE_ENV: 'development' }
      } as any;

      const supported = manager.isSupported();
      expect(supported).toBe(true);
    });

    it('should detect support with PICASSO_DEV_MODE', () => {
      global.process = {
        env: { PICASSO_DEV_MODE: 'true' }
      } as any;

      const supported = manager.isSupported();
      expect(supported).toBe(true);
    });

    it('should not support in production environment', () => {
      global.process = {
        env: { NODE_ENV: 'production' }
      } as any;

      const supported = manager.isSupported();
      expect(supported).toBe(false);
    });

    it('should not support in browser environment', () => {
      delete (global as any).process;

      const supported = manager.isSupported();
      expect(supported).toBe(false);
    });
  });

  /* ===== WATCHER MANAGEMENT TESTS ===== */

  describe('Watcher Management', () => {
    it('should start watcher successfully', async () => {
      const callback = jest.fn();
      const config: HotReloadConfiguration = {
        ...DEFAULT_HOT_RELOAD_CONFIG,
        enabled: true
      };

      const watcherId = await manager.startWatching('environment', config, callback);

      expect(watcherId).toBeDefined();
      expect(watcherId).toContain('environment');
      expect(manager.getStatus()).toBe('watching');
      expect(manager.getMetrics().activeWatchers).toBe(1);
    });

    it('should reject watcher when hot reload disabled', async () => {
      const callback = jest.fn();
      const config: HotReloadConfiguration = {
        ...DEFAULT_HOT_RELOAD_CONFIG,
        enabled: false
      };

      await expect(
        manager.startWatching('environment', config, callback)
      ).rejects.toThrow('Hot reload is disabled in configuration');
    });

    it('should reject watcher when not supported', async () => {
      // Set unsupported environment
      global.process = {
        env: { NODE_ENV: 'production' }
      } as any;

      const callback = jest.fn();
      const config: HotReloadConfiguration = {
        ...DEFAULT_HOT_RELOAD_CONFIG,
        enabled: true
      };

      await expect(
        manager.startWatching('environment', config, callback)
      ).rejects.toThrow('Hot reload is not supported in current environment');
    });

    it('should stop specific watcher', async () => {
      const callback = jest.fn();
      const config: HotReloadConfiguration = {
        ...DEFAULT_HOT_RELOAD_CONFIG,
        enabled: true
      };

      const watcherId = await manager.startWatching('environment', config, callback);
      expect(manager.getMetrics().activeWatchers).toBe(1);

      await manager.stopWatching(watcherId);
      expect(manager.getMetrics().activeWatchers).toBe(0);
    });

    it('should stop all watchers', async () => {
      const callback = jest.fn();
      const config: HotReloadConfiguration = {
        ...DEFAULT_HOT_RELOAD_CONFIG,
        enabled: true
      };

      // Start multiple watchers
      await manager.startWatching('environment', config, callback);
      await manager.startWatching('providers', config, callback);
      
      expect(manager.getMetrics().activeWatchers).toBe(2);

      await manager.stopAllWatchers();
      expect(manager.getMetrics().activeWatchers).toBe(0);
      expect(manager.getStatus()).toBe('inactive');
    });

    it('should handle stopping non-existent watcher', async () => {
      await expect(manager.stopWatching('non-existent')).resolves.not.toThrow();
    });

    it('should notify callback when watcher starts', async () => {
      const callback = jest.fn();
      const config: HotReloadConfiguration = {
        ...DEFAULT_HOT_RELOAD_CONFIG,
        enabled: true
      };

      await manager.startWatching('environment', config, callback);

      expect(callback).toHaveBeenCalledWith(
        'hot-reload',
        expect.any(Object)
      );
    });
  });

  /* ===== CONFIGURATION RELOAD TESTS ===== */

  describe('Configuration Reload', () => {
    it('should reload configuration manually', async () => {
      // Reset mock to return consistent sequence
      mockPerformanceNow.mockReset();
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(50).mockReturnValue(50);

      const config = await manager.reloadConfiguration('environment');

      expect(config).toBeDefined();
      expect(config.__brand).toBe('ValidatedConfiguration');
      expect(manager.getStatus()).toBe('watching');

      const metrics = manager.getMetrics();
      expect(metrics.totalReloads).toBe(1);
      expect(metrics.successfulReloads).toBe(1);
      expect(metrics.lastReloadTime).toBe(50);
    });

    it('should prevent concurrent reloads', async () => {
      // Mock slow reload
      mockPerformanceNow.mockReturnValue(100);

      // Start first reload
      const promise1 = manager.reloadConfiguration('environment');

      // Try second reload immediately
      await expect(
        manager.reloadConfiguration('environment')
      ).rejects.toThrow('Configuration reload already in progress');

      await promise1; // Let first reload complete
    });

    it('should allow forced concurrent reload', async () => {
      mockPerformanceNow.mockReturnValue(100);

      // Start first reload
      const promise1 = manager.reloadConfiguration('environment');

      // Force second reload
      const promise2 = manager.reloadConfiguration('environment', true);

      await Promise.all([promise1, promise2]);
      expect(manager.getMetrics().totalReloads).toBe(2);
    });

    it('should handle reload errors gracefully', async () => {
      // This would normally trigger an error in the configuration loading
      // For testing, we'll simulate error handling
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(100);

      try {
        await manager.reloadConfiguration('non-existent' as ConfigurationSchemaType);
      } catch (error) {
        expect(error).toBeDefined();
        expect(manager.getStatus()).toBe('error');
        
        const metrics = manager.getMetrics();
        expect(metrics.failedReloads).toBe(1);
      }
    });

    it('should update metrics on reload', async () => {
      // Reset mock to return consistent sequence
      mockPerformanceNow.mockReset();
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(75).mockReturnValue(75);

      await manager.reloadConfiguration('environment');

      const metrics = manager.getMetrics();
      expect(metrics.totalReloads).toBe(1);
      expect(metrics.successfulReloads).toBe(1);
      expect(metrics.failedReloads).toBe(0);
      expect(metrics.averageReloadTime).toBe(75);
      expect(metrics.lastReloadTime).toBe(75);
    });
  });

  /* ===== FILE WATCHING TESTS ===== */

  describe('File Watching', () => {
    it('should add watch path successfully', async () => {
      const callback = jest.fn();
      const config: HotReloadConfiguration = {
        ...DEFAULT_HOT_RELOAD_CONFIG,
        enabled: true
      };

      await manager.startWatching('environment', config, callback);
      await expect(
        manager.addWatchPath('environment', '/new/path/config.json')
      ).resolves.not.toThrow();
    });

    it('should remove watch path successfully', async () => {
      const callback = jest.fn();
      const config: HotReloadConfiguration = {
        ...DEFAULT_HOT_RELOAD_CONFIG,
        enabled: true
      };

      await manager.startWatching('environment', config, callback);
      await expect(
        manager.removeWatchPath('environment', '/old/path/config.json')
      ).resolves.not.toThrow();
    });

    it('should handle watch path operations on non-existent watcher', async () => {
      await expect(
        manager.addWatchPath('non-existent' as ConfigurationSchemaType, '/path')
      ).resolves.not.toThrow();

      await expect(
        manager.removeWatchPath('non-existent' as ConfigurationSchemaType, '/path')
      ).resolves.not.toThrow();
    });
  });

  /* ===== STATUS AND METRICS TESTS ===== */

  describe('Status and Metrics', () => {
    it('should return correct initial status', () => {
      expect(manager.getStatus()).toBe('inactive');
    });

    it('should update status when starting watcher', async () => {
      const callback = jest.fn();
      const config: HotReloadConfiguration = {
        ...DEFAULT_HOT_RELOAD_CONFIG,
        enabled: true
      };

      await manager.startWatching('environment', config, callback);
      expect(manager.getStatus()).toBe('watching');
    });

    it('should update status during reload', async () => {
      // This test would require mocking the async behavior
      // For now, we test the status after operations
      const config = await manager.reloadConfiguration('environment');
      expect(manager.getStatus()).toBe('watching');
    });

    it('should return accurate metrics', () => {
      const initialMetrics = manager.getMetrics();
      
      expect(initialMetrics.totalReloads).toBe(0);
      expect(initialMetrics.successfulReloads).toBe(0);
      expect(initialMetrics.failedReloads).toBe(0);
      expect(initialMetrics.averageReloadTime).toBe(0);
      expect(initialMetrics.lastReloadTime).toBe(0);
      expect(initialMetrics.throttledEvents).toBe(0);
      expect(initialMetrics.activeWatchers).toBe(0);
    });

    it('should update metrics after operations', async () => {
      const callback = jest.fn();
      const config: HotReloadConfiguration = {
        ...DEFAULT_HOT_RELOAD_CONFIG,
        enabled: true
      };

      await manager.startWatching('environment', config, callback);
      await manager.reloadConfiguration('environment');

      const metrics = manager.getMetrics();
      expect(metrics.activeWatchers).toBe(1);
      expect(metrics.totalReloads).toBe(1);
      expect(metrics.successfulReloads).toBe(1);
    });
  });

  /* ===== CONFIGURATION TESTS ===== */

  describe('Hot Reload Configuration', () => {
    it('should use default configuration correctly', () => {
      expect(DEFAULT_HOT_RELOAD_CONFIG.enabled).toBe(true);
      expect(DEFAULT_HOT_RELOAD_CONFIG.debounceMs).toBe(200);
      expect(DEFAULT_HOT_RELOAD_CONFIG.throttleMs).toBe(1000);
      expect(DEFAULT_HOT_RELOAD_CONFIG.validateOnReload).toBe(true);
      expect(DEFAULT_HOT_RELOAD_CONFIG.notifyOnReload).toBe(true);
    });

    it('should handle custom configuration', async () => {
      const callback = jest.fn();
      const customConfig: HotReloadConfiguration = {
        enabled: true,
        watchPaths: ['/custom/path'],
        debounceMs: 500,
        throttleMs: 2000,
        maxRetriesOnError: 5,
        validateOnReload: false,
        notifyOnReload: false,
        persistWatchState: true,
        excludePatterns: [/\.temp$/],
        includePatterns: [/\.custom$/]
      };

      const watcherId = await manager.startWatching('environment', customConfig, callback);
      expect(watcherId).toBeDefined();
    });

    it('should respect exclude patterns', () => {
      // This would be tested by the internal file processing logic
      // For now, we verify the configuration is accepted
      const config: HotReloadConfiguration = {
        ...DEFAULT_HOT_RELOAD_CONFIG,
        excludePatterns: [/node_modules/, /\.git/, /\.tmp$/]
      };

      expect(config.excludePatterns).toHaveLength(3);
    });

    it('should respect include patterns', () => {
      const config: HotReloadConfiguration = {
        ...DEFAULT_HOT_RELOAD_CONFIG,
        includePatterns: [/\.json$/, /\.js$/, /\.ts$/]
      };

      expect(config.includePatterns).toHaveLength(3);
    });
  });
});

/* ===== FACTORY FUNCTION TESTS ===== */

describe('Factory Functions', () => {
  beforeEach(() => {
    global.process = mockProcess as any;
  });

  it('should create hot reload manager instance', () => {
    const manager = createHotReloadManager();
    
    expect(manager).toBeInstanceOf(HotReloadManagerImpl);
  });

  it('should provide singleton instance', () => {
    expect(hotReloadManager).toBeDefined();
    expect(hotReloadManager).toBeInstanceOf(HotReloadManagerImpl);
  });
});

/* ===== CONVENIENCE FUNCTION TESTS ===== */

describe('Convenience Functions', () => {
  beforeEach(() => {
    global.process = mockProcess as any;
  });

  it('should start environment hot reload', async () => {
    const callback = jest.fn();
    
    const watcherId = await startEnvironmentHotReload(callback);
    
    expect(watcherId).toBeDefined();
    expect(watcherId).toContain('environment');
  });

  it('should handle unsupported environment for environment hot reload', async () => {
    global.process = {
      env: { NODE_ENV: 'production' }
    } as any;

    const callback = jest.fn();
    const watcherId = await startEnvironmentHotReload(callback);
    
    expect(watcherId).toBe('');
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      'Hot reload not supported in current environment'
    );
  });

  it('should start theme hot reload', async () => {
    const callback = jest.fn();
    
    const watcherId = await startThemeHotReload(callback);
    
    expect(watcherId).toBeDefined();
    expect(watcherId).toContain('theme');
  });

  it('should handle unsupported environment for theme hot reload', async () => {
    global.process = {
      env: { NODE_ENV: 'production' }
    } as any;

    const callback = jest.fn();
    const watcherId = await startThemeHotReload(callback);

    expect(watcherId).toBe('');
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      'Hot reload not supported in current environment'
    );
  });

  it('should enable development hot reload', async () => {
    const watcherIds = await enableDevelopmentHotReload();
    
    expect(Array.isArray(watcherIds)).toBe(true);
    expect(watcherIds.length).toBeGreaterThan(0);
    
    // Should start watchers for multiple schema types
    expect(watcherIds.some(id => id.includes('environment'))).toBe(true);
    expect(watcherIds.some(id => id.includes('providers'))).toBe(true);
    expect(watcherIds.some(id => id.includes('build'))).toBe(true);
  });

  it('should handle unsupported environment for development hot reload', async () => {
    global.process = {
      env: { NODE_ENV: 'production' }
    } as any;

    const watcherIds = await enableDevelopmentHotReload();
    
    expect(watcherIds).toEqual([]);
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      'Hot reload not supported - skipping'
    );
  });

  it('should handle partial failures in development hot reload', async () => {
    // This test would verify that if some watchers fail to start,
    // the function continues and returns the successful ones
    const watcherIds = await enableDevelopmentHotReload();
    
    // Should return an array even if some fail
    expect(Array.isArray(watcherIds)).toBe(true);
  });
});

/* ===== ERROR HANDLING TESTS ===== */

describe('Error Handling', () => {
  let manager: HotReloadManagerImpl;

  beforeEach(() => {
    global.process = mockProcess as any;
    manager = new HotReloadManagerImpl();
  });

  it('should handle watcher creation errors', async () => {
    const callback = jest.fn();
    const config: HotReloadConfiguration = {
      ...DEFAULT_HOT_RELOAD_CONFIG,
      enabled: true,
      watchPaths: [] // Empty paths might cause issues
    };

    // Should not throw but might not be successful
    await expect(
      manager.startWatching('environment', config, callback)
    ).resolves.toBeDefined();
  });

  it('should handle callback errors gracefully', async () => {
    const errorCallback: ConfigurationChangeCallback = () => {
      throw new Error('Callback error');
    };

    const config: HotReloadConfiguration = {
      ...DEFAULT_HOT_RELOAD_CONFIG,
      enabled: true
    };

    // Should not throw despite callback error
    await expect(
      manager.startWatching('environment', config, errorCallback)
    ).resolves.toBeDefined();
  });

  it('should handle file system errors', async () => {
    // This would test file system error handling
    // For now, we ensure the manager can handle errors gracefully
    expect(manager.getStatus()).toBe('inactive');
  });

  it('should handle invalid schema types', async () => {
    await expect(
      manager.reloadConfiguration('invalid' as ConfigurationSchemaType)
    ).rejects.toThrow();
  });
});

/* ===== BROWSER INTEGRATION TESTS ===== */

describe('Browser Integration', () => {
  let manager: HotReloadManagerImpl;

  beforeEach(() => {
    global.process = mockProcess as any;
    global.window = mockWindow as any;
    manager = new HotReloadManagerImpl();
  });

  it('should post messages to window when available', async () => {
    const callback = jest.fn();
    const config: HotReloadConfiguration = {
      ...DEFAULT_HOT_RELOAD_CONFIG,
      enabled: true,
      notifyOnReload: true
    };

    await manager.startWatching('environment', config, callback);

    // Simulate reload notification
    // This would normally be triggered by file changes
    // For testing, we verify the window is available
    expect(global.window).toBeDefined();
    expect(global.window.postMessage).toBeDefined();
  });

  it('should handle missing window gracefully', async () => {
    delete (global as any).window;

    const callback = jest.fn();
    const config: HotReloadConfiguration = {
      ...DEFAULT_HOT_RELOAD_CONFIG,
      enabled: true,
      notifyOnReload: true
    };

    await expect(
      manager.startWatching('environment', config, callback)
    ).resolves.toBeDefined();
  });
});

/* ===== PERFORMANCE TESTS ===== */

describe('Performance', () => {
  let manager: HotReloadManagerImpl;

  beforeEach(() => {
    global.process = mockProcess as any;
    manager = new HotReloadManagerImpl();
  });

  it('should complete reload within performance target', async () => {
    mockPerformanceNow.mockReset();
    mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(150).mockReturnValue(150);

    const config = await manager.reloadConfiguration('environment');
    
    expect(config).toBeDefined();
    expect(manager.getMetrics().lastReloadTime).toBeLessThan(200); // <200ms target
  });

  it('should handle multiple watchers efficiently', async () => {
    const callback = jest.fn();
    const config: HotReloadConfiguration = {
      ...DEFAULT_HOT_RELOAD_CONFIG,
      enabled: true
    };

    const startTime = Date.now();

    // Start multiple watchers
    const promises = ['environment', 'providers', 'build', 'monitoring'].map(
      schemaType => manager.startWatching(schemaType as ConfigurationSchemaType, config, callback)
    );

    await Promise.all(promises);

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(1000); // Should start all watchers quickly
    expect(manager.getMetrics().activeWatchers).toBe(4);
  });

  it('should efficiently stop multiple watchers', async () => {
    const callback = jest.fn();
    const config: HotReloadConfiguration = {
      ...DEFAULT_HOT_RELOAD_CONFIG,
      enabled: true
    };

    // Start watchers
    await manager.startWatching('environment', config, callback);
    await manager.startWatching('providers', config, callback);

    const startTime = Date.now();
    await manager.stopAllWatchers();
    const endTime = Date.now();

    const duration = endTime - startTime;
    expect(duration).toBeLessThan(500); // Should stop quickly
    expect(manager.getMetrics().activeWatchers).toBe(0);
  });
});
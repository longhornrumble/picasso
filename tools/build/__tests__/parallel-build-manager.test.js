/**
 * Comprehensive Tests for Parallel Build Manager - BERS Phase 3, Task 3.1
 * 
 * This test suite validates the advanced parallel build system including:
 * - Multi-environment parallel builds
 * - Worker thread utilization and management
 * - Intelligent build caching with dependency detection
 * - Build performance monitoring and metrics
 * - Error handling and timeout management
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS) - Test Engineer
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { promises as fs } from 'fs';
import { Worker } from 'worker_threads';
import { ParallelBuildManager, buildAllEnvironments, buildEnvironment } from '../parallel-build-manager.js';

// Mock dependencies
vi.mock('worker_threads', async () => {
  const actual = await vi.importActual('worker_threads');
  return {
    ...actual,
    Worker: vi.fn().mockImplementation(() => ({
      postMessage: vi.fn(),
      terminate: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      removeAllListeners: vi.fn()
    }))
  };
});

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('path', async () => {
  const actual = await vi.importActual('path');
  return {
    ...actual,
    join: vi.fn((...args) => args.join('/')),
    dirname: vi.fn((path) => path.split('/').slice(0, -1).join('/')),
    relative: vi.fn((from, to) => to.replace(from, '').replace(/^\//, ''))
  };
});

describe('ParallelBuildManager', () => {
  let buildManager;
  let mockWorker;
  let mockFs;
  
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup mock worker
    mockWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      removeAllListeners: vi.fn()
    };
    
    Worker.mockImplementation(() => mockWorker);
    
    // Setup mock fs
    mockFs = {
      mkdir: fs.mkdir,
      readFile: fs.readFile,
      writeFile: fs.writeFile,
      readdir: fs.readdir,
      stat: fs.stat,
      unlink: fs.unlink
    };
    
    // Create build manager with test config
    buildManager = new ParallelBuildManager({
      environments: ['development', 'staging', 'production'],
      maxWorkers: 2,
      enableCaching: true,
      buildTimeoutMs: 5000,
      enableCompression: false
    });
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor and Configuration', () => {
    test('should initialize with default configuration', () => {
      const manager = new ParallelBuildManager();
      
      expect(manager.config.environments).toEqual(['development', 'staging', 'production']);
      expect(manager.config.maxWorkers).toBeLessThanOrEqual(4);
      expect(manager.config.enableCaching).toBe(true);
      expect(manager.config.buildTimeoutMs).toBe(30000);
    });
    
    test('should merge custom configuration with defaults', () => {
      const customConfig = {
        maxWorkers: 6,
        enableCaching: false,
        buildTimeoutMs: 60000
      };
      
      const manager = new ParallelBuildManager(customConfig);
      
      expect(manager.config.maxWorkers).toBe(6);
      expect(manager.config.enableCaching).toBe(false);
      expect(manager.config.buildTimeoutMs).toBe(60000);
      expect(manager.config.environments).toEqual(['development', 'staging', 'production']);
    });
    
    test('should initialize cache directory', async () => {
      fs.mkdir.mockResolvedValue(undefined);
      
      const manager = new ParallelBuildManager();
      await manager.initializeCache();
      
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('.bers-cache/builds'),
        { recursive: true }
      );
    });
  });

  describe('Build Context Management', () => {
    test('should create build context with unique ID', async () => {
      const environments = ['development', 'staging'];
      
      const buildContext = await buildManager.buildAllEnvironments(environments);
      
      expect(buildContext.id).toMatch(/^build-\d+-[a-z0-9]+$/);
      expect(buildContext.startTime).toBeInstanceOf(Date);
      expect(buildContext.results).toBeInstanceOf(Map);
      expect(buildContext.results.size).toBe(2);
    });
    
    test('should initialize environment results correctly', async () => {
      fs.readFile.mockRejectedValue(new Error('Cache miss'));
      Worker.mockImplementation(() => ({
        ...mockWorker,
        on: vi.fn((event, callback) => {
          if (event === 'message') {
            setTimeout(() => callback({
              success: true,
              environment: 'development',
              duration: 100,
              assets: { total: 1000 }
            }), 10);
          }
        })
      }));
      
      const buildContext = await buildManager.buildAllEnvironments(['development']);
      const devResult = buildContext.results.get('development');
      
      expect(devResult).toMatchObject({
        environment: 'development',
        status: 'success',
        outputDir: 'dist-development',
        errors: [],
        fromCache: false
      });
    });
  });

  describe('Caching System', () => {
    test('should generate cache key based on configuration and dependencies', async () => {
      fs.readFile.mockImplementation((path) => {
        if (path.includes('package.json')) {
          return Promise.resolve(JSON.stringify({
            dependencies: { react: '^18.0.0' },
            devDependencies: { vite: '^4.0.0' }
          }));
        }
        if (path.includes('development.json')) {
          return Promise.resolve(JSON.stringify({ env: 'development' }));
        }
        return Promise.reject(new Error('File not found'));
      });
      
      fs.readdir.mockResolvedValue([]);
      
      const cacheKey = await buildManager.generateCacheKey('development');
      
      expect(cacheKey).toMatch(/^[a-f0-9]{64}$/);
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('package.json'),
        'utf8'
      );
    });
    
    test('should serve builds from cache when available', async () => {
      const cachedBuild = {
        environment: 'development',
        cacheKey: 'test-cache-key',
        timestamp: Date.now(),
        assets: { total: 1000 }
      };
      
      fs.readFile.mockImplementation((path) => {
        if (path.includes('package.json')) {
          return Promise.resolve(JSON.stringify({
            dependencies: {},
            devDependencies: {}
          }));
        }
        if (path.includes('.json') && path.includes('.bers-cache')) {
          return Promise.resolve(JSON.stringify(cachedBuild));
        }
        return Promise.reject(new Error('File not found'));
      });
      
      fs.readdir.mockResolvedValue([]);
      
      // Mock cache key generation to match cached build
      vi.spyOn(buildManager, 'generateCacheKey').mockResolvedValue('test-cache-key');
      vi.spyOn(buildManager, 'isCacheValid').mockResolvedValue(true);
      
      const buildContext = await buildManager.buildAllEnvironments(['development']);
      const devResult = buildContext.results.get('development');
      
      expect(devResult.status).toBe('cached');
      expect(devResult.fromCache).toBe(true);
      expect(buildContext.metrics.cacheHitRate).toBe(100);
    });
    
    test('should cache successful builds', async () => {
      const mockResult = {
        status: 'success',
        fromCache: false,
        assets: { total: 5000 },
        duration: 250
      };
      
      buildManager.buildContext = {
        id: 'test-build-123',
        results: new Map([['development', mockResult]])
      };
      
      fs.readFile.mockResolvedValue(JSON.stringify({
        dependencies: {},
        devDependencies: {}
      }));
      
      fs.readdir.mockResolvedValue([]);
      vi.spyOn(buildManager, 'generateCacheKey').mockResolvedValue('test-key');
      
      await buildManager.cacheSuccessfulBuilds();
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('development-test-key.json'),
        expect.stringContaining('"buildId":"test-build-123"')
      );
    });
    
    test('should clean up old cache entries', async () => {
      const oldTime = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
      
      fs.readdir.mockResolvedValue(['old-cache.json', 'new-cache.json']);
      fs.stat.mockImplementation((path) => ({
        mtime: new Date(path.includes('old') ? oldTime : Date.now())
      }));
      
      await buildManager.cleanupOldCaches();
      
      expect(fs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('old-cache.json')
      );
      expect(fs.unlink).not.toHaveBeenCalledWith(
        expect.stringContaining('new-cache.json')
      );
    });
  });

  describe('Worker Pool Management', () => {
    test('should create worker pool with specified size', async () => {
      await buildManager.createWorkerPool();
      
      expect(buildManager.workers.size).toBe(2); // maxWorkers = 2 in test config
      
      for (const [id, worker] of buildManager.workers) {
        expect(id).toMatch(/^worker-\d+$/);
        expect(worker).toMatchObject({
          id,
          thread: null,
          busy: false,
          environment: null
        });
      }
    });
    
    test('should allocate and release workers correctly', async () => {
      await buildManager.createWorkerPool();
      
      const worker = await buildManager.getAvailableWorker();
      expect(worker.busy).toBe(true);
      
      buildManager.releaseWorker(worker);
      expect(worker.busy).toBe(false);
      expect(worker.environment).toBeNull();
    });
    
    test('should wait for available worker when pool is full', async () => {
      buildManager.config.maxWorkers = 1;
      await buildManager.createWorkerPool();
      
      const worker1Promise = buildManager.getAvailableWorker();
      const worker1 = await worker1Promise;
      
      const worker2Promise = buildManager.getAvailableWorker();
      
      // Release first worker after a delay
      setTimeout(() => buildManager.releaseWorker(worker1), 50);
      
      const worker2 = await worker2Promise;
      expect(worker2).toBeDefined();
    });
    
    test('should cleanup workers properly', async () => {
      await buildManager.createWorkerPool();
      
      // Simulate active workers
      for (const worker of buildManager.workers.values()) {
        worker.thread = mockWorker;
      }
      
      await buildManager.cleanupWorkers();
      
      expect(mockWorker.terminate).toHaveBeenCalledTimes(2);
      expect(buildManager.workers.size).toBe(0);
    });
  });

  describe('Build Execution', () => {
    test('should execute build in worker thread', async () => {
      const mockBuildResult = {
        success: true,
        environment: 'development',
        duration: 150,
        assets: { total: 2000, js: [], css: [] }
      };
      
      Worker.mockImplementation(() => ({
        ...mockWorker,
        on: vi.fn((event, callback) => {
          if (event === 'message') {
            setTimeout(() => callback(mockBuildResult), 10);
          }
        })
      }));
      
      await buildManager.createWorkerPool();
      const worker = await buildManager.getAvailableWorker();
      
      const result = await buildManager.executeBuildInWorker(worker, 'development');
      
      expect(Worker).toHaveBeenCalledWith(
        expect.stringContaining('build-worker.js'),
        {
          workerData: {
            environment: 'development',
            config: expect.any(Object),
            projectRoot: process.cwd(),
            outputDir: 'dist-development'
          }
        }
      );
      
      expect(result).toEqual(mockBuildResult);
    });
    
    test('should handle worker timeout', async () => {
      Worker.mockImplementation(() => ({
        ...mockWorker,
        on: vi.fn(), // No message sent = timeout
        terminate: vi.fn().mockResolvedValue(undefined)
      }));
      
      buildManager.config.buildTimeoutMs = 100;
      await buildManager.createWorkerPool();
      const worker = await buildManager.getAvailableWorker();
      
      await expect(
        buildManager.executeBuildInWorker(worker, 'development')
      ).rejects.toThrow(/Build timeout for development/);
    });
    
    test('should handle worker errors', async () => {
      const testError = new Error('Worker build failed');
      
      Worker.mockImplementation(() => ({
        ...mockWorker,
        on: vi.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(testError), 10);
          }
        })
      }));
      
      await buildManager.createWorkerPool();
      const worker = await buildManager.getAvailableWorker();
      
      await expect(
        buildManager.executeBuildInWorker(worker, 'development')
      ).rejects.toThrow('Worker build failed');
    });
  });

  describe('Performance Metrics', () => {
    test('should calculate parallel efficiency correctly', async () => {
      // Mock successful builds
      const mockResults = new Map([
        ['development', { status: 'success', duration: 100, fromCache: false }],
        ['staging', { status: 'success', duration: 150, fromCache: false }],
        ['production', { status: 'success', duration: 200, fromCache: false }]
      ]);
      
      buildManager.buildContext = {
        results: mockResults,
        metrics: {
          totalStartTime: 0,
          totalEndTime: 250 // Total parallel time: 250ms
        }
      };
      
      buildManager.finalizeBuildMetrics();
      
      // Sequential time: 100 + 150 + 200 = 450ms
      // Parallel time: 250ms
      // Efficiency: (450 / 250) * 100 = 180%, capped at 100%
      expect(buildManager.buildContext.metrics.parallelEfficiency).toBe(100);
    });
    
    test('should calculate cache hit rate correctly', async () => {
      const mockResults = new Map([
        ['development', { fromCache: true }],
        ['staging', { fromCache: false }],
        ['production', { fromCache: true }]
      ]);
      
      buildManager.buildContext = {
        results: mockResults,
        metrics: { totalStartTime: 0, totalEndTime: 100 }
      };
      
      buildManager.finalizeBuildMetrics();
      
      // 2 cached out of 3 total = 66.7%
      expect(buildManager.buildContext.metrics.cacheHitRate).toBeCloseTo(66.7, 1);
    });
  });

  describe('Source File Analysis', () => {
    test('should get source file hashes for cache invalidation', async () => {
      const mockFiles = [
        '/src/components/App.jsx',
        '/src/utils/helper.js',
        '/src/styles/main.css'
      ];
      
      fs.readdir.mockResolvedValue([
        { name: 'components', isDirectory: () => true, isFile: () => false },
        { name: 'utils', isDirectory: () => true, isFile: () => false },
        { name: 'main.css', isDirectory: () => false, isFile: () => true }
      ]);
      
      fs.readFile.mockImplementation((path) => {
        if (path.includes('App.jsx')) return Promise.resolve('export default App;');
        if (path.includes('helper.js')) return Promise.resolve('export const helper = () => {};');
        if (path.includes('main.css')) return Promise.resolve('body { margin: 0; }');
        return Promise.reject(new Error('File not found'));
      });
      
      // Mock recursive directory traversal
      vi.spyOn(buildManager, 'getAllSourceFiles').mockResolvedValue(mockFiles);
      
      const hashes = await buildManager.getSourceFileHashes();
      
      expect(Object.keys(hashes)).toHaveLength(3);
      expect(hashes['src/components/App.jsx']).toMatch(/^[a-f0-9]{32}$/);
      expect(hashes['src/utils/helper.js']).toMatch(/^[a-f0-9]{32}$/);
      expect(hashes['src/styles/main.css']).toMatch(/^[a-f0-9]{32}$/);
    });
    
    test('should identify source files correctly', () => {
      expect(buildManager.isSourceFile('App.jsx')).toBe(true);
      expect(buildManager.isSourceFile('helper.ts')).toBe(true);
      expect(buildManager.isSourceFile('styles.css')).toBe(true);
      expect(buildManager.isSourceFile('config.json')).toBe(true);
      expect(buildManager.isSourceFile('index.html')).toBe(true);
      
      expect(buildManager.isSourceFile('README.md')).toBe(false);
      expect(buildManager.isSourceFile('package-lock.json')).toBe(false);
      expect(buildManager.isSourceFile('.gitignore')).toBe(false);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle cache initialization failure gracefully', async () => {
      fs.mkdir.mockRejectedValue(new Error('Permission denied'));
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await buildManager.initializeCache();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize build cache:'),
        'Permission denied'
      );
    });
    
    test('should handle package.json read failure in cache key generation', async () => {
      fs.readFile.mockImplementation((path) => {
        if (path.includes('package.json')) {
          return Promise.reject(new Error('File not found'));
        }
        return Promise.resolve('{}');
      });
      
      fs.readdir.mockResolvedValue([]);
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const cacheKey = await buildManager.generateCacheKey('development');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read package.json for cache key:'),
        'File not found'
      );
      expect(cacheKey).toMatch(/^[a-f0-9]{64}$/);
    });
    
    test('should handle empty environments array', async () => {
      const buildContext = await buildManager.buildAllEnvironments([]);
      
      expect(buildContext.results.size).toBe(0);
      expect(buildContext.metrics.cacheHitRate).toBe(0);
    });
    
    test('should handle build failures in individual environments', async () => {
      Worker.mockImplementation(() => ({
        ...mockWorker,
        on: vi.fn((event, callback) => {
          if (event === 'message') {
            setTimeout(() => callback({
              success: false,
              environment: 'development',
              error: 'Build compilation failed'
            }), 10);
          }
        })
      }));
      
      fs.readFile.mockRejectedValue(new Error('Cache miss'));
      
      await expect(
        buildManager.buildAllEnvironments(['development'])
      ).rejects.toThrow();
    });
  });

  describe('Integration Tests', () => {
    test('should complete full build cycle with multiple environments', async () => {
      // Mock cache misses
      fs.readFile.mockImplementation((path) => {
        if (path.includes('package.json')) {
          return Promise.resolve(JSON.stringify({
            dependencies: { react: '^18.0.0' },
            devDependencies: { vite: '^4.0.0' }
          }));
        }
        if (path.includes('.bers-cache')) {
          return Promise.reject(new Error('Cache miss'));
        }
        return Promise.resolve('{}');
      });
      
      fs.readdir.mockResolvedValue([]);
      
      // Mock successful worker builds
      Worker.mockImplementation(() => ({
        ...mockWorker,
        on: vi.fn((event, callback) => {
          if (event === 'message') {
            setTimeout(() => callback({
              success: true,
              environment: 'test-env',
              duration: 100,
              assets: { total: 1000, js: [], css: [] }
            }), 10);
          }
        })
      }));
      
      const environments = ['development', 'staging'];
      const buildContext = await buildManager.buildAllEnvironments(environments);
      
      expect(buildContext.results.size).toBe(2);
      expect(buildContext.metrics.totalDuration).toBeGreaterThan(0);
      expect(buildContext.metrics.parallelEfficiency).toBeGreaterThan(0);
      
      // Verify caching was attempted
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });
});

describe('Convenience Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('buildAllEnvironments should create manager and execute build', async () => {
    const mockBuildContext = {
      id: 'test-build',
      results: new Map(),
      metrics: {}
    };
    
    vi.spyOn(ParallelBuildManager.prototype, 'buildAllEnvironments')
      .mockResolvedValue(mockBuildContext);
    
    const result = await buildAllEnvironments(['development'], { maxWorkers: 2 });
    
    expect(result).toBe(mockBuildContext);
  });
  
  test('buildEnvironment should build single environment', async () => {
    const mockBuildContext = {
      id: 'test-build',
      results: new Map([['production', { status: 'success' }]]),
      metrics: {}
    };
    
    vi.spyOn(ParallelBuildManager.prototype, 'buildAllEnvironments')
      .mockResolvedValue(mockBuildContext);
    
    const result = await buildEnvironment('production', { enableCaching: false });
    
    expect(result).toBe(mockBuildContext);
    expect(ParallelBuildManager.prototype.buildAllEnvironments)
      .toHaveBeenCalledWith(['production']);
  });
});
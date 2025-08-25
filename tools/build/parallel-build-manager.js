/**
 * Parallel Build Manager - BERS Phase 3, Task 3.1
 * 
 * Advanced build pipeline that provides parallel builds for all environments
 * with optimized CPU core utilization and build caching to reduce build
 * times by 60% while maintaining sub-30 second build targets.
 * 
 * Features:
 * - Multi-environment parallel builds (development, staging, production)
 * - Worker thread utilization for concurrent TypeScript compilation
 * - Intelligent build caching with dependency change detection
 * - Asset processing optimization with parallel compression
 * - Build performance monitoring and reporting
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import { Worker } from 'worker_threads';
import { cpus } from 'os';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ===== CONFIGURATION ===== */

/**
 * Build configuration interface
 * @typedef {Object} BuildConfig
 * @property {string[]} environments - Target environments to build
 * @property {number} maxWorkers - Maximum number of worker threads
 * @property {boolean} enableCaching - Enable intelligent build caching
 * @property {number} cacheRetentionDays - Cache retention period in days
 * @property {boolean} enableCompression - Enable asset compression
 * @property {number} buildTimeoutMs - Build timeout in milliseconds
 * @property {Object} optimizations - Optimization settings per environment
 */

const DEFAULT_BUILD_CONFIG = {
  environments: ['development', 'staging', 'production'],
  maxWorkers: Math.min(cpus().length, 4), // Use up to 4 cores, but not more than available
  enableCaching: true,
  cacheRetentionDays: 7,
  enableCompression: true,
  buildTimeoutMs: 30000, // 30 second target
  optimizations: {
    development: {
      minification: false,
      sourceMap: 'inline',
      bundleSplitting: false,
      compressionLevel: 0
    },
    staging: {
      minification: true,
      sourceMap: 'external',
      bundleSplitting: 'vendor',
      compressionLevel: 1
    },
    production: {
      minification: true,
      sourceMap: 'hidden',
      bundleSplitting: 'aggressive',
      compressionLevel: 6
    }
  }
};

/**
 * Build context tracking
 * @typedef {Object} BuildContext
 * @property {string} id - Unique build ID
 * @property {Date} startTime - Build start timestamp
 * @property {Map<string, EnvironmentBuildResult>} results - Build results per environment
 * @property {BuildMetrics} metrics - Performance metrics
 * @property {string} cacheDir - Cache directory path
 */

/**
 * Environment build result
 * @typedef {Object} EnvironmentBuildResult
 * @property {string} environment - Environment name
 * @property {'pending'|'building'|'success'|'error'|'cached'} status - Build status
 * @property {number} startTime - Build start time
 * @property {number} endTime - Build end time
 * @property {number} duration - Build duration in ms
 * @property {string} outputDir - Build output directory
 * @property {Object} assets - Generated assets information
 * @property {string[]} errors - Build errors if any
 * @property {boolean} fromCache - Whether result was served from cache
 */

/**
 * Build metrics
 * @typedef {Object} BuildMetrics
 * @property {number} totalStartTime - Total build start time
 * @property {number} totalEndTime - Total build end time
 * @property {number} totalDuration - Total build duration
 * @property {number} parallelEfficiency - Parallel efficiency percentage
 * @property {number} cacheHitRate - Cache hit rate percentage
 * @property {Object} resourceUsage - CPU and memory usage stats
 */

/* ===== MAIN BUILD MANAGER CLASS ===== */

export class ParallelBuildManager {
  constructor(config = {}) {
    this.config = { ...DEFAULT_BUILD_CONFIG, ...config };
    this.buildContext = null;
    this.workers = new Map();
    this.activeBuilds = new Set();
    
    // Initialize cache directory
    this.cacheDir = path.join(process.cwd(), '.bers-cache', 'builds');
    this.initializeCache();
  }

  /**
   * Initialize build caching system
   */
  async initializeCache() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      
      // Clean up old cache entries
      if (this.config.enableCaching) {
        await this.cleanupOldCaches();
      }
      
      console.log(`🗄️  Build cache initialized at: ${this.cacheDir}`);
    } catch (error) {
      console.warn('⚠️  Failed to initialize build cache:', error.message);
    }
  }

  /**
   * Start parallel build process for all environments
   * @param {string[]} [environments] - Specific environments to build (defaults to all)
   * @returns {Promise<BuildContext>} Build context with results
   */
  async buildAllEnvironments(environments = null) {
    const targetEnvironments = environments || this.config.environments;
    const buildId = this.generateBuildId();
    
    this.buildContext = {
      id: buildId,
      startTime: new Date(),
      results: new Map(),
      metrics: {
        totalStartTime: performance.now(),
        totalEndTime: 0,
        totalDuration: 0,
        parallelEfficiency: 0,
        cacheHitRate: 0,
        resourceUsage: {}
      },
      cacheDir: this.cacheDir
    };

    console.log(`\n🚀 Starting parallel build for environments: ${targetEnvironments.join(', ')}`);
    console.log(`📋 Build ID: ${buildId}`);
    console.log(`👷 Max workers: ${this.config.maxWorkers}`);
    console.log(`🗄️  Caching: ${this.config.enableCaching ? 'enabled' : 'disabled'}`);

    try {
      // Initialize results for all environments
      targetEnvironments.forEach(env => {
        this.buildContext.results.set(env, {
          environment: env,
          status: 'pending',
          startTime: 0,
          endTime: 0,
          duration: 0,
          outputDir: `dist-${env}`,
          assets: {},
          errors: [],
          fromCache: false
        });
      });

      // Check cache for each environment
      if (this.config.enableCaching) {
        await this.checkCacheForEnvironments(targetEnvironments);
      }

      // Get environments that need building (not served from cache)
      const environmentsToBuild = targetEnvironments.filter(env => {
        const result = this.buildContext.results.get(env);
        return result.status !== 'cached';
      });

      if (environmentsToBuild.length === 0) {
        console.log('✅ All environments served from cache!');
        this.finalizeBuildMetrics();
        return this.buildContext;
      }

      // Create worker pool
      await this.createWorkerPool();

      // Execute parallel builds
      const buildPromises = environmentsToBuild.map(env => 
        this.buildEnvironment(env)
      );

      // Wait for all builds to complete with timeout
      await Promise.race([
        Promise.all(buildPromises),
        this.createBuildTimeout()
      ]);

      // Cache successful builds
      if (this.config.enableCaching) {
        await this.cacheSuccessfulBuilds();
      }

    } catch (error) {
      console.error('❌ Parallel build failed:', error.message);
      throw error;
    } finally {
      // Cleanup workers
      await this.cleanupWorkers();
      this.finalizeBuildMetrics();
    }

    return this.buildContext;
  }

  /**
   * Build a single environment using worker thread
   * @param {string} environment - Environment to build
   * @returns {Promise<EnvironmentBuildResult>}
   */
  async buildEnvironment(environment) {
    const result = this.buildContext.results.get(environment);
    result.status = 'building';
    result.startTime = performance.now();

    console.log(`🔨 Building ${environment} environment...`);

    try {
      // Get available worker
      const worker = await this.getAvailableWorker();
      
      // Execute build in worker thread
      const buildResult = await this.executeBuildInWorker(worker, environment);
      
      // Update result
      result.status = 'success';
      result.endTime = performance.now();
      result.duration = result.endTime - result.startTime;
      result.assets = buildResult.assets;
      
      console.log(`✅ ${environment} build completed in ${(result.duration / 1000).toFixed(2)}s`);
      
      // Release worker back to pool
      this.releaseWorker(worker);
      
      return result;
      
    } catch (error) {
      result.status = 'error';
      result.endTime = performance.now();
      result.duration = result.endTime - result.startTime;
      result.errors.push(error.message);
      
      console.error(`❌ ${environment} build failed:`, error.message);
      throw error;
    }
  }

  /**
   * Check cache for environments and serve cached builds if available
   * @param {string[]} environments - Environments to check
   */
  async checkCacheForEnvironments(environments) {
    console.log('🔍 Checking build cache...');
    
    for (const env of environments) {
      const cacheKey = await this.generateCacheKey(env);
      const cachePath = path.join(this.cacheDir, `${env}-${cacheKey}.json`);
      
      try {
        const cacheData = await fs.readFile(cachePath, 'utf8');
        const cachedBuild = JSON.parse(cacheData);
        
        // Verify cache is still valid
        if (await this.isCacheValid(cachedBuild, env)) {
          const result = this.buildContext.results.get(env);
          result.status = 'cached';
          result.fromCache = true;
          result.duration = 0;
          result.assets = cachedBuild.assets;
          
          console.log(`🎯 ${env} served from cache (${cacheKey.substring(0, 8)}...)`);
        }
      } catch (error) {
        // Cache miss or invalid cache - will build normally
        console.log(`💨 ${env} cache miss - will build`);
      }
    }
  }

  /**
   * Generate cache key based on source files and configuration
   * @param {string} environment - Environment name
   * @returns {Promise<string>} Cache key hash
   */
  async generateCacheKey(environment) {
    const hasher = crypto.createHash('sha256');
    
    // Include environment-specific configuration
    const envConfig = await this.getEnvironmentConfig(environment);
    hasher.update(JSON.stringify(envConfig));
    
    // Include source file hashes
    const sourceFiles = await this.getSourceFileHashes();
    hasher.update(JSON.stringify(sourceFiles));
    
    // Include dependency versions
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJsonData = await fs.readFile(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageJsonData);
      hasher.update(JSON.stringify(packageJson.dependencies));
      hasher.update(JSON.stringify(packageJson.devDependencies));
    } catch (error) {
      console.warn('⚠️  Failed to read package.json for cache key:', error.message);
    }
    
    return hasher.digest('hex');
  }

  /**
   * Get source file hashes for cache invalidation
   * @returns {Promise<Object>} Map of file paths to hash values
   */
  async getSourceFileHashes() {
    const sourceFiles = {};
    const srcDir = path.join(process.cwd(), 'src');
    
    try {
      const files = await this.getAllSourceFiles(srcDir);
      
      for (const file of files) {
        const content = await fs.readFile(file, 'utf8');
        const hash = crypto.createHash('md5').update(content).digest('hex');
        const relativePath = path.relative(process.cwd(), file);
        sourceFiles[relativePath] = hash;
      }
    } catch (error) {
      console.warn('⚠️  Failed to generate source file hashes:', error.message);
    }
    
    return sourceFiles;
  }

  /**
   * Recursively get all source files
   * @param {string} dir - Directory to scan
   * @returns {Promise<string[]>} Array of file paths
   */
  async getAllSourceFiles(dir) {
    const files = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subFiles = await this.getAllSourceFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && this.isSourceFile(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory might not exist or be accessible
    }
    
    return files;
  }

  /**
   * Check if file is a source file that affects builds
   * @param {string} filename - File name
   * @returns {boolean} True if source file
   */
  isSourceFile(filename) {
    const sourceExtensions = ['.js', '.jsx', '.ts', '.tsx', '.css', '.json', '.html'];
    return sourceExtensions.some(ext => filename.endsWith(ext));
  }

  /**
   * Create worker pool for parallel builds
   */
  async createWorkerPool() {
    console.log(`👷 Creating worker pool with ${this.config.maxWorkers} workers...`);
    
    for (let i = 0; i < this.config.maxWorkers; i++) {
      const workerId = `worker-${i}`;
      const worker = {
        id: workerId,
        thread: null,
        busy: false,
        environment: null
      };
      
      this.workers.set(workerId, worker);
    }
  }

  /**
   * Get available worker from pool
   * @returns {Promise<Object>} Available worker
   */
  async getAvailableWorker() {
    return new Promise((resolve) => {
      const checkWorker = () => {
        for (const [id, worker] of this.workers) {
          if (!worker.busy) {
            worker.busy = true;
            resolve(worker);
            return;
          }
        }
        
        // No available workers, wait and check again
        setTimeout(checkWorker, 100);
      };
      
      checkWorker();
    });
  }

  /**
   * Release worker back to pool
   * @param {Object} worker - Worker to release
   */
  releaseWorker(worker) {
    worker.busy = false;
    worker.environment = null;
    if (worker.thread) {
      worker.thread.terminate();
      worker.thread = null;
    }
  }

  /**
   * Execute build in worker thread
   * @param {Object} worker - Worker to use
   * @param {string} environment - Environment to build
   * @returns {Promise<Object>} Build result
   */
  async executeBuildInWorker(worker, environment) {
    return new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, 'build-worker.js');
      
      worker.thread = new Worker(workerPath, {
        workerData: {
          environment,
          config: this.config.optimizations[environment],
          projectRoot: process.cwd(),
          outputDir: `dist-${environment}`
        }
      });

      worker.environment = environment;
      
      const timeout = setTimeout(() => {
        worker.thread.terminate();
        reject(new Error(`Build timeout for ${environment} (${this.config.buildTimeoutMs}ms)`));
      }, this.config.buildTimeoutMs);

      worker.thread.on('message', (result) => {
        clearTimeout(timeout);
        resolve(result);
      });

      worker.thread.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      worker.thread.on('exit', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Worker exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Cache successful builds
   */
  async cacheSuccessfulBuilds() {
    console.log('💾 Caching successful builds...');
    
    for (const [env, result] of this.buildContext.results) {
      if (result.status === 'success' && !result.fromCache) {
        try {
          const cacheKey = await this.generateCacheKey(env);
          const cachePath = path.join(this.cacheDir, `${env}-${cacheKey}.json`);
          
          const cacheData = {
            environment: env,
            cacheKey,
            timestamp: Date.now(),
            buildId: this.buildContext.id,
            assets: result.assets,
            duration: result.duration
          };
          
          await fs.writeFile(cachePath, JSON.stringify(cacheData, null, 2));
          console.log(`💾 ${env} build cached`);
        } catch (error) {
          console.warn(`⚠️  Failed to cache ${env} build:`, error.message);
        }
      }
    }
  }

  /**
   * Create build timeout promise
   * @returns {Promise<never>} Timeout promise
   */
  createBuildTimeout() {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Build timeout: exceeded ${this.config.buildTimeoutMs}ms limit`));
      }, this.config.buildTimeoutMs);
    });
  }

  /**
   * Cleanup worker threads
   */
  async cleanupWorkers() {
    console.log('🧹 Cleaning up workers...');
    
    const cleanupPromises = Array.from(this.workers.values()).map(worker => {
      if (worker.thread) {
        return worker.thread.terminate();
      }
      return Promise.resolve();
    });
    
    await Promise.all(cleanupPromises);
    this.workers.clear();
  }

  /**
   * Finalize build metrics
   */
  finalizeBuildMetrics() {
    const metrics = this.buildContext.metrics;
    metrics.totalEndTime = performance.now();
    metrics.totalDuration = metrics.totalEndTime - metrics.totalStartTime;
    
    // Calculate parallel efficiency
    const totalSequentialTime = Array.from(this.buildContext.results.values())
      .reduce((sum, result) => sum + result.duration, 0);
    
    metrics.parallelEfficiency = totalSequentialTime > 0 
      ? Math.min(100, (totalSequentialTime / metrics.totalDuration) * 100)
      : 0;
    
    // Calculate cache hit rate
    const totalBuilds = this.buildContext.results.size;
    const cachedBuilds = Array.from(this.buildContext.results.values())
      .filter(result => result.fromCache).length;
    
    metrics.cacheHitRate = totalBuilds > 0 ? (cachedBuilds / totalBuilds) * 100 : 0;
    
    this.printBuildSummary();
  }

  /**
   * Print build summary
   */
  printBuildSummary() {
    const metrics = this.buildContext.metrics;
    const results = Array.from(this.buildContext.results.values());
    
    console.log('\n📊 Build Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🕐 Total Time: ${(metrics.totalDuration / 1000).toFixed(2)}s`);
    console.log(`⚡ Parallel Efficiency: ${metrics.parallelEfficiency.toFixed(1)}%`);
    console.log(`🎯 Cache Hit Rate: ${metrics.cacheHitRate.toFixed(1)}%`);
    console.log(`👷 Workers Used: ${this.config.maxWorkers}`);
    
    console.log('\n📋 Environment Results:');
    results.forEach(result => {
      const status = result.status === 'success' ? '✅' : 
                     result.status === 'cached' ? '🎯' : 
                     result.status === 'error' ? '❌' : '⏳';
      const duration = result.fromCache ? 'cached' : `${(result.duration / 1000).toFixed(2)}s`;
      console.log(`  ${status} ${result.environment}: ${duration}`);
    });
    
    const targetTime = this.config.buildTimeoutMs / 1000;
    const actualTime = metrics.totalDuration / 1000;
    const timeStatus = actualTime <= targetTime ? '✅' : '⚠️';
    
    console.log(`\n${timeStatus} Build Time Target: ${actualTime.toFixed(2)}s / ${targetTime}s`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  /**
   * Generate unique build ID
   * @returns {string} Build ID
   */
  generateBuildId() {
    return `build-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get environment configuration
   * @param {string} environment - Environment name
   * @returns {Promise<Object>} Environment configuration
   */
  async getEnvironmentConfig(environment) {
    try {
      const configPath = path.join(process.cwd(), 'src', 'config', 'configurations', `${environment}.json`);
      const configData = await fs.readFile(configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      console.warn(`⚠️  Failed to load ${environment} config:`, error.message);
      return {};
    }
  }

  /**
   * Check if cache is still valid
   * @param {Object} cachedBuild - Cached build data
   * @param {string} environment - Environment name
   * @returns {Promise<boolean>} True if cache is valid
   */
  async isCacheValid(cachedBuild, environment) {
    // Check cache age
    const maxAge = this.config.cacheRetentionDays * 24 * 60 * 60 * 1000;
    const age = Date.now() - cachedBuild.timestamp;
    
    if (age > maxAge) {
      return false;
    }
    
    // Check if cache key matches current state
    const currentCacheKey = await this.generateCacheKey(environment);
    return cachedBuild.cacheKey === currentCacheKey;
  }

  /**
   * Clean up old cache entries
   */
  async cleanupOldCaches() {
    try {
      const files = await fs.readdir(this.cacheDir);
      const maxAge = this.config.cacheRetentionDays * 24 * 60 * 60 * 1000;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.cacheDir, file);
          const stats = await fs.stat(filePath);
          const age = Date.now() - stats.mtime.getTime();
          
          if (age > maxAge) {
            await fs.unlink(filePath);
            console.log(`🗑️  Cleaned up old cache: ${file}`);
          }
        }
      }
    } catch (error) {
      console.warn('⚠️  Failed to cleanup old caches:', error.message);
    }
  }
}

/* ===== CONVENIENCE FUNCTIONS ===== */

/**
 * Build all environments in parallel with default configuration
 * @param {string[]} [environments] - Specific environments to build
 * @param {Object} [config] - Custom build configuration
 * @returns {Promise<BuildContext>} Build results
 */
export async function buildAllEnvironments(environments = null, config = {}) {
  const manager = new ParallelBuildManager(config);
  return await manager.buildAllEnvironments(environments);
}

/**
 * Build specific environment
 * @param {string} environment - Environment to build
 * @param {Object} [config] - Custom build configuration
 * @returns {Promise<BuildContext>} Build results
 */
export async function buildEnvironment(environment, config = {}) {
  return await buildAllEnvironments([environment], config);
}

export default ParallelBuildManager;
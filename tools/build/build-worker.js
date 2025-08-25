/**
 * Build Worker - BERS Phase 3, Task 3.1
 * 
 * Worker thread implementation for parallel environment builds.
 * Each worker handles a single environment build with optimized
 * resource utilization and concurrent TypeScript compilation.
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import { parentPort, workerData } from 'worker_threads';
import { build } from 'vite';
import path from 'path';
import fs from 'fs/promises';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/* ===== WORKER CONFIGURATION ===== */

const { environment, config, projectRoot, outputDir } = workerData;

/* ===== MAIN WORKER FUNCTION ===== */

async function buildEnvironment() {
  const startTime = performance.now();
  
  try {
    console.log(`🔨 Worker building ${environment} environment...`);
    
    // Load Vite config dynamically for this environment
    const viteConfig = await loadViteConfig(environment);
    
    // Execute Vite build
    const buildResult = await build({
      ...viteConfig,
      mode: environment,
      build: {
        ...viteConfig.build,
        outDir: path.join(projectRoot, outputDir),
        emptyOutDir: true,
        // Worker-specific optimizations
        rollupOptions: {
          ...viteConfig.build?.rollupOptions,
          // Enable parallel processing in worker
          external: (id) => {
            // Externalize large dependencies for faster builds
            if (id.includes('node_modules/react-dom') && environment === 'development') {
              return true;
            }
            return false;
          }
        }
      },
      // Environment-specific optimizations from config
      define: {
        ...viteConfig.define,
        __WORKER_BUILD__: JSON.stringify(true),
        __BUILD_WORKER_ID__: JSON.stringify(process.pid),
        __ENVIRONMENT__: JSON.stringify(environment)
      }
    });
    
    // Analyze build output
    const assets = await analyzeAssets(path.join(projectRoot, outputDir));
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Send success result back to main thread
    parentPort.postMessage({
      success: true,
      environment,
      duration,
      assets,
      buildResult: {
        output: buildResult?.output || [],
        size: calculateTotalSize(assets)
      }
    });
    
    console.log(`✅ Worker completed ${environment} in ${(duration / 1000).toFixed(2)}s`);
    
  } catch (error) {
    console.error(`❌ Worker failed for ${environment}:`, error.message);
    
    // Send error result back to main thread
    parentPort.postMessage({
      success: false,
      environment,
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Load Vite configuration for specific environment
 * @param {string} environment - Target environment
 * @returns {Promise<Object>} Vite configuration
 */
async function loadViteConfig(environment) {
  try {
    // Import the main Vite config
    const configModule = await import(path.join(projectRoot, 'vite.config.js'));
    const configFactory = configModule.default;
    
    // Generate config for this environment
    const viteConfig = await configFactory({ 
      command: 'build', 
      mode: environment 
    });
    
    // Apply worker-specific optimizations
    return applyWorkerOptimizations(viteConfig, environment);
    
  } catch (error) {
    console.error(`Failed to load Vite config for ${environment}:`, error);
    throw error;
  }
}

/**
 * Apply worker-specific optimizations to Vite config
 * @param {Object} viteConfig - Base Vite configuration
 * @param {string} environment - Target environment
 * @returns {Object} Optimized Vite configuration
 */
function applyWorkerOptimizations(viteConfig, environment) {
  const optimizedConfig = { ...viteConfig };
  
  // Apply environment-specific optimizations from worker config
  if (config.minification !== undefined) {
    optimizedConfig.build = optimizedConfig.build || {};
    optimizedConfig.build.minify = config.minification ? 'terser' : false;
  }
  
  if (config.sourceMap) {
    optimizedConfig.build = optimizedConfig.build || {};
    optimizedConfig.build.sourcemap = config.sourceMap;
  }
  
  // Optimize for parallel builds
  optimizedConfig.build = optimizedConfig.build || {};
  optimizedConfig.build.target = environment === 'development' ? 'esnext' : 'es2015';
  
  // Configure bundle splitting based on environment
  if (config.bundleSplitting && optimizedConfig.build.rollupOptions) {
    optimizedConfig.build.rollupOptions.output = optimizedConfig.build.rollupOptions.output || {};
    
    if (config.bundleSplitting === 'aggressive') {
      optimizedConfig.build.rollupOptions.output.manualChunks = (id) => {
        if (id.includes('node_modules/react')) return 'react';
        if (id.includes('node_modules/marked')) return 'markdown';
        if (id.includes('node_modules/dompurify')) return 'sanitizer';
        if (id.includes('node_modules')) return 'vendor';
        if (id.includes('src/components')) return 'components';
        if (id.includes('src/providers')) return 'providers';
      };
    } else if (config.bundleSplitting === 'vendor') {
      optimizedConfig.build.rollupOptions.output.manualChunks = (id) => {
        if (id.includes('node_modules')) return 'vendor';
      };
    }
  }
  
  // Worker-specific performance optimizations
  optimizedConfig.build.reportCompressedSize = false; // Skip compression reporting for speed
  optimizedConfig.build.write = true; // Ensure files are written
  
  return optimizedConfig;
}

/**
 * Analyze build assets and collect metrics
 * @param {string} outputDir - Build output directory
 * @returns {Promise<Object>} Asset analysis results
 */
async function analyzeAssets(outputDir) {
  const assets = {
    js: [],
    css: [],
    html: [],
    other: [],
    total: 0,
    sizes: {}
  };
  
  try {
    const files = await getFilesRecursive(outputDir);
    
    for (const file of files) {
      const stats = await fs.stat(file);
      const relativePath = path.relative(outputDir, file);
      const ext = path.extname(file).toLowerCase();
      
      const assetInfo = {
        path: relativePath,
        size: stats.size,
        type: getAssetType(ext)
      };
      
      // Categorize assets
      if (ext === '.js') {
        assets.js.push(assetInfo);
      } else if (ext === '.css') {
        assets.css.push(assetInfo);
      } else if (ext === '.html') {
        assets.html.push(assetInfo);
      } else {
        assets.other.push(assetInfo);
      }
      
      assets.total += stats.size;
      assets.sizes[relativePath] = stats.size;
    }
    
    // Sort by size for analysis
    assets.js.sort((a, b) => b.size - a.size);
    assets.css.sort((a, b) => b.size - a.size);
    
  } catch (error) {
    console.warn(`Failed to analyze assets in ${outputDir}:`, error.message);
  }
  
  return assets;
}

/**
 * Get all files recursively from directory
 * @param {string} dir - Directory to scan
 * @returns {Promise<string[]>} Array of file paths
 */
async function getFilesRecursive(dir) {
  const files = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await getFilesRecursive(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory might not exist or be accessible
  }
  
  return files;
}

/**
 * Get asset type from file extension
 * @param {string} ext - File extension
 * @returns {string} Asset type
 */
function getAssetType(ext) {
  switch (ext) {
    case '.js': return 'javascript';
    case '.css': return 'stylesheet';
    case '.html': return 'html';
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.gif':
    case '.webp':
    case '.svg': return 'image';
    case '.woff':
    case '.woff2':
    case '.ttf':
    case '.eot': return 'font';
    default: return 'other';
  }
}

/**
 * Calculate total size of all assets
 * @param {Object} assets - Assets analysis object
 * @returns {number} Total size in bytes
 */
function calculateTotalSize(assets) {
  return assets.total || 0;
}

/* ===== START WORKER ===== */

// Start the build process
buildEnvironment().catch(error => {
  console.error('Worker fatal error:', error);
  process.exit(1);
});
#!/usr/bin/env node
/**
 * Parallel Build CLI - BERS Phase 3, Task 3.1
 * 
 * Command-line interface for parallel multi-environment builds
 * using the ParallelBuildManager system.
 * 
 * Usage:
 *   node tools/build/build-parallel.js
 *   node tools/build/build-parallel.js --environments=production
 *   node tools/build/build-parallel.js --environments=development,staging,production
 *   node tools/build/build-parallel.js --no-cache
 *   node tools/build/build-parallel.js --workers=2
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import { ParallelBuildManager } from './parallel-build-manager.js';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ===== CLI CONFIGURATION ===== */

const CLI_OPTIONS = {
  environments: 'development,staging,production',
  workers: 'auto',
  cache: true,
  timeout: 30000,
  verbose: false,
  help: false
};

/* ===== MAIN CLI FUNCTION ===== */

async function main() {
  try {
    // Parse command line arguments
    const options = parseArguments();
    
    // Show help if requested
    if (options.help) {
      showHelp();
      process.exit(0);
    }
    
    // Parse environments
    const environments = options.environments 
      ? options.environments.split(',').map(env => env.trim())
      : ['development', 'staging', 'production'];
    
    // Parse worker count
    const maxWorkers = options.workers === 'auto' 
      ? Math.min(os.cpus().length, 4)
      : parseInt(options.workers, 10);
    
    console.log('🚀 BERS Parallel Build CLI');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📋 Environments: ${environments.join(', ')}`);
    console.log(`👷 Max Workers: ${maxWorkers}`);
    console.log(`🗄️  Caching: ${options.cache ? 'enabled' : 'disabled'}`);
    console.log(`⏱️  Timeout: ${options.timeout / 1000}s`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Create parallel build manager
    const buildManager = new ParallelBuildManager({
      environments,
      maxWorkers,
      enableCaching: options.cache,
      buildTimeoutMs: options.timeout,
      enableCompression: true
    });
    
    // Execute parallel builds
    const startTime = Date.now();
    const buildContext = await buildManager.buildAllEnvironments(environments);
    const totalTime = Date.now() - startTime;
    
    // Print final summary
    console.log('🎯 Final Build Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`⏱️  Total Time: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`🎯 Target Met: ${totalTime <= options.timeout ? '✅' : '❌'}`);
    console.log(`🏗️  Build ID: ${buildContext.id}`);
    
    // Environment results
    console.log('\n📋 Environment Results:');
    Array.from(buildContext.results.entries()).forEach(([env, result]) => {
      const status = result.status === 'success' ? '✅' : 
                     result.status === 'cached' ? '🎯' : 
                     result.status === 'error' ? '❌' : '⏳';
      const duration = result.fromCache ? 'cached' : `${(result.duration / 1000).toFixed(2)}s`;
      console.log(`  ${status} ${env}: ${duration}`);
      
      if (result.errors.length > 0) {
        result.errors.forEach(error => {
          console.log(`    ❌ ${error}`);
        });
      }
    });
    
    // Performance metrics
    const metrics = buildContext.metrics;
    console.log('\n📊 Performance Metrics:');
    console.log(`  Parallel Efficiency: ${metrics.parallelEfficiency.toFixed(1)}%`);
    console.log(`  Cache Hit Rate: ${metrics.cacheHitRate.toFixed(1)}%`);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Check for any failures
    const hasFailures = Array.from(buildContext.results.values()).some(result => result.status === 'error');
    
    if (hasFailures) {
      console.error('❌ Some builds failed. Check the logs above for details.');
      process.exit(1);
    } else {
      console.log('✅ All builds completed successfully!');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ Parallel build failed:', error.message);
    if (process.env.NODE_ENV === 'development' || CLI_OPTIONS.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/* ===== HELPER FUNCTIONS ===== */

/**
 * Parse command line arguments
 * @returns {Object} Parsed options
 */
function parseArguments() {
  const args = process.argv.slice(2);
  const options = { ...CLI_OPTIONS };
  
  for (const arg of args) {
    if (arg.startsWith('--environments=')) {
      options.environments = arg.split('=')[1];
    } else if (arg.startsWith('--workers=')) {
      options.workers = arg.split('=')[1];
    } else if (arg.startsWith('--timeout=')) {
      options.timeout = parseInt(arg.split('=')[1], 10) * 1000; // Convert to ms
    } else if (arg === '--no-cache') {
      options.cache = false;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }
  
  return options;
}

/**
 * Show CLI help
 */
function showHelp() {
  console.log(`
🚀 BERS Parallel Build CLI

Usage:
  node tools/build/build-parallel.js [options]

Options:
  --environments=<list>    Comma-separated list of environments to build
                          Default: development,staging,production
                          
  --workers=<number>       Number of worker threads to use
                          Default: auto (CPU cores, max 4)
                          
  --timeout=<seconds>      Build timeout in seconds
                          Default: 30
                          
  --no-cache              Disable build caching
                          Default: caching enabled
                          
  --verbose, -v           Enable verbose output
                          
  --help, -h              Show this help message

Examples:
  # Build all environments in parallel
  node tools/build/build-parallel.js
  
  # Build only production
  node tools/build/build-parallel.js --environments=production
  
  # Build with 2 workers and no cache
  node tools/build/build-parallel.js --workers=2 --no-cache
  
  # Build with 60 second timeout
  node tools/build/build-parallel.js --timeout=60
  
Environment Variables:
  NODE_ENV               Node environment (development, staging, production)
  BERS_BUILD_CACHE_DIR   Custom cache directory path
  BERS_BUILD_WORKERS     Default number of workers
  
Build Outputs:
  dist-development/      Development build output
  dist-staging/          Staging build output  
  dist-production/       Production build output
  .bers-cache/          Build cache directory
`);
}

/* ===== EXECUTE CLI ===== */

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ CLI execution failed:', error);
    process.exit(1);
  });
}
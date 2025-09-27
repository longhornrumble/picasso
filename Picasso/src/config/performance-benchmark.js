/**
 * Performance Benchmark Script for BERS Infrastructure Audit
 * 
 * Measures existing environment.js system performance across:
 * - Environment detection speed
 * - Configuration loading times
 * - Memory usage patterns
 * - Caching effectiveness
 */

import { performance } from 'perf_hooks';
import { config } from './environment.js';

// Performance metrics collector
class PerformanceCollector {
  constructor() {
    this.metrics = {
      environmentDetection: [],
      configurationLoading: [],
      urlGeneration: [],
      validation: [],
      memory: {
        initial: 0,
        peak: 0,
        final: 0
      }
    };
  }

  startMemoryTracking() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      this.metrics.memory.initial = process.memoryUsage().heapUsed;
    }
  }

  recordMemoryPeak() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const current = process.memoryUsage().heapUsed;
      this.metrics.memory.peak = Math.max(this.metrics.memory.peak, current);
    }
  }

  endMemoryTracking() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      this.metrics.memory.final = process.memoryUsage().heapUsed;
    }
  }

  recordMetric(category, duration, metadata = {}) {
    this.metrics[category].push({
      duration,
      timestamp: Date.now(),
      ...metadata
    });
  }

  getStats(category) {
    const measurements = this.metrics[category];
    if (measurements.length === 0) return null;

    const durations = measurements.map(m => m.duration);
    const sorted = durations.sort((a, b) => a - b);
    
    return {
      count: measurements.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  generateReport() {
    const report = {
      summary: {},
      details: this.metrics,
      memory: this.metrics.memory,
      timestamp: new Date().toISOString()
    };

    // Calculate summary statistics
    Object.keys(this.metrics).forEach(category => {
      if (category !== 'memory') {
        report.summary[category] = this.getStats(category);
      }
    });

    return report;
  }
}

// Benchmark functions
async function benchmarkEnvironmentDetection(collector, iterations = 1000) {
  console.log(`\n🔍 Benchmarking Environment Detection (${iterations} iterations)`);
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    
    // Simulate environment detection process
    const env = config.ENVIRONMENT;
    const isDev = config.isDevelopment();
    const isStaging = config.isStaging();
    const isProd = config.isProduction();
    
    const end = performance.now();
    collector.recordMetric('environmentDetection', end - start, {
      environment: env,
      detectionMethods: 4
    });
    
    collector.recordMemoryPeak();
    
    // Add small delay to avoid overwhelming the system
    if (i % 100 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }
}

async function benchmarkConfigurationLoading(collector, iterations = 500) {
  console.log(`\n📋 Benchmarking Configuration Loading (${iterations} iterations)`);
  
  const testTenantHashes = [
    'my87674d777bf9',
    'staging_test_hash',
    'test_tenant_123',
    'prod_tenant_456'
  ];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    
    try {
      // Test various configuration methods
      const tenantHash = testTenantHashes[i % testTenantHashes.length];
      
      const configUrl = config.getConfigUrl(tenantHash);
      const chatUrl = config.getChatUrl(tenantHash);
      const assetUrl = config.getAssetUrl('test-asset.png');
      const tenantAssetUrl = config.getTenantAssetUrl(tenantHash, 'logo.png');
      const streamingUrl = config.getStreamingUrl(tenantHash);
      
      const end = performance.now();
      collector.recordMetric('configurationLoading', end - start, {
        tenantHash,
        urlsGenerated: 5
      });
      
    } catch (error) {
      const end = performance.now();
      collector.recordMetric('configurationLoading', end - start, {
        error: error.message,
        failed: true
      });
    }
    
    collector.recordMemoryPeak();
    
    if (i % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }
}

async function benchmarkUrlGeneration(collector, iterations = 2000) {
  console.log(`\n🔗 Benchmarking URL Generation (${iterations} iterations)`);
  
  const testPaths = [
    'assets/logo.png',
    'styles/theme.css',
    'scripts/widget.js',
    'images/avatar.jpg',
    'fonts/roboto.woff2'
  ];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    
    try {
      const path = testPaths[i % testPaths.length];
      const assetUrl = config.getAssetUrl(path);
      const legacyUrl = config.getLegacyS3Url('test_tenant', path);
      
      const end = performance.now();
      collector.recordMetric('urlGeneration', end - start, {
        path,
        urlsGenerated: 2
      });
      
    } catch (error) {
      const end = performance.now();
      collector.recordMetric('urlGeneration', end - start, {
        error: error.message,
        failed: true
      });
    }
    
    collector.recordMemoryPeak();
  }
}

async function benchmarkValidation(collector, iterations = 300) {
  console.log(`\n✅ Benchmarking Validation Logic (${iterations} iterations)`);
  
  const testConfigs = [
    { features: { streaming_enabled: true } },
    { features: { jwt_streaming: true } },
    { features: { streaming: false } },
    { features: { experimental: true } },
    null
  ];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    
    try {
      const tenantConfig = testConfigs[i % testConfigs.length];
      
      const streamingEnabled = config.isStreamingEnabled(tenantConfig);
      const jwtStreamingEnabled = config.isJWTStreamingEnabled(tenantConfig);
      const buildInfo = config.getBuildInfo();
      const requestConfig = config.getRequestConfig();
      
      const end = performance.now();
      collector.recordMetric('validation', end - start, {
        streamingEnabled,
        jwtStreamingEnabled,
        validationChecks: 4
      });
      
    } catch (error) {
      const end = performance.now();
      collector.recordMetric('validation', end - start, {
        error: error.message,
        failed: true
      });
    }
    
    collector.recordMemoryPeak();
    
    if (i % 30 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }
}

// Main benchmark runner
async function runPerformanceBenchmark() {
  console.log('🚀 Starting BERS Infrastructure Performance Benchmark');
  console.log('='.repeat(60));
  
  const collector = new PerformanceCollector();
  collector.startMemoryTracking();
  
  const overallStart = performance.now();
  
  try {
    // Run all benchmarks
    await benchmarkEnvironmentDetection(collector, 1000);
    await benchmarkConfigurationLoading(collector, 500);
    await benchmarkUrlGeneration(collector, 2000);
    await benchmarkValidation(collector, 300);
    
    const overallEnd = performance.now();
    collector.endMemoryTracking();
    
    // Generate comprehensive report
    const report = collector.generateReport();
    report.overallDuration = overallEnd - overallStart;
    
    console.log('\n📊 PERFORMANCE BENCHMARK RESULTS');
    console.log('='.repeat(60));
    
    // Print summary statistics
    Object.entries(report.summary).forEach(([category, stats]) => {
      if (stats) {
        console.log(`\n${category.toUpperCase()}:`);
        console.log(`  Operations: ${stats.count}`);
        console.log(`  Average:    ${stats.avg.toFixed(3)}ms`);
        console.log(`  Median:     ${stats.median.toFixed(3)}ms`);
        console.log(`  Min:        ${stats.min.toFixed(3)}ms`);
        console.log(`  Max:        ${stats.max.toFixed(3)}ms`);
        console.log(`  P95:        ${stats.p95.toFixed(3)}ms`);
        console.log(`  P99:        ${stats.p99.toFixed(3)}ms`);
      }
    });
    
    // Memory usage
    console.log('\nMEMORY USAGE:');
    console.log(`  Initial:    ${(report.memory.initial / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Peak:       ${(report.memory.peak / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Final:      ${(report.memory.final / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Growth:     ${((report.memory.final - report.memory.initial) / 1024 / 1024).toFixed(2)} MB`);
    
    console.log(`\nOVERALL BENCHMARK DURATION: ${report.overallDuration.toFixed(2)}ms`);
    
    // Performance analysis
    console.log('\n🎯 PERFORMANCE ANALYSIS:');
    analyzePerformance(report);
    
    return report;
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    throw error;
  }
}

function analyzePerformance(report) {
  const { summary } = report;
  
  // Environment detection analysis
  if (summary.environmentDetection) {
    const envStats = summary.environmentDetection;
    if (envStats.avg < 1) {
      console.log('  ✅ Environment detection is EXCELLENT (< 1ms average)');
    } else if (envStats.avg < 5) {
      console.log('  ✅ Environment detection is GOOD (< 5ms average)');
    } else {
      console.log('  ⚠️  Environment detection is SLOW (> 5ms average)');
    }
  }
  
  // Configuration loading analysis
  if (summary.configurationLoading) {
    const configStats = summary.configurationLoading;
    if (configStats.avg < 2) {
      console.log('  ✅ Configuration loading is EXCELLENT (< 2ms average)');
    } else if (configStats.avg < 10) {
      console.log('  ✅ Configuration loading is GOOD (< 10ms average)');
    } else {
      console.log('  ⚠️  Configuration loading is SLOW (> 10ms average)');
    }
  }
  
  // URL generation analysis
  if (summary.urlGeneration) {
    const urlStats = summary.urlGeneration;
    if (urlStats.avg < 0.5) {
      console.log('  ✅ URL generation is EXCELLENT (< 0.5ms average)');
    } else if (urlStats.avg < 2) {
      console.log('  ✅ URL generation is GOOD (< 2ms average)');
    } else {
      console.log('  ⚠️  URL generation is SLOW (> 2ms average)');
    }
  }
  
  // Memory analysis
  const memoryGrowth = (report.memory.final - report.memory.initial) / 1024 / 1024;
  if (memoryGrowth < 1) {
    console.log('  ✅ Memory usage is EXCELLENT (< 1MB growth)');
  } else if (memoryGrowth < 5) {
    console.log('  ✅ Memory usage is GOOD (< 5MB growth)');
  } else {
    console.log('  ⚠️  Memory usage is HIGH (> 5MB growth)');
  }
  
  // Overall performance rating
  const avgPerformance = Object.values(summary)
    .filter(s => s && s.avg)
    .reduce((acc, s) => acc + s.avg, 0) / Object.keys(summary).length;
  
  if (avgPerformance < 2) {
    console.log('  🏆 OVERALL PERFORMANCE: EXCELLENT');
  } else if (avgPerformance < 5) {
    console.log('  👍 OVERALL PERFORMANCE: GOOD');
  } else {
    console.log('  🔧 OVERALL PERFORMANCE: NEEDS OPTIMIZATION');
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runPerformanceBenchmark,
    PerformanceCollector
  };
}

// Run benchmark if executed directly
if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].includes('performance-benchmark')) {
  runPerformanceBenchmark().catch(console.error);
}
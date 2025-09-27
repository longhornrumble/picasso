/**
 * Load Testing Script for BERS Infrastructure
 * 
 * Tests system performance under various load conditions:
 * - Concurrent configuration requests
 * - Memory pressure scenarios
 * - Cache effectiveness
 * - Error handling under load
 */

import { performance } from 'perf_hooks';
import { config } from './environment.js';

class LoadTestRunner {
  constructor() {
    this.results = {
      concurrentLoad: [],
      cacheTest: [],
      memoryPressure: [],
      errorHandling: []
    };
  }

  async runConcurrentLoad(concurrency = 100, iterations = 10) {
    console.log(`\n🔥 Concurrent Load Test: ${concurrency} concurrent operations, ${iterations} iterations`);
    
    for (let iter = 0; iter < iterations; iter++) {
      const start = performance.now();
      
      // Create array of concurrent operations
      const operations = Array.from({ length: concurrency }, (_, i) => {
        return this.performConfigurationOperations(`tenant_${i % 10}`);
      });
      
      try {
        await Promise.all(operations);
        const end = performance.now();
        
        this.results.concurrentLoad.push({
          iteration: iter,
          concurrency,
          duration: end - start,
          success: true
        });
        
        console.log(`  Iteration ${iter + 1}: ${(end - start).toFixed(2)}ms`);
        
      } catch (error) {
        const end = performance.now();
        this.results.concurrentLoad.push({
          iteration: iter,
          concurrency,
          duration: end - start,
          success: false,
          error: error.message
        });
        console.error(`  Iteration ${iter + 1} FAILED: ${error.message}`);
      }
      
      // Brief pause between iterations
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  async performConfigurationOperations(tenantHash) {
    // Simulate typical configuration operations
    const operations = [
      () => config.getConfigUrl(tenantHash),
      () => config.getChatUrl(tenantHash),
      () => config.getAssetUrl(`assets/${tenantHash}/logo.png`),
      () => config.getTenantAssetUrl(tenantHash, 'styles.css'),
      () => config.getStreamingUrl(tenantHash),
      () => config.isStreamingEnabled({ features: { streaming_enabled: true } }),
      () => config.isJWTStreamingEnabled({ features: { jwt_streaming: true } }),
      () => config.getBuildInfo(),
      () => config.getRequestConfig({ timeout: 5000 }),
      () => config.getTenantHash()
    ];
    
    // Execute all operations
    for (const operation of operations) {
      try {
        await operation();
      } catch (error) {
        // Some operations may fail with invalid tenant hashes - that's expected
        if (!error.message.includes('required')) {
          throw error;
        }
      }
    }
  }

  async runCacheEffectivenessTest(iterations = 1000) {
    console.log(`\n💾 Cache Effectiveness Test: ${iterations} iterations`);
    
    const testTenantHashes = ['tenant_1', 'tenant_2', 'tenant_3'];
    const cacheStats = {
      urlGeneration: new Map(),
      configAccess: new Map()
    };
    
    for (let i = 0; i < iterations; i++) {
      const tenantHash = testTenantHashes[i % testTenantHashes.length];
      const start = performance.now();
      
      try {
        // Test repeated URL generation (should be cached/optimized)
        const configUrl = config.getConfigUrl(tenantHash);
        const chatUrl = config.getChatUrl(tenantHash);
        const assetUrl = config.getAssetUrl('test-asset.png');
        
        // Test environment detection (should be cached)
        const env = config.ENVIRONMENT;
        const isDev = config.isDevelopment();
        const buildInfo = config.getBuildInfo();
        
        const end = performance.now();
        
        // Track performance by tenant to detect caching effects
        if (!cacheStats.urlGeneration.has(tenantHash)) {
          cacheStats.urlGeneration.set(tenantHash, []);
        }
        cacheStats.urlGeneration.get(tenantHash).push(end - start);
        
        this.results.cacheTest.push({
          iteration: i,
          tenantHash,
          duration: end - start,
          urls: 3,
          configs: 3
        });
        
      } catch (error) {
        const end = performance.now();
        this.results.cacheTest.push({
          iteration: i,
          tenantHash,
          duration: end - start,
          error: error.message,
          failed: true
        });
      }
    }
    
    // Analyze cache effectiveness
    this.analyzeCacheEffectiveness(cacheStats);
  }

  analyzeCacheEffectiveness(cacheStats) {
    console.log('\n  📈 Cache Analysis:');
    
    for (const [tenantHash, timings] of cacheStats.urlGeneration.entries()) {
      if (timings.length > 10) {
        const first10 = timings.slice(0, 10);
        const last10 = timings.slice(-10);
        
        const avgFirst = first10.reduce((a, b) => a + b, 0) / first10.length;
        const avgLast = last10.reduce((a, b) => a + b, 0) / last10.length;
        
        const improvement = ((avgFirst - avgLast) / avgFirst) * 100;
        
        console.log(`    ${tenantHash}: ${improvement.toFixed(1)}% improvement (${avgFirst.toFixed(3)}ms → ${avgLast.toFixed(3)}ms)`);
      }
    }
  }

  async runMemoryPressureTest(allocations = 50) {
    console.log(`\n🧠 Memory Pressure Test: ${allocations} large allocations`);
    
    const initialMemory = process.memoryUsage();
    console.log(`  Initial memory: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    
    // Create memory pressure
    const largeArrays = [];
    
    for (let i = 0; i < allocations; i++) {
      const start = performance.now();
      
      try {
        // Allocate large array to create memory pressure
        const largeArray = new Array(100000).fill(`data_${i}_${Math.random()}`);
        largeArrays.push(largeArray);
        
        // Perform configuration operations under memory pressure
        await this.performConfigurationOperations(`pressure_tenant_${i}`);
        
        const end = performance.now();
        const currentMemory = process.memoryUsage();
        
        this.results.memoryPressure.push({
          allocation: i,
          duration: end - start,
          heapUsed: currentMemory.heapUsed,
          heapTotal: currentMemory.heapTotal,
          external: currentMemory.external
        });
        
        if (i % 10 === 0) {
          console.log(`    Allocation ${i}: ${(end - start).toFixed(2)}ms, Memory: ${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        }
        
      } catch (error) {
        const end = performance.now();
        const currentMemory = process.memoryUsage();
        
        this.results.memoryPressure.push({
          allocation: i,
          duration: end - start,
          heapUsed: currentMemory.heapUsed,
          error: error.message,
          failed: true
        });
        
        console.error(`    Allocation ${i} FAILED: ${error.message}`);
      }
    }
    
    const finalMemory = process.memoryUsage();
    console.log(`  Final memory: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Memory growth: ${((finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2)} MB`);
    
    // Cleanup
    largeArrays.length = 0;
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      const afterGC = process.memoryUsage();
      console.log(`  After GC: ${(afterGC.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    }
  }

  async runErrorHandlingTest(iterations = 100) {
    console.log(`\n❌ Error Handling Test: ${iterations} invalid operations`);
    
    const invalidInputs = [
      null,
      undefined,
      '',
      'invalid/tenant/hash',
      '../../../etc/passwd',
      '<script>alert("xss")</script>',
      'a'.repeat(1000),
      123,
      {},
      []
    ];
    
    for (let i = 0; i < iterations; i++) {
      const invalidInput = invalidInputs[i % invalidInputs.length];
      const start = performance.now();
      
      let errors = 0;
      let handled = 0;
      
      // Test various functions with invalid inputs
      const testFunctions = [
        () => config.getConfigUrl(invalidInput),
        () => config.getChatUrl(invalidInput),
        () => config.getAssetUrl(invalidInput),
        () => config.getTenantAssetUrl(invalidInput, 'test'),
        () => config.getStreamingUrl(invalidInput),
        () => config.isStreamingEnabled(invalidInput),
        () => config.isJWTStreamingEnabled(invalidInput)
      ];
      
      for (const testFn of testFunctions) {
        try {
          await testFn();
        } catch (error) {
          errors++;
          if (error.message && typeof error.message === 'string') {
            handled++;
          }
        }
      }
      
      const end = performance.now();
      
      this.results.errorHandling.push({
        iteration: i,
        invalidInput: typeof invalidInput === 'string' ? invalidInput.substring(0, 50) : String(invalidInput),
        duration: end - start,
        errorsThrown: errors,
        errorsHandled: handled,
        functionstested: testFunctions.length
      });
      
      if (i % 20 === 0) {
        console.log(`    Test ${i}: ${errors}/${testFunctions.length} errors handled in ${(end - start).toFixed(2)}ms`);
      }
    }
  }

  generateLoadTestReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {},
      details: this.results
    };
    
    // Concurrent load summary
    if (this.results.concurrentLoad.length > 0) {
      const successful = this.results.concurrentLoad.filter(r => r.success);
      const failed = this.results.concurrentLoad.filter(r => !r.success);
      
      report.summary.concurrentLoad = {
        totalTests: this.results.concurrentLoad.length,
        successful: successful.length,
        failed: failed.length,
        successRate: (successful.length / this.results.concurrentLoad.length) * 100,
        avgDuration: successful.length > 0 ? 
          successful.reduce((sum, r) => sum + r.duration, 0) / successful.length : 0
      };
    }
    
    // Cache effectiveness summary
    if (this.results.cacheTest.length > 0) {
      const successful = this.results.cacheTest.filter(r => !r.failed);
      
      report.summary.cacheEffectiveness = {
        totalOperations: successful.length,
        avgDuration: successful.reduce((sum, r) => sum + r.duration, 0) / successful.length,
        minDuration: Math.min(...successful.map(r => r.duration)),
        maxDuration: Math.max(...successful.map(r => r.duration))
      };
    }
    
    // Memory pressure summary
    if (this.results.memoryPressure.length > 0) {
      const successful = this.results.memoryPressure.filter(r => !r.failed);
      
      report.summary.memoryPressure = {
        totalAllocations: successful.length,
        avgDuration: successful.reduce((sum, r) => sum + r.duration, 0) / successful.length,
        maxMemoryUsed: Math.max(...successful.map(r => r.heapUsed)),
        memoryGrowthMB: successful.length > 1 ? 
          (successful[successful.length - 1].heapUsed - successful[0].heapUsed) / 1024 / 1024 : 0
      };
    }
    
    // Error handling summary
    if (this.results.errorHandling.length > 0) {
      const totalErrors = this.results.errorHandling.reduce((sum, r) => sum + r.errorsThrown, 0);
      const totalHandled = this.results.errorHandling.reduce((sum, r) => sum + r.errorsHandled, 0);
      
      report.summary.errorHandling = {
        totalTests: this.results.errorHandling.length,
        totalErrors,
        totalHandled,
        errorHandlingRate: totalErrors > 0 ? (totalHandled / totalErrors) * 100 : 100,
        avgDuration: this.results.errorHandling.reduce((sum, r) => sum + r.duration, 0) / this.results.errorHandling.length
      };
    }
    
    return report;
  }
}

async function runLoadTests() {
  console.log('🔥 Starting BERS Infrastructure Load Tests');
  console.log('='.repeat(60));
  
  const runner = new LoadTestRunner();
  
  try {
    // Run all load tests
    await runner.runConcurrentLoad(50, 10);
    await runner.runCacheEffectivenessTest(500);
    await runner.runMemoryPressureTest(30);
    await runner.runErrorHandlingTest(100);
    
    // Generate and display report
    const report = runner.generateLoadTestReport();
    
    console.log('\n📊 LOAD TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    
    if (report.summary.concurrentLoad) {
      const cl = report.summary.concurrentLoad;
      console.log('\nCONCURRENT LOAD:');
      console.log(`  Success Rate:    ${cl.successRate.toFixed(1)}% (${cl.successful}/${cl.totalTests})`);
      console.log(`  Avg Duration:    ${cl.avgDuration.toFixed(2)}ms`);
    }
    
    if (report.summary.cacheEffectiveness) {
      const ce = report.summary.cacheEffectiveness;
      console.log('\nCACHE EFFECTIVENESS:');
      console.log(`  Total Operations: ${ce.totalOperations}`);
      console.log(`  Avg Duration:     ${ce.avgDuration.toFixed(3)}ms`);
      console.log(`  Min Duration:     ${ce.minDuration.toFixed(3)}ms`);
      console.log(`  Max Duration:     ${ce.maxDuration.toFixed(3)}ms`);
    }
    
    if (report.summary.memoryPressure) {
      const mp = report.summary.memoryPressure;
      console.log('\nMEMORY PRESSURE:');
      console.log(`  Total Allocations: ${mp.totalAllocations}`);
      console.log(`  Avg Duration:      ${mp.avgDuration.toFixed(2)}ms`);
      console.log(`  Memory Growth:     ${mp.memoryGrowthMB.toFixed(2)}MB`);
      console.log(`  Max Memory Used:   ${(mp.maxMemoryUsed / 1024 / 1024).toFixed(2)}MB`);
    }
    
    if (report.summary.errorHandling) {
      const eh = report.summary.errorHandling;
      console.log('\nERROR HANDLING:');
      console.log(`  Total Tests:       ${eh.totalTests}`);
      console.log(`  Error Handling:    ${eh.errorHandlingRate.toFixed(1)}% (${eh.totalHandled}/${eh.totalErrors})`);
      console.log(`  Avg Duration:      ${eh.avgDuration.toFixed(3)}ms`);
    }
    
    console.log('\n🎯 LOAD TEST ANALYSIS:');
    
    if (report.summary.concurrentLoad && report.summary.concurrentLoad.successRate >= 95) {
      console.log('  ✅ Concurrent load handling is EXCELLENT');
    } else if (report.summary.concurrentLoad && report.summary.concurrentLoad.successRate >= 90) {
      console.log('  ✅ Concurrent load handling is GOOD');
    } else {
      console.log('  ⚠️  Concurrent load handling needs improvement');
    }
    
    if (report.summary.errorHandling && report.summary.errorHandling.errorHandlingRate >= 95) {
      console.log('  ✅ Error handling is EXCELLENT');
    } else if (report.summary.errorHandling && report.summary.errorHandling.errorHandlingRate >= 85) {
      console.log('  ✅ Error handling is GOOD');
    } else {
      console.log('  ⚠️  Error handling needs improvement');
    }
    
    if (report.summary.memoryPressure && report.summary.memoryPressure.memoryGrowthMB < 10) {
      console.log('  ✅ Memory management is EXCELLENT');
    } else if (report.summary.memoryPressure && report.summary.memoryPressure.memoryGrowthMB < 25) {
      console.log('  ✅ Memory management is GOOD');
    } else {
      console.log('  ⚠️  Memory management needs optimization');
    }
    
    return report;
    
  } catch (error) {
    console.error('❌ Load test failed:', error);
    throw error;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runLoadTests,
    LoadTestRunner
  };
}

// Run load tests if executed directly
if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].includes('load-test')) {
  runLoadTests().catch(console.error);
}
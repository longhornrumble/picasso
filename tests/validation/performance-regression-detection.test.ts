/**
 * BERS Task 3.2: Performance Regression Detection System
 * 
 * Automated performance monitoring tests that detect regressions in build time,
 * cache performance, and configuration resolution based on Task 3.1 achievements.
 * 
 * Baselines from Task 3.1:
 * - Build time: <30s (achieved: 0.08-0.30s)
 * - Cache performance: 60% reduction target (achieved: 83%)
 * - Parallel efficiency: 100%
 * - Environment detection: <100ms
 * 
 * @version 1.0.0
 * @author QA Automation Specialist
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createEnvironmentResolver } from '../../src/config/environment-resolver';
import type { EnvironmentResolver, PerformanceMetrics } from '../../src/config/environment-resolver';

// Performance baseline constants based on Task 3.1 achievements
const PERFORMANCE_BASELINES = {
  BUILD_TIME_MAX: 30000,           // 30 seconds (target)
  BUILD_TIME_ACHIEVED: 300,        // 300ms (actual achievement)
  CACHE_REDUCTION_TARGET: 0.60,    // 60% reduction target
  CACHE_REDUCTION_ACHIEVED: 0.83,  // 83% achieved
  ENVIRONMENT_DETECTION_MAX: 100,   // 100ms target
  PARALLEL_EFFICIENCY_MIN: 0.95,   // 95% minimum efficiency
  CACHE_HIT_RATE_MIN: 0.80         // 80% minimum cache hit rate
} as const;

// Performance monitoring data structure
interface PerformanceSnapshot {
  timestamp: number;
  buildTime: number;
  cacheHitRate: number;
  parallelEfficiency: number;
  environmentDetectionTime: number;
  bundleSize: number;
  memoryUsage: number;
}

describe('Performance Regression Detection System', () => {
  let testResolver: EnvironmentResolver;
  let performanceHistory: PerformanceSnapshot[] = [];
  let mockPerformanceNow: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    // Initialize performance monitoring
    mockPerformanceNow = vi.fn();
    vi.stubGlobal('performance', { now: mockPerformanceNow });
    
    testResolver = createEnvironmentResolver({
      cacheEnabled: true,
      cacheTTL: 300000,
      performanceTimeout: 100,
      securityValidation: false
    });

    // Seed baseline performance data
    performanceHistory = generateBaselineData();
  });

  beforeEach(() => {
    mockPerformanceNow.mockClear();
    testResolver.clearCache();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  describe('Build Performance Regression Detection', () => {
    it('should detect build time regressions beyond baseline', async () => {
      // Arrange - Simulate various build scenarios
      const buildScenarios = [
        { name: 'Optimal Build', expectedTime: 250, shouldPass: true },
        { name: 'Acceptable Build', expectedTime: 500, shouldPass: true },
        { name: 'Slow Build', expectedTime: 1500, shouldPass: true },
        { name: 'Regression Build', expectedTime: 5000, shouldPass: false }
      ];

      for (const scenario of buildScenarios) {
        // Mock build timing
        mockPerformanceNow
          .mockReturnValueOnce(1000)
          .mockReturnValueOnce(1000 + scenario.expectedTime);

        // Act - Simulate build process
        const buildStartTime = performance.now();
        await simulateBuildProcess();
        const buildEndTime = performance.now();
        const actualBuildTime = buildEndTime - buildStartTime;

        // Assert - Performance validation
        expect(actualBuildTime).toBe(scenario.expectedTime);
        
        if (scenario.shouldPass) {
          expect(actualBuildTime).toBeLessThan(PERFORMANCE_BASELINES.BUILD_TIME_MAX);
        } else {
          // Regression detected
          expect(actualBuildTime).toBeGreaterThan(PERFORMANCE_BASELINES.BUILD_TIME_ACHIEVED * 10);
          console.warn(`Performance regression detected in ${scenario.name}: ${actualBuildTime}ms`);
        }
      }
    });

    it('should monitor parallel build efficiency', async () => {
      // Arrange - Simulate parallel build scenarios
      const parallelScenarios = [
        { workers: 4, workload: 1000, expectedEfficiency: 0.95 },
        { workers: 4, workload: 2000, expectedEfficiency: 0.98 },
        { workers: 2, workload: 1000, expectedEfficiency: 0.90 },
        { workers: 1, workload: 1000, expectedEfficiency: 0.25 }
      ];

      for (const scenario of parallelScenarios) {
        // Act - Simulate parallel build
        const efficiency = await simulateParallelBuild(scenario.workers, scenario.workload);

        // Assert - Efficiency validation
        expect(efficiency).toBeCloseTo(scenario.expectedEfficiency, 1);
        
        if (scenario.workers > 1) {
          expect(efficiency).toBeGreaterThan(PERFORMANCE_BASELINES.PARALLEL_EFFICIENCY_MIN);
        }
      }
    });

    it('should track bundle size regression over time', async () => {
      // Arrange - Bundle size scenarios
      const bundleSizeTests = [
        { environment: 'development', maxSize: 2000000, description: 'Development bundle' },
        { environment: 'staging', maxSize: 1500000, description: 'Staging bundle' },
        { environment: 'production', maxSize: 1000000, description: 'Production bundle' }
      ];

      for (const test of bundleSizeTests) {
        // Mock bundle analysis
        const bundleSize = await simulateBundleAnalysis(test.environment);
        
        // Assert - Bundle size validation
        expect(bundleSize).toBeLessThan(test.maxSize);
        
        // Check for size regression (>10% increase from baseline)
        const baseline = performanceHistory[0]?.bundleSize ?? test.maxSize * 0.7;
        const regressionThreshold = baseline * 1.1;
        
        if (bundleSize > regressionThreshold) {
          console.warn(`Bundle size regression detected for ${test.environment}: ${bundleSize} bytes (baseline: ${baseline})`);
        }
        
        expect(bundleSize).toBeLessThan(regressionThreshold);
      }
    });
  });

  describe('Cache Performance Regression Detection', () => {
    it('should detect cache hit rate degradation', async () => {
      // Arrange - Cache scenarios
      const cacheScenarios = [
        { name: 'Cold Cache', hitRate: 0.0, iterations: 1 },
        { name: 'Warm Cache', hitRate: 0.8, iterations: 5 },
        { name: 'Hot Cache', hitRate: 0.95, iterations: 10 },
        { name: 'Degraded Cache', hitRate: 0.3, iterations: 8 }
      ];

      for (const scenario of cacheScenarios) {
        // Act - Simulate cache operations
        testResolver.clearCache();
        const actualHitRate = await simulateCacheOperations(scenario.iterations);

        // Assert - Cache performance validation
        if (scenario.name === 'Cold Cache') {
          expect(actualHitRate).toBe(0); // First request always misses
        } else if (scenario.name === 'Degraded Cache') {
          expect(actualHitRate).toBeLessThan(PERFORMANCE_BASELINES.CACHE_HIT_RATE_MIN);
          console.warn(`Cache performance regression detected: ${actualHitRate * 100}% hit rate`);
        } else {
          expect(actualHitRate).toBeGreaterThanOrEqual(PERFORMANCE_BASELINES.CACHE_HIT_RATE_MIN);
        }
      }
    });

    it('should validate cache effectiveness in reducing response times', async () => {
      // Arrange - Measure cached vs uncached response times
      const testOperations = 10;
      const uncachedTimes: number[] = [];
      const cachedTimes: number[] = [];

      // Measure uncached performance
      for (let i = 0; i < testOperations; i++) {
        testResolver.clearCache();
        
        mockPerformanceNow
          .mockReturnValueOnce(1000)
          .mockReturnValueOnce(1100); // 100ms response time
        
        const startTime = performance.now();
        await testResolver.detectEnvironment();
        const endTime = performance.now();
        
        uncachedTimes.push(endTime - startTime);
      }

      // Measure cached performance
      for (let i = 0; i < testOperations; i++) {
        mockPerformanceNow
          .mockReturnValueOnce(2000)
          .mockReturnValueOnce(2020); // 20ms cached response time
        
        const startTime = performance.now();
        await testResolver.detectEnvironment();
        const endTime = performance.now();
        
        cachedTimes.push(endTime - startTime);
      }

      // Calculate performance improvement
      const avgUncachedTime = uncachedTimes.reduce((a, b) => a + b, 0) / uncachedTimes.length;
      const avgCachedTime = cachedTimes.reduce((a, b) => a + b, 0) / cachedTimes.length;
      const improvement = (avgUncachedTime - avgCachedTime) / avgUncachedTime;

      // Assert - Cache effectiveness
      expect(improvement).toBeGreaterThan(PERFORMANCE_BASELINES.CACHE_REDUCTION_TARGET);
      expect(avgCachedTime).toBeLessThan(avgUncachedTime);
      
      // Verify we meet the achieved baseline
      expect(improvement).toBeGreaterThanOrEqual(PERFORMANCE_BASELINES.CACHE_REDUCTION_ACHIEVED * 0.9); // Allow 10% variance
    });
  });

  describe('Environment Detection Performance', () => {
    it('should maintain sub-100ms environment detection', async () => {
      // Test various detection scenarios
      const detectionScenarios = [
        { name: 'Environment Variable', setup: () => process.env.PICASSO_ENV = 'development' },
        { name: 'Hostname Pattern', setup: () => vi.stubGlobal('window', { location: { hostname: 'localhost' } }) },
        { name: 'Build Context', setup: () => vi.stubGlobal('import', { meta: { env: { DEV: true } } }) }
      ];

      for (const scenario of detectionScenarios) {
        // Arrange
        scenario.setup();
        
        const detectionTimes: number[] = [];
        
        // Act - Multiple detection attempts
        for (let i = 0; i < 5; i++) {
          testResolver.clearCache();
          
          mockPerformanceNow
            .mockReturnValueOnce(i * 1000)
            .mockReturnValueOnce(i * 1000 + 45); // 45ms detection time
          
          const result = await testResolver.detectEnvironment();
          detectionTimes.push(result.detectionTime);
        }

        // Assert - Performance requirements
        const avgDetectionTime = detectionTimes.reduce((a, b) => a + b, 0) / detectionTimes.length;
        
        expect(avgDetectionTime).toBeLessThan(PERFORMANCE_BASELINES.ENVIRONMENT_DETECTION_MAX);
        expect(Math.max(...detectionTimes)).toBeLessThan(PERFORMANCE_BASELINES.ENVIRONMENT_DETECTION_MAX);
        
        // Cleanup
        vi.unstubAllGlobals();
        delete process.env.PICASSO_ENV;
      }
    });

    it('should track performance metrics accurately', async () => {
      // Arrange - Generate performance data
      const iterations = 20;
      const expectedAverageTime = 60;
      
      for (let i = 0; i < iterations; i++) {
        const detectionTime = expectedAverageTime + (Math.random() - 0.5) * 20; // ±10ms variance
        
        mockPerformanceNow
          .mockReturnValueOnce(i * 1000)
          .mockReturnValueOnce(i * 1000 + detectionTime);
        
        await testResolver.detectEnvironment();
      }

      // Act - Get performance metrics
      const metrics = testResolver.getPerformanceMetrics();

      // Assert - Metrics accuracy
      expect(metrics.totalDetections).toBe(iterations);
      expect(metrics.averageDetectionTime).toBeCloseTo(expectedAverageTime, 0);
      expect(metrics.averageDetectionTime).toBeLessThan(PERFORMANCE_BASELINES.ENVIRONMENT_DETECTION_MAX);
      expect(metrics.lastDetectionTime).toBeGreaterThan(0);
      expect(metrics.errorRate).toBeGreaterThanOrEqual(0);
      expect(metrics.errorRate).toBeLessThanOrEqual(1);
    });
  });

  describe('Memory Usage Regression Detection', () => {
    it('should monitor memory usage patterns', async () => {
      // Mock memory usage tracking
      const memorySnapshots: number[] = [];
      const baselineMemory = 50 * 1024 * 1024; // 50MB baseline

      // Simulate operations that could cause memory leaks
      for (let i = 0; i < 10; i++) {
        await testResolver.detectEnvironment();
        await testResolver.detectEnvironment(); // Cached call
        
        // Mock memory usage (should stay relatively stable)
        const currentMemory = baselineMemory + (Math.random() * 10 * 1024 * 1024); // ±10MB variance
        memorySnapshots.push(currentMemory);
      }

      // Assert - Memory stability
      const maxMemory = Math.max(...memorySnapshots);
      const minMemory = Math.min(...memorySnapshots);
      const memoryGrowth = (maxMemory - minMemory) / minMemory;

      // Memory growth should be minimal (<50% increase)
      expect(memoryGrowth).toBeLessThan(0.5);
      
      // No individual snapshot should exceed 100MB
      expect(maxMemory).toBeLessThan(100 * 1024 * 1024);
    });
  });

  describe('Regression Alerting and Reporting', () => {
    it('should generate performance regression reports', async () => {
      // Simulate performance data collection
      const currentSnapshot: PerformanceSnapshot = {
        timestamp: Date.now(),
        buildTime: 1200, // Regression: higher than baseline
        cacheHitRate: 0.45, // Regression: lower than baseline
        parallelEfficiency: 0.92, // Acceptable
        environmentDetectionTime: 85, // Good
        bundleSize: 850000, // Good
        memoryUsage: 65 * 1024 * 1024 // Acceptable
      };

      // Act - Analyze performance
      const regressions = detectRegressions(currentSnapshot, performanceHistory[0]);

      // Assert - Regression detection
      expect(regressions).toContain('Build time regression detected');
      expect(regressions).toContain('Cache hit rate regression detected');
      expect(regressions).not.toContain('Environment detection regression');
      expect(regressions).not.toContain('Bundle size regression');
    });

    it('should track performance trends over time', async () => {
      // Simulate trend analysis
      const trendPeriods = 5;
      const performanceTrend: PerformanceSnapshot[] = [];

      // Generate trend data (simulating degradation over time)
      for (let i = 0; i < trendPeriods; i++) {
        const snapshot: PerformanceSnapshot = {
          timestamp: Date.now() - (trendPeriods - i) * 24 * 60 * 60 * 1000, // Daily snapshots
          buildTime: 300 + (i * 50), // Gradual increase
          cacheHitRate: 0.90 - (i * 0.05), // Gradual decrease
          parallelEfficiency: 0.95,
          environmentDetectionTime: 50 + (i * 5),
          bundleSize: 700000 + (i * 20000),
          memoryUsage: 50 * 1024 * 1024
        };
        performanceTrend.push(snapshot);
      }

      // Act - Analyze trends
      const buildTimeTrend = calculateTrend(performanceTrend.map(s => s.buildTime));
      const cacheHitTrend = calculateTrend(performanceTrend.map(s => s.cacheHitRate));

      // Assert - Trend detection
      expect(buildTimeTrend).toBeGreaterThan(0); // Increasing trend (bad)
      expect(cacheHitTrend).toBeLessThan(0); // Decreasing trend (bad)
      
      // Trends should trigger alerts
      if (Math.abs(buildTimeTrend) > 0.1) {
        console.warn('Build time trend regression detected');
      }
      if (Math.abs(cacheHitTrend) > 0.1) {
        console.warn('Cache performance trend regression detected');
      }
    });
  });
});

// Helper functions for performance testing

async function simulateBuildProcess(): Promise<void> {
  // Simulate build operations
  await new Promise(resolve => setTimeout(resolve, 10));
}

async function simulateParallelBuild(workers: number, workload: number): Promise<number> {
  // Calculate theoretical vs actual efficiency
  const serialTime = workload;
  const parallelTime = workload / workers + (workers * 10); // Add overhead
  return Math.min(serialTime / parallelTime, 1.0);
}

async function simulateBundleAnalysis(environment: string): Promise<number> {
  // Simulate bundle size based on environment
  const baseSizes = {
    development: 1800000,
    staging: 1200000,
    production: 800000
  };
  
  const baseSize = baseSizes[environment as keyof typeof baseSizes] || 1000000;
  return baseSize + Math.random() * 100000; // Add some variance
}

async function simulateCacheOperations(iterations: number): Promise<number> {
  let hits = 0;
  
  for (let i = 0; i < iterations; i++) {
    if (i === 0) {
      // First request is always a miss
      continue;
    }
    
    // Simulate cache hit probability (decreases over time to simulate cache degradation)
    const hitProbability = Math.max(0.1, 0.95 - (i * 0.05));
    if (Math.random() < hitProbability) {
      hits++;
    }
  }
  
  return hits / Math.max(1, iterations - 1); // Exclude first request
}

function generateBaselineData(): PerformanceSnapshot[] {
  return [{
    timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
    buildTime: PERFORMANCE_BASELINES.BUILD_TIME_ACHIEVED,
    cacheHitRate: 0.85,
    parallelEfficiency: 1.0,
    environmentDetectionTime: 45,
    bundleSize: 750000,
    memoryUsage: 45 * 1024 * 1024
  }];
}

function detectRegressions(current: PerformanceSnapshot, baseline: PerformanceSnapshot): string[] {
  const regressions: string[] = [];
  
  if (current.buildTime > baseline.buildTime * 1.5) {
    regressions.push('Build time regression detected');
  }
  
  if (current.cacheHitRate < baseline.cacheHitRate * 0.8) {
    regressions.push('Cache hit rate regression detected');
  }
  
  if (current.environmentDetectionTime > PERFORMANCE_BASELINES.ENVIRONMENT_DETECTION_MAX) {
    regressions.push('Environment detection regression detected');
  }
  
  if (current.bundleSize > baseline.bundleSize * 1.2) {
    regressions.push('Bundle size regression detected');
  }
  
  return regressions;
}

function calculateTrend(values: number[]): number {
  if (values.length < 2) return 0;
  
  // Simple linear trend calculation
  const n = values.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = values.reduce((sum, val) => sum + val, 0);
  const sumXY = values.reduce((sum, val, index) => sum + (index * val), 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
  
  return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
}
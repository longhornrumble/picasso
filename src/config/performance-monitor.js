/**
 * Performance Monitoring Dashboard for BERS Infrastructure
 * 
 * Provides real-time performance monitoring and alerting for the
 * environment configuration system to prevent performance regression.
 */

import { performance } from 'perf_hooks';
import { config } from './environment.js';

class BERSPerformanceMonitor {
  constructor() {
    this.metrics = {
      environmentDetection: [],
      configurationLoading: [],
      urlGeneration: [],
      validation: [],
      errors: []
    };
    
    this.thresholds = {
      environmentDetection: { warning: 0.5, critical: 1.0 },
      configurationLoading: { warning: 1.0, critical: 2.0 },
      urlGeneration: { warning: 0.5, critical: 1.0 },
      validation: { warning: 2.0, critical: 5.0 }
    };
    
    this.alerts = [];
    this.isMonitoring = false;
    this.monitoringInterval = null;
  }

  startMonitoring(intervalMs = 30000) {
    if (this.isMonitoring) {
      console.log('Performance monitoring already running');
      return;
    }

    this.isMonitoring = true;
    console.log('🔍 BERS Performance Monitoring Started');
    
    this.monitoringInterval = setInterval(() => {
      this.performHealthCheck();
    }, intervalMs);
    
    // Initial health check
    this.performHealthCheck();
  }

  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    console.log('⏹️ BERS Performance Monitoring Stopped');
  }

  async performHealthCheck() {
    const healthCheckResults = {
      timestamp: new Date().toISOString(),
      environmentDetection: await this.benchmarkEnvironmentDetection(),
      configurationLoading: await this.benchmarkConfigurationLoading(),
      urlGeneration: await this.benchmarkUrlGeneration(),
      validation: await this.benchmarkValidation(),
      memory: this.getMemoryMetrics(),
      alerts: []
    };

    // Check for performance regressions
    this.checkPerformanceThresholds(healthCheckResults);
    
    // Store metrics
    this.recordHealthCheck(healthCheckResults);
    
    // Log summary
    this.logHealthCheckSummary(healthCheckResults);
    
    return healthCheckResults;
  }

  async benchmarkEnvironmentDetection(iterations = 100) {
    const measurements = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      
      // Test environment detection methods
      const env = config.ENVIRONMENT;
      const isDev = config.isDevelopment();
      const isStaging = config.isStaging();
      const isProd = config.isProduction();
      
      const end = performance.now();
      measurements.push(end - start);
    }
    
    return this.calculateStats(measurements);
  }

  async benchmarkConfigurationLoading(iterations = 50) {
    const measurements = [];
    const testTenantHashes = ['my87674d777bf9', 'test_tenant'];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      
      try {
        const tenantHash = testTenantHashes[i % testTenantHashes.length];
        
        const configUrl = config.getConfigUrl(tenantHash);
        const chatUrl = config.getChatUrl(tenantHash);
        const buildInfo = config.getBuildInfo();
        const requestConfig = config.getRequestConfig();
        
        const end = performance.now();
        measurements.push(end - start);
      } catch (error) {
        const end = performance.now();
        measurements.push(end - start);
        this.recordError('configurationLoading', error);
      }
    }
    
    return this.calculateStats(measurements);
  }

  async benchmarkUrlGeneration(iterations = 200) {
    const measurements = [];
    const testPaths = ['logo.png', 'styles.css', 'script.js'];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      
      try {
        const path = testPaths[i % testPaths.length];
        const assetUrl = config.getAssetUrl(path);
        const tenantAssetUrl = config.getTenantAssetUrl('test_tenant', path);
        
        const end = performance.now();
        measurements.push(end - start);
      } catch (error) {
        const end = performance.now();
        measurements.push(end - start);
        this.recordError('urlGeneration', error);
      }
    }
    
    return this.calculateStats(measurements);
  }

  async benchmarkValidation(iterations = 30) {
    const measurements = [];
    const testConfigs = [
      { features: { streaming_enabled: true } },
      { features: { jwt_streaming: true } },
      null
    ];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      
      try {
        const tenantConfig = testConfigs[i % testConfigs.length];
        
        const streamingEnabled = config.isStreamingEnabled(tenantConfig);
        const jwtStreamingEnabled = config.isJWTStreamingEnabled(tenantConfig);
        const buildInfo = config.getBuildInfo();
        
        const end = performance.now();
        measurements.push(end - start);
      } catch (error) {
        const end = performance.now();
        measurements.push(end - start);
        this.recordError('validation', error);
      }
    }
    
    return this.calculateStats(measurements);
  }

  calculateStats(measurements) {
    if (measurements.length === 0) {
      return { avg: 0, min: 0, max: 0, count: 0 };
    }

    const sorted = measurements.sort((a, b) => a - b);
    
    return {
      avg: measurements.reduce((a, b) => a + b, 0) / measurements.length,
      min: Math.min(...measurements),
      max: Math.max(...measurements),
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      count: measurements.length
    };
  }

  getMemoryMetrics() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external,
        rss: usage.rss,
        heapUsedMB: usage.heapUsed / 1024 / 1024,
        heapTotalMB: usage.heapTotal / 1024 / 1024
      };
    }
    
    return {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0,
      heapUsedMB: 0,
      heapTotalMB: 0
    };
  }

  checkPerformanceThresholds(healthCheck) {
    const alerts = [];
    
    // Check each metric against thresholds
    Object.entries(this.thresholds).forEach(([metric, thresholds]) => {
      const stats = healthCheck[metric];
      if (!stats) return;
      
      if (stats.avg >= thresholds.critical) {
        alerts.push({
          level: 'CRITICAL',
          metric,
          value: stats.avg,
          threshold: thresholds.critical,
          message: `${metric} average response time (${stats.avg.toFixed(3)}ms) exceeds critical threshold (${thresholds.critical}ms)`
        });
      } else if (stats.avg >= thresholds.warning) {
        alerts.push({
          level: 'WARNING',
          metric,
          value: stats.avg,
          threshold: thresholds.warning,
          message: `${metric} average response time (${stats.avg.toFixed(3)}ms) exceeds warning threshold (${thresholds.warning}ms)`
        });
      }
      
      // Check for outliers (P95 significantly higher than average)
      if (stats.p95 > stats.avg * 3) {
        alerts.push({
          level: 'WARNING',
          metric,
          value: stats.p95,
          threshold: stats.avg * 3,
          message: `${metric} has performance outliers (P95: ${stats.p95.toFixed(3)}ms vs Avg: ${stats.avg.toFixed(3)}ms)`
        });
      }
    });
    
    healthCheck.alerts = alerts;
    this.alerts = [...this.alerts, ...alerts].slice(-100); // Keep last 100 alerts
  }

  recordHealthCheck(healthCheck) {
    // Store metrics for trend analysis
    Object.entries(healthCheck).forEach(([metric, stats]) => {
      if (this.metrics[metric] && stats && stats.avg !== undefined) {
        this.metrics[metric].push({
          timestamp: healthCheck.timestamp,
          avg: stats.avg,
          min: stats.min,
          max: stats.max,
          count: stats.count
        });
        
        // Keep only last 100 measurements
        this.metrics[metric] = this.metrics[metric].slice(-100);
      }
    });
  }

  recordError(metric, error) {
    this.metrics.errors.push({
      timestamp: new Date().toISOString(),
      metric,
      error: error.message,
      stack: error.stack
    });
    
    // Keep only last 50 errors
    this.metrics.errors = this.metrics.errors.slice(-50);
  }

  logHealthCheckSummary(healthCheck) {
    const { alerts } = healthCheck;
    
    if (alerts.length === 0) {
      console.log(`✅ BERS Health Check: All systems performing optimally`);
    } else {
      console.log(`⚠️ BERS Health Check: ${alerts.length} performance alerts`);
      alerts.forEach(alert => {
        const icon = alert.level === 'CRITICAL' ? '🚨' : '⚠️';
        console.log(`  ${icon} ${alert.level}: ${alert.message}`);
      });
    }
    
    // Log key metrics
    console.log(`   Environment Detection: ${healthCheck.environmentDetection.avg.toFixed(3)}ms avg`);
    console.log(`   Configuration Loading: ${healthCheck.configurationLoading.avg.toFixed(3)}ms avg`);
    console.log(`   URL Generation: ${healthCheck.urlGeneration.avg.toFixed(3)}ms avg`);
    console.log(`   Memory Usage: ${healthCheck.memory.heapUsedMB.toFixed(1)}MB`);
  }

  generatePerformanceReport() {
    const report = {
      timestamp: new Date().toISOString(),
      monitoringStatus: this.isMonitoring,
      summary: {},
      trends: {},
      alerts: this.alerts.slice(-10), // Last 10 alerts
      errors: this.metrics.errors.slice(-10) // Last 10 errors
    };
    
    // Calculate summary statistics
    Object.entries(this.metrics).forEach(([metric, measurements]) => {
      if (metric === 'errors') return;
      
      if (measurements.length > 0) {
        const recent = measurements.slice(-10); // Last 10 measurements
        const avgRecent = recent.reduce((sum, m) => sum + m.avg, 0) / recent.length;
        
        report.summary[metric] = {
          currentAvg: avgRecent,
          measurements: measurements.length,
          trend: this.calculateTrend(measurements)
        };
      }
    });
    
    return report;
  }

  calculateTrend(measurements) {
    if (measurements.length < 5) return 'insufficient-data';
    
    const recent = measurements.slice(-5).map(m => m.avg);
    const older = measurements.slice(-10, -5).map(m => m.avg);
    
    if (older.length === 0) return 'insufficient-data';
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? 'degrading' : 'improving';
  }

  exportMetrics() {
    return {
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      alerts: this.alerts,
      thresholds: this.thresholds,
      monitoringStatus: this.isMonitoring
    };
  }

  // Performance regression test for CI/CD
  async performRegressionTest() {
    console.log('🧪 Running BERS Performance Regression Test');
    
    const results = await this.performHealthCheck();
    const failures = [];
    
    // Define regression test thresholds (stricter than monitoring)
    const regressionThresholds = {
      environmentDetection: 0.1, // 0.1ms
      configurationLoading: 0.5,   // 0.5ms
      urlGeneration: 0.2,          // 0.2ms
      validation: 1.0              // 1.0ms
    };
    
    Object.entries(regressionThresholds).forEach(([metric, threshold]) => {
      const stats = results[metric];
      if (stats && stats.avg > threshold) {
        failures.push({
          metric,
          actual: stats.avg,
          threshold,
          message: `${metric} regression: ${stats.avg.toFixed(3)}ms > ${threshold}ms threshold`
        });
      }
    });
    
    if (failures.length === 0) {
      console.log('✅ Performance regression test PASSED');
      return { passed: true, failures: [] };
    } else {
      console.log(`❌ Performance regression test FAILED: ${failures.length} failures`);
      failures.forEach(failure => {
        console.log(`   ${failure.message}`);
      });
      return { passed: false, failures };
    }
  }
}

// Create global performance monitor instance
const performanceMonitor = new BERSPerformanceMonitor();

// Auto-start monitoring in development
if (config.isDevelopment()) {
  performanceMonitor.startMonitoring(60000); // Check every minute in development
}

// Export for external use
export { BERSPerformanceMonitor, performanceMonitor };

// For CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BERSPerformanceMonitor, performanceMonitor };
}

// CLI interface
if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].includes('performance-monitor')) {
  const command = process.argv[2];
  
  switch (command) {
    case 'start':
      performanceMonitor.startMonitoring(30000);
      console.log('Performance monitoring started. Press Ctrl+C to stop.');
      process.on('SIGINT', () => {
        performanceMonitor.stopMonitoring();
        process.exit(0);
      });
      break;
      
    case 'test':
      performanceMonitor.performRegressionTest().then(result => {
        process.exit(result.passed ? 0 : 1);
      });
      break;
      
    case 'report':
      const report = performanceMonitor.generatePerformanceReport();
      console.log('📊 Performance Report:');
      console.log(JSON.stringify(report, null, 2));
      break;
      
    default:
      console.log('Usage: node performance-monitor.js [start|test|report]');
      break;
  }
}
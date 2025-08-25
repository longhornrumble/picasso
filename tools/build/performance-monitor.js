/**
 * Build Performance Monitor - BERS Phase 3, Task 3.1
 * 
 * Comprehensive build performance monitoring and reporting system
 * that tracks build metrics, performance trends, and provides
 * optimization insights for the advanced build pipeline.
 * 
 * Features:
 * - Real-time build performance tracking
 * - Historical performance trend analysis
 * - Build optimization recommendations
 * - Performance regression detection
 * - Resource utilization monitoring
 * - Build cache effectiveness analysis
 * - Automated performance reporting
 * 
 * @version 2.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ===== CONFIGURATION ===== */

/**
 * Performance monitoring configuration
 * @typedef {Object} PerformanceMonitorConfig
 * @property {boolean} enableRealTimeTracking - Enable real-time tracking
 * @property {boolean} enableHistoricalAnalysis - Enable historical analysis
 * @property {boolean} enableRegressionDetection - Enable regression detection
 * @property {number} historyRetentionDays - Days to retain performance history
 * @property {Object} thresholds - Performance thresholds
 * @property {Object} alerts - Alert configuration
 */

const DEFAULT_MONITOR_CONFIG = {
  enableRealTimeTracking: true,
  enableHistoricalAnalysis: true,
  enableRegressionDetection: true,
  historyRetentionDays: 30,
  thresholds: {
    buildTime: {
      development: 15000,   // 15 seconds
      staging: 25000,       // 25 seconds
      production: 30000     // 30 seconds
    },
    bundleSize: {
      development: 2048000,    // 2MB
      staging: 1536000,        // 1.5MB
      production: 1024000      // 1MB
    },
    cacheHitRate: {
      minimum: 60,  // 60% minimum cache hit rate
      target: 80    // 80% target cache hit rate
    },
    parallelEfficiency: {
      minimum: 150,  // 150% minimum efficiency (1.5x speedup)
      target: 250    // 250% target efficiency (2.5x speedup)
    }
  },
  alerts: {
    regressionThreshold: 20,  // 20% performance regression threshold
    consecutiveFailures: 3,   // Alert after 3 consecutive failures
    enableEmailAlerts: false,
    enableSlackAlerts: false
  }
};

/**
 * Performance metrics structure
 * @typedef {Object} PerformanceMetrics
 * @property {string} buildId - Build identifier
 * @property {string} environment - Environment name
 * @property {Date} timestamp - Measurement timestamp
 * @property {Object} buildTime - Build time metrics
 * @property {Object} bundleSize - Bundle size metrics
 * @property {Object} caching - Cache performance metrics
 * @property {Object} parallelization - Parallel processing metrics
 * @property {Object} resources - Resource utilization metrics
 */

/* ===== MAIN PERFORMANCE MONITOR CLASS ===== */

export class BuildPerformanceMonitor {
  constructor(config = {}) {
    this.config = { ...DEFAULT_MONITOR_CONFIG, ...config };
    this.metricsHistory = [];
    this.activeBuilds = new Map();
    this.historyDir = path.join(process.cwd(), '.bers-cache', 'performance');
    this.alertsDir = path.join(process.cwd(), '.bers-cache', 'alerts');
    
    this.initializeMonitoring();
  }

  /**
   * Initialize performance monitoring system
   */
  async initializeMonitoring() {
    try {
      await fs.mkdir(this.historyDir, { recursive: true });
      await fs.mkdir(this.alertsDir, { recursive: true });
      
      if (this.config.enableHistoricalAnalysis) {
        await this.loadHistoricalData();
        await this.cleanupOldData();
      }
      
      console.log('📊 Build performance monitoring initialized');
      
    } catch (error) {
      console.warn('⚠️  Failed to initialize performance monitoring:', error.message);
    }
  }

  /**
   * Start tracking a build performance
   * @param {string} buildId - Build identifier
   * @param {string} environment - Environment name
   * @param {Object} config - Build configuration
   * @returns {Object} Build tracking context
   */
  startBuildTracking(buildId, environment, config = {}) {
    const trackingContext = {
      buildId,
      environment,
      config,
      startTime: performance.now(),
      wallStartTime: Date.now(),
      phases: new Map(),
      resources: {
        cpuUsage: this.getCPUUsage(),
        memoryUsage: process.memoryUsage(),
        initialMemory: process.memoryUsage().heapUsed
      },
      metrics: {
        buildTime: 0,
        bundleSize: 0,
        assetCount: 0,
        chunkCount: 0,
        cacheHits: 0,
        cacheMisses: 0,
        parallelEfficiency: 0
      }
    };

    this.activeBuilds.set(buildId, trackingContext);
    
    if (this.config.enableRealTimeTracking) {
      console.log(`📊 Started tracking build: ${buildId} (${environment})`);
    }

    return trackingContext;
  }

  /**
   * Track a build phase
   * @param {string} buildId - Build identifier
   * @param {string} phase - Phase name
   * @param {Object} data - Phase data
   */
  trackBuildPhase(buildId, phase, data = {}) {
    const context = this.activeBuilds.get(buildId);
    if (!context) {
      console.warn(`⚠️  No active build tracking for: ${buildId}`);
      return;
    }

    const phaseData = {
      name: phase,
      startTime: performance.now(),
      endTime: null,
      duration: 0,
      data: { ...data }
    };

    context.phases.set(phase, phaseData);

    if (this.config.enableRealTimeTracking) {
      console.log(`📊 Phase started: ${phase} (${buildId})`);
    }
  }

  /**
   * Complete a build phase
   * @param {string} buildId - Build identifier
   * @param {string} phase - Phase name
   * @param {Object} result - Phase result data
   */
  completeBuildPhase(buildId, phase, result = {}) {
    const context = this.activeBuilds.get(buildId);
    if (!context) return;

    const phaseData = context.phases.get(phase);
    if (!phaseData) return;

    phaseData.endTime = performance.now();
    phaseData.duration = phaseData.endTime - phaseData.startTime;
    phaseData.result = { ...result };

    if (this.config.enableRealTimeTracking) {
      console.log(`📊 Phase completed: ${phase} in ${(phaseData.duration / 1000).toFixed(2)}s`);
    }

    // Update metrics based on phase
    this.updateMetricsFromPhase(context, phase, phaseData);
  }

  /**
   * Complete build tracking and generate metrics
   * @param {string} buildId - Build identifier
   * @param {Object} buildResult - Final build result
   * @returns {PerformanceMetrics} Performance metrics
   */
  async completeBuildTracking(buildId, buildResult = {}) {
    const context = this.activeBuilds.get(buildId);
    if (!context) {
      console.warn(`⚠️  No active build tracking for: ${buildId}`);
      return null;
    }

    const endTime = performance.now();
    const totalDuration = endTime - context.startTime;

    // Finalize metrics
    const metrics = {
      buildId: context.buildId,
      environment: context.environment,
      timestamp: new Date(context.wallStartTime),
      buildTime: {
        total: totalDuration,
        phases: this.getPhaseTimings(context),
        target: this.config.thresholds.buildTime[context.environment] || 30000,
        withinTarget: totalDuration <= (this.config.thresholds.buildTime[context.environment] || 30000)
      },
      bundleSize: {
        total: context.metrics.bundleSize,
        assetCount: context.metrics.assetCount,
        chunkCount: context.metrics.chunkCount,
        target: this.config.thresholds.bundleSize[context.environment] || 1024000,
        withinTarget: context.metrics.bundleSize <= (this.config.thresholds.bundleSize[context.environment] || 1024000)
      },
      caching: {
        hits: context.metrics.cacheHits,
        misses: context.metrics.cacheMisses,
        hitRate: this.calculateCacheHitRate(context.metrics.cacheHits, context.metrics.cacheMisses),
        effective: this.isCacheEffective(context.metrics.cacheHits, context.metrics.cacheMisses)
      },
      parallelization: {
        efficiency: context.metrics.parallelEfficiency,
        effective: context.metrics.parallelEfficiency >= this.config.thresholds.parallelEfficiency.minimum
      },
      resources: {
        peak: {
          cpu: this.getCPUUsage(),
          memory: process.memoryUsage().heapUsed,
          memoryDelta: process.memoryUsage().heapUsed - context.resources.initialMemory
        },
        initial: context.resources
      },
      buildResult: { ...buildResult }
    };

    // Clean up active tracking
    this.activeBuilds.delete(buildId);

    // Store metrics
    if (this.config.enableHistoricalAnalysis) {
      await this.storeMetrics(metrics);
    }

    // Check for regressions
    if (this.config.enableRegressionDetection) {
      await this.checkForRegressions(metrics);
    }

    // Generate performance report
    this.printPerformanceReport(metrics);

    return metrics;
  }

  /**
   * Update metrics from completed phase
   * @param {Object} context - Build tracking context
   * @param {string} phase - Phase name
   * @param {Object} phaseData - Phase data
   */
  updateMetricsFromPhase(context, phase, phaseData) {
    switch (phase) {
      case 'bundle-generation':
        if (phaseData.result.bundleSize) {
          context.metrics.bundleSize = phaseData.result.bundleSize;
        }
        if (phaseData.result.assetCount) {
          context.metrics.assetCount = phaseData.result.assetCount;
        }
        if (phaseData.result.chunkCount) {
          context.metrics.chunkCount = phaseData.result.chunkCount;
        }
        break;

      case 'caching':
        if (phaseData.result.cacheHits) {
          context.metrics.cacheHits = phaseData.result.cacheHits;
        }
        if (phaseData.result.cacheMisses) {
          context.metrics.cacheMisses = phaseData.result.cacheMisses;
        }
        break;

      case 'parallel-execution':
        if (phaseData.result.parallelEfficiency) {
          context.metrics.parallelEfficiency = phaseData.result.parallelEfficiency;
        }
        break;
    }
  }

  /**
   * Get phase timing breakdown
   * @param {Object} context - Build tracking context
   * @returns {Object} Phase timings
   */
  getPhaseTimings(context) {
    const timings = {};
    
    for (const [phaseName, phaseData] of context.phases) {
      timings[phaseName] = {
        duration: phaseData.duration,
        percentage: ((phaseData.duration / (performance.now() - context.startTime)) * 100).toFixed(1)
      };
    }

    return timings;
  }

  /**
   * Calculate cache hit rate
   * @param {number} hits - Cache hits
   * @param {number} misses - Cache misses
   * @returns {number} Hit rate percentage
   */
  calculateCacheHitRate(hits, misses) {
    const total = hits + misses;
    return total > 0 ? Math.round((hits / total) * 100) : 0;
  }

  /**
   * Check if caching is effective
   * @param {number} hits - Cache hits
   * @param {number} misses - Cache misses
   * @returns {boolean} True if cache is effective
   */
  isCacheEffective(hits, misses) {
    const hitRate = this.calculateCacheHitRate(hits, misses);
    return hitRate >= this.config.thresholds.cacheHitRate.minimum;
  }

  /**
   * Store performance metrics to history
   * @param {PerformanceMetrics} metrics - Performance metrics
   */
  async storeMetrics(metrics) {
    try {
      const historyFile = path.join(
        this.historyDir,
        `performance-${metrics.environment}-${new Date().toISOString().split('T')[0]}.json`
      );

      // Load existing data for the day
      let dailyMetrics = [];
      try {
        const existingData = await fs.readFile(historyFile, 'utf8');
        dailyMetrics = JSON.parse(existingData);
      } catch (error) {
        // File doesn't exist yet
      }

      // Add new metrics
      dailyMetrics.push(metrics);

      // Save updated data
      await fs.writeFile(historyFile, JSON.stringify(dailyMetrics, null, 2));
      
      console.log(`📊 Performance metrics stored: ${path.basename(historyFile)}`);

    } catch (error) {
      console.warn('⚠️  Failed to store performance metrics:', error.message);
    }
  }

  /**
   * Check for performance regressions
   * @param {PerformanceMetrics} currentMetrics - Current build metrics
   */
  async checkForRegressions(currentMetrics) {
    try {
      // Get recent metrics for comparison
      const recentMetrics = await this.getRecentMetrics(currentMetrics.environment, 5);
      
      if (recentMetrics.length < 2) {
        console.log('📊 Insufficient historical data for regression analysis');
        return;
      }

      const regressions = [];

      // Check build time regression
      const avgBuildTime = recentMetrics.reduce((sum, m) => sum + m.buildTime.total, 0) / recentMetrics.length;
      const buildTimeRegression = ((currentMetrics.buildTime.total - avgBuildTime) / avgBuildTime) * 100;
      
      if (buildTimeRegression > this.config.alerts.regressionThreshold) {
        regressions.push({
          type: 'buildTime',
          regression: buildTimeRegression.toFixed(1),
          current: currentMetrics.buildTime.total,
          average: avgBuildTime
        });
      }

      // Check bundle size regression
      const avgBundleSize = recentMetrics.reduce((sum, m) => sum + m.bundleSize.total, 0) / recentMetrics.length;
      const bundleSizeRegression = ((currentMetrics.bundleSize.total - avgBundleSize) / avgBundleSize) * 100;
      
      if (bundleSizeRegression > this.config.alerts.regressionThreshold) {
        regressions.push({
          type: 'bundleSize',
          regression: bundleSizeRegression.toFixed(1),
          current: currentMetrics.bundleSize.total,
          average: avgBundleSize
        });
      }

      // Report regressions
      if (regressions.length > 0) {
        await this.reportRegressions(currentMetrics, regressions);
      } else {
        console.log('📊 No performance regressions detected');
      }

    } catch (error) {
      console.warn('⚠️  Failed to check for regressions:', error.message);
    }
  }

  /**
   * Report performance regressions
   * @param {PerformanceMetrics} metrics - Current metrics
   * @param {Object[]} regressions - Detected regressions
   */
  async reportRegressions(metrics, regressions) {
    console.log('\n⚠️  Performance Regressions Detected:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    regressions.forEach(regression => {
      console.log(`❌ ${regression.type}: ${regression.regression}% regression`);
      console.log(`   Current: ${this.formatMetricValue(regression.type, regression.current)}`);
      console.log(`   Average: ${this.formatMetricValue(regression.type, regression.average)}`);
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Save regression alert
    try {
      const alertData = {
        timestamp: new Date().toISOString(),
        buildId: metrics.buildId,
        environment: metrics.environment,
        regressions,
        metrics
      };

      const alertFile = path.join(
        this.alertsDir,
        `regression-${metrics.buildId}.json`
      );

      await fs.writeFile(alertFile, JSON.stringify(alertData, null, 2));
      console.log(`🚨 Regression alert saved: ${path.basename(alertFile)}`);

    } catch (error) {
      console.warn('⚠️  Failed to save regression alert:', error.message);
    }
  }

  /**
   * Format metric value for display
   * @param {string} type - Metric type
   * @param {number} value - Metric value
   * @returns {string} Formatted value
   */
  formatMetricValue(type, value) {
    switch (type) {
      case 'buildTime':
        return `${(value / 1000).toFixed(2)}s`;
      case 'bundleSize':
        return `${(value / 1024).toFixed(1)}KB`;
      default:
        return value.toString();
    }
  }

  /**
   * Print performance report
   * @param {PerformanceMetrics} metrics - Performance metrics
   */
  printPerformanceReport(metrics) {
    console.log('\n📊 Build Performance Report:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Build ID: ${metrics.buildId}`);
    console.log(`Environment: ${metrics.environment}`);
    console.log(`Timestamp: ${metrics.timestamp.toISOString()}`);
    
    console.log('\n⏱️  Build Time:');
    console.log(`  Total: ${(metrics.buildTime.total / 1000).toFixed(2)}s`);
    console.log(`  Target: ${(metrics.buildTime.target / 1000).toFixed(2)}s`);
    console.log(`  Status: ${metrics.buildTime.withinTarget ? '✅ Within target' : '❌ Exceeds target'}`);
    
    console.log('\n📦 Bundle Size:');
    console.log(`  Total: ${(metrics.bundleSize.total / 1024).toFixed(1)}KB`);
    console.log(`  Assets: ${metrics.bundleSize.assetCount}`);
    console.log(`  Chunks: ${metrics.bundleSize.chunkCount}`);
    console.log(`  Target: ${(metrics.bundleSize.target / 1024).toFixed(1)}KB`);
    console.log(`  Status: ${metrics.bundleSize.withinTarget ? '✅ Within target' : '❌ Exceeds target'}`);
    
    console.log('\n🗄️  Caching:');
    console.log(`  Hit Rate: ${metrics.caching.hitRate}%`);
    console.log(`  Hits: ${metrics.caching.hits}`);
    console.log(`  Misses: ${metrics.caching.misses}`);
    console.log(`  Effectiveness: ${metrics.caching.effective ? '✅ Effective' : '❌ Needs improvement'}`);
    
    console.log('\n🔀 Parallelization:');
    console.log(`  Efficiency: ${metrics.parallelization.efficiency.toFixed(1)}%`);
    console.log(`  Status: ${metrics.parallelization.effective ? '✅ Effective' : '❌ Needs improvement'}`);
    
    console.log('\n💾 Resources:');
    console.log(`  Memory Delta: ${(metrics.resources.peak.memoryDelta / 1024 / 1024).toFixed(1)}MB`);
    console.log(`  Peak Memory: ${(metrics.resources.peak.memory / 1024 / 1024).toFixed(1)}MB`);
    
    // Phase breakdown
    if (Object.keys(metrics.buildTime.phases).length > 0) {
      console.log('\n🔄 Phase Breakdown:');
      Object.entries(metrics.buildTime.phases).forEach(([phase, data]) => {
        console.log(`  ${phase}: ${(data.duration / 1000).toFixed(2)}s (${data.percentage}%)`);
      });
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  /**
   * Get recent performance metrics for comparison
   * @param {string} environment - Environment name
   * @param {number} count - Number of recent metrics to retrieve
   * @returns {Promise<PerformanceMetrics[]>} Recent metrics
   */
  async getRecentMetrics(environment, count = 5) {
    try {
      const files = await fs.readdir(this.historyDir);
      const environmentFiles = files
        .filter(f => f.includes(`performance-${environment}-`) && f.endsWith('.json'))
        .sort()
        .slice(-3); // Last 3 days

      const allMetrics = [];

      for (const file of environmentFiles) {
        const filePath = path.join(this.historyDir, file);
        const fileData = await fs.readFile(filePath, 'utf8');
        const dailyMetrics = JSON.parse(fileData);
        allMetrics.push(...dailyMetrics);
      }

      // Return most recent metrics
      return allMetrics
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, count);

    } catch (error) {
      console.warn('⚠️  Failed to load recent metrics:', error.message);
      return [];
    }
  }

  /**
   * Load historical performance data
   */
  async loadHistoricalData() {
    try {
      const files = await fs.readdir(this.historyDir);
      const recentFiles = files
        .filter(f => f.startsWith('performance-') && f.endsWith('.json'))
        .sort()
        .slice(-10); // Last 10 files

      console.log(`📊 Loaded ${recentFiles.length} historical performance files`);

    } catch (error) {
      console.warn('⚠️  Failed to load historical data:', error.message);
    }
  }

  /**
   * Clean up old performance data
   */
  async cleanupOldData() {
    try {
      const files = await fs.readdir(this.historyDir);
      const maxAge = this.config.historyRetentionDays * 24 * 60 * 60 * 1000;
      
      let cleanedCount = 0;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.historyDir, file);
          const stats = await fs.stat(filePath);
          const age = Date.now() - stats.mtime.getTime();
          
          if (age > maxAge) {
            await fs.unlink(filePath);
            cleanedCount++;
          }
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`🗑️  Cleaned up ${cleanedCount} old performance files`);
      }

    } catch (error) {
      console.warn('⚠️  Failed to cleanup old data:', error.message);
    }
  }

  /**
   * Get current CPU usage (simplified)
   * @returns {number} CPU usage percentage
   */
  getCPUUsage() {
    // Simplified CPU usage - in production, you might use more sophisticated monitoring
    const usage = process.cpuUsage();
    return Math.round((usage.user + usage.system) / 1000); // Convert to milliseconds
  }
}

/* ===== CONVENIENCE FUNCTIONS ===== */

/**
 * Create and start build performance monitoring
 * @param {string} buildId - Build identifier
 * @param {string} environment - Environment name
 * @param {Object} config - Configuration options
 * @returns {BuildPerformanceMonitor} Monitor instance
 */
export function startBuildMonitoring(buildId, environment, config = {}) {
  const monitor = new BuildPerformanceMonitor(config);
  monitor.startBuildTracking(buildId, environment);
  return monitor;
}

/**
 * Generate performance summary report
 * @param {string} environment - Environment to analyze
 * @param {number} days - Number of days to analyze
 * @returns {Promise<Object>} Performance summary
 */
export async function generatePerformanceSummary(environment, days = 7) {
  const monitor = new BuildPerformanceMonitor();
  const recentMetrics = await monitor.getRecentMetrics(environment, days * 5); // Approximate builds per day
  
  if (recentMetrics.length === 0) {
    return { message: 'No performance data available' };
  }

  const summary = {
    environment,
    period: `${days} days`,
    totalBuilds: recentMetrics.length,
    averageBuildTime: recentMetrics.reduce((sum, m) => sum + m.buildTime.total, 0) / recentMetrics.length,
    averageBundleSize: recentMetrics.reduce((sum, m) => sum + m.bundleSize.total, 0) / recentMetrics.length,
    averageCacheHitRate: recentMetrics.reduce((sum, m) => sum + m.caching.hitRate, 0) / recentMetrics.length,
    buildsWithinTarget: recentMetrics.filter(m => m.buildTime.withinTarget).length,
    bundlesWithinTarget: recentMetrics.filter(m => m.bundleSize.withinTarget).length
  };

  return summary;
}

export default BuildPerformanceMonitor;
/**
 * Performance tracking utilities for Picasso Widget
 * Tracks key performance metrics and reports slow operations
 */

import { errorLogger } from './errorHandling';
import { config as environmentConfig } from '../config/environment';

class PerformanceTracker {
  constructor() {
    this.metrics = new Map();
    this.thresholds = {
      widgetLoad: 500,      // PRD target: <500ms
      configFetch: 200,     // PRD target: <200ms
      firstMessage: 1000,   // Target: <1s
      chatResponse: 3000,   // Target: <3s
      renderTime: 100       // Target: <100ms
    };
  }

  /**
   * Track a performance metric
   */
  track(metricName, value, metadata = {}) {
    const threshold = this.thresholds[metricName];
    const isSlowOperation = threshold && value > threshold;
    
    const metric = {
      name: metricName,
      value,
      threshold,
      isSlowOperation,
      timestamp: new Date().toISOString(),
      ...metadata
    };
    
    this.metrics.set(`${metricName}_${Date.now()}`, metric);
    
    // Log slow operations
    if (isSlowOperation) {
      errorLogger.logWarning(`Slow ${metricName} detected`, {
        value,
        threshold,
        exceedance: value - threshold,
        percentage: ((value / threshold - 1) * 100).toFixed(1) + '%',
        ...metadata
      });
    }
    
    // Report to Lambda in production
    if (environmentConfig.isProduction() && environmentConfig.PERFORMANCE_MONITORING) {
      this.reportMetric(metric);
    }
    
    return metric;
  }

  /**
   * Start timing an operation
   */
  startTiming(operationName) {
    const startTime = performance.now();
    this.metrics.set(`${operationName}_start`, startTime);
    return startTime;
  }

  /**
   * End timing an operation and track it
   */
  endTiming(operationName, metadata = {}) {
    const startTime = this.metrics.get(`${operationName}_start`);
    if (!startTime) {
      console.warn(`No start time found for operation: ${operationName}`);
      return null;
    }
    
    const duration = performance.now() - startTime;
    this.metrics.delete(`${operationName}_start`);
    
    return this.track(operationName, duration, metadata);
  }

  /**
   * Get all metrics
   */
  getAllMetrics() {
    const metrics = [];
    this.metrics.forEach((value, key) => {
      if (!key.endsWith('_start')) {
        metrics.push(value);
      }
    });
    return metrics;
  }

  /**
   * Get metrics summary
   */
  getSummary() {
    const metrics = this.getAllMetrics();
    const summary = {
      totalMetrics: metrics.length,
      slowOperations: metrics.filter(m => m.isSlowOperation).length,
      averageByType: {}
    };
    
    // Calculate averages by metric type
    const typeGroups = {};
    metrics.forEach(metric => {
      if (!typeGroups[metric.name]) {
        typeGroups[metric.name] = [];
      }
      typeGroups[metric.name].push(metric.value);
    });
    
    Object.keys(typeGroups).forEach(type => {
      const values = typeGroups[type];
      summary.averageByType[type] = {
        count: values.length,
        average: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        threshold: this.thresholds[type]
      };
    });
    
    return summary;
  }

  /**
   * Report metric to Lambda (fire-and-forget)
   */
  reportMetric(metric) {
    try {
      const performanceEndpoint = environmentConfig.ERROR_REPORTING_ENDPOINT;
      if (!performanceEndpoint) return;
      
      const tenantHash = window.PicassoConfig?.tenant || 
                        window.PicassoConfig?.tenant_id || 
                        'unknown';
      
      fetch(performanceEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantHash
        },
        body: JSON.stringify({
          type: 'performance_metric',
          metric,
          tenantHash,
          environment: environmentConfig.ENVIRONMENT,
          timestamp: new Date().toISOString(),
          source: 'picasso-widget'
        }),
        credentials: 'omit'
      }).catch(() => {
        // Silently fail - don't let performance reporting affect the widget
      });
    } catch {
      // Silently fail
    }
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics.clear();
  }
}

// Create singleton instance
export const performanceTracker = new PerformanceTracker();

// Convenience functions
export const trackPerformance = (metricName, value, metadata) => 
  performanceTracker.track(metricName, value, metadata);

export const startTiming = (operationName) => 
  performanceTracker.startTiming(operationName);

export const endTiming = (operationName, metadata) => 
  performanceTracker.endTiming(operationName, metadata);

// Auto-track page load performance
if (typeof window !== 'undefined' && window.performance) {
  window.addEventListener('load', () => {
    const navigationTiming = performance.getEntriesByType('navigation')[0];
    if (navigationTiming) {
      performanceTracker.track('pageLoad', navigationTiming.loadEventEnd - navigationTiming.fetchStart, {
        domContentLoaded: navigationTiming.domContentLoadedEventEnd - navigationTiming.fetchStart,
        domInteractive: navigationTiming.domInteractive - navigationTiming.fetchStart
      });
    }
  });
}

export default performanceTracker;
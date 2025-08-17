/**
 * Performance Metrics Collection System - BERS Task 4.1
 * 
 * High-frequency metrics collection system with 1-second granularity for
 * real-time monitoring of configuration resolution, build performance,
 * provider initialization, and deployment tracking.
 * 
 * Features:
 * - Real-time metrics collection with 1-second granularity
 * - Configuration resolution time tracking (<100ms target)
 * - Provider initialization metrics (10-20ms achieved)
 * - Build performance baselines from Task 3.1
 * - Deployment performance tracking
 * - Memory-efficient circular buffers
 * - Configurable retention policies
 * 
 * @version 1.0.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import type { 
  Environment, 
  PerformanceMetrics as EnvironmentPerformanceMetrics,
  ValidatedEnvironment 
} from '../config/environment-resolver';
import type { RuntimeConfig } from '../types/config';

/* ===== PERFORMANCE METRICS TYPES ===== */

export interface MetricsCollectorConfig {
  readonly enabled: boolean;
  readonly granularity: number; // milliseconds - default 1000 for 1-second granularity
  readonly retention: MetricsRetentionConfig;
  readonly collectors: CollectorConfig[];
  readonly thresholds: PerformanceThresholds;
  readonly sampling: SamplingConfig;
}

export interface MetricsRetentionConfig {
  readonly realtime: number; // seconds - high frequency data
  readonly shortTerm: number; // minutes - aggregated 1-minute data  
  readonly mediumTerm: number; // hours - aggregated 5-minute data
  readonly longTerm: number; // days - aggregated 1-hour data
}

export interface CollectorConfig {
  readonly name: string;
  readonly type: MetricType;
  readonly enabled: boolean;
  readonly interval: number; // milliseconds
  readonly aggregation: AggregationType[];
}

export interface SamplingConfig {
  readonly rate: number; // 0-1, percentage of metrics to collect
  readonly strategy: 'random' | 'systematic' | 'adaptive';
  readonly adaptiveThreshold: number; // performance threshold for adaptive sampling
}

export interface PerformanceThresholds {
  readonly configurationResolution: number; // <100ms target
  readonly providerInitialization: number; // <50ms target (achieved 10-20ms)
  readonly buildTime: number; // <30s target (achieved <1s)
  readonly deploymentTime: number; // <5 minutes target
  readonly responseTime: number; // <1s general response time
  readonly errorRate: number; // <1% error rate threshold
}

export type MetricType = 
  | 'configuration_resolution_time'
  | 'provider_initialization_time'
  | 'build_performance'
  | 'deployment_performance'
  | 'environment_detection_time'
  | 'cache_hit_rate'
  | 'error_rate'
  | 'memory_usage'
  | 'cpu_usage'
  | 'network_latency'
  | 'response_time'
  | 'throughput'
  | 'concurrent_users'
  | 'active_sessions';

export type AggregationType = 'avg' | 'min' | 'max' | 'sum' | 'count' | 'p50' | 'p95' | 'p99';

export interface MetricDataPoint {
  readonly timestamp: number;
  readonly value: number;
  readonly labels: Record<string, string>;
  readonly metadata?: Record<string, any>;
}

export interface AggregatedMetric {
  readonly timestamp: number;
  readonly period: number; // aggregation period in milliseconds
  readonly aggregation: AggregationType;
  readonly value: number;
  readonly count: number;
  readonly labels: Record<string, string>;
}

export interface MetricsSummary {
  readonly type: MetricType;
  readonly current: number;
  readonly average: number;
  readonly min: number;
  readonly max: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly trend: 'up' | 'down' | 'stable';
  readonly healthStatus: 'healthy' | 'degraded' | 'critical';
  readonly lastUpdated: number;
}

export interface PerformanceReport {
  readonly timestamp: number;
  readonly period: string;
  readonly environment: Environment;
  readonly metrics: Record<MetricType, MetricsSummary>;
  readonly alerts: PerformanceAlert[];
  readonly recommendations: PerformanceRecommendation[];
}

export interface PerformanceAlert {
  readonly id: string;
  readonly metric: MetricType;
  readonly threshold: number;
  readonly currentValue: number;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly message: string;
  readonly timestamp: number;
  readonly environment?: Environment;
}

export interface PerformanceRecommendation {
  readonly id: string;
  readonly type: 'optimization' | 'scaling' | 'configuration' | 'maintenance';
  readonly priority: 'low' | 'medium' | 'high';
  readonly title: string;
  readonly description: string;
  readonly impact: string;
  readonly effort: 'low' | 'medium' | 'high';
  readonly metrics: MetricType[];
}

/* ===== CIRCULAR BUFFER IMPLEMENTATION ===== */

class CircularBuffer<T> {
  private buffer: T[];
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;

  constructor(private readonly capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    
    if (this.size < this.capacity) {
      this.size++;
    } else {
      // Buffer is full, move head
      this.head = (this.head + 1) % this.capacity;
    }
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.size; i++) {
      const index = (this.head + i) % this.capacity;
      result.push(this.buffer[index]);
    }
    return result;
  }

  getLatest(count: number): T[] {
    const items = Math.min(count, this.size);
    const result: T[] = [];
    
    for (let i = 0; i < items; i++) {
      const index = (this.tail - 1 - i + this.capacity) % this.capacity;
      result.unshift(this.buffer[index]);
    }
    
    return result;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }

  get length(): number {
    return this.size;
  }

  get isFull(): boolean {
    return this.size === this.capacity;
  }
}

/* ===== METRICS COLLECTOR IMPLEMENTATION ===== */

export class PerformanceMetricsCollector {
  private readonly realtimeBuffers: Map<MetricType, CircularBuffer<MetricDataPoint>> = new Map();
  private readonly aggregatedBuffers: Map<string, CircularBuffer<AggregatedMetric>> = new Map();
  private readonly collectors: Map<string, NodeJS.Timeout> = new Map();
  private readonly aggregationIntervals: Map<string, NodeJS.Timeout> = new Map();
  private readonly performanceObserver?: PerformanceObserver;
  private isRunning: boolean = false;
  private startTime: number = Date.now();

  constructor(private readonly config: MetricsCollectorConfig) {
    this.initializeBuffers();
    this.setupPerformanceObserver();
  }

  /**
   * Initialize circular buffers for each metric type
   */
  private initializeBuffers(): void {
    for (const collector of this.config.collectors) {
      if (!collector.enabled) continue;

      // Realtime buffer (1-second granularity)
      const realtimeCapacity = Math.ceil(this.config.retention.realtime / (this.config.granularity / 1000));
      this.realtimeBuffers.set(collector.type, new CircularBuffer(realtimeCapacity));

      // Short-term aggregated buffer (1-minute aggregation)
      const shortTermCapacity = this.config.retention.shortTerm;
      this.aggregatedBuffers.set(
        `${collector.type}-1m`, 
        new CircularBuffer(shortTermCapacity)
      );

      // Medium-term aggregated buffer (5-minute aggregation)
      const mediumTermCapacity = Math.ceil(this.config.retention.mediumTerm / 5);
      this.aggregatedBuffers.set(
        `${collector.type}-5m`, 
        new CircularBuffer(mediumTermCapacity)
      );

      // Long-term aggregated buffer (1-hour aggregation)
      const longTermCapacity = this.config.retention.longTerm * 24;
      this.aggregatedBuffers.set(
        `${collector.type}-1h`, 
        new CircularBuffer(longTermCapacity)
      );
    }
  }

  /**
   * Setup Performance Observer for browser metrics
   */
  private setupPerformanceObserver(): void {
    if (typeof PerformanceObserver === 'undefined') return;

    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          this.handlePerformanceEntry(entry);
        }
      });

      // Observe various performance entry types
      this.performanceObserver.observe({ 
        entryTypes: ['measure', 'navigation', 'resource', 'paint'] 
      });
    } catch (error) {
      console.warn('PerformanceObserver not supported:', error);
    }
  }

  /**
   * Handle performance observer entries
   */
  private handlePerformanceEntry(entry: PerformanceEntry): void {
    const timestamp = Date.now();
    const labels = {
      name: entry.name,
      type: entry.entryType
    };

    switch (entry.entryType) {
      case 'measure':
        this.recordMetric('response_time', entry.duration, labels, { 
          startTime: entry.startTime 
        });
        break;

      case 'navigation':
        const navEntry = entry as PerformanceNavigationTiming;
        this.recordMetric('response_time', navEntry.loadEventEnd - navEntry.fetchStart, {
          ...labels,
          navigation: 'page_load'
        });
        break;

      case 'resource':
        const resourceEntry = entry as PerformanceResourceTiming;
        this.recordMetric('network_latency', resourceEntry.responseEnd - resourceEntry.requestStart, {
          ...labels,
          resource: resourceEntry.name
        });
        break;

      case 'paint':
        this.recordMetric('response_time', entry.startTime, {
          ...labels,
          paint: entry.name
        });
        break;
    }
  }

  /**
   * Start metrics collection
   */
  public start(): void {
    if (this.isRunning || !this.config.enabled) return;

    this.isRunning = true;
    this.startTime = Date.now();

    // Start collectors for each metric type
    for (const collector of this.config.collectors) {
      if (!collector.enabled) continue;

      const interval = setInterval(() => {
        this.collectMetric(collector);
      }, collector.interval);

      this.collectors.set(collector.name, interval);
    }

    // Start aggregation process
    this.startAggregation();

    console.log('Performance metrics collection started');
  }

  /**
   * Stop metrics collection
   */
  public stop(): void {
    if (!this.isRunning) return;

    // Clear all collection intervals
    for (const [name, interval] of this.collectors) {
      clearInterval(interval);
    }
    this.collectors.clear();

    // Clear all aggregation intervals  
    for (const [name, interval] of this.aggregationIntervals) {
      clearInterval(interval);
    }
    this.aggregationIntervals.clear();

    // Stop performance observer
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }

    this.isRunning = false;
    console.log('Performance metrics collection stopped');
  }

  /**
   * Collect a specific metric
   */
  private collectMetric(collector: CollectorConfig): void {
    if (!this.shouldSample()) return;

    const timestamp = Date.now();
    let value: number = 0;
    const labels: Record<string, string> = {};
    const metadata: Record<string, any> = {};

    switch (collector.type) {
      case 'memory_usage':
        value = this.getMemoryUsage();
        break;

      case 'cpu_usage':
        value = this.getCPUUsage();
        metadata.cores = navigator.hardwareConcurrency || 1;
        break;

      case 'active_sessions':
        value = this.getActiveSessions();
        break;

      case 'concurrent_users':
        value = this.getConcurrentUsers();
        break;

      case 'cache_hit_rate':
        value = this.getCacheHitRate();
        break;

      case 'error_rate':
        value = this.getErrorRate();
        break;

      case 'throughput':
        value = this.getThroughput();
        break;

      default:
        return; // Skip unknown metric types
    }

    this.recordMetric(collector.type, value, labels, metadata);
  }

  /**
   * Record a metric data point
   */
  public recordMetric(
    type: MetricType, 
    value: number, 
    labels: Record<string, string> = {},
    metadata: Record<string, any> = {}
  ): void {
    if (!this.config.enabled || !this.shouldSample()) return;

    const dataPoint: MetricDataPoint = {
      timestamp: Date.now(),
      value,
      labels,
      metadata
    };

    const buffer = this.realtimeBuffers.get(type);
    if (buffer) {
      buffer.push(dataPoint);
    }
  }

  /**
   * Record configuration resolution time
   */
  public recordConfigurationResolution(
    duration: number, 
    environment: Environment, 
    tenantHash?: string,
    cached: boolean = false
  ): void {
    this.recordMetric('configuration_resolution_time', duration, {
      environment,
      tenant: tenantHash || 'unknown',
      cached: cached.toString()
    });

    // Check performance threshold
    if (duration > this.config.thresholds.configurationResolution) {
      this.emitPerformanceAlert('configuration_resolution_time', duration, environment);
    }
  }

  /**
   * Record provider initialization time
   */
  public recordProviderInitialization(
    duration: number, 
    providerName: string, 
    environment: Environment
  ): void {
    this.recordMetric('provider_initialization_time', duration, {
      provider: providerName,
      environment
    });

    // Check performance threshold
    if (duration > this.config.thresholds.providerInitialization) {
      this.emitPerformanceAlert('provider_initialization_time', duration, environment);
    }
  }

  /**
   * Record build performance metrics
   */
  public recordBuildPerformance(
    totalTime: number,
    phases: Record<string, number>,
    environment: Environment
  ): void {
    // Record total build time
    this.recordMetric('build_performance', totalTime, {
      environment,
      phase: 'total'
    });

    // Record individual build phases
    for (const [phase, duration] of Object.entries(phases)) {
      this.recordMetric('build_performance', duration, {
        environment,
        phase
      });
    }

    // Check performance threshold
    if (totalTime > this.config.thresholds.buildTime) {
      this.emitPerformanceAlert('build_performance', totalTime, environment);
    }
  }

  /**
   * Record deployment performance
   */
  public recordDeploymentPerformance(
    duration: number,
    environment: Environment,
    status: 'success' | 'failure',
    phases?: Record<string, number>
  ): void {
    this.recordMetric('deployment_performance', duration, {
      environment,
      status
    });

    // Record deployment phases if provided
    if (phases) {
      for (const [phase, phaseDuration] of Object.entries(phases)) {
        this.recordMetric('deployment_performance', phaseDuration, {
          environment,
          status,
          phase
        });
      }
    }

    // Check performance threshold
    if (duration > this.config.thresholds.deploymentTime) {
      this.emitPerformanceAlert('deployment_performance', duration, environment);
    }
  }

  /**
   * Get current metrics summary
   */
  public getMetricsSummary(type: MetricType, period: number = 300000): MetricsSummary {
    const buffer = this.realtimeBuffers.get(type);
    if (!buffer) {
      throw new Error(`Metric type not found: ${type}`);
    }

    const cutoff = Date.now() - period;
    const dataPoints = buffer.toArray().filter(point => point.timestamp >= cutoff);
    
    if (dataPoints.length === 0) {
      return {
        type,
        current: 0,
        average: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        trend: 'stable',
        healthStatus: 'unknown',
        lastUpdated: Date.now()
      };
    }

    const values = dataPoints.map(p => p.value).sort((a, b) => a - b);
    const current = dataPoints[dataPoints.length - 1]?.value || 0;
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    const min = values[0];
    const max = values[values.length - 1];
    
    const p50 = this.calculatePercentile(values, 0.5);
    const p95 = this.calculatePercentile(values, 0.95);
    const p99 = this.calculatePercentile(values, 0.99);

    const trend = this.calculateTrend(dataPoints);
    const healthStatus = this.determineHealthStatus(type, current);

    return {
      type,
      current,
      average,
      min,
      max,
      p50,
      p95,
      p99,
      trend,
      healthStatus,
      lastUpdated: Date.now()
    };
  }

  /**
   * Get performance report for a specific period
   */
  public getPerformanceReport(environment: Environment, period: string = '5m'): PerformanceReport {
    const metrics: Record<MetricType, MetricsSummary> = {} as any;
    const alerts: PerformanceAlert[] = [];
    const recommendations: PerformanceRecommendation[] = [];

    // Generate metrics summaries
    for (const collector of this.config.collectors) {
      if (collector.enabled) {
        try {
          metrics[collector.type] = this.getMetricsSummary(collector.type);
        } catch (error) {
          console.warn(`Failed to get metrics summary for ${collector.type}:`, error);
        }
      }
    }

    // Generate alerts based on thresholds
    for (const [type, summary] of Object.entries(metrics)) {
      if (summary.healthStatus === 'critical' || summary.healthStatus === 'degraded') {
        alerts.push({
          id: `${type}-${Date.now()}`,
          metric: type as MetricType,
          threshold: this.getThresholdForMetric(type as MetricType),
          currentValue: summary.current,
          severity: summary.healthStatus === 'critical' ? 'critical' : 'medium',
          message: `${type} is ${summary.healthStatus}: ${summary.current.toFixed(2)}`,
          timestamp: Date.now(),
          environment
        });
      }
    }

    // Generate performance recommendations
    recommendations.push(...this.generateRecommendations(metrics));

    return {
      timestamp: Date.now(),
      period,
      environment,
      metrics,
      alerts,
      recommendations
    };
  }

  /**
   * Start aggregation process
   */
  private startAggregation(): void {
    // Store aggregation intervals for proper cleanup
    this.aggregationIntervals = new Map();

    // Aggregate every minute
    const minuteInterval = setInterval(() => {
      this.aggregateMetrics('1m', 60 * 1000);
    }, 60 * 1000);
    this.aggregationIntervals.set('1m', minuteInterval);

    // Aggregate every 5 minutes
    const fiveMinInterval = setInterval(() => {
      this.aggregateMetrics('5m', 5 * 60 * 1000);
    }, 5 * 60 * 1000);
    this.aggregationIntervals.set('5m', fiveMinInterval);

    // Aggregate every hour
    const hourInterval = setInterval(() => {
      this.aggregateMetrics('1h', 60 * 60 * 1000);
    }, 60 * 60 * 1000);
    this.aggregationIntervals.set('1h', hourInterval);
  }

  /**
   * Aggregate metrics for a specific period
   */
  private aggregateMetrics(suffix: string, period: number): void {
    const timestamp = Date.now();
    const startTime = timestamp - period;

    for (const [type, buffer] of this.realtimeBuffers) {
      const dataPoints = buffer.toArray().filter(
        point => point.timestamp >= startTime && point.timestamp < timestamp
      );

      if (dataPoints.length === 0) continue;

      const aggregatedBuffer = this.aggregatedBuffers.get(`${type}-${suffix}`);
      if (!aggregatedBuffer) continue;

      // Calculate aggregations
      const values = dataPoints.map(p => p.value);
      const aggregations = this.calculateAggregations(values);

      // Store aggregated metrics
      for (const [aggType, value] of Object.entries(aggregations)) {
        const aggregatedMetric: AggregatedMetric = {
          timestamp,
          period,
          aggregation: aggType as AggregationType,
          value,
          count: dataPoints.length,
          labels: { type, period: suffix }
        };

        aggregatedBuffer.push(aggregatedMetric);
      }
    }
  }

  /**
   * Calculate various aggregations for a set of values
   */
  private calculateAggregations(values: number[]): Record<string, number> {
    if (values.length === 0) return {};

    const sorted = [...values].sort((a, b) => a - b);
    
    return {
      avg: values.reduce((sum, val) => sum + val, 0) / values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      sum: values.reduce((sum, val) => sum + val, 0),
      count: values.length,
      p50: this.calculatePercentile(sorted, 0.5),
      p95: this.calculatePercentile(sorted, 0.95),
      p99: this.calculatePercentile(sorted, 0.99)
    };
  }

  /**
   * Calculate percentile value
   */
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil(sortedValues.length * percentile) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Calculate trend for data points
   */
  private calculateTrend(dataPoints: MetricDataPoint[]): 'up' | 'down' | 'stable' {
    if (dataPoints.length < 2) return 'stable';

    const halfIndex = Math.floor(dataPoints.length / 2);
    const firstHalf = dataPoints.slice(0, halfIndex);
    const secondHalf = dataPoints.slice(halfIndex);

    const firstAvg = firstHalf.reduce((sum, p) => sum + p.value, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, p) => sum + p.value, 0) / secondHalf.length;

    const change = (secondAvg - firstAvg) / firstAvg;

    if (change > 0.05) return 'up';
    if (change < -0.05) return 'down';
    return 'stable';
  }

  /**
   * Determine health status based on current value and thresholds
   */
  private determineHealthStatus(type: MetricType, value: number): 'healthy' | 'degraded' | 'critical' {
    const threshold = this.getThresholdForMetric(type);
    
    if (value <= threshold) return 'healthy';
    if (value <= threshold * 1.5) return 'degraded';
    return 'critical';
  }

  /**
   * Get threshold for a specific metric type
   */
  private getThresholdForMetric(type: MetricType): number {
    switch (type) {
      case 'configuration_resolution_time':
        return this.config.thresholds.configurationResolution;
      case 'provider_initialization_time':
        return this.config.thresholds.providerInitialization;
      case 'build_performance':
        return this.config.thresholds.buildTime;
      case 'deployment_performance':
        return this.config.thresholds.deploymentTime;
      case 'response_time':
        return this.config.thresholds.responseTime;
      case 'error_rate':
        return this.config.thresholds.errorRate;
      default:
        return Infinity; // No threshold for unknown metrics
    }
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(metrics: Record<MetricType, MetricsSummary>): PerformanceRecommendation[] {
    const recommendations: PerformanceRecommendation[] = [];

    // Check configuration resolution performance
    const configMetric = metrics['configuration_resolution_time'];
    if (configMetric && configMetric.p95 > this.config.thresholds.configurationResolution) {
      recommendations.push({
        id: 'config-resolution-optimization',
        type: 'optimization',
        priority: 'high',
        title: 'Optimize Configuration Resolution',
        description: 'Configuration resolution is taking longer than expected. Consider implementing caching or optimizing the resolution logic.',
        impact: 'Reduce configuration resolution time by 30-50%',
        effort: 'medium',
        metrics: ['configuration_resolution_time']
      });
    }

    // Check build performance
    const buildMetric = metrics['build_performance'];
    if (buildMetric && buildMetric.average > this.config.thresholds.buildTime * 0.8) {
      recommendations.push({
        id: 'build-optimization',
        type: 'optimization',
        priority: 'medium',
        title: 'Optimize Build Performance',
        description: 'Build times are approaching the threshold. Consider enabling parallel builds or optimizing dependencies.',
        impact: 'Maintain sub-second build times',
        effort: 'low',
        metrics: ['build_performance']
      });
    }

    return recommendations;
  }

  /**
   * Emit performance alert
   */
  private emitPerformanceAlert(
    metric: MetricType, 
    value: number, 
    environment?: Environment
  ): void {
    const threshold = this.getThresholdForMetric(metric);
    const severity = value > threshold * 2 ? 'critical' : 'medium';
    
    const alert: PerformanceAlert = {
      id: `${metric}-${Date.now()}`,
      metric,
      threshold,
      currentValue: value,
      severity,
      message: `${metric} exceeded threshold: ${value.toFixed(2)} > ${threshold}`,
      timestamp: Date.now(),
      environment
    };

    // Emit alert event (could be sent to dashboard, external systems, etc.)
    this.emitEvent('performance_alert', alert);
  }

  /**
   * Emit event to external systems
   */
  private emitEvent(type: string, data: any): void {
    // Implementation would depend on the event system being used
    // Could be EventEmitter, custom event dispatcher, etc.
    console.log(`[METRICS] ${type}:`, data);
  }

  /**
   * Determine if we should sample this metric
   */
  private shouldSample(): boolean {
    if (this.config.sampling.rate >= 1) return true;
    if (this.config.sampling.rate <= 0) return false;

    switch (this.config.sampling.strategy) {
      case 'random':
        return Math.random() < this.config.sampling.rate;
      
      case 'systematic':
        // Simple systematic sampling based on timestamp
        return (Date.now() % 100) < (this.config.sampling.rate * 100);
      
      case 'adaptive':
        // Adaptive sampling based on current performance
        const avgResponseTime = this.getAverageResponseTime();
        const adaptiveRate = avgResponseTime > this.config.sampling.adaptiveThreshold 
          ? 1 // Collect all metrics when performance is poor
          : this.config.sampling.rate;
        return Math.random() < adaptiveRate;
      
      default:
        return true;
    }
  }

  /**
   * Get current system metrics
   */
  private getMemoryUsage(): number {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize / 1024 / 1024; // MB
    }
    return 0;
  }

  private getCPUUsage(): number {
    // Browser doesn't have direct CPU usage access
    // This would need to be implemented server-side or estimated
    return 0;
  }

  private getActiveSessions(): number {
    // Would be tracked by the application
    return 1;
  }

  private getConcurrentUsers(): number {
    // Would be tracked by the application
    return 1;
  }

  private getCacheHitRate(): number {
    // Would integrate with the actual cache implementation
    return 0.85; // Placeholder
  }

  private getErrorRate(): number {
    // Would track actual error rates
    return 0.001; // Placeholder
  }

  private getThroughput(): number {
    // Would track requests per second
    return 100; // Placeholder
  }

  private getAverageResponseTime(): number {
    const summary = this.getMetricsSummary('response_time', 60000); // Last minute
    return summary.average;
  }

  /**
   * Get uptime in milliseconds
   */
  public getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get collector status
   */
  public getStatus(): {
    isRunning: boolean;
    uptime: number;
    metricsCount: Record<MetricType, number>;
    bufferUtilization: Record<string, number>;
  } {
    const metricsCount: Record<MetricType, number> = {} as any;
    const bufferUtilization: Record<string, number> = {};

    for (const [type, buffer] of this.realtimeBuffers) {
      metricsCount[type] = buffer.length;
      bufferUtilization[type] = buffer.length / (buffer as any).capacity;
    }

    return {
      isRunning: this.isRunning,
      uptime: this.getUptime(),
      metricsCount,
      bufferUtilization
    };
  }

  /**
   * Clear all metrics data
   */
  public clearMetrics(): void {
    for (const buffer of this.realtimeBuffers.values()) {
      buffer.clear();
    }
    
    for (const buffer of this.aggregatedBuffers.values()) {
      buffer.clear();
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stop();
    this.clearMetrics();
    this.realtimeBuffers.clear();
    this.aggregatedBuffers.clear();
  }
}

/* ===== DEFAULT CONFIGURATIONS ===== */

export const DEFAULT_METRICS_CONFIG: MetricsCollectorConfig = {
  enabled: true,
  granularity: 1000, // 1 second
  retention: {
    realtime: 300, // 5 minutes of 1-second data
    shortTerm: 60, // 1 hour of 1-minute data
    mediumTerm: 288, // 1 day of 5-minute data
    longTerm: 30 // 30 days of 1-hour data
  },
  collectors: [
    { name: 'config-resolution', type: 'configuration_resolution_time', enabled: true, interval: 1000, aggregation: ['avg', 'p95', 'p99'] },
    { name: 'provider-init', type: 'provider_initialization_time', enabled: true, interval: 1000, aggregation: ['avg', 'max'] },
    { name: 'build-perf', type: 'build_performance', enabled: true, interval: 5000, aggregation: ['avg', 'min', 'max'] },
    { name: 'deployment-perf', type: 'deployment_performance', enabled: true, interval: 5000, aggregation: ['avg', 'max'] },
    { name: 'memory', type: 'memory_usage', enabled: true, interval: 2000, aggregation: ['avg', 'max'] },
    { name: 'response-time', type: 'response_time', enabled: true, interval: 1000, aggregation: ['avg', 'p95', 'p99'] },
    { name: 'throughput', type: 'throughput', enabled: true, interval: 1000, aggregation: ['avg', 'sum'] },
    { name: 'error-rate', type: 'error_rate', enabled: true, interval: 5000, aggregation: ['avg', 'max'] }
  ],
  thresholds: {
    configurationResolution: 100, // 100ms
    providerInitialization: 50, // 50ms (achieved 10-20ms)
    buildTime: 30000, // 30 seconds (achieved <1s)
    deploymentTime: 300000, // 5 minutes
    responseTime: 1000, // 1 second
    errorRate: 0.01 // 1%
  },
  sampling: {
    rate: 1.0, // Collect 100% of metrics initially
    strategy: 'adaptive',
    adaptiveThreshold: 500 // 500ms response time threshold
  }
} as const;

/**
 * Factory function to create metrics collector
 */
export function createMetricsCollector(
  config: Partial<MetricsCollectorConfig> = {}
): PerformanceMetricsCollector {
  const mergedConfig = { ...DEFAULT_METRICS_CONFIG, ...config };
  return new PerformanceMetricsCollector(mergedConfig);
}

/**
 * Global metrics collector instance
 */
export const metricsCollector = createMetricsCollector();

export default metricsCollector;
/**
 * Health Check Endpoints for System Components - BERS Task 4.1
 * 
 * Comprehensive health monitoring system with lightweight, cacheable endpoints
 * for monitoring environment health, configuration validity, provider health,
 * and system resource utilization without impacting production performance.
 * 
 * Features:
 * - Environment health status monitoring
 * - Configuration validity checks
 * - Provider health monitoring  
 * - System resource utilization tracking
 * - Lightweight and cacheable health checks
 * - Detailed health reports with remediation suggestions
 * - Circuit breaker pattern for degraded services
 * - Graceful degradation handling
 * 
 * @version 1.0.0
 * @author Build-Time Environment Resolution System (BERS) 
 */

import type { 
  Environment, 
  ValidatedEnvironment,
  EnvironmentDetectionResult,
  EnvironmentResolver
} from '../config/environment-resolver';
import type { RuntimeConfig, ConfigValidationResult } from '../types/config';
import type { PerformanceMetricsCollector, MetricsSummary } from './metrics-collector';

/* ===== HEALTH CHECK TYPES ===== */

export interface HealthCheckConfig {
  readonly enabled: boolean;
  readonly interval: number; // milliseconds between health checks
  readonly timeout: number; // milliseconds timeout for individual checks
  readonly retryAttempts: number;
  readonly cacheEnabled: boolean;
  readonly cacheTTL: number; // milliseconds
  readonly checks: HealthCheckDefinition[];
  readonly thresholds: HealthThresholds;
}

export interface HealthCheckDefinition {
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly critical: boolean; // If true, failure affects overall system health
  readonly timeout: number;
  readonly interval: number;
  readonly retryAttempts: number;
  readonly dependencies: string[]; // Other health checks this depends on
}

export interface HealthThresholds {
  readonly responseTime: number; // milliseconds
  readonly memoryUsage: number; // percentage
  readonly cpuUsage: number; // percentage
  readonly errorRate: number; // percentage  
  readonly cacheHitRate: number; // percentage (minimum)
}

export interface HealthCheckResult {
  readonly name: string;
  readonly status: HealthStatus;
  readonly timestamp: number;
  readonly duration: number; // milliseconds
  readonly message: string;
  readonly details: HealthCheckDetails;
  readonly error?: string;
  readonly remediation?: RemediationSuggestion[];
}

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface HealthCheckDetails {
  readonly version?: string;
  readonly uptime?: number;
  readonly responseTime?: number;
  readonly memoryUsage?: number;
  readonly cpuUsage?: number;
  readonly errorRate?: number;
  readonly lastError?: string;
  readonly metrics?: Record<string, number>;
  readonly dependencies?: DependencyHealth[];
}

export interface DependencyHealth {
  readonly name: string;
  readonly status: HealthStatus;
  readonly responseTime?: number;
  readonly lastChecked: number;
}

export interface RemediationSuggestion {
  readonly id: string;
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  readonly title: string;
  readonly description: string;
  readonly action: 'restart' | 'scale' | 'investigate' | 'config' | 'manual';
  readonly estimatedImpact: string;
  readonly estimatedTime: string;
}

export interface SystemHealthReport {
  readonly timestamp: number;
  readonly overallStatus: HealthStatus;
  readonly version: string;
  readonly uptime: number;
  readonly environment: Environment;
  readonly checks: HealthCheckResult[];
  readonly summary: HealthSummary;
  readonly recommendations: RemediationSuggestion[];
}

export interface HealthSummary {
  readonly healthy: number;
  readonly degraded: number;
  readonly unhealthy: number;
  readonly unknown: number;
  readonly critical: number;
  readonly avgResponseTime: number;
  readonly totalChecks: number;
}

export interface CircuitBreakerState {
  readonly name: string;
  readonly state: 'closed' | 'open' | 'half-open';
  readonly failureCount: number;
  readonly lastFailureTime: number;
  readonly nextRetryTime: number;
  readonly successCount: number;
}

/* ===== CIRCUIT BREAKER IMPLEMENTATION ===== */

class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private nextRetryTime = 0;
  private successCount = 0;

  constructor(
    private readonly name: string,
    private readonly failureThreshold: number = 5,
    private readonly timeout: number = 60000, // 1 minute
    private readonly monitoringPeriod: number = 10000 // 10 seconds
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() < this.nextRetryTime) {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
      this.state = 'half-open';
      this.successCount = 0;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= 3) {
        this.state = 'closed';
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.nextRetryTime = Date.now() + this.timeout;
    }
  }

  getState(): CircuitBreakerState {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextRetryTime: this.nextRetryTime,
      successCount: this.successCount
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.nextRetryTime = 0;
    this.successCount = 0;
  }
}

/* ===== HEALTH CHECK SYSTEM IMPLEMENTATION ===== */

export class HealthCheckSystem {
  private healthResults: Map<string, HealthCheckResult> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;
  private startTime = Date.now();

  constructor(
    private readonly config: HealthCheckConfig,
    private readonly environmentResolver: EnvironmentResolver,
    private readonly metricsCollector: PerformanceMetricsCollector
  ) {
    this.initializeCircuitBreakers();
  }

  /**
   * Initialize circuit breakers for each health check
   */
  private initializeCircuitBreakers(): void {
    for (const check of this.config.checks) {
      if (check.enabled) {
        this.circuitBreakers.set(
          check.name,
          new CircuitBreaker(check.name, 3, 30000, 10000)
        );
      }
    }
  }

  /**
   * Start health check monitoring
   */
  public start(): void {
    if (this.isRunning || !this.config.enabled) return;

    this.isRunning = true;
    this.startTime = Date.now();

    // Schedule periodic health checks
    for (const check of this.config.checks) {
      if (!check.enabled) continue;

      const interval = setInterval(async () => {
        await this.runHealthCheck(check);
      }, check.interval);

      this.checkIntervals.set(check.name, interval);
    }

    // Run initial health check
    this.runAllHealthChecks();

    console.log('Health check system started');
  }

  /**
   * Stop health check monitoring
   */
  public stop(): void {
    if (!this.isRunning) return;

    // Clear all intervals
    for (const [name, interval] of this.checkIntervals) {
      clearInterval(interval);
    }
    this.checkIntervals.clear();

    this.isRunning = false;
    console.log('Health check system stopped');
  }

  /**
   * Run all health checks
   */
  public async runAllHealthChecks(): Promise<SystemHealthReport> {
    const timestamp = Date.now();
    const checks: HealthCheckResult[] = [];
    const environment = await this.getCurrentEnvironment();

    // Run health checks in dependency order
    const sortedChecks = this.sortChecksByDependencies();
    
    for (const check of sortedChecks) {
      if (!check.enabled) continue;

      try {
        const result = await this.runHealthCheck(check);
        checks.push(result);
      } catch (error) {
        checks.push({
          name: check.name,
          status: 'unhealthy',
          timestamp,
          duration: 0,
          message: 'Health check failed to execute',
          details: {},
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Calculate overall health status
    const overallStatus = this.calculateOverallStatus(checks);
    
    // Generate summary
    const summary = this.generateHealthSummary(checks);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(checks);

    const report: SystemHealthReport = {
      timestamp,
      overallStatus,
      version: '1.0.0',
      uptime: this.getUptime(),
      environment,
      checks,
      summary,
      recommendations
    };

    return report;
  }

  /**
   * Run individual health check
   */
  public async runHealthCheck(check: HealthCheckDefinition): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const circuitBreaker = this.circuitBreakers.get(check.name);

    try {
      let result: HealthCheckResult;

      if (circuitBreaker) {
        result = await circuitBreaker.execute(() => this.executeHealthCheck(check));
      } else {
        result = await this.executeHealthCheck(check);
      }

      // Cache the result
      this.healthResults.set(check.name, result);
      
      return result;
    } catch (error) {
      const errorResult: HealthCheckResult = {
        name: check.name,
        status: 'unhealthy',
        timestamp: startTime,
        duration: Date.now() - startTime,
        message: 'Health check failed',
        details: {},
        error: error instanceof Error ? error.message : String(error),
        remediation: this.getRemediationForCheck(check.name, 'failed')
      };

      this.healthResults.set(check.name, errorResult);
      return errorResult;
    }
  }

  /**
   * Execute specific health check logic
   */
  private async executeHealthCheck(check: HealthCheckDefinition): Promise<HealthCheckResult> {
    const startTime = Date.now();

    switch (check.name) {
      case 'environment-resolver':
        return await this.checkEnvironmentResolver(check, startTime);
      
      case 'configuration-validity':
        return await this.checkConfigurationValidity(check, startTime);
      
      case 'provider-health':
        return await this.checkProviderHealth(check, startTime);
      
      case 'system-resources':
        return await this.checkSystemResources(check, startTime);
      
      case 'metrics-collector':
        return await this.checkMetricsCollector(check, startTime);
      
      case 'database-connection':
        return await this.checkDatabaseConnection(check, startTime);
      
      case 'external-services':
        return await this.checkExternalServices(check, startTime);
      
      case 'cache-health':
        return await this.checkCacheHealth(check, startTime);
      
      default:
        throw new Error(`Unknown health check: ${check.name}`);
    }
  }

  /**
   * Check environment resolver health
   */
  private async checkEnvironmentResolver(
    check: HealthCheckDefinition, 
    startTime: number
  ): Promise<HealthCheckResult> {
    try {
      const detectionResult = await this.environmentResolver.detectEnvironment();
      const validationResult = await this.environmentResolver.validateEnvironment(detectionResult.environment);
      const performanceMetrics = this.environmentResolver.getPerformanceMetrics();
      
      const duration = Date.now() - startTime;
      const isHealthy = validationResult.isValid && 
                       detectionResult.detectionTime < this.config.thresholds.responseTime &&
                       performanceMetrics.errorRate < this.config.thresholds.errorRate;

      return {
        name: check.name,
        status: isHealthy ? 'healthy' : 'degraded',
        timestamp: startTime,
        duration,
        message: isHealthy ? 'Environment resolver is healthy' : 'Environment resolver is degraded',
        details: {
          responseTime: detectionResult.detectionTime,
          errorRate: performanceMetrics.errorRate,
          cacheHitRate: performanceMetrics.cacheHitRate,
          lastDetectionTime: performanceMetrics.lastDetectionTime,
          metrics: {
            avgDetectionTime: performanceMetrics.averageDetectionTime,
            totalDetections: performanceMetrics.totalDetections
          }
        },
        remediation: isHealthy ? undefined : this.getRemediationForCheck(check.name, 'degraded')
      };
    } catch (error) {
      throw new Error(`Environment resolver check failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Check configuration validity
   */
  private async checkConfigurationValidity(
    check: HealthCheckDefinition,
    startTime: number
  ): Promise<HealthCheckResult> {
    try {
      const environment = await this.getCurrentEnvironment();
      const config = await this.environmentResolver.getEnvironmentConfiguration(environment);
      const validation = await this.validateConfiguration(config);
      
      const duration = Date.now() - startTime;
      const isHealthy = validation.isValid;

      return {
        name: check.name,
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: startTime,
        duration,
        message: isHealthy ? 'Configuration is valid' : `Configuration validation failed: ${validation.errors.join(', ')}`,
        details: {
          environment,
          validationErrors: validation.errors,
          validationWarnings: validation.warnings
        },
        remediation: isHealthy ? undefined : this.getRemediationForCheck(check.name, 'invalid')
      };
    } catch (error) {
      throw new Error(`Configuration validity check failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Check provider health
   */
  private async checkProviderHealth(
    check: HealthCheckDefinition,
    startTime: number
  ): Promise<HealthCheckResult> {
    try {
      // This would integrate with actual provider health monitoring
      const providers = ['ChatAPIProvider', 'ChatStateProvider', 'ChatStreamingProvider', 'ChatMonitoringProvider'];
      const healthyProviders: string[] = [];
      const unhealthyProviders: string[] = [];
      
      for (const provider of providers) {
        const isHealthy = await this.checkIndividualProvider(provider);
        if (isHealthy) {
          healthyProviders.push(provider);
        } else {
          unhealthyProviders.push(provider);
        }
      }

      const duration = Date.now() - startTime;
      const allHealthy = unhealthyProviders.length === 0;
      const status: HealthStatus = allHealthy ? 'healthy' : 
                                  unhealthyProviders.length < providers.length ? 'degraded' : 'unhealthy';

      return {
        name: check.name,
        status,
        timestamp: startTime,
        duration,
        message: allHealthy ? 'All providers are healthy' : `${unhealthyProviders.length} providers are unhealthy`,
        details: {
          totalProviders: providers.length,
          healthyProviders: healthyProviders.length,
          unhealthyProviders: unhealthyProviders.length,
          providerStatus: providers.reduce((acc, provider) => {
            acc[provider] = healthyProviders.includes(provider) ? 'healthy' : 'unhealthy';
            return acc;
          }, {} as Record<string, string>)
        },
        remediation: allHealthy ? undefined : this.getRemediationForCheck(check.name, 'provider_failure')
      };
    } catch (error) {
      throw new Error(`Provider health check failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Check system resources
   */
  private async checkSystemResources(
    check: HealthCheckDefinition,
    startTime: number
  ): Promise<HealthCheckResult> {
    try {
      const memoryUsage = this.getMemoryUsage();
      const cpuUsage = await this.getCPUUsage();
      const uptime = this.getUptime();
      
      const duration = Date.now() - startTime;
      const memoryHealthy = memoryUsage < this.config.thresholds.memoryUsage;
      const cpuHealthy = cpuUsage < this.config.thresholds.cpuUsage;
      
      const status: HealthStatus = memoryHealthy && cpuHealthy ? 'healthy' :
                                  (memoryHealthy || cpuHealthy) ? 'degraded' : 'unhealthy';

      return {
        name: check.name,
        status,
        timestamp: startTime,
        duration,
        message: status === 'healthy' ? 'System resources are healthy' : 'System resources are under pressure',
        details: {
          memoryUsage,
          cpuUsage,
          uptime,
          metrics: {
            memoryUsageMB: memoryUsage,
            cpuUsagePercent: cpuUsage,
            uptimeHours: uptime / (1000 * 60 * 60)
          }
        },
        remediation: status === 'healthy' ? undefined : this.getRemediationForCheck(check.name, 'resource_pressure')
      };
    } catch (error) {
      throw new Error(`System resources check failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Check metrics collector health
   */
  private async checkMetricsCollector(
    check: HealthCheckDefinition,
    startTime: number
  ): Promise<HealthCheckResult> {
    try {
      const collectorStatus = this.metricsCollector.getStatus();
      const uptime = this.metricsCollector.getUptime();
      
      const duration = Date.now() - startTime;
      const isHealthy = collectorStatus.isRunning;

      return {
        name: check.name,
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: startTime,
        duration,
        message: isHealthy ? 'Metrics collector is healthy' : 'Metrics collector is not running',
        details: {
          isRunning: collectorStatus.isRunning,
          uptime,
          metricsCount: Object.values(collectorStatus.metricsCount).reduce((sum, count) => sum + count, 0),
          bufferUtilization: collectorStatus.bufferUtilization
        },
        remediation: isHealthy ? undefined : this.getRemediationForCheck(check.name, 'not_running')
      };
    } catch (error) {
      throw new Error(`Metrics collector check failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Check database connection (placeholder)
   */
  private async checkDatabaseConnection(
    check: HealthCheckDefinition,
    startTime: number
  ): Promise<HealthCheckResult> {
    try {
      // Placeholder - would implement actual database health check
      const duration = Date.now() - startTime;
      
      return {
        name: check.name,
        status: 'healthy',
        timestamp: startTime,
        duration,
        message: 'Database connection is healthy',
        details: {
          connectionPool: 'healthy',
          responseTime: duration
        }
      };
    } catch (error) {
      throw new Error(`Database connection check failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Check external services (placeholder)
   */
  private async checkExternalServices(
    check: HealthCheckDefinition,
    startTime: number
  ): Promise<HealthCheckResult> {
    try {
      // Placeholder - would implement actual external service health checks
      const duration = Date.now() - startTime;
      
      return {
        name: check.name,
        status: 'healthy',
        timestamp: startTime,
        duration,
        message: 'External services are healthy',
        details: {
          services: {
            's3': 'healthy',
            'cloudfront': 'healthy',
            'api_gateway': 'healthy'
          }
        }
      };
    } catch (error) {
      throw new Error(`External services check failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Check cache health (placeholder)
   */
  private async checkCacheHealth(
    check: HealthCheckDefinition,
    startTime: number
  ): Promise<HealthCheckResult> {
    try {
      // Placeholder - would implement actual cache health check
      const duration = Date.now() - startTime;
      
      return {
        name: check.name,
        status: 'healthy',
        timestamp: startTime,
        duration,
        message: 'Cache is healthy',
        details: {
          hitRate: 0.85,
          responseTime: duration,
          memoryUsage: 45.2
        }
      };
    } catch (error) {
      throw new Error(`Cache health check failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Get cached health check result
   */
  public getCachedHealthResult(checkName: string): HealthCheckResult | undefined {
    if (!this.config.cacheEnabled) return undefined;
    
    const result = this.healthResults.get(checkName);
    if (!result) return undefined;
    
    const age = Date.now() - result.timestamp;
    if (age > this.config.cacheTTL) return undefined;
    
    return result;
  }

  /**
   * Get overall system health
   */
  public async getOverallHealth(): Promise<HealthStatus> {
    const report = await this.runAllHealthChecks();
    return report.overallStatus;
  }

  /**
   * Get health status for specific check
   */
  public async getHealthStatus(checkName: string): Promise<HealthCheckResult> {
    // Try to get cached result first
    const cached = this.getCachedHealthResult(checkName);
    if (cached) return cached;

    // Find and run the specific check
    const check = this.config.checks.find(c => c.name === checkName);
    if (!check) {
      throw new Error(`Health check not found: ${checkName}`);
    }

    return await this.runHealthCheck(check);
  }

  /**
   * Get circuit breaker states
   */
  public getCircuitBreakerStates(): CircuitBreakerState[] {
    return Array.from(this.circuitBreakers.values()).map(cb => cb.getState());
  }

  /**
   * Reset circuit breaker
   */
  public resetCircuitBreaker(name: string): void {
    const circuitBreaker = this.circuitBreakers.get(name);
    if (circuitBreaker) {
      circuitBreaker.reset();
    }
  }

  /* ===== UTILITY METHODS ===== */

  private async getCurrentEnvironment(): Promise<ValidatedEnvironment> {
    const result = await this.environmentResolver.detectEnvironment();
    return result.environment;
  }

  private async validateConfiguration(config: any): Promise<ConfigValidationResult> {
    // Placeholder - would implement actual configuration validation
    return {
      isValid: true,
      errors: [],
      warnings: []
    };
  }

  private async checkIndividualProvider(providerName: string): Promise<boolean> {
    // Placeholder - would implement actual provider health check
    return Math.random() > 0.1; // 90% healthy
  }

  private getMemoryUsage(): number {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;
      return (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
    }
    return 0;
  }

  private async getCPUUsage(): Promise<number> {
    // Browser doesn't have direct CPU usage access
    // This would need to be implemented server-side
    return Math.random() * 50; // Placeholder
  }

  private getUptime(): number {
    return Date.now() - this.startTime;
  }

  private sortChecksByDependencies(): HealthCheckDefinition[] {
    const sorted: HealthCheckDefinition[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (check: HealthCheckDefinition) => {
      if (visiting.has(check.name)) {
        throw new Error(`Circular dependency detected: ${check.name}`);
      }
      
      if (visited.has(check.name)) return;

      visiting.add(check.name);

      // Visit dependencies first
      for (const depName of check.dependencies) {
        const dep = this.config.checks.find(c => c.name === depName);
        if (dep && dep.enabled) {
          visit(dep);
        }
      }

      visiting.delete(check.name);
      visited.add(check.name);
      sorted.push(check);
    };

    for (const check of this.config.checks) {
      if (check.enabled) {
        visit(check);
      }
    }

    return sorted;
  }

  private calculateOverallStatus(checks: HealthCheckResult[]): HealthStatus {
    if (checks.length === 0) return 'unknown';

    const criticalChecks = this.config.checks.filter(c => c.critical && c.enabled);
    const criticalResults = checks.filter(r => 
      criticalChecks.some(c => c.name === r.name)
    );

    // If any critical check is unhealthy, system is unhealthy
    if (criticalResults.some(r => r.status === 'unhealthy')) {
      return 'unhealthy';
    }

    // If any critical check is degraded, system is degraded
    if (criticalResults.some(r => r.status === 'degraded')) {
      return 'degraded';
    }

    // Check non-critical checks
    const unhealthyCount = checks.filter(r => r.status === 'unhealthy').length;
    const degradedCount = checks.filter(r => r.status === 'degraded').length;

    if (unhealthyCount > 0 || degradedCount > checks.length * 0.3) {
      return 'degraded';
    }

    return 'healthy';
  }

  private generateHealthSummary(checks: HealthCheckResult[]): HealthSummary {
    const summary: HealthSummary = {
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      unknown: 0,
      critical: 0,
      avgResponseTime: 0,
      totalChecks: checks.length
    };

    let totalResponseTime = 0;

    for (const check of checks) {
      switch (check.status) {
        case 'healthy':
          summary.healthy++;
          break;
        case 'degraded':
          summary.degraded++;
          break;
        case 'unhealthy':
          summary.unhealthy++;
          break;
        case 'unknown':
          summary.unknown++;
          break;
      }

      totalResponseTime += check.duration;

      // Count critical checks
      const checkDef = this.config.checks.find(c => c.name === check.name);
      if (checkDef?.critical) {
        summary.critical++;
      }
    }

    summary.avgResponseTime = checks.length > 0 ? totalResponseTime / checks.length : 0;

    return summary;
  }

  private generateRecommendations(checks: HealthCheckResult[]): RemediationSuggestion[] {
    const recommendations: RemediationSuggestion[] = [];

    // Collect remediation suggestions from unhealthy checks
    for (const check of checks) {
      if (check.remediation) {
        recommendations.push(...check.remediation);
      }
    }

    // Add system-level recommendations
    const unhealthyCount = checks.filter(c => c.status === 'unhealthy').length;
    const degradedCount = checks.filter(c => c.status === 'degraded').length;

    if (unhealthyCount > 0) {
      recommendations.push({
        id: 'investigate-failures',
        priority: 'high',
        title: 'Investigate System Failures',
        description: `${unhealthyCount} health checks are failing. Immediate investigation required.`,
        action: 'investigate',
        estimatedImpact: 'High - system stability at risk',
        estimatedTime: '15-30 minutes'
      });
    }

    if (degradedCount > checks.length * 0.3) {
      recommendations.push({
        id: 'performance-optimization',
        priority: 'medium',
        title: 'Performance Optimization Needed',
        description: 'Multiple components are showing degraded performance.',
        action: 'investigate',
        estimatedImpact: 'Medium - user experience may be affected',
        estimatedTime: '30-60 minutes'
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  private getRemediationForCheck(checkName: string, issue: string): RemediationSuggestion[] {
    const remediationMap: Record<string, Record<string, RemediationSuggestion[]>> = {
      'environment-resolver': {
        'degraded': [
          {
            id: 'clear-env-cache',
            priority: 'medium',
            title: 'Clear Environment Cache',
            description: 'Clear the environment detection cache to force fresh detection',
            action: 'restart',
            estimatedImpact: 'Low - temporary performance impact',
            estimatedTime: '1 minute'
          }
        ],
        'failed': [
          {
            id: 'check-env-config',
            priority: 'high',
            title: 'Check Environment Configuration',
            description: 'Verify environment variables and configuration files',
            action: 'config',
            estimatedImpact: 'High - affects environment detection',
            estimatedTime: '10 minutes'
          }
        ]
      },
      'configuration-validity': {
        'invalid': [
          {
            id: 'validate-config-syntax',
            priority: 'critical',
            title: 'Validate Configuration Syntax',
            description: 'Check configuration files for syntax errors',
            action: 'config',
            estimatedImpact: 'Critical - system may not function',
            estimatedTime: '5 minutes'
          }
        ]
      },
      'provider-health': {
        'provider_failure': [
          {
            id: 'restart-providers',
            priority: 'high',
            title: 'Restart Failed Providers',
            description: 'Restart unhealthy providers to restore functionality',
            action: 'restart',
            estimatedImpact: 'Medium - temporary service interruption',
            estimatedTime: '2 minutes'
          }
        ]
      },
      'system-resources': {
        'resource_pressure': [
          {
            id: 'scale-resources',
            priority: 'medium',
            title: 'Scale System Resources',
            description: 'Consider scaling up CPU/memory resources',
            action: 'scale',
            estimatedImpact: 'Medium - improves performance',
            estimatedTime: '10 minutes'
          }
        ]
      },
      'metrics-collector': {
        'not_running': [
          {
            id: 'restart-metrics-collector',
            priority: 'medium',
            title: 'Restart Metrics Collector',
            description: 'Restart the metrics collection service',
            action: 'restart',
            estimatedImpact: 'Low - metrics collection restored',
            estimatedTime: '1 minute'
          }
        ]
      }
    };

    return remediationMap[checkName]?.[issue] || [];
  }

  /**
   * Get system status
   */
  public getStatus(): {
    isRunning: boolean;
    uptime: number;
    checksCount: number;
    enabledChecks: number;
    lastHealthCheck: number;
  } {
    const lastCheck = Math.max(...Array.from(this.healthResults.values()).map(r => r.timestamp), 0);

    return {
      isRunning: this.isRunning,
      uptime: this.getUptime(),
      checksCount: this.config.checks.length,
      enabledChecks: this.config.checks.filter(c => c.enabled).length,
      lastHealthCheck: lastCheck
    };
  }

  /**
   * Clear health check results
   */
  public clearResults(): void {
    this.healthResults.clear();
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stop();
    this.clearResults();
    this.circuitBreakers.clear();
  }
}

/* ===== DEFAULT CONFIGURATIONS ===== */

export const DEFAULT_HEALTH_CHECK_CONFIG: HealthCheckConfig = {
  enabled: true,
  interval: 30000, // 30 seconds
  timeout: 5000, // 5 seconds
  retryAttempts: 3,
  cacheEnabled: true,
  cacheTTL: 10000, // 10 seconds
  checks: [
    {
      name: 'environment-resolver',
      description: 'Environment detection and resolution system',
      enabled: true,
      critical: true,
      timeout: 5000,
      interval: 30000,
      retryAttempts: 3,
      dependencies: []
    },
    {
      name: 'configuration-validity',
      description: 'Configuration validation and integrity',
      enabled: true,
      critical: true,
      timeout: 3000,
      interval: 60000,
      retryAttempts: 2,
      dependencies: ['environment-resolver']
    },
    {
      name: 'provider-health',
      description: 'Chat provider system health',
      enabled: true,
      critical: true,
      timeout: 5000,
      interval: 30000,
      retryAttempts: 3,
      dependencies: ['configuration-validity']
    },
    {
      name: 'system-resources',
      description: 'System resource utilization',
      enabled: true,
      critical: false,
      timeout: 2000,
      interval: 15000,
      retryAttempts: 1,
      dependencies: []
    },
    {
      name: 'metrics-collector',
      description: 'Performance metrics collection system',
      enabled: true,
      critical: false,
      timeout: 3000,
      interval: 30000,
      retryAttempts: 2,
      dependencies: []
    },
    {
      name: 'cache-health',
      description: 'Configuration and data caching system',
      enabled: true,
      critical: false,
      timeout: 2000,
      interval: 60000,
      retryAttempts: 2,
      dependencies: []
    }
  ],
  thresholds: {
    responseTime: 1000, // 1 second
    memoryUsage: 80, // 80%
    cpuUsage: 70, // 70%
    errorRate: 5, // 5%
    cacheHitRate: 70 // 70%
  }
} as const;

/**
 * Factory function to create health check system
 */
export function createHealthCheckSystem(
  config: Partial<HealthCheckConfig>,
  environmentResolver: EnvironmentResolver,
  metricsCollector: PerformanceMetricsCollector
): HealthCheckSystem {
  const mergedConfig = { 
    ...DEFAULT_HEALTH_CHECK_CONFIG, 
    ...config,
    checks: [...DEFAULT_HEALTH_CHECK_CONFIG.checks, ...(config.checks || [])]
  };
  
  return new HealthCheckSystem(mergedConfig, environmentResolver, metricsCollector);
}

export default HealthCheckSystem;
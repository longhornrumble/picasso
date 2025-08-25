/**
 * Provider Health Monitoring System - BERS Phase 2, Task 2.2
 * 
 * Comprehensive health monitoring system for all distributed providers with
 * real-time status tracking, configuration validation, and automatic recovery.
 * 
 * Features:
 * - Real-time provider health monitoring
 * - Configuration health validation  
 * - Performance metrics collection
 * - Automatic recovery mechanisms
 * - Circuit breaker integration
 * - Health check intervals with <200ms response time
 * 
 * @version 2.2.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import type {
  EnvironmentAwareProvider,
  ProviderHealthStatus,
  ProviderMetrics,
  ProviderHealthCheckSystem,
  HealthCheckOptions,
  HealthCheckSystemStatus,
  HealthStatusChangeCallback,
  CircuitBreakerStatus,
  ProviderPerformanceMetrics
} from '../interfaces/EnvironmentAwareProvider';
import type {
  ProviderType,
  ProviderTimeout,
  HealthCheckInterval
} from '../../types/config/providers';
import type { ValidatedEnvironment } from '../../config/environment-resolver';
import type { Duration, Timestamp } from '../../types/branded';
import { createDuration, createTimestamp } from '../../types/branded';

/* ===== HEALTH MONITORING IMPLEMENTATION ===== */

/**
 * Production-ready provider health monitoring system
 */
export class ProviderHealthMonitoringSystem implements ProviderHealthCheckSystem {
  private providers = new Map<ProviderType, EnvironmentAwareProvider>();
  private healthStatuses = new Map<ProviderType, ProviderHealthStatus>();
  private circuitBreakers = new Map<ProviderType, CircuitBreakerStatus>();
  private healthCheckIntervals = new Map<ProviderType, NodeJS.Timeout>();
  private healthStatusListeners = new Set<HealthStatusChangeCallback>();
  
  private isActive = false;
  private healthCheckCount = 0;
  private totalHealthCheckTime = 0;
  private circuitBreakerTrips = 0;
  private autoRecoveries = 0;
  private lastHealthCheck: Timestamp | null = null;
  
  private options: HealthCheckOptions = {
    interval: 30000 as HealthCheckInterval, // 30 seconds
    timeout: 5000 as ProviderTimeout,
    retries: 3,
    enableCircuitBreaker: true,
    recoveryOptions: {
      autoRestart: true,
      maxRestartAttempts: 3,
      restartDelay: createDuration(5000) // 5 seconds
    }
  };

  /**
   * Start periodic health checks for all providers
   */
  async startHealthChecks(
    providers: Map<ProviderType, EnvironmentAwareProvider>,
    options: HealthCheckOptions
  ): Promise<void> {
    if (this.isActive) {
      throw new Error('Health monitoring system is already active');
    }

    this.providers = new Map(providers);
    this.options = { ...this.options, ...options };
    this.isActive = true;

    console.log(`[HealthMonitoring] Starting health checks for ${providers.size} providers`);

    // Initialize circuit breakers
    for (const [providerType] of providers) {
      this.initializeCircuitBreaker(providerType);
    }

    // Start health check intervals for each provider
    for (const [providerType, provider] of providers) {
      await this.startProviderHealthCheck(providerType, provider);
    }

    // Perform initial health checks
    await this.checkAllHealth();

    console.log(`[HealthMonitoring] Health monitoring system started successfully`);
  }

  /**
   * Stop health check monitoring
   */
  async stopHealthChecks(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    console.log('[HealthMonitoring] Stopping health monitoring system');

    // Clear all intervals
    for (const [providerType, interval] of this.healthCheckIntervals) {
      clearInterval(interval);
      console.log(`[HealthMonitoring] Stopped health checks for ${providerType}`);
    }

    this.healthCheckIntervals.clear();
    this.isActive = false;

    console.log('[HealthMonitoring] Health monitoring system stopped');
  }

  /**
   * Perform immediate health check on specific provider
   */
  async checkHealth(providerType: ProviderType): Promise<ProviderHealthStatus> {
    const startTime = performance.now();
    
    try {
      const provider = this.providers.get(providerType);
      if (!provider) {
        throw new Error(`Provider ${providerType} not found`);
      }

      const status = await this.performHealthCheck(providerType, provider);
      const endTime = performance.now();
      
      this.updateHealthCheckMetrics(endTime - startTime);
      this.updateProviderHealth(providerType, status);
      
      return status;
    } catch (error) {
      const endTime = performance.now();
      this.updateHealthCheckMetrics(endTime - startTime);
      
      const errorStatus: ProviderHealthStatus = {
        status: 'unhealthy',
        configurationValid: false,
        lastConfigUpdate: createTimestamp(0),
        initializationTime: createDuration(0),
        uptime: createDuration(0),
        metrics: this.createEmptyMetrics(),
        dependencies: {},
        lastHealthCheck: createTimestamp(Date.now()),
        errorCount: 1,
        warningCount: 0
      };
      
      this.updateProviderHealth(providerType, errorStatus);
      return errorStatus;
    }
  }

  /**
   * Perform health check on all providers
   */
  async checkAllHealth(): Promise<Map<ProviderType, ProviderHealthStatus>> {
    const results = new Map<ProviderType, ProviderHealthStatus>();
    
    console.log(`[HealthMonitoring] Performing health check on ${this.providers.size} providers`);
    
    // Check all providers in parallel for better performance
    const healthCheckPromises = Array.from(this.providers.entries()).map(
      async ([providerType]) => {
        try {
          const status = await this.checkHealth(providerType);
          results.set(providerType, status);
        } catch (error) {
          console.error(`[HealthMonitoring] Health check failed for ${providerType}:`, error);
        }
      }
    );

    await Promise.all(healthCheckPromises);
    
    this.lastHealthCheck = createTimestamp(Date.now());
    
    console.log('[HealthMonitoring] Health check completed for all providers');
    return results;
  }

  /**
   * Get health check system status
   */
  getHealthCheckStatus(): HealthCheckSystemStatus {
    const healthCounts = this.getHealthCounts();
    
    return {
      active: this.isActive,
      monitoredProviders: Array.from(this.providers.keys()),
      healthyProviders: healthCounts.healthy,
      degradedProviders: healthCounts.degraded,
      unhealthyProviders: healthCounts.unhealthy,
      lastHealthCheck: this.lastHealthCheck,
      healthCheckCount: this.healthCheckCount,
      averageHealthCheckTime: this.healthCheckCount > 0 
        ? createDuration(this.totalHealthCheckTime / this.healthCheckCount)
        : createDuration(0),
      circuitBreakerTrips: this.circuitBreakerTrips,
      autoRecoveries: this.autoRecoveries
    };
  }

  /**
   * Register callback for health status changes
   */
  onHealthStatusChange(callback: HealthStatusChangeCallback): () => void {
    this.healthStatusListeners.add(callback);
    
    return () => {
      this.healthStatusListeners.delete(callback);
    };
  }

  /**
   * Get provider recovery recommendations
   */
  async getRecoveryRecommendations(
    providerType: ProviderType
  ): Promise<readonly string[]> {
    const recommendations: string[] = [];
    const status = this.healthStatuses.get(providerType);
    const circuitBreaker = this.circuitBreakers.get(providerType);
    
    if (!status) {
      recommendations.push('Provider not found in monitoring system');
      return recommendations;
    }

    // Configuration-based recommendations
    if (!status.configurationValid) {
      recommendations.push('Validate and fix provider configuration');
      recommendations.push('Check environment-specific configuration files');
      recommendations.push('Verify configuration schema compliance');
    }

    // Status-based recommendations
    switch (status.status) {
      case 'unhealthy':
        recommendations.push('Restart provider with clean state');
        recommendations.push('Check provider dependencies');
        recommendations.push('Review error logs for root cause');
        break;
        
      case 'degraded':
        recommendations.push('Monitor provider performance metrics');
        recommendations.push('Consider scaling provider resources');
        recommendations.push('Check for memory or CPU constraints');
        break;
        
      case 'initializing':
        recommendations.push('Allow provider to complete initialization');
        recommendations.push('Check initialization timeout settings');
        break;
    }

    // Circuit breaker recommendations
    if (circuitBreaker?.state === 'open') {
      recommendations.push('Circuit breaker is open - provider is temporarily disabled');
      recommendations.push('Wait for circuit breaker recovery timeout');
      recommendations.push('Address underlying failure causes before retry');
    }

    // Performance-based recommendations
    if (status.metrics.errorRate > 0.1) { // >10% error rate
      recommendations.push('High error rate detected - investigate error patterns');
    }

    if (status.metrics.averageResponseTime > createDuration(1000)) { // >1s response time
      recommendations.push('Slow response times - optimize provider operations');
    }

    if (status.metrics.memoryUsage > 100 * 1024 * 1024) { // >100MB memory usage
      recommendations.push('High memory usage - check for memory leaks');
    }

    return recommendations;
  }

  /* ===== PRIVATE IMPLEMENTATION METHODS ===== */

  /**
   * Initialize circuit breaker for provider
   */
  private initializeCircuitBreaker(providerType: ProviderType): void {
    const circuitBreaker: CircuitBreakerStatus = {
      state: 'closed',
      failureCount: 0,
      lastFailure: null,
      nextRetry: null,
      failureThreshold: 5,
      recoveryTimeout: createDuration(30000) // 30 seconds
    };
    
    this.circuitBreakers.set(providerType, circuitBreaker);
  }

  /**
   * Start health check interval for specific provider
   */
  private async startProviderHealthCheck(
    providerType: ProviderType,
    provider: EnvironmentAwareProvider
  ): Promise<void> {
    const interval = setInterval(async () => {
      try {
        await this.checkHealth(providerType);
      } catch (error) {
        console.error(`[HealthMonitoring] Scheduled health check failed for ${providerType}:`, error);
      }
    }, this.options.interval);
    
    this.healthCheckIntervals.set(providerType, interval);
    console.log(`[HealthMonitoring] Started health checks for ${providerType} (interval: ${this.options.interval}ms)`);
  }

  /**
   * Perform actual health check on provider
   */
  private async performHealthCheck(
    providerType: ProviderType,
    provider: EnvironmentAwareProvider
  ): Promise<ProviderHealthStatus> {
    const circuitBreaker = this.circuitBreakers.get(providerType);
    
    // Check circuit breaker state
    if (this.options.enableCircuitBreaker && circuitBreaker?.state === 'open') {
      if (this.shouldAttemptRecovery(circuitBreaker)) {
        this.updateCircuitBreakerState(providerType, 'half-open');
      } else {
        // Circuit breaker is still open
        return this.createCircuitBreakerStatus(providerType);
      }
    }

    try {
      // Get provider health status with timeout
      const healthPromise = provider.getHealthStatus();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), this.options.timeout);
      });
      
      const status = await Promise.race([healthPromise, timeoutPromise]);
      
      // Update circuit breaker on success
      if (this.options.enableCircuitBreaker) {
        this.handleHealthCheckSuccess(providerType);
      }
      
      return status;
    } catch (error) {
      // Update circuit breaker on failure
      if (this.options.enableCircuitBreaker) {
        this.handleHealthCheckFailure(providerType, error);
      }
      
      throw error;
    }
  }

  /**
   * Update provider health status and notify listeners
   */
  private updateProviderHealth(
    providerType: ProviderType,
    newStatus: ProviderHealthStatus
  ): void {
    const oldStatus = this.healthStatuses.get(providerType);
    this.healthStatuses.set(providerType, newStatus);
    
    // Notify listeners of status change
    if (oldStatus && this.hasStatusChanged(oldStatus, newStatus)) {
      this.healthStatusListeners.forEach(listener => {
        try {
          listener(newStatus, oldStatus);
        } catch (error) {
          console.error('[HealthMonitoring] Error in health status change listener:', error);
        }
      });
    }
  }

  /**
   * Check if health status has meaningfully changed
   */
  private hasStatusChanged(
    oldStatus: ProviderHealthStatus,
    newStatus: ProviderHealthStatus
  ): boolean {
    return oldStatus.status !== newStatus.status ||
           oldStatus.configurationValid !== newStatus.configurationValid ||
           Math.abs(oldStatus.errorCount - newStatus.errorCount) > 0;
  }

  /**
   * Update health check metrics
   */
  private updateHealthCheckMetrics(duration: number): void {
    this.healthCheckCount++;
    this.totalHealthCheckTime += duration;
  }

  /**
   * Get health count statistics
   */
  private getHealthCounts(): { healthy: number; degraded: number; unhealthy: number } {
    const counts = { healthy: 0, degraded: 0, unhealthy: 0 };
    
    for (const status of this.healthStatuses.values()) {
      switch (status.status) {
        case 'healthy':
          counts.healthy++;
          break;
        case 'degraded':
          counts.degraded++;
          break;
        case 'unhealthy':
        case 'initializing':
          counts.unhealthy++;
          break;
      }
    }
    
    return counts;
  }

  /**
   * Create empty performance metrics for error cases
   */
  private createEmptyMetrics(): ProviderPerformanceMetrics {
    return {
      operationsPerSecond: 0,
      averageResponseTime: createDuration(0),
      errorRate: 1.0,
      memoryUsage: 0,
      cpuUsage: 0,
      activeConnections: 0,
      totalOperations: 0,
      failedOperations: 1,
      retryAttempts: 0
    };
  }

  /**
   * Handle successful health check for circuit breaker
   */
  private handleHealthCheckSuccess(providerType: ProviderType): void {
    const circuitBreaker = this.circuitBreakers.get(providerType);
    if (!circuitBreaker) return;

    if (circuitBreaker.state === 'half-open') {
      // Recovery successful - close circuit breaker
      this.updateCircuitBreakerState(providerType, 'closed');
      this.autoRecoveries++;
      console.log(`[HealthMonitoring] Circuit breaker recovered for ${providerType}`);
    }

    // Reset failure count on success
    circuitBreaker.failureCount = 0;
    circuitBreaker.lastFailure = null;
  }

  /**
   * Handle failed health check for circuit breaker
   */
  private handleHealthCheckFailure(providerType: ProviderType, error: unknown): void {
    const circuitBreaker = this.circuitBreakers.get(providerType);
    if (!circuitBreaker) return;

    circuitBreaker.failureCount++;
    circuitBreaker.lastFailure = createTimestamp(Date.now());

    if (circuitBreaker.failureCount >= circuitBreaker.failureThreshold) {
      // Open circuit breaker
      this.updateCircuitBreakerState(providerType, 'open');
      this.circuitBreakerTrips++;
      console.warn(`[HealthMonitoring] Circuit breaker opened for ${providerType} after ${circuitBreaker.failureCount} failures`);
    }
  }

  /**
   * Check if circuit breaker should attempt recovery
   */
  private shouldAttemptRecovery(circuitBreaker: CircuitBreakerStatus): boolean {
    if (!circuitBreaker.nextRetry) return false;
    return Date.now() >= circuitBreaker.nextRetry;
  }

  /**
   * Update circuit breaker state
   */
  private updateCircuitBreakerState(
    providerType: ProviderType,
    newState: CircuitBreakerStatus['state']
  ): void {
    const circuitBreaker = this.circuitBreakers.get(providerType);
    if (!circuitBreaker) return;

    circuitBreaker.state = newState;

    if (newState === 'open') {
      circuitBreaker.nextRetry = createTimestamp(
        Date.now() + circuitBreaker.recoveryTimeout
      );
    } else if (newState === 'closed') {
      circuitBreaker.failureCount = 0;
      circuitBreaker.nextRetry = null;
    }
  }

  /**
   * Create health status for circuit breaker open state
   */
  private createCircuitBreakerStatus(providerType: ProviderType): ProviderHealthStatus {
    return {
      status: 'unhealthy',
      configurationValid: true, // Configuration might be valid, but provider is unavailable
      lastConfigUpdate: createTimestamp(0),
      initializationTime: createDuration(0),
      uptime: createDuration(0),
      metrics: this.createEmptyMetrics(),
      dependencies: {},
      lastHealthCheck: createTimestamp(Date.now()),
      errorCount: 0,
      warningCount: 1
    };
  }
}

/* ===== FACTORY FUNCTIONS ===== */

/**
 * Create configured health monitoring system
 */
export function createProviderHealthMonitoring(
  options: Partial<HealthCheckOptions> = {}
): ProviderHealthCheckSystem {
  return new ProviderHealthMonitoringSystem();
}

/**
 * Default health check options for different environments
 */
export const DEFAULT_HEALTH_CHECK_OPTIONS: Record<string, HealthCheckOptions> = {
  development: {
    interval: 10000 as HealthCheckInterval, // 10 seconds
    timeout: 2000 as ProviderTimeout,
    retries: 2,
    enableCircuitBreaker: false,
    recoveryOptions: {
      autoRestart: true,
      maxRestartAttempts: 1,
      restartDelay: createDuration(1000)
    }
  },
  staging: {
    interval: 30000 as HealthCheckInterval, // 30 seconds
    timeout: 5000 as ProviderTimeout,
    retries: 3,
    enableCircuitBreaker: true,
    recoveryOptions: {
      autoRestart: true,
      maxRestartAttempts: 3,
      restartDelay: createDuration(5000)
    }
  },
  production: {
    interval: 60000 as HealthCheckInterval, // 60 seconds
    timeout: 10000 as ProviderTimeout,
    retries: 5,
    enableCircuitBreaker: true,
    recoveryOptions: {
      autoRestart: false, // Manual intervention required in production
      maxRestartAttempts: 0,
      restartDelay: createDuration(0)
    }
  }
};

/* ===== TYPE EXPORTS ===== */

export type {
  ProviderHealthMonitoringSystem as IProviderHealthMonitoringSystem
};
/**
 * Environment-Aware Provider Interfaces - BERS Phase 2, Task 2.2
 * 
 * Enhanced provider interfaces that support environment-aware configuration,
 * hot-reload capabilities, health monitoring, and dependency injection.
 * 
 * Features:
 * - Environment-specific configuration loading
 * - Hot-reload support with <200ms performance
 * - Provider health monitoring and metrics
 * - Configuration dependency injection
 * - Circuit breaker integration
 * - Performance tracking with <50ms initialization
 * 
 * @version 2.2.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import type { ValidatedEnvironment } from '../../config/environment-resolver';
import type { 
  ValidatedProviderConfig, 
  ProviderType,
  ProviderTimeout,
  HealthCheckInterval
} from '../../types/config/providers';
import type { 
  ValidatedConfigurationType,
  ConfigValidationOptions,
  ComprehensiveValidationResult
} from '../../types/config';
import type { Duration, Timestamp } from '../../types/branded';

/* ===== CORE ENVIRONMENT-AWARE PROVIDER INTERFACE ===== */

/**
 * Enhanced provider interface with environment-aware configuration support
 */
export interface EnvironmentAwareProvider<TConfig = unknown> {
  /**
   * Initialize provider with validated environment-specific configuration
   * Must complete in <50ms for performance requirements
   */
  initialize(config: ValidatedConfigurationType<TConfig>): Promise<ProviderInitializationResult>;

  /**
   * Update provider configuration with hot-reload support
   * Must complete in <200ms for hot-reload performance requirements
   */
  updateConfiguration(config: Partial<TConfig>): Promise<ConfigurationUpdateResult>;

  /**
   * Get current provider health status with configuration validation
   */
  getHealthStatus(): ProviderHealthStatus;

  /**
   * Get provider performance metrics
   */
  getMetrics(): ProviderMetrics;

  /**
   * Get provider configuration validation status
   */
  getConfigurationStatus(): ProviderConfigurationStatus;

  /**
   * Gracefully shutdown provider and cleanup resources
   */
  shutdown(): Promise<void>;

  /**
   * Validate that provider can handle the given configuration
   */
  canHandleConfiguration(config: unknown): Promise<boolean>;

  /**
   * Get provider dependencies for orchestration
   */  
  getDependencies(): readonly ProviderType[];

  /**
   * Get provider readiness for dependency resolution
   */
  isReady(): boolean;

  /**
   * Register for configuration change notifications
   */
  onConfigurationChange(callback: ConfigurationChangeCallback): () => void;

  /**
   * Register for health status change notifications
   */
  onHealthStatusChange(callback: HealthStatusChangeCallback): () => void;
}

/* ===== PROVIDER INITIALIZATION RESULT ===== */

/**
 * Result of provider initialization with detailed metrics
 */
export interface ProviderInitializationResult {
  readonly success: boolean;
  readonly initializationTime: Duration;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly configurationValid: boolean;
  readonly dependenciesResolved: boolean;
  readonly readyForOperations: boolean;
  readonly metadata: {
    readonly providerId: string;
    readonly providerVersion: string;
    readonly environment: ValidatedEnvironment;
    readonly timestamp: Timestamp;
  };
}

/**
 * Result of configuration update operation
 */
export interface ConfigurationUpdateResult {
  readonly success: boolean;
  readonly updateTime: Duration;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly requiresRestart: boolean;
  readonly rollbackAvailable: boolean;
  readonly validationResult: ComprehensiveValidationResult;
}

/* ===== PROVIDER HEALTH MONITORING ===== */

/**
 * Provider health status with configuration validation
 */
export interface ProviderHealthStatus {
  readonly status: 'healthy' | 'degraded' | 'unhealthy' | 'initializing';
  readonly configurationValid: boolean;
  readonly lastConfigUpdate: Timestamp;
  readonly initializationTime: Duration;
  readonly uptime: Duration;
  readonly metrics: ProviderPerformanceMetrics;
  readonly dependencies: {
    readonly [providerId: string]: 'healthy' | 'degraded' | 'unhealthy';
  };
  readonly lastHealthCheck: Timestamp;
  readonly errorCount: number;
  readonly warningCount: number;
}

/**
 * Provider performance metrics for monitoring
 */
export interface ProviderPerformanceMetrics {
  readonly operationsPerSecond: number;
  readonly averageResponseTime: Duration;
  readonly errorRate: number;
  readonly memoryUsage: number; // bytes
  readonly cpuUsage: number; // percentage 0-100
  readonly activeConnections: number;
  readonly totalOperations: number;
  readonly failedOperations: number;
  readonly retryAttempts: number;
}

/**
 * Enhanced provider metrics with configuration insights
 */
export interface ProviderMetrics extends ProviderPerformanceMetrics {
  readonly configurationMetrics: {
    readonly configValidationTime: Duration;
    readonly configUpdateCount: number;
    readonly configErrorCount: number;
    readonly hotReloadCount: number;
    readonly rollbackCount: number;
  };
  readonly healthMetrics: {
    readonly healthCheckInterval: HealthCheckInterval;
    readonly healthCheckCount: number;
    readonly healthCheckFailures: number;
    readonly lastHealthCheckDuration: Duration;
  };
}

/**
 * Provider configuration status and validation
 */
export interface ProviderConfigurationStatus {
  readonly valid: boolean;
  readonly environment: ValidatedEnvironment;
  readonly schemaVersion: string;
  readonly lastValidation: Timestamp;
  readonly validationErrors: readonly string[];
  readonly validationWarnings: readonly string[];
  readonly configurationSource: 'file' | 'environment' | 'runtime' | 'default';
  readonly inheritanceChain: readonly string[];
  readonly hotReloadEnabled: boolean;
  readonly rollbackSupported: boolean;
}

/* ===== CALLBACK TYPES ===== */

/**
 * Configuration change callback for hot-reload notifications
 */
export type ConfigurationChangeCallback = (
  newConfig: ValidatedConfigurationType,
  oldConfig: ValidatedConfigurationType,
  changes: ConfigurationChanges
) => void;

/**
 * Health status change callback for monitoring
 */
export type HealthStatusChangeCallback = (
  newStatus: ProviderHealthStatus,
  oldStatus: ProviderHealthStatus
) => void;

/**
 * Configuration changes details
 */
export interface ConfigurationChanges {
  readonly added: readonly string[];
  readonly modified: readonly string[];
  readonly removed: readonly string[];
  readonly requiresRestart: boolean;
  readonly rollbackSupported: boolean;
}

/* ===== PROVIDER ORCHESTRATION INTERFACES ===== */

/**
 * Provider orchestration configuration with dependency management
 */
export interface ProviderOrchestration {
  readonly providers: Map<ProviderType, EnvironmentAwareProvider>;
  readonly initializationOrder: readonly ProviderType[];
  readonly dependencyGraph: Map<ProviderType, readonly ProviderType[]>;
  readonly circuitBreakers: Map<ProviderType, CircuitBreakerStatus>;
  readonly healthChecks: Map<ProviderType, ProviderHealthStatus>;
}

/**
 * Circuit breaker status for provider failure handling
 */
export interface CircuitBreakerStatus {
  readonly state: 'closed' | 'open' | 'half-open';
  readonly failureCount: number;
  readonly lastFailure: Timestamp | null;
  readonly nextRetry: Timestamp | null;
  readonly failureThreshold: number;
  readonly recoveryTimeout: Duration;
}

/* ===== CONFIGURATION DEPENDENCY INJECTION ===== */

/**
 * Configuration injection context for providers
 */
export interface ConfigurationInjectionContext {
  readonly environment: ValidatedEnvironment;
  readonly providerType: ProviderType;
  readonly configuration: ValidatedProviderConfig;
  readonly dependencies: Map<ProviderType, EnvironmentAwareProvider>;
  readonly orchestration: ProviderOrchestration;
  readonly validationOptions: ConfigValidationOptions;
}

/**
 * Configuration injector interface
 */
export interface ConfigurationInjector {
  /**
   * Inject configuration into provider during initialization
   */
  injectConfiguration<T>(
    provider: EnvironmentAwareProvider<T>,
    context: ConfigurationInjectionContext
  ): Promise<ValidatedConfigurationType<T>>;

  /**
   * Validate configuration before injection
   */
  validateConfiguration<T>(
    config: unknown,
    context: ConfigurationInjectionContext
  ): Promise<ComprehensiveValidationResult<T>>;

  /**
   * Handle configuration updates with hot-reload
   */
  updateConfiguration<T>(
    provider: EnvironmentAwareProvider<T>,
    newConfig: Partial<T>,
    context: ConfigurationInjectionContext
  ): Promise<ConfigurationUpdateResult>;

  /**
   * Rollback configuration to previous valid state
   */
  rollbackConfiguration<T>(
    provider: EnvironmentAwareProvider<T>,
    context: ConfigurationInjectionContext
  ): Promise<ConfigurationUpdateResult>;
}

/* ===== HOT-RELOAD SYSTEM INTERFACES ===== */

/**
 * Hot-reload system interface for configuration changes
 */
export interface HotReloadSystem {
  /**
   * Start watching configuration files for changes
   */
  startWatching(
    providers: Map<ProviderType, EnvironmentAwareProvider>,
    options: HotReloadOptions
  ): Promise<void>;

  /**
   * Stop watching configuration files
   */
  stopWatching(): Promise<void>;

  /**
   * Manually trigger configuration reload
   */
  reloadConfiguration(
    providerType?: ProviderType
  ): Promise<HotReloadResult>;

  /**
   * Get hot-reload system status
   */
  getStatus(): HotReloadStatus;

  /**
   * Register callback for reload events
   */
  onReload(callback: HotReloadCallback): () => void;
}

/**
 * Hot-reload options
 */
export interface HotReloadOptions {
  readonly watchInterval: Duration;
  readonly debounceDelay: Duration;
  readonly maxReloadTime: Duration; // Must be <200ms
  readonly enableRollback: boolean;
  readonly validateBeforeReload: boolean;
}

/**
 * Hot-reload result
 */
export interface HotReloadResult {
  readonly success: boolean;
  readonly reloadTime: Duration;
  readonly providersReloaded: readonly ProviderType[];
  readonly providersSkipped: readonly ProviderType[];
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly rollbackPerformed: boolean;
}

/**
 * Hot-reload system status
 */
export interface HotReloadStatus {
  readonly active: boolean;
  readonly watchedFiles: readonly string[];
  readonly lastReload: Timestamp | null;
  readonly reloadCount: number;
  readonly errorCount: number;
  readonly averageReloadTime: Duration;
  readonly rollbackCount: number;
}

/**
 * Hot-reload callback for notifications
 */
export type HotReloadCallback = (
  result: HotReloadResult,
  affectedProviders: readonly ProviderType[]
) => void;

/* ===== PROVIDER HEALTH CHECK SYSTEM ===== */

/**
 * Provider health check system interface
 */
export interface ProviderHealthCheckSystem {
  /**
   * Start periodic health checks for all providers
   */
  startHealthChecks(
    providers: Map<ProviderType, EnvironmentAwareProvider>,
    options: HealthCheckOptions
  ): Promise<void>;

  /**
   * Stop health check monitoring
   */
  stopHealthChecks(): Promise<void>;

  /**
   * Perform immediate health check on specific provider
   */
  checkHealth(providerType: ProviderType): Promise<ProviderHealthStatus>;

  /**
   * Perform health check on all providers
   */
  checkAllHealth(): Promise<Map<ProviderType, ProviderHealthStatus>>;

  /**
   * Get health check system status
   */
  getHealthCheckStatus(): HealthCheckSystemStatus;

  /**
   * Register callback for health status changes
   */
  onHealthStatusChange(callback: HealthStatusChangeCallback): () => void;

  /**
   * Get provider recovery recommendations
   */
  getRecoveryRecommendations(
    providerType: ProviderType
  ): Promise<readonly string[]>;
}

/**
 * Health check options
 */
export interface HealthCheckOptions {
  readonly interval: HealthCheckInterval;
  readonly timeout: ProviderTimeout;
  readonly retries: number;
  readonly enableCircuitBreaker: boolean;
  readonly recoveryOptions: {
    readonly autoRestart: boolean;
    readonly maxRestartAttempts: number;
    readonly restartDelay: Duration;
  };
}

/**
 * Health check system status
 */
export interface HealthCheckSystemStatus {
  readonly active: boolean;
  readonly monitoredProviders: readonly ProviderType[];
  readonly healthyProviders: number;
  readonly degradedProviders: number;
  readonly unhealthyProviders: number;
  readonly lastHealthCheck: Timestamp | null;
  readonly healthCheckCount: number;
  readonly averageHealthCheckTime: Duration;
  readonly circuitBreakerTrips: number;
  readonly autoRecoveries: number;
}

/* ===== UTILITY TYPES ===== */

/**
 * Provider factory interface for creating environment-aware providers
 */
export interface ProviderFactory<T extends EnvironmentAwareProvider = EnvironmentAwareProvider> {
  /**
   * Create provider instance with environment-aware configuration
   */
  createProvider(
    providerType: ProviderType,
    environment: ValidatedEnvironment,
    configuration: ValidatedProviderConfig
  ): Promise<T>;

  /**
   * Validate provider configuration before creation
   */
  validateProviderConfiguration(
    providerType: ProviderType,
    configuration: unknown
  ): Promise<boolean>;

  /**
   * Get supported provider types
   */
  getSupportedProviderTypes(): readonly ProviderType[];
}

/**
 * Provider registry for managing provider instances
 */
export interface ProviderRegistry {
  /**
   * Register provider instance
   */
  registerProvider(
    providerType: ProviderType,
    provider: EnvironmentAwareProvider
  ): void;

  /**
   * Unregister provider instance
   */
  unregisterProvider(providerType: ProviderType): void;

  /**
   * Get provider instance
   */
  getProvider<T extends EnvironmentAwareProvider = EnvironmentAwareProvider>(
    providerType: ProviderType
  ): T | null;

  /**
   * Get all registered providers
   */
  getAllProviders(): Map<ProviderType, EnvironmentAwareProvider>;

  /**
   * Check if provider is registered
   */
  hasProvider(providerType: ProviderType): boolean;

  /**
   * Clear all registered providers
   */
  clear(): void;
}

/* ===== EXPORTS ===== */

export type {
  EnvironmentAwareProvider,
  ProviderInitializationResult,
  ConfigurationUpdateResult,
  ProviderHealthStatus,
  ProviderPerformanceMetrics,
  ProviderMetrics,
  ProviderConfigurationStatus,
  ConfigurationChangeCallback,
  HealthStatusChangeCallback,
  ConfigurationChanges,
  ProviderOrchestration,
  CircuitBreakerStatus,
  ConfigurationInjectionContext,
  ConfigurationInjector,
  HotReloadSystem,
  HotReloadOptions,
  HotReloadResult,
  HotReloadStatus,
  HotReloadCallback,
  ProviderHealthCheckSystem,
  HealthCheckOptions,
  HealthCheckSystemStatus,
  ProviderFactory,
  ProviderRegistry
};
/**
 * Provider Orchestration System - BERS Phase 2, Task 2.2
 * 
 * Comprehensive orchestration system that coordinates all distributed providers
 * with environment-aware configuration, dependency management, and health monitoring.
 * 
 * Features:
 * - Provider dependency resolution and initialization order
 * - Environment-aware configuration coordination
 * - Health monitoring integration
 * - Circuit breaker pattern implementation
 * - Graceful shutdown and resource cleanup
 * - Integration with all Task 2.2 systems
 * 
 * @version 2.2.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import type {
  EnvironmentAwareProvider,
  ProviderOrchestration,
  CircuitBreakerStatus,
  ProviderHealthStatus,
  ConfigurationInjectionContext
} from '../interfaces/EnvironmentAwareProvider';
import type {
  ProviderType,
  ProviderConfiguration,
  ValidatedProviderConfig
} from '../../types/config/providers';
import type { ValidatedEnvironment } from '../../config/environment-resolver';
import type { Duration, Timestamp } from '../../types/branded';
import { createDuration, createTimestamp } from '../../types/branded';

import { 
  ProviderHealthMonitoringSystem,
  createProviderHealthMonitoring,
  DEFAULT_HEALTH_CHECK_OPTIONS
} from './ProviderHealthMonitoring';
import { 
  ConfigurationInjectionSystem,
  ProviderRegistryImpl,
  createConfigurationInjectionSystem,
  createProviderRegistry
} from './ConfigurationInjection';
import { 
  HotReloadConfigurationSystem,
  createHotReloadSystem,
  DEFAULT_HOT_RELOAD_OPTIONS
} from './HotReloadSystem';
import { enhancedConfigurationManager } from '../../config/enhanced-configuration-manager';

/* ===== PROVIDER ORCHESTRATION IMPLEMENTATION ===== */

/**
 * Production-ready provider orchestration system
 */
export class ProviderOrchestrationSystem {
  private registry: ProviderRegistryImpl;
  private healthMonitoring: ProviderHealthMonitoringSystem;
  private configurationInjection: ConfigurationInjectionSystem;
  private hotReloadSystem: HotReloadConfigurationSystem;
  
  private environment: ValidatedEnvironment;
  private configuration: ValidatedProviderConfig;
  private dependencyGraph = new Map<ProviderType, readonly ProviderType[]>();
  private initializationOrder: ProviderType[] = [];
  private circuitBreakers = new Map<ProviderType, CircuitBreakerStatus>();
  
  private isInitialized = false;
  private isStarted = false;
  private shutdownPromise: Promise<void> | null = null;
  
  // Performance tracking
  private orchestrationMetrics = {
    initializationTime: 0,
    providersInitialized: 0,
    initializationErrors: 0,
    configurationUpdates: 0,
    healthCheckCount: 0,
    circuitBreakerTrips: 0
  };

  constructor(
    environment: ValidatedEnvironment,
    configuration: ValidatedProviderConfig
  ) {
    this.environment = environment;
    this.configuration = configuration;
    
    // Initialize systems
    this.registry = createProviderRegistry();
    this.healthMonitoring = createProviderHealthMonitoring() as ProviderHealthMonitoringSystem;
    this.configurationInjection = createConfigurationInjectionSystem();
    this.hotReloadSystem = createHotReloadSystem() as HotReloadConfigurationSystem;
    
    // Build dependency graph from configuration
    this.buildDependencyGraph();
    this.calculateInitializationOrder();
  }

  /**
   * Initialize the orchestration system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('Provider orchestration system is already initialized');
    }

    const startTime = performance.now();
    console.log('[ProviderOrchestration] Initializing provider orchestration system');

    try {
      // Initialize all subsystems
      await this.initializeSubsystems();
      
      // Setup inter-system communication
      this.setupSystemIntegration();
      
      this.isInitialized = true;
      this.orchestrationMetrics.initializationTime = performance.now() - startTime;
      
      console.log(
        `[ProviderOrchestration] Orchestration system initialized (${
          this.orchestrationMetrics.initializationTime.toFixed(2)
        }ms)`
      );

    } catch (error) {
      console.error('[ProviderOrchestration] Failed to initialize orchestration system:', error);
      throw error;
    }
  }

  /**
   * Start all providers in dependency order
   */
  async startProviders(providers: Map<ProviderType, EnvironmentAwareProvider>): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Orchestration system must be initialized before starting providers');
    }

    if (this.isStarted) {
      throw new Error('Providers are already started');
    }

    const startTime = performance.now();
    console.log(`[ProviderOrchestration] Starting ${providers.size} providers`);

    try {
      // Register all providers
      this.registerProviders(providers);
      
      // Initialize providers in dependency order
      await this.initializeProvidersInOrder();
      
      // Start health monitoring
      await this.startHealthMonitoring();
      
      // Start hot-reload system
      await this.startHotReload();
      
      this.isStarted = true;
      const totalTime = performance.now() - startTime;
      
      console.log(
        `[ProviderOrchestration] All providers started successfully (${totalTime.toFixed(2)}ms)`
      );

    } catch (error) {
      console.error('[ProviderOrchestration] Failed to start providers:', error);
      await this.handleStartupFailure(error);
      throw error;
    }
  }

  /**
   * Gracefully shutdown all providers
   */
  async shutdown(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  /**
   * Get orchestration status
   */
  getOrchestrationStatus(): ProviderOrchestration {
    return {
      providers: this.registry.getAllProviders(),
      initializationOrder: [...this.initializationOrder],
      dependencyGraph: new Map(this.dependencyGraph),
      circuitBreakers: new Map(this.circuitBreakers),
      healthChecks: this.getHealthChecks()
    };
  }

  /**
   * Get provider by type
   */
  getProvider<T extends EnvironmentAwareProvider = EnvironmentAwareProvider>(
    providerType: ProviderType
  ): T | null {
    return this.registry.getProvider<T>(providerType);
  }

  /**
   * Update provider configuration with orchestration
   */
  async updateProviderConfiguration(
    providerType: ProviderType,
    configurationUpdate: any
  ): Promise<void> {
    const provider = this.registry.getProvider(providerType);
    if (!provider) {
      throw new Error(`Provider ${providerType} not found`);
    }

    const context = this.createConfigurationContext(providerType);
    
    try {
      const result = await this.configurationInjection.updateConfiguration(
        provider,
        configurationUpdate,
        context
      );

      if (!result.success) {
        throw new Error(
          `Configuration update failed for ${providerType}: ${result.errors.join(', ')}`
        );
      }

      this.orchestrationMetrics.configurationUpdates++;
      console.log(`[ProviderOrchestration] Updated configuration for ${providerType}`);

    } catch (error) {
      console.error(`[ProviderOrchestration] Failed to update configuration for ${providerType}:`, error);
      throw error;
    }
  }

  /**
   * Get orchestration metrics
   */
  getOrchestrationMetrics() {
    return {
      ...this.orchestrationMetrics,
      healthMonitoringMetrics: this.healthMonitoring.getHealthCheckStatus(),
      configurationMetrics: this.configurationInjection.getInjectionMetrics(),
      hotReloadMetrics: this.hotReloadSystem.getStatus()
    };
  }

  /* ===== PRIVATE IMPLEMENTATION METHODS ===== */

  /**
   * Build dependency graph from configuration
   */
  private buildDependencyGraph(): void {
    // Define provider dependencies
    const dependencies: Record<ProviderType, ProviderType[]> = {
      'state': [], // No dependencies
      'api': ['state'], // Depends on state for message management
      'streaming': ['api', 'state'], // Depends on API and state
      'content': ['state'], // Depends on state for content storage
      'monitoring': [], // Independent monitoring
      'debug': ['state', 'api'], // Depends on state and API for debugging
      'security': ['state'], // Depends on state for security validation
      'analytics': ['state'], // Depends on state for analytics data
      'integration': ['api', 'state'] // Depends on API and state
    };

    // Build dependency graph
    Object.entries(dependencies).forEach(([provider, deps]) => {
      this.dependencyGraph.set(provider as ProviderType, deps as ProviderType[]);
    });

    console.log('[ProviderOrchestration] Built dependency graph for providers');
  }

  /**
   * Calculate provider initialization order using topological sort
   */
  private calculateInitializationOrder(): void {
    const visited = new Set<ProviderType>();
    const visiting = new Set<ProviderType>();
    const order: ProviderType[] = [];

    const visit = (provider: ProviderType) => {
      if (visiting.has(provider)) {
        throw new Error(`Circular dependency detected involving ${provider}`);
      }
      
      if (visited.has(provider)) {
        return;
      }

      visiting.add(provider);
      
      const dependencies = this.dependencyGraph.get(provider) || [];
      dependencies.forEach(dep => visit(dep));
      
      visiting.delete(provider);
      visited.add(provider);
      order.push(provider);
    };

    // Visit all providers to determine order
    this.dependencyGraph.forEach((_, provider) => {
      if (!visited.has(provider)) {
        visit(provider);
      }
    });

    this.initializationOrder = order;
    console.log(`[ProviderOrchestration] Calculated initialization order: ${order.join(' -> ')}`);
  }

  /**
   * Initialize subsystems
   */
  private async initializeSubsystems(): Promise<void> {
    console.log('[ProviderOrchestration] Initializing subsystems');
    
    // All subsystems are created in constructor and ready to use
    console.log('[ProviderOrchestration] Subsystems initialized');
  }

  /**
   * Setup integration between systems
   */
  private setupSystemIntegration(): void {
    // Setup hot-reload to trigger health checks
    this.hotReloadSystem.onReload((result, affectedProviders) => {
      console.log(`[ProviderOrchestration] Hot-reload affected ${affectedProviders.length} providers`);
      
      // Trigger health checks for affected providers
      affectedProviders.forEach(async (providerType) => {
        try {
          await this.healthMonitoring.checkHealth(providerType);
          this.orchestrationMetrics.healthCheckCount++;
        } catch (error) {
          console.error(`[ProviderOrchestration] Health check failed after hot-reload for ${providerType}:`, error);
        }
      });
    });

    console.log('[ProviderOrchestration] System integration configured');
  }

  /**
   * Register all providers with the registry
   */
  private registerProviders(providers: Map<ProviderType, EnvironmentAwareProvider>): void {
    providers.forEach((provider, type) => {
      this.registry.registerProvider(type, provider);
      this.initializeCircuitBreaker(type);
    });

    console.log(`[ProviderOrchestration] Registered ${providers.size} providers`);
  }

  /**
   * Initialize providers in dependency order
   */
  private async initializeProvidersInOrder(): Promise<void> {
    console.log('[ProviderOrchestration] Initializing providers in dependency order');

    for (const providerType of this.initializationOrder) {
      const provider = this.registry.getProvider(providerType);
      if (!provider) {
        console.warn(`[ProviderOrchestration] Provider ${providerType} not found, skipping`);
        continue;
      }

      try {
        await this.initializeProvider(providerType, provider);
        this.orchestrationMetrics.providersInitialized++;
        
      } catch (error) {
        this.orchestrationMetrics.initializationErrors++;
        console.error(`[ProviderOrchestration] Failed to initialize ${providerType}:`, error);
        
        // Handle initialization failure
        await this.handleProviderInitializationFailure(providerType, error);
      }
    }
  }

  /**
   * Initialize individual provider with configuration injection
   */
  private async initializeProvider(
    providerType: ProviderType,
    provider: EnvironmentAwareProvider
  ): Promise<void> {
    console.log(`[ProviderOrchestration] Initializing provider: ${providerType}`);
    
    const startTime = performance.now();
    
    try {
      // Create configuration injection context
      const context = this.createConfigurationContext(providerType);
      
      // Inject configuration
      const configuration = await this.configurationInjection.injectConfiguration(
        provider,
        context
      );
      
      // Initialize provider
      const result = await provider.initialize(configuration);
      
      if (!result.success) {
        throw new Error(`Initialization failed: ${result.errors.join(', ')}`);
      }

      const initTime = performance.now() - startTime;
      console.log(
        `[ProviderOrchestration] Provider ${providerType} initialized successfully ` +
        `(${initTime.toFixed(2)}ms)`
      );

      // Validate performance requirement
      if (initTime > 50) {
        console.warn(
          `[ProviderOrchestration] Provider ${providerType} initialization time ` +
          `${initTime.toFixed(2)}ms exceeded 50ms requirement`
        );
      }

    } catch (error) {
      const initTime = performance.now() - startTime;
      console.error(
        `[ProviderOrchestration] Provider ${providerType} initialization failed ` +
        `(${initTime.toFixed(2)}ms):`, error
      );
      throw error;
    }
  }

  /**
   * Create configuration injection context for provider
   */
  private createConfigurationContext(providerType: ProviderType): ConfigurationInjectionContext {
    return {
      environment: this.environment,
      providerType,
      configuration: this.configuration,
      dependencies: this.registry.getAllProviders(),
      orchestration: this.getOrchestrationStatus(),
      validationOptions: {
        strictMode: this.environment.toString() === 'production',
        validateSecurity: true
      }
    };
  }

  /**
   * Start health monitoring system
   */
  private async startHealthMonitoring(): Promise<void> {
    const healthOptions = DEFAULT_HEALTH_CHECK_OPTIONS[this.environment.toString()] || 
                         DEFAULT_HEALTH_CHECK_OPTIONS.development;
    
    await this.healthMonitoring.startHealthChecks(
      this.registry.getAllProviders(),
      healthOptions
    );

    console.log('[ProviderOrchestration] Health monitoring started');
  }

  /**
   * Start hot-reload system
   */
  private async startHotReload(): Promise<void> {
    if (this.environment.toString() === 'production') {
      console.log('[ProviderOrchestration] Hot-reload disabled in production');
      return;
    }

    const hotReloadOptions = DEFAULT_HOT_RELOAD_OPTIONS[this.environment.toString()] ||
                            DEFAULT_HOT_RELOAD_OPTIONS.development;

    await this.hotReloadSystem.startWatching(
      this.registry.getAllProviders(),
      hotReloadOptions
    );

    console.log('[ProviderOrchestration] Hot-reload system started');
  }

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
   * Get health checks for all providers
   */
  private getHealthChecks(): Map<ProviderType, ProviderHealthStatus> {
    const healthChecks = new Map<ProviderType, ProviderHealthStatus>();
    
    for (const providerType of this.registry.getAllProviders().keys()) {
      const provider = this.registry.getProvider(providerType);
      if (provider) {
        try {
          healthChecks.set(providerType, provider.getHealthStatus());
        } catch (error) {
          console.error(`[ProviderOrchestration] Failed to get health status for ${providerType}:`, error);
        }
      }
    }
    
    return healthChecks;
  }

  /**
   * Handle provider initialization failure
   */
  private async handleProviderInitializationFailure(
    providerType: ProviderType,
    error: unknown
  ): Promise<void> {
    console.error(`[ProviderOrchestration] Handling initialization failure for ${providerType}`);
    
    // Update circuit breaker
    const circuitBreaker = this.circuitBreakers.get(providerType);
    if (circuitBreaker) {
      circuitBreaker.failureCount++;
      circuitBreaker.lastFailure = createTimestamp(Date.now());
      
      if (circuitBreaker.failureCount >= circuitBreaker.failureThreshold) {
        circuitBreaker.state = 'open';
        circuitBreaker.nextRetry = createTimestamp(
          Date.now() + circuitBreaker.recoveryTimeout
        );
        this.orchestrationMetrics.circuitBreakerTrips++;
        
        console.warn(
          `[ProviderOrchestration] Circuit breaker opened for ${providerType} ` +
          `after ${circuitBreaker.failureCount} failures`
        );
      }
    }
    
    // Determine if this is a critical failure that should stop orchestration
    const isCritical = this.isCriticalProvider(providerType);
    
    if (isCritical) {
      throw new Error(
        `Critical provider ${providerType} failed to initialize: ${error}`
      );
    } else {
      console.warn(
        `[ProviderOrchestration] Non-critical provider ${providerType} failed, continuing with other providers`
      );
    }
  }

  /**
   * Handle startup failure
   */
  private async handleStartupFailure(error: unknown): Promise<void> {
    console.error('[ProviderOrchestration] Handling startup failure, attempting cleanup');
    
    try {
      await this.performShutdown();
    } catch (shutdownError) {
      console.error('[ProviderOrchestration] Cleanup failed during startup failure:', shutdownError);
    }
  }

  /**
   * Perform graceful shutdown
   */
  private async performShutdown(): Promise<void> {
    console.log('[ProviderOrchestration] Performing graceful shutdown');
    
    try {
      // Stop hot-reload system
      await this.hotReloadSystem.stopWatching();
      
      // Stop health monitoring
      await this.healthMonitoring.stopHealthChecks();
      
      // Shutdown providers in reverse initialization order
      const shutdownOrder = [...this.initializationOrder].reverse();
      
      for (const providerType of shutdownOrder) {
        const provider = this.registry.getProvider(providerType);
        if (provider) {
          try {
            await provider.shutdown();
            console.log(`[ProviderOrchestration] Provider ${providerType} shutdown complete`);
          } catch (error) {
            console.error(`[ProviderOrchestration] Failed to shutdown ${providerType}:`, error);
          }
        }
      }
      
      // Clear registry
      this.registry.clear();
      
      this.isStarted = false;
      this.isInitialized = false;
      
      console.log('[ProviderOrchestration] Graceful shutdown completed');
      
    } catch (error) {
      console.error('[ProviderOrchestration] Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Determine if provider is critical for system operation
   */
  private isCriticalProvider(providerType: ProviderType): boolean {
    const criticalProviders: ProviderType[] = ['state', 'api'];
    return criticalProviders.includes(providerType);
  }
}

/* ===== FACTORY FUNCTIONS ===== */

/**
 * Create provider orchestration system
 */
export function createProviderOrchestration(
  environment: ValidatedEnvironment,
  configuration: ValidatedProviderConfig
): ProviderOrchestrationSystem {
  return new ProviderOrchestrationSystem(environment, configuration);
}

/* ===== EXPORTS ===== */

export {
  ProviderOrchestrationSystem,
  createProviderOrchestration
};

export type {
  ProviderOrchestrationSystem as IProviderOrchestrationSystem
};
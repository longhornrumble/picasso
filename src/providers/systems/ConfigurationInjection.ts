/**
 * Configuration Dependency Injection System - BERS Phase 2, Task 2.2
 * 
 * Advanced dependency injection system for provider configuration using the
 * completed Task 2.1 type-safe configuration system with environment awareness.
 * 
 * Features:
 * - Type-safe configuration injection
 * - Environment-aware configuration loading
 * - Hot-reload with <200ms performance
 * - Configuration validation and rollback
 * - Dependency resolution and orchestration
 * - Integration with enhanced configuration manager
 * 
 * @version 2.2.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import type {
  EnvironmentAwareProvider,
  ConfigurationInjector,
  ConfigurationInjectionContext,
  ConfigurationUpdateResult,
  ProviderOrchestration
} from '../interfaces/EnvironmentAwareProvider';
import type {
  ValidatedProviderConfig,
  ProviderType
} from '../../types/config/providers';
import type {
  ValidatedConfigurationType,
  ConfigValidationOptions,
  ComprehensiveValidationResult
} from '../../types/config';
import type { ValidatedEnvironment } from '../../config/environment-resolver';
import { 
  enhancedConfigurationManager,
  type EnhancedConfigurationManager 
} from '../../config/enhanced-configuration-manager';
import { createDuration, createTimestamp } from '../../types/branded';

/* ===== CONFIGURATION INJECTION IMPLEMENTATION ===== */

/**
 * Production-ready configuration dependency injection system
 */
export class ConfigurationInjectionSystem implements ConfigurationInjector {
  private configurationManager: EnhancedConfigurationManager;
  private configurationCache = new Map<string, ValidatedConfigurationType>();
  private rollbackStates = new Map<string, ValidatedConfigurationType>();
  private injectionMetrics = {
    injectionsPerformed: 0,
    validationsPerformed: 0,
    updatesPerformed: 0,
    rollbacksPerformed: 0,
    totalInjectionTime: 0,
    validationErrors: 0
  };

  constructor(configurationManager?: EnhancedConfigurationManager) {
    this.configurationManager = configurationManager || enhancedConfigurationManager;
  }

  /**
   * Inject configuration into provider during initialization
   */
  async injectConfiguration<T>(
    provider: EnvironmentAwareProvider<T>,
    context: ConfigurationInjectionContext
  ): Promise<ValidatedConfigurationType<T>> {
    const startTime = performance.now();
    
    try {
      console.log(`[ConfigInjection] Injecting configuration for ${context.providerType}`);

      // Validate context first
      this.validateInjectionContext(context);

      // Load environment-specific configuration
      const configuration = await this.loadEnvironmentConfiguration<T>(context);

      // Validate configuration against provider requirements
      const validationResult = await this.validateConfiguration<T>(
        configuration,
        context
      );

      if (!validationResult.isValid) {
        throw new Error(
          `Configuration validation failed for ${context.providerType}: ${
            validationResult.errors.map(e => e.message).join(', ')
          }`
        );
      }

      // Store for rollback if needed
      const cacheKey = this.createCacheKey(context.providerType, context.environment);
      this.rollbackStates.set(cacheKey, configuration);

      // Cache validated configuration
      this.configurationCache.set(cacheKey, configuration);

      // Update metrics
      const injectionTime = performance.now() - startTime;
      this.updateInjectionMetrics(injectionTime);

      console.log(
        `[ConfigInjection] Successfully injected configuration for ${context.providerType} ` +
        `(${injectionTime.toFixed(2)}ms)`
      );

      return configuration;

    } catch (error) {
      this.injectionMetrics.validationErrors++;
      const injectionTime = performance.now() - startTime;
      this.updateInjectionMetrics(injectionTime);
      
      console.error(`[ConfigInjection] Failed to inject configuration for ${context.providerType}:`, error);
      throw error;
    }
  }

  /**
   * Validate configuration before injection
   */
  async validateConfiguration<T>(
    config: unknown,
    context: ConfigurationInjectionContext
  ): Promise<ComprehensiveValidationResult<T>> {
    const startTime = performance.now();
    
    try {
      console.log(`[ConfigInjection] Validating configuration for ${context.providerType}`);

      // Use enhanced configuration manager for validation
      const validationResult = await this.configurationManager.validateConfigurationEnhanced<T>(
        config,
        this.getSchemaTypeFromProviderType(context.providerType),
        context.environment,
        context.validationOptions
      );

      // Additional provider-specific validation
      await this.performProviderSpecificValidation(config, context);

      // Dependency validation
      await this.validateProviderDependencies(context);

      const validationTime = performance.now() - startTime;
      this.injectionMetrics.validationsPerformed++;
      
      console.log(
        `[ConfigInjection] Configuration validation completed for ${context.providerType} ` +
        `(${validationTime.toFixed(2)}ms, valid: ${validationResult.isValid})`
      );

      return validationResult;

    } catch (error) {
      this.injectionMetrics.validationErrors++;
      console.error(`[ConfigInjection] Configuration validation failed for ${context.providerType}:`, error);
      throw error;
    }
  }

  /**
   * Handle configuration updates with hot-reload
   */
  async updateConfiguration<T>(
    provider: EnvironmentAwareProvider<T>,
    newConfig: Partial<T>,
    context: ConfigurationInjectionContext
  ): Promise<ConfigurationUpdateResult> {
    const startTime = performance.now();
    
    try {
      console.log(`[ConfigInjection] Updating configuration for ${context.providerType}`);

      // Get current configuration
      const cacheKey = this.createCacheKey(context.providerType, context.environment);
      const currentConfig = this.configurationCache.get(cacheKey);
      
      if (!currentConfig) {
        throw new Error(`No current configuration found for ${context.providerType}`);
      }

      // Merge configurations
      const mergedConfig = { ...currentConfig, ...newConfig };

      // Validate merged configuration
      const validationResult = await this.validateConfiguration<T>(
        mergedConfig,
        context
      );

      if (!validationResult.isValid) {
        return {
          success: false,
          updateTime: createDuration(performance.now() - startTime),
          errors: validationResult.errors.map(e => e.message),
          warnings: validationResult.warnings.map(w => w.message),
          requiresRestart: false,
          rollbackAvailable: true,
          validationResult
        };
      }

      // Check if provider can handle the configuration update
      const canHandle = await provider.canHandleConfiguration(mergedConfig);
      if (!canHandle) {
        return {
          success: false,
          updateTime: createDuration(performance.now() - startTime),
          errors: ['Provider cannot handle the updated configuration'],
          warnings: [],
          requiresRestart: true,
          rollbackAvailable: true,
          validationResult
        };
      }

      // Apply configuration update
      const providerUpdateResult = await provider.updateConfiguration(newConfig);
      
      if (providerUpdateResult.success) {
        // Update cache
        this.configurationCache.set(cacheKey, validationResult.validatedConfig!);
      }

      const updateTime = performance.now() - startTime;
      this.injectionMetrics.updatesPerformed++;

      console.log(
        `[ConfigInjection] Configuration update completed for ${context.providerType} ` +
        `(${updateTime.toFixed(2)}ms, success: ${providerUpdateResult.success})`
      );

      return {
        success: providerUpdateResult.success,
        updateTime: createDuration(updateTime),
        errors: providerUpdateResult.errors,
        warnings: providerUpdateResult.warnings,
        requiresRestart: providerUpdateResult.requiresRestart,
        rollbackAvailable: providerUpdateResult.rollbackAvailable,
        validationResult
      };

    } catch (error) {
      const updateTime = performance.now() - startTime;
      console.error(`[ConfigInjection] Configuration update failed for ${context.providerType}:`, error);
      
      return {
        success: false,
        updateTime: createDuration(updateTime),
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
        requiresRestart: false,
        rollbackAvailable: true,
        validationResult: {
          isValid: false,
          errors: [{
            code: 'UPDATE_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
            path: '',
            value: undefined
          }],
          warnings: [],
          performanceMetrics: {
            validationTime: updateTime,
            rulesValidated: 0,
            warningsGenerated: 0,
            errorsGenerated: 1
          },
          schemaVersion: '2.2.0',
          validationTimestamp: Date.now()
        }
      };
    }
  }

  /**
   * Rollback configuration to previous valid state
   */
  async rollbackConfiguration<T>(
    provider: EnvironmentAwareProvider<T>,
    context: ConfigurationInjectionContext
  ): Promise<ConfigurationUpdateResult> {
    const startTime = performance.now();
    
    try {
      console.log(`[ConfigInjection] Rolling back configuration for ${context.providerType}`);

      const cacheKey = this.createCacheKey(context.providerType, context.environment);
      const rollbackConfig = this.rollbackStates.get(cacheKey);
      
      if (!rollbackConfig) {
        throw new Error(`No rollback state available for ${context.providerType}`);
      }

      // Apply rollback configuration
      const result = await provider.updateConfiguration(rollbackConfig as Partial<T>);
      
      if (result.success) {
        // Update cache with rollback configuration
        this.configurationCache.set(cacheKey, rollbackConfig);
      }

      const rollbackTime = performance.now() - startTime;
      this.injectionMetrics.rollbacksPerformed++;

      console.log(
        `[ConfigInjection] Configuration rollback completed for ${context.providerType} ` +
        `(${rollbackTime.toFixed(2)}ms, success: ${result.success})`
      );

      return {
        ...result,
        updateTime: createDuration(rollbackTime),
        rollbackAvailable: false // Already rolled back
      };

    } catch (error) {
      console.error(`[ConfigInjection] Configuration rollback failed for ${context.providerType}:`, error);
      throw error;
    }
  }

  /**
   * Get configuration injection metrics
   */
  getInjectionMetrics() {
    return {
      ...this.injectionMetrics,
      averageInjectionTime: this.injectionMetrics.injectionsPerformed > 0
        ? this.injectionMetrics.totalInjectionTime / this.injectionMetrics.injectionsPerformed
        : 0
    };
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.configurationCache.clear();
    this.rollbackStates.clear();
    console.log('[ConfigInjection] Configuration cache cleared');
  }

  /* ===== PRIVATE IMPLEMENTATION METHODS ===== */

  /**
   * Load environment-specific configuration for provider
   */
  private async loadEnvironmentConfiguration<T>(
    context: ConfigurationInjectionContext
  ): Promise<ValidatedConfigurationType<T>> {
    const schemaType = this.getSchemaTypeFromProviderType(context.providerType);
    
    // Use enhanced configuration manager to load with environment awareness
    const configuration = await this.configurationManager.loadConfigurationTypeSafe<T>(
      schemaType,
      context.environment,
      {
        useCache: true,
        validateSchema: true,
        ...context.validationOptions
      }
    );

    return configuration;
  }

  /**
   * Validate injection context
   */
  private validateInjectionContext(context: ConfigurationInjectionContext): void {
    if (!context.environment) {
      throw new Error('Environment is required for configuration injection');
    }
    
    if (!context.providerType) {
      throw new Error('Provider type is required for configuration injection');
    }
    
    if (!context.configuration) {
      throw new Error('Configuration is required for configuration injection');
    }
  }

  /**
   * Perform provider-specific validation
   */
  private async performProviderSpecificValidation(
    config: unknown,
    context: ConfigurationInjectionContext
  ): Promise<void> {
    // Provider-specific validation logic based on provider type
    switch (context.providerType) {
      case 'api':
        await this.validateAPIProviderConfig(config);
        break;
      case 'streaming':
        await this.validateStreamingProviderConfig(config);
        break;
      case 'state':
        await this.validateStateProviderConfig(config);
        break;
      case 'content':
        await this.validateContentProviderConfig(config);
        break;
      case 'monitoring':
        await this.validateMonitoringProviderConfig(config);
        break;
      case 'debug':
        await this.validateDebugProviderConfig(config);
        break;
      default:
        // Generic validation for custom providers
        await this.validateGenericProviderConfig(config);
    }
  }

  /**
   * Validate provider dependencies
   */
  private async validateProviderDependencies(
    context: ConfigurationInjectionContext
  ): Promise<void> {
    if (!context.orchestration) {
      return; // No dependency validation needed
    }

    const dependencies = context.orchestration.dependencyGraph.get(context.providerType) || [];
    
    for (const dependencyType of dependencies) {
      const dependencyProvider = context.dependencies.get(dependencyType);
      
      if (!dependencyProvider) {
        throw new Error(`Required dependency ${dependencyType} not available for ${context.providerType}`);
      }
      
      if (!dependencyProvider.isReady()) {
        throw new Error(`Dependency ${dependencyType} is not ready for ${context.providerType}`);
      }
    }
  }

  /**
   * Get schema type from provider type
   */
  private getSchemaTypeFromProviderType(providerType: ProviderType): string {
    return `${providerType}Provider`;
  }

  /**
   * Create cache key for configuration
   */
  private createCacheKey(providerType: ProviderType, environment: ValidatedEnvironment): string {
    return `${providerType}-${environment.toString()}`;
  }

  /**
   * Update injection metrics
   */
  private updateInjectionMetrics(duration: number): void {
    this.injectionMetrics.injectionsPerformed++;
    this.injectionMetrics.totalInjectionTime += duration;
  }

  /* ===== PROVIDER-SPECIFIC VALIDATION METHODS ===== */

  private async validateAPIProviderConfig(config: unknown): Promise<void> {
    // API provider specific validation
    if (typeof config !== 'object' || !config) {
      throw new Error('API provider configuration must be an object');
    }
    
    const apiConfig = config as any;
    if (!apiConfig.endpoints || !apiConfig.endpoints.chat) {
      throw new Error('API provider must have chat endpoint configured');
    }
  }

  private async validateStreamingProviderConfig(config: unknown): Promise<void> {
    // Streaming provider specific validation
    if (typeof config !== 'object' || !config) {
      throw new Error('Streaming provider configuration must be an object');
    }
    
    const streamingConfig = config as any;
    if (!streamingConfig.protocol) {
      throw new Error('Streaming provider must have protocol configured');
    }
  }

  private async validateStateProviderConfig(config: unknown): Promise<void> {
    // State provider specific validation
    if (typeof config !== 'object' || !config) {
      throw new Error('State provider configuration must be an object');
    }
  }

  private async validateContentProviderConfig(config: unknown): Promise<void> {
    // Content provider specific validation
    if (typeof config !== 'object' || !config) {
      throw new Error('Content provider configuration must be an object');
    }
  }

  private async validateMonitoringProviderConfig(config: unknown): Promise<void> {
    // Monitoring provider specific validation
    if (typeof config !== 'object' || !config) {
      throw new Error('Monitoring provider configuration must be an object');
    }
  }

  private async validateDebugProviderConfig(config: unknown): Promise<void> {
    // Debug provider specific validation
    if (typeof config !== 'object' || !config) {
      throw new Error('Debug provider configuration must be an object');
    }
  }

  private async validateGenericProviderConfig(config: unknown): Promise<void> {
    // Generic provider validation
    if (typeof config !== 'object' || !config) {
      throw new Error('Provider configuration must be an object');
    }
  }
}

/* ===== PROVIDER REGISTRY IMPLEMENTATION ===== */

/**
 * Provider registry for managing provider instances
 */
export class ProviderRegistryImpl {
  private providers = new Map<ProviderType, EnvironmentAwareProvider>();
  private registrationOrder: ProviderType[] = [];

  /**
   * Register provider instance
   */
  registerProvider(
    providerType: ProviderType,
    provider: EnvironmentAwareProvider
  ): void {
    if (this.providers.has(providerType)) {
      console.warn(`[ProviderRegistry] Overriding existing provider: ${providerType}`);
    }

    this.providers.set(providerType, provider);
    
    if (!this.registrationOrder.includes(providerType)) {
      this.registrationOrder.push(providerType);
    }

    console.log(`[ProviderRegistry] Registered provider: ${providerType}`);
  }

  /**
   * Unregister provider instance
   */
  unregisterProvider(providerType: ProviderType): void {
    const provider = this.providers.get(providerType);
    
    if (provider) {
      this.providers.delete(providerType);
      this.registrationOrder = this.registrationOrder.filter(type => type !== providerType);
      console.log(`[ProviderRegistry] Unregistered provider: ${providerType}`);
    }
  }

  /**
   * Get provider instance
   */
  getProvider<T extends EnvironmentAwareProvider = EnvironmentAwareProvider>(
    providerType: ProviderType
  ): T | null {
    return (this.providers.get(providerType) as T) || null;
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): Map<ProviderType, EnvironmentAwareProvider> {
    return new Map(this.providers);
  }

  /**
   * Check if provider is registered
   */
  hasProvider(providerType: ProviderType): boolean {
    return this.providers.has(providerType);
  }

  /**
   * Clear all registered providers
   */
  clear(): void {
    this.providers.clear();
    this.registrationOrder = [];
    console.log('[ProviderRegistry] Cleared all providers');
  }

  /**
   * Get registration order
   */
  getRegistrationOrder(): readonly ProviderType[] {
    return [...this.registrationOrder];
  }
}

/* ===== FACTORY FUNCTIONS ===== */

/**
 * Create configuration injection system
 */
export function createConfigurationInjectionSystem(
  configurationManager?: EnhancedConfigurationManager
): ConfigurationInjector {
  return new ConfigurationInjectionSystem(configurationManager);
}

/**
 * Create provider registry
 */
export function createProviderRegistry() {
  return new ProviderRegistryImpl();
}

/* ===== SINGLETON INSTANCES ===== */

/**
 * Global configuration injection system
 */
export const configurationInjector = createConfigurationInjectionSystem();

/**
 * Global provider registry
 */
export const providerRegistry = createProviderRegistry();

/* ===== EXPORTS ===== */

export type {
  ConfigurationInjectionSystem as IConfigurationInjectionSystem,
  ProviderRegistryImpl as IProviderRegistry
};
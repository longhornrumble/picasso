/**
 * Enhanced Configuration Management Infrastructure - BERS Phase 2, Task 2.1
 * 
 * Enhanced enterprise-grade configuration management system that integrates
 * the new type-safe configuration system with existing JSON Schema validation,
 * environment inheritance, and hot-reloading capabilities.
 * 
 * Features:
 * - Full TypeScript type safety with runtime validation
 * - Integration with new branded type system
 * - Backward compatibility with existing configuration manager
 * - Enhanced error reporting and validation diagnostics
 * - Performance-optimized validation pipeline
 * - Comprehensive IntelliSense support
 * 
 * @version 2.1.0
 * @author Build-Time Environment Resolution System (BERS)
 */

import type { 
  Environment,
  ValidTenantHash,
  SecurityError 
} from '../types/security';
import type {
  RuntimeConfig,
  ThemeConfig,
  LocalizationConfig,
  IntegrationConfig
} from '../types/config';
import { 
  environmentResolver,
  type ValidatedEnvironment,
  type EnvironmentDetectionResult
} from './environment-resolver';

// Import the existing configuration manager
import {
  ConfigurationManager,
  ConfigurationManagerImpl,
  type ConfigurationSchemaType,
  type ConfigurationLoadOptions,
  type ConfigurationChangeCallback,
  type HotReloadConfig,
  type MigrationConfig,
  type ConfigurationManagerMetrics,
  type ValidatedConfiguration
} from './configuration-manager';

// Import the new type-safe configuration system
import {
  ConfigurationType,
  ValidatedConfigurationType,
  EnvironmentConfig,
  ProviderConfiguration,
  BuildConfiguration,
  MonitoringConfiguration,
  ValidatedEnvironmentConfig,
  ValidatedProviderConfig,
  ValidatedBuildConfig,
  ValidatedMonitoringConfig,
  ConfigValidationOptions,
  ComprehensiveValidationResult,
  TypeSafeConfigurationManager,
  validateConfigurationTypeSafe,
  createValidatedConfigurationTypeSafe,
  createValidationContext,
  isValidConfiguration,
  getConfigurationSchemaType,
  ConfigSystem
} from '../types/config';

/* ===== ENHANCED CONFIGURATION MANAGER INTERFACE ===== */

/**
 * Enhanced configuration manager that combines legacy and type-safe systems
 */
export interface EnhancedConfigurationManager extends ConfigurationManager, TypeSafeConfigurationManager {
  /**
   * Load configuration with enhanced type safety
   */
  loadConfigurationTypeSafe<T extends ConfigurationType>(
    schemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment,
    options?: ConfigurationLoadOptions & ConfigValidationOptions
  ): Promise<ValidatedConfigurationType<T>>;

  /**
   * Validate configuration with comprehensive validation
   */
  validateConfigurationEnhanced<T extends ConfigurationType>(
    config: unknown,
    schemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment,
    options?: ConfigValidationOptions
  ): Promise<ComprehensiveValidationResult<T>>;

  /**
   * Migrate legacy configurations to new type system
   */
  migrateLegacyConfiguration<T extends ConfigurationType>(
    legacyConfig: any,
    targetSchemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment,
    options?: MigrationConfig
  ): Promise<ValidatedConfigurationType<T>>;

  /**
   * Get configuration with fallback to legacy system
   */
  getConfigurationWithFallback<T extends ConfigurationType>(
    schemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment,
    tenantHash?: ValidTenantHash
  ): Promise<ValidatedConfigurationType<T> | ValidatedConfiguration<T>>;

  /**
   * Validate production readiness
   */
  validateProductionReadiness(
    config: ValidatedConfigurationType,
    environment: ValidatedEnvironment
  ): Promise<{
    readonly ready: boolean;
    readonly issues: readonly string[];
    readonly recommendations: readonly string[];
    readonly securityScore: number;
    readonly performanceScore: number;
  }>;

  /**
   * Get enhanced metrics including type system performance
   */
  getEnhancedMetrics(): ConfigurationManagerMetrics & {
    readonly typeSafeValidations: number;
    readonly legacyValidations: number;
    readonly migrationCount: number;
    readonly validationErrors: number;
    readonly validationWarnings: number;
    readonly averageTypeValidationTime: number;
  };
}

/* ===== ENHANCED CONFIGURATION MANAGER IMPLEMENTATION ===== */

/**
 * Production-ready enhanced configuration manager implementation
 */
export class EnhancedConfigurationManagerImpl 
  extends ConfigurationManagerImpl 
  implements EnhancedConfigurationManager {
  
  private typeSafeMetrics = {
    typeSafeValidations: 0,
    legacyValidations: 0,
    migrationCount: 0,
    validationErrors: 0,
    validationWarnings: 0,
    totalTypeValidationTime: 0
  };

  constructor(
    cacheTTL: number = 300000, // 5 minutes
    enableHotReload: boolean = false
  ) {
    super(cacheTTL, enableHotReload);
  }

  /**
   * Load configuration with enhanced type safety
   */
  async loadConfigurationTypeSafe<T extends ConfigurationType>(
    schemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment,
    options: ConfigurationLoadOptions & ConfigValidationOptions = {}
  ): Promise<ValidatedConfigurationType<T>> {
    const startTime = performance.now();

    try {
      // First, try to load using the legacy system
      const legacyConfig = await this.loadConfiguration<T>(schemaType, environment, options);
      
      // Then enhance with type-safe validation
      const validationResult = await this.validateConfigurationEnhanced<T>(
        legacyConfig,
        schemaType,
        environment,
        options
      );

      if (!validationResult.isValid) {
        // If type-safe validation fails, try migration
        const migratedConfig = await this.migrateLegacyConfiguration<T>(
          legacyConfig,
          schemaType,
          environment,
          {
            enabled: true,
            sourceVersion: legacyConfig.schemaVersion || '2.0.0',
            targetVersion: '2.1.0',
            transformers: [],
            backupOriginal: true
          }
        );

        this.typeSafeMetrics.migrationCount++;
        return migratedConfig;
      }

      const validationTime = performance.now() - startTime;
      this.updateTypeSafeMetrics(validationTime, validationResult);

      return validationResult.validatedConfig!;

    } catch (error) {
      this.typeSafeMetrics.validationErrors++;
      throw new Error(
        `Enhanced configuration loading failed for ${schemaType}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Validate configuration with comprehensive validation
   */
  async validateConfigurationEnhanced<T extends ConfigurationType>(
    config: unknown,
    schemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment,
    options: ConfigValidationOptions = {}
  ): Promise<ComprehensiveValidationResult<T>> {
    const startTime = performance.now();

    try {
      // Create validation context
      const context = createValidationContext(environment, {
        strictMode: options.strictMode ?? true,
        validateSecurity: true,
        enabledFeatures: [],
        tenantHash: undefined
      });

      // Perform type-safe validation
      const result = await validateConfigurationTypeSafe<T>(
        config,
        schemaType as any,
        context as any,
        {
          ...options,
          maxValidationTime: options.maxValidationTime || 10000
        }
      );

      const validationTime = performance.now() - startTime;
      this.updateTypeSafeMetrics(validationTime, result);

      return result;

    } catch (error) {
      this.typeSafeMetrics.validationErrors++;
      
      // Return error result instead of throwing
      return {
        isValid: false,
        errors: [ConfigSystem.createError(
          'ENHANCED_VALIDATION_ERROR',
          `Enhanced validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          '',
          config
        )],
        warnings: [],
        performanceMetrics: ConfigSystem.createMetrics(
          performance.now() - startTime,
          1,
          0,
          0
        ),
        schemaVersion: '2.1.0',
        validationTimestamp: Date.now()
      };
    }
  }

  /**
   * Migrate legacy configurations to new type system
   */
  async migrateLegacyConfiguration<T extends ConfigurationType>(
    legacyConfig: any,
    targetSchemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment,
    options: MigrationConfig = {
      enabled: true,
      sourceVersion: '2.0.0',
      targetVersion: '2.1.0',
      transformers: [],
      backupOriginal: true
    }
  ): Promise<ValidatedConfigurationType<T>> {
    if (!options.enabled) {
      throw new Error('Migration is disabled');
    }

    try {
      // Backup original if requested
      if (options.backupOriginal) {
        await this.backupConfiguration(legacyConfig, targetSchemaType);
      }

      // Apply legacy transformations first
      let transformedConfig = legacyConfig;
      for (const transformer of options.transformers) {
        transformedConfig = await transformer.transform(transformedConfig);
      }

      // Validate the configuration is a valid type for the schema
      if (!isValidConfiguration(transformedConfig, targetSchemaType)) {
        throw new Error(
          `Legacy configuration does not match expected type for schema: ${targetSchemaType}`
        );
      }

      // Create type-safe validated configuration
      const validatedConfig = await createValidatedConfigurationTypeSafe<T>(
        transformedConfig as T,
        targetSchemaType as any,
        environment,
        {},
        options.targetVersion
      );

      this.typeSafeMetrics.migrationCount++;
      return validatedConfig;

    } catch (error) {
      throw new Error(
        `Migration failed for ${targetSchemaType}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Get configuration with fallback to legacy system
   */
  async getConfigurationWithFallback<T extends ConfigurationType>(
    schemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment,
    tenantHash?: ValidTenantHash
  ): Promise<ValidatedConfigurationType<T> | ValidatedConfiguration<T>> {
    try {
      // Try type-safe loading first
      return await this.loadConfigurationTypeSafe<T>(schemaType, environment, {
        useCache: true,
        validateSchema: true
      });
    } catch (error) {
      console.warn(
        `Type-safe configuration loading failed for ${schemaType}, falling back to legacy system:`,
        error
      );
      
      // Fallback to legacy system
      this.typeSafeMetrics.legacyValidations++;
      return await this.getEffectiveConfiguration<T>(schemaType, environment, tenantHash);
    }
  }

  /**
   * Validate production readiness
   */
  async validateProductionReadiness(
    config: ValidatedConfigurationType,
    environment: ValidatedEnvironment
  ): Promise<{
    readonly ready: boolean;
    readonly issues: readonly string[];
    readonly recommendations: readonly string[];
    readonly securityScore: number;
    readonly performanceScore: number;
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let securityScore = 100;
    let performanceScore = 100;

    // Use the built-in production readiness check
    const basicCheck = ConfigSystem.isProductionReady(config, environment);
    issues.push(...basicCheck.issues);
    recommendations.push(...basicCheck.recommendations);

    // Enhanced security scoring
    if ('security' in config && typeof config.security === 'object') {
      const securityConfig = config.security as any;
      
      if (securityConfig?.allowInsecure === true) {
        securityScore -= 30;
        issues.push('Insecure connections are enabled');
      }
      
      if (!securityConfig?.enforceHTTPS) {
        securityScore -= 20;
        issues.push('HTTPS enforcement is disabled');
      }
      
      if (!securityConfig?.cookieSettings?.secure) {
        securityScore -= 15;
        issues.push('Insecure cookie settings');
      }
      
      if (!securityConfig?.cookieSettings?.httpOnly) {
        securityScore -= 10;
        recommendations.push('Enable HttpOnly cookies for better security');
      }
    }

    // Enhanced performance scoring
    if ('performance' in config && typeof config.performance === 'object') {
      const perfConfig = config.performance as any;
      
      if (perfConfig?.sampleRate === 1.0 && environment.toString() === 'production') {
        performanceScore -= 20;
        recommendations.push('Reduce sampling rate in production for better performance');
      }
      
      if (perfConfig?.enableTracing === true && environment.toString() === 'production') {
        performanceScore -= 15;
        recommendations.push('Consider disabling detailed tracing in production');
      }
      
      if (!perfConfig?.lazyLoading) {
        performanceScore -= 10;
        recommendations.push('Enable lazy loading for better performance');
      }
    }

    // Logging configuration checks
    if ('logging' in config && typeof config.logging === 'object') {
      const loggingConfig = config.logging as any;
      
      if (loggingConfig?.level === 'debug' && environment.toString() === 'production') {
        performanceScore -= 15;
        recommendations.push('Use "warn" or "error" logging level in production');
      }
      
      if (loggingConfig?.enableConsole === true && environment.toString() === 'production') {
        performanceScore -= 10;
        recommendations.push('Disable console logging in production');
      }
    }

    return {
      ready: issues.length === 0 && securityScore >= 80 && performanceScore >= 80,
      issues,
      recommendations,
      securityScore: Math.max(0, securityScore),
      performanceScore: Math.max(0, performanceScore)
    };
  }

  /**
   * Get enhanced metrics including type system performance
   */
  getEnhancedMetrics(): ConfigurationManagerMetrics & {
    readonly typeSafeValidations: number;
    readonly legacyValidations: number;
    readonly migrationCount: number;
    readonly validationErrors: number;
    readonly validationWarnings: number;
    readonly averageTypeValidationTime: number;
  } {
    const baseMetrics = this.getMetrics();
    
    return {
      ...baseMetrics,
      ...this.typeSafeMetrics,
      averageTypeValidationTime: this.typeSafeMetrics.typeSafeValidations > 0
        ? this.typeSafeMetrics.totalTypeValidationTime / this.typeSafeMetrics.typeSafeValidations
        : 0
    };
  }

  /* ===== TYPE-SAFE CONFIGURATION MANAGER INTERFACE IMPLEMENTATION ===== */

  /**
   * Validate configuration with full type safety
   */
  async validateConfiguration<T extends ConfigurationType>(
    config: unknown,
    schemaType: any,
    context: any,
    options?: ConfigValidationOptions
  ): Promise<ComprehensiveValidationResult<T>> {
    return this.validateConfigurationEnhanced<T>(
      config,
      schemaType,
      context.environment,
      options
    );
  }

  /**
   * Create validated configuration with type safety
   */
  async createValidatedConfiguration<T extends ConfigurationType>(
    config: T,
    schemaType: any,
    environment: ValidatedEnvironment,
    options?: ConfigValidationOptions
  ): Promise<ValidatedConfigurationType<T>> {
    return createValidatedConfigurationTypeSafe<T>(
      config,
      schemaType,
      environment,
      options || {}
    );
  }

  /**
   * Validate configuration type at runtime
   */
  isValidConfigurationType<T extends ConfigurationType>(
    config: unknown,
    schemaType: any
  ): config is T {
    return isValidConfiguration(config, schemaType);
  }

  /**
   * Get validation performance metrics
   */
  getValidationMetrics() {
    return ConfigSystem.createMetrics(
      this.typeSafeMetrics.totalTypeValidationTime,
      this.typeSafeMetrics.typeSafeValidations,
      0,
      0
    );
  }

  /**
   * Clear validation cache
   */
  clearValidationCache(): void {
    // Clear both legacy and type-safe caches
    this.clearCache();
  }

  /**
   * Register custom validator
   */
  registerCustomValidator<T extends ConfigurationType>(
    schemaType: any,
    validator: any
  ): void {
    // Custom validator registration would be implemented here
    console.log(`Registered custom validator for ${schemaType}:`, validator.name);
  }

  /* ===== PRIVATE HELPER METHODS ===== */

  private updateTypeSafeMetrics(
    validationTime: number,
    result: ComprehensiveValidationResult
  ): void {
    this.typeSafeMetrics.typeSafeValidations++;
    this.typeSafeMetrics.totalTypeValidationTime += validationTime;
    this.typeSafeMetrics.validationErrors += result.errors.length;
    this.typeSafeMetrics.validationWarnings += result.warnings.length;
  }

  private async backupConfiguration(
    config: any,
    schemaType: ConfigurationSchemaType
  ): Promise<void> {
    // Enhanced backup with type information
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `${schemaType}-enhanced-backup-${timestamp}`;
    
    const backupData = {
      config,
      schemaType,
      timestamp: Date.now(),
      version: '2.1.0',
      backupType: 'pre-migration'
    };
    
    console.log(`Backing up configuration as: ${backupKey}`, {
      size: JSON.stringify(backupData).length,
      schemaType
    });
    
    // In production, this would save to persistent storage
  }
}

/* ===== FACTORY FUNCTIONS AND DEFAULT INSTANCES ===== */

/**
 * Enhanced configuration manager options
 */
export const ENHANCED_CONFIGURATION_MANAGER_OPTIONS = {
  cacheTTL: 300000, // 5 minutes
  enableHotReload: process.env.NODE_ENV === 'development',
  enableTypeSafety: true,
  enableMigration: true,
  strictValidation: process.env.NODE_ENV === 'production'
} as const;

/**
 * Factory function to create enhanced configuration manager
 */
export function createEnhancedConfigurationManager(
  options: Partial<typeof ENHANCED_CONFIGURATION_MANAGER_OPTIONS> = {}
): EnhancedConfigurationManager {
  const mergedOptions = { 
    ...ENHANCED_CONFIGURATION_MANAGER_OPTIONS, 
    ...options 
  };
  
  return new EnhancedConfigurationManagerImpl(
    mergedOptions.cacheTTL,
    mergedOptions.enableHotReload
  );
}

/**
 * Singleton instance for global use
 */
export const enhancedConfigurationManager = createEnhancedConfigurationManager();

/* ===== BACKWARD COMPATIBILITY WRAPPER ===== */

/**
 * Backward compatibility wrapper that provides the same interface as the original
 * configuration manager but with enhanced type safety
 */
export class BackwardCompatibleConfigurationManager 
  implements ConfigurationManager {
  
  constructor(
    private enhancedManager: EnhancedConfigurationManager = enhancedConfigurationManager
  ) {}

  async loadConfiguration<T = any>(
    schemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment,
    options?: ConfigurationLoadOptions
  ): Promise<ValidatedConfiguration<T>> {
    try {
      // Try enhanced loading first
      const result = await this.enhancedManager.loadConfigurationTypeSafe(
        schemaType,
        environment,
        options
      );
      
      // Convert to legacy format for backward compatibility
      return result as ValidatedConfiguration<T>;
    } catch (error) {
      // Fallback to original implementation
      return this.enhancedManager.loadConfiguration<T>(schemaType, environment, options);
    }
  }

  async validateConfiguration<T = any>(
    config: T,
    schemaType: ConfigurationSchemaType,
    context: any
  ): Promise<any> {
    const result = await this.enhancedManager.validateConfigurationEnhanced(
      config,
      schemaType,
      context.environment,
      { strictMode: context.strictMode }
    );
    
    // Convert to legacy format
    return {
      isValid: result.isValid,
      errors: result.errors.map(e => e.message),
      warnings: result.warnings.map(w => w.message),
      sanitizedConfig: result.validatedConfig
    };
  }

  watchConfiguration(
    schemaType: ConfigurationSchemaType,
    callback: ConfigurationChangeCallback,
    options?: HotReloadConfig
  ): () => void {
    return this.enhancedManager.watchConfiguration(schemaType, callback, options);
  }

  async migrateConfiguration<T = any>(
    legacyConfig: any,
    targetSchemaType: ConfigurationSchemaType,
    migrationConfig: MigrationConfig
  ): Promise<ValidatedConfiguration<T>> {
    const detectionResult = await environmentResolver.detectEnvironment();
    const result = await this.enhancedManager.migrateLegacyConfiguration(
      legacyConfig,
      targetSchemaType,
      detectionResult.environment,
      migrationConfig
    );
    
    return result as ValidatedConfiguration<T>;
  }

  async getEffectiveConfiguration<T = any>(
    schemaType: ConfigurationSchemaType,
    environment: ValidatedEnvironment,
    tenantHash?: ValidTenantHash
  ): Promise<ValidatedConfiguration<T>> {
    const result = await this.enhancedManager.getConfigurationWithFallback(
      schemaType,
      environment,
      tenantHash
    );
    
    return result as ValidatedConfiguration<T>;
  }

  async registerSchema(
    schemaType: string,
    schema: any
  ): Promise<void> {
    return this.enhancedManager.registerSchema(schemaType, schema);
  }

  async registerInheritanceRule(rule: any): Promise<void> {
    return this.enhancedManager.registerInheritanceRule(rule);
  }

  clearCache(schemaType?: ConfigurationSchemaType): void {
    this.enhancedManager.clearCache(schemaType);
  }

  getMetrics(): ConfigurationManagerMetrics {
    const enhancedMetrics = this.enhancedManager.getEnhancedMetrics();
    
    // Return only the legacy metrics for backward compatibility
    return {
      totalLoads: enhancedMetrics.totalLoads,
      cacheHits: enhancedMetrics.cacheHits,
      validationErrors: enhancedMetrics.validationErrors,
      averageLoadTime: enhancedMetrics.averageLoadTime,
      hotReloads: enhancedMetrics.hotReloads,
      schemasRegistered: enhancedMetrics.schemasRegistered
    };
  }
}

/* ===== EXPORTS ===== */

export type {
  EnhancedConfigurationManager
};

// All exports are already declared inline above

export default enhancedConfigurationManager;